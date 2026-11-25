import { db, withTransaction } from '../db/client.js';
import { config } from '../config.js';
import { assignOneOrder, loadCourierRank, type CourierRank } from '../routes/shipments.js';
import { BOOKING_PAUSED, sellerSafeMessage } from './sellerSafeError.js';
import { notify, notifyFunds } from './notify.js';
import { isTemporaryError } from './transientErrors.js';
import { allBookingPaused } from './aggregatorBalance.js';

/**
 * Works through assign_batch_items (courier assignment queued by POST /v1/shipments/assign-batch).
 *  - at most ASSIGN_WORKERS bookings in flight in this process, at most ASSIGN_PER_SELLER for one seller (enforced from the database, so
 *    several worker processes still respect it);
 *  - claiming is serialised with an advisory lock, so two processes never take the same item;
 *  - a booking that failed for a temporary reason (aggregator slow, rate limited) is retried a few times with a short delay;
 *  - an item stuck "running" (the process died) goes back to the queue.
 * Booking itself is assignOneOrder(): the same code the page's own request used, so wallet checks, idempotency and refusals behave the same.
 */
type Claimed = { id: string; batch_id: string; seller_id: string; order_id: string; attempts: number; created_by: string | null; provider_code: string | null; service_code: string | null };
const FUNDS = /^(debit limit reached|insufficient wallet balance)/i;
const MAX_ATTEMPTS = 4;
const STALE_MINUTES = 5;

let inflight = 0;
// When the courier network refuses to book (its prepaid wallet is empty) nothing is failed: every waiting order stays queued, marked with BOOKING_PAUSED,
// and is booked automatically once bookings work again. While the wallet reads empty only ONE order is tried every PROBE_MS (a successful booking
// opens the gate for OPEN_MS), so the wait costs no wasted calls and resumes on its own after a top-up.
const PROBE_MS = config.ASSIGN_PROBE_SECONDS * 1000; const OPEN_MS = 10 * 60_000; const PAUSE_RETRY_SECONDS = config.ASSIGN_PAUSE_RETRY_SECONDS; const PAUSE_GIVE_UP_HOURS = 24;
let lastProbe = 0; let openUntil = 0; let lastPauseLog = 0; let lastPausedAt = 0; let lastSweep = 0;
async function pauseGate(): Promise<{ includePaused: boolean; limit: number | null }> {
  if (Date.now() < openUntil) return { includePaused: true, limit: null };
  const empty = await allBookingPaused(); // only when EVERY aggregator is out of balance: one funded aggregator keeps bookings going
  if (!empty) return { includePaused: true, limit: null };
  if (Date.now() - lastProbe >= PROBE_MS) { lastProbe = Date.now(); return { includePaused: true, limit: 1 }; } // one trial booking
  return { includePaused: false, limit: 0 };
}
const rankCache = new Map<string, { at: number; rank: CourierRank }>();
async function rankFor(sellerId: string): Promise<CourierRank> {
  const hit = rankCache.get(sellerId);
  if (hit && Date.now() - hit.at < 60_000) return hit.rank;
  const rank = await loadCourierRank(sellerId);
  rankCache.set(sellerId, { at: Date.now(), rank });
  return rank;
}

async function claim(limit: number, includePaused = true): Promise<Claimed[]> {
  return withTransaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('assign-queue-claim', 0))");
    const picked = await client.query<{ id: string }>(
      `WITH running AS (SELECT seller_id, count(*)::int AS c FROM assign_batch_items WHERE state = 'running' GROUP BY seller_id),
            cand AS (
              SELECT i.id, i.seller_id, row_number() OVER (PARTITION BY i.seller_id ORDER BY b.created_at, i.id) AS rn, b.created_at
              FROM assign_batch_items i JOIN assign_batches b ON b.id = i.batch_id
              WHERE i.state = 'queued' AND (i.retry_at IS NULL OR i.retry_at <= now()) AND ($3::boolean OR i.error IS DISTINCT FROM $4))
       SELECT c.id FROM cand c LEFT JOIN running r ON r.seller_id = c.seller_id
       WHERE c.rn <= $2 - COALESCE(r.c, 0) ORDER BY c.created_at, c.rn LIMIT $1`, [limit, config.ASSIGN_PER_SELLER, includePaused, BOOKING_PAUSED]);
    if (!picked.rows.length) return [];
    const claimed = await client.query<Claimed>(
      `UPDATE assign_batch_items i SET state = 'running', started_at = now(), attempts = i.attempts + 1
       FROM assign_batches b WHERE b.id = i.batch_id AND i.id = ANY($1::uuid[])
       RETURNING i.id, i.batch_id, i.seller_id, i.order_id, i.attempts, b.created_by, b.provider_code, b.service_code`, [picked.rows.map((r) => r.id)]);
    return claimed.rows;
  });
}

