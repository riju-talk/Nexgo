import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

// One .env file for the whole stack, at the repository root (docker compose reads the same file).
// The backend's own folder is still checked so `cd backend && npm run dev` keeps working; real
// environment variables (ECS task definition, compose `environment:`) always win over both files.
loadEnv({ path: ['.env', '../.env'], quiet: true });

const bool = (fallback: boolean) => z.enum(['true', 'false']).optional().transform((v) => (v === undefined ? fallback : v === 'true'));
const production = process.env.NODE_ENV === 'production';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4010),
  // No default: a database credential must never live in source control.
  DATABASE_URL: z.string().url(),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(100).default(process.env.VERCEL ? 3 : 24),
  // Origin the browser loads the app from (CORS allow-list, e-mail links, cookie scope). Must be set explicitly in production.
  FRONTEND_ORIGIN: (production ? z.string().url() : z.string().url().default('http://localhost:3021')).transform((v) => new URL(v).origin), // origin only: a stray path ("/login") would break every redirect and e-mail link
  // Set to true behind a load balancer / reverse proxy (ALB, CloudFront, nginx) so request.ip and the https scheme are the client's, not the proxy's.
  TRUST_PROXY: bool(false),

  // --- Sessions, cookies, CSRF ---
  // How often the worker asks aggregators for tracking itself (a safety net next to their webhooks). 0 turns it off.
  TRACKING_POLL_MINUTES: z.coerce.number().int().min(0).max(240).default(10),
  // Background courier assignment (lib/assignQueue.ts): bookings in flight per process, and per seller.
  ASSIGN_WORKERS: z.coerce.number().int().min(1).max(128).default(64),
  ASSIGN_PER_SELLER: z.coerce.number().int().min(1).max(64).default(32),
  CANCEL_WORKERS: z.coerce.number().int().min(1).max(128).default(16),
  CANCEL_PER_SELLER: z.coerce.number().int().min(1).max(64).default(16),
  // Calls to the courier aggregator in flight at once from this process; it backs off by itself when the aggregator answers 429 (couriers/aggregatorLimiter.ts).
  AGGREGATOR_MAX_CONCURRENCY: z.coerce.number().int().min(4).max(200).default(40),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().max(30).default(14), // absolute lifetime of one sign-in
  SESSION_IDLE_MINUTES: z.coerce.number().int().min(5).max(24 * 60).default(720), // signed out after this long without user activity
  // Cookies are Secure whenever NODE_ENV=production. Only set false to test a production image over plain http://localhost.
  COOKIE_SECURE: bool(production),
  // Signs the CSRF token to the session it was issued for (>= 32 random characters).
  CSRF_SECRET: z.string().min(32),

  // --- Encryption at rest ---
  // 32-byte AES-256 key, base64-encoded (provider credentials). Production should move to per-record KMS envelope encryption.
  LOCAL_ENCRYPTION_KEY: z.string().min(1),
  ENCRYPTION_KEY: z.string().regex(/^[0-9a-fA-F]{64}$/, 'must be 64 hex characters (32 bytes)'), // bank account encryption

  // --- Payments ---
  // Unset key id/secret = the deterministic mock gateway (development only).
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().min(16),

  // --- Couriers / channels ---
  COURIER_WEBHOOK_SECRET: z.string().min(32).optional(),
  SHOPIFY_CLIENT_ID: z.string().optional(),
  SHOPIFY_CLIENT_SECRET: z.string().optional(),
  SHOPIFY_API_VERSION: z.string().default('2026-10'),
  SHOPIFY_SCOPES: z.string().default('read_orders,write_orders,read_customers,read_products,read_locations,read_fulfillments,write_fulfillments,read_merchant_managed_fulfillment_orders,write_merchant_managed_fulfillment_orders,read_assigned_fulfillment_orders,write_assigned_fulfillment_orders,read_third_party_fulfillment_orders,write_third_party_fulfillment_orders'),
  // Public origin Shopify calls back (OAuth redirect + webhooks). Defaults to the frontend origin, which proxies /v1/*.
  SHOPIFY_PUBLIC_URL: z.string().url().optional(),
  LORRIGO_API_KEY: z.string().optional(),
  LORRIGO_BASE_URL: z.string().url().default('https://app.lorrigo.com/api/v2'),
  LORRIGO_WEBHOOK_TOKEN: z.string().min(24).optional(),
  // TEST ONLY. A fixed 6-digit code that is accepted as the e-mailed admin code for ONE account (the e-mail below), for a test mailbox that cannot receive mail.
  // Both must be set. Delete both variables to remove it. Every use is written to the audit log.
  MASTER_OTP_EMAIL: z.string().trim().toLowerCase().email().optional().or(z.literal('')),
  MASTER_OTP_CODE: z.string().regex(/^[0-9]{6}$/).optional().or(z.literal('')),
  ADMIN_API_SECRET: z.string().min(32).optional().or(z.literal('')), // enables POST /v1/admin/accounts (create a platform admin); empty = endpoint off

  // --- Object storage (S3-compatible; the AWS SDK also reads AWS_* itself) ---
  STORAGE_ENABLED: bool(false),
  ENFORCE_KYC_GATE: bool(false), // true = KYC submitted before orders and KYC verified before shipping (off while sellers are being onboarded)
  STORAGE_BUCKET: z.string().min(3).default('assets'),
  AWS_REGION: z.string().optional(),

  // --- Company details printed on the monthly tax invoice (unset lines are left off) ---
  COMPANY_NAME: z.string().default('NEXGO Logistics Technologies Pvt. Ltd.'),
  COMPANY_ADDRESS: z.string().default(''),
  COMPANY_GSTIN: z.string().default(''),
  COMPANY_REGD_OFFICE: z.string().default(''),
  COMPANY_BANK_ACCOUNT_NAME: z.string().default(''),
  COMPANY_BANK_NAME: z.string().default(''),
  COMPANY_BANK_ACCOUNT_NO: z.string().default(''),
  COMPANY_BANK_IFSC: z.string().default(''),
  COMPANY_BANK_BRANCH: z.string().default(''),

  // --- E-mail (SES / any SMTP relay; Mailpit locally) ---
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().int().positive().default(1025),
  SMTP_SECURE: bool(false), // true = implicit TLS (port 465); false = STARTTLS when the server offers it
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  MAIL_FROM: z.string().default('NEXGO <no-reply@mynexgo.com>'),

  // --- Operations ---
  // Swagger UI / openapi.json. Off in production unless you really want the route table public.
  DOCS_ENABLED: bool(!production),
  // Development-only logins (lib/devAccounts.ts). Ignored, and refused, in production.
  ENABLE_DEV_ACCOUNTS: bool(true),
  // The built-in platform admin (lib/bootstrapAdmin.ts). Turn off once real admins exist; RESET puts the built-in password back.
  ENABLE_BOOTSTRAP_ADMIN: bool(true),
  BOOTSTRAP_ADMIN_RESET: bool(false),
  // Developer super admin for testing (lib/bootstrapAdmin.ts). Set both to create it; leave them empty to have none.
  DEV_SUPERADMIN_EMAIL: z.string().email().optional().or(z.literal('')),
  DEV_SUPERADMIN_PASSWORD: z.string().min(12).optional().or(z.literal('')),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const lines = parsed.error.issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`);
  // Names only, never values: this goes to logs.
  throw new Error(`Invalid or missing environment configuration. Copy .env.example to .env and fill in:\n${lines.join('\n')}`);
}
export const config = parsed.data;

if (config.NODE_ENV === 'production') {
  if (config.ENABLE_DEV_ACCOUNTS && process.env.ENABLE_DEV_ACCOUNTS === 'true') throw new Error('ENABLE_DEV_ACCOUNTS must not be true in production');
  if (!config.FRONTEND_ORIGIN.startsWith('https://') && config.COOKIE_SECURE) console.warn('FRONTEND_ORIGIN is not https but cookies are Secure: browsers will drop the session cookie.');
  if (!config.COOKIE_SECURE) console.warn('COOKIE_SECURE=false in production: session cookies will travel over plain http. Use only for local testing of the production image.');
}
