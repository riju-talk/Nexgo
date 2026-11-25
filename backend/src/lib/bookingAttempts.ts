import type { PoolClient } from 'pg';
import { config } from '../config.js';
import { db } from '../db/client.js';
import type { CourierBookingResult } from '../couriers/types.js';
import { BOOKING_PAUSED, sellerSafeMessage } from './sellerSafeError.js';

/**
 * The durable record of a courier booking in progress (table booking_attempts, BOOK-001). It is written before the courier is called, so whatever happens
 * afterwards (lost answer, database failure, crash) there is always a row that says "a courier may hold this order" and everything needed to finish the job.
 */
export type AttemptState = 'started' | 'unknown' | 'accepted' | 'cancel_needed' | 'needs_review' | 'recorded' | 'refused' | 'cancelled';
export type Attempt = { id: string; seller_id: string; order_id: string; actor_user_id: string | null; aggregator: string | null; provider_code: string; service_code: string; idempotency_key: string; state: AttemptState; awb: string | null; provider_shipment_id: string | null; routing_code: string | null; pickup_hub_id: string | null; context: Record<string, unknown> | null; error: string | null; checks: number; misses: number; review_from: string | null; updated_at: Date; created_at: Date };
export const OPEN_SQL = `state IN ('started', 'unknown', 'accepted', 'cancel_needed', 'needs_review')`; // the same list as the unique index booking_attempts_one_open

const conflict = (message: string, code: string) => Object.assign(new Error(message), { statusCode: 409, code });
/** Another request is booking this order at this very moment. ("try again in a minute" also makes the queues retry instead of failing the order.) */
export const bookingInProgress = () => conflict('This order is being booked with a courier right now. Nothing was charged twice. Refresh Track, or try again in a minute.', 'BOOKING_IN_PROGRESS');
/** The courier did not answer clearly. The order is NOT failed and NOT booked: it is being checked, and must not be booked again meanwhile. */
export const bookingOutcomeUnknown = () => Object.assign(new Error('The courier did not confirm this booking in time, so we are checking with them. Within a few minutes the order shows as booked (charged once) or free to book again. Do not book it with another courier meanwhile.'), { statusCode: 409, code: 'BOOKING_OUTCOME_UNKNOWN' });
/** Checked many times without an answer: NEXGO support verifies it with the courier. */
export const bookingInReview = () => conflict('NEXGO support is checking an earlier booking of this order with the courier, so it cannot be booked, changed or cancelled yet. You will be notified, or contact support.', 'BOOKING_IN_REVIEW');
/** An earlier booking has no confirmed outcome yet. */
export const bookingUnconfirmed = () => conflict('An earlier booking of this order is still being confirmed with the courier. It resolves by itself, so nothing is booked or charged twice. Please try again in a minute.', 'BOOKING_UNCONFIRMED');

/** Refuses to change or cancel an order a courier may already hold. */
export async function assertNoOpenBooking(client: PoolClient, orderId: string): Promise<void> {
  const open = await client.query<{ state: string }>(`SELECT state FROM booking_attempts WHERE order_id = $1 AND ${OPEN_SQL} LIMIT 1`, [orderId]);
  if (open.rows[0]) throw open.rows[0].state === 'needs_review' ? bookingInReview() : bookingUnconfirmed();
}

type Begin = { sellerId: string; userId: string; orderId: string; aggregator: string | null; providerCode: string; serviceCode: string; key: string; context: unknown };
/**
 * Starts (or takes over) the booking of an order. Runs inside the short "prepare" transaction.
 *   mine    this request owns the booking: call the courier
 *   resume  the courier already accepted this very booking: only record it, do not call the courier
 *   busy    another request is doing it right now
 *   open    an earlier booking is unresolved; resolve it first
 */
