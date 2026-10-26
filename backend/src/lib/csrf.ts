import type { FastifyReply, FastifyRequest } from 'fastify';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';

const CSRF_COOKIE = 'nx_csrf';
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Double-submit cookie CSRF defense, layered on top of (not instead of)
// SameSite=Lax cookies. The token is bound to the session it was issued for:
// "<random>.<HMAC(CSRF_SECRET, sha256(session token) + random)>". Every mutating
// request must echo the cookie back in the x-csrf-token header (a cross-site page
// cannot read it) AND the signature must verify against the caller's own session,
// so a token planted from a sibling subdomain or copied from another login is useless.
const sign = (sessionToken: string, nonce: string) =>
  createHmac('sha256', config.CSRF_SECRET).update(createHash('sha256').update(sessionToken).digest('hex')).update('.').update(nonce).digest('base64url');

export function issueCsrfCookie(reply: FastifyReply, sessionToken: string) {
  const nonce = randomBytes(18).toString('base64url');
  const token = `${nonce}.${sign(sessionToken, nonce)}`;
  reply.setCookie(CSRF_COOKIE, token, { httpOnly: false, sameSite: 'lax', secure: config.COOKIE_SECURE, path: '/' });
  return token;
}

export function csrfTokenValid(token: unknown, sessionToken: string): boolean {
  if (typeof token !== 'string') return false;
  const [nonce, mac, extra] = token.split('.');
  if (!nonce || !mac || extra !== undefined) return false;
  const expected = Buffer.from(sign(sessionToken, nonce));
  const given = Buffer.from(mac);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export function clearCsrfCookie(reply: FastifyReply) {
  reply.clearCookie(CSRF_COOKIE, { path: '/' });
}

// Webhook routes (Razorpay/couriers) are exempt by construction — they never
// carry a session cookie, so there is no session to forge a request against,
// and they're authenticated by HMAC signature instead.
//
// Session-establishing routes are exempt too, and deliberately by exact path
// rather than "no nx_session cookie present": a browser can easily be
// carrying a stale, already-expired, or already-revoked session cookie
// (closed tab without logging out, a session that later expired server-side)
// while hitting login/signup/reset again. Keying the exemption off cookie
// *presence* would then demand a CSRF header the client never had a reason
// to fetch, on the exact request meant to establish a fresh session — an
// entirely legitimate flow, not an edge case.
const CSRF_EXEMPT_PATHS = new Set([
  '/v1/auth/login',
  '/v1/auth/signup',
  '/v1/auth/forgot-password',
  '/v1/auth/reset-password',
  '/v1/admin/auth/login',
  '/v1/admin/auth/mfa',
  '/v1/team/invitations/accept',
  // Heartbeat only touches the caller's own session and re-issues a missing/stale CSRF cookie (the response is unreadable cross-site).
  '/v1/auth/heartbeat',
]);

export function requireCsrfHeader(request: FastifyRequest, reply: FastifyReply, done: (err?: Error) => void) {
  if (!MUTATING_METHODS.has(request.method) || request.url.startsWith('/v1/webhooks/')) return done();
  if (CSRF_EXEMPT_PATHS.has(request.url.split('?')[0])) return done();
  if (!request.cookies.nx_session) return done(); // no session cookie => nothing to forge
  const cookieToken = request.cookies[CSRF_COOKIE];
  const headerToken = request.headers['x-csrf-token'];
  if (!cookieToken || typeof headerToken !== 'string') {
    reply.code(403).send({ error: 'CSRF_TOKEN_MISSING' });
    return;
  }
  const a = Buffer.from(cookieToken);
  const b = Buffer.from(headerToken);
  if (a.length !== b.length || !timingSafeEqual(a, b) || !csrfTokenValid(cookieToken, request.cookies.nx_session)) {
    reply.code(403).send({ error: 'CSRF_TOKEN_INVALID' });
    return;
  }
  done();
}
