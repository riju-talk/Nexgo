import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db, withTransaction } from '../db/client.js';
import { audit } from '../lib/audit.js';
import { requireAccountAdmin, requirePlatformAdmin } from '../lib/adminAuth.js';

// Admin side of weight management: the platform sees every seller's discrepancy and records the courier's decision.
//   won  -> the courier withdrew the extra charge; nothing is debited (the seller was never charged).
//   lost -> the extra charge stands; it is debited from the seller's wallet once (same idempotency key as "accept").
export async function adminDisputeRoutes(app: FastifyInstance) {
  app.get('/v1/admin/weight-disputes', { preHandler: requirePlatformAdmin }, async (request) => {
    const q = z.object({
      status: z.enum(['open', 'disputed', 'accepted', 'won', 'lost', 'withdrawn']).optional(), q: z.string().trim().max(80).optional(), sellerId: z.string().uuid().optional(),
      page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(10),
    }).parse(request.query);
    const where: string[] = []; const params: unknown[] = [];
    const add = (sql: string, v: unknown) => { params.push(v); where.push(sql.replaceAll('?', `$${params.length}`)); };
    if (q.status) add('wd.status = ?::dispute_status_enum', q.status);
    if (q.sellerId) add('wd.seller_id = ?', q.sellerId);
    if (q.q) { params.push(`%${q.q}%`); where.push(`(s.awb ILIKE $${params.length} OR o.order_number ILIKE $${params.length} OR sl.legal_name ILIKE $${params.length})`); }
    const from = `FROM weight_disputes wd JOIN shipments s ON s.id = wd.shipment_id JOIN orders o ON o.id = s.order_id JOIN sellers sl ON sl.id = wd.seller_id JOIN courier_providers cp ON cp.id = wd.raised_by_provider ${where.length ? `WHERE ${where.join(' AND ')}` : ''}`;
    const total = Number((await db.query<{ n: string }>(`SELECT count(*) AS n ${from}`, params)).rows[0].n);
    const rows = await db.query(
      `SELECT wd.id, wd.status, wd.declared_weight_g, wd.billed_weight_g, wd.difference_g, wd.original_charge_paise, wd.disputed_charge_paise, wd.additional_charge_paise, wd.held_amount_paise,
              wd.seller_notes, wd.courier_notes, wd.raised_at, wd.dispute_deadline, wd.resolved_at, s.awb, o.order_number, sl.id AS seller_id, sl.legal_name AS seller_name, cp.name AS courier_name
       ${from} ORDER BY (wd.status IN ('open','disputed')) DESC, wd.dispute_deadline ASC, wd.id LIMIT ${q.pageSize} OFFSET ${(q.page - 1) * q.pageSize}`, params);
    const counts = await db.query(`SELECT status::text, count(*)::int AS n, COALESCE(sum(additional_charge_paise),0)::bigint AS amount FROM weight_disputes GROUP BY status`);
    return { items: rows.rows, total, page: q.page, pageSize: q.pageSize, pages: Math.max(1, Math.ceil(total / q.pageSize)), counts: Object.fromEntries(counts.rows.map((r) => [r.status, { n: r.n, amountPaise: Number(r.amount) }])) };
  });

  app.post('/v1/admin/weight-disputes/:disputeId/resolve', { preHandler: [requirePlatformAdmin, requireAccountAdmin] }, async (request, reply) => {
    const id = z.string().uuid().parse((request.params as { disputeId: string }).disputeId);
    const input = z.object({ outcome: z.enum(['won', 'lost']), note: z.string().trim().max(1000).optional() }).parse(request.body);
    const admin = request.adminPrincipal!;
    const result = await withTransaction(async (client) => {
      const current = (await client.query<{ status: string; seller_id: string; additional_charge_paise: number }>('SELECT status, seller_id, additional_charge_paise FROM weight_disputes WHERE id = $1 FOR UPDATE', [id])).rows[0];
      if (!current) return { error: 'DISPUTE_NOT_FOUND', status: 404 as number };
      if (current.status !== 'disputed') return { error: `Only disputed cases can be resolved (this one is ${current.status})`, status: 409 as number };
      const updated = (await client.query(`UPDATE weight_disputes SET status = $1::dispute_status_enum, courier_notes = COALESCE($2, courier_notes), resolved_at = now(), updated_at = now() WHERE id = $3 RETURNING id, status, resolved_at`, [input.outcome, input.note ?? null, id])).rows[0];
      await client.query(`INSERT INTO weight_dispute_history (dispute_id, from_status, to_status, changed_by, notes) VALUES ($1, 'disputed', $2::dispute_status_enum, $3, $4)`, [id, input.outcome, admin.userId, input.note ?? null]);
      if (input.outcome === 'lost' && current.additional_charge_paise > 0) {
        await client.query(`INSERT INTO wallet_entries (seller_id, entry_type, amount_paise, reference_type, reference_id, idempotency_key, description) VALUES ($1, 'debit', $2, 'weight_dispute', $3, $4, $5) ON CONFLICT (seller_id, idempotency_key) DO NOTHING`,
          [current.seller_id, current.additional_charge_paise, id, `weight-dispute-${id}`, `Weight dispute lost: additional charge for dispute ${id}`]);
      }
      await audit(client, { sellerId: current.seller_id, actorUserId: admin.userId, action: `weight_dispute.admin_${input.outcome}`, targetType: 'weight_dispute', targetId: id, requestId: request.id, metadata: { outcome: input.outcome, amountPaise: input.outcome === 'lost' ? current.additional_charge_paise : 0 } });
      return { row: updated };
    });
    if (!('row' in result)) return reply.code(result.status).send({ error: result.error });
    return result.row;
  });

  app.get('/v1/admin/tds', { preHandler: requirePlatformAdmin }, async () => ({
    items: (await db.query(`SELECT t.*, s.legal_name AS seller_name FROM tds_entries t JOIN sellers s ON s.id = t.seller_id ORDER BY t.created_at DESC LIMIT 200`)).rows,
  }));
}
