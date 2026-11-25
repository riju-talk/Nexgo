import { config } from '../config.js';
import { db } from '../db/client.js';
import { courierAdapter } from '../couriers/registry.js';
import type { CourierBookingResult } from '../couriers/types.js';
import { courierRequest, pushTrackingForShipment, recordBooking, type BookingContext } from '../routes/shipments.js';
import { OPEN_SQL, markAccepted, settleAttempt, type Attempt } from './bookingAttempts.js';
import { audit } from './audit.js';
import { notify } from './notify.js';

/**
 * Finishes courier bookings whose outcome was not known (BOOK-001). For every open attempt that is due:
 *   accepted       record the shipment and the debit
 *   unknown/stale  ask the courier: it has an AWB -> record it. It shows none -> that is ONE miss; the order is released only after 3 misses spread over
 *                  BOOKING_RELEASE_SECONDS (a courier's records can lag behind its own booking). It cannot be asked (error, no record of the order id) -> ask again later.
 *   cancel_needed  undo the booking at the courier, until the courier confirms
 *   anything still open after BOOKING_REVIEW_SECONDS -> 'needs_review': a person checks the courier's portal and settles it (Admin > System status). It is still
 *                  looked up now and then, and recorded by itself if the booking turns up.
 * It never guesses: an attempt stays open (and blocks another booking of that order) until the courier has answered.
 */
export const ALERT_AFTER_CHECKS = 8;
const backoffSeconds = (checks: number) => Math.min(900, config.RECONCILE_AFTER_SECONDS * 2 ** Math.min(checks, 8));

async function askCourier(a: Attempt, ctx: BookingContext): Promise<CourierBookingResult | null> {
  const adapter = courierAdapter(a.aggregator, a.provider_code);
  if (!adapter.findBooking) throw new Error('This courier network cannot be asked about an existing booking; check it by hand.');
  return adapter.findBooking(courierRequest(ctx));
}

/** Resolves one attempt as far as possible now. Returns the state it ended in. */
export async function resolveAttempt(a: Attempt): Promise<'recorded' | 'released' | 'cancelled' | 'open'> {
  const ctx = a.context as unknown as BookingContext | null;
  if (!ctx) { await settleAttempt(a.id, 'refused', 'No booking details were kept'); return 'released'; }
  const was = a.state === 'needs_review' ? (a.review_from ?? 'unknown') : a.state;
  if (was === 'cancel_needed') {
    await courierAdapter(a.aggregator, a.provider_code).cancel(a.provider_shipment_id ?? a.awb ?? '');
    await settleAttempt(a.id, 'cancelled', a.error ?? undefined);
    return 'cancelled';
  }
  let booking: CourierBookingResult | null;
  if (was === 'accepted' && a.awb) booking = { awb: a.awb, providerShipmentId: a.provider_shipment_id ?? a.awb, labelAvailable: true, routingCode: a.routing_code ?? undefined, pickupHubId: a.pickup_hub_id ?? undefined };
  else {
    booking = await askCourier(a, ctx);
    if (!booking) {
      // One empty answer is not proof: release only after repeated misses AND enough time. A case already with a person is left to them.
      const miss = (await db.query<{ misses: number; age: number }>('UPDATE booking_attempts SET misses = misses + 1 WHERE id = $1 RETURNING misses, extract(epoch FROM now() - created_at)::int AS age', [a.id])).rows[0];
      if (a.state !== 'needs_review' && miss && miss.misses >= 3 && miss.age >= config.BOOKING_RELEASE_SECONDS) { await settleAttempt(a.id, 'refused', `The courier showed no booking for this order on ${miss.misses} checks`); return 'released'; }
      throw Object.assign(new Error(`No booking at the courier yet (check ${miss?.misses ?? '?'}); not released until it is certain`), { miss: true });
    }
    if (a.state !== 'needs_review') await markAccepted(a.id, booking);
  }
  const p = { userId: a.actor_user_id ?? a.seller_id, sellerId: a.seller_id, role: 'owner', permissions: null };
  try {
    const done = await recordBooking(p, `reconcile-${a.id.slice(0, 8)}`, ctx, a.id, booking);
    console.log(JSON.stringify({ evt: 'booking.reconciled', attempt: a.id, awb: booking.awb }));
    void pushTrackingForShipment(a.seller_id, a.order_id, done.shipment.awb as string).catch(() => {});
    await notify(a.seller_id, { kind: 'system', title: 'Courier booking confirmed', body: `An order whose courier answer was delayed is booked. AWB ${done.shipment.awb}. You were charged once.`, screen: 'shipments', entityId: String(done.shipment.awb), dedupeKey: `booking-confirmed:${a.id}` });
    return 'recorded';
  } catch (e) {
    const now = (await db.query<{ state: string }>('SELECT state FROM booking_attempts WHERE id = $1', [a.id])).rows[0]?.state; // recordBooking undid it at the courier (no money left, order changed)
    if (now === 'cancelled') return 'cancelled';
    throw e;
  }
}

async function claimDue(limit: number): Promise<Attempt[]> {
  // Claiming moves next_check_at on, so two workers never take the same attempt and a failing one is retried with growing gaps.
  return (await db.query<Attempt>(
    `UPDATE booking_attempts SET checks = checks + 1, next_check_at = now() + CASE WHEN state = 'needs_review' THEN interval '15 minutes' ELSE make_interval(secs => LEAST(900, $2::int * power(2, LEAST(checks, 8)))::double precision) END
      WHERE id IN (SELECT id FROM booking_attempts WHERE ${OPEN_SQL} AND next_check_at <= now()
                     AND updated_at < now() - make_interval(secs => CASE WHEN state = 'started' THEN $3::int ELSE $2::int END)
                   ORDER BY next_check_at LIMIT $1 FOR UPDATE SKIP LOCKED) RETURNING *`, [limit, config.RECONCILE_AFTER_SECONDS, config.BOOKING_STALE_SECONDS])).rows;
}

