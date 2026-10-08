import argon2 from 'argon2';
import { db, withTransaction } from './client.js';

// Local presentation account only. Do not use this identity outside demo data.
const email = 'demo@acmeexports.com';
const password = 'Demo@123';

async function main() {
  await withTransaction(async (client) => {
    const hash = await argon2.hash(password, { type: argon2.argon2id });
    const seller = await client.query<{ id: string }>(
      `INSERT INTO sellers (legal_name, slug, state)
       VALUES ('Acme Exports', 'acme-exports', 'active')
       ON CONFLICT (slug) DO UPDATE SET legal_name = EXCLUDED.legal_name, state = 'active', updated_at = now()
       RETURNING id`,
    );
    const user = await client.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, full_name, email_verified_at)
       VALUES ($1, $2, 'Anita Rao', now())
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, full_name = EXCLUDED.full_name, email_verified_at = now(), updated_at = now()
       RETURNING id`,
      [email, hash],
    );
    await client.query(
      `INSERT INTO seller_memberships (seller_id, user_id, role)
       VALUES ($1, $2, 'owner')
       ON CONFLICT (seller_id, user_id) DO UPDATE SET role = 'owner'`,
      [seller.rows[0].id, user.rows[0].id],
    );
  });
  console.log(`Demo seller ready: ${email}`);
  await db.end();
}

main().catch(async (error) => { console.error(error); await db.end(); process.exit(1); });
