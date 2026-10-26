import argon2 from 'argon2';
import { config } from '../config.js';
import { withTransaction } from '../db/client.js';

// Fixed development logins so you can sign in without going through register -> approve -> e-mail every time.
// They exist ONLY here, in the backend, and are never shown by the frontend or the API docs.
//
// Safety rails (all must hold, otherwise nothing is created and nothing can sign in with these):
//   - NODE_ENV is exactly "development" (config also refuses ENABLE_DEV_ACCOUNTS=true in production)
//   - ENABLE_DEV_ACCOUNTS is not "false"
//   - the database is on this machine / the compose network, never a hosted one
// Existing rows are left alone: this never overwrites a real account's password.
export const DEV_SELLER = { email: 'demo@acmeexports.com', password: 'Demo@123', fullName: 'Demo Seller', businessName: 'Acme Exports (dev)' } as const;
export const DEV_ADMIN = { email: 'admin@nexgo.in', password: 'Admin@456', fullName: 'Dev Platform Admin' } as const;

const LOCAL_DB_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', 'postgres', 'db', 'host.docker.internal']);

export function devAccountsAllowed(): { allowed: boolean; reason?: string } {
  if (config.NODE_ENV !== 'development') return { allowed: false, reason: `NODE_ENV is ${config.NODE_ENV}` };
  if (!config.ENABLE_DEV_ACCOUNTS) return { allowed: false, reason: 'ENABLE_DEV_ACCOUNTS=false' };
  const host = new URL(config.DATABASE_URL).hostname;
  if (!LOCAL_DB_HOSTS.has(host)) return { allowed: false, reason: `DATABASE_URL points at ${host}, not a local database` };
  return { allowed: true };
}

export async function ensureDevAccounts(log: { info: (m: string) => void; warn: (m: string) => void }) {
  const gate = devAccountsAllowed();
  if (!gate.allowed) { if (config.NODE_ENV === 'development') log.warn(`Dev accounts not created: ${gate.reason}`); return; }
  await withTransaction(async (client) => {
    const sellerHash = await argon2.hash(DEV_SELLER.password, { type: argon2.argon2id });
    const adminHash = await argon2.hash(DEV_ADMIN.password, { type: argon2.argon2id });

    const sellerUser = await client.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, full_name, email_verified_at) VALUES ($1,$2,$3, now()) ON CONFLICT (email) DO NOTHING RETURNING id`,
      [DEV_SELLER.email, sellerHash, DEV_SELLER.fullName]);
    if (sellerUser.rows[0]) {
      const seller = await client.query<{ id: string }>(
        `INSERT INTO sellers (legal_name, slug, state, approval_status, approval_decided_at) VALUES ($1, 'acme-exports-dev', 'active', 'approved', now()) ON CONFLICT (slug) DO UPDATE SET slug = EXCLUDED.slug RETURNING id`,
        [DEV_SELLER.businessName]);
      await client.query(`INSERT INTO seller_memberships (seller_id, user_id, role) VALUES ($1,$2,'owner') ON CONFLICT DO NOTHING`, [seller.rows[0].id, sellerUser.rows[0].id]);
      log.info(`Dev seller created: ${DEV_SELLER.email}`);
    }

    const adminUser = await client.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, full_name, email_verified_at) VALUES ($1,$2,$3, now()) ON CONFLICT (email) DO NOTHING RETURNING id`,
      [DEV_ADMIN.email, adminHash, DEV_ADMIN.fullName]);
    if (adminUser.rows[0]) {
      await client.query(`INSERT INTO platform_admins (user_id, role, mfa_required) VALUES ($1,'super_admin', false) ON CONFLICT DO NOTHING`, [adminUser.rows[0].id]);
      log.info(`Dev admin created: ${DEV_ADMIN.email}`);
    }
  });
}
