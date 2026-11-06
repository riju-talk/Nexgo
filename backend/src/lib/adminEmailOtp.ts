import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import type { PoolClient } from 'pg';
import { config } from '../config.js';
import { db } from '../db/client.js';
import { sendMail } from './mailer.js';
import { hashSessionToken, newSessionToken } from './session.js';

export const OTP_MINUTES = 10;
export const OTP_MAX_ATTEMPTS = 5;

const hashCode = (userId: string, code: string) => createHmac('sha256', config.CSRF_SECRET).update(`admin-otp:${userId}:${code}`).digest('hex');
const sameHash = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };
export const maskEmail = (email: string) => email.replace(/^(.).*(@.*)$/, '$1•••$2');

/** Stores a fresh 6-digit code for this admin (replacing any older one) and e-mails it. Returns whether the e-mail went out. */
export async function sendAdminOtp(userId: string, email: string, reason: 'registration' | 'sign-in', client?: PoolClient) {
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const run = (client ?? db).query.bind(client ?? db);
  await run(
    `INSERT INTO admin_email_otps (user_id, code_hash, attempts, expires_at) VALUES ($1,$2,0, now() + ($3 || ' minutes')::interval)
     ON CONFLICT (user_id) DO UPDATE SET code_hash = EXCLUDED.code_hash, attempts = 0, expires_at = EXCLUDED.expires_at, created_at = now()`,
    [userId, hashCode(userId, code), String(OTP_MINUTES)],
  );
  const lead = reason === 'registration'
    ? 'An admin account was created for this email on NEXGO. Use the code below to verify your email and sign in.'
    : 'Use the code below to finish signing in to the NEXGO admin panel.';
  const sent = await sendMail(email, 'Your NEXGO admin verification code',
    `${lead}\n\nYour code: ${code}\n\nIt is valid for ${OTP_MINUTES} minutes and works once. Enter it on ${config.FRONTEND_ORIGIN}/admin/login after your email and password.\n\nIf you did not try to sign in, do not share this code. Change your password.`);
  return { sent, code };
}

/** After a correct password: hands back a one-time token that the code must be sent with. A code that is still valid (for example the registration one) is kept, otherwise a new one is e-mailed. */
export async function startAdminOtpChallenge(userId: string, email: string) {
  const live = await db.query('SELECT 1 FROM admin_email_otps WHERE user_id = $1 AND expires_at > now() AND attempts < $2', [userId, OTP_MAX_ATTEMPTS]);
  const fresh = live.rows[0] ? null : await sendAdminOtp(userId, email, 'sign-in');
  const emailed = fresh ? fresh.sent : true;
  const otpToken = newSessionToken();
  await db.query('UPDATE admin_email_otps SET token_hash = $2 WHERE user_id = $1', [userId, hashSessionToken(otpToken)]);
  return { otpToken, emailed, code: fresh?.code ?? null };
}

export type OtpCheck = { ok: true; userId: string; master?: boolean } | { ok: false; reason: 'expired' | 'locked' | 'wrong' };

/** Checks the code for a token. A correct code is used up; a wrong one counts, and after OTP_MAX_ATTEMPTS the code is thrown away. */
export async function checkAdminOtp(client: PoolClient, otpToken: string, code: string): Promise<OtpCheck> {
  const row = (await client.query<{ user_id: string; code_hash: string; attempts: number; email: string }>(
    'SELECT o.user_id, o.code_hash, o.attempts, u.email FROM admin_email_otps o JOIN users u ON u.id = o.user_id WHERE o.token_hash = $1 AND o.expires_at > now() FOR UPDATE OF o', [hashSessionToken(otpToken)])).rows[0];
  if (!row) return { ok: false, reason: 'expired' };
  if (row.attempts >= OTP_MAX_ATTEMPTS) { await client.query('DELETE FROM admin_email_otps WHERE user_id = $1', [row.user_id]); return { ok: false, reason: 'locked' }; }
  // TEST ONLY master code: accepted for the one configured account. The normal lock after too many wrong tries still applies to guesses.
  const master = config.MASTER_OTP_EMAIL && config.MASTER_OTP_CODE && row.email.toLowerCase() === config.MASTER_OTP_EMAIL && sameHash(hashCode(row.user_id, config.MASTER_OTP_CODE), hashCode(row.user_id, code));
  if (master) {
    await client.query('DELETE FROM admin_email_otps WHERE user_id = $1', [row.user_id]);
    return { ok: true, userId: row.user_id, master: true };
  }
  if (!sameHash(row.code_hash, hashCode(row.user_id, code))) {
    await client.query('UPDATE admin_email_otps SET attempts = attempts + 1 WHERE user_id = $1', [row.user_id]);
    return { ok: false, reason: row.attempts + 1 >= OTP_MAX_ATTEMPTS ? 'locked' : 'wrong' };
  }
  await client.query('DELETE FROM admin_email_otps WHERE user_id = $1', [row.user_id]);
  return { ok: true, userId: row.user_id };
}
