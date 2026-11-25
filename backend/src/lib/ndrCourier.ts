import type { PoolClient } from 'pg';
import { courierAdapter } from '../couriers/registry.js';
import type { NdrCourierAction } from '../couriers/types.js';
import { db, withSellerTransaction } from '../db/client.js';
import { audit } from './audit.js';
import { sellerSafeMessage } from './sellerSafeError.js';

// What the seller chose on the NDR board, translated to what the courier is told. Choices that need no courier action
// (customer_contact: the seller phoned the buyer) map to null and are not sent.
const COURIER_ACTION: Record<string, NdrCourierAction | null> = { reattempt: 'reattempt', delivery_rescheduled: 'reattempt', address_update: 'reattempt', rto: 'return', cancelled: 'cancel', customer_contact: null };

/**
 * Telling the courier about the seller's NDR answer is durable (ndr_cases.courier_sync):
 *   pending  saved with the answer, in the same transaction, so it cannot be lost
 *   sent     the courier accepted it
 *   failed   the courier could not be told; retried by the worker with growing gaps, or by the seller's Retry
 *   manual   this courier takes NDR instructions only in its own portal, or the retries ran out: the seller must tell the courier there
 * One case is sent by one process at a time (the claim below), so a retry can never send the same answer twice in parallel.
 */
export type CourierSync = { status: 'sent' | 'failed' | 'manual' | 'not_applicable'; message?: string };
const MAX_TRIES = 6;
const PORTAL = 'This courier takes NDR instructions only in its own portal. Please give the same instruction there.';

/** Inside the transaction that saves the seller's answer. */
export async function markNdrSyncPending(client: PoolClient, caseId: string, resolution: string, comment: string): Promise<void> {
  const action = COURIER_ACTION[resolution] ?? null;
  await client.query(`UPDATE ndr_cases SET courier_sync = $2, courier_sync_action = $3, courier_sync_comment = $4, courier_sync_error = NULL, courier_sync_attempts = 0, courier_sync_next_at = now(), courier_synced_at = NULL WHERE id = $1`,
    [caseId, action ? 'pending' : null, action, comment.slice(0, 500)]);
}

