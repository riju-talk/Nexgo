import { randomUUID } from 'node:crypto';
import { DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../config.js';

// Object storage: AWS S3 on EC2 (credentials from the instance's IAM role) or any S3-compatible server such as MinIO
// (AWS_ENDPOINT_URL_S3 + AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY). Every bucket task goes through this module.

// An .env that lists a variable with no value would otherwise reach the SDK as an empty string and mask the IAM role.
for (const name of ['AWS_ENDPOINT_URL_S3', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN', 'AWS_REGION']) {
  if (process.env[name] === '') delete process.env[name];
}

export const STORAGE_NOT_CONNECTED = { error: 'FILE_STORAGE_NOT_CONNECTED', message: 'File storage is not connected yet; this will be available soon.' };

export function assertStorageEnabled() {
  if (!config.STORAGE_ENABLED) throw Object.assign(new Error('File storage is not connected yet'), { statusCode: 501 });
}

// A storage failure is answered as 503 with a seller-safe message; the real cause and the fix go to the log and the health check.
export class StorageError extends Error {
  statusCode = 503;
  expose = true;
  constructor(public reason: string, public hint: string) {
    super('File storage is temporarily unavailable. Try again in a moment.');
  }
}

function region() {
  return config.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'ap-southeast-2';
}

function explain(error: unknown) {
  const e = error as { name?: string; Code?: string; message?: string; $metadata?: { httpStatusCode?: number } };
  const name = e.name ?? e.Code ?? 'Error';
  const status = e.$metadata?.httpStatusCode;
  const message = e.message ?? String(error);
  let hint = 'Check the storage settings (STORAGE_BUCKET, AWS_REGION) and that this server can reach S3.';
  if (name === 'CredentialsProviderError' || /credential|could not load/i.test(message)) {
    hint = 'No AWS credentials found. Attach the IAM role to the EC2 instance and set its metadata hop limit to 2 (so Docker containers can read it), or set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY.';
  } else if (name === 'NoSuchBucket' || (status === 404 && name === 'NotFound')) {
    hint = `Bucket "${config.STORAGE_BUCKET}" was not found in region ${region()}. Check the bucket name and AWS_REGION.`;
  } else if (name === 'PermanentRedirect' || name === 'IncorrectEndpoint' || status === 301) {
    hint = `The bucket lives in another region than AWS_REGION=${region()}.`;
  } else if (name === 'AccessDenied' || name === 'Forbidden' || status === 403) {
    hint = `Access denied. Either no AWS credentials reached the app (attach the IAM role to the EC2 instance and set its metadata hop limit to 2) or the policy is too small for bucket "${config.STORAGE_BUCKET}". Allow s3:PutObject, s3:GetObject and s3:DeleteObject on arn:aws:s3:::${config.STORAGE_BUCKET}/* and s3:ListBucket on the bucket.`;
  } else if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|timed? ?out|EAI_AGAIN/i.test(`${name} ${message}`)) {
    hint = 'S3 could not be reached from this server: check outbound internet access (security group, route table) and DNS.';
  }
  return { reason: `${name}: ${message}`, hint };
}

let client: S3Client | undefined;
function s3() {
  // Path-style addressing is only needed for custom endpoints (MinIO); real S3 uses the normal bucket host name.
  client ??= new S3Client({ region: region(), forcePathStyle: Boolean(process.env.AWS_ENDPOINT_URL_S3), maxAttempts: 3, requestHandler: { connectionTimeout: 4000, requestTimeout: 20000 } });
  return client;
}

async function run<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const { reason, hint } = explain(error);
    console.error('Object storage request failed', { bucket: config.STORAGE_BUCKET, reason, hint });
    throw new StorageError(reason, hint);
  }
}

export const storage = {
  bucket: config.STORAGE_BUCKET,
  putObject: (key: string, body: Buffer, contentType: string) =>
    run(() => s3().send(new PutObjectCommand({ Bucket: config.STORAGE_BUCKET, Key: key, Body: body, ContentType: contentType }))),
  deleteObject: (key: string) => run(() => s3().send(new DeleteObjectCommand({ Bucket: config.STORAGE_BUCKET, Key: key }))),
  presignedGetObject: (key: string, expiresInSeconds: number) =>
    run(() => getSignedUrl(s3(), new GetObjectCommand({ Bucket: config.STORAGE_BUCKET, Key: key }), { expiresIn: expiresInSeconds })),
};

// Walks through every operation the app needs (find the bucket, write, read, delete) so a bad setup is named exactly.
export async function checkStorage() {
  const result = { enabled: config.STORAGE_ENABLED, bucket: config.STORAGE_BUCKET, region: region(), endpoint: process.env.AWS_ENDPOINT_URL_S3 ?? 'AWS S3', ok: false, failedStep: null as string | null, reason: null as string | null, hint: null as string | null };
  if (!config.STORAGE_ENABLED) return { ...result, failedStep: 'config', reason: 'STORAGE_ENABLED is not true', hint: 'Set STORAGE_ENABLED=true in .env and recreate the backend and worker containers.' };
  const key = `healthchecks/${randomUUID()}.txt`;
  const steps: [string, () => Promise<unknown>][] = [
    ['find bucket', () => s3().send(new HeadBucketCommand({ Bucket: config.STORAGE_BUCKET }))],
    ['write', () => s3().send(new PutObjectCommand({ Bucket: config.STORAGE_BUCKET, Key: key, Body: Buffer.from('nexgo storage check'), ContentType: 'text/plain' }))],
    ['read', async () => { const r = await s3().send(new GetObjectCommand({ Bucket: config.STORAGE_BUCKET, Key: key })); await r.Body?.transformToString(); }],
    ['delete', () => s3().send(new DeleteObjectCommand({ Bucket: config.STORAGE_BUCKET, Key: key }))],
  ];
  for (const [step, action] of steps) {
    try { await action(); } catch (error) { return { ...result, failedStep: step, ...explain(error) }; }
  }
  return { ...result, ok: true };
}
