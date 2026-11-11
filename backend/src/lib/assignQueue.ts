import { db, withTransaction } from '../db/client.js';
import { config } from '../config.js';
import { assignOneOrder, loadCourierRank, type CourierRank } from '../routes/shipments.js';
import { sellerSafeMessage } from './sellerSafeError.js';
import { notify, notifyFunds } from './notify.js';

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
const TEMPORARY = /did not respond|too slowly|rate limit|temporarily unavailable|timed out|ECONNRESET|fetch failed/i;
const MAX_ATTEMPTS = 3;
const STALE_MINUTES = 5;

let inflight = 0;
const rankCache = new Map<string, { at: number; rank: CourierRank }>();
async function rankFor(sellerId: string): Promise<CourierRank> {
  const hit = rankCache.get(sellerId);
  if (hit && Date.now() - hit.at < 60_000) return hit.rank;
  const rank = await loadCourierRank(sellerId);
  rankCache.set(sellerId, { at: Date.now(), rank });
  return rank;
}

async function claim(limit: number): Promise<Claimed[]> {
  return withTransaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('assign-queue-claim', 0))");
    const picked = await client.query<{ id: string }>(
      `WITH running AS (SELECT seller_id, count(*)::int AS c FROM assign_batch_items WHERE state = 'running' GROUP BY seller_id),
            cand AS (
              SELECT i.id, i.seller_id, row_number() OVER (PARTITION BY i.seller_id ORDER BY b.created_at, i.id) AS rn, b.created_at
              FROM assign_batch_items i JOIN assign_batches b ON b.id = i.batch_id
              WHERE i.state = 'queued' AND (i.retry_at IS NULL OR i.retry_at <= now()))
       SELECT c.id FROM cand c LEFT JOIN running r ON r.seller_id = c.seller_id
       WHERE c.rn <= $2 - COALESCE(r.c, 0) ORDER BY c.created_at, c.rn LIMIT $1`, [limit, config.ASSIGN_PER_SELLER]);
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
  await notify(done.rows[0].seller_id, { kind: 'batch', title: c.failed ? `Courier assignment finished: ${c.ok} booked, ${c.failed} not` : `Courier assignment finished: ${c.ok} booked`, body: c.failed ? 'Open Track > Ready to ship to see what needs fixing.' : undefined, screen: 'shipments', entityId: batchId, dedupeKey: `assign-batch:${batchId}` });
}

async function run(item: Claimed, log: { error: (o: unknown, m?: string) => void }) {
  try {
    const rank = await rankFor(item.seller_id);
    // The batch creator is the actor in the audit trail (the seller user who clicked "Assign").
    const p = { userId: item.created_by ?? item.seller_id, sellerId: item.seller_id, role: 'owner', permissions: null };
    const out = await assignOneOrder(p, `batch-${item.batch_id.slice(0, 8)}`, item.order_id, { providerCode: item.provider_code ?? undefined, serviceCode: item.service_code ?? undefined, rank });
    if (!out.ok && out.error && TEMPORARY.test(out.error) && item.attempts < MAX_ATTEMPTS) {
      await db.query(`UPDATE assign_batch_items SET state = 'queued', retry_at = now() + (($2::int * 5) || ' seconds')::interval, error = $3 WHERE id = $1`, [item.id, item.attempts, sellerSafeMessage(out.error).slice(0, 500)]);
      return;
    }
    await db.query(
      `UPDATE assign_batch_items SET state = $2, awb = $3, courier = $4, error = $5, duration_ms = $6, finished_at = now() WHERE id = $1`,
      [item.id, out.ok ? 'ok' : 'failed', out.awb ?? null, out.courier ?? null, out.ok ? null : sellerSafeMessage(out.error ?? 'Could not assign a courier').slice(0, 500), out.ms]);
    // Out of money (or debit limit reached): the rest of this batch cannot succeed either, so stop it now instead of trying every order.
    if (!out.ok && out.error && FUNDS.test(out.error)) {
      await db.query(`UPDATE assign_batch_items SET state = 'failed', error = $2, finished_at = now() WHERE batch_id = $1 AND state = 'queued'`, [item.batch_id, sellerSafeMessage(out.error).slice(0, 500)]);
      await notifyFunds(item.seller_id, sellerSafeMessage(out.error));
    }
    await finishBatchIfDone(item.batch_id);
  } catch (error) {
    log.error(error, 'assign queue item crashed');
    await db.query(`UPDATE assign_batch_items SET state = 'failed', error = 'Could not assign a courier (internal error)', finished_at = now() WHERE id = $1`, [item.id]).catch(() => {});
    await finishBatchIfDone(item.batch_id).catch(() => {});
  }
}

async function recoverStale() {
  await db.query(`UPDATE assign_batch_items SET state = 'queued', retry_at = now() WHERE state = 'running' AND started_at < now() - ($1 || ' minutes')::interval AND attempts < $2`, [String(STALE_MINUTES), MAX_ATTEMPTS]);
  const dead = await db.query<{ batch_id: string }>(
    `UPDATE assign_batch_items SET state = 'failed', error = 'The booking was interrupted. Check Track, then assign again if it is not booked.', finished_at = now()
     WHERE state = 'running' AND started_at < now() - ($1 || ' minutes')::interval AND attempts >= $2 RETURNING batch_id`, [String(STALE_MINUTES), MAX_ATTEMPTS]);
  for (const row of dead.rows) await finishBatchIfDone(row.batch_id);
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
          const items = await claim(room);
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
