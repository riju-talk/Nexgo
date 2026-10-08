import { Client } from 'minio';
import { config } from '../config.js';

export const storage = new Client({ endPoint: config.MINIO_ENDPOINT, port: config.MINIO_PORT, useSSL: config.MINIO_USE_SSL, accessKey: config.MINIO_ACCESS_KEY, secretKey: config.MINIO_SECRET_KEY });
let initialized = false;
export async function ensurePrivateBucket() {
  if (initialized) return;
  if (!(await storage.bucketExists(config.MINIO_BUCKET))) await storage.makeBucket(config.MINIO_BUCKET, 'us-east-1');
  initialized = true;
}
