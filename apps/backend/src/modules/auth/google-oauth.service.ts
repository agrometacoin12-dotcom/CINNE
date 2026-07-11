import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthProvider } from '@prisma/client';
import { UsersRepository, UserWithRelations } from '../users/users.repository';
import { TokensService } from './tokens.service';
import { AuditService } from './audit.service';
import { EventBus } from '../../infra/events/event-bus';

interface GoogleProfile {
  sub: string;
  email: string;
  email_verified?: boolean;
  name?: string;
  given_name?: string;
  picture?: string;
}

/** Raw `tokeninfo` response — booleans/numbers arrive as strings. */
interface TokenInfoPayload {
  iss?: string;
  aud?: string;
  sub?: string;
  exp?: string;
  email?: string;
  email_verified?: string | boolean;
  name?: string;
  given_name?: string;
  picture?: string;
}

/**
 * Native Google OAuth 2.0 (Authorization Code) — no Cognito/hosted UI. The web
 * app sends the user to `/v1/auth/google`, we bounce to Google, Google returns a
 * `code` to `/v1/auth/google/callback`, we exchange it for the user's profile,
 * find-or-create the account (verified, no password), and issue our own JWT pair.
 *
 * Native apps skip the redirect dance: the Google Sign-In SDK hands them an ID
 * token, which they POST to `/v1/auth/google/native`. We validate it against
 * Google's `tokeninfo` endpoint and resolve the same account.
 */
@Injectable()
export class GoogleOAuthService {
  private readonly logger = new Logger(GoogleOAuthService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly users: UsersRepository,
    private readonly tokens: TokensService,
    private readonly audit: AuditService,
    private readonly events: EventBus,
  ) {}

  get enabled(): boolean {
    return Boolean(
      this.config.get<string>('google.clientId') && this.config.get<string>('google.clientSecret'),
    );
  }

  /** Native sign-in only needs a client ID to validate the token's audience. */
  get nativeEnabled(): boolean {
    return this.allowedAudiences().length > 0;
  }

  /** Client IDs accepted as `aud` on native ID tokens (web + iOS apps). */
  private allowedAudiences(): string[] {
    return [
      this.config.get<string>('google.clientId'),
      this.config.get<string>('google.iosClientId'),
    ].filter((id): id is string => Boolean(id));
  }

  private redirectUri(): string {
    const api = this.config.get<string>('apiPublicUrl') ?? '';
    return `${api.replace(/\/$/, '')}/v1/auth/google/callback`;
  }

