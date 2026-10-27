import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl as s3Url } from '@aws-sdk/s3-request-presigner';
import { getSignedUrl as cdnUrl } from '@aws-sdk/cloudfront-signer';

export const adaptivePrefix = (source: string) =>
  `hls/${createHash('sha256').update(source).digest('hex')}`;
const FILE = /^hls\/[a-f0-9]{64}\/[a-f0-9-]{36}\/[a-zA-Z0-9_-]+\.(m3u8|ts)$/;
const LIMIT = 2 * 1024 * 1024;
export type HlsScope = 'play' | 'prepare';

/** Originals remain playable until the encoder atomically publishes ready.json. */
@Injectable()
export class AdaptiveMediaService {
  private readonly s3: S3Client | null;
  private readonly bucket: string;
  private readonly root: string;
  private readonly api: string;
  private readonly secret: string;
  private readonly enabled: boolean;
  private readonly cdn: string;
  private readonly keyId: string;
  private readonly privateKey: string;
  private readonly playlistCache = new Map<string, string>();
  private playlistCacheBytes = 0;
  private readonly readyCache = new Map<string, { until: number; master: string | null }>();

  constructor(config: ConfigService) {
    this.enabled = config.get<boolean>('mediaHlsEnabled') ?? false;
    this.bucket =
      config.get<string>('mediaHlsBucket') || config.get<string>('mediaOriginalsBucket') || '';
    this.root = config.get<string>('mediaUploadsDir') ?? `${process.cwd()}/uploads`;
    this.api = (config.get<string>('apiPublicUrl') ?? 'http://localhost:4000').replace(/\/$/, '');
    this.secret =
      config.get<string>('mediaSigningSecret') || config.get<string>('jwt.secret') || 'dev-only';
    this.cdn = (config.get<string>('mediaHlsCdnUrl') ?? '').replace(/\/$/, '');
    this.keyId = config.get<string>('mediaHlsKeyPairId') ?? '';
    this.privateKey = (config.get<string>('mediaHlsPrivateKey') ?? '').replace(/\\n/g, '\n');
    const id = config.get<string>('mediaStorageAccessKeyId');
    const secret = config.get<string>('mediaStorageSecretAccessKey');
    this.s3 = this.bucket
      ? new S3Client({
          region: config.get<string>('mediaStorageRegion') || 'auto',
          endpoint: config.get<string>('mediaStorageEndpoint') || undefined,
          credentials: id && secret ? { accessKeyId: id, secretAccessKey: secret } : undefined,
          requestHandler: { connectionTimeout: 1000, requestTimeout: 3000 },
        })
      : null;
  }

  get localRoot() {
    return this.root;
  }

  async playbackUrl(
    source: string,
    user: string,
    expiresAt: string | null,
    scope: HlsScope = 'play',
  ): Promise<string | null> {
    if (!this.enabled || !/^originals\/(video|trailer)\/[\w-]+\.(mp4|mov|webm)$/.test(source))
      return null;
    const prefix = adaptivePrefix(source);
    let ready = this.readyCache.get(prefix);
    if (!ready || ready.until < Date.now()) {
      let master: string | null = null;
      try {
        const marker = JSON.parse(await this.readText(`${prefix}/ready.json`)) as {
          version?: number;
          masterKey?: string;
        };
        if (
          marker.version === 1 &&
          marker.masterKey?.startsWith(`${prefix}/`) &&
          FILE.test(marker.masterKey) &&
          marker.masterKey.endsWith('/master.m3u8')
        )
          master = marker.masterKey;
      } catch {
        /* Missing or temporarily unavailable rendition: keep the original. */
      }
      ready = { until: Date.now() + 30_000, master };
      if (this.readyCache.size >= 512) this.readyCache.delete(this.readyCache.keys().next().value!);
      this.readyCache.set(prefix, ready);
    }
    if (!ready.master) return null;
    const ceiling = expiresAt ? Date.parse(expiresAt) : Date.now() + 14_400_000;
    const expires = Math.min(ceiling, Date.now() + (scope === 'prepare' ? 120_000 : 14_400_000));
    if (!Number.isFinite(expires) || expires <= Date.now()) return null;
    // Preparation exposes only a short, low-bitrate opening segment, never a full playlist.
    const key =
      scope === 'prepare' ? ready.master.replace('/master.m3u8', '/360p.m3u8') : ready.master;
    return this.signedUrl(key, user, expires, scope);
  }

  private signature(key: string, user: string, expires: number, scope: HlsScope) {
    return createHmac('sha256', this.secret)
      .update(`hls:${scope}:${key}:${user}:${expires}`)
      .digest('hex');
  }

  signedUrl(key: string, user: string, expires: number, scope: HlsScope = 'play'): string {
    if (!FILE.test(key)) throw new NotFoundException('Invalid HLS object');
    const sig = this.signature(key, user, expires, scope);
    return `${this.api}/v1/media/${key}?u=${encodeURIComponent(user)}&expires=${expires}&scope=${scope}&sig=${sig}`;
  }

