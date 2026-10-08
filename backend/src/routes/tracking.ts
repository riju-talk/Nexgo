import type { FastifyInstance } from 'fastify';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { config } from '../config.js';
import { db, withSellerTransaction, withTransaction } from '../db/client.js';
import { isProgressionAllowed, mapCourierStatus, validWebhookSignature } from '../lib/courier.js';
import { requireSeller } from './seller.js';

const eventInput = z.object({ eventId: z.string().min(1).max(200), awb: z.string().min(4).max(100), status: z.string().min(2).max(100), occurredAt: z.string().datetime(), location: z.string().max(160).optional(), description: z.string().min(2).max(1000).optional() });

export async function trackingRoutes(app: FastifyInstance) {
  app.get('/v1/shipments/:shipmentId/tracking', { preHandler: requireSeller }, async (request) => {
    const seller = request.principal!; const shipmentId = z.string().uuid().parse((request.params as { shipmentId: string }).shipmentId);
    return withSellerTransaction(seller.sellerId, async (client) => {
      const exists = await client.query('SELECT 1 FROM shipments WHERE id=$1 AND seller_id=$2', [shipmentId, seller.sellerId]);
      if (!exists.rows[0]) throw Object.assign(new Error('Shipment not found'), { statusCode: 404 });
      return { items: (await client.query('SELECT state,occurred_at,location,description,source FROM shipment_events WHERE shipment_id=$1 ORDER BY occurred_at DESC', [shipmentId])).rows };
    });
  });

  app.post('/v1/webhooks/couriers/:providerCode', { config: { rawBody: true } }, async (request, reply) => {
    if (!config.COURIER_WEBHOOK_SECRET) return reply.code(503).send({ error: 'COURIER_WEBHOOKS_NOT_CONFIGURED' });
    if (!request.rawBody) return reply.code(400).send({ error: 'RAW_WEBHOOK_BODY_REQUIRED' });
    const raw = request.rawBody.toString();
    const signature = request.headers['x-nexgo-signature'];
    if (!validWebhookSignature(raw, typeof signature === 'string' ? signature : undefined, config.COURIER_WEBHOOK_SECRET)) return reply.code(401).send({ error: 'INVALID_WEBHOOK_SIGNATURE' });
    const input = eventInput.parse(request.body); const providerCode = z.string().regex(/^[a-z0-9-]{2,64}$/).parse((request.params as { providerCode: string }).providerCode);
    const bodyHash = createHash('sha256').update(raw).digest('hex');
    // Dedupe record and processing share one transaction: if processing throws, the dedupe row rolls back too,
    // so the courier's retry is processed instead of being swallowed as a duplicate.
    const outcome = await withTransaction(async (tx) => {
      const delivery = await tx.query<{ id: string }>('INSERT INTO webhook_deliveries (provider_code, external_event_id, payload_hash, payload) VALUES ($1,$2,$3,$4) ON CONFLICT (provider_code, external_event_id) DO NOTHING RETURNING id', [providerCode, input.eventId, bodyHash, JSON.stringify(input)]);
      if (!delivery.rows[0]) return { kind: 'duplicate' as const };
      const deliveryId = delivery.rows[0].id;
      const reject = async (status: number, error: string, reason: string) => {
        await tx.query('UPDATE webhook_deliveries SET processing_error=$1,processed_at=now() WHERE id=$2', [reason, deliveryId]);
        return { kind: 'rejected' as const, status, error };
      };
      const state = mapCourierStatus(input.status);
      if (!state) return reject(422, 'UNSUPPORTED_COURIER_STATUS', 'Unsupported courier status');
      const shipment = await tx.query<{ id: string; seller_id: string; state: typeof state }>('SELECT s.id,s.seller_id,s.state FROM shipments s JOIN courier_providers cp ON cp.id=s.provider_id WHERE s.awb=$1 AND cp.code=$2 FOR UPDATE OF s', [input.awb, providerCode]);
      if (!shipment.rows[0]) return reject(404, 'SHIPMENT_NOT_FOUND', 'Shipment not found');
      const current = shipment.rows[0];
      if (!isProgressionAllowed(current.state, state)) return reject(409, 'INVALID_SHIPMENT_TRANSITION', `Invalid transition ${current.state} -> ${state}`);
      await tx.query('INSERT INTO shipment_events (shipment_id,state,occurred_at,location,description,source,source_event_id,raw_payload) VALUES ($1,$2,$3,$4,$5,\'courier_webhook\',$6,$7)', [current.id, state, input.occurredAt, input.location ?? null, input.description ?? input.status, input.eventId, JSON.stringify(input)]);
      // Lifecycle timestamps feed the SLA / courier-analytics reports; COALESCE keeps the first time a state was reached.
      await tx.query(`UPDATE shipments SET state=$1::shipment_state,updated_at=now(),
        pickup_completed_at=CASE WHEN $1 IN ('in_transit','out_for_delivery','delivered') THEN COALESCE(pickup_completed_at,$3::timestamptz) ELSE pickup_completed_at END,
        delivered_at=CASE WHEN $1='delivered' THEN COALESCE(delivered_at,$3::timestamptz) ELSE delivered_at END,
        rto_initiated_at=CASE WHEN $1='rto' THEN COALESCE(rto_initiated_at,$3::timestamptz) ELSE rto_initiated_at END,
        cancelled_at=CASE WHEN $1='cancelled' THEN COALESCE(cancelled_at,$3::timestamptz) ELSE cancelled_at END WHERE id=$2`, [state, current.id, input.occurredAt]);
      if (state === 'ndr') await tx.query(`INSERT INTO ndr_cases (seller_id,shipment_id,reason_code,reason_detail,ndr_reason,courier_notes)
        VALUES ($1,$2,$3,$4,'other',$4) ON CONFLICT (shipment_id) DO NOTHING`, [current.seller_id, current.id, 'courier_ndr', input.description ?? input.status]);
      await tx.query('UPDATE webhook_deliveries SET processed_at=now() WHERE id=$1', [deliveryId]);
      return { kind: 'processed' as const };
    });
    if (outcome.kind === 'duplicate') return { accepted: true, duplicate: true };
    if (outcome.kind === 'rejected') return reply.code(outcome.status).send({ error: outcome.error });
    return { accepted: true, duplicate: false };
  });
}
