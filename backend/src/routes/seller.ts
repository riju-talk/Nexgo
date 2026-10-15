import type { FastifyInstance, FastifyRequest } from 'fastify';
import { db } from '../db/client.js';
import { hashSessionToken } from '../lib/session.js';
import { requiredPermission } from '../lib/permissions.js';

type Principal = { userId: string; sellerId: string; role: string; permissions: string[] | null };

declare module 'fastify' { interface FastifyRequest { principal?: Principal } }

export async function requireSeller(request: FastifyRequest) {
  const token = request.cookies.nx_session;
  if (!token) throw Object.assign(new Error('Authentication required'), { statusCode: 401 });
  const result = await db.query<Principal>('SELECT s.user_id AS "userId", s.seller_id AS "sellerId", s.role, s.permissions FROM sessions se JOIN seller_memberships s ON s.user_id = se.user_id JOIN sellers seller ON seller.id = s.seller_id WHERE se.token_hash = $1 AND se.revoked_at IS NULL AND se.expires_at > now() AND seller.state <> \'suspended\' LIMIT 1', [hashSessionToken(token)]);
  if (!result.rows[0]) throw Object.assign(new Error('Authentication required'), { statusCode: 401 });
  request.principal = result.rows[0];
  const granted = result.rows[0].permissions;
  if (granted && result.rows[0].role !== 'owner') {
    const needed = requiredPermission(request.method, request.routeOptions.url ?? request.url, request.body);
    if (needed && !granted.includes(needed)) throw Object.assign(new Error('Your account does not have permission for this action'), { statusCode: 403 });
  }
}

export async function sellerRoutes(app: FastifyInstance) {
  app.get('/v1/seller/me', { preHandler: requireSeller }, async (request) => {
    const principal = request.principal!;
    const result = await db.query('SELECT s.id, s.legal_name, s.slug, s.state, s.created_at, u.full_name, u.email, m.role, m.permissions FROM sellers s JOIN seller_memberships m ON m.seller_id = s.id JOIN users u ON u.id = m.user_id WHERE s.id = $1 AND u.id = $2', [principal.sellerId, principal.userId]);
    return result.rows[0];
  });
}