async function finishBatchIfDone(batchId: string) {
  const done = await db.query<{ seller_id: string }>(
    `UPDATE assign_batches SET finished_at = now() WHERE id = $1 AND finished_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM assign_batch_items WHERE batch_id = $1 AND state IN ('queued', 'running')) RETURNING seller_id`, [batchId]);
  if (!done.rows[0]) return;
  const c = (await db.query<{ ok: number; failed: number }>(`SELECT count(*) FILTER (WHERE state = 'ok')::int AS ok, count(*) FILTER (WHERE state = 'failed')::int AS failed FROM assign_batch_items WHERE batch_id = $1`, [batchId])).rows[0];
  // Say WHY, not just how many: the most common reason among the orders that were not booked.
  const why = c.failed ? (await db.query<{ error: string; n: number }>(`SELECT error, count(*)::int AS n FROM assign_batch_items WHERE batch_id = $1 AND state = 'failed' AND error IS NOT NULL GROUP BY error ORDER BY n DESC LIMIT 1`, [batchId])).rows[0] : undefined;
  await notify(done.rows[0].seller_id, { kind: 'batch', title: c.failed ? `Courier assignment finished: ${c.ok} booked, ${c.failed} not` : `Courier assignment finished: ${c.ok} booked`, body: c.failed ? `${why ? `Main reason (${why.n} order${why.n === 1 ? '' : 's'}): ${why.error} ` : ''}Open Track > Ready to ship to see what needs fixing.` : undefined, screen: 'shipments', entityId: batchId, dedupeKey: `assign-batch:${batchId}` });
}

async function run(item: Claimed, log: { error: (o: unknown, m?: string) => void }) {
  try {
    const rank = await rankFor(item.seller_id);
    // The batch creator is the actor in the audit trail (the seller user who clicked "Assign").
    const p = { userId: item.created_by ?? item.seller_id, sellerId: item.seller_id, role: 'owner', permissions: null };
    const out = await assignOneOrder(p, `batch-${item.batch_id.slice(0, 8)}`, item.order_id, { providerCode: item.provider_code ?? undefined, serviceCode: item.service_code ?? undefined, rank });
    if (!out.ok && out.error && isTemporaryError(out.error) && item.attempts < MAX_ATTEMPTS) {
      await db.query(`UPDATE assign_batch_items SET state = 'queued', retry_at = now() + (($2::int * 5) || ' seconds')::interval, error = $3 WHERE id = $1`, [item.id, item.attempts, sellerSafeMessage(out.error).slice(0, 500)]);
      return;
    }
    // The courier network cannot book for anyone (its balance is used up): nothing is failed, every waiting order is kept and booked automatically later.
    if (!out.ok && out.error === BOOKING_PAUSED) { await pauseEverything(item); return; }
    await db.query(
      `UPDATE assign_batch_items SET state = $2, awb = $3, courier = $4, error = $5, duration_ms = $6, finished_at = now() WHERE id = $1`,
      [item.id, out.ok ? 'ok' : 'failed', out.awb ?? null, out.courier ?? null, out.ok ? null : sellerSafeMessage(out.error ?? 'Could not assign a courier').slice(0, 500), out.ms]);
    // Out of money (or debit limit reached): the rest of this batch cannot succeed either, so stop it now instead of trying every order.
    if (!out.ok && out.error && FUNDS.test(out.error)) {
      await db.query(`UPDATE assign_batch_items SET state = 'failed', error = $2, finished_at = now() WHERE batch_id = $1 AND state = 'queued'`, [item.batch_id, sellerSafeMessage(out.error).slice(0, 500)]);
      await notifyFunds(item.seller_id, sellerSafeMessage(out.error));
    }
    if (out.ok && Date.now() - lastPausedAt > 30_000) openUntil = Date.now() + OPEN_MS; // bookings work: no need to probe (a booking that was already in flight when the pause began does not count)
    await finishBatchIfDone(item.batch_id);
  } catch (error) {
    log.error(error, 'assign queue item crashed');
    await db.query(`UPDATE assign_batch_items SET state = 'failed', error = 'Could not assign a courier (internal error)', finished_at = now() WHERE id = $1`, [item.id]).catch(() => {});
    await finishBatchIfDone(item.batch_id).catch(() => {});
  }
}

