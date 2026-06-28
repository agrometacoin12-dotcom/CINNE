import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { PrismaService } from '../../infra/prisma/prisma.service';
import type { TokenPairDto } from './dto/auth.dto';

export interface AccessTokenClaims {
  sub: string;
  email: string;
  roles: string[];
  jti: string;
}

/**
 * Issues and validates the application's own access/refresh tokens. Access
 * tokens are short-lived JWTs; refresh tokens are opaque random strings whose
 * SHA-256 hash is stored against a Session row so they can be revoked.
 */
@Injectable()
export class TokensService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async issuePair(params: {
    userId: string;
    email: string;
    roles: string[];
    deviceId?: string;
    userAgent?: string;
    ip?: string;
  }): Promise<TokenPairDto> {
    const accessTtl = this.config.get<number>('jwt.accessTtl', 900);
    const refreshTtl = this.config.get<number>('jwt.refreshTtl', 2_592_000);

    const accessToken = await this.jwt.signAsync(
      { email: params.email, roles: params.roles, jti: randomUUID() } satisfies Omit<
        AccessTokenClaims,
        'sub'
      >,
      {
        subject: params.userId,
        expiresIn: accessTtl,
        issuer: this.config.get<string>('jwt.issuer'),
        audience: this.config.get<string>('jwt.audience'),
      },
    );

    const refreshToken = randomBytes(48).toString('base64url');
    await this.prisma.session.create({
      data: {
        userId: params.userId,
        refreshTokenHash: this.hash(refreshToken),
        deviceId: params.deviceId,
        userAgent: params.userAgent,
        ip: params.ip,
        expiresAt: new Date(Date.now() + refreshTtl * 1000),
      },
    });

    return { accessToken, refreshToken, tokenType: 'Bearer', expiresIn: accessTtl };
  }

  /** Rotates a refresh token: validates, revokes the old session, issues a new pair. */
  async rotate(refreshToken: string, context: { userAgent?: string; ip?: string }) {
    const session = await this.prisma.session.findFirst({
      where: { refreshTokenHash: this.hash(refreshToken), revokedAt: null },
      include: { user: { include: { roles: { include: { role: true } } } } },
    });
    if (!session || session.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    await this.prisma.session.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });

    return this.issuePair({
      userId: session.userId,
      email: session.user.email,
      roles: session.user.roles.map((r) => r.role.name),
      deviceId: session.deviceId ?? undefined,
      userAgent: context.userAgent,
      ip: context.ip,
    });
  }

  async revoke(refreshToken: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { refreshTokenHash: this.hash(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
