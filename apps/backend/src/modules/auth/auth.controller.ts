import { randomBytes } from 'node:crypto';
import { Body, Controller, Get, HttpCode, Post, Query, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { AuthService } from './auth.service';
import { GoogleOAuthService } from './google-oauth.service';
import {
  ForgotPasswordDto,
  LoginDto,
  RefreshDto,
  RegisterDto,
  ResetPasswordDto,
  VerifyEmailDto,
} from './dto/auth.dto';

function ctxFrom(req: Request) {
  return { ip: req.ip, userAgent: req.headers['user-agent'] };
}

function readCookie(req: Request, name: string): string | undefined {
  const raw = req.headers.cookie;
  if (!raw) return undefined;
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return undefined;
}

@ApiTags('Auth')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly google: GoogleOAuthService,
    private readonly config: ConfigService,
  ) {}

  // ── Google OAuth (sign in / sign up) ──────────────────────────────────────
  @Public()
  @Get('google')
  @ApiOperation({ summary: 'Begin Google sign-in (redirects to Google)' })
  googleStart(@Res() res: Response) {
    const state = randomBytes(16).toString('hex');
    res.cookie('g_state', state, {
      httpOnly: true,
      secure: this.config.get('env') === 'production',
      sameSite: 'lax',
      maxAge: 600_000,
      path: '/',
    });
    res.redirect(this.google.authUrl(state));
  }

  @Public()
  @Get('google/callback')
  @ApiOperation({ summary: 'Google OAuth callback — issues tokens, returns to web' })
  async googleCallback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const web = (this.config.get<string>('webBaseUrl') ?? 'https://www.cinnetemple.com').replace(/\/$/, '');
    const fail = (reason: string) => res.redirect(`${web}/login?error=${encodeURIComponent(reason)}`);
    try {
      if (error) return fail(error);
      if (!code) return fail('missing_code');
      const expected = readCookie(req, 'g_state');
      res.clearCookie('g_state', { path: '/' });
      if (expected && state && expected !== state) return fail('state_mismatch');

      const pair = await this.google.handleCallback(code, ctxFrom(req));
      const frag = new URLSearchParams({
        accessToken: pair.accessToken,
        refreshToken: pair.refreshToken,
        expiresIn: String(pair.expiresIn),
      });
      return res.redirect(`${web}/auth/callback#${frag.toString()}`);
    } catch {
      return fail('google_signin_failed');
    }
  }

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post('register')
  @ApiOperation({ summary: 'Register a new user' })
  register(@Body() dto: RegisterDto, @Req() req: Request) {
    return this.auth.register(dto, ctxFrom(req));
  }

  @Public()
  @Post('verify-email')
  @HttpCode(200)
  @ApiOperation({ summary: 'Confirm email with a one-time code' })
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.auth.verifyEmail(dto);
  }

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Authenticate with email & password' })
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.auth.login(dto, ctxFrom(req));
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Exchange a refresh token for a new token pair' })
  refresh(@Body() dto: RefreshDto, @Req() req: Request) {
    return this.auth.refresh(dto.refreshToken, ctxFrom(req));
  }

  @ApiBearerAuth()
  @Post('logout')
  @HttpCode(200)
  @ApiOperation({ summary: 'Revoke the current session' })
  logout(@Body() dto: RefreshDto, @CurrentUser() user: AuthenticatedUser) {
    return this.auth.logout(dto.refreshToken, user.sub);
  }

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post('forgot-password')
  @HttpCode(200)
  @ApiOperation({ summary: 'Begin password reset' })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.auth.forgotPassword(dto);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(200)
  @ApiOperation({ summary: 'Complete password reset with a code' })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto);
  }

  @ApiBearerAuth()
  @Get('me')
  @ApiOperation({ summary: 'Get the authenticated user' })
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.auth.me(user.sub);
  }
}