/** Open for longer than BOOKING_REVIEW_SECONDS: hand it to a person, once, and tell the seller. */
async function escalateOld(log: { error: (o: unknown, m?: string) => void }): Promise<void> {
  const moved = await db.query<{ id: string; seller_id: string; order_id: string; review_from: string; awb: string | null }>(
    `UPDATE booking_attempts SET review_from = state, state = 'needs_review', updated_at = now(), next_check_at = now() + interval '15 minutes'
      WHERE state IN ('started', 'unknown', 'accepted', 'cancel_needed') AND created_at < now() - make_interval(secs => $1) RETURNING id, seller_id, order_id, review_from, awb`, [config.BOOKING_REVIEW_SECONDS]);
  for (const r of moved.rows) {
    log.error({ attempt: r.id, orderId: r.order_id, was: r.review_from, awb: r.awb }, 'A courier booking needs a manual check (Admin > System status)');
    await notify(r.seller_id, { kind: 'system', title: 'A booking is being checked by NEXGO support', body: 'The courier did not confirm one of your bookings. The order stays locked so it is not booked twice. Nothing more was charged.', screen: 'shipments', entityId: r.order_id, dedupeKey: `booking-review:${r.id}` });
  }
}

/** A person settles an attempt after checking the courier's portal. `booked` records it with the AWB they saw; `not_booked` frees the order. */
export async function settleByHand(id: string, adminId: string, requestId: string, outcome: { kind: 'booked'; awb: string; providerShipmentId?: string } | { kind: 'not_booked'; note: string }): Promise<'recorded' | 'released'> {
  const a = (await db.query<Attempt>(`SELECT * FROM booking_attempts WHERE id = $1 AND ${OPEN_SQL}`, [id])).rows[0];
  if (!a) throw Object.assign(new Error('This booking is already settled.'), { statusCode: 409 });
  const writeAudit = (action: string, meta: Record<string, unknown>) => db.query(`INSERT INTO audit_events (seller_id, actor_user_id, action, target_type, target_id, request_id, metadata) VALUES ($1,$2,$3,'booking_attempt',$4,$5,$6)`, [a.seller_id, adminId, action, id, requestId, JSON.stringify(meta)]);
  if (outcome.kind === 'not_booked') {
    await settleAttempt(id, 'refused', `Checked by hand: not booked at the courier. ${outcome.note}`.slice(0, 300));
    await db.query('UPDATE booking_attempts SET resolved_by = $2 WHERE id = $1', [id, adminId]);
    await writeAudit('booking.verified_not_booked', { note: outcome.note });
    await notify(a.seller_id, { kind: 'system', title: 'Booking checked: not booked', body: 'NEXGO support confirmed with the courier that this order was not booked. Nothing was charged. You can book it again.', screen: 'shipments', entityId: a.order_id, dedupeKey: `booking-settled:${id}` });
    return 'released';
  }
  await db.query(`UPDATE booking_attempts SET state = 'accepted', awb = $2, provider_shipment_id = COALESCE($3, provider_shipment_id, $2), resolved_by = $4, updated_at = now() WHERE id = $1`, [id, outcome.awb, outcome.providerShipmentId ?? null, adminId]);
  await writeAudit('booking.verified_booked', { awb: outcome.awb });
  const fresh = (await db.query<Attempt>('SELECT * FROM booking_attempts WHERE id = $1', [id])).rows[0];
  const result = await resolveAttempt(fresh);
  if (result !== 'recorded') throw Object.assign(new Error('The booking could not be recorded (the order changed or the wallet is short); it was undone at the courier or needs undoing. See the error on this row.'), { statusCode: 409 });
  return 'recorded';
}

export async function reconcileOnce(log: { error: (o: unknown, m?: string) => void }): Promise<number> {
  await escalateOld(log).catch((e) => log.error(e, 'booking review escalation failed'));
  const due = await claimDue(8);
  await Promise.all(due.map(async (a) => {
    try { await resolveAttempt(a); }
    catch (e) {
      const message = ((e as { detail?: string }).detail ?? (e as Error).message ?? '').slice(0, 300);
      if (!(e as { miss?: boolean }).miss && (a.checks >= ALERT_AFTER_CHECKS || a.checks === 1)) log.error({ attempt: a.id, orderId: a.order_id, state: a.state, awb: a.awb, checks: a.checks, nextTryInSeconds: backoffSeconds(a.checks), reason: message }, a.checks >= ALERT_AFTER_CHECKS ? 'A courier booking is still unconfirmed: check it at the courier by hand' : 'A courier booking could not be confirmed yet');
      await db.query(`UPDATE booking_attempts SET error = $2 WHERE id = $1 AND ${OPEN_SQL}`, [a.id, message]).catch(() => {});
    }
  }));
  return due.length;
}

export function startBookingReconciler(log: { error: (o: unknown, m?: string) => void }) {
  let busy = false;
  const tick = async () => {
    if (busy) return; busy = true;
    try { while (await reconcileOnce(log) === 8) { /* more are due */ } }
    catch (e) { log.error(e, 'booking reconciler failed'); }
    finally { busy = false; }
  };
  const timer = setInterval(() => { void tick(); }, Math.min(10, config.RECONCILE_AFTER_SECONDS) * 1000);
  return () => clearInterval(timer);
}
