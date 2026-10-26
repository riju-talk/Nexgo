import type { FastifyRequest } from 'fastify';
import { db } from '../db/client.js';
import { hashSessionToken, IDLE_SQL, STALE_SQL } from './session.js';

export type AdminPrincipal = { userId: string; role: string };
declare module 'fastify' { interface FastifyRequest { adminPrincipal?: AdminPrincipal } }

export async function requirePlatformAdmin(request: FastifyRequest) {
  const token = request.cookies.nx_session;
  if (!token) throw Object.assign(new Error('Platform administrator authentication required'), { statusCode: 401 });
  const result = await db.query<AdminPrincipal & { stale: boolean; sessionId: string }>(
    `SELECT pa.user_id AS "userId", pa.role, se.id AS "sessionId", ${STALE_SQL} FROM sessions se JOIN platform_admins pa ON pa.user_id = se.user_id WHERE se.token_hash = $1 AND se.revoked_at IS NULL AND se.expires_at > now() AND ${IDLE_SQL} LIMIT 1`,
    [hashSessionToken(token)],
  );
  if (!result.rows[0]) throw Object.assign(new Error('Platform administrator authentication required'), { statusCode: 401 });
  const { stale, sessionId, ...principal } = result.rows[0];
  if (stale) await db.query('UPDATE sessions SET last_seen_at = now() WHERE id = $1', [sessionId]);
  request.adminPrincipal = principal;
}

// Commercial changes (couriers, rate cards, pincode rules) are gated to the
// two roles actually accountable for pricing/network decisions. Support and
// analyst roles can read this data but never write it.
export async function requireCommercialAdmin(request: FastifyRequest) {
  const role = request.adminPrincipal!.role;
  if (!['super_admin', 'operations_admin'].includes(role)) {
    throw Object.assign(new Error('This administrator role cannot change shipping configuration'), { statusCode: 403 });
  }
}

// KYC and seller-lifecycle decisions (suspend/activate) are the other
// high-trust surface: finance owns KYC/bank verification, operations owns
// account state, and only super_admin can do both.
export async function requireAccountAdmin(request: FastifyRequest) {
  const role = request.adminPrincipal!.role;
  if (!['super_admin', 'operations_admin', 'finance_admin'].includes(role)) {
    throw Object.assign(new Error('This administrator role cannot review seller accounts'), { statusCode: 403 });
  }
}
