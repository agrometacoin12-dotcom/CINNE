/**
 * Media publish Lambda.
 *
 * Trigger: EventBridge "Object Created" on the originals (private) bucket.
 * Action:  server-side copy the uploaded object into the delivery bucket at the
 *          SAME key, so CloudFront serves exactly what the admin uploaded
 *          (video masters, posters, hero art). The admin stores the object key;
 *          playback resolves it to `${CDN}/${key}` which now exists in delivery.
 *
 * Pure JS (no native deps) so it bundles locally without Docker.
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
