import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, stat, unlink } from 'node:fs/promises';
import { dirname, join, normalize, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Transform, type Readable } from 'node:stream';
import {
  BadRequestException,
  Injectable,
  Logger,
  PayloadTooLargeException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type UploadKind = 'video' | 'poster' | 'hero';

/** Per-kind Content-Type allowlist → file extension. Anything else is a 400. */
export const ALLOWED_CONTENT_TYPES: Record<UploadKind, Record<string, string>> = {
  video: {
    'video/mp4': '.mp4',
    'video/quicktime': '.mov',
    'video/webm': '.webm',
  },
  poster: {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
  },
  hero: {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
  },
};

/** Per-kind upload size caps (bytes): 8 GB for video, 20 MB for artwork. */
export const MAX_UPLOAD_BYTES: Record<UploadKind, number> = {
  video: 8 * 1024 ** 3,
  poster: 20 * 1024 ** 2,
  hero: 20 * 1024 ** 2,
};

export interface PresignedUpload {
  enabled: boolean;
  /** Object key the client should reference after upload. */
  key: string;
  /** HMAC-signed PUT URL on this API. */
  uploadUrl: string | null;
  /** Headers the client must send with the PUT (Content-Type is signed). */
  headers: Record<string, string>;
}

/**
 * Media ingest + delivery on the local-disk driver (production stores media on
 * the Railway `/data` volume via MEDIA_UPLOADS_DIR):
 *
 *  - **Ingest**: the "presigned" PUT is an HMAC-signed URL on this API. The
 *    signature covers key + Content-Type + expiry, uploads are allowlisted per
 *    kind and size-capped while streaming to disk.
 *  - **Images** (posters/hero art, incl. bundled seed art under `art/`) are
 *    public and served by the express static mounts in `main.ts`.
 *  - **Videos** are NEVER exposed via static hosting. They are only reachable
 *    through `GET /v1/media/stream?key&expires&sig` — a short-lived HMAC URL
 *    minted per playback session by {@link playbackUrl} — served with HTTP
 *    Range support (AVPlayer / <video> seek).
 */
@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);
  private readonly ttl: number;
  private readonly apiPublicUrl: string;
  private readonly uploadsDir: string;
  private readonly signingSecret: string;
  private readonly mediaBaseUrl: string;

  constructor(config: ConfigService) {
    this.mediaBaseUrl = (config.get<string>('mediaBaseUrl') ?? '').replace(/\/$/, '');
    this.ttl = config.get<number>('mediaUrlTtl') ?? 14_400;
    this.apiPublicUrl = (config.get<string>('apiPublicUrl') ?? 'http://localhost:4000').replace(
      /\/$/,
      '',
    );
    this.uploadsDir = config.get<string>('mediaUploadsDir') ?? `${process.cwd()}/uploads`;
    // Dedicated media HMAC secret; falls back to JWT_SECRET when unset.
    this.signingSecret =
      config.get<string>('mediaSigningSecret') || config.get<string>('jwt.secret') || 'dev-only';
  }

  get uploadsEnabled(): boolean {
    return true; // local-disk driver is always available
  }

  get localUploadsDir(): string {
    return this.uploadsDir;
  }

  /**
   * Key prefixes that are safe to serve as public static assets (images only).
   * `main.ts` mounts exactly these under `/media/…`; video keys live under
   * `originals/video/` and are deliberately NOT in this list.
   */
  get publicImagePrefixes(): string[] {
    return ['art', 'originals/poster', 'originals/hero'];
  }

  /** Presign a PUT for a video or image. `kind` namespaces the object key. */
  async presignUpload(kind: UploadKind, contentType: string): Promise<PresignedUpload> {
    const allowed = ALLOWED_CONTENT_TYPES[kind];
    const ext = allowed?.[contentType];
    if (!ext) {
      throw new BadRequestException(
        `Unsupported Content-Type "${contentType}" for ${kind} uploads. ` +
          `Accepted: ${Object.keys(allowed ?? {}).join(', ')}`,
      );
    }

    const key = `originals/${kind}/${randomUUID()}${ext}`;
    const expires = Date.now() + this.ttl * 1000;
    // Content-Type is part of the signature: the PUT must arrive with the
    // exact type that was presigned, or the signature check fails.
    const sig = this.signUpload(key, contentType, expires);
    const uploadUrl = `${this.apiPublicUrl}/v1/media/upload?key=${encodeURIComponent(key)}&expires=${expires}&sig=${sig}`;
    return { enabled: true, key, uploadUrl, headers: { 'Content-Type': contentType } };
  }

  /**
   * Store a signed-URL PUT from the admin studio. Verifies expiry + HMAC
   * (which covers the incoming Content-Type), enforces the per-kind byte cap
   * while streaming, and unlinks any partial file on failure.
   */
  async saveLocal(
    key: string,
    expires: number,
    sig: string,
    body: Readable,
    contentType: string,
    declaredLength?: number,
  ): Promise<void> {
    const path = this.resolveKey(key);
    if (!Number.isFinite(expires) || Date.now() > expires) {
      throw new UnauthorizedException('Upload link expired');
    }
    // The signature covers the Content-Type, so a tampered/missing/mismatched
    // Content-Type header fails here exactly like a tampered key would.
    this.verifySignature(this.signUpload(key, contentType ?? '', expires), sig);

    const kind = kindOfKey(key);
    const maxBytes = MAX_UPLOAD_BYTES[kind];
    if (declaredLength !== undefined && declaredLength > maxBytes) {
      throw new PayloadTooLargeException(
        `${kind} uploads are limited to ${maxBytes} bytes (got Content-Length ${declaredLength})`,
      );
    }

    await mkdir(dirname(path), { recursive: true });

    // Byte-counting guard: clients can lie about (or omit) Content-Length, so
    // the cap is enforced on the actual bytes; overflow aborts the pipeline.
    let received = 0;
    const capGuard = new Transform({
      transform(chunk: Buffer, _enc, cb) {
        received += chunk.length;
        if (received > maxBytes) {
          cb(new PayloadTooLargeException(`${kind} uploads are limited to ${maxBytes} bytes`));
          return;
        }
        cb(null, chunk);
      },
    });

    try {
      await pipeline(body, capGuard, createWriteStream(path));
    } catch (err) {
      await unlink(path).catch(() => undefined); // remove the partial file
      if (err instanceof PayloadTooLargeException) throw err;
      throw new BadRequestException('Upload failed before completion');
    }
    this.logger.log(`Stored local media ${key} (${received} bytes)`);
  }

  /**
   * Validate a signed stream request (expiry + HMAC) and return the absolute
   * on-disk path of the object. Throws 401 on bad/expired signatures.
   *
   * The signature is bound to the entitled `userId` (carried in the `u` query
   * param): a URL minted for user A fails verification if `u` is swapped to
   * another user or dropped, so a copied stream URL can't be replayed under a
   * different identity within its TTL (CT-05).
   */
  verifyStreamRequest(key: string, expires: number, sig: string, userId: string): string {
    const path = this.resolveKey(key);
    if (!Number.isFinite(expires) || Date.now() > expires) {
      throw new UnauthorizedException('Stream link expired');
    }
    this.verifySignature(this.signStream(key, userId, expires), sig);
    return path;
  }

  /** Existence/size probe for a stored object (admin verification surface). */
  async statObject(key: string): Promise<{ exists: boolean; size: number }> {
    const path = this.resolveKey(key);
    try {
      const st = await stat(path);
      return { exists: st.isFile(), size: st.isFile() ? st.size : 0 };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { exists: false, size: 0 };
      throw err;
    }
  }

  /**
   * Resolve a stored object key to a playback URL for `userId`. Absolute URLs
   * pass through (externally hosted trailers etc.); everything else gets a
   * short-lived HMAC-signed URL on the streaming route (TTL = MEDIA_URL_TTL),
   * served with HTTP Range support for AVPlayer / <video> seeking.
   *
   * The requesting user's id is carried as the signed `u` query param and folded
   * into the HMAC, binding the URL to that viewer (CT-05): a leaked URL can't be
   * replayed under a different `u` without breaking the signature. Clients treat
   * the whole URL as opaque, so this needs no player-side change.
   */
  playbackUrl(key: string, userId: string): string | null {
    if (!key) return null;
    if (/^https?:\/\//.test(key)) return key; // already an absolute URL
    const expires = Date.now() + this.ttl * 1000;
    const sig = this.signStream(key, userId, expires);
    return `${this.apiPublicUrl}/v1/media/stream?key=${encodeURIComponent(key)}&u=${encodeURIComponent(userId)}&expires=${expires}&sig=${sig}`;
  }

  /**
   * Public, non-expiring URL for IMAGE keys (posters/hero art) served by the
   * static mounts (or the CDN when MEDIA_BASE_URL is set). Mirrors
   * CatalogueService's poster resolution so every surface hands out the same
   * cacheable image URLs. Never use this for video keys — those must go
   * through {@link playbackUrl}.
   */
  publicUrl(key: string): string | null {
    if (!key) return null;
    if (/^https?:\/\//.test(key)) return key; // already an absolute URL
    if (this.mediaBaseUrl) return `${this.mediaBaseUrl}/${key}`;
    return `${this.apiPublicUrl}/media/${key}`;
  }

  // MARK: - Internals

  /** Map a key to its on-disk path, rejecting traversal/absolute keys. */
  private resolveKey(key: string): string {
    if (
      !key ||
      key.includes('..') ||
      key.includes('\0') ||
      key.startsWith('/') ||
      key.includes('\\')
    ) {
      throw new BadRequestException('Invalid object key');
    }
    const root = normalize(this.uploadsDir);
    const path = normalize(join(root, key));
    if (path !== root && !path.startsWith(root.endsWith(sep) ? root : root + sep)) {
      throw new BadRequestException('Invalid object key');
    }
    if (path === root) throw new BadRequestException('Invalid object key');
    return path;
  }

  private verifySignature(expected: string, provided: string): void {
    const a = Buffer.from(expected);
    const b = Buffer.from(provided ?? '');
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException('Invalid media signature');
    }
  }

  /** Upload HMAC — domain-separated and bound to key + Content-Type + expiry. */
  private signUpload(key: string, contentType: string, expires: number): string {
    return createHmac('sha256', this.signingSecret)
      .update(`upload:${key}:${contentType}:${expires}`)
      .digest('hex');
  }

  /** Stream HMAC — domain-separated and bound to key + userId + expiry. */
  private signStream(key: string, userId: string, expires: number): string {
    return createHmac('sha256', this.signingSecret)
      .update(`stream:${key}:${userId}:${expires}`)
      .digest('hex');
  }
}

/** Derive the upload kind from the namespaced object key. */
function kindOfKey(key: string): UploadKind {
  if (key.startsWith('originals/video/')) return 'video';
  if (key.startsWith('originals/poster/')) return 'poster';
  if (key.startsWith('originals/hero/')) return 'hero';
  throw new BadRequestException('Unknown object key namespace');
}
