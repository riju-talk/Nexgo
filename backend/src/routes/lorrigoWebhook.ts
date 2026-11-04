import { createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { PoolClient } from 'pg';
import { config } from '../config.js';
import { withTransaction } from '../db/client.js';
import { isProgressionAllowed, type CanonicalShipmentState } from '../lib/courier.js';

// Lorrigo pushes every tracking change to the URL saved in its dashboard (Webhooks), with the token we chose in the x-api-key header.
// The payload carries the whole history, so each delivery is replayed idempotently: an event row is unique per (shipment, source, event id).
type Mapped = { state: CanonicalShipmentState; rto?: 'in_transit' | 'out_for_delivery' | 'delivered' };
const LORRIGO_STATUS: Record<string, Mapped> = {
  PICKED_UP: { state: 'in_transit' }, IN_TRANSIT: { state: 'in_transit' }, OUT_FOR_DELIVERY: { state: 'out_for_delivery' }, DELIVERED: { state: 'delivered' }, NDR: { state: 'ndr' },
  RTO_INITIATED: { state: 'rto' }, RTO_IN_TRANSIT: { state: 'rto', rto: 'in_transit' }, REACHED_BACK_AT_SELLER_CITY: { state: 'rto', rto: 'in_transit' },
  RTO_OFD: { state: 'rto', rto: 'out_for_delivery' }, RTO_DELIVERED: { state: 'rto', rto: 'delivered' }, LOST: { state: 'lost' },
};
// Known statuses that need no action (booking already recorded them), so they are not reported as "unmapped".
const IGNORED = new Set(['NEW', 'PICKUP_SCHEDULED', 'OUT_FOR_PICKUP']);
// CANCELLED is deliberately not applied from the webhook: a cancellation made on Lorrigo's side has to go through NEXGO's own cancel flow so the
// wallet refund happens exactly once. It is logged below so support can act on it.
const normalize = (s: unknown) => String(s ?? '').trim().toUpperCase().replace(/[\s-]+/g, '_');
const safeEqual = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };

type TrackingEvent = { status?: string; location?: string | null; description?: string | null; timestamp?: string };
type Item = { awb?: string | number; status?: string; location?: string; description?: string; tracking_events?: TrackingEvent[] };
type Shipment = { id: string; seller_id: string; state: CanonicalShipmentState };

async function applyEvent(tx: PoolClient, s: Shipment, m: Mapped, at: string, location: string | null, description: string, eventId: string, raw: unknown): Promise<void> {
  const fresh = await tx.query("INSERT INTO shipment_events (shipment_id,state,occurred_at,location,description,source,source_event_id,raw_payload) VALUES ($1,$2,$3,$4,$5,'courier_webhook',$6,$7) ON CONFLICT DO NOTHING RETURNING id", [s.id, m.state, at, location?.slice(0, 200) ?? null, description.slice(0, 500), eventId, JSON.stringify(raw)]);
  if (!fresh.rows[0]) return; // already processed on an earlier delivery
  // Couriers skip scans and a history can have gaps, so a booked shipment may jump ahead (e.g. straight to delivered). Going backwards is still refused.
  const skipsAhead = ['booked', 'pickup_pending', 'pickup_scheduled'].includes(s.state) && ['out_for_delivery', 'delivered', 'ndr', 'rto'].includes(m.state);
  if (!skipsAhead && !isProgressionAllowed(s.state, m.state)) return; // kept in the timeline, state stays (e.g. a stale scan arriving late)
  await tx.query(`UPDATE shipments SET state=$1::shipment_state,updated_at=now(),
    pickup_completed_at=CASE WHEN $1 IN ('in_transit','out_for_delivery','delivered') THEN COALESCE(pickup_completed_at,$3::timestamptz) ELSE pickup_completed_at END,
    delivered_at=CASE WHEN $1='delivered' THEN COALESCE(delivered_at,$3::timestamptz) ELSE delivered_at END,
    rto_initiated_at=CASE WHEN $1='rto' THEN COALESCE(rto_initiated_at,$3::timestamptz) ELSE rto_initiated_at END WHERE id=$2`, [m.state, s.id, at]);
  if (m.rto) await tx.query("UPDATE shipments SET rto_status=$1, rto_delivered_at=CASE WHEN $1='delivered' THEN COALESCE(rto_delivered_at,$3::timestamptz) ELSE rto_delivered_at END WHERE id=$2", [m.rto, s.id, at]);
  if (m.state === 'ndr') await tx.query("INSERT INTO ndr_cases (seller_id,shipment_id,reason_code,reason_detail,ndr_reason,courier_notes) VALUES ($1,$2,'courier_ndr',$3,'other',$3) ON CONFLICT (shipment_id) DO NOTHING", [s.seller_id, s.id, description.slice(0, 500)]);
  s.state = m.state;
}

