import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import argon2 from 'argon2';
import { withTransaction } from '../db/client.js';
import { hashSessionToken, newSessionToken } from '../lib/session.js';
import { sendMail } from '../lib/mailer.js';
import { config } from '../config.js';

const RESET_TTL_MINUTES = 60;
const resetRateLimit = { rateLimit: { max: 5, timeWindow: '1 minute' } };

export async function passwordResetRoutes(app: FastifyInstance) {
  // Always returns 202 regardless of whether the email is registered —
  // confirming/denying an account's existence here is its own information
  // leak, so "check your inbox" is the honest answer either way.
  app.post('/v1/auth/forgot-password', { config: resetRateLimit }, async (request, reply) => {
    const { email } = z.object({ email: z.string().email().max(254) }).parse(request.body);
    const token = newSessionToken();
    await withTransaction(async (client) => {
      const user = await client.query<{ id: string }>('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
      if (!user.rows[0]) return;
      await client.query(
        `INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES ($1,$2, now() + interval '${RESET_TTL_MINUTES} minutes')`,
        [user.rows[0].id, hashSessionToken(token)],
      );
      await sendMail(email, 'Reset your NEXGO password', `Reset your password: ${config.FRONTEND_ORIGIN}/reset-password?token=${token}\n\nThis link expires in ${RESET_TTL_MINUTES} minutes. If you didn't request this, ignore this email.`);
    });
    return reply.code(202).send({ accepted: true });
  });

  app.post('/v1/auth/reset-password', { config: resetRateLimit }, async (request, reply) => {
    const { token, password } = z.object({ token: z.string().min(20), password: z.string().min(12).max(200) }).parse(request.body);
    const applied = await withTransaction(async (client) => {
      const reset = await client.query<{ id: string; user_id: string }>(
        'SELECT id, user_id FROM password_resets WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now() FOR UPDATE',
        [hashSessionToken(token)],
      );
      if (!reset.rows[0]) return false;
      const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
      await client.query('UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2', [passwordHash, reset.rows[0].user_id]);
      await client.query('UPDATE password_resets SET used_at = now() WHERE id = $1', [reset.rows[0].id]);
      // A password reset is exactly the moment to assume every existing
      // session might belong to someone else now — kill all of them.
      await client.query('UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [reset.rows[0].user_id]);
      return true;
    });
    if (!applied) return reply.code(400).send({ error: 'RESET_TOKEN_INVALID_OR_EXPIRED' });
    return { reset: true };
  });
}
