import type { FastifyReply, FastifyRequest } from 'fastify';
import { db } from '../db/client.js';

/**
 * Every successful change an admin makes is recorded: who (the signed-in admin), what (HTTP method + route), when, from where (IP) and which
 * fields were sent. Values are never stored (they can contain passwords or bank details); only the field names. This is a safety net next to the
 * domain-specific audit rows some routes already write, so a route that forgets to audit (SLA policies, zone lanes, ...) is still visible.
 * Sign-in and the admin-creation API have their own entries and are skipped here.
 */
const SKIP = [/^\/v1\/admin\/auth\//, /^\/v1\/admin\/accounts$/];

export async function adminWriteAudit(request: FastifyRequest, reply: FastifyReply) {
  try {
    if (!request.adminPrincipal || !request.url.startsWith('/v1/admin/')) return;
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method) || reply.statusCode >= 400) return;
    const path = request.url.split('?')[0];
    if (SKIP.some((re) => re.test(path))) return;
    const body = request.body && typeof request.body === 'object' && !Array.isArray(request.body) ? Object.keys(request.body as object).slice(0, 30) : [];
    await db.query(
      `INSERT INTO audit_events (actor_user_id, action, target_type, target_id, request_id, metadata) VALUES ($1, 'admin.write', 'http', $2, $3, $4)`,
      [request.adminPrincipal.userId, request.routeOptions?.url ?? path, request.id,
        JSON.stringify({ method: request.method, path, status: reply.statusCode, fields: body, ip: request.ip, userAgent: String(request.headers['user-agent'] ?? '').slice(0, 120) })],
    );
  } catch (error) {
    request.log.error(error, 'Could not write the admin audit row'); // an audit failure must never break the admin's request
  }
}

/** Sign-in outcomes for platform admins (success, wrong password, unknown e-mail). Never stores the password. */
export async function auditAdminLogin(request: FastifyRequest, outcome: 'success' | 'failed', email: string, userId: string | null) {
  try {
    await db.query(
      `INSERT INTO audit_events (actor_user_id, action, target_type, target_id, request_id, metadata) VALUES ($1, $2, 'admin_login', $3, $4, $5)`,
      [userId, outcome === 'success' ? 'admin.login' : 'admin.login_failed', email.toLowerCase().slice(0, 200), request.id,
        JSON.stringify({ ip: request.ip, userAgent: String(request.headers['user-agent'] ?? '').slice(0, 120) })],
    );
  } catch (error) {
    request.log.error(error, 'Could not write the admin sign-in audit row');
  }
}
