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
  ses: { fromAddress: string };
  redisUrl: string;
  catalogueDriver: 'local' | 'dynamodb';
  catalogueTable: string;
  mediaBaseUrl: string;
  searchDriver: 'local' | 'opensearch';
  openSearchEndpoint: string;
  eventsDriver: 'local' | 'eventbridge';
  eventBusName: string;
  pushDriver: 'local' | 'sns';
  snsPlatformAppArn: string;
  realtimeEndpoint: string;
}

export default (): AppConfig => ({
  env: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '4000', 10),
  region: process.env.AWS_REGION ?? 'eu-west-1',
  authDriver: (process.env.AUTH_DRIVER as 'local' | 'cognito') ?? 'local',
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
  ses: { fromAddress: process.env.SES_FROM_ADDRESS ?? 'no-reply@cinnetemple.com' },
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  catalogueDriver: (process.env.CATALOGUE_DRIVER as 'local' | 'dynamodb') ?? 'local',
  catalogueTable: process.env.CATALOGUE_TABLE ?? 'cinnetemple-catalogue',
  mediaBaseUrl: process.env.MEDIA_BASE_URL ?? '',
  searchDriver: (process.env.SEARCH_DRIVER as 'local' | 'opensearch') ?? 'local',
  openSearchEndpoint: process.env.OPENSEARCH_ENDPOINT ?? '',
  eventsDriver: (process.env.EVENTS_DRIVER as 'local' | 'eventbridge') ?? 'local',
  eventBusName: process.env.EVENT_BUS_NAME ?? 'cinnetemple',
  pushDriver: (process.env.PUSH_DRIVER as 'local' | 'sns') ?? 'local',
  snsPlatformAppArn: process.env.SNS_PLATFORM_APP_ARN ?? '',
  realtimeEndpoint: process.env.REALTIME_ENDPOINT ?? '',
});
