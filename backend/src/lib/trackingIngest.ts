import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { withTransaction } from '../db/client.js';
import type { NormalizedUpdate } from '../couriers/aggregators/types.js';
import { applyShipmentStateEffects } from './shipmentEffects.js';
import { isProgressionAllowed, type CanonicalShipmentState } from './courier.js';
import { sellerSafeMessage } from './sellerSafeError.js';
import { invalidateMetrics } from './metrics.js';
import { notify, type Note } from './notify.js';

// The shared part of tracking ingestion: record one courier event on a shipment, move its state forward (never backwards) and run the
// side effects (RTO freight billed once, NDR case opened / closed). Used by every aggregator's webhook and by tests that replay eventsator.
export type Mapped = { state: CanonicalShipmentState; rto?: 'in_transit' | 'out_for_delivery' | 'delivered' };

export type Shipment = { id: string; seller_id: string; state: CanonicalShipmentState };

/** The NDR reason from the courier's own wording (the courier sends free text), so the reason charts show real reasons instead of "Other". */
export function ndrReasonFrom(text: string): string {
  const t = text.toLowerCase();
  // "Code verified cancellation" = the customer cancelled when the courier verified the order by code/call; not a payment problem ("cod" must be a whole word).
  if (/refus|rejected by (the )?customer|not accepted|cancel/.test(t)) return 'refused_delivery';
  if (/reschedul|asked (for )?(a )?(later|another)|postpone/.test(t)) return 'customer_requested_reschedule';
  if (/(incomplete|insufficient|short) address|address (is )?(incomplete|insufficient)/.test(t)) return 'address_incomplete';
  if (/(wrong|incorrect|invalid|bad) address|address (not found|incorrect|wrong)|landmark/.test(t)) return 'address_incorrect';
  if (/\bcod\b|payment|cash not|amount not ready/.test(t)) return 'payment_not_ready';
  if (/closed|shut|locked premises|office closed|shop closed/.test(t)) return 'premises_closed';
  if (/not (contactable|reachable|responding|answering)|unreachable|phone (off|switched)|no response|not picking/.test(t)) return 'customer_not_contactable';
  if (/not available|unavailable|not at home|door locked|nobody|no one|customer not/.test(t)) return 'customer_unavailable';
  if (/wrong (product|item)|incorrect (product|item)/.test(t)) return 'incorrect_product';
  if (/damaged|damage/.test(t)) return 'damaged_product';
  return 'other';
}

