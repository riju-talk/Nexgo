import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { db, withTransaction } from '../db/client.js';
import { requireAccountAdmin, requirePlatformAdmin } from '../lib/adminAuth.js';
import { notifyRegistrationDecision } from '../lib/registrationMail.js';

const uuid = z.string().uuid();
const listQuery = z.object({ status: z.enum(['pending', 'approved', 'rejected', 'all']).default('pending'), search: z.string().trim().max(100).optional() });

type Registration = { seller_id: string; legal_name: string; owner_name: string; owner_email: string; owner_id: string; approval_status: string };

// Seller sign-up requests. A new seller stays 'pending' (cannot sign in) until a platform admin approves it here;
// the owner is told by e-mail either way.
export async function adminRegistrationRoutes(app: FastifyInstance) {
  app.get('/v1/admin/registrations', { preHandler: requirePlatformAdmin }, async (request) => {
    const q = listQuery.parse(request.query);
    const result = await db.query(
      `SELECT s.id AS seller_id, s.legal_name, s.created_at, s.approval_status, s.approval_decided_at, s.approval_rejection_reason,
              owner.full_name AS owner_name, owner.email AS owner_email, decider.email AS decided_by_email
       FROM sellers s
       LEFT JOIN LATERAL (SELECT u.full_name, u.email FROM seller_memberships m JOIN users u ON u.id = m.user_id WHERE m.seller_id = s.id ORDER BY (m.role = 'owner') DESC, m.created_at LIMIT 1) owner ON true
       LEFT JOIN users decider ON decider.id = s.approval_decided_by
       WHERE ($1 = 'all' OR s.approval_status = $1)
         AND ($2::text IS NULL OR s.legal_name ILIKE '%' || $2 || '%' OR owner.email ILIKE '%' || $2 || '%')
       ORDER BY (s.approval_status = 'pending') DESC, s.created_at DESC LIMIT 200`,
      [q.status, q.search ?? null],
    );
    const pending = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM sellers WHERE approval_status = 'pending'`);
    return { items: result.rows, pendingCount: pending.rows[0].n };
  });

  async function decide(request: FastifyRequest, sellerId: string, approved: boolean, reason?: string) {
    const admin = request.adminPrincipal!;
    const reg = await withTransaction(async (client): Promise<Registration | 'missing' | 'decided'> => {
      const row = await client.query<Registration>(
        `SELECT s.id AS seller_id, s.legal_name, s.approval_status, owner.id AS owner_id, owner.full_name AS owner_name, owner.email AS owner_email
         FROM sellers s JOIN LATERAL (SELECT u.id, u.full_name, u.email FROM seller_memberships m JOIN users u ON u.id = m.user_id WHERE m.seller_id = s.id ORDER BY (m.role = 'owner') DESC, m.created_at LIMIT 1) owner ON true
         WHERE s.id = $1 FOR UPDATE OF s`, [sellerId]);
      if (!row.rows[0]) return 'missing';
      if (row.rows[0].approval_status !== 'pending') return 'decided';
      await client.query(
        `UPDATE sellers SET approval_status = $2, approval_decided_at = now(), approval_decided_by = $3, approval_rejection_reason = $4, updated_at = now() WHERE id = $1`,
        [sellerId, approved ? 'approved' : 'rejected', admin.userId, approved ? null : (reason ?? null)]);
      await client.query(
        `INSERT INTO audit_events (seller_id, actor_user_id, action, target_type, target_id, request_id, metadata) VALUES ($1::uuid, $2, $3, 'seller', $1::text, $4, $5)`,
        [sellerId, admin.userId, approved ? 'seller.registration_approved' : 'seller.registration_rejected', request.id, JSON.stringify({ reason: reason ?? null })]);
      return row.rows[0];
    });
    return reg;
  }

  app.post('/v1/admin/registrations/:sellerId/approve', { preHandler: [requirePlatformAdmin, requireAccountAdmin] }, async (request, reply) => {
    const sellerId = uuid.parse((request.params as { sellerId: string }).sellerId);
    const reg = await decide(request, sellerId, true);
    if (reg === 'missing') return reply.code(404).send({ error: 'SELLER_NOT_FOUND' });
    if (reg === 'decided') return reply.code(409).send({ error: 'ALREADY_DECIDED' });
    // The decision is saved first; the e-mail is best effort and its result is shown to the admin.
    const emailSent = await notifyRegistrationDecision({ email: reg.owner_email, fullName: reg.owner_name, businessName: reg.legal_name, approved: true });
    return { sellerId, approvalStatus: 'approved', emailSent };
  });

  app.post('/v1/admin/registrations/:sellerId/reject', { preHandler: [requirePlatformAdmin, requireAccountAdmin] }, async (request, reply) => {
    const sellerId = uuid.parse((request.params as { sellerId: string }).sellerId);
    const { reason } = z.object({ reason: z.string().trim().min(3).max(500) }).parse(request.body);
    const reg = await decide(request, sellerId, false, reason);
    if (reg === 'missing') return reply.code(404).send({ error: 'SELLER_NOT_FOUND' });
    if (reg === 'decided') return reply.code(409).send({ error: 'ALREADY_DECIDED' });
    const emailSent = await notifyRegistrationDecision({ email: reg.owner_email, fullName: reg.owner_name, businessName: reg.legal_name, approved: false, reason });
    return { sellerId, approvalStatus: 'rejected', emailSent };
  });
}
