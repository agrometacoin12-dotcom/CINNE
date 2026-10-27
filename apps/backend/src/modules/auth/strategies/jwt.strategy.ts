import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { AuthenticatedUser } from '../../../common/decorators/current-user.decorator';

interface JwtPayload {
  sub: string;
  email: string;
  roles: string[];
}

/**
 * Validates the application-issued access token. (When AUTH_DRIVER=cognito and
 * Cognito tokens are passed through directly, swap the secret for a JWKS
 * resolver against COGNITO_ISSUER/.well-known/jwks.json.)
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService, private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('jwt.secret')!,
      issuer: config.get<string>('jwt.issuer'),
      audience: config.get<string>('jwt.audience'),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findFirst({ where: { id: payload.sub, deletedAt: null, status: 'ACTIVE' },
      include: { roles: { include: { role: true } } } });
    if (!user) throw new UnauthorizedException('Account is no longer active');
    return { sub: user.id, email: user.email, roles: user.roles.map(r => r.role.name) };
  }
}