export async function applyEvent(tx: PoolClient, s: Shipment, m: Mapped, at: string, location: string | null, description: string, eventId: string, raw: unknown, force = false): Promise<void> {
  description = sellerSafeMessage(description); // courier wording shown to sellers never names the aggregator
  const fresh = await tx.query("INSERT INTO shipment_events (shipment_id,state,occurred_at,location,description,source,source_event_id,raw_payload) VALUES ($1,$2,$3,$4,$5,'courier_webhook',$6,$7) ON CONFLICT DO NOTHING RETURNING id", [s.id, m.state, at, location?.slice(0, 200) ?? null, description.slice(0, 500), eventId, JSON.stringify(raw)]);
  if (!fresh.rows[0] && !force) return; // already processed on an earlier delivery (force = the courier's overall status asserting the state again)
  // Couriers skip scans and a history can have gaps, so a booked shipment may jump ahead (e.g. straight to delivered). Going backwards is still refused.
  const skipsAhead = ['booked', 'pickup_pending', 'pickup_scheduled'].includes(s.state) && ['out_for_delivery', 'delivered', 'ndr', 'rto'].includes(m.state);
  // A parcel that is already NDR and fails again (a NEW scan: the same one would have been skipped above) is the next attempt, not a stale scan.
  const repeatNdr = m.state === 'ndr' && s.state === 'ndr';
  if (!skipsAhead && !repeatNdr && !isProgressionAllowed(s.state, m.state)) return; // kept in the timeline, state stays (e.g. a stale scan arriving late)
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

/** Should the courier's current NDR status put a parcel that is not in NDR back into it? Only if no seller answer is newer than the courier's last NDR scan. */
async function ndrStillStands(tx: PoolClient, s: Shipment, update: NormalizedUpdate): Promise<boolean> {
  if (!['booked', 'pickup_pending', 'pickup_scheduled', 'in_transit', 'out_for_delivery'].includes(s.state)) return false; // ndr already, or finished
  const found = await tx.query<{ state: string; answered_at: string | null }>('SELECT state::text AS state, COALESCE(resolved_at, updated_at) AS answered_at FROM ndr_cases WHERE shipment_id = $1', [s.id]);
  const nc = found.rows[0];
  if (!nc || nc.state === 'open') return true;
  if (nc.state === 'rto_requested') return false;
  const lastNdr = [...update.events].reverse().find((e) => e.mapped.state === 'ndr');
  return !!lastNdr && !!nc.answered_at && Date.parse(lastNdr.at) > new Date(nc.answered_at).getTime();
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
  const notes: Note[] = [];
  const outcome = await withTransaction(async (tx) => {
    const delivery = await tx.query(
      'INSERT INTO webhook_deliveries (provider_code,external_event_id,payload_hash,payload) VALUES ($1,$2,$3,$4) ON CONFLICT (provider_code, external_event_id) DO NOTHING RETURNING id',
      [aggregator, bodyHash, bodyHash, JSON.stringify(update.raw ?? { awb: update.awb, events: update.events.length })]);
    if (!delivery.rows[0]) return 'duplicate' as const;
    const found = await tx.query<Shipment>('SELECT s.id,s.seller_id,s.state::text AS state FROM shipments s JOIN courier_providers cp ON cp.id=s.provider_id WHERE s.awb=$1 AND cp.aggregator=$2 FOR UPDATE OF s', [update.awb, aggregator]);
    const shipment = found.rows[0];
    sellerTouched = shipment?.seller_id;
    if (!shipment) { await tx.query('DELETE FROM webhook_deliveries WHERE id=$1', [delivery.rows[0].id]); return 'unknown' as const; }
    const startState = shipment.state;
    for (const e of update.events) await applyEvent(tx, shipment, e.mapped, e.at, e.location, e.description, e.eventId, e);
    const c = update.current;
    // The courier's overall status is recorded in the history too (once per status), even when the state does not change, so e.g. "RTO in transit" shows up.
    if (c && c.mapped.state === 'ndr') {
      // The courier says NDR but a later scan (a hub scan after the failed attempt) moved the parcel on: say NDR again, unless the seller already
      // answered that attempt (their reattempt request is still waiting for the courier to act on it).
      if (await ndrStillStands(tx, shipment, update)) await applyEvent(tx, shipment, c.mapped, c.at, c.location, c.description, c.eventId, { status: c.description }, true);
    } else if (c && (c.mapped.state !== shipment.state || c.mapped.rto)) await applyEvent(tx, shipment, c.mapped, c.at, c.location, c.description, c.eventId, { status: c.description });
    // What the aggregator itself shows for this parcel (status + reason), kept next to our state so Track can show the same thing.
    const cs = update.courierStatus;
    if (cs?.label) {
      const note = cs.note ? sellerSafeMessage(cs.note) : null;
      await tx.query(`UPDATE shipments SET courier_status = $2, courier_status_note = $3, courier_status_at = now() WHERE id = $1 AND (courier_status IS DISTINCT FROM $2 OR courier_status_note IS DISTINCT FROM $3)`, [shipment.id, cs.label.slice(0, 60), note]);
      // A failed pickup attempt is the most common reason a parcel just sits at "pickup pending": tell the seller why, once per reason.
      if (/^PICKUP_EXCEPTION/.test(cs.label) && ['booked', 'pickup_pending', 'pickup_scheduled'].includes(shipment.state)) {
        notes.push({ kind: 'pickup_missed', title: 'Pickup attempt failed', body: `AWB ${update.awb}: ${note ?? 'the courier could not collect the parcel'}. Make sure the pickup contact can be reached; the courier tries again.`, screen: 'shipments', entityId: shipment.id, dedupeKey: `pickup-exc:${shipment.id}:${createHash('sha1').update(note ?? '').digest('hex').slice(0, 8)}` });
      }
    }
    // What the seller should hear about (stored once per event; sent after commit).
    if (startState !== shipment.state) {
      if (shipment.state === 'delivered') notes.push({ kind: 'delivered', title: 'Shipment delivered', body: `AWB ${update.awb} was delivered to the customer.`, screen: 'shipments', entityId: shipment.id, dedupeKey: `delivered:${shipment.id}` });
      if (shipment.state === 'rto') notes.push({ kind: 'rto', title: 'Shipment is returning to you (RTO)', body: `AWB ${update.awb} is on its way back to your warehouse.`, screen: 'rto', entityId: shipment.id, dedupeKey: `rto:${shipment.id}` });
    }
    if (shipment.state === 'ndr') {
      const ndr = (await tx.query<{ attempt_number: number; reason_detail: string | null }>('SELECT attempt_number, reason_detail FROM ndr_cases WHERE shipment_id = $1', [shipment.id])).rows[0];
      if (ndr) notes.push({ kind: 'ndr', title: `Delivery attempt failed (attempt ${ndr.attempt_number})`, body: `AWB ${update.awb}: ${ndr.reason_detail ?? 'the customer could not be reached'}. Choose reattempt or return.`, screen: 'ndr', entityId: shipment.id, dedupeKey: `ndr:${shipment.id}:${ndr.attempt_number}` });
    }
    let note: string | null = null;
    // A cancellation made on the courier's side is not applied (the refund goes through NEXGO's own cancel), but the parcel stops counting as a pending pickup.
    if (update.unmappedStatus && /^CANCEL/i.test(update.unmappedStatus)) await tx.query("UPDATE shipments SET courier_cancelled_at = COALESCE(courier_cancelled_at, now()) WHERE id = $1 AND state IN ('booked','pickup_pending','pickup_scheduled')", [shipment.id]);
    if (update.unmappedStatus) { note = `Unmapped ${aggregator} status: ${update.unmappedStatus}`; log.warn({ awb: update.awb, status: update.unmappedStatus }, note); } // e.g. CANCELLED: needs a person
    await tx.query('UPDATE webhook_deliveries SET processed_at=now(),processing_error=$2 WHERE id=$1', [delivery.rows[0].id, note]);
    return 'processed' as const;
  });
  if (outcome === 'processed') { invalidateMetrics(sellerTouched); for (const n of notes) await notify(sellerTouched, n); } // this seller's dashboards recalculate on the next request
  return outcome;
}
