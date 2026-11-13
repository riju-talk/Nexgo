import { apiFetch, notifyWalletChanged } from '@/lib/api';
import { finishJob, startJob, updateJob } from '@/lib/jobProgress';

// Assigns couriers to many orders through the background queue.
// The browser only queues a batch (POST /v1/shipments/assign-batch answers at once) and then asks for progress every couple of seconds;
// the bookings run in the worker, a few at a time, so nothing depends on one long request and the page can be closed or refreshed
// (Track shows a progress banner for a batch that is still running, see ActiveAssignBanner in CourierChooser.jsx).
//
// Returns one result per order: { orderId, ok, awb?, courier?, error? }. Orders that were already waiting in another batch are not included.
const MAX_PER_BATCH = 2000; // the API limit
const POLL_MS = 1000;
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

export async function assignInBatches(orderIds, { courier, onProgress } = {}) {
  const results = [];
  let finishedBefore = 0; let okBefore = 0; let failedBefore = 0;
  const job = startJob('assign', orderIds.length); // the progress card on every page
  try {
    for (let i = 0; i < orderIds.length; i += MAX_PER_BATCH) {
      const chunk = orderIds.slice(i, i + MAX_PER_BATCH);
      const queued = await apiFetch('/v1/shipments/assign-batch', { method: 'POST', body: { orderIds: chunk, ...(courier || {}) } });
      if (!queued.id) { finishedBefore += chunk.length; onProgress?.(finishedBefore, orderIds.length); updateJob(job, { done: finishedBefore }); continue; } // nothing eligible (already booked / queued)
      let batch;
      for (;;) {
        batch = await apiFetch(`/v1/shipments/assign-batch/${queued.id}`);
        notifyWalletChanged();
        onProgress?.(Math.min(finishedBefore + batch.done, orderIds.length), orderIds.length);
        updateJob(job, { done: Math.min(finishedBefore + batch.done, orderIds.length), ok: okBefore + batch.assigned, failed: failedBefore + batch.failed });
        if (batch.finished_at) break;
        await sleep(POLL_MS);
      }
      results.push(...(batch.results || []));
      finishedBefore += chunk.length; okBefore += batch.assigned; failedBefore += batch.failed;
    }
    finishJob(job, { ok: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, firstError: results.find((r) => !r.ok)?.error || '' });
    return results;
  } catch (e) {
    finishJob(job, { error: (e && e.message) || 'Assigning couriers could not be completed. Check Track and try again.' });
    throw e;
  }
}
