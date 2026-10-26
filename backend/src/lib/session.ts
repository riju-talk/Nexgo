import { createHash, randomBytes } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../config.js';
import { SESSION_COOKIE, sessionCookieOptions } from './cookies.js';
import { issueCsrfCookie } from './csrf.js';

export const hashSessionToken = (token: string) => createHash('sha256').update(token).digest('hex');
export const newSessionToken = () => randomBytes(32).toString('base64url');

// Start (or replace) the browser's sign-in: a fresh session cookie plus the CSRF cookie bound to it.
// Any session cookie the browser already carried is revoked first, so signing in as someone else never leaves the old session alive.
export async function startBrowserSession(request: FastifyRequest, reply: FastifyReply, token: string, revokePrevious: (hash: string) => Promise<unknown>) {
  const previous = request.cookies[SESSION_COOKIE];
  if (previous) await revokePrevious(hashSessionToken(previous));
  reply.setCookie(SESSION_COOKIE, token, sessionCookieOptions());
  issueCsrfCookie(reply, token);
}

// A session counts as idle once it has seen no user activity for SESSION_IDLE_MINUTES.
export const IDLE_SQL = `se.last_seen_at > now() - make_interval(mins => ${config.SESSION_IDLE_MINUTES})`;
// Throttle for the activity write so a burst of requests costs one UPDATE, not one each.
export const STALE_SQL = `(se.last_seen_at < now() - interval '60 seconds') AS "stale"`;
