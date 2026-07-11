import 'reflect-metadata';
import type { Server } from 'node:http';
import { join } from 'node:path';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { MediaService } from './modules/media/media.service';

async function bootstrap() {
  // rawBody: true preserves the unparsed request body so payment webhook
  // signatures (HMAC over the exact bytes) can be verified.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    rawBody: true,
  });

  app.useLogger(app.get(Logger));
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.enableCors({ origin: true, credentials: true });

  // Locally stored media: ONLY image prefixes (poster/hero art + bundled seed
  // art) are public static assets. Video objects live under originals/video/
  // and are deliberately excluded — they are served exclusively through the
  // signed, expiring GET /v1/media/stream route (see MediaController).
  const mediaService = app.get(MediaService);
  for (const prefix of mediaService.publicImagePrefixes) {
    app.useStaticAssets(join(mediaService.localUploadsDir, prefix), {
      prefix: `/media/${prefix}/`,
    });
  }

  app.setGlobalPrefix('');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());

  // Swagger / OpenAPI (disabled in production unless explicitly enabled)
  if (process.env.NODE_ENV !== 'production' || process.env.ENABLE_DOCS === 'true') {
    const config = new DocumentBuilder()
      .setTitle('CinneTemple API')
      .setDescription('Authentication & identity surface (Phase 1).')
      .setVersion('1.0.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document, { jsonDocumentUrl: 'docs-json' });
  }

  const port = process.env.PORT ?? 4000;
  await app.listen(port);

  // Large-upload friendliness: multi-GB videos arrive as a single signed PUT,
  // which easily exceeds Node's 300s default requestTimeout — disable it and
  // let the byte-cap/stream logic govern uploads instead. keepAliveTimeout
  // must exceed the Railway edge proxy's idle keep-alive (~60s) or the proxy
  // reuses sockets the app already closed and surfaces spurious 502s.
  // headersTimeout guards slowloris; Node requires it to be a bit larger than
  // keepAliveTimeout so idle kept-alive sockets aren't reaped early.
  const httpServer = app.getHttpServer() as Server;
  httpServer.requestTimeout = 0;
  httpServer.keepAliveTimeout = 65_000;
  httpServer.headersTimeout = 66_000;
  // eslint-disable-next-line no-console
  console.log(`CinneTemple backend listening on http://localhost:${port}`);
}

void bootstrap();
