import { createPublicKey, verify as verifySignature, type JsonWebKey } from 'node:crypto';
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

const APPLE_ISSUER = 'https://appleid.apple.com';
const APPLE_JWKS_URL = 'https://appleid.apple.com/auth/keys';
/** How long a fetched JWKS is trusted before refetching. */
const JWKS_TTL_MS = 60 * 60 * 1000; // ~1 hour

interface AppleProfile {
  sub: string;
  email: string;
  email_verified: boolean;
  /** Full name from the client — Apple only provides it on the FIRST sign-in. */
  fullName?: string;
}

/** Claims we read out of a verified Apple identity token. */
interface AppleTokenPayload {
  iss?: string;
  aud?: string;
  sub?: string;
  exp?: number;
  email?: string;
  /** Apple serialises this as boolean or the strings 'true'/'false'. */
  email_verified?: string | boolean;
}

interface AppleJwk extends JsonWebKey {
  kid?: string;
  alg?: string;
}

/**
 * Native Sign in with Apple — mirror of the Google native flow. The iOS app
 * gets an identity token (a JWS) from `ASAuthorizationAppleIDProvider` and
 * POSTs it to `/v1/auth/apple/native`. We verify the RS256 signature against
 * Apple's published JWKS (cached ~1h), check iss/aud/exp, and resolve the same
 * find-or-create account flow used for Google. Apple only sends the user's
 * name on the very first authorization, so the client forwards it as
 * `fullName` and we use it when creating the account.
 */
@Injectable()
export class AppleAuthService {
  private readonly logger = new Logger(AppleAuthService.name);

