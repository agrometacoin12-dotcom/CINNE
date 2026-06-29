import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { LoggerModule } from 'nestjs-pino';
import configuration from './config/configuration';
import { validateEnv } from './config/env.validation';
import { GqlThrottlerGuard } from './common/guards/gql-throttler.guard';
import { PrismaModule } from './infra/prisma/prisma.module';
import { RedisModule } from './infra/redis/redis.module';
import { EventsModule } from './infra/events/events.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { ProfileModule } from './modules/profile/profile.module';
import { SessionsModule } from './modules/sessions/sessions.module';
import { CatalogueModule } from './modules/catalogue/catalogue.module';
import { WatchlistModule } from './modules/watchlist/watchlist.module';
import { MediaModule } from './modules/media/media.module';
import { AdminModule } from './modules/admin/admin.module';
import { CommerceModule } from './modules/commerce/commerce.module';
import { PlaybackModule } from './modules/playback/playback.module';
import { PremiereModule } from './modules/premiere/premiere.module';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: validateEnv,
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        autoLogging: true,
        redact: ['req.headers.authorization', 'req.body.password'],
        transport:
          process.env.NODE_ENV !== 'production' ? { target: 'pino-pretty' } : undefined,
        customProps: () => ({ service: 'cinnetemple-backend' }),
      },
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: true, // code-first, in-memory schema
      path: '/graphql',
      playground: false,
      introspection: process.env.NODE_ENV !== 'production',
      context: ({ req, res }: { req: unknown; res: unknown }) => ({ req, res }),
    }),
    PrismaModule,
    RedisModule,
    EventsModule,
    AuthModule,
    NotificationsModule,
    UsersModule,
    ProfileModule,
    SessionsModule,
    CatalogueModule,
    WatchlistModule,
    MediaModule,
    AdminModule,
    CommerceModule,
    PlaybackModule,
    PremiereModule,
    HealthModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: GqlThrottlerGuard }],
})
export class AppModule {}
