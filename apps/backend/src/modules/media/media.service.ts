import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export interface PresignedUpload {
  enabled: boolean;
  /** S3 object key the client should reference after upload. */
  key: string;
  /** Presigned PUT URL (null when uploads aren't configured for local dev). */
  uploadUrl: string | null;
  /** Headers the client must send with the PUT. */
  headers: Record<string, string>;
}

/**
 * Media delivery + ingest. Uploads use a presigned S3 PUT against the originals
 * bucket (the Media stack's Lambda then transcodes/derives renditions).
 * Playback resolves an object key to a CDN URL — CloudFront-signed when key-pair
 * material is configured, otherwise the plain CDN URL (dev / public assets).
 */
@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);
  private readonly s3: S3Client;
  private readonly bucket: string;
  private readonly mediaBaseUrl: string;
  private readonly ttl: number;

  constructor(private readonly config: ConfigService) {
    this.s3 = new S3Client({ region: config.get<string>('region') });
    this.bucket = config.get<string>('mediaOriginalsBucket') ?? '';
    this.mediaBaseUrl = config.get<string>('mediaBaseUrl') ?? '';
    this.ttl = config.get<number>('mediaUrlTtl') ?? 14_400;
  }

  get uploadsEnabled(): boolean {
    return Boolean(this.bucket);
  }

  /** Presign a PUT for a video or image. `kind` namespaces the object key. */
  async presignUpload(kind: 'video' | 'poster' | 'hero', contentType: string): Promise<PresignedUpload> {
    const ext = extensionFor(contentType, kind);
    const key = `originals/${kind}/${randomUUID()}${ext}`;
    if (!this.uploadsEnabled) {
      // Local dev: no bucket. The UI falls back to entering an object key by hand.
      return { enabled: false, key, uploadUrl: null, headers: {} };
    }
    const uploadUrl = await getSignedUrl(
      this.s3,
      new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType }),
      { expiresIn: this.ttl },
    );
    return { enabled: true, key, uploadUrl, headers: { 'Content-Type': contentType } };
  }

  /**
   * Resolve a stored object key to a playback URL. CloudFront signing is added
   * here when CLOUDFRONT_KEY_PAIR_ID + private key are provisioned; until then we
   * serve via the CDN base URL so the player works end-to-end.
   */
  playbackUrl(key: string): string | null {
    if (!key) return null;
    if (/^https?:\/\//.test(key)) return key; // already an absolute URL
    if (!this.mediaBaseUrl) return null;
    return `${this.mediaBaseUrl}/${key}`;
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
