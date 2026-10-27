import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { VersioningType, INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AdaptiveMediaService, adaptivePrefix } from './adaptive-media.service';
import { AdaptiveMediaController } from './adaptive-media.controller';

const SOURCE = 'originals/video/example.mp4';
const BUILD = '11111111-1111-4111-8111-111111111111';

describe('Protected adaptive media', () => {
  let root: string, app: INestApplication, service: AdaptiveMediaService, prefix: string;
  const route = (url: string) => {
    const u = new URL(url);
    return u.pathname + u.search;
  };
  const children = (manifest: string) =>
    manifest
      .trim()
      .split('\n')
      .filter((line) => !line.startsWith('#'));
  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'ct-hls-test-'));
    prefix = `${adaptivePrefix(SOURCE)}/${BUILD}`;
    await mkdir(join(root, prefix), { recursive: true });
    await writeFile(
      join(root, adaptivePrefix(SOURCE), 'ready.json'),
      JSON.stringify({ version: 1, masterKey: `${prefix}/master.m3u8` }),
    );
    await writeFile(
      join(root, prefix, 'master.m3u8'),
      '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=800000\n360p.m3u8\n',
    );
    await writeFile(
      join(root, prefix, '360p.m3u8'),
      '#EXTM3U\n#EXT-X-TARGETDURATION:4\n#EXTINF:4,\n360p_000000.ts\n' + '#EXTINF:4,\n360p_000001.ts\n'.repeat(5) + '#EXT-X-ENDLIST\n',
    );
    await writeFile(join(root, prefix, '360p_000000.ts'), '0123456789');
    const config = new ConfigService({
      mediaHlsEnabled: true,
      mediaUploadsDir: root,
      mediaSigningSecret: 'test-secret-test-secret',
      apiPublicUrl: 'http://fixture.test',
    });
    const module = await Test.createTestingModule({
      controllers: [AdaptiveMediaController],
      providers: [AdaptiveMediaService, { provide: ConfigService, useValue: config }],
    }).compile();
    app = module.createNestApplication();
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    await app.init();
    service = app.get(AdaptiveMediaService);
  });
  afterAll(async () => {
    await app.close();
    await rm(root, { recursive: true, force: true });
  });

  it('signs every variant and segment and supports byte ranges', async () => {
    const url = await service.playbackUrl(SOURCE, 'viewer', null);
    const master = await request(app.getHttpServer()).get(route(url!)).expect(200);
    expect(master.headers['content-type']).toContain('application/vnd.apple.mpegurl');
    const variantUrl = children(master.text)[0]!;
    expect(variantUrl).toContain('sig=');
    const variant = await request(app.getHttpServer()).get(route(variantUrl)).expect(200);
    const segment = children(variant.text)[0]!;
    const response = await request(app.getHttpServer())
      .get(route(segment))
      .set('Range', 'bytes=0-3')
      .expect(206);
    expect(response.headers['content-range']).toBe('bytes 0-3/10');
    expect(response.headers['cache-control']).toBe('private, no-store');
  });

  it('compresses long signed playlists without changing their contents', async () => {
    const url = await service.playbackUrl(SOURCE, 'viewer', null);
    const master = await request(app.getHttpServer()).get(route(url!));
    const variant = route(children(master.text)[0]!);
    const plain = await request(app.getHttpServer()).get(variant).set('Accept-Encoding', 'identity').expect(200);
    const compressed = await request(app.getHttpServer()).get(variant).set('Accept-Encoding', 'gzip').expect(200);
    expect(plain.headers['content-encoding']).toBeUndefined();
    expect(compressed.headers['content-encoding']).toBe('gzip');
    expect(compressed.headers.vary).toContain('Accept-Encoding');
    expect(compressed.text).toBe(plain.text);
  });

  it('preparation reveals exactly one segment and cannot be upgraded to full playback', async () => {
    const url = await service.playbackUrl(SOURCE, 'viewer', null, 'prepare');
    const prepared = await request(app.getHttpServer()).get(route(url!)).expect(200);
    expect(children(prepared.text)).toHaveLength(1);
    expect(prepared.text).not.toContain('000001');
    expect(prepared.text).toContain('#EXT-X-ENDLIST');
    const tampered = new URL(url!);
    tampered.searchParams.set('scope', 'play');
    await request(app.getHttpServer()).get(route(tampered.href)).expect(401);
    const segment = children(prepared.text)[0]!;
    await request(app.getHttpServer())
      .get(route(segment.replace('000000.ts', '000001.ts')))
      .expect(401);
    await request(app.getHttpServer())
      .get(route(segment.replace('u=viewer', 'u=other')))
      .expect(401);
  });

  it('uses a build-scoped CDN policy for playback but an exact-file token for preparation', async () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const cdn = new AdaptiveMediaService(
      new ConfigService({
        mediaHlsEnabled: true,
        mediaUploadsDir: root,
        mediaSigningSecret: 'test-secret-test-secret',
        mediaHlsCdnUrl: 'https://cdn.test',
        mediaHlsKeyPairId: 'test-key',
        mediaHlsPrivateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
      }),
    );
    const full = children(
      await cdn.playlist(`${prefix}/360p.m3u8`, 'viewer', Date.now() + 60_000, 'play'),
    );
    const first = new URL(full[0]!);
    expect(first.hostname).toBe('cdn.test');
    expect(first.searchParams.get('Policy')).toBeTruthy();
    expect(new URL(full[1]!).searchParams.get('Signature')).toBe(
      first.searchParams.get('Signature'),
    );
    const warm = new URL(
      children(
        await cdn.playlist(`${prefix}/360p.m3u8`, 'viewer', Date.now() + 60_000, 'prepare'),
      )[0]!,
    );
    expect(warm.searchParams.has('Policy')).toBe(false);
    expect(warm.searchParams.has('Expires')).toBe(true);
  });

  it('rejects unsigned, expired and path-swapped URLs', async () => {
    await request(app.getHttpServer()).get(`/v1/media/${prefix}/master.m3u8`).expect(401);
    const expired = service.signedUrl(`${prefix}/master.m3u8`, 'viewer', Date.now() - 1);
    await request(app.getHttpServer()).get(route(expired)).expect(401);
    expect(() =>
      service.signedUrl(`${prefix}/../secret.ts`, 'viewer', Date.now() + 1000),
    ).toThrow();
  });

  it('falls back while a rendition is absent and refuses external sources', async () => {
    expect(await service.playbackUrl('originals/video/missing.mp4', 'viewer', null)).toBeNull();
    expect(await service.playbackUrl('https://external.test/file.mp4', 'viewer', null)).toBeNull();
  });

  it('rejects playlist references outside the encoded build', async () => {
    await writeFile(join(root, prefix, 'bad.m3u8'), '#EXTM3U\nhttps://attacker.test/segment.ts\n');
    await expect(
      service.playlist(`${prefix}/bad.m3u8`, 'viewer', Date.now() + 1000, 'play'),
    ).rejects.toThrow();
    await writeFile(
      join(root, prefix, 'bad.m3u8'),
      '#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="https://attacker.test/key"\n',
    );
    await expect(
      service.playlist(`${prefix}/bad.m3u8`, 'viewer', Date.now() + 1000, 'play'),
    ).rejects.toThrow();
  });
});