/** Puts this order and every other waiting order back in the queue, marked as paused, and tells the seller once that nothing is lost. */
async function pauseEverything(item: Claimed) {
  openUntil = 0; lastPausedAt = Date.now();
  await db.query(`UPDATE assign_batch_items SET state = 'queued', error = $2, attempts = 0, started_at = NULL, retry_at = now() + ($3 || ' seconds')::interval WHERE id = $1`, [item.id, BOOKING_PAUSED, String(PAUSE_RETRY_SECONDS)]);
  // The same sweep for every other waiting order. Many in-flight orders hit the refusal at once, so it runs under one lock (also across processes), skips rows
  // another worker is touching and is not repeated within a few seconds: concurrent sweeps over the same rows used to deadlock.
  // The sweep over every waiting order only makes sense when nothing can be booked anywhere; a seller whose couriers are all on the empty aggregator
  // simply waits (this item), the others carry on through the aggregator that still has funds.
  if (Date.now() - lastSweep > 3000 && await allBookingPaused()) {
    lastSweep = Date.now();
    await withTransaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended('assign-pause-sweep', 0))");
      await client.query(`UPDATE assign_batch_items SET error = $1, retry_at = now() + ($2 || ' seconds')::interval
        WHERE id IN (SELECT id FROM assign_batch_items WHERE state = 'queued' AND (error IS NULL OR error = $1) ORDER BY id FOR UPDATE SKIP LOCKED)`, [BOOKING_PAUSED, String(PAUSE_RETRY_SECONDS)]);
    });
  }
  if (Date.now() - lastPauseLog > 60_000) { lastPauseLog = Date.now(); console.error('Courier booking is paused: the aggregator account has no balance. Waiting orders are kept and book automatically after a top-up.'); }
  const waiting = (await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM assign_batch_items WHERE batch_id = $1 AND state = 'queued'`, [item.batch_id])).rows[0]?.n ?? 0;
  await notify(item.seller_id, { kind: 'batch', title: 'Courier booking is paused: your orders are saved', body: `${waiting} order${waiting === 1 ? '' : 's'} will be booked automatically as soon as courier booking resumes. Nothing is lost and you do not need to do anything.`, screen: 'shipments', entityId: item.batch_id, dedupeKey: `assign-paused:${item.batch_id}` });
}

async function recoverStale() {
  await db.query(`UPDATE assign_batch_items SET state = 'queued', retry_at = now() WHERE state = 'running' AND started_at < now() - ($1 || ' minutes')::interval AND attempts < $2`, [String(STALE_MINUTES), MAX_ATTEMPTS]);
  const dead = await db.query<{ batch_id: string }>(
    `UPDATE assign_batch_items SET state = 'failed', error = 'The booking was interrupted. Check Track, then assign again if it is not booked.', finished_at = now()
     WHERE state = 'running' AND started_at < now() - ($1 || ' minutes')::interval AND attempts >= $2 RETURNING batch_id`, [String(STALE_MINUTES), MAX_ATTEMPTS]);
  for (const row of dead.rows) await finishBatchIfDone(row.batch_id);
  // Paused for a whole day: stop waiting and say so, so the order shows up as needing attention instead of waiting for ever.
  const gaveUp = await db.query<{ batch_id: string }>(
    `UPDATE assign_batch_items i SET state = 'failed', error = 'Courier booking was unavailable for 24 hours, so this order was not booked. Please assign a courier again.', finished_at = now()
     FROM assign_batches b WHERE b.id = i.batch_id AND i.state = 'queued' AND i.error = $1 AND b.created_at < now() - ($2 || ' hours')::interval RETURNING i.batch_id`, [BOOKING_PAUSED, String(PAUSE_GIVE_UP_HOURS)]);
  for (const batchId of new Set(gaveUp.rows.map((r) => r.batch_id))) await finishBatchIfDone(batchId);
}

export function startAssignProcessor(log: { error: (o: unknown, m?: string) => void; info: (m: string) => void }) {
  let busy = false; let again = false; let lastRecover = 0;
  // Looks for work: on a timer, and again the moment a booking finishes, so a free slot is never left idle for a whole second.
  const pump = async () => {
    if (busy) { again = true; return; }
    busy = true;
    try {
      do {
        again = false;
        if (Date.now() - lastRecover > 15_000) { lastRecover = Date.now(); await recoverStale(); }
        const room = config.ASSIGN_WORKERS - inflight;
        if (room > 0) {
          const gate = await pauseGate();
          // Closed gate: orders queued meanwhile are shown as paused straight away (not "0 of N" until the next trial booking).
          if (gate.limit === 0) await db.query(`UPDATE assign_batch_items SET error = $1, retry_at = now() + ($2 || ' seconds')::interval WHERE id IN (SELECT id FROM assign_batch_items WHERE state = 'queued' AND error IS NULL ORDER BY id FOR UPDATE SKIP LOCKED)`, [BOOKING_PAUSED, String(PAUSE_RETRY_SECONDS)]);
          const items = gate.limit === 0 ? [] : await claim(gate.limit ? Math.min(room, gate.limit) : room, gate.includePaused);
          if (items.length) console.log(JSON.stringify({ evt: 'assign.claim', claimed: items.length, inflight: inflight + items.length }));
          for (const item of items) { inflight++; void run(item, log).finally(() => { inflight--; void pump(); }); }
          if (items.length) again = true; // there may be more waiting
        }
      } while (again);
    } catch (error) { log.error(error, 'assign queue tick failed'); }
    finally { busy = false; }
  };
  const timer = setInterval(() => { void pump(); }, 1000);
  log.info(`Courier assignment queue running (${config.ASSIGN_WORKERS} at a time, ${config.ASSIGN_PER_SELLER} per seller)`);
  return () => clearInterval(timer);
}
