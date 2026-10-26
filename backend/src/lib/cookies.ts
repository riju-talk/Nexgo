import { config } from '../config.js';

export const SESSION_COOKIE = 'nx_session';

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    // Lax (not Strict) so the Shopify OAuth return, a top-level navigation from another site, still arrives signed in.
    sameSite: 'lax' as const,
    secure: config.COOKIE_SECURE,
    path: '/',
    maxAge: config.SESSION_TTL_DAYS * 24 * 60 * 60,
  };
}
