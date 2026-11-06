import { apiFetch } from '@/lib/api';

// Assigns couriers to many orders without ever sending one long request.
// Each order is a live booking at the courier aggregator (about 8 seconds), and every layer in front of the API gives up on a request
// after 60 seconds. So the orders go in small batches, a few batches at a time, and one batch that fails or times out never stops the rest.
// The server holds the wallet lock only for the short money step, so batches really do run side by side.
//
// Returns one result per order: { orderId, ok, awb?, courier?, error? }.
export const BATCH_SIZE = 3;
export const PARALLEL_BATCHES = 4;

export async function assignInBatches(orderIds, { courier, onProgress } = {}) {
  const batches = [];
  for (let i = 0; i < orderIds.length; i += BATCH_SIZE) batches.push(orderIds.slice(i, i + BATCH_SIZE));
  const results = [];
  let done = 0;

  const run = async (ids) => {
    try {
      const r = await apiFetch('/v1/shipments/auto-assign', { method: 'POST', body: { orderIds: ids, ...(courier || {}) } });
      results.push(...(r.results || []));
    } catch (error) {
      // A timeout or network drop: the booking may still have gone through on the server, so say so instead of calling it a failure.
      const message = error?.status === 402 ? error.message : `No answer in time (${error?.message || 'network error'}). Refresh Track: if it is not booked, assign it again.`;
      results.push(...ids.map((orderId) => ({ orderId, ok: false, error: message })));
    }
    done += ids.length;
    onProgress?.(Math.min(done, orderIds.length), orderIds.length);
  };

  // The first batch goes alone: it creates the pickup address at the aggregator once, so parallel batches do not create it twice.
  if (batches.length) await run(batches.shift());
  let next = 0;
  const worker = async () => { while (next < batches.length) { const ids = batches[next++]; await run(ids); } };
  await Promise.all(Array.from({ length: Math.min(PARALLEL_BATCHES, batches.length) }, worker));
  return results;
}
