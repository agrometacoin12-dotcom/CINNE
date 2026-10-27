/**
 * Public artwork publisher. S3 Object Created events copy images to delivery
 * under the same key. Videos are handled only by the separate HLS worker and
 * protected CDN behaviors; never publish a raw video into the public path.
 */
import { CopyObjectCommand, S3Client } from '@aws-sdk/client-s3';

const s3 = new S3Client({});
const DELIVERY_BUCKET = process.env.DELIVERY_BUCKET!;

interface EventBridgeS3Event {
  detail: { bucket: { name: string }; object: { key: string } };
}

export const handler = async (event: EventBridgeS3Event): Promise<void> => {
  const bucket = event.detail.bucket.name;
  const key = decodeURIComponent(event.detail.object.key.replace(/\+/g, ' '));

  // Only artwork belongs on the public image distribution. Video is encoded
  // by the HLS worker and delivered through a protected CDN behavior.
  if (!/^(art|originals\/(poster|hero|still))\//.test(key)) return;

  await s3.send(
    new CopyObjectCommand({
      Bucket: DELIVERY_BUCKET,
      CopySource: `${bucket}/${encodeURIComponent(key).replace(/%2F/g, '/')}`,
      Key: key,
      MetadataDirective: 'COPY',
      CacheControl: 'public, max-age=31536000, immutable',
    }),
  );

  console.log(`Published ${bucket}/${key} → delivery/${key}`);
};
