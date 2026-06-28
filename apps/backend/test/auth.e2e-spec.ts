import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

/**
 * Happy-path e2e for the local auth driver. Requires Postgres + Redis (see
 * docker-compose). Skipped automatically if DATABASE_URL is not set.
 */
const maybe = process.env.DATABASE_URL ? describe : describe.skip;

maybe('Auth (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('rejects weak passwords on register', async () => {
    await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send({ email: 'weak@example.com', password: 'short', displayName: 'Weak' })
      .expect(422);
  });

  it('requires auth on /v1/auth/me', async () => {
    await request(app.getHttpServer()).get('/v1/auth/me').expect(401);
  });
});
