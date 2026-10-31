import type { FastifyInstance } from 'fastify';
import argon2 from 'argon2';
import { z } from 'zod';
import { config } from '../config.js';
import { db, withTransaction } from '../db/client.js';
import { slugify } from '../lib/slug.js';
import { hashSessionToken, newSessionToken, startBrowserSession, IDLE_SQL } from '../lib/session.js';
import { SESSION_COOKIE } from '../lib/cookies.js';
import { issueCsrfCookie, clearCsrfCookie, csrfTokenValid } from '../lib/csrf.js';
import { sendRegistrationConfirmation } from '../lib/registrationMail.js';

const signupSchema = z.object({ businessName: z.string().trim().min(3).max(120), fullName: z.string().trim().min(2).max(100), email: z.string().email().max(254), password: z.string().min(12).max(200) });
const loginSchema = z.object({ email: z.string().email().max(254), password: z.string().min(1).max(200) });

const authRateLimit = { rateLimit: { max: 10, timeWindow: '1 minute' } };
const revokeSession = (hash: string) => db.query('UPDATE sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL', [hash]);

export async function authRoutes(app: FastifyInstance) {
  // Registration is instant: the account is approved on creation and the new owner is signed in straight away.
  // Admins are told by e-mail (informational) and can still suspend a seller later.
  app.post('/v1/auth/signup', { config: authRateLimit }, async (request, reply) => {
    const input = signupSchema.parse(request.body);
    const created = await withTransaction(async (client) => {
      const existing = await client.query('SELECT 1 FROM users WHERE email = $1', [input.email.toLowerCase()]);
      if (existing.rowCount) return null;
      const baseSlug = slugify(input.businessName) || 'seller';
      const seller = await client.query<{ id: string; slug: string }>('INSERT INTO sellers (legal_name, slug, state, approval_status, approval_decided_at) VALUES ($1, $2 || \'-\' || substr(gen_random_uuid()::text, 1, 8), \'onboarding\', \'approved\', now()) RETURNING id, slug', [input.businessName, baseSlug]);
      const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
      const user = await client.query<{ id: string }>('INSERT INTO users (email, password_hash, full_name) VALUES ($1, $2, $3) RETURNING id', [input.email.toLowerCase(), passwordHash, input.fullName]);
      await client.query('INSERT INTO seller_memberships (seller_id, user_id, role) VALUES ($1, $2, \'owner\')', [seller.rows[0].id, user.rows[0].id]);
      await client.query('INSERT INTO audit_events (seller_id, actor_user_id, action, target_type, target_id, request_id) VALUES ($1, $2, \'seller.registered\', \'seller\', $3, $4)', [seller.rows[0].id, user.rows[0].id, seller.rows[0].id, request.id]);
      return { sellerId: seller.rows[0].id };
    });
    if (!created) return reply.code(409).send({ error: 'EMAIL_ALREADY_REGISTERED' });
    // Not awaited: a slow mail server must never delay the response (sendMail logs its own errors, never throws).
    void sendRegistrationConfirmation({ businessName: input.businessName, fullName: input.fullName, email: input.email.toLowerCase() }).catch(() => {});
    // No session: the sign-up page sends the new owner to the sign-in page.
    return reply.code(201).send({ sellerId: created.sellerId, role: 'owner' });
  });

  app.post('/v1/auth/login', { config: authRateLimit }, async (request, reply) => {
    const input = loginSchema.parse(request.body);
    const result = await withTransaction(async (client) => {
      const found = await client.query<{ id: string; password_hash: string; seller_id: string; role: string; state: string; approval_status: string; approval_rejection_reason: string | null }>('SELECT u.id, u.password_hash, m.seller_id, m.role, s.state, s.approval_status, s.approval_rejection_reason FROM users u JOIN seller_memberships m ON m.user_id = u.id JOIN sellers s ON s.id = m.seller_id WHERE u.email = $1', [input.email.toLowerCase()]);
      const account = found.rows[0];
      if (!account || account.state === 'suspended' || !(await argon2.verify(account.password_hash, input.password))) return { failed: 'INVALID_CREDENTIALS' as const };
      const token = newSessionToken();
      const created = await client.query<{ expires_at: string }>('INSERT INTO sessions (user_id, token_hash, expires_at, user_agent, ip_address) VALUES ($1, $2, now() + ($3 || \' days\')::interval, $4, $5) RETURNING expires_at', [account.id, hashSessionToken(token), String(config.SESSION_TTL_DAYS), request.headers['user-agent'] ?? null, request.ip]);
      return { token, expiresAt: created.rows[0].expires_at, sellerId: account.seller_id, role: account.role };
    });
    if ('failed' in result) {
      if (result.failed === 'INVALID_CREDENTIALS') return reply.code(401).send({ error: 'INVALID_CREDENTIALS' });
      return reply.code(403).send({ error: result.failed, ...('reason' in result && result.reason ? { reason: result.reason } : {}) });
    }
    await startBrowserSession(request, reply, result.token, revokeSession);
    return { sellerId: result.sellerId, role: result.role, expiresAt: result.expiresAt };
  });

  // Heartbeat: the app calls this on a timer. It answers "is this sign-in still good?" for sellers and admins alike
  // and, when the caller reports real user activity ({active: true}), pushes the idle timeout out. A tab left open
  // without anyone touching it therefore still signs out after SESSION_IDLE_MINUTES. A missing or stale CSRF
  // cookie (for example from before a deploy) is re-issued here so the client can recover without signing in again.
  app.post('/v1/auth/heartbeat', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (request, reply) => {
    const { active } = z.object({ active: z.boolean().optional() }).parse(request.body ?? {});
    const token = request.cookies[SESSION_COOKIE];
    if (!token) return reply.code(401).send({ error: 'NO_SESSION' });
    const hash = hashSessionToken(token);
    const row = await db.query<{ id: string; expires_at: string; last_seen_at: string; idle_ok: boolean; is_admin: boolean; seller_ok: boolean | null }>(
      `SELECT se.id, se.expires_at, se.last_seen_at, (${IDLE_SQL}) AS idle_ok,
              EXISTS (SELECT 1 FROM platform_admins pa WHERE pa.user_id = se.user_id) AS is_admin,
              (SELECT bool_or(s.state <> 'suspended' AND s.approval_status = 'approved') FROM seller_memberships m JOIN sellers s ON s.id = m.seller_id WHERE m.user_id = se.user_id) AS seller_ok
       FROM sessions se WHERE se.token_hash = $1 AND se.revoked_at IS NULL AND se.expires_at > now()`, [hash]);
    const session = row.rows[0];
    if (!session) return reply.code(401).send({ error: 'SESSION_EXPIRED' });
    if (!session.idle_ok) {
      await revokeSession(hash);
      return reply.code(401).send({ error: 'SESSION_IDLE_TIMEOUT' });
    }
    if (!session.is_admin && !session.seller_ok) return reply.code(401).send({ error: 'ACCOUNT_UNAVAILABLE' });
    if (active) await db.query(`UPDATE sessions SET last_seen_at = now() WHERE id = $1 AND last_seen_at < now() - interval '15 seconds'`, [session.id]);
    if (!csrfTokenValid(request.cookies.nx_csrf, token)) issueCsrfCookie(reply, token);
    const idleMs = config.SESSION_IDLE_MINUTES * 60_000;
    const lastSeen = active ? Date.now() : new Date(session.last_seen_at).getTime();
    return { alive: true, kind: session.is_admin ? 'admin' : 'seller', expiresAt: session.expires_at, idleTimeoutMinutes: config.SESSION_IDLE_MINUTES, idleExpiresAt: new Date(lastSeen + idleMs).toISOString(), serverTime: new Date().toISOString() };
  });

  app.post('/v1/auth/logout', async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE];
    if (token) await revokeSession(hashSessionToken(token));
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    clearCsrfCookie(reply);
    return reply.code(204).send();
  });
}
