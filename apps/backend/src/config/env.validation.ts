import { z } from 'zod';

/**
 * Fail-fast validation of the runtime environment. The app refuses to boot if
 * required configuration is missing or malformed.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  AWS_REGION: z.string().default('eu-west-1'),
  AUTH_DRIVER: z.enum(['local', 'cognito']).default('local'),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  JWT_SECRET: z.string().min(16).default('dev-only-insecure-secret-change-me'),
  JWT_ACCESS_TTL: z.coerce.number().default(900),
  JWT_REFRESH_TTL: z.coerce.number().default(2_592_000),
  JWT_ISSUER: z.string().default('https://api.cinnetemple.com'),
  JWT_AUDIENCE: z.string().default('cinnetemple-clients'),
  COGNITO_USER_POOL_ID: z.string().optional(),
  COGNITO_CLIENT_ID: z.string().optional(),
  COGNITO_CLIENT_SECRET: z.string().optional(),
  COGNITO_ISSUER: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  SES_FROM_ADDRESS: z.string().default('no-reply@cinnetemple.com'),
  CATALOGUE_DRIVER: z.enum(['local', 'dynamodb']).default('local'),
  CATALOGUE_TABLE: z.string().default('cinnetemple-catalogue'),
  MEDIA_BASE_URL: z.string().optional(),
  SEARCH_DRIVER: z.enum(['local', 'opensearch']).default('local'),
  OPENSEARCH_ENDPOINT: z.string().optional(),
  EVENTS_DRIVER: z.enum(['local', 'eventbridge']).default('local'),
  EVENT_BUS_NAME: z.string().default('cinnetemple'),
  PUSH_DRIVER: z.enum(['local', 'sns']).default('local'),
  SNS_PLATFORM_APP_ARN: z.string().optional(),
  REALTIME_ENDPOINT: z.string().optional(),
  // ── Mobile-cinema commerce ──────────────────────────────────────────────────
  PAYMENT_DRIVER: z.enum(['mock', 'paystack']).default('mock'),
  PAYSTACK_SECRET_KEY: z.string().optional(),
  PAYSTACK_PUBLIC_KEY: z.string().optional(),
  APPLE_BUNDLE_ID: z.string().optional(),
  DEFAULT_CURRENCY: z.string().default('NGN'),
  /** Comma-separated emails always treated as admins (bootstrap). */
  ADMIN_EMAILS: z.string().optional(),
  /** S3 bucket for original uploads (admin presigned PUT). */
  MEDIA_ORIGINALS_BUCKET: z.string().optional(),
  /** Public web origin, used to build payment return URLs. */
  WEB_BASE_URL: z.string().default('https://cinnetemple.com'),
  /** TTL (seconds) for signed playback URLs / presigned uploads. */
  MEDIA_URL_TTL: z.coerce.number().default(14_400),
  /** Public URL of this API (local media links when no CDN is configured). */
  API_PUBLIC_URL: z.string().optional(),
  /** Directory for locally stored media when S3 isn't configured. */
  MEDIA_UPLOADS_DIR: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  // In production, refuse the insecure default secret.
  if (parsed.data.NODE_ENV === 'production' && parsed.data.JWT_SECRET.includes('dev-only')) {
    throw new Error('JWT_SECRET must be set to a strong value in production.');
  }
  return parsed.data;
}
