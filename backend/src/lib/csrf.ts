import type { FastifyReply, FastifyRequest } from 'fastify';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';

const CSRF_COOKIE = 'nx_csrf';
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Double-submit cookie CSRF defense, layered on top of (not instead of)
// SameSite=Lax cookies. Lax already blocks the classic cross-site-fetch
// CSRF case, but browser SameSite behavior on top-level navigations and
// older browsers is inconsistent enough that AGENT.md calls for this as an
// explicit second layer. Issued alongside every session cookie; every
// mutating request must echo it back in a header, which a cross-site page
// cannot read (that's the whole mechanism — no server-side token storage
// needed).
export function issueCsrfCookie(reply: FastifyReply) {
  const token = randomBytes(24).toString('base64url');
  reply.setCookie(CSRF_COOKIE, token, { httpOnly: false, sameSite: 'lax', secure: config.NODE_ENV === 'production', path: '/' });
  return token;
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
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    reply.code(403).send({ error: 'CSRF_TOKEN_INVALID' });
    return;
  }
  done();
}
