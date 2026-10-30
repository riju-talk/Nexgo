import { config } from '../config.js';
import { withTransaction } from '../db/client.js';
import argon2 from 'argon2';

// Developer super admin: e-mail and password come from DEV_SUPERADMIN_EMAIL / DEV_SUPERADMIN_PASSWORD in .env, never from the
// repository. The account lives in the database like any admin and stays there; while the variables are set, the password is
// kept in sync with .env at every start. To remove it: delete the variables and its row.
export async function ensureDeveloperSuperadmin(log: { info: (m: string) => void }) {
  const email = config.DEV_SUPERADMIN_EMAIL?.toLowerCase();
  const password = config.DEV_SUPERADMIN_PASSWORD;
  if (!email || !password) return;
  await withTransaction(async (client) => {
    const existing = await client.query<{ id: string; password_hash: string }>('SELECT id, password_hash FROM users WHERE email = $1', [email]);
    let userId = existing.rows[0]?.id;
    if (!userId) {
      const hash = await argon2.hash(password, { type: argon2.argon2id });
      userId = (await client.query<{ id: string }>('INSERT INTO users (email, password_hash, full_name, email_verified_at) VALUES ($1,$2,$3, now()) RETURNING id', [email, hash, 'Developer Super Admin'])).rows[0].id;
    } else if (!(await argon2.verify(existing.rows[0].password_hash, password))) {
      const hash = await argon2.hash(password, { type: argon2.argon2id });
      await client.query('UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1', [userId, hash]);
      await client.query('UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [userId]);
    }
    await client.query(`INSERT INTO platform_admins (user_id, role, mfa_required) VALUES ($1,'super_admin', false) ON CONFLICT (user_id) DO UPDATE SET role = 'super_admin', mfa_required = false`, [userId]);
  });
  log.info(`Developer super admin ready: ${email}`);
}

// The platform administrator every environment starts with, hardcoded on purpose (client request) so there is always a
// way in to approve the first sellers. Only the argon2id HASH is stored here, never the password. Since the repository is not secret,
// change the password right after the first sign-in, and set ENABLE_BOOTSTRAP_ADMIN=false once real admins exist.
//
// Created if missing. An existing account's password is left alone (so a changed password survives restarts) unless
// BOOTSTRAP_ADMIN_RESET=true, which puts this hash back.
export const BOOTSTRAP_ADMIN = {
  email: 'nexgo201@gmail.com',
  fullName: 'NEXGO Admin',
  passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$0GCP5g4AcQHuKvmXhvgdOA$Lc/qKIKH7x3MYQDH1xkSE1iXfVGgfX/my+uu2gUBqYQ',
} as const;

export async function ensureBootstrapAdmin(log: { info: (m: string) => void }) {
  if (!config.ENABLE_BOOTSTRAP_ADMIN) return;
  await withTransaction(async (client) => {
    const existing = await client.query<{ id: string }>('SELECT id FROM users WHERE email = $1', [BOOTSTRAP_ADMIN.email]);
    let userId = existing.rows[0]?.id;
    if (!userId) {
      const created = await client.query<{ id: string }>('INSERT INTO users (email, password_hash, full_name, email_verified_at) VALUES ($1,$2,$3, now()) RETURNING id', [BOOTSTRAP_ADMIN.email, BOOTSTRAP_ADMIN.passwordHash, BOOTSTRAP_ADMIN.fullName]);
      userId = created.rows[0].id;
      log.info(`Bootstrap admin created: ${BOOTSTRAP_ADMIN.email}`);
    } else if (config.BOOTSTRAP_ADMIN_RESET) {
      await client.query('UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1', [userId, BOOTSTRAP_ADMIN.passwordHash]);
      await client.query('UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [userId]);
      log.info('Bootstrap admin password reset to the built-in value');
    }
    await client.query(`INSERT INTO platform_admins (user_id, role, mfa_required) VALUES ($1,'super_admin', false) ON CONFLICT (user_id) DO NOTHING`, [userId]);
  });
}