  verify(
    key: string,
    user: string,
    expires: number,
    scope: string,
    sig: string,
  ): asserts scope is HlsScope {
    if (
      !FILE.test(key) ||
      !user ||
      !Number.isSafeInteger(expires) ||
      expires <= Date.now() ||
      !['play', 'prepare'].includes(scope)
    )
      throw new UnauthorizedException('Expired or invalid HLS request');
    if (scope === 'prepare' && !key.endsWith('/360p.m3u8'))
      throw new UnauthorizedException('Invalid preparation request');
    const expected = Buffer.from(this.signature(key, user, expires, scope as HlsScope));
    const supplied = Buffer.from(sig ?? '');
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied))
      throw new UnauthorizedException('Invalid HLS signature');
  }

  /** Rewrite every child URI; relative URLs do NOT inherit playlist signatures. */
  async playlist(key: string, user: string, expires: number, scope: HlsScope): Promise<string> {
    const text = await this.readText(key);
    if (!text.startsWith('#EXTM3U')) throw new NotFoundException('Invalid playlist');
    const lines = text.trim().split(/\r?\n/);
    if (scope === 'prepare') {
      const index = lines.findIndex((line) => line.startsWith('#EXTINF:'));
      const duration = Number(lines[index]?.slice(8).split(',')[0]);
      const segment = lines[index + 1];
      if (
        index < 0 ||
        !Number.isFinite(duration) ||
        duration <= 0 ||
        duration > 6 ||
        !segment?.endsWith('.ts')
      )
        throw new NotFoundException('Preparation unavailable');
      const child = this.childKey(key, segment);
      // A short-lived token for ONE segment cannot be changed into another file.
      return `#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:${Math.ceil(duration)}\n#EXT-X-MEDIA-SEQUENCE:0\n${lines[index]}\n${await this.segmentUrl(child, user, expires)}\n#EXT-X-ENDLIST\n`;
    }
    // Sign one build-scoped CDN policy per playlist, not thousands of RSA
    // signatures on the first-frame path. Preparation never gets this policy.
    let cdnQuery: string | undefined;
    if (this.cdn && this.keyId && this.privateKey) {
      const directory = key.slice(0, key.lastIndexOf('/') + 1);
      const policy = JSON.stringify({
        Statement: [
          {
            Resource: `${this.cdn}/${directory}*`,
            Condition: { DateLessThan: { 'AWS:EpochTime': Math.floor(expires / 1000) } },
          },
        ],
      });
      cdnQuery = new URL(
        cdnUrl({
          url: `${this.cdn}/${key}`,
          keyPairId: this.keyId,
          privateKey: this.privateKey,
          policy,
        }),
      ).search;
    }
    return (
      (
        await Promise.all(
          lines.map(async (line) => {
            if (!line || line.startsWith('#')) {
              // This pipeline deliberately emits MPEG-TS, with no external key/init URI tags.
              if (/URI\s*=/.test(line)) throw new NotFoundException('Unsupported playlist URI');
              return line;
            }
            const child = this.childKey(key, line);
            return child.endsWith('.m3u8')
              ? this.signedUrl(child, user, expires)
              : cdnQuery
                ? `${this.cdn}/${child}${cdnQuery}`
                : this.segmentUrl(child, user, expires);
          }),
        )
      ).join('\n') + '\n'
    );
  }

  private childKey(parent: string, relative: string) {
    if (!/^[a-zA-Z0-9_-]+\.(m3u8|ts)$/.test(relative))
      throw new NotFoundException('Invalid playlist path');
    return parent.slice(0, parent.lastIndexOf('/') + 1) + relative;
  }

  private async segmentUrl(key: string, user: string, expires: number) {
    if (this.cdn && this.keyId && this.privateKey)
      return cdnUrl({
        url: `${this.cdn}/${key}`,
        keyPairId: this.keyId,
        privateKey: this.privateKey,
        dateLessThan: new Date(expires).toISOString(),
      });
    // The API verifies each request before any storage redirect.
    return this.signedUrl(key, user, expires);
  }

  async remoteSegmentUrl(key: string, expires: number): Promise<string | null> {
    if (!FILE.test(key) || !key.endsWith('.ts')) throw new NotFoundException('Invalid segment');
    return this.s3
      ? s3Url(this.s3, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
          expiresIn: Math.max(1, Math.min(14_400, Math.floor((expires - Date.now()) / 1000))),
        })
      : null;
  }

  private async readText(key: string): Promise<string> {
    const cached = this.playlistCache.get(key);
    if (cached) return cached;
    const text = await this.readStorageText(key);
    if (key.endsWith('.m3u8')) {
      const bytes = Buffer.byteLength(text);
      while (this.playlistCacheBytes + bytes > 8 * 1024 * 1024 && this.playlistCache.size) {
        const oldest = this.playlistCache.keys().next().value!;
        this.playlistCacheBytes -= Buffer.byteLength(this.playlistCache.get(oldest)!);
        this.playlistCache.delete(oldest);
      }
      if (!this.playlistCache.has(key)) {
        this.playlistCache.set(key, text);
        this.playlistCacheBytes += bytes;
      }
    }
    return text;
  }

  private async readStorageText(key: string): Promise<string> {
    if (this.s3) {
      const result = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      if (!result.Body || (result.ContentLength ?? LIMIT + 1) > LIMIT)
        throw new NotFoundException('Invalid playlist size');
      return result.Body.transformToString();
    }
    if ((await stat(join(this.root, key))).size > LIMIT)
      throw new NotFoundException('Invalid playlist size');
    return readFile(join(this.root, key), 'utf8');
  }
}
