import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4010),
  // Hardcoded Neon test database for the client demo (taken down after review); DATABASE_URL overrides it.
  DATABASE_URL: z.string().url().default('postgresql://neondb_owner:npg_VmdTLxel69oI@ep-noisy-waterfall-b436g5m8.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require'),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(50).default(process.env.VERCEL ? 3 : 12),
  STRICT_SECRETS: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  FRONTEND_ORIGIN: z.string().url().default(process.env.VERCEL ? 'https://nexgo-beta.vercel.app' : 'http://localhost:3021'),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().max(30).default(7),
  COURIER_WEBHOOK_SECRET: z.string().min(32).optional(),
  MINIO_ENDPOINT: z.string().default('localhost'),
  MINIO_PORT: z.coerce.number().int().positive().default(9000),
  MINIO_ACCESS_KEY: z.string().default('nexgo_local'),
  MINIO_SECRET_KEY: z.string().default('nexgo_local_only_change_me'),
  // Label/invoice PDFs need an S3-compatible bucket. Until one is connected the file endpoints answer 501 instead of failing.
  STORAGE_ENABLED: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  MINIO_USE_SSL: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  MINIO_BUCKET: z.string().default('nexgo-private'),
  // 32-byte AES-256 key, base64-encoded. Local dev only — production uses
  // per-record envelope encryption via AWS KMS instead of a static key.
  // DEMO ONLY default so a test-data deployment boots with just DATABASE_URL. Set a real key (and STRICT_SECRETS=true) before holding real data.
  LOCAL_ENCRYPTION_KEY: z.string().min(1).default('ZGVtby1vbmx5LWtleS1ub3QtZm9yLXJlYWwtZGF0YSE='),
  ENCRYPTION_KEY: z.string().min(64).default('64656d6f2d6f6e6c792d6b65792d6e6f742d666f722d7265616c2d6461746121'), // 32-byte hex key for bank account encryption (DEMO ONLY default)
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
if (config.NODE_ENV === 'production' && config.STRICT_SECRETS) {
  const publicDefaults: Array<[keyof typeof config, string]> = [
    ['MINIO_ACCESS_KEY', 'nexgo_local'],
    ['MINIO_SECRET_KEY', 'nexgo_local_only_change_me'],
    ['RAZORPAY_WEBHOOK_SECRET', 'local-development-razorpay-webhook-secret'],
  ];
  const insecure = publicDefaults.filter(([key, value]) => config[key] === value).map(([key]) => key);
  if (insecure.length) throw new Error(`Refusing to start in production with development defaults for: ${insecure.join(', ')}`);
}

if (config.NODE_ENV === 'production' && !config.STRICT_SECRETS) console.warn('NEXGO is running with demo-only secret defaults (STRICT_SECRETS is not set). Use test data only.');
