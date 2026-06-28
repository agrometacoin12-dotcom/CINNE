import { Injectable } from '@nestjs/common';
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
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('jwt.secret')!,
      issuer: config.get<string>('jwt.issuer'),
      audience: config.get<string>('jwt.audience'),
    });
  }

  validate(payload: JwtPayload): AuthenticatedUser {
    return { sub: payload.sub, email: payload.email, roles: payload.roles ?? [] };
  }
}
