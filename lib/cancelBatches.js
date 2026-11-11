import { apiFetch, notifyWalletChanged } from '@/lib/api';

// Cancels many shipments and/or never-shipped orders through the background queue.
// The browser only queues the batch (POST /v1/shipments/cancel-batch answers at once) and then asks for progress; the worker does the cancelling
// one by one, so there is no limit of 50 and nothing depends on one long request. Closing the page does not stop it (Track shows a banner for a
// batch that is still running).
const MAX_PER_BATCH = 2000; // the API limit
const POLL_MS = 1200;
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

/**
 * Returns { total, cancelled, failed, refundedPaise, errors: [string], skipped } once everything has finished.
 * onProgress({ done, total, cancelled, failed, refundedPaise }) is called after every poll.
 */
export async function cancelInBackground({ shipmentIds = [], orderIds = [] }, { onProgress } = {}) {
  const sum = { total: 0, cancelled: 0, failed: 0, refundedPaise: 0, errors: [], skipped: 0 };
  const everything = [...shipmentIds.map((id) => ['s', id]), ...orderIds.map((id) => ['o', id])];
  const grand = everything.length;
  for (let i = 0; i < everything.length; i += MAX_PER_BATCH) {
    const chunk = everything.slice(i, i + MAX_PER_BATCH);
    const queued = await apiFetch('/v1/shipments/cancel-batch', { method: 'POST', body: { shipmentIds: chunk.filter((x) => x[0] === 's').map((x) => x[1]), orderIds: chunk.filter((x) => x[0] === 'o').map((x) => x[1]) } });
    sum.skipped += queued.skipped || 0;
    if (!queued.id) continue;
    sum.total += queued.queued;
    let batch;
    for (;;) {
      batch = await apiFetch(`/v1/shipments/cancel-batch/${queued.id}`);
      notifyWalletChanged();
      onProgress?.({ done: sum.cancelled + sum.failed + batch.done, total: grand - sum.skipped, cancelled: sum.cancelled + batch.cancelled, failed: sum.failed + batch.failed, refundedPaise: sum.refundedPaise + batch.refunded_paise });
      if (batch.finished_at) break;
      await sleep(POLL_MS);
    }
    sum.cancelled += batch.cancelled; sum.failed += batch.failed; sum.refundedPaise += batch.refunded_paise;
    for (const r of batch.results || []) if (!r.ok && r.error && !sum.errors.includes(r.error)) sum.errors.push(r.error);
  }
  return sum;
}