/** Sends one case now. `force` = the seller pressed Retry (also for a case marked manual). Never throws. */
export async function syncNdrCase(sellerId: string, caseId: string, actorUserId: string | null, requestId: string, force = false): Promise<CourierSync> {
  try {
    const claimed = (await db.query<{ action: NdrCourierAction; comment: string; attempts: number; awb: string | null; code: string; aggregator: string | null }>(
      `UPDATE ndr_cases n SET courier_sync = 'sending', courier_sync_attempts = n.courier_sync_attempts + 1, courier_sync_next_at = now() + make_interval(mins => LEAST(240, 2 * power(2, n.courier_sync_attempts)::int))
         FROM shipments s JOIN courier_providers cp ON cp.id = s.provider_id
        WHERE n.id = $1 AND n.seller_id = $2 AND s.id = n.shipment_id AND n.courier_sync_action IS NOT NULL AND s.state = 'ndr' -- only while the parcel is still undelivered
          -- 'sending' is the claim: a second request (a double click, the worker) finds nothing to claim. A 'sending' left by a crash is taken again after 2 minutes.
          AND ((n.courier_sync IN ('pending', 'failed') AND ($3 OR n.courier_sync_next_at IS NULL OR n.courier_sync_next_at <= now())) OR ($3 AND n.courier_sync = 'manual')
               OR (n.courier_sync = 'sending' AND n.courier_sync_next_at <= now() - interval '2 minutes'))
        RETURNING n.courier_sync_action AS action, n.courier_sync_comment AS comment, n.courier_sync_attempts AS attempts, s.awb, cp.code, cp.aggregator`, [caseId, sellerId, force])).rows[0];
    if (!claimed) {
      // The parcel moved on meanwhile (delivered, returning, lost): the instruction is no longer needed and must not be sent late.
      await db.query(`UPDATE ndr_cases n SET courier_sync = NULL, courier_sync_error = 'Not sent: the parcel was no longer undelivered (the courier moved it on first).' FROM shipments s WHERE n.id = $1 AND s.id = n.shipment_id AND s.state <> 'ndr' AND n.courier_sync IN ('pending', 'failed')`, [caseId]);
      const now = (await db.query<{ s: string | null; e: string | null }>('SELECT courier_sync AS s, courier_sync_error AS e FROM ndr_cases WHERE id = $1 AND seller_id = $2', [caseId, sellerId])).rows[0];
      return now?.s === 'sent' ? { status: 'sent' } : now?.s === 'sending' || now?.s === 'pending' ? { status: 'failed', message: 'Being sent to the courier right now.' } : now?.s ? { status: now.s as 'failed' | 'manual', message: now.e ?? undefined } : { status: 'not_applicable' };
    }
    const adapter = claimed.awb ? courierAdapter(claimed.aggregator, claimed.code) : null;
    if (!adapter?.ndrAction) {
      await db.query(`UPDATE ndr_cases SET courier_sync = 'manual', courier_sync_error = $2 WHERE id = $1`, [caseId, PORTAL]);
      return { status: 'manual', message: PORTAL };
    }
    try {
      await adapter.ndrAction(claimed.awb!, claimed.action, claimed.comment || 'Seller action from NEXGO');
    } catch (e) {
      const message = sellerSafeMessage((e as Error).message || 'The courier did not accept the request.').slice(0, 300);
      const giveUp = claimed.attempts >= MAX_TRIES;
      await db.query(`UPDATE ndr_cases SET courier_sync = $2, courier_sync_error = $3 WHERE id = $1`, [caseId, giveUp ? 'manual' : 'failed', giveUp ? `${message} Tried ${claimed.attempts} times: please give the instruction in the courier's portal.` : message]);
      await withSellerTransaction(sellerId, (c) => audit(c, { sellerId, actorUserId: actorUserId ?? undefined, action: 'ndr.courier_notify_failed', targetType: 'ndr_case', targetId: caseId, requestId, metadata: { action: claimed.action, attempt: claimed.attempts, error: message } })).catch(() => {});
      return { status: giveUp ? 'manual' : 'failed', message };
    }
    await db.query(`UPDATE ndr_cases SET courier_sync = 'sent', courier_sync_error = NULL, courier_synced_at = now(), courier_sync_next_at = NULL WHERE id = $1`, [caseId]);
    await withSellerTransaction(sellerId, (c) => audit(c, { sellerId, actorUserId: actorUserId ?? undefined, action: 'ndr.courier_notified', targetType: 'ndr_case', targetId: caseId, requestId, metadata: { action: claimed.action, attempt: claimed.attempts } })).catch(() => {});
    return { status: 'sent' };
  } catch (e) {
    console.error('NDR courier sync failed', (e as Error).message);
    return { status: 'failed', message: 'Saved. The courier could not be told yet; it is retried automatically.' };
  }
}

/** Kept for the routes: send right after the answer was saved (markNdrSyncPending ran in that transaction). */
export async function pushNdrToCourier(input: { sellerId: string; userId: string; caseId: string; requestId: string }): Promise<CourierSync> {
  return syncNdrCase(input.sellerId, input.caseId, input.userId, input.requestId);
}

/** Worker: retry the failed ones that are due. */
export async function retryDueNdrSyncs(): Promise<number> {
  const due = (await db.query<{ id: string; seller_id: string }>(`SELECT id, seller_id FROM ndr_cases WHERE (courier_sync IN ('pending', 'failed') AND courier_sync_next_at <= now() - interval '30 seconds') OR (courier_sync = 'sending' AND courier_sync_next_at <= now() - interval '2 minutes') ORDER BY courier_sync_next_at LIMIT 20`)).rows;
  for (const r of due) await syncNdrCase(r.seller_id, r.id, null, 'ndr-sync-retry');
  return due.length;
}
