import type { FastifyInstance } from 'fastify';
import { timingSafeEqual } from 'node:crypto';
import argon2 from 'argon2';
import { z } from 'zod';
import { config } from '../config.js';
import { withTransaction } from '../db/client.js';
import { audit } from '../lib/audit.js';

const safeEqual = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };

/**
 * Creates a platform admin from an e-mail and a password, guarded by a shared API secret (ADMIN_API_SECRET, header x-admin-api-secret).
 * The password is hashed with argon2id and only the hash is stored. No browser session is involved, so there is nothing to forge:
 * the secret is the credential. Without ADMIN_API_SECRET the endpoint answers 503. It never changes an account that already exists.
 */
export async function adminProvisionRoutes(app: FastifyInstance) {
  app.post('/v1/admin/accounts', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    if (!config.ADMIN_API_SECRET) return reply.code(503).send({ error: 'ADMIN_API_NOT_CONFIGURED' });
    const secret = request.headers['x-admin-api-secret'];
    if (typeof secret !== 'string' || !safeEqual(secret, config.ADMIN_API_SECRET)) return reply.code(401).send({ error: 'INVALID_API_SECRET' });
    const input = z.object({ email: z.string().trim().toLowerCase().email().max(254), password: z.string().min(12).max(128) }).strict().parse(request.body);
    const hash = await argon2.hash(input.password, { type: argon2.argon2id });
    const created = await withTransaction(async (client) => {
      const existing = await client.query('SELECT 1 FROM users WHERE email = $1', [input.email]);
      if (existing.rows[0]) return null;
      const user = await client.query<{ id: string }>(
        'INSERT INTO users (email, password_hash, full_name, email_verified_at) VALUES ($1,$2,$3, now()) RETURNING id', [input.email, hash, input.email.split('@')[0]]);
      await client.query("INSERT INTO platform_admins (user_id, role, mfa_required) VALUES ($1,'super_admin', false)", [user.rows[0].id]);
      await audit(client, { action: 'admin.account_created', targetType: 'platform_admin', targetId: user.rows[0].id, requestId: request.id, metadata: { email: input.email, via: 'api' } });
      return user.rows[0].id;
    });
    if (!created) return reply.code(409).send({ error: 'EMAIL_ALREADY_REGISTERED', message: 'An account with this e-mail already exists.' });
    return reply.code(201).send({ id: created, email: input.email, role: 'super_admin' });
  });
}
