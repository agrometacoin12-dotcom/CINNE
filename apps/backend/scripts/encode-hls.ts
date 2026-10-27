/** Offline worker. Run on a CPU worker, never in a playback request. */
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, mkdtemp, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import {
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

const root = process.env.MEDIA_UPLOADS_DIR || join(process.cwd(), 'uploads');
const sourceBucket = process.env.MEDIA_ORIGINALS_BUCKET || '';
const targetBucket = process.env.MEDIA_HLS_BUCKET || sourceBucket;
const id = process.env.MEDIA_STORAGE_ACCESS_KEY_ID;
const secret = process.env.MEDIA_STORAGE_SECRET_ACCESS_KEY;
const s3 = sourceBucket
  ? new S3Client({
      region: process.env.MEDIA_STORAGE_REGION || process.env.AWS_REGION || 'auto',
      endpoint: process.env.MEDIA_STORAGE_ENDPOINT || undefined,
      credentials: id && secret ? { accessKeyId: id, secretAccessKey: secret } : undefined,
    })
  : null;
const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';
const ffprobe = process.env.FFPROBE_PATH || 'ffprobe';
class UnsupportedSourceError extends Error {}
const unsupportedSources = new Map<string, string>();

function run(command: string, args: string[], cwd?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '',
      errors = '';
    child.stdout.on('data', (b) => {
      output = (output + b.toString()).slice(-2_000_000);
    });
    child.stderr.on('data', (b) => {
      errors = (errors + b.toString()).slice(-8_000);
    });
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0 ? resolve(output) : reject(new Error(`${command} failed (${code}): ${errors}`)),
    );
  });
}

