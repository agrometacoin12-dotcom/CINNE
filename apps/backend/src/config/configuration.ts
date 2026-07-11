/**
 * Typed application configuration, loaded from environment variables.
 * In AWS, these values originate from Parameter Store / Secrets Manager and are
 * injected into the task definition; locally they come from `.env`.
 */
export interface AppConfig {
  env: string;
  port: number;
  region: string;
  authDriver: 'local' | 'cognito';
  /**
   * When false (no mail provider), new accounts are auto-verified and
   * registration logs the user straight in. When true, the classic
   * verification-code + email flow is enforced and login blocks unverified
   * accounts.
   */
  emailVerificationRequired: boolean;
  jwt: {
    accessTtl: number;
    refreshTtl: number;
    issuer: string;
    audience: string;
    /** HS256 secret for local/dev. Prod uses RS256 keys from Secrets Manager. */
    secret: string;
  };
  cognito: {
    userPoolId: string;
    clientId: string;
    clientSecret: string;
    issuer: string;
  };
  google: {
    clientId: string;
    clientSecret: string;
    /** iOS OAuth client ID — accepted as `aud` on native Google ID tokens. */
    iosClientId: string;
  };
  ses: { fromAddress: string };
  redisUrl: string;
  catalogueDriver: 'local' | 'dynamodb' | 'prisma';
  catalogueTable: string;
  /** Seed the demo catalogue when the Prisma catalogue is empty at boot. */
  catalogueSeedDemo: boolean;
  mediaBaseUrl: string;
  searchDriver: 'local' | 'opensearch';
  openSearchEndpoint: string;
  eventsDriver: 'local' | 'eventbridge';
  eventBusName: string;
  pushDriver: 'local' | 'sns';
  snsPlatformAppArn: string;
  realtimeEndpoint: string;
  paymentDriver: 'mock' | 'paystack';
  paystack: { secretKey: string; publicKey: string };
  appleBundleId: string;
  defaultCurrency: string;
  adminEmails: string[];
  mediaOriginalsBucket: string;
  webBaseUrl: string;
  mediaUrlTtl: number;
  /** Public URL of this API (used to build local media URLs when no CDN). */
  apiPublicUrl: string;
  /** Directory for locally stored media when S3 isn't configured. */
  mediaUploadsDir: string;
  /** HMAC secret for signed media URLs (upload + stream); falls back to JWT_SECRET. */
  mediaSigningSecret: string;
}

export default (): AppConfig => ({
  env: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '4000', 10),
  region: process.env.AWS_REGION ?? 'eu-west-1',
  authDriver: (process.env.AUTH_DRIVER as 'local' | 'cognito') ?? 'local',
  // Default false: with no mail provider on Railway, auto-verify new accounts.
  emailVerificationRequired: process.env.EMAIL_VERIFICATION_REQUIRED === 'true',
  jwt: {
    accessTtl: parseInt(process.env.JWT_ACCESS_TTL ?? '900', 10),
    refreshTtl: parseInt(process.env.JWT_REFRESH_TTL ?? '2592000', 10),
    issuer: process.env.JWT_ISSUER ?? 'https://api.cinnetemple.com',
    audience: process.env.JWT_AUDIENCE ?? 'cinnetemple-clients',
    secret: process.env.JWT_SECRET ?? 'dev-only-insecure-secret-change-me',
  },
  cognito: {
    userPoolId: process.env.COGNITO_USER_POOL_ID ?? '',
    clientId: process.env.COGNITO_CLIENT_ID ?? '',
    clientSecret: process.env.COGNITO_CLIENT_SECRET ?? '',
    issuer: process.env.COGNITO_ISSUER ?? '',
  },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID ?? '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    iosClientId: process.env.GOOGLE_IOS_CLIENT_ID ?? '',
  },
  ses: { fromAddress: process.env.SES_FROM_ADDRESS ?? 'no-reply@cinnetemple.com' },
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  catalogueDriver: (process.env.CATALOGUE_DRIVER as 'local' | 'dynamodb' | 'prisma') ?? 'prisma',
  catalogueTable: process.env.CATALOGUE_TABLE ?? 'cinnetemple-catalogue',
  // Default: seed demo titles everywhere EXCEPT production, which starts clean.
  catalogueSeedDemo: process.env.CATALOGUE_SEED_DEMO
    ? process.env.CATALOGUE_SEED_DEMO === 'true'
    : (process.env.NODE_ENV ?? 'development') !== 'production',
  mediaBaseUrl: process.env.MEDIA_BASE_URL ?? '',
  searchDriver: (process.env.SEARCH_DRIVER as 'local' | 'opensearch') ?? 'local',
  openSearchEndpoint: process.env.OPENSEARCH_ENDPOINT ?? '',
  eventsDriver: (process.env.EVENTS_DRIVER as 'local' | 'eventbridge') ?? 'local',
  eventBusName: process.env.EVENT_BUS_NAME ?? 'cinnetemple',
  pushDriver: (process.env.PUSH_DRIVER as 'local' | 'sns') ?? 'local',
  snsPlatformAppArn: process.env.SNS_PLATFORM_APP_ARN ?? '',
  realtimeEndpoint: process.env.REALTIME_ENDPOINT ?? '',
  paymentDriver: (process.env.PAYMENT_DRIVER as 'mock' | 'paystack') ?? 'mock',
  paystack: {
    secretKey: process.env.PAYSTACK_SECRET_KEY ?? '',
    publicKey: process.env.PAYSTACK_PUBLIC_KEY ?? '',
  },
  appleBundleId: process.env.APPLE_BUNDLE_ID ?? '',
  defaultCurrency: process.env.DEFAULT_CURRENCY ?? 'NGN',
  adminEmails: (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
  mediaOriginalsBucket: process.env.MEDIA_ORIGINALS_BUCKET ?? '',
  webBaseUrl: process.env.WEB_BASE_URL ?? 'https://cinnetemple.com',
  mediaUrlTtl: parseInt(process.env.MEDIA_URL_TTL ?? '14400', 10),
  apiPublicUrl:
    process.env.API_PUBLIC_URL ?? `http://localhost:${parseInt(process.env.PORT ?? '4000', 10)}`,
  mediaUploadsDir: process.env.MEDIA_UPLOADS_DIR ?? `${process.cwd()}/uploads`,
  mediaSigningSecret: process.env.MEDIA_SIGNING_SECRET ?? '',
});
