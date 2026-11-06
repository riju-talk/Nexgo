import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { withSellerTransaction } from '../db/client.js';
import { audit } from '../lib/audit.js';
import { requireOnboarded } from '../lib/onboarding.js';
import { requireSeller } from './seller.js';

/**
 * Queue courier assignment instead of doing it inside the request:
 *   POST /v1/shipments/assign-batch        queue up to 2,000 orders; answers at once with the batch id
 *   GET  /v1/shipments/assign-batch/:id    progress (+ per-order results once finished)
 *   GET  /v1/shipments/assign-batch/active the seller's unfinished batch, if any (so Track can show progress after a refresh)
 * The booking itself runs in the worker (lib/assignQueue.ts) through the same assignOneOrder() the old request used.
 */
const MAX_ORDERS = 2000;
const uuid = z.string().uuid();
const code = z.string().regex(/^[a-z0-9-]{2,64}$/);

function principal(request: FastifyRequest) {
  if (!request.principal) throw Object.assign(new Error('Authentication required'), { statusCode: 401 });
  return request.principal;
}

const progressSql = `SELECT b.id, b.total, b.created_at, b.finished_at,
    count(*) FILTER (WHERE i.state = 'ok')::int AS assigned, count(*) FILTER (WHERE i.state = 'failed')::int AS failed,
    count(*) FILTER (WHERE i.state = 'running')::int AS running, count(*) FILTER (WHERE i.state = 'queued')::int AS queued,
    (SELECT i2.error FROM assign_batch_items i2 WHERE i2.batch_id = b.id AND i2.state = 'failed' ORDER BY i2.finished_at LIMIT 1) AS first_error
  FROM assign_batches b LEFT JOIN assign_batch_items i ON i.batch_id = b.id WHERE b.seller_id = $1`;

export async function assignBatchRoutes(app: FastifyInstance) {
  app.post('/v1/shipments/assign-batch', { preHandler: [requireSeller, requireOnboarded('ship')] }, async (request, reply) => {
    const input = z.object({ orderIds: z.array(uuid).min(1).max(MAX_ORDERS), providerCode: code.optional(), serviceCode: code.optional() }).parse(request.body);
    const p = principal(request);
    const ids = [...new Set(input.orderIds)];
    const created = await withSellerTransaction(p.sellerId, async (client) => {
      // Only this seller's orders that still have no courier.
      const eligible = await client.query<{ id: string }>(
        `SELECT o.id FROM orders o WHERE o.seller_id = $1 AND o.id = ANY($2::uuid[]) AND o.state IN ('new', 'ready_to_ship')
           AND NOT EXISTS (SELECT 1 FROM shipments s WHERE s.order_id = o.id)`, [p.sellerId, ids]);
      if (!eligible.rows.length) return { batchId: null as string | null, queued: 0 };
      const batch = await client.query<{ id: string }>(
        `INSERT INTO assign_batches (seller_id, created_by, provider_code, service_code, total) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [p.sellerId, p.userId, input.providerCode ?? null, input.serviceCode ?? null, eligible.rows.length]);
      const batchId = batch.rows[0].id;
      // An order already waiting in another batch is skipped (unique index), so a double click never books twice.
      const inserted = await client.query(
        `INSERT INTO assign_batch_items (batch_id, seller_id, order_id) SELECT $1, $2, x FROM unnest($3::uuid[]) AS x ON CONFLICT DO NOTHING`,
        [batchId, p.sellerId, eligible.rows.map((r) => r.id)]);
      const queued = inserted.rowCount ?? 0;
      if (!queued) { await client.query('DELETE FROM assign_batches WHERE id = $1', [batchId]); return { batchId: null, queued: 0 }; }
      if (queued !== eligible.rows.length) await client.query('UPDATE assign_batches SET total = $2 WHERE id = $1', [batchId, queued]);
      await audit(client, { sellerId: p.sellerId, actorUserId: p.userId, action: 'shipment.assign_batch_queued', targetType: 'assign_batch', targetId: batchId, requestId: request.id, metadata: { orders: queued, courier: input.providerCode ?? 'by priority list' } });
      return { batchId, queued };
    });
    const skipped = ids.length - created.queued;
    return reply.code(created.batchId ? 202 : 200).send({ id: created.batchId, queued: created.queued, skipped });
  });

  app.get('/v1/shipments/assign-batch/active', { preHandler: requireSeller }, async (request) => {
    const p = principal(request);
    return withSellerTransaction(p.sellerId, async (client) => {
      const r = await client.query(`${progressSql} AND b.finished_at IS NULL GROUP BY b.id ORDER BY b.created_at DESC LIMIT 1`, [p.sellerId]);
      return { batch: r.rows[0] ?? null };
    });
  });

  app.get('/v1/shipments/assign-batch/:id', { preHandler: requireSeller }, async (request, reply) => {
    const id = uuid.parse((request.params as { id: string }).id);
    const p = principal(request);
    return withSellerTransaction(p.sellerId, async (client) => {
      const r = await client.query(`${progressSql} AND b.id = $2 GROUP BY b.id`, [p.sellerId, id]);
      if (!r.rows[0]) return reply.code(404).send({ error: 'BATCH_NOT_FOUND' });
      const batch = r.rows[0];
      // Per-order results only once the batch is over (keeps the progress polls small).
      const results = batch.finished_at
        ? (await client.query<{ order_id: string; state: string; awb: string | null; courier: string | null; error: string | null }>(
            `SELECT order_id, state, awb, courier, error FROM assign_batch_items WHERE batch_id = $1`, [id])).rows
            .map((x) => ({ orderId: x.order_id, ok: x.state === 'ok', awb: x.awb ?? undefined, courier: x.courier ?? undefined, error: x.error ?? undefined }))
        : undefined;
      return { ...batch, done: batch.assigned + batch.failed, results };
    });
  });
}
