import { apiFetch, notifyWalletChanged } from '@/lib/api';
import { finishJob, startJob, updateJob } from '@/lib/jobProgress';
import { askAgain, nextStep, notQueuedResults } from '@/lib/batchSteps';

// Assigns couriers to many orders through the background queue.
// The browser only queues a batch (POST /v1/shipments/assign-batch answers at once) and then asks for progress every couple of seconds;
// the bookings run in the worker, a few at a time, so nothing depends on one long request and the page can be closed or refreshed
// (Track shows a progress banner for a batch that is still running, see ActiveAssignBanner in CourierChooser.jsx).
//
// Returns one result per order: { orderId, ok, awb?, courier?, error? }, including orders the server refused to queue (incomplete, already booked).
// Orders that are saved and still waiting (booking paused, worker down, already in another batch) are NOT included; `results.waiting` counts the ones of this call.
const MAX_PER_BATCH = 2000; // the API limit
const POLL_MS = 1000;
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

export async function assignInBatches(orderIds, { courier, onProgress } = {}) {
  const results = [];
  let finishedBefore = 0; let okBefore = 0; let failedBefore = 0; let pausedNow = 0; let stalled = false;
  const job = startJob('assign', orderIds.length); // the progress card on every page
  try {
    for (let i = 0; i < orderIds.length; i += MAX_PER_BATCH) {
      const chunk = orderIds.slice(i, i + MAX_PER_BATCH);
      const queued = await apiFetch('/v1/shipments/assign-batch', { method: 'POST', body: { orderIds: chunk, ...(courier || {}) } });
      const refused = notQueuedResults(queued); results.push(...refused); failedBefore += refused.length;
      if (!queued.id) { finishedBefore += chunk.length; onProgress?.(finishedBefore, orderIds.length); updateJob(job, { done: finishedBefore }); continue; } // nothing eligible (already booked / queued)
      let batch; let stalledPolls = 0;
      for (;;) {
        batch = await askAgain(() => apiFetch(`/v1/shipments/assign-batch/${queued.id}`), { sleep });
        notifyWalletChanged();
        onProgress?.(Math.min(finishedBefore + batch.done, orderIds.length), orderIds.length);
        updateJob(job, { done: Math.min(finishedBefore + batch.done, orderIds.length), ok: okBefore + batch.assigned, failed: failedBefore + batch.failed, stalled: !!batch.stalled });
        stalledPolls = batch.stalled ? stalledPolls + 1 : 0;
        const step = nextStep(batch, stalledPolls);
        if (step === 'done') break;
        // Booking is paused, or the background worker is down: the orders are kept on the server and book by themselves later, so stop waiting.
        if (step !== 'wait') { pausedNow += batch.queued + batch.running; if (step === 'stalled') stalled = true; break; }
        await sleep(POLL_MS);
      }
      results.push(...(batch.results || [])); // paused orders are not results: they are still waiting in the queue
      finishedBefore += chunk.length; okBefore += batch.assigned; failedBefore += batch.failed;
    }
    results.waiting = pausedNow;
    finishJob(job, { ok: okBefore, failed: failedBefore, paused: pausedNow, stalled, firstError: results.find((r) => !r.ok)?.error || '' });
    return results;
  } catch (e) {
    finishJob(job, { error: (e && e.message) || 'Assigning couriers could not be completed. Check Track and try again.' });
    throw e;
  }
}
