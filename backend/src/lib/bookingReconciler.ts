import { config } from '../config.js';
import { db } from '../db/client.js';
import { courierAdapter } from '../couriers/registry.js';
import type { CourierBookingResult } from '../couriers/types.js';
import { courierRequest, pushTrackingForShipment, recordBooking, type BookingContext } from '../routes/shipments.js';
import { OPEN_SQL, markAccepted, settleAttempt, type Attempt } from './bookingAttempts.js';
import { notify } from './notify.js';

/**
 * Finishes courier bookings whose outcome was not known (BOOK-001). For every open attempt that is due:
 *   accepted       record the shipment and the debit
 *   unknown/stale  ask the courier: it has an AWB -> record it; it has none -> release the order so it can be booked again; it cannot say -> ask again later
 *   cancel_needed  undo the booking at the courier, until the courier confirms
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
  if (a.state === 'cancel_needed') {
    await courierAdapter(a.aggregator, a.provider_code).cancel(a.provider_shipment_id ?? a.awb ?? '');
    await settleAttempt(a.id, 'cancelled', a.error ?? undefined);
    return 'cancelled';
  }
  let booking: CourierBookingResult | null;
  if (a.state === 'accepted' && a.awb) booking = { awb: a.awb, providerShipmentId: a.provider_shipment_id ?? a.awb, labelAvailable: true, routingCode: a.routing_code ?? undefined, pickupHubId: a.pickup_hub_id ?? undefined };
  else {
    booking = await askCourier(a, ctx);
    if (!booking) { await settleAttempt(a.id, 'refused', 'The courier has no booking for this order'); return 'released'; }
    await markAccepted(a.id, booking);
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
    `UPDATE booking_attempts SET checks = checks + 1, next_check_at = now() + make_interval(secs => LEAST(900, $2::int * power(2, LEAST(checks, 8)))::double precision)
      WHERE id IN (SELECT id FROM booking_attempts WHERE ${OPEN_SQL} AND next_check_at <= now()
                     AND updated_at < now() - make_interval(secs => CASE WHEN state = 'started' THEN $3::int ELSE $2::int END)
                   ORDER BY next_check_at LIMIT $1 FOR UPDATE SKIP LOCKED) RETURNING *`, [limit, config.RECONCILE_AFTER_SECONDS, config.BOOKING_STALE_SECONDS])).rows;
}

export async function reconcileOnce(log: { error: (o: unknown, m?: string) => void }): Promise<number> {
  const due = await claimDue(8);
  await Promise.all(due.map(async (a) => {
    try { await resolveAttempt(a); }
    catch (e) {
      const message = ((e as { detail?: string }).detail ?? (e as Error).message ?? '').slice(0, 300);
      if (a.checks >= ALERT_AFTER_CHECKS || a.checks === 1) log.error({ attempt: a.id, orderId: a.order_id, state: a.state, awb: a.awb, checks: a.checks, nextTryInSeconds: backoffSeconds(a.checks), reason: message }, a.checks >= ALERT_AFTER_CHECKS ? 'A courier booking is still unconfirmed: check it at the courier by hand' : 'A courier booking could not be confirmed yet');
      await db.query('UPDATE booking_attempts SET error = $2 WHERE id = $1 AND state IN (\'started\', \'unknown\', \'accepted\', \'cancel_needed\')', [a.id, message]).catch(() => {});
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