async function encode(key: string) {
  if (!/^originals\/(video|trailer)\/[\w-]+\.(mp4|mov|webm)$/.test(key))
    throw new Error('Expected a stored video object key');
  const prefix = `hls/${createHash('sha256').update(key).digest('hex')}`;
  const source = s3
    ? await s3.send(new HeadObjectCommand({ Bucket: sourceBucket, Key: key }))
    : await stat(join(root, key)).then((s) => ({
        ETag: `${s.size}:${s.mtimeMs}`,
        ContentLength: s.size,
      }));
  const limit = key.startsWith('originals/trailer/') ? 2 * 1024 ** 3 : 8 * 1024 ** 3;
  if (!source.ContentLength || source.ContentLength > limit)
    throw new Error('Video exceeds the supported source size');
  const fingerprint = source.ETag;
  if (!fingerprint) throw new Error('Source fingerprint unavailable');
  if (unsupportedSources.get(key) === fingerprint) return;
  try {
    const ready = s3
      ? await (
          await s3.send(new GetObjectCommand({ Bucket: targetBucket, Key: `${prefix}/ready.json` }))
        ).Body!.transformToString()
      : await readFile(join(root, prefix, 'ready.json'), 'utf8');
    const marker = JSON.parse(ready);
    if (marker.version === 1 && marker.sourceFingerprint === fingerprint) {
      console.log(`Already encoded: ${key}`);
      return;
    }
  } catch (error) {
    const e = error as { code?: string; name?: string; $metadata?: { httpStatusCode?: number } };
    if (e.code !== 'ENOENT' && e.name !== 'NoSuchKey' && e.$metadata?.httpStatusCode !== 404)
      throw error;
  }
  const work = await mkdtemp(join(tmpdir(), 'ct-hls-'));
  const build = randomUUID();
  const output = join(work, 'output');
  await mkdir(output);
  try {
    let input = join(root, key);
    if (s3) {
      input = join(work, 'source');
      const object = await s3.send(
        new GetObjectCommand({ Bucket: sourceBucket, Key: key, IfMatch: fingerprint }),
      );
      if (!object.Body) throw new Error('Source body missing');
      await pipeline(object.Body as NodeJS.ReadableStream, createWriteStream(input));
    }
    const metadata = JSON.parse(
      await run(ffprobe, ['-v', 'error', '-show_streams', '-of', 'json', input]),
    );
    const video = metadata.streams.find((s: { codec_type: string }) => s.codec_type === 'video');
    if (!video || !video.width || !video.height) throw new Error('No video stream');
    const audioCount = metadata.streams.filter(
      (s: { codec_type: string }) => s.codec_type === 'audio',
    ).length;
    if (
      audioCount > 1 ||
      metadata.streams.some((s: { codec_type: string }) => s.codec_type === 'subtitle') ||
      ['smpte2084', 'arib-std-b67'].includes(video.color_transfer)
    ) {
      throw new UnsupportedSourceError(
        'Multi-audio, embedded subtitles or HDR require a separate encoding profile; original playback retained',
      );
    }
    const [sarNumerator, sarDenominator] = String(video.sample_aspect_ratio || '1:1')
      .split(':')
      .map(Number);
    const sar = sarNumerator && sarDenominator ? sarNumerator / sarDenominator : 1;
    let displayWidth = video.width * sar,
      displayHeight = video.height;
    const rotation = Number(
      video.side_data_list?.find((s: { rotation?: number }) => s.rotation !== undefined)
        ?.rotation ??
        video.tags?.rotate ??
        0,
    );
    if (Math.abs(rotation % 180) === 90)
      [displayWidth, displayHeight] = [displayHeight, displayWidth];
    const frameRate = String(video.avg_frame_rate || video.r_frame_rate || '24/1');
    const [numerator, denominator] = frameRate.split('/').map(Number);
    const sourceFps = numerator! / (denominator || 1);
    const fps = Number.isFinite(sourceFps) && sourceFps > 0 && sourceFps <= 30 ? sourceFps : 30;
    const rate = fps === sourceFps ? frameRate : '30';
    const hasAudio = metadata.streams.some((s: { codec_type: string }) => s.codec_type === 'audio');
    const variants = [
      { name: '360p', width: 640, height: 360, bitrate: 700 },
      { name: '720p', width: 1280, height: 720, bitrate: 2200 },
      { name: '1080p', width: 1920, height: 1080, bitrate: 4500 },
    ].filter((v, i) => i === 0 || displayHeight >= v.height);
    const master = ['#EXTM3U', '#EXT-X-VERSION:3', '#EXT-X-INDEPENDENT-SEGMENTS'];
    for (const v of variants) {
      // Keep aspect ratio, even dimensions, no upscale; CFR/GOP gives aligned 4s boundaries.
      const scale = Math.min(1, v.width / displayWidth, v.height / displayHeight);
      const width = Math.max(2, Math.floor((displayWidth * scale) / 2) * 2);
      const height = Math.max(2, Math.floor((displayHeight * scale) / 2) * 2);
      await run(
        ffmpeg,
        [
          '-nostdin',
          '-y',
          '-i',
          input,
          '-map',
          '0:v:0',
          ...(hasAudio ? ['-map', '0:a:0'] : ['-an']),
          '-vf',
          `scale=${width}:${height},setsar=1`,
          '-r',
          rate,
          '-c:v',
          'libx264',
          '-preset',
          'fast',
          '-profile:v',
          'main',
          '-pix_fmt',
          'yuv420p',
          '-b:v',
          `${v.bitrate}k`,
          '-maxrate',
          `${Math.round(v.bitrate * 1.1)}k`,
          '-bufsize',
          `${v.bitrate * 2}k`,
          '-g',
          String(Math.round(fps * 4)),
          '-keyint_min',
          String(Math.round(fps * 4)),
          '-sc_threshold',
          '0',
          '-force_key_frames',
          'expr:gte(t,n_forced*4)',
          ...(hasAudio ? ['-c:a', 'aac', '-b:a', '96k', '-ac', '2', '-ar', '48000'] : []),
          '-f',
          'hls',
          '-hls_time',
          '4',
          '-hls_playlist_type',
          'vod',
          '-hls_flags',
          'independent_segments',
          '-hls_segment_filename',
          `${v.name}_%06d.ts`,
          `${v.name}.m3u8`,
        ],
        output,
      );
      const playlist = await readFile(join(output, `${v.name}.m3u8`), 'utf8');
      if (!playlist.includes('#EXT-X-ENDLIST') || !playlist.includes('#EXTINF:')) {
        throw new Error(`Encoder produced no playable ${v.name} segments`);
      }
      master.push(
        `#EXT-X-STREAM-INF:BANDWIDTH=${Math.ceil((v.bitrate * 1.1 + 128) * 1000)},RESOLUTION=${width}x${height}`,
        `${v.name}.m3u8`,
      );
    }
    await writeFile(join(output, 'master.m3u8'), master.join('\n') + '\n');
    // Publish all immutable objects first. Only ready.json switches readers to a complete build.
    const buildPrefix = `${prefix}/${build}`;
    if (s3) {
      for (const file of await readdir(output)) {
        await s3.send(
          new PutObjectCommand({
            Bucket: targetBucket,
            Key: `${buildPrefix}/${file}`,
            Body: createReadStream(join(output, file)),
            ContentLength: (await stat(join(output, file))).size,
            ContentType: file.endsWith('.ts') ? 'video/mp2t' : 'application/vnd.apple.mpegurl',
            CacheControl: 'public, max-age=31536000, immutable',
          }),
        );
      }
    } else {
      await mkdir(join(root, prefix), { recursive: true });
      // copyFile via cp supports a temporary directory on a different filesystem.
      const { cp } = await import('node:fs/promises');
      await cp(output, join(root, buildPrefix), { recursive: true });
    }
    // Refuse to publish if a mutable source was replaced while it was encoding.
    const current = s3
      ? (await s3.send(new HeadObjectCommand({ Bucket: sourceBucket, Key: key }))).ETag
      : await stat(join(root, key)).then((s) => `${s.size}:${s.mtimeMs}`);
    if (current !== fingerprint) throw new Error('Source changed during encoding; retry');
    const marker = JSON.stringify({
      version: 1,
      masterKey: `${buildPrefix}/master.m3u8`,
      sourceFingerprint: fingerprint,
    });
    if (s3)
      await s3.send(
        new PutObjectCommand({
          Bucket: targetBucket,
          Key: `${prefix}/ready.json`,
          Body: marker,
          ContentType: 'application/json',
          CacheControl: 'no-store',
        }),
      );
    else {
      const temporary = join(root, prefix, `ready-${build}.tmp`);
      await writeFile(temporary, marker);
      await rename(temporary, join(root, prefix, 'ready.json'));
    }
    console.log(`Encoded: ${key} (${variants.length} renditions)`);
  } catch (error) {
    if (error instanceof UnsupportedSourceError) {
      if (unsupportedSources.size >= 1024)
        unsupportedSources.delete(unsupportedSources.keys().next().value!);
      unsupportedSources.set(key, fingerprint);
    }
    throw error;
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

async function keys(): Promise<string[]> {
  const result: string[] = [];
  for (const prefix of ['originals/video/', 'originals/trailer/']) {
    if (s3) {
      let cursor: string | undefined;
      do {
        const page = await s3.send(
          new ListObjectsV2Command({
            Bucket: sourceBucket,
            Prefix: prefix,
            ContinuationToken: cursor,
          }),
        );
        result.push(...(page.Contents ?? []).flatMap((o) => (o.Key ? [o.Key] : [])));
        cursor = page.NextContinuationToken;
      } while (cursor);
    } else {
      try {
        result.push(...(await readdir(join(root, prefix))).map((file) => prefix + file));
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
      }
    }
  }
  return result.filter((key) => /^originals\/(video|trailer)\/[\w-]+\.(mp4|mov|webm)$/.test(key));
}

async function main() {
  const arg = process.argv[2];
  if (!arg) throw new Error('Usage: encode-hls.ts <originals/video/key.mp4 | --all | --watch>');
  do {
    const work = arg.startsWith('--') ? await keys() : [arg];
    if (arg.startsWith('--') && !['--all', '--watch'].includes(arg))
      throw new Error('Unknown option');
    for (const key of work) {
      try {
        await encode(key);
      } catch (error) {
        if (arg !== '--watch') throw error;
        console.error(
          `Encoding failed for ${key}:`,
          error instanceof Error ? error.message : 'unknown error',
        );
      }
    }
    if (arg === '--watch') await new Promise((resolve) => setTimeout(resolve, 60_000));
  } while (arg === '--watch');
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
