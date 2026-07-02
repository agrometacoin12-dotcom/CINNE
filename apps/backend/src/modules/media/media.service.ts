import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, join, normalize } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';
import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export interface PresignedUpload {
  enabled: boolean;
  /** S3 object key the client should reference after upload. */
  key: string;
  /** Presigned PUT URL (S3 in the cloud, the local upload route otherwise). */
  uploadUrl: string | null;
  /** Headers the client must send with the PUT. */
  headers: Record<string, string>;
}

/**
 * Media delivery + ingest with two symmetric drivers:
 *
 *  - **S3 / CloudFront** (cloud): presigned PUT to the originals bucket; the
 *    media Lambda publishes to the delivery bucket and playback resolves to
 *    `${MEDIA_BASE_URL}/${key}`.
 *  - **Local disk** (dev, or any deploy without S3): the "presigned" PUT is an
 *    HMAC-signed URL on this API; files land under `MEDIA_UPLOADS_DIR` and are
 *    served (with Range support) from `${API_PUBLIC_URL}/media/${key}`.
 *
 * Either way, every uploaded movie resolves to a playable URL — upload → watch
 * works end-to-end in all environments.
 */
@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);
  private readonly s3: S3Client;
  private readonly bucket: string;
  private readonly mediaBaseUrl: string;
  private readonly ttl: number;
  private readonly apiPublicUrl: string;
  private readonly uploadsDir: string;
  private readonly signingSecret: string;

  constructor(config: ConfigService) {
    this.s3 = new S3Client({ region: config.get<string>('region') });
    this.bucket = config.get<string>('mediaOriginalsBucket') ?? '';
    this.mediaBaseUrl = config.get<string>('mediaBaseUrl') ?? '';
    this.ttl = config.get<number>('mediaUrlTtl') ?? 14_400;
    this.apiPublicUrl = (config.get<string>('apiPublicUrl') ?? 'http://localhost:4000').replace(
      /\/$/,
      '',
    );
    this.uploadsDir = config.get<string>('mediaUploadsDir') ?? `${process.cwd()}/uploads`;
    this.signingSecret = config.get<string>('jwt.secret') ?? 'dev-only';
  }

  get uploadsEnabled(): boolean {
    return true; // S3 in the cloud, local disk everywhere else
  }

  private get s3Enabled(): boolean {
    return Boolean(this.bucket);
  }

  get localUploadsDir(): string {
    return this.uploadsDir;
  }

  /** Presign a PUT for a video or image. `kind` namespaces the object key. */
  async presignUpload(
    kind: 'video' | 'poster' | 'hero',
    contentType: string,
  ): Promise<PresignedUpload> {
    const ext = extensionFor(contentType, kind);
    const key = `originals/${kind}/${randomUUID()}${ext}`;

    if (this.s3Enabled) {
      const uploadUrl = await getSignedUrl(
        this.s3,
        new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType }),
        { expiresIn: this.ttl },
      );
      return { enabled: true, key, uploadUrl, headers: { 'Content-Type': contentType } };
    }

    // Local driver: HMAC-signed PUT against this API.
    const expires = Date.now() + this.ttl * 1000;
    const sig = this.sign(key, expires);
    const uploadUrl = `${this.apiPublicUrl}/v1/media/upload?key=${encodeURIComponent(key)}&expires=${expires}&sig=${sig}`;
    return { enabled: true, key, uploadUrl, headers: { 'Content-Type': contentType } };
  }

  /** Store a locally uploaded object (signed-URL PUT from the admin studio). */
  async saveLocal(key: string, expires: number, sig: string, body: Readable): Promise<void> {
    if (!key || key.includes('..') || key.startsWith('/')) {
      throw new BadRequestException('Invalid object key');
    }
    if (!Number.isFinite(expires) || Date.now() > expires) {
      throw new UnauthorizedException('Upload link expired');
    }
    const expected = this.sign(key, expires);
    const a = Buffer.from(expected);
    const b = Buffer.from(sig ?? '');
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException('Invalid upload signature');
    }

    const path = normalize(join(this.uploadsDir, key));
    if (!path.startsWith(normalize(this.uploadsDir))) {
      throw new BadRequestException('Invalid object key');
    }
    await mkdir(dirname(path), { recursive: true });
    await pipeline(body, createWriteStream(path));
    this.logger.log(`Stored local media ${key}`);
  }

  private sign(key: string, expires: number): string {
    return createHmac('sha256', this.signingSecret).update(`${key}:${expires}`).digest('hex');
  }

  /**
   * Resolve a stored object key to a playback/display URL. Absolute URLs pass
   * through; the CDN base is used when configured; otherwise the local media
   * route on this API serves the file (with HTTP Range support for video).
   */
  playbackUrl(key: string): string | null {
    if (!key) return null;
    if (/^https?:\/\//.test(key)) return key; // already an absolute URL
    if (this.mediaBaseUrl) return `${this.mediaBaseUrl}/${key}`;
    return `${this.apiPublicUrl}/media/${key}`;
  }
}

function extensionFor(contentType: string, kind: 'video' | 'poster' | 'hero'): string {
  const map: Record<string, string> = {
    'video/mp4': '.mp4',
    'video/quicktime': '.mov',
    'video/webm': '.webm',
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
  };
  return map[contentType] ?? (kind === 'video' ? '.mp4' : '.jpg');
}
