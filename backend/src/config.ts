import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4010),
  DATABASE_URL: z.string().url(),
  FRONTEND_ORIGIN: z.string().url().default('http://localhost:3021'),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().max(30).default(7),
  COURIER_WEBHOOK_SECRET: z.string().min(32).optional(),
  MINIO_ENDPOINT: z.string().default('localhost'),
  MINIO_PORT: z.coerce.number().int().positive().default(9000),
  MINIO_ACCESS_KEY: z.string().default('nexgo_local'),
  MINIO_SECRET_KEY: z.string().default('nexgo_local_only_change_me'),
  MINIO_BUCKET: z.string().default('nexgo-private'),
  // 32-byte AES-256 key, base64-encoded. Local dev only — production uses
  // per-record envelope encryption via AWS KMS instead of a static key.
  LOCAL_ENCRYPTION_KEY: z.string().min(1),
  ENCRYPTION_KEY: z.string().min(64).optional(), // 32-byte hex key for bank account encryption
  // Optional: unset means "use the deterministic mock gateway," the same
  // pattern as the mock courier adapter. Set all three once real Razorpay
  // test-mode credentials exist.
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().default('local-development-razorpay-webhook-secret'),
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().int().positive().default(1025),
});

export const config = schema.parse(process.env);

// The defaults above are committed to the repo, so they are public. Refuse to
// boot a production process that is still relying on any of them — an unset
// RAZORPAY_WEBHOOK_SECRET would let anyone forge wallet-credit webhooks.
if (config.NODE_ENV === 'production') {
  const publicDefaults: Array<[keyof typeof config, string]> = [
    ['MINIO_ACCESS_KEY', 'nexgo_local'],
    ['MINIO_SECRET_KEY', 'nexgo_local_only_change_me'],
    ['RAZORPAY_WEBHOOK_SECRET', 'local-development-razorpay-webhook-secret'],
  ];
  const insecure = publicDefaults.filter(([key, value]) => config[key] === value).map(([key]) => key);
  if (insecure.length) throw new Error(`Refusing to start in production with development defaults for: ${insecure.join(', ')}`);
}