// Accepts { data: {...} }, { data: [...] }, a flat { awb, ... } or a bare array, so a change in Lorrigo's envelope cannot silently drop updates.
function items(body: unknown): Item[] {
  const list = Array.isArray(body) ? body : body && typeof body === 'object' ? ((body as { data?: unknown }).data ?? body) : [];
  return (Array.isArray(list) ? list : [list]).filter((x): x is Item => !!x && typeof x === 'object' && x.awb !== undefined && x.awb !== null && String(x.awb).trim() !== '').slice(0, 100);
}

type Outcome = 'processed' | 'duplicate' | 'unknown';
async function processItem(item: Item, rawBody: string, log: { warn: (o: object, m: string) => void }): Promise<Outcome> {
  const awb = String(item.awb).trim(); if (awb.length > 64) return 'unknown';
  const bodyHash = createHash('sha256').update(`${awb}|${rawBody}`).digest('hex');
  return withTransaction(async (tx) => {
    const delivery = await tx.query("INSERT INTO webhook_deliveries (provider_code,external_event_id,payload_hash,payload) VALUES ('lorrigo',$1,$2,$3) ON CONFLICT (provider_code, external_event_id) DO NOTHING RETURNING id", [bodyHash, bodyHash, JSON.stringify(item)]);
    if (!delivery.rows[0]) return 'duplicate' as const;
    const found = await tx.query<Shipment>("SELECT s.id,s.seller_id,s.state::text AS state FROM shipments s JOIN courier_providers cp ON cp.id=s.provider_id WHERE s.awb=$1 AND cp.aggregator='lorrigo' FOR UPDATE OF s", [awb]);
    const shipment = found.rows[0];
    // Not remembered as a delivery: the webhook can beat our own booking commit, and Lorrigo's identical retry must still be processed.
    if (!shipment) { await tx.query('DELETE FROM webhook_deliveries WHERE id=$1', [delivery.rows[0].id]); return 'unknown' as const; }

    const events = (Array.isArray(item.tracking_events) ? item.tracking_events : [])
      .map((e) => ({ ...e, status: normalize(e?.status), t: Date.parse(String(e?.timestamp ?? '')) }))
      .filter((e) => LORRIGO_STATUS[e.status] && Number.isFinite(e.t)).sort((a, b) => a.t - b.t);
    for (const e of events) await applyEvent(tx, shipment, LORRIGO_STATUS[e.status], new Date(e.t).toISOString(), e.location ?? null, e.description || e.status, createHash('sha1').update(`${awb}|${e.status}|${e.timestamp}`).digest('hex'), e);

    const topStatus = normalize(item.status); const top = LORRIGO_STATUS[topStatus]; // covers a payload whose history is missing or shorter than the current status
    if (top && top.state !== shipment.state) await applyEvent(tx, shipment, top, new Date().toISOString(), item.location ?? null, item.description || topStatus, `status:${topStatus}`, { status: item.status });
    let note: string | null = null;
    if (topStatus && !top && !IGNORED.has(topStatus)) { note = `Unmapped Lorrigo status: ${topStatus}`; log.warn({ awb, status: topStatus }, note); } // e.g. CANCELLED, LOST: needs a person
    await tx.query('UPDATE webhook_deliveries SET processed_at=now(),processing_error=$2 WHERE id=$1', [delivery.rows[0].id, note]);
    return 'processed' as const;
  });
}

export async function lorrigoWebhookRoutes(app: FastifyInstance) {
  // A long shipment history is large (the samples are ~12 KB each), and a batch can hold several, so the default 1 MB limit is raised.
  // The URL registered in Lorrigo is /v1/webhooks/lorrigo; /v2 is an alias that nothing points at.
  for (const path of ['/v2/webhooks/lorrigo', '/v1/webhooks/lorrigo']) app.post(path, { bodyLimit: 5_000_000, config: { rawBody: true, rateLimit: { max: 1200, timeWindow: '1 minute' } } }, async (request, reply) => {
    if (!config.LORRIGO_WEBHOOK_TOKEN) return reply.code(503).send({ error: 'LORRIGO_WEBHOOKS_NOT_CONFIGURED' });
    const token = request.headers['x-api-key'];
    if (typeof token !== 'string' || !safeEqual(token, config.LORRIGO_WEBHOOK_TOKEN)) return reply.code(401).send({ error: 'INVALID_WEBHOOK_TOKEN' });
    const list = items(request.body);
    if (!list.length) return { accepted: true, ignored: 'no awb' }; // also answers Lorrigo's "Test Webhook" button
    const raw = request.rawBody ? request.rawBody.toString() : JSON.stringify(request.body);
    const outcomes: Outcome[] = [];
    for (const item of list) outcomes.push(await processItem(item, raw, request.log)); // a database error throws -> 500 -> Lorrigo retries, and replays are idempotent
    if (outcomes.includes('unknown')) request.log.warn({ count: outcomes.filter((o) => o === 'unknown').length }, 'Lorrigo webhook for unknown AWB(s)');
    return { accepted: true, result: outcomes.length === 1 ? outcomes[0] : outcomes.includes('processed') ? 'processed' : outcomes[0] };
  });
}
