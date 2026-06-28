/**
 * Media optimizer Lambda.
 *
 * Trigger: EventBridge "Object Created" on the originals bucket.
 * Action:  read the original image, produce optimized WebP variants
 *          (poster + hero sizes), and write them to the delivery bucket so
 *          CloudFront serves lightweight, correctly-sized assets.
 *
 * Keys:    originals/<id>/source.<ext>  →  <id>/poster.webp, <id>/hero.webp
 */
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import sharp from 'sharp';

const s3 = new S3Client({});
const DELIVERY_BUCKET = process.env.DELIVERY_BUCKET!;

interface EventBridgeS3Event {
  detail: { bucket: { name: string }; object: { key: string } };
}

const VARIANTS: { name: string; width: number; height: number }[] = [
  { name: 'poster', width: 400, height: 600 },
  { name: 'hero', width: 1600, height: 900 },
];

async function streamToBuffer(body: unknown): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of body as AsyncIterable<Buffer>) chunks.push(chunk);
  return Buffer.concat(chunks);
}

export const handler = async (event: EventBridgeS3Event): Promise<void> => {
  const bucket = event.detail.bucket.name;
  const key = decodeURIComponent(event.detail.object.key.replace(/\+/g, ' '));

  // Derive an id namespace from the source key (e.g. "originals/<id>/source.jpg").
  const parts = key.split('/');
  const id = parts.length >= 2 ? parts[parts.length - 2] : parts[0].replace(/\.[^.]+$/, '');

  const original = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const input = await streamToBuffer(original.Body);

  await Promise.all(
    VARIANTS.map(async (variant) => {
      const output = await sharp(input)
        .resize(variant.width, variant.height, { fit: 'cover' })
        .webp({ quality: 82 })
        .toBuffer();

      await s3.send(
        new PutObjectCommand({
          Bucket: DELIVERY_BUCKET,
          Key: `${id}/${variant.name}.webp`,
          Body: output,
          ContentType: 'image/webp',
          CacheControl: 'public, max-age=31536000, immutable',
        }),
      );
    }),
  );

  console.log(`Optimized ${key} → ${id}/{poster,hero}.webp`);
};
