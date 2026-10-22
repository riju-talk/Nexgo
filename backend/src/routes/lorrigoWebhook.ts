import { createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { PoolClient } from 'pg';
import { config } from '../config.js';
import { withTransaction } from '../db/client.js';
import { isProgressionAllowed, type CanonicalShipmentState } from '../lib/courier.js';

// Lorrigo pushes every tracking change to the URL saved in its dashboard (Webhooks), with the token we chose in the x-api-key header.
// The payload carries the whole history, so each delivery is replayed idempotently: an event row is unique per (shipment, source, event id).
type Mapped = { state: CanonicalShipmentState; rto?: 'in_transit' | 'out_for_delivery' | 'delivered' } | null;
const LORRIGO_STATUS: Record<string, Mapped> = {
  PICKED_UP: { state: 'in_transit' }, IN_TRANSIT: { state: 'in_transit' }, OUT_FOR_DELIVERY: { state: 'out_for_delivery' }, DELIVERED: { state: 'delivered' }, NDR: { state: 'ndr' },
  RTO_INITIATED: { state: 'rto' }, RTO_IN_TRANSIT: { state: 'rto', rto: 'in_transit' }, REACHED_BACK_AT_SELLER_CITY: { state: 'rto', rto: 'in_transit' },
  RTO_OFD: { state: 'rto', rto: 'out_for_delivery' }, RTO_DELIVERED: { state: 'rto', rto: 'delivered' }, CANCELLED: { state: 'cancelled' },
  // NEW, PICKUP_SCHEDULED and OUT_FOR_PICKUP are covered by the booking event; raw courier scan texts are not statuses at all.
};
const safeEqual = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };

type TrackingEvent = { status?: string; location?: string | null; description?: string | null; timestamp?: string };
type Shipment = { id: string; seller_id: string; state: CanonicalShipmentState };

async function applyEvent(tx: PoolClient, s: Shipment, m: NonNullable<Mapped>, at: string, location: string | null, description: string, eventId: string, raw: unknown): Promise<boolean> {
  const fresh = await tx.query("INSERT INTO shipment_events (shipment_id,state,occurred_at,location,description,source,source_event_id,raw_payload) VALUES ($1,$2,$3,$4,$5,'courier_webhook',$6,$7) ON CONFLICT DO NOTHING RETURNING id", [s.id, m.state, at, location, description, eventId, JSON.stringify(raw)]);
  if (!fresh.rows[0]) return false; // already processed on an earlier delivery
  if (!isProgressionAllowed(s.state, m.state)) return true; // kept in the timeline, state stays (e.g. a stale scan arriving late)
  await tx.query(`UPDATE shipments SET state=$1::shipment_state,updated_at=now(),
    pickup_completed_at=CASE WHEN $1 IN ('in_transit','out_for_delivery','delivered') THEN COALESCE(pickup_completed_at,$3::timestamptz) ELSE pickup_completed_at END,
    delivered_at=CASE WHEN $1='delivered' THEN COALESCE(delivered_at,$3::timestamptz) ELSE delivered_at END,
    rto_initiated_at=CASE WHEN $1='rto' THEN COALESCE(rto_initiated_at,$3::timestamptz) ELSE rto_initiated_at END,
    cancelled_at=CASE WHEN $1='cancelled' THEN COALESCE(cancelled_at,$3::timestamptz) ELSE cancelled_at END WHERE id=$2`, [m.state, s.id, at]);
  if (m.rto) await tx.query("UPDATE shipments SET rto_status=$1, rto_delivered_at=CASE WHEN $1='delivered' THEN COALESCE(rto_delivered_at,$3::timestamptz) ELSE rto_delivered_at END WHERE id=$2", [m.rto, s.id, at]);
  if (m.state === 'ndr') await tx.query("INSERT INTO ndr_cases (seller_id,shipment_id,reason_code,reason_detail,ndr_reason,courier_notes) VALUES ($1,$2,'courier_ndr',$3,'other',$3) ON CONFLICT (shipment_id) DO NOTHING", [s.seller_id, s.id, description]);
  s.state = m.state;
  return true;
}

export async function lorrigoWebhookRoutes(app: FastifyInstance) {
  app.post('/v1/webhooks/lorrigo', { config: { rawBody: true } }, async (request, reply) => {
    if (!config.LORRIGO_WEBHOOK_TOKEN) return reply.code(503).send({ error: 'LORRIGO_WEBHOOKS_NOT_CONFIGURED' });
    const token = request.headers['x-api-key'];
    if (typeof token !== 'string' || !safeEqual(token, config.LORRIGO_WEBHOOK_TOKEN)) return reply.code(401).send({ error: 'INVALID_WEBHOOK_TOKEN' });
    const data = (request.body as { data?: { awb?: string; status?: string; location?: string; description?: string; tracking_events?: TrackingEvent[] } } | null)?.data;
    if (!data?.awb) return { accepted: true, ignored: 'no awb' }; // also answers Lorrigo's "Test Webhook" button
    const raw = request.rawBody ? request.rawBody.toString() : JSON.stringify(request.body);
    const bodyHash = createHash('sha256').update(raw).digest('hex');

    const outcome = await withTransaction(async (tx) => {
      const delivery = await tx.query('INSERT INTO webhook_deliveries (provider_code,external_event_id,payload_hash,payload) VALUES (\'lorrigo\',$1,$2,$3) ON CONFLICT (provider_code, external_event_id) DO NOTHING RETURNING id', [bodyHash, bodyHash, JSON.stringify(request.body)]);
      if (!delivery.rows[0]) return 'duplicate' as const;
      const found = await tx.query<Shipment>("SELECT s.id,s.seller_id,s.state::text AS state FROM shipments s JOIN courier_providers cp ON cp.id=s.provider_id WHERE s.awb=$1 AND cp.code='lorrigo' FOR UPDATE OF s", [data.awb]);
      const shipment = found.rows[0];
      if (!shipment) { await tx.query("UPDATE webhook_deliveries SET processing_error='Shipment not found',processed_at=now() WHERE id=$1", [delivery.rows[0].id]); return 'unknown' as const; }
      const events = [...(data.tracking_events ?? [])].filter((e) => e.status && e.timestamp && LORRIGO_STATUS[e.status]).sort((a, b) => Date.parse(a.timestamp!) - Date.parse(b.timestamp!));
      for (const e of events) {
        const id = createHash('sha1').update(`${data.awb}|${e.status}|${e.timestamp}`).digest('hex');
        await applyEvent(tx, shipment, LORRIGO_STATUS[e.status!]!, e.timestamp!, e.location ?? null, e.description || e.status!, id, e);
      }
      const top = data.status ? LORRIGO_STATUS[data.status] : null; // covers a payload whose history is missing or shorter than the current status
      if (top && top.state !== shipment.state) await applyEvent(tx, shipment, top, new Date().toISOString(), data.location ?? null, data.description || data.status!, `status:${data.status}`, { status: data.status });
      await tx.query('UPDATE webhook_deliveries SET processed_at=now() WHERE id=$1', [delivery.rows[0].id]);
      return 'processed' as const;
    });
    if (outcome === 'unknown') request.log.warn({ awb: data.awb }, 'Lorrigo webhook for an unknown AWB');
    return { accepted: true, result: outcome };
  });
}
