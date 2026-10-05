import argon2 from 'argon2';
import { config } from '../config.js';
import { db, withTransaction } from './client.js';

// Master development logins: one platform admin and one seller owner.
// Idempotent — rerunning resets both passwords to the configured values.
// Override any of these in backend/.env; never run against production.
const ADMIN_EMAIL = process.env.DEV_ADMIN_EMAIL || 'dev-admin@nexgo.local';
const ADMIN_PASSWORD = process.env.DEV_ADMIN_PASSWORD || 'NexgoDevAdmin#2026';
const SELLER_EMAIL = process.env.DEV_SELLER_EMAIL || 'dev-seller@nexgo.local';
const SELLER_PASSWORD = process.env.DEV_SELLER_PASSWORD || 'NexgoDevSeller#2026';

async function main() {
  if (config.NODE_ENV === 'production') throw new Error('seed:dev is blocked in production.');

  await withTransaction(async (client) => {
    // Platform admin: super_admin, password-only (any enrolled TOTP is cleared).
    const adminHash = await argon2.hash(ADMIN_PASSWORD, { type: argon2.argon2id });
    const admin = await client.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, full_name, email_verified_at) VALUES ($1, $2, 'Dev Platform Admin', now())
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, email_verified_at = now(), updated_at = now()
       RETURNING id`, [ADMIN_EMAIL, adminHash]);
    await client.query(
      `INSERT INTO platform_admins (user_id, role, mfa_required) VALUES ($1, 'super_admin', false)
       ON CONFLICT (user_id) DO UPDATE SET role = 'super_admin', mfa_required = false,
         totp_secret_encrypted = NULL, totp_key_reference = NULL, totp_enrolled_at = NULL`, [admin.rows[0].id]);

    // Seller owner on an active workspace with a pickup warehouse, so ordering works immediately.
    const sellerHash = await argon2.hash(SELLER_PASSWORD, { type: argon2.argon2id });
    const seller = await client.query<{ id: string }>(
      `INSERT INTO sellers (legal_name, slug, state) VALUES ('NEXGO Dev Seller', 'nexgo-dev-seller', 'active')
       ON CONFLICT (slug) DO UPDATE SET state = 'active', updated_at = now() RETURNING id`);
    const user = await client.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, full_name, email_verified_at) VALUES ($1, $2, 'Dev Seller Owner', now())
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, email_verified_at = now(), updated_at = now()
       RETURNING id`, [SELLER_EMAIL, sellerHash]);
    await client.query(
      `INSERT INTO seller_memberships (seller_id, user_id, role) VALUES ($1, $2, 'owner')
       ON CONFLICT (seller_id, user_id) DO UPDATE SET role = 'owner'`, [seller.rows[0].id, user.rows[0].id]);
    await client.query(
      `INSERT INTO warehouses (seller_id, name, contact_name, phone, email, address_line_1, city, state, pincode, is_return_address, cutoff_time)
       VALUES ($1, 'Dev Primary Warehouse', 'Dev Seller Owner', '9876500000', $2, '12 MG Road', 'Bengaluru', 'Karnataka', '560001', true, '17:00')
       ON CONFLICT (seller_id, name) DO NOTHING`, [seller.rows[0].id, SELLER_EMAIL]);
  });

  console.log('Development accounts ready (local only):');
  console.log(`  Admin panel  http://localhost:3021/admin/login  ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  console.log(`  Seller panel http://localhost:3021/login        ${SELLER_EMAIL} / ${SELLER_PASSWORD}`);
  await db.end();
}

main().catch(async (error) => { console.error(error); await db.end(); process.exit(1); });
