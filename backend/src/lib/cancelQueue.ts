import { db, withSellerTransaction, withTransaction } from '../db/client.js';
import { config } from '../config.js';
import { audit } from './audit.js';
import { invalidateMetrics } from './metrics.js';
import { sellerSafeMessage } from './sellerSafeError.js';
import { cancelShipment } from '../routes/shipments.js';
import { notify } from './notify.js';

/**
 * Works through cancel_batch_items (cancellations queued by POST /v1/shipments/cancel-batch).
 *  - at most CANCEL_WORKERS cancellations in flight in this process, at most CANCEL_PER_SELLER for one seller (a seller's cancels take the
 *    wallet lock one at a time anyway, so more than a couple adds nothing);
 *  - claiming is serialised with an advisory lock, so two processes never take the same item;
 *  - a cancel that failed for a temporary reason (courier slow, rate limited) is retried a few times;
 *  - an item stuck "running" (the process died) goes back to the queue, or is failed after too many tries.
 * The cancellation itself is cancelShipment(): the code behind the single Cancel button, so the refund is the exact booking debit, once.
 */
type Claimed = { id: string; batch_id: string; seller_id: string; kind: 'shipment' | 'order'; shipment_id: string | null; order_id: string | null; attempts: number; created_by: string | null };
const TEMPORARY = /did not respond|too slowly|rate limit|temporarily unavailable|timed out|ECONNRESET|fetch failed/i;
const MAX_ATTEMPTS = 3;
const STALE_MINUTES = 5;
let inflight = 0;

async function claim(limit: number): Promise<Claimed[]> {
  return withTransaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('cancel-queue-claim', 0))");
    const picked = await client.query<{ id: string }>(
      `WITH running AS (SELECT seller_id, count(*)::int AS c FROM cancel_batch_items WHERE state = 'running' GROUP BY seller_id),
            cand AS (
              SELECT i.id, i.seller_id, row_number() OVER (PARTITION BY i.seller_id ORDER BY b.created_at, i.id) AS rn, b.created_at
              FROM cancel_batch_items i JOIN cancel_batches b ON b.id = i.batch_id
              WHERE i.state = 'queued' AND (i.retry_at IS NULL OR i.retry_at <= now()))
       SELECT c.id FROM cand c LEFT JOIN running r ON r.seller_id = c.seller_id
       WHERE c.rn <= $2 - COALESCE(r.c, 0) ORDER BY c.created_at, c.rn LIMIT $1`, [limit, config.CANCEL_PER_SELLER]);
    if (!picked.rows.length) return [];
    const claimed = await client.query<Claimed>(
      `UPDATE cancel_batch_items i SET state = 'running', started_at = now(), attempts = i.attempts + 1
       FROM cancel_batches b WHERE b.id = i.batch_id AND i.id = ANY($1::uuid[])
       RETURNING i.id, i.batch_id, i.seller_id, i.kind, i.shipment_id, i.order_id, i.attempts, b.created_by`, [picked.rows.map((r) => r.id)]);
    return claimed.rows;
  });
}

async function finishBatchIfDone(batchId: string) {
  const done = await db.query<{ seller_id: string }>(
    `UPDATE cancel_batches SET finished_at = now() WHERE id = $1 AND finished_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM cancel_batch_items WHERE batch_id = $1 AND state IN ('queued', 'running')) RETURNING seller_id`, [batchId]);
  if (!done.rows[0]) return;
  const c = (await db.query<{ ok: number; failed: number; refunded: string }>(`SELECT count(*) FILTER (WHERE state = 'ok')::int AS ok, count(*) FILTER (WHERE state = 'failed')::int AS failed, COALESCE(sum(refunded_paise) FILTER (WHERE state = 'ok'), 0)::text AS refunded FROM cancel_batch_items WHERE batch_id = $1`, [batchId])).rows[0];
  const refund = Number(c.refunded) / 100;
  await notify(done.rows[0].seller_id, { kind: 'batch', title: `Cancellation finished: ${c.ok} cancelled${c.failed ? `, ${c.failed} not` : ''}`, body: refund ? `₹${refund.toLocaleString('en-IN')} was credited back to your wallet.` : undefined, screen: 'shipments', entityId: batchId, dedupeKey: `cancel-batch:${batchId}` });
}

