import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import {
  BadRequestException,
  PayloadTooLargeException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MediaService } from './media.service';

describe('MediaService', () => {
  let uploadsDir: string;
  let service: MediaService;

  const makeConfig = (dir: string) =>
    ({
      get: (key: string) => {
        const map: Record<string, unknown> = {
          mediaUrlTtl: 3600,
          apiPublicUrl: 'https://api.cinnetemple.com',
          mediaUploadsDir: dir,
          mediaSigningSecret: 'media-secret-media-secret',
          'jwt.secret': 'jwt-secret-jwt-secret',
        };
        return map[key];
      },
    }) as unknown as ConfigService;

  const query = (url: string) => {
    const p = new URL(url).searchParams;
    return { key: p.get('key') ?? '', expires: p.get('expires') ?? '', sig: p.get('sig') ?? '' };
  };

  beforeAll(async () => {
    uploadsDir = await mkdtemp(join(tmpdir(), 'media-spec-'));
    service = new MediaService(makeConfig(uploadsDir));
  });

  afterAll(async () => {
    await rm(uploadsDir, { recursive: true, force: true });
  });

  // ── Signed stream URLs (playbackUrl → verifyStreamRequest) ────────────────

  describe('signed stream delivery', () => {
    it('playbackUrl returns a signed /v1/media/stream URL that validates', () => {
      const key = 'originals/video/abc.mp4';
      const url = service.playbackUrl(key)!;
      expect(url.startsWith('https://api.cinnetemple.com/v1/media/stream?')).toBe(true);

      const { key: k, expires, sig } = query(url);
      expect(k).toBe(key);
      const path = service.verifyStreamRequest(k, Number(expires), sig);
      expect(path).toBe(join(uploadsDir, key));
    });

    it('embeds TTL = mediaUrlTtl in the expiry', () => {
      const before = Date.now();
      const { expires } = query(service.playbackUrl('originals/video/abc.mp4')!);
      expect(Number(expires)).toBeGreaterThanOrEqual(before + 3600 * 1000 - 50);
      expect(Number(expires)).toBeLessThanOrEqual(Date.now() + 3600 * 1000 + 50);
    });

    it('passes absolute URLs through untouched', () => {
      expect(service.playbackUrl('https://cdn.example.com/movie.mp4')).toBe(
        'https://cdn.example.com/movie.mp4',
      );
      expect(service.playbackUrl('')).toBeNull();
    });

    it('rejects expired links', () => {
      const key = 'originals/video/abc.mp4';
      const url = service.playbackUrl(key)!;
      const { sig } = query(url);
      expect(() => service.verifyStreamRequest(key, Date.now() - 1000, sig)).toThrow(
        UnauthorizedException,
      );
    });

    it('rejects tampered signatures', () => {
      const key = 'originals/video/abc.mp4';
      const { expires, sig } = query(service.playbackUrl(key)!);
      const flipped = (sig.charAt(0) === 'a' ? 'b' : 'a') + sig.slice(1);
      expect(() => service.verifyStreamRequest(key, Number(expires), flipped)).toThrow(
        UnauthorizedException,
      );
      expect(() => service.verifyStreamRequest(key, Number(expires), '')).toThrow(
        UnauthorizedException,
      );
    });

    it('rejects a signature replayed against a different key', () => {
      const { expires, sig } = query(service.playbackUrl('originals/video/abc.mp4')!);
      expect(() =>
        service.verifyStreamRequest('originals/video/other.mp4', Number(expires), sig),
      ).toThrow(UnauthorizedException);
    });

    it('rejects a signature whose expiry was extended', () => {
      const key = 'originals/video/abc.mp4';
      const { expires, sig } = query(service.playbackUrl(key)!);
      expect(() => service.verifyStreamRequest(key, Number(expires) + 60_000, sig)).toThrow(
        UnauthorizedException,
      );
    });

    it('an upload signature cannot be replayed on the stream route (domain separation)', async () => {
      const presign = await service.presignUpload('video', 'video/mp4');
      const { key, expires, sig } = query(presign.uploadUrl!);
      expect(() => service.verifyStreamRequest(key, Number(expires), sig)).toThrow(
        UnauthorizedException,
      );
    });

    it('rejects traversal keys before checking signatures', () => {
      expect(() => service.verifyStreamRequest('../../etc/passwd', Date.now() + 1000, 'x')).toThrow(
        BadRequestException,
      );
      expect(() => service.verifyStreamRequest('/etc/passwd', Date.now() + 1000, 'x')).toThrow(
        BadRequestException,
      );
    });
  });

  // ── Upload presign: Content-Type allowlist ────────────────────────────────

  describe('presignUpload content-type allowlist', () => {
    it.each([
      ['video', 'video/mp4', '.mp4'],
      ['video', 'video/quicktime', '.mov'],
      ['video', 'video/webm', '.webm'],
      ['poster', 'image/jpeg', '.jpg'],
      ['poster', 'image/png', '.png'],
      ['hero', 'image/webp', '.webp'],
    ] as const)('allows %s upload of %s with extension %s', async (kind, ct, ext) => {
      const upload = await service.presignUpload(kind, ct);
      expect(upload.key.startsWith(`originals/${kind}/`)).toBe(true);
      expect(upload.key.endsWith(ext)).toBe(true);
      expect(upload.headers['Content-Type']).toBe(ct);
      expect(upload.uploadUrl).toContain('/v1/media/upload?');
    });

    it.each([
      ['video', 'video/x-matroska'],
      ['video', 'application/octet-stream'],
      ['video', 'image/png'],
      ['poster', 'video/mp4'],
      ['poster', 'image/gif'],
      ['hero', 'text/html'],
    ] as const)('rejects %s upload of %s with a 400 listing accepted types', async (kind, ct) => {
      await expect(service.presignUpload(kind, ct)).rejects.toThrow(BadRequestException);
      await expect(service.presignUpload(kind, ct)).rejects.toThrow(
        kind === 'video'
          ? /video\/mp4, video\/quicktime, video\/webm/
          : /image\/jpeg, image\/png, image\/webp/,
      );
    });
  });

  // ── saveLocal: signature covers Content-Type, byte caps enforced ─────────

  describe('saveLocal', () => {
    const bodyOf = (buf: Buffer) => Readable.from([buf]);

    it('stores an upload whose Content-Type matches the signed one', async () => {
      const presign = await service.presignUpload('poster', 'image/png');
      const { key, expires, sig } = query(presign.uploadUrl!);
      await service.saveLocal(
        key,
        Number(expires),
        sig,
        bodyOf(Buffer.from('png-bytes')),
        'image/png',
      );
      expect(await readFile(join(uploadsDir, key), 'utf8')).toBe('png-bytes');
    });

    it('rejects a PUT whose Content-Type differs from the signed one', async () => {
      const presign = await service.presignUpload('poster', 'image/png');
      const { key, expires, sig } = query(presign.uploadUrl!);
      await expect(
        service.saveLocal(key, Number(expires), sig, bodyOf(Buffer.from('x')), 'image/jpeg'),
      ).rejects.toThrow(UnauthorizedException);
      await expect(
        service.saveLocal(key, Number(expires), sig, bodyOf(Buffer.from('x')), ''),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects expired upload links', async () => {
      const presign = await service.presignUpload('poster', 'image/png');
      const { key, sig } = query(presign.uploadUrl!);
      await expect(
        service.saveLocal(key, Date.now() - 1, sig, bodyOf(Buffer.from('x')), 'image/png'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects oversized declared Content-Length up front (413)', async () => {
      const presign = await service.presignUpload('poster', 'image/png');
      const { key, expires, sig } = query(presign.uploadUrl!);
      await expect(
        service.saveLocal(
          key,
          Number(expires),
          sig,
          bodyOf(Buffer.from('x')),
          'image/png',
          20 * 1024 ** 2 + 1,
        ),
      ).rejects.toThrow(PayloadTooLargeException);
    });

    it('aborts a streaming upload that exceeds the image cap and unlinks the partial file', async () => {
      const presign = await service.presignUpload('hero', 'image/jpeg');
      const { key, expires, sig } = query(presign.uploadUrl!);

      // 21 x 1 MiB chunks without a declared length — cap is 20 MiB.
      const oversized = Readable.from(
        (function* () {
          for (let i = 0; i < 21; i++) yield Buffer.alloc(1024 ** 2);
        })(),
      );

      await expect(
        service.saveLocal(key, Number(expires), sig, oversized, 'image/jpeg'),
      ).rejects.toThrow(PayloadTooLargeException);
      await expect(stat(join(uploadsDir, key))).rejects.toMatchObject({ code: 'ENOENT' });
    });

    it('rejects keys outside the known upload namespaces', async () => {
      // Forge a plausible key in a bad namespace — signature is computed the
      // same way the service would, but the namespace check must still fail.
      const presign = await service.presignUpload('poster', 'image/png');
      const { expires } = query(presign.uploadUrl!);
      await expect(
        service.saveLocal(
          '../../evil.png',
          Number(expires),
          'sig',
          bodyOf(Buffer.from('x')),
          'image/png',
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── statObject ────────────────────────────────────────────────────────────

  describe('statObject', () => {
    it('reports existing files with their size', async () => {
      const key = 'originals/video/present.mp4';
      await mkdir(join(uploadsDir, 'originals/video'), { recursive: true });
      await writeFile(join(uploadsDir, key), Buffer.alloc(1234));
      await expect(service.statObject(key)).resolves.toEqual({ exists: true, size: 1234 });
    });

    it('reports missing files as exists=false', async () => {
      await expect(service.statObject('originals/video/nope.mp4')).resolves.toEqual({
        exists: false,
        size: 0,
      });
    });

    it('rejects path traversal and absolute keys', async () => {
      await expect(service.statObject('../outside.txt')).rejects.toThrow(BadRequestException);
      await expect(service.statObject('originals/../../x')).rejects.toThrow(BadRequestException);
      await expect(service.statObject('/etc/passwd')).rejects.toThrow(BadRequestException);
      await expect(service.statObject('a\\..\\b')).rejects.toThrow(BadRequestException);
      await expect(service.statObject('')).rejects.toThrow(BadRequestException);
    });
  });

  // ── Static-mount split ────────────────────────────────────────────────────

  it('exposes only image prefixes for public static hosting', () => {
    expect(service.publicImagePrefixes).toEqual(['art', 'originals/poster', 'originals/hero']);
    expect(
      service.publicImagePrefixes.some((p) => 'originals/video/x.mp4'.startsWith(`${p}/`)),
    ).toBe(false);
  });
});
