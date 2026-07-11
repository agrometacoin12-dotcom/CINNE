import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { VersioningType, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';

/**
 * HTTP-level spec for the signed media routes: Range/206 on the stream GET
 * (what AVPlayer and <video> depend on) and the hardened upload PUT.
 */
describe('MediaController (HTTP)', () => {
  let app: INestApplication;
  let uploadsDir: string;
  let service: MediaService;

  const VIDEO_KEY = 'originals/video/feature.mp4';
  const VIDEO_BYTES = Buffer.from('0123456789abcdefghij'); // 20 bytes

  beforeAll(async () => {
    uploadsDir = await mkdtemp(join(tmpdir(), 'media-http-'));
    await mkdir(join(uploadsDir, 'originals/video'), { recursive: true });
    await writeFile(join(uploadsDir, VIDEO_KEY), VIDEO_BYTES);

    const config = {
      get: (key: string) =>
        (
          ({
            mediaUrlTtl: 3600,
            apiPublicUrl: 'http://localhost:4000',
            mediaUploadsDir: uploadsDir,
            mediaSigningSecret: 'media-secret-media-secret',
            'jwt.secret': 'jwt-secret-jwt-secret',
          }) as Record<string, unknown>
        )[key],
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [MediaController],
      providers: [MediaService, { provide: ConfigService, useValue: config }],
    }).compile();

    app = moduleRef.createNestApplication();
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    await app.init();
    service = app.get(MediaService);
  });

  afterAll(async () => {
    await app.close();
    await rm(uploadsDir, { recursive: true, force: true });
  });

  const signedStreamQuery = () => {
    const url = new URL(service.playbackUrl(VIDEO_KEY)!);
    return url.search; // ?key=...&expires=...&sig=...
  };

  describe('GET /v1/media/stream', () => {
    it('serves the full file with Accept-Ranges when no Range is sent', async () => {
      const res = await request(app.getHttpServer()).get(`/v1/media/stream${signedStreamQuery()}`);
      expect(res.status).toBe(200);
      expect(res.headers['accept-ranges']).toBe('bytes');
      expect(res.headers['content-type']).toContain('video/mp4');
      expect(res.headers['cache-control']).toContain('private');
      expect(res.body.toString()).toBe(VIDEO_BYTES.toString());
    });

    it('honours Range requests with 206 + Content-Range (seek support)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/v1/media/stream${signedStreamQuery()}`)
        .set('Range', 'bytes=5-9');
      expect(res.status).toBe(206);
      expect(res.headers['content-range']).toBe(`bytes 5-9/${VIDEO_BYTES.length}`);
      expect(res.headers['content-length']).toBe('5');
      expect(res.body.toString()).toBe('56789');
    });

    it('rejects tampered signatures with 401', async () => {
      const url = new URL(service.playbackUrl(VIDEO_KEY)!);
      url.searchParams.set('sig', 'f'.repeat(64));
      const res = await request(app.getHttpServer()).get(`/v1/media/stream${url.search}`);
      expect(res.status).toBe(401);
    });

    it('rejects expired links with 401', async () => {
      const url = new URL(service.playbackUrl(VIDEO_KEY)!);
      url.searchParams.set('expires', String(Date.now() - 1000));
      const res = await request(app.getHttpServer()).get(`/v1/media/stream${url.search}`);
      expect(res.status).toBe(401);
    });

    it('returns 404 for a validly signed but missing object', async () => {
      const url = new URL(service.playbackUrl('originals/video/missing.mp4')!);
      const res = await request(app.getHttpServer()).get(`/v1/media/stream${url.search}`);
      expect(res.status).toBe(404);
    });
  });

  describe('PUT /v1/media/upload', () => {
    it('stores a signed upload with the matching Content-Type', async () => {
      const presign = await service.presignUpload('poster', 'image/png');
      const path = new URL(presign.uploadUrl!);
      const res = await request(app.getHttpServer())
        .put(`/v1/media/upload${path.search}`)
        .set('Content-Type', 'image/png')
        .send(Buffer.from('poster-bytes'));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ stored: true, key: presign.key });
      expect(await readFile(join(uploadsDir, presign.key), 'utf8')).toBe('poster-bytes');
    });

    it('rejects an upload whose Content-Type differs from the presigned one', async () => {
      const presign = await service.presignUpload('poster', 'image/png');
      const path = new URL(presign.uploadUrl!);
      const res = await request(app.getHttpServer())
        .put(`/v1/media/upload${path.search}`)
        .set('Content-Type', 'image/jpeg')
        .send(Buffer.from('x'));
      expect(res.status).toBe(401);
    });

    it('rejects an image upload over the 20 MB cap with 413 and stores nothing', async () => {
      const presign = await service.presignUpload('hero', 'image/jpeg');
      const path = new URL(presign.uploadUrl!);
      // Content-Length > cap → early 413. The server rejects before draining
      // the 21 MB body, so the client may instead observe the socket being
      // torn down mid-write (EPIPE/ECONNRESET) — both prove the abort.
      try {
        const res = await request(app.getHttpServer())
          .put(`/v1/media/upload${path.search}`)
          .set('Content-Type', 'image/jpeg')
          .send(Buffer.alloc(21 * 1024 ** 2));
        expect(res.status).toBe(413);
      } catch (err) {
        expect(String((err as NodeJS.ErrnoException).code)).toMatch(/EPIPE|ECONNRESET/);
      }
      await expect(readFile(join(uploadsDir, presign.key))).rejects.toMatchObject({
        code: 'ENOENT',
      });
    });
  });
});
