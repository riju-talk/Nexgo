import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../config.js';

// Endpoint, region and credentials come from the standard AWS_ENDPOINT_URL / AWS_REGION /
// AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY variables; the bucket is created outside the app.
const s3 = new S3Client({ forcePathStyle: true });

export const storage = {
  bucket: config.STORAGE_BUCKET,
  async putObject(key: string, body: Buffer, contentType: string) {
    await s3.send(new PutObjectCommand({ Bucket: config.STORAGE_BUCKET, Key: key, Body: body, ContentType: contentType }));
  },
  presignedGetObject(key: string, expiresInSeconds: number) {
    return getSignedUrl(s3, new GetObjectCommand({ Bucket: config.STORAGE_BUCKET, Key: key }), { expiresIn: expiresInSeconds });
  },
};