export async function beginAttempt(client: PoolClient, b: Begin): Promise<{ kind: 'mine'; id: string } | { kind: 'resume'; attempt: Attempt } | { kind: 'busy'; attempt: Attempt } | { kind: 'open'; attempt: Attempt }> {
  const insert = () => client.query<{ id: string }>(
    `INSERT INTO booking_attempts (seller_id, order_id, actor_user_id, aggregator, provider_code, service_code, idempotency_key, context)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (order_id) WHERE ${OPEN_SQL} DO NOTHING RETURNING id`,
    [b.sellerId, b.orderId, b.userId, b.aggregator, b.providerCode, b.serviceCode, b.key, JSON.stringify(b.context)]);
  for (let i = 0; i < 2; i++) {
    const made = (await insert()).rows[0];
    if (made) return { kind: 'mine', id: made.id };
    const open = (await client.query<Attempt>(`SELECT * FROM booking_attempts WHERE order_id = $1 AND ${OPEN_SQL} FOR UPDATE`, [b.orderId])).rows[0];
    if (!open) continue; // it was closed between the two statements
    const same = open.provider_code === b.providerCode && open.service_code === b.serviceCode;
    if (open.state === 'needs_review') return { kind: 'open', attempt: open };
    if (open.state === 'started' && Date.now() - open.updated_at.getTime() < config.BOOKING_STALE_SECONDS * 1000) return { kind: 'busy', attempt: open };
    if (open.state === 'accepted' && same) return { kind: 'resume', attempt: open };
    if ((open.state === 'unknown' || open.state === 'started') && same) {
      // The same courier service again: safe, because the adapters reuse the order (and any AWB) the courier already has for it.
      await client.query(`UPDATE booking_attempts SET state = 'started', idempotency_key = $2, context = $3, updated_at = now() WHERE id = $1`, [open.id, b.key, JSON.stringify(b.context)]);
      return { kind: 'mine', id: open.id };
    }
    return { kind: 'open', attempt: open };
  }
  throw bookingInProgress();
}

/** The courier said yes: store its AWB at once, before anything else can fail. Tried a few times because losing this is what BOOK-001 is about. */
export async function markAccepted(id: string, r: CourierBookingResult): Promise<void> {
  for (let i = 0; ; i++) {
    try {
      await db.query(`UPDATE booking_attempts SET state = 'accepted', awb = $2, provider_shipment_id = $3, routing_code = $4, pickup_hub_id = $5, error = NULL, updated_at = now(), next_check_at = now() + make_interval(secs => $6) WHERE id = $1`, [id, r.awb, r.providerShipmentId, r.routingCode ?? null, r.pickupHubId ?? null, config.RECONCILE_AFTER_SECONDS]);
      return;
    } catch (e) {
      if (i >= 2) { console.error(JSON.stringify({ evt: 'booking.accepted_not_stored', attempt: id, awb: r.awb, error: (e as Error).message })); return; } // the row still says "started": the reconciler asks the courier
      await new Promise((ok) => setTimeout(ok, 300 * (i + 1)));
    }
  }
}

/** Closes or parks an attempt. Finished attempts drop their context (it holds the customer's details). Never throws: the caller is already handling an outcome. */
export async function settleAttempt(id: string, state: Exclude<AttemptState, 'started' | 'accepted'>, error?: string, client?: PoolClient): Promise<void> {
  const open = state === 'unknown' || state === 'cancel_needed';
  const run = (client ?? db).query(`UPDATE booking_attempts SET state = $2, error = $3, updated_at = now(), next_check_at = now() + make_interval(secs => $4), context = CASE WHEN $5::boolean THEN context ELSE NULL END WHERE id = $1`, [id, state, error ? sellerSafeMessage(error) : null, config.RECONCILE_AFTER_SECONDS, open]);
  if (client) { await run; return; }
  await run.catch((e) => console.error(JSON.stringify({ evt: 'booking.settle_failed', attempt: id, state, error: (e as Error).message })));
}

/**
 * Could the courier hold the parcel although this error came back? Only a clear refusal says no: a validation / serviceability refusal (4xx), "booking is paused"
 * (no balance), or an aggregator that is not configured. A timeout, a 5xx or anything unexpected is ambiguous.
 */
export function isAmbiguous(e: unknown): boolean {
  const err = e as { statusCode?: number; upstreamStatus?: number; message?: string };
  if (err?.message === BOOKING_PAUSED) return false;
  if (typeof err?.upstreamStatus === 'number' && err.upstreamStatus >= 400 && err.upstreamStatus < 500) return false;
  if (typeof err?.statusCode === 'number' && err.statusCode >= 400 && err.statusCode < 500) return false;
  if (err?.statusCode === 503) return false; // not configured: the courier was never called
  return true;
}

/** Waits for the request that is booking this order right now, so a double click gets the answer instead of an error. */
export async function waitWhileBusy(attemptId: string, ms = 25_000): Promise<void> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    await new Promise((ok) => setTimeout(ok, 350));
    const s = (await db.query<{ state: AttemptState }>('SELECT state FROM booking_attempts WHERE id = $1', [attemptId])).rows[0]?.state;
    if (s !== 'started') return;
  }
}
