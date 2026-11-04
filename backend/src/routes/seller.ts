import type { FastifyInstance, FastifyRequest } from 'fastify';
import { db, withTransaction } from '../db/client.js';
import { hashSessionToken, IDLE_SQL, STALE_SQL } from '../lib/session.js';
import { requiredPermission } from '../lib/permissions.js';
import { AGREEMENT_VERSION, loadOnboardingState } from '../lib/onboarding.js';
import { audit } from '../lib/audit.js';

type Principal = { userId: string; sellerId: string; role: string; permissions: string[] | null };
type SessionRow = Principal & { stale: boolean; sessionId: string };

declare module 'fastify' { interface FastifyRequest { principal?: Principal } }

export async function requireSeller(request: FastifyRequest) {
  const token = request.cookies.nx_session;
  if (!token) throw Object.assign(new Error('Authentication required'), { statusCode: 401 });
  const result = await db.query<SessionRow>(`SELECT s.user_id AS "userId", s.seller_id AS "sellerId", s.role, s.permissions, se.id AS "sessionId", ${STALE_SQL} FROM sessions se JOIN seller_memberships s ON s.user_id = se.user_id JOIN sellers seller ON seller.id = s.seller_id WHERE se.token_hash = $1 AND se.revoked_at IS NULL AND se.expires_at > now() AND ${IDLE_SQL} AND seller.state <> 'suspended' AND seller.approval_status = 'approved' LIMIT 1`, [hashSessionToken(token)]);
  if (!result.rows[0]) throw Object.assign(new Error('Authentication required'), { statusCode: 401 });
  const { stale, sessionId, ...principal } = result.rows[0];
  // Any authenticated request is activity, so working in the panel keeps the idle timer fresh (one write per minute at most).
  if (stale) await db.query('UPDATE sessions SET last_seen_at = now() WHERE id = $1', [sessionId]);
  request.principal = principal;
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
    // Onboarding progress drives the gate in the web app (agreement first, then KYC).
    return { ...result.rows[0], onboarding: await loadOnboardingState(principal.sellerId), agreementVersion: AGREEMENT_VERSION };
  });

  // The owner accepts the seller agreement once per version; the time, user and version are kept as evidence.
  app.post('/v1/seller/agreement', { preHandler: requireSeller }, async (request, reply) => {
    const principal = request.principal!;
    if (principal.role !== 'owner') throw Object.assign(new Error('Only the account owner can accept the agreement'), { statusCode: 403 });
    await withTransaction(async (client) => {
      await client.query('UPDATE sellers SET agreement_accepted_at = now(), agreement_accepted_by = $2, agreement_version = $3 WHERE id = $1', [principal.sellerId, principal.userId, AGREEMENT_VERSION]);
      await audit(client, { sellerId: principal.sellerId, actorUserId: principal.userId, action: 'agreement.accepted', targetType: 'seller', targetId: principal.sellerId, requestId: request.id, metadata: { version: AGREEMENT_VERSION } });
    });
    return reply.code(201).send({ accepted: true, version: AGREEMENT_VERSION });
  });
}
