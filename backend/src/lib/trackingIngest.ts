import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { withTransaction } from '../db/client.js';
import type { NormalizedUpdate } from '../couriers/aggregators/types.js';
import { applyShipmentStateEffects } from './shipmentEffects.js';
import { isProgressionAllowed, type CanonicalShipmentState } from './courier.js';
import { sellerSafeMessage } from './sellerSafeError.js';
import { invalidateMetrics } from './metrics.js';

// The shared part of tracking ingestion: record one courier event on a shipment, move its state forward (never backwards) and run the
// side effects (RTO freight billed once, NDR case opened / closed). Used by every aggregator's webhook and by tests that replay eventsator.
export type Mapped = { state: CanonicalShipmentState; rto?: 'in_transit' | 'out_for_delivery' | 'delivered' };

export type Shipment = { id: string; seller_id: string; state: CanonicalShipmentState };

/** The NDR reason from the courier's own wording (the courier sends free text), so the reason charts show real reasons instead of "Other". */
export function ndrReasonFrom(text: string): string {
  const t = text.toLowerCase();
  if (/refus|rejected by (the )?customer|not accepted/.test(t)) return 'refused_delivery';
  if (/reschedul|asked (for )?(a )?(later|another)|postpone/.test(t)) return 'customer_requested_reschedule';
  if (/(incomplete|insufficient|short) address|address (is )?(incomplete|insufficient)/.test(t)) return 'address_incomplete';
  if (/(wrong|incorrect|invalid|bad) address|address (not found|incorrect|wrong)|landmark/.test(t)) return 'address_incorrect';
  if (/cod|payment|cash not|amount not ready/.test(t)) return 'payment_not_ready';
  if (/closed|shut|locked premises|office closed|shop closed/.test(t)) return 'premises_closed';
  if (/not (contactable|reachable|responding|answering)|unreachable|phone (off|switched)|no response|not picking/.test(t)) return 'customer_not_contactable';
  if (/not available|unavailable|not at home|door locked|nobody|no one|customer not/.test(t)) return 'customer_unavailable';
  if (/wrong (product|item)|incorrect (product|item)/.test(t)) return 'incorrect_product';
  if (/damaged|damage/.test(t)) return 'damaged_product';
  return 'other';
}

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
  // A new NDR opens a case; another NDR on a shipment whose case was already answered (reattempt asked / resolved) opens it again as the next attempt (up to 3).
  if (m.state === 'ndr') await tx.query(`INSERT INTO ndr_cases (seller_id,shipment_id,reason_code,reason_detail,ndr_reason,courier_notes) VALUES ($1,$2,'courier_ndr',$3,$4::ndr_reason_enum,$3)
    ON CONFLICT (shipment_id) DO UPDATE SET
      attempt_number = LEAST(ndr_cases.attempt_number + CASE WHEN ndr_cases.state IN ('reattempt_requested','resolved') THEN 1 ELSE 0 END, 3),
      sla_deadline_at = CASE WHEN ndr_cases.state IN ('reattempt_requested','resolved') THEN now() + interval '24 hours' ELSE ndr_cases.sla_deadline_at END,
      resolved_at = CASE WHEN ndr_cases.state IN ('reattempt_requested','resolved') THEN NULL ELSE ndr_cases.resolved_at END,
      state = CASE WHEN ndr_cases.state IN ('reattempt_requested','resolved') THEN 'open'::ndr_state ELSE ndr_cases.state END,
      reason_detail = EXCLUDED.reason_detail, courier_notes = EXCLUDED.courier_notes, ndr_reason = EXCLUDED.ndr_reason, updated_at = now()`, [s.seller_id, s.id, description.slice(0, 500), ndrReasonFrom(description)]);
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
  let sellerTouched: string | undefined;
  const outcome = await withTransaction(async (tx) => {
    const delivery = await tx.query(
      'INSERT INTO webhook_deliveries (provider_code,external_event_id,payload_hash,payload) VALUES ($1,$2,$3,$4) ON CONFLICT (provider_code, external_event_id) DO NOTHING RETURNING id',
      [aggregator, bodyHash, bodyHash, JSON.stringify(update.raw ?? { awb: update.awb, events: update.events.length })]);
    if (!delivery.rows[0]) return 'duplicate' as const;
    const found = await tx.query<Shipment>('SELECT s.id,s.seller_id,s.state::text AS state FROM shipments s JOIN courier_providers cp ON cp.id=s.provider_id WHERE s.awb=$1 AND cp.aggregator=$2 FOR UPDATE OF s', [update.awb, aggregator]);
    const shipment = found.rows[0];
    sellerTouched = shipment?.seller_id;
    if (!shipment) { await tx.query('DELETE FROM webhook_deliveries WHERE id=$1', [delivery.rows[0].id]); return 'unknown' as const; }
    for (const e of update.events) await applyEvent(tx, shipment, e.mapped, e.at, e.location, e.description, e.eventId, e);
    const c = update.current;
    if (c && c.mapped.state !== shipment.state) await applyEvent(tx, shipment, c.mapped, c.at, c.location, c.description, c.eventId, { status: c.description });
    let note: string | null = null;
    // A cancellation made on the courier's side is not applied (the refund goes through NEXGO's own cancel), but the parcel stops counting as a pending pickup.
    if (update.unmappedStatus && /^CANCEL/i.test(update.unmappedStatus)) await tx.query("UPDATE shipments SET courier_cancelled_at = COALESCE(courier_cancelled_at, now()) WHERE id = $1 AND state IN ('booked','pickup_pending','pickup_scheduled')", [shipment.id]);
    if (update.unmappedStatus) { note = `Unmapped ${aggregator} status: ${update.unmappedStatus}`; log.warn({ awb: update.awb, status: update.unmappedStatus }, note); } // e.g. CANCELLED: needs a person
    await tx.query('UPDATE webhook_deliveries SET processed_at=now(),processing_error=$2 WHERE id=$1', [delivery.rows[0].id, note]);
    return 'processed' as const;
  });
  if (outcome === 'processed') invalidateMetrics(sellerTouched); // this seller's dashboards recalculate on the next request
  return outcome;
}