/** An order that never got a courier: cancelled in place (nothing to refund). */
async function cancelPlainOrder(item: Claimed): Promise<number> {
  await withSellerTransaction(item.seller_id, async (client) => {
    const found = await client.query<{ state: string; shipments: string }>('SELECT o.state::text, (SELECT count(*) FROM shipments s WHERE s.order_id = o.id)::text AS shipments FROM orders o WHERE o.id = $1 AND o.seller_id = $2 FOR UPDATE', [item.order_id, item.seller_id]);
    const row = found.rows[0];
    if (!row) throw Object.assign(new Error('Order not found'), { statusCode: 404 });
    if (row.state === 'cancelled') return;
    if (Number(row.shipments) > 0 || !['draft', 'new', 'ready_to_ship'].includes(row.state)) throw Object.assign(new Error('This order already has a courier booking. Cancel its shipment instead.'), { statusCode: 409 });
    await client.query(`UPDATE orders SET state = 'cancelled', cancelled_at = now(), updated_at = now() WHERE id = $1`, [item.order_id]);
    await audit(client, { sellerId: item.seller_id, actorUserId: item.created_by ?? undefined, action: 'order.state_changed', targetType: 'order', targetId: item.order_id!, requestId: `cancel-batch-${item.batch_id.slice(0, 8)}`, metadata: { to: 'cancelled' } });
  });
  return 0;
}

async function run(item: Claimed, log: { error: (o: unknown, m?: string) => void }) {
  try {
    let refunded = 0;
    if (item.kind === 'shipment') {
      const p = { userId: item.created_by ?? item.seller_id, sellerId: item.seller_id, role: 'owner', permissions: null };
      const out = await cancelShipment(p, item.shipment_id!, `cancel-batch-${item.batch_id.slice(0, 8)}`);
      refunded = out.refundedPaise;
    } else refunded = await cancelPlainOrder(item);
    await db.query(`UPDATE cancel_batch_items SET state = 'ok', refunded_paise = $2, error = NULL, finished_at = now() WHERE id = $1`, [item.id, refunded]);
    invalidateMetrics(item.seller_id);
  } catch (error) {
    const message = sellerSafeMessage((error as Error).message || 'Could not cancel');
    if (TEMPORARY.test(message) && item.attempts < MAX_ATTEMPTS) {
      await db.query(`UPDATE cancel_batch_items SET state = 'queued', retry_at = now() + (($2::int * 5) || ' seconds')::interval, error = $3 WHERE id = $1`, [item.id, item.attempts, message.slice(0, 500)]);
      return;
    }
    if (!(error as { statusCode?: number }).statusCode) log.error(error, 'cancel queue item failed');
    await db.query(`UPDATE cancel_batch_items SET state = 'failed', error = $2, finished_at = now() WHERE id = $1`, [item.id, message.slice(0, 500)]);
  }
  await finishBatchIfDone(item.batch_id).catch(() => {});
}

async function recoverStale() {
  await db.query(`UPDATE cancel_batch_items SET state = 'queued', retry_at = NULL WHERE state = 'running' AND started_at < now() - ($1 || ' minutes')::interval AND attempts < $2`, [String(STALE_MINUTES), MAX_ATTEMPTS]);
  const dead = await db.query<{ batch_id: string }>(
    `UPDATE cancel_batch_items SET state = 'failed', error = 'The cancellation was interrupted. Check Track, then cancel again if it is still booked.', finished_at = now()
     WHERE state = 'running' AND started_at < now() - ($1 || ' minutes')::interval AND attempts >= $2 RETURNING batch_id`, [String(STALE_MINUTES), MAX_ATTEMPTS]);
  for (const row of dead.rows) await finishBatchIfDone(row.batch_id);
}

export function startCancelProcessor(log: { error: (o: unknown, m?: string) => void; info: (m: string) => void }) {
  let busy = false; let again = false; let lastRecover = 0;
  const pump = async () => {
    if (busy) { again = true; return; }
    busy = true;
    try {
      do {
        again = false;
        if (Date.now() - lastRecover > 15_000) { lastRecover = Date.now(); await recoverStale(); }
        const room = config.CANCEL_WORKERS - inflight;
        if (room > 0) {
          const items = await claim(room);
          for (const item of items) { inflight++; void run(item, log).finally(() => { inflight--; void pump(); }); }
          if (items.length) again = true;
        }
      } while (again);
    } catch (error) { log.error(error, 'cancel queue tick failed'); }
    finally { busy = false; }
  };
  const timer = setInterval(() => { void pump(); }, 1000);
  log.info(`Cancellation queue running (${config.CANCEL_WORKERS} at a time, ${config.CANCEL_PER_SELLER} per seller)`);
  return () => clearInterval(timer);
}
