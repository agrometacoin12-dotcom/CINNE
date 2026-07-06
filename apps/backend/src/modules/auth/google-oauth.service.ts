import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthProvider } from '@prisma/client';
import { UsersRepository } from '../users/users.repository';
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

/**
 * Native Google OAuth 2.0 (Authorization Code) — no Cognito/hosted UI. The web
 * app sends the user to `/v1/auth/google`, we bounce to Google, Google returns a
 * `code` to `/v1/auth/google/callback`, we exchange it for the user's profile,
 * find-or-create the account (verified, no password), and issue our own JWT pair.
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
    return Boolean(this.config.get<string>('google.clientId') && this.config.get<string>('google.clientSecret'));
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
    if (!profile.email) throw new BadRequestException('Google account has no email.');

    let user = await this.users.findByProvider(AuthProvider.GOOGLE, profile.sub);
    let isNew = false;

    if (!user) {
      const byEmail = await this.users.findByEmail(profile.email);
      if (byEmail) {
        await this.users.linkCredential(byEmail.id, AuthProvider.GOOGLE, profile.sub);
        if (!byEmail.emailVerified) await this.users.markEmailVerified(byEmail.id);
        user = byEmail;
      } else {
        const displayName = profile.name || profile.given_name || profile.email.split('@')[0] || 'Member';
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
    if (!token.access_token) throw new BadRequestException('Google did not return an access token.');

    const infoRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    if (!infoRes.ok) throw new BadRequestException('Could not read your Google profile.');
    return (await infoRes.json()) as GoogleProfile;
  }
}
