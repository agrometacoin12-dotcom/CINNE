import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  MinLength,
} from 'class-validator';

const STRONG_PASSWORD = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

export class RegisterDto {
  @ApiProperty({ format: 'email' })
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 8, description: 'Min 8 chars, upper/lower/number/symbol.' })
  @Matches(STRONG_PASSWORD, {
    message: 'Password must be ≥8 chars and include upper, lower, number, and symbol.',
  })
  password!: string;

  @ApiProperty({ minLength: 2, maxLength: 60 })
  @IsString()
  @Length(2, 60)
  displayName!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  deviceId?: string;
}

export class VerifyEmailDto {
  @ApiProperty({ format: 'email' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @Length(6, 10)
  code!: string;
}

export class LoginDto {
  @ApiProperty({ format: 'email' })
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  password!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  deviceId?: string;
}

export class RefreshDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}

export class GoogleNativeDto {
  @ApiProperty({ description: 'Google ID token from the native Google Sign-In SDK.' })
  @IsString()
  @IsNotEmpty()
  idToken!: string;
}

export class AppleNativeDto {
  @ApiProperty({ description: 'Apple identity token (JWS) from Sign in with Apple on iOS.' })
  @IsString()
  @IsNotEmpty()
  identityToken!: string;

  /** Apple only provides the name on the FIRST authorization — forward it. */
  @ApiProperty({ required: false, maxLength: 120 })
  @IsOptional()
  @IsString()
  @Length(1, 120)
  fullName?: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ format: 'email' })
  @IsEmail()
  email!: string;
}

export class ResetPasswordDto {
  @ApiProperty({ format: 'email' })
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  @Length(6, 10)
  code!: string;

  @ApiProperty({ minLength: 8 })
  @Matches(STRONG_PASSWORD, {
    message: 'Password must be ≥8 chars and include upper, lower, number, and symbol.',
  })
  newPassword!: string;
}

export class TokenPairDto {
  @ApiProperty()
  accessToken!: string;
  @ApiProperty()
  refreshToken!: string;
  @ApiProperty({ example: 'Bearer' })
  tokenType!: string;
  @ApiProperty({ example: 900 })
  expiresIn!: number;
}

export class RegisterResponseDto {
  @ApiProperty()
  userId!: string;

  @ApiProperty({ example: 'ACTIVE' })
  status!: string;

  /**
   * Present only when the account was auto-verified at registration
   * (EMAIL_VERIFICATION_REQUIRED=false) — lets the client log in immediately.
   * Omitted when email verification is enforced.
   */
  @ApiProperty({ type: TokenPairDto, required: false })
  tokens?: TokenPairDto;
}