  /** URL of the Google consent screen to redirect the user to. */
  authUrl(state: string): string {
    if (!this.enabled) throw new ServiceUnavailableException('Google sign-in is not configured.');
    const params = new URLSearchParams({
      client_id: this.config.get<string>('google.clientId') ?? '',
      redirect_uri: this.redirectUri(),
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'online',
      include_granted_scopes: 'true',
      prompt: 'select_account',
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  /** Exchange the auth code, resolve the profile, and issue our token pair. */
  async handleCallback(code: string, ctx: { ip?: string; userAgent?: string }) {
    if (!this.enabled) throw new ServiceUnavailableException('Google sign-in is not configured.');
    const profile = await this.fetchProfile(code);
    return this.signIn(profile, ctx);
  }

  /** Verify a native app's Google ID token and issue our token pair. */
  async handleNativeSignIn(idToken: string, ctx: { ip?: string; userAgent?: string }) {
    if (!this.nativeEnabled)
      throw new ServiceUnavailableException('Google sign-in is not configured.');
    const profile = await this.verifyIdToken(idToken);
    return this.signIn(profile, ctx);
  }

  /** Shared tail of both flows: resolve the account, issue tokens, audit. */
  private async signIn(profile: GoogleProfile, ctx: { ip?: string; userAgent?: string }) {
    const { user, isNew } = await this.resolveUser(profile);
    // Admin-suspended (or deactivated) accounts must not obtain tokens via
    // Google either — mirror of the password-login check in AuthService.
    if (user.status === 'SUSPENDED' || user.status === 'DEACTIVATED') {
      await this.audit.record({
        actorId: user.id,
        action: 'auth.login_blocked',
        entityId: user.id,
        ip: ctx.ip,
        metadata: { status: user.status, provider: 'google' },
      });
      throw new ForbiddenException('This account has been suspended.');
    }
    const pair = await this.tokens.issuePair({
      userId: user.id,
      email: user.email,
      roles: UsersRepository.roleNames(user),
      userAgent: ctx.userAgent,
      ip: ctx.ip,
    });
    await this.audit.record({
      actorId: user.id,
      action: isNew ? 'auth.google.register' : 'auth.google.login',
      entity: 'User',
      entityId: user.id,
      ip: ctx.ip,
    });
    return pair;
  }

  /** Find-or-create the local account for a Google profile (link by email). */
  private async resolveUser(
    profile: GoogleProfile,
  ): Promise<{ user: UserWithRelations; isNew: boolean }> {
    if (!profile.email) throw new BadRequestException('Google account has no email.');

    let user = await this.users.findByProvider(AuthProvider.GOOGLE, profile.sub);
    let isNew = false;

    if (!user) {
      const byEmail = await this.users.findByEmail(profile.email);
      if (byEmail) {
        // Only link by email when Google has verified it — otherwise anyone
        // could claim an address at Google and take over the local account.
        if (profile.email_verified !== true) {
          throw new UnauthorizedException('Google email is not verified.');
        }
        await this.users.linkCredential(byEmail.id, AuthProvider.GOOGLE, profile.sub);
        if (!byEmail.emailVerified) await this.users.markEmailVerified(byEmail.id);
        user = byEmail;
      } else {
        const displayName =
          profile.name || profile.given_name || profile.email.split('@')[0] || 'Member';
        user = await this.users.createOAuthUser({
          email: profile.email,
          displayName,
          provider: AuthProvider.GOOGLE,
          providerId: profile.sub,
        });
        isNew = true;
        await this.events.publish({
          name: 'user.registered',
          detail: { userId: user.id, email: user.email, displayName },
        });
      }
    }

    return { user, isNew };
  }

  /** Exchange code → access token, then fetch the OpenID userinfo. */
  private async fetchProfile(code: string): Promise<GoogleProfile> {
    let tokenRes: Response;
    try {
      tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: this.config.get<string>('google.clientId') ?? '',
          client_secret: this.config.get<string>('google.clientSecret') ?? '',
          redirect_uri: this.redirectUri(),
          grant_type: 'authorization_code',
        }),
      });
    } catch (err) {
      this.logger.error(`Google token exchange failed: ${(err as Error).message}`);
      throw new ServiceUnavailableException('Could not reach Google.');
    }
    if (!tokenRes.ok) {
      const text = await tokenRes.text().catch(() => '');
      this.logger.warn(`Google token exchange rejected (${tokenRes.status}): ${text}`);
      throw new BadRequestException('Google sign-in failed. Please try again.');
    }
    const token = (await tokenRes.json()) as { access_token?: string };
    if (!token.access_token)
      throw new BadRequestException('Google did not return an access token.');

    const infoRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    if (!infoRes.ok) throw new BadRequestException('Could not read your Google profile.');
    return (await infoRes.json()) as GoogleProfile;
  }

  /** Validate a native ID token against Google's `tokeninfo` endpoint. */
  private async verifyIdToken(idToken: string): Promise<GoogleProfile> {
    let res: Response;
    try {
      res = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`,
      );
    } catch (err) {
      this.logger.error(`Google tokeninfo request failed: ${(err as Error).message}`);
      throw new ServiceUnavailableException('Could not reach Google.');
    }
    if (!res.ok) throw new UnauthorizedException('Invalid Google ID token.');

    const payload = (await res.json()) as TokenInfoPayload;
    const issuerOk =
      payload.iss === 'https://accounts.google.com' || payload.iss === 'accounts.google.com';
    const audienceOk = Boolean(payload.aud) && this.allowedAudiences().includes(payload.aud!);
    const notExpired = Number(payload.exp) * 1000 > Date.now();
    if (!issuerOk || !audienceOk || !notExpired || !payload.sub) {
      this.logger.warn(`Google ID token rejected (iss=${payload.iss}, aud=${payload.aud})`);
      throw new UnauthorizedException('Invalid Google ID token.');
    }

    return {
      sub: payload.sub,
      email: payload.email ?? '',
      // tokeninfo serialises booleans as the strings 'true'/'false'.
      email_verified: payload.email_verified === true || payload.email_verified === 'true',
      name: payload.name,
      given_name: payload.given_name,
      picture: payload.picture,
    };
  }
}
