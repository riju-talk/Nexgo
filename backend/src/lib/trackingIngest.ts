import type { PoolClient } from 'pg';
import { applyShipmentStateEffects } from './shipmentEffects.js';
import { isProgressionAllowed, type CanonicalShipmentState } from './courier.js';

// The shared part of tracking ingestion: record one courier event on a shipment, move its state forward (never backwards) and run the
// side effects (RTO freight billed once, NDR case opened / closed). Used by every aggregator's webhook and by the sandbox event simulator.
export type Mapped = { state: CanonicalShipmentState; rto?: 'in_transit' | 'out_for_delivery' | 'delivered' };

export type Shipment = { id: string; seller_id: string; state: CanonicalShipmentState };

export async function applyEvent(tx: PoolClient, s: Shipment, m: Mapped, at: string, location: string | null, description: string, eventId: string, raw: unknown): Promise<void> {
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