  private jwksCache: { keys: AppleJwk[]; fetchedAt: number } | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly users: UsersRepository,
    private readonly tokens: TokensService,
    private readonly audit: AuditService,
    private readonly events: EventBus,
  ) {}

  /** Sign in with Apple needs the bundle ID to validate the token audience. */
  get enabled(): boolean {
    return Boolean(this.config.get<string>('appleBundleId'));
  }

  /** Verify a native app's Apple identity token and issue our token pair. */
  async handleNativeSignIn(
    identityToken: string,
    fullName: string | undefined,
    ctx: { ip?: string; userAgent?: string },
  ) {
    if (!this.enabled) throw new ServiceUnavailableException('Apple sign-in is not configured.');
    const profile = await this.verifyIdentityToken(identityToken);
    if (fullName?.trim()) profile.fullName = fullName.trim();
    return this.signIn(profile, ctx);
  }

  /** Shared tail (mirror of Google): resolve the account, issue tokens, audit. */
  private async signIn(profile: AppleProfile, ctx: { ip?: string; userAgent?: string }) {
    const { user, isNew } = await this.resolveUser(profile);
    // Admin-suspended (or deactivated) accounts must not obtain tokens via
    // Apple either — mirror of the password-login check in AuthService.
    if (user.status === 'SUSPENDED' || user.status === 'DEACTIVATED') {
      await this.audit.record({
        actorId: user.id,
        action: 'auth.login_blocked',
        entityId: user.id,
        ip: ctx.ip,
        metadata: { status: user.status, provider: 'apple' },
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
      action: isNew ? 'auth.apple.register' : 'auth.apple.login',
      entity: 'User',
      entityId: user.id,
      ip: ctx.ip,
    });
    return pair;
  }

  /** Find-or-create the local account for an Apple profile (link by email). */
  private async resolveUser(
    profile: AppleProfile,
  ): Promise<{ user: UserWithRelations; isNew: boolean }> {
    if (!profile.email) throw new BadRequestException('Apple account has no email.');

    let user = await this.users.findByProvider(AuthProvider.APPLE, profile.sub);
    let isNew = false;

    if (!user) {
      const byEmail = await this.users.findByEmail(profile.email);
      if (byEmail) {
        // Only link by email when Apple has verified it — otherwise anyone
        // could claim an address at Apple and take over the local account.
        if (profile.email_verified !== true) {
          throw new UnauthorizedException('Apple email is not verified.');
        }
        await this.users.linkCredential(byEmail.id, AuthProvider.APPLE, profile.sub);
        if (!byEmail.emailVerified) await this.users.markEmailVerified(byEmail.id);
        user = byEmail;
      } else {
        // Apple only sends the name on the first authorization, so the client
        // forwards it; fall back to the email local part.
        const displayName = profile.fullName || profile.email.split('@')[0] || 'Member';
        user = await this.users.createOAuthUser({
          email: profile.email,
          displayName,
          provider: AuthProvider.APPLE,
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

  /**
   * Verify the identity token locally: decode the JWS, check the RS256
   * signature against Apple's JWKS, then validate iss / aud / exp / sub.
   */
  private async verifyIdentityToken(identityToken: string): Promise<AppleProfile> {
    const [headerB64 = '', payloadB64 = '', signatureB64 = '', ...rest] = identityToken.split('.');
    if (!headerB64 || !payloadB64 || !signatureB64 || rest.length > 0) {
      throw new UnauthorizedException('Invalid Apple identity token.');
    }

    let header: { alg?: string; kid?: string };
    let payload: AppleTokenPayload;
    try {
      header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8'));
      payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    } catch {
      throw new UnauthorizedException('Invalid Apple identity token.');
    }
    if (header.alg !== 'RS256' || !header.kid) {
      throw new UnauthorizedException('Invalid Apple identity token.');
    }

    const jwk = await this.findSigningKey(header.kid);
    if (!jwk) {
      this.logger.warn(`Apple identity token rejected (unknown kid=${header.kid})`);
      throw new UnauthorizedException('Invalid Apple identity token.');
    }

    let signatureOk = false;
    try {
      const publicKey = createPublicKey({ key: jwk, format: 'jwk' });
      signatureOk = verifySignature(
        'RSA-SHA256',
        Buffer.from(`${headerB64}.${payloadB64}`),
        publicKey,
        Buffer.from(signatureB64, 'base64url'),
      );
    } catch {
      signatureOk = false;
    }
    if (!signatureOk) {
      this.logger.warn('Apple identity token rejected (bad signature)');
      throw new UnauthorizedException('Invalid Apple identity token.');
    }

    const bundleId = this.config.get<string>('appleBundleId');
    const issuerOk = payload.iss === APPLE_ISSUER;
    const audienceOk = Boolean(payload.aud) && payload.aud === bundleId;
    const notExpired = Number(payload.exp) * 1000 > Date.now();
    if (!issuerOk || !audienceOk || !notExpired || !payload.sub) {
      this.logger.warn(`Apple identity token rejected (iss=${payload.iss}, aud=${payload.aud})`);
      throw new UnauthorizedException('Invalid Apple identity token.');
    }

    return {
      sub: payload.sub,
      email: payload.email ?? '',
      // Apple serialises this claim as a boolean or the string 'true'.
      email_verified: payload.email_verified === true || payload.email_verified === 'true',
    };
  }

  /** Get Apple's signing key by `kid`, refetching the JWKS on rotation. */
  private async findSigningKey(kid: string): Promise<AppleJwk | undefined> {
    const fresh = this.jwksCache && Date.now() - this.jwksCache.fetchedAt < JWKS_TTL_MS;
    if (fresh) {
      const cached = this.jwksCache!.keys.find((k) => k.kid === kid);
      if (cached) return cached;
      // Unknown kid with a fresh cache usually means Apple rotated keys —
      // fall through to a refetch below.
    }
    this.jwksCache = { keys: await this.fetchJwks(), fetchedAt: Date.now() };
    return this.jwksCache.keys.find((k) => k.kid === kid);
  }

  private async fetchJwks(): Promise<AppleJwk[]> {
    let res: Response;
    try {
      res = await fetch(APPLE_JWKS_URL);
    } catch (err) {
      this.logger.error(`Apple JWKS request failed: ${(err as Error).message}`);
      throw new ServiceUnavailableException('Could not reach Apple.');
    }
    if (!res.ok) {
      this.logger.error(`Apple JWKS request rejected (${res.status})`);
      throw new ServiceUnavailableException('Could not reach Apple.');
    }
    const body = (await res.json()) as { keys?: AppleJwk[] };
    return body.keys ?? [];
  }
}
