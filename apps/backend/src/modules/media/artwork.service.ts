import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { access, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { MediaService } from './media.service';

const MAX_BYTES = 20 * 1024 * 1024;

/** Display derivatives only: originals and protected video are never modified. */
@Injectable()
export class ArtworkService {
  private readonly pending = new Map<string, Promise<string>>();

  constructor(private readonly media: MediaService) {}

  async file(key: string): Promise<string> {
    this.media.assertPublicImageKey(key);
    const directory = join(this.media.localUploadsDir, '.artwork-cache');
    const path = join(directory, createHash('sha256').update(`v1:${key}`).digest('hex') + '.jpg');
    try { await access(path); return path; } catch { /* cold cache */ }
    const existing = this.pending.get(key);
    if (existing) return existing;
    // Bound native decoding and download memory during a burst of cache misses.
    if (this.pending.size >= 4) throw new ServiceUnavailableException('Artwork is warming');
    const work = this.generate(key, directory, path).finally(() => this.pending.delete(key));
    this.pending.set(key, work);
    return work;
  }

  private async generate(key: string, directory: string, path: string): Promise<string> {
    const remote = await this.media.remoteReadUrl(key);
    let input: Buffer;
    if (remote) {
      const response = await fetch(remote, { signal: AbortSignal.timeout(20000) });
      if (!response.ok || !response.body) throw new Error('Artwork source unavailable');
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const next = await reader.read();
          if (next.done) break;
          size += next.value.byteLength;
          if (size > MAX_BYTES) throw new Error('Artwork exceeds size limit');
          chunks.push(next.value);
        }
      } finally { await reader.cancel(); }
      input = Buffer.concat(chunks);
    } else {
      const source = join(this.media.localUploadsDir, key);
      if ((await stat(source)).size > MAX_BYTES) throw new Error('Artwork exceeds size limit');
      input = await readFile(source);
    }
    const width = key.startsWith('originals/poster/') ? 640 : 1600;
    const output = await sharp(input, { limitInputPixels: 40_000_000 })
      .rotate().resize({ width, height: 2400, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#101010' }).jpeg({ quality: 82, progressive: true }).toBuffer();
    await mkdir(directory, { recursive: true });
    const temporary = `${path}.${randomUUID()}.tmp`;
    try { await writeFile(temporary, output); await rename(temporary, path); }
    finally { await rm(temporary, { force: true }); }
    return path;
  }
}
