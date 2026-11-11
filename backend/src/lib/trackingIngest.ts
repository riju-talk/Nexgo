import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { withTransaction } from '../db/client.js';
import type { NormalizedUpdate } from '../couriers/aggregators/types.js';
import { applyShipmentStateEffects } from './shipmentEffects.js';
import { isProgressionAllowed, type CanonicalShipmentState } from './courier.js';
import { sellerSafeMessage } from './sellerSafeError.js';

// The shared part of tracking ingestion: record one courier event on a shipment, move its state forward (never backwards) and run the
// side effects (RTO freight billed once, NDR case opened / closed). Used by every aggregator's webhook and by tests that replay eventsator.
export type Mapped = { state: CanonicalShipmentState; rto?: 'in_transit' | 'out_for_delivery' | 'delivered' };

export type Shipment = { id: string; seller_id: string; state: CanonicalShipmentState };

export async function applyEvent(tx: PoolClient, s: Shipment, m: Mapped, at: string, location: string | null, description: string, eventId: string, raw: unknown): Promise<void> {
  description = sellerSafeMessage(description); // courier wording shown to sellers never names the aggregator
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
  await applyShipmentStateEffects(tx, s.seller_id, s.id, m.state); // RTO freight billed once, NDR case closed on delivery / return
}

export type IngestOutcome = 'processed' | 'duplicate' | 'unknown';

/**
 * One shipment's update from an aggregator's webhook (or poll), recorded once. A delivery is remembered by a hash of (awb + raw payload) in
 * webhook_deliveries, so Lorrigo-style retries are no-ops; an AWB we do not know is not remembered (the webhook can beat our own booking commit,
 * and the aggregator's identical retry must still be processed).
 */
export async function ingestUpdate(aggregator: string, update: NormalizedUpdate, rawBody: string, log: { warn: (o: object, m: string) => void }): Promise<IngestOutcome> {
  if (!update.awb || update.awb.length > 64) return 'unknown';
  const bodyHash = createHash('sha256').update(`${update.awb}|${rawBody}`).digest('hex');
  return withTransaction(async (tx) => {
    const delivery = await tx.query(
      'INSERT INTO webhook_deliveries (provider_code,external_event_id,payload_hash,payload) VALUES ($1,$2,$3,$4) ON CONFLICT (provider_code, external_event_id) DO NOTHING RETURNING id',
      [aggregator, bodyHash, bodyHash, JSON.stringify(update.raw ?? { awb: update.awb, events: update.events.length })]);
    if (!delivery.rows[0]) return 'duplicate' as const;
    const found = await tx.query<Shipment>('SELECT s.id,s.seller_id,s.state::text AS state FROM shipments s JOIN courier_providers cp ON cp.id=s.provider_id WHERE s.awb=$1 AND cp.aggregator=$2 FOR UPDATE OF s', [update.awb, aggregator]);
    const shipment = found.rows[0];
    if (!shipment) { await tx.query('DELETE FROM webhook_deliveries WHERE id=$1', [delivery.rows[0].id]); return 'unknown' as const; }
    for (const e of update.events) await applyEvent(tx, shipment, e.mapped, e.at, e.location, e.description, e.eventId, e);
    const c = update.current;
    if (c && c.mapped.state !== shipment.state) await applyEvent(tx, shipment, c.mapped, c.at, c.location, c.description, c.eventId, { status: c.description });
    let note: string | null = null;
    if (update.unmappedStatus) { note = `Unmapped ${aggregator} status: ${update.unmappedStatus}`; log.warn({ awb: update.awb, status: update.unmappedStatus }, note); } // e.g. CANCELLED: needs a person
    await tx.query('UPDATE webhook_deliveries SET processed_at=now(),processing_error=$2 WHERE id=$1', [delivery.rows[0].id, note]);
    return 'processed' as const;
  });
}
