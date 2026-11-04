import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { db } from '../db/client.js';
import { hashSessionToken } from '../lib/session.js';
import { requireSeller } from './seller.js';
import { requirePlatformAdmin } from '../lib/adminAuth.js';

function currentUserId(request: FastifyRequest): string {
  if (request.principal) return request.principal.userId;
  if (request.adminPrincipal) return request.adminPrincipal.userId;
  throw Object.assign(new Error('Authentication required'), { statusCode: 401 });
}

async function listSessions(userId: string, currentTokenHash: string) {
  const result = await db.query<{ id: string; user_agent: string | null; ip_address: string | null; created_at: string; last_seen_at: string; token_hash: string }>(
    'SELECT id, user_agent, ip_address, created_at, last_seen_at, token_hash FROM sessions WHERE user_id=$1 AND revoked_at IS NULL AND expires_at > now() ORDER BY last_seen_at DESC',
    [userId],
  );
  return result.rows.map(({ token_hash, ...rest }) => ({ ...rest, current: token_hash === currentTokenHash }));
}

// Registered under both the seller session guard and the platform-admin
// guard so "view my sign-ins" and "sign out other devices" work the same
// way for a seller user and a platform admin, without either side reaching
// into the other's session-cookie scope.
export async function sessionRoutes(app: FastifyInstance) {
  app.get('/v1/seller/sessions', { preHandler: requireSeller }, async (request) => ({ items: await listSessions(currentUserId(request), hashSessionToken(request.cookies.nx_session!)) }));
  app.get('/v1/admin/sessions', { preHandler: requirePlatformAdmin }, async (request) => ({ items: await listSessions(currentUserId(request), hashSessionToken(request.cookies.nx_session!)) }));

  async function revokeOne(request: FastifyRequest, reply: { code: (n: number) => { send: (b?: unknown) => unknown } }) {
    const userId = currentUserId(request);
    const sessionId = z.string().uuid().parse((request.params as { sessionId: string }).sessionId);
    const result = await db.query('UPDATE sessions SET revoked_at = now() WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL RETURNING id', [sessionId, userId]);
    if (!result.rows[0]) return reply.code(404).send({ error: 'SESSION_NOT_FOUND' });
    return reply.code(204).send();
  }
  app.delete('/v1/seller/sessions/:sessionId', { preHandler: requireSeller }, (request, reply) => revokeOne(request, reply));
  app.delete('/v1/admin/sessions/:sessionId', { preHandler: requirePlatformAdmin }, (request, reply) => revokeOne(request, reply));

  async function revokeOthers(request: FastifyRequest) {
    const userId = currentUserId(request);
    const currentTokenHash = hashSessionToken(request.cookies.nx_session!);
    const result = await db.query('UPDATE sessions SET revoked_at = now() WHERE user_id=$1 AND token_hash <> $2 AND revoked_at IS NULL RETURNING id', [userId, currentTokenHash]);
    return { revokedCount: result.rowCount ?? 0 };
  }
  app.post('/v1/seller/sessions/revoke-others', { preHandler: requireSeller }, (request) => revokeOthers(request));
  app.post('/v1/admin/sessions/revoke-others', { preHandler: requirePlatformAdmin }, (request) => revokeOthers(request));
}
