import { z } from 'zod';

/**
 * Single source of truth for auth request/response shapes. The backend validates
 * against these (kept in sync with its DTOs), the web client imports them
 * directly, and the iOS client mirrors them via generated Swift models.
 */

export const strongPassword = z
  .string()
  .min(12)
  .regex(/[a-z]/, 'must contain a lowercase letter')
  .regex(/[A-Z]/, 'must contain an uppercase letter')
  .regex(/\d/, 'must contain a number')
  .regex(/[^A-Za-z0-9]/, 'must contain a symbol');

export const registerSchema = z.object({
  email: z.string().email(),
  password: strongPassword,
  displayName: z.string().min(2).max(60),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  deviceId: z.string().optional(),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const verifyEmailSchema = z.object({
  email: z.string().email(),
  code: z.string().min(6).max(10),
});
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

export const resetPasswordSchema = z.object({
  email: z.string().email(),
  code: z.string().min(6).max(10),
  newPassword: strongPassword,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const tokenPairSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  tokenType: z.literal('Bearer'),
  expiresIn: z.number(),
});
export type TokenPair = z.infer<typeof tokenPairSchema>;

export const userProfileSchema = z.object({
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
  locale: z.string(),
});

export const meSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  emailVerified: z.boolean(),
  mfaEnabled: z.boolean(),
  status: z.enum(['PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED']),
  roles: z.array(z.string()),
  isAdmin: z.boolean().default(false),
  profile: userProfileSchema.nullable(),
});
export type Me = z.infer<typeof meSchema>;

export const Role = {
  Guest: 'guest',
  User: 'user',
  Moderator: 'moderator',
  Admin: 'admin',
} as const;
export type Role = (typeof Role)[keyof typeof Role];
