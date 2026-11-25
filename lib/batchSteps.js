// Decisions about a queued batch (assigning couriers, cancelling), kept apart from the network code so they can be tested.

/**
 * What to do after one progress answer:
 *   'done'     the batch is over
 *   'paused'   courier booking is paused: the orders are saved and book by themselves later, stop waiting
 *   'stalled'  the background worker has not been running for a while: everything is saved, stop waiting
 *   'wait'     ask again
 */
export const STALLED_POLLS = 20; // about 20 seconds
export function nextStep(batch, stalledPolls = 0) {
  if (batch.finished_at) return 'done';
  if (batch.paused > 0 && batch.running === 0 && batch.paused >= batch.queued) return 'paused';
  if (batch.stalled && stalledPolls >= STALLED_POLLS) return 'stalled';
  return 'wait';
}

/** Orders the server did NOT queue are results too (with the reason): without this they would look like orders that are still waiting to be booked. */
export const notQueuedResults = (answer) => (answer?.notQueued || []).map((x) => ({ orderId: x.id, ok: false, error: x.reason }));

/** One sentence for the toast after assigning couriers. Saved-and-waiting orders are never called assigned. */
export function assignSentence({ assigned, failed, waiting, firstError = '' }) {
  const n = (c) => `${c} order${c === 1 ? '' : 's'}`;
  if (waiting) return { text: `${n(assigned)} assigned, ${waiting} saved and waiting for courier booking${failed ? `, ${failed} not assigned: ${firstError}` : ''}. The waiting ones book by themselves.`, tone: 'error' };
  if (failed) return { text: `${assigned} assigned, ${failed} not assigned: ${firstError}`, tone: 'error' };
  return { text: `${n(assigned)} assigned to a courier`, tone: 'success' };
}

/** A progress question that failed is asked again: the batch keeps running on the server whatever happens to one request. Only a clear "no" (4xx) ends it. */
export const MAX_POLL_FAILURES = 15;
export async function askAgain(ask, { sleep, giveUp = MAX_POLL_FAILURES } = {}) {
  for (let i = 1; ; i++) {
    try { return await ask(); }
    catch (e) {
      const status = e && e.status;
      if ((status >= 400 && status < 500 && status !== 429) || i >= giveUp) throw e;
      await sleep(Math.min(8000, 1000 * i));
    }
  }
}
