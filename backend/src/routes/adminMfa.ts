import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db, withTransaction } from '../db/client.js';
import { hashSessionToken, newSessionToken } from '../lib/session.js';
import { encryptSecret, decryptSecret } from '../lib/crypto.js';
import { generateTotpSecret, totpOtpauthUri, verifyTotpCode } from '../lib/totp.js';
import { sessionCookieOptions } from '../lib/cookies.js';
import { issueCsrfCookie } from '../lib/csrf.js';
import { config } from '../config.js';
import { requirePlatformAdmin } from '../lib/adminAuth.js';

export async function adminMfaRoutes(app: FastifyInstance) {
  // Step two of login when MFA is required and enrolled: exchange the
  // short-lived challenge + a valid code for a real session. The challenge
  // itself proves the password step already passed; it is single-use.
  app.post('/v1/admin/auth/mfa', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    const { mfaToken, code } = z.object({ mfaToken: z.string().min(20), code: z.string().length(6) }).parse(request.body);
    const session = await withTransaction(async (client) => {
      const challenge = await client.query<{ id: string; user_id: string }>(
        'SELECT id, user_id FROM admin_mfa_challenges WHERE token_hash=$1 AND consumed_at IS NULL AND expires_at > now() FOR UPDATE',
        [hashSessionToken(mfaToken)],
      );
      if (!challenge.rows[0]) return null;
      const admin = await client.query<{ user_id: string; role: string; full_name: string; totp_secret_encrypted: Buffer; totp_key_reference: string }>(
        `SELECT pa.user_id, pa.role, u.full_name, pa.totp_secret_encrypted, pa.totp_key_reference
         FROM platform_admins pa JOIN users u ON u.id = pa.user_id WHERE pa.user_id = $1`,
        [challenge.rows[0].user_id],
      );
      const row = admin.rows[0];
      if (!row?.totp_secret_encrypted) return null;
      const secret = decryptSecret(row.totp_secret_encrypted, row.totp_key_reference);
      if (!verifyTotpCode(secret, code)) return 'invalid_code' as const;
      await client.query('UPDATE admin_mfa_challenges SET consumed_at = now() WHERE id = $1', [challenge.rows[0].id]);
      const token = newSessionToken();
      const created = await client.query<{ expires_at: string }>(
        `INSERT INTO sessions (user_id, token_hash, expires_at, user_agent, ip_address)
         VALUES ($1,$2, now() + ($3 || ' days')::interval, $4, $5) RETURNING expires_at`,
        [row.user_id, hashSessionToken(token), String(config.SESSION_TTL_DAYS), request.headers['user-agent'] ?? null, request.ip],
      );
      return { token, expiresAt: created.rows[0].expires_at, userId: row.user_id, role: row.role, fullName: row.full_name };
    });
    if (session === null) return reply.code(401).send({ error: 'MFA_CHALLENGE_INVALID_OR_EXPIRED' });
    if (session === 'invalid_code') return reply.code(401).send({ error: 'INVALID_MFA_CODE' });
    reply.setCookie('nx_session', session.token, sessionCookieOptions());
    issueCsrfCookie(reply, session.token);
    return { userId: session.userId, fullName: session.fullName, role: session.role, expiresAt: session.expiresAt };
  });

  // Enrollment happens on an already-authenticated (password-only) session,
  // since mfa_required + no enrollment yet is exactly what let this request
  // reach here without a challenge. The secret isn't "live" until /confirm
  // proves the admin's authenticator app actually has it.
  app.post('/v1/admin/mfa/enroll', { preHandler: requirePlatformAdmin }, async (request) => {
    const email = await db.query<{ email: string }>('SELECT email FROM users WHERE id=$1', [request.adminPrincipal!.userId]);
    const secret = generateTotpSecret();
    const { ciphertext, keyReference } = encryptSecret(secret);
    await db.query('UPDATE platform_admins SET totp_secret_encrypted=$1, totp_key_reference=$2, totp_enrolled_at=NULL WHERE user_id=$3', [ciphertext, keyReference, request.adminPrincipal!.userId]);
    return { secret, otpauthUri: totpOtpauthUri(secret, email.rows[0].email) };
  });

  app.post('/v1/admin/mfa/confirm', { preHandler: requirePlatformAdmin }, async (request, reply) => {
    const { code } = z.object({ code: z.string().length(6) }).parse(request.body);
    const row = await db.query<{ totp_secret_encrypted: Buffer; totp_key_reference: string }>('SELECT totp_secret_encrypted, totp_key_reference FROM platform_admins WHERE user_id=$1', [request.adminPrincipal!.userId]);
    if (!row.rows[0]?.totp_secret_encrypted) return reply.code(409).send({ error: 'NO_PENDING_ENROLLMENT' });
    const secret = decryptSecret(row.rows[0].totp_secret_encrypted, row.rows[0].totp_key_reference);
    if (!verifyTotpCode(secret, code)) return reply.code(401).send({ error: 'INVALID_MFA_CODE' });
    await db.query('UPDATE platform_admins SET totp_enrolled_at = now() WHERE user_id=$1', [request.adminPrincipal!.userId]);
    return { enrolled: true };
  });
}
