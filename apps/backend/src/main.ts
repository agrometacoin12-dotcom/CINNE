import 'reflect-metadata';
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

  // Locally stored media (no-S3 driver): express static serves with HTTP
  // Range support, which AVPlayer (iOS) and <video> (web) rely on to seek.
  app.useStaticAssets(app.get(MediaService).localUploadsDir, { prefix: '/media/' });

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
  // eslint-disable-next-line no-console
  console.log(`CinneTemple backend listening on http://localhost:${port}`);
}

void bootstrap();
