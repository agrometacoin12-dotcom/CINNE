import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { UsersRepository } from '../users/users.repository';
import { AuditService } from './audit.service';
import { TokensService } from './tokens.service';
import type { TokenPairDto } from './dto/auth.dto';

/** How long an issued device-link code stays exchangeable. */
const CODE_TTL_SECONDS = 300;

/**
 * PKCE-style device link for the desktop app. The exe never talks to Google:
 * it opens the web app (already signed in via the working Google flow), the
 * web page POSTs the desktop's challenge to /v1/auth/desktop/code (Bearer
 * authed), and the browser hands the resulting single-use code back to the
 * exe's loopback listener. The exe then exchanges code + verifier for the SAME
 * token pair a normal login issues.
 *
 * Only the SHA-256 of the code is stored (a DB leak exposes nothing usable),
 * codes are single-use and expire after 5 minutes, and every failure mode in
 * the exchange returns the same generic 401 (no oracle).
 */
@Injectable()
export class DesktopAuthService {
  constructor(
    private readonly users: UsersRepository,
    private readonly tokens: TokensService,
    private readonly audit: AuditService,
    private readonly prisma: PrismaService,
  ) {}

  /** Mint a single-use link code bound to the caller and their challenge. */
  async issueCode(
    userId: string,
    challenge: string,
    ctx: { ip?: string },
  ): Promise<{ code: string; expiresInSeconds: number }> {
    const code = randomBytes(32).toString('base64url');
    await this.prisma.desktopAuthCode.create({
      data: {
        codeHash: sha256Hex(code),
        userId,
        challenge,
        expiresAt: new Date(Date.now() + CODE_TTL_SECONDS * 1000),
      },
    });
    await this.audit.record({
      actorId: userId,
      action: 'auth.desktop.code',
      entity: 'User',
      entityId: userId,
      ip: ctx.ip,
    });
    return { code, expiresInSeconds: CODE_TTL_SECONDS };
  }

  /**
   * Exchange code + PKCE verifier for a normal token pair. Every failure —
   * unknown code, expired, already used, wrong verifier, unusable account —
   * is the same generic 401 so the endpoint leaks nothing.
   */
  async exchange(
    code: string,
    verifier: string,
    ctx: { ip?: string; userAgent?: string },
  ): Promise<TokenPairDto> {
    const invalid = () => new UnauthorizedException('Invalid or expired code');

    const record = await this.prisma.desktopAuthCode.findUnique({
      where: { codeHash: sha256Hex(code) },
    });
    if (!record || record.consumedAt || record.expiresAt.getTime() <= Date.now()) {
      throw invalid();
    }

    // PKCE check: base64url(SHA-256(verifier)) must equal the stored challenge.
    // Compare via timingSafeEqual on fresh SHA-256 digests (fixed length, no
    // early-exit) so the comparison itself is constant-time.
    const derived = createHash('sha256').update(verifier).digest('base64url');
    if (!timingSafeEqual(sha256Digest(derived), sha256Digest(record.challenge))) {
      throw invalid();
    }

    // Single-use: the conditional update claims the code atomically, so two
    // racing exchanges can never both succeed.
    const claimed = await this.prisma.desktopAuthCode.updateMany({
      where: { id: record.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (claimed.count !== 1) throw invalid();

    const user = await this.users.findById(record.userId);
    if (!user || user.status === 'SUSPENDED' || user.status === 'DEACTIVATED') {
      throw invalid();
    }

    // Reuse the exact session-issue path every login flow shares.
    const pair = await this.tokens.issuePair({
      userId: user.id,
      email: user.email,
      roles: UsersRepository.roleNames(user),
      userAgent: ctx.userAgent,
      ip: ctx.ip,
    });
    await this.audit.record({
      actorId: user.id,
      action: 'DESKTOP_LINK',
      entity: 'User',
      entityId: user.id,
      ip: ctx.ip,
    });
    return pair;
  }
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function sha256Digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}
