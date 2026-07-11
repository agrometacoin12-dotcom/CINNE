import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { EventBus } from '../../infra/events/event-bus';
import { UsersRepository } from '../users/users.repository';
import { UsersService } from '../users/users.service';
import { AuditService } from './audit.service';
import { CognitoService } from './cognito.service';
import { MailService } from './mail.service';
import { TokensService } from './tokens.service';
import { VerificationService } from './verification.service';
import type {
  ForgotPasswordDto,
  LoginDto,
  RegisterDto,
  ResetPasswordDto,
  VerifyEmailDto,
} from './dto/auth.dto';

interface RequestContext {
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class AuthService {
  private readonly driver: 'local' | 'cognito';
  private readonly emailVerificationRequired: boolean;

  constructor(
    private readonly users: UsersRepository,
    private readonly usersService: UsersService,
    private readonly tokens: TokensService,
    private readonly verification: VerificationService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
    private readonly cognito: CognitoService,
    private readonly events: EventBus,
    config: ConfigService,
  ) {
    this.driver = config.get<'local' | 'cognito'>('authDriver', 'local');
    this.emailVerificationRequired = config.get<boolean>('emailVerificationRequired', false);
  }

  async register(dto: RegisterDto, ctx: RequestContext) {
    const existing = await this.users.findByEmail(dto.email);
    if (existing) throw new ConflictException('Email already registered');

    let cognitoSub: string | undefined;
    let passwordHash: string | undefined;

    if (this.driver === 'cognito') {
      cognitoSub = await this.cognito.signUp(dto.email, dto.password, dto.displayName);
    } else {
      passwordHash = await argon2.hash(dto.password, { type: argon2.argon2id });
    }

    const user = await this.users.createWithProfile({
      email: dto.email,
      displayName: dto.displayName,
      passwordHash,
      cognitoSub,
    });

    // With no mail provider configured, EMAIL_VERIFICATION_REQUIRED is false:
    // auto-verify the account so the user can be logged in immediately. When
    // it is true, fall back to the classic code-issue + email flow.
    const autoVerify = this.driver === 'local' && !this.emailVerificationRequired;
    let status = user.status;

    if (autoVerify) {
      const verified = await this.users.markEmailVerified(user.id);
      status = verified.status;
    } else if (this.driver === 'local') {
      const code = await this.verification.issue('verify', dto.email);
      await this.mail.sendVerificationCode(dto.email, code);
    }

    await this.audit.record({
      actorId: user.id,
      action: 'auth.register',
      entity: 'User',
      entityId: user.id,
      ip: ctx.ip,
    });
    await this.events.publish({
      name: 'user.registered',
      detail: { userId: user.id, email: user.email, displayName: dto.displayName },
    });

    if (autoVerify) {
      // Mirror the Google sign-in shape: issue our own JWT pair so the client
      // can log in straight from the registration response.
      const tokens = await this.tokens.issuePair({
        userId: user.id,
        email: user.email,
        roles: UsersRepository.roleNames(user),
        deviceId: dto.deviceId,
        userAgent: ctx.userAgent,
        ip: ctx.ip,
      });
      return { userId: user.id, status, tokens };
    }

    return { userId: user.id, status };
  }

  async verifyEmail(dto: VerifyEmailDto) {
    if (this.driver === 'cognito') {
      await this.cognito.confirmSignUp(dto.email, dto.code);
    } else {
      const ok = await this.verification.verify('verify', dto.email, dto.code);
      if (!ok) throw new UnauthorizedException('Invalid or expired code');
    }
    const user = await this.users.findByEmail(dto.email);
    if (!user) throw new UnauthorizedException('Unknown account');
    await this.users.markEmailVerified(user.id);
    await this.audit.record({ actorId: user.id, action: 'auth.verify_email', entityId: user.id });
    return { verified: true };
  }

  async login(dto: LoginDto, ctx: RequestContext) {
    const user = await this.users.findByEmail(dto.email);
    if (!user) throw new UnauthorizedException('Invalid credentials');

    if (this.driver === 'cognito') {
      await this.cognito.authenticate(dto.email, dto.password);
    } else {
      if (!user.passwordHash || !(await argon2.verify(user.passwordHash, dto.password))) {
        await this.audit.record({
          actorId: user.id,
          action: 'auth.login_failed',
          entityId: user.id,
          ip: ctx.ip,
        });
        throw new UnauthorizedException('Invalid credentials');
      }
    }

    // Admin-suspended (or deactivated) accounts must not obtain tokens, even
    // with valid credentials.
    if (user.status === 'SUSPENDED' || user.status === 'DEACTIVATED') {
      await this.audit.record({
        actorId: user.id,
        action: 'auth.login_blocked',
        entityId: user.id,
        ip: ctx.ip,
        metadata: { status: user.status },
      });
      throw new ForbiddenException('This account has been suspended.');
    }

    // Only gate on email verification when it is actually enforced. With no
    // mail provider (EMAIL_VERIFICATION_REQUIRED=false), accounts are
    // auto-verified at registration, so this block never trips.
    if (this.emailVerificationRequired && !user.emailVerified) {
      throw new ForbiddenException('Email not verified');
    }

    const pair = await this.tokens.issuePair({
      userId: user.id,
      email: user.email,
      roles: UsersRepository.roleNames(user),
      deviceId: dto.deviceId,
      userAgent: ctx.userAgent,
      ip: ctx.ip,
    });
    await this.audit.record({
      actorId: user.id,
      action: 'auth.login',
      entityId: user.id,
      ip: ctx.ip,
    });
    return pair;
  }

  refresh(refreshToken: string, ctx: RequestContext) {
    return this.tokens.rotate(refreshToken, ctx);
  }

  async logout(refreshToken: string, actorId?: string) {
    await this.tokens.revoke(refreshToken);
    await this.audit.record({ actorId, action: 'auth.logout' });
    return { success: true };
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    // Always respond 200 to avoid account enumeration.
    const user = await this.users.findByEmail(dto.email);
    if (user) {
      if (this.driver === 'cognito') {
        await this.cognito.forgotPassword(dto.email);
      } else {
        const code = await this.verification.issue('reset', dto.email);
        await this.mail.sendPasswordResetCode(dto.email, code);
      }
    }
    return { message: 'If an account exists, a reset code has been sent.' };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const user = await this.users.findByEmail(dto.email);
    if (!user) throw new UnauthorizedException('Invalid request');

    if (this.driver === 'cognito') {
      await this.cognito.confirmForgotPassword(dto.email, dto.code, dto.newPassword);
    } else {
      const ok = await this.verification.verify('reset', dto.email, dto.code);
      if (!ok) throw new UnauthorizedException('Invalid or expired code');
      const passwordHash = await argon2.hash(dto.newPassword, { type: argon2.argon2id });
      await this.users.updatePassword(user.id, passwordHash);
    }
    await this.audit.record({ actorId: user.id, action: 'auth.reset_password', entityId: user.id });
    return { success: true };
  }

  async me(userId: string) {
    return this.usersService.toPublic(await this.usersService.getById(userId));
  }
}
