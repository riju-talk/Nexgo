import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { withSellerTransaction } from '../db/client.js';
import { audit } from '../lib/audit.js';
import { requireSeller } from './seller.js';

/**
 * Cancel any number of shipments (and never-shipped orders) without keeping the page waiting:
 *   POST /v1/shipments/cancel-batch        queue up to 2,000; answers at once with the batch id
 *   GET  /v1/shipments/cancel-batch/:id    progress (+ per-item results and the total refunded once finished)
 *   GET  /v1/shipments/cancel-batch/active the seller's unfinished batch, if any (so the page can show progress after a refresh)
 * The worker (lib/cancelQueue.ts) cancels them through cancelShipment(), the same code as the single Cancel button.
 */
const MAX_ITEMS = 2000;
const uuid = z.string().uuid();

function principal(request: FastifyRequest) {
  if (!request.principal) throw Object.assign(new Error('Authentication required'), { statusCode: 401 });
  return request.principal;
}

const progressSql = `SELECT b.id, b.total, b.created_at, b.finished_at,
    count(*) FILTER (WHERE i.state = 'ok')::int AS cancelled, count(*) FILTER (WHERE i.state = 'failed')::int AS failed,
    count(*) FILTER (WHERE i.state = 'running')::int AS running, count(*) FILTER (WHERE i.state = 'queued')::int AS queued,
    COALESCE(sum(i.refunded_paise) FILTER (WHERE i.state = 'ok'), 0)::bigint AS refunded_paise,
    (SELECT i2.error FROM cancel_batch_items i2 WHERE i2.batch_id = b.id AND i2.state = 'failed' ORDER BY i2.finished_at LIMIT 1) AS first_error
  FROM cancel_batches b LEFT JOIN cancel_batch_items i ON i.batch_id = b.id WHERE b.seller_id = $1`;

export async function cancelBatchRoutes(app: FastifyInstance) {
  app.post('/v1/shipments/cancel-batch', { preHandler: requireSeller }, async (request, reply) => {
    const input = z.object({ shipmentIds: z.array(uuid).max(MAX_ITEMS).default([]), orderIds: z.array(uuid).max(MAX_ITEMS).default([]) })
      .refine((v) => v.shipmentIds.length + v.orderIds.length > 0, { message: 'Choose at least one shipment or order to cancel.' }).parse(request.body);
    const p = principal(request);
    const shipmentIds = [...new Set(input.shipmentIds)]; const orderIds = [...new Set(input.orderIds)];
    const created = await withSellerTransaction(p.sellerId, async (client) => {
      // Only this seller's shipments that can still be cancelled, and orders that never got a courier.
      const ships = shipmentIds.length ? (await client.query<{ id: string }>(`SELECT id FROM shipments WHERE seller_id = $1 AND id = ANY($2::uuid[]) AND state IN ('booked','pickup_pending','pickup_scheduled')`, [p.sellerId, shipmentIds])).rows : [];
      const ords = orderIds.length ? (await client.query<{ id: string }>(`SELECT o.id FROM orders o WHERE o.seller_id = $1 AND o.id = ANY($2::uuid[]) AND o.state IN ('draft','new','ready_to_ship') AND NOT EXISTS (SELECT 1 FROM shipments s WHERE s.order_id = o.id)`, [p.sellerId, orderIds])).rows : [];
      if (!ships.length && !ords.length) return { batchId: null as string | null, queued: 0 };
      const batch = await client.query<{ id: string }>(`INSERT INTO cancel_batches (seller_id, created_by, total) VALUES ($1, $2, $3) RETURNING id`, [p.sellerId, p.userId, ships.length + ords.length]);
      const batchId = batch.rows[0].id;
      let queued = 0;
      if (ships.length) queued += (await client.query(`INSERT INTO cancel_batch_items (batch_id, seller_id, kind, shipment_id) SELECT $1, $2, 'shipment', x FROM unnest($3::uuid[]) AS x ON CONFLICT DO NOTHING`, [batchId, p.sellerId, ships.map((r) => r.id)])).rowCount ?? 0;
      if (ords.length) queued += (await client.query(`INSERT INTO cancel_batch_items (batch_id, seller_id, kind, order_id) SELECT $1, $2, 'order', x FROM unnest($3::uuid[]) AS x ON CONFLICT DO NOTHING`, [batchId, p.sellerId, ords.map((r) => r.id)])).rowCount ?? 0;
      if (!queued) { await client.query('DELETE FROM cancel_batches WHERE id = $1', [batchId]); return { batchId: null, queued: 0 }; }
      if (queued !== ships.length + ords.length) await client.query('UPDATE cancel_batches SET total = $2 WHERE id = $1', [batchId, queued]);
      await audit(client, { sellerId: p.sellerId, actorUserId: p.userId, action: 'shipment.cancel_batch_queued', targetType: 'cancel_batch', targetId: batchId, requestId: request.id, metadata: { shipments: ships.length, orders: ords.length } });
      return { batchId, queued };
    });
    const skipped = shipmentIds.length + orderIds.length - created.queued;
    return reply.code(created.batchId ? 202 : 200).send({ id: created.batchId, queued: created.queued, skipped });
  });

  app.get('/v1/shipments/cancel-batch/active', { preHandler: requireSeller }, async (request) => {
    const p = principal(request);
    return withSellerTransaction(p.sellerId, async (client) => {
      const r = await client.query(`${progressSql} AND b.finished_at IS NULL GROUP BY b.id ORDER BY b.created_at DESC LIMIT 1`, [p.sellerId]);
      return { batch: r.rows[0] ? { ...r.rows[0], refunded_paise: Number(r.rows[0].refunded_paise), done: r.rows[0].cancelled + r.rows[0].failed } : null };
    });
  });

  app.get('/v1/shipments/cancel-batch/:id', { preHandler: requireSeller }, async (request, reply) => {
    const id = uuid.parse((request.params as { id: string }).id);
    const p = principal(request);
    return withSellerTransaction(p.sellerId, async (client) => {
      const r = await client.query(`${progressSql} AND b.id = $2 GROUP BY b.id`, [p.sellerId, id]);
      if (!r.rows[0]) return reply.code(404).send({ error: 'BATCH_NOT_FOUND' });
      const batch = { ...r.rows[0], refunded_paise: Number(r.rows[0].refunded_paise) };
      // Per-item results only once the batch is over (keeps the progress polls small).
      const results = batch.finished_at
        ? (await client.query<{ shipment_id: string | null; order_id: string | null; state: string; refunded_paise: string; error: string | null }>(
            `SELECT shipment_id, order_id, state, refunded_paise::text, error FROM cancel_batch_items WHERE batch_id = $1`, [id])).rows
            .map((x) => ({ shipmentId: x.shipment_id ?? undefined, orderId: x.order_id ?? undefined, ok: x.state === 'ok', refundedPaise: Number(x.refunded_paise), error: x.error ?? undefined }))
        : undefined;
      return { ...batch, done: batch.cancelled + batch.failed, results };
    });
  });
}
