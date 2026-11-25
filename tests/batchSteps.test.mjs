import test from 'node:test';
import assert from 'node:assert/strict';
import { STALLED_POLLS, askAgain, assignSentence, nextStep, notQueuedResults } from '../lib/batchSteps.js';
import { applyAssignmentResults, summarizeBulk } from '../lib/bulkOutcome.js';

const b = (x) => ({ finished_at: null, paused: 0, running: 0, queued: 0, stalled: false, ...x });
test('a finished batch is done, whatever else it says', () => assert.equal(nextStep(b({ finished_at: 'x', stalled: true, paused: 3 }), 99), 'done'));
test('everything left is paused: stop waiting', () => assert.equal(nextStep(b({ paused: 3, queued: 3 })), 'paused'));
test('some paused but others still running: keep waiting', () => assert.equal(nextStep(b({ paused: 3, queued: 3, running: 1 })), 'wait'));
test('worker down: wait a little (a restart), then stop and say so', () => { assert.equal(nextStep(b({ queued: 5, stalled: true }), 3), 'wait'); assert.equal(nextStep(b({ queued: 5, stalled: true }), STALLED_POLLS), 'stalled'); });
test('worker alive: never stalled', () => assert.equal(nextStep(b({ queued: 5 }), 999), 'wait'));

test('orders the server refused to queue are results with a reason, so the bulk screen does not promise they book by themselves', () => {
  const results = notQueuedResults({ notQueued: [{ id: 'o2', reason: 'Order details are incomplete.' }] });
  assert.deepEqual(results, [{ orderId: 'o2', ok: false, error: 'Order details are incomplete.' }]);
  const outcome = new Map([['A', { created: true, orderId: 'o1' }], ['B', { created: true, orderId: 'o2' }]]);
  const rows = [...applyAssignmentResults(outcome, ['o1', 'o2'], results).values()];
  const s = summarizeBulk(rows);
  assert.equal(s.queued, 1); // only the one that really waits
  assert.equal(s.refused, 1);
  assert.equal(s.created + s.refused, 2);
});
test('an older server without the list changes nothing', () => assert.deepEqual(notQueuedResults({ id: 'x' }), []));

test('nothing assigned but orders waiting is never a success message', () => {
  const s = assignSentence({ assigned: 0, failed: 0, waiting: 4 });
  assert.equal(s.tone, 'error'); assert.match(s.text, /0 orders assigned, 4 saved and waiting/);
});
test('all assigned is a success', () => assert.deepEqual(assignSentence({ assigned: 1, failed: 0, waiting: 0 }), { text: '1 order assigned to a courier', tone: 'success' }));
test('failures name the reason', () => assert.match(assignSentence({ assigned: 1, failed: 2, waiting: 0, firstError: 'No courier' }).text, /2 not assigned: No courier/));

const sleep = async () => {};
test('a progress question that fails is asked again (the batch runs on the server)', async () => {
  let n = 0; const r = await askAgain(async () => { n += 1; if (n < 4) throw Object.assign(new Error('network'), { status: n === 1 ? 0 : 502 }); return 'ok'; }, { sleep });
  assert.equal(r, 'ok'); assert.equal(n, 4);
});
test('a clear refusal (404) is not asked again', async () => { let n = 0; await assert.rejects(askAgain(async () => { n += 1; throw Object.assign(new Error('gone'), { status: 404 }); }, { sleep })); assert.equal(n, 1); });
test('it gives up in the end', async () => { let n = 0; await assert.rejects(askAgain(async () => { n += 1; throw Object.assign(new Error('down'), { status: 503 }); }, { sleep, giveUp: 5 })); assert.equal(n, 5); });

test('an order that was already booked is not a failure: it comes back with its AWB, and nothing is said to be charged again', () => {
  const results = notQueuedResults({ notQueued: [{ id: 'o1', reason: 'This order already has a courier.', awb: 'AWB1', courier: 'Delhivery' }, { id: 'o2', reason: 'Order details are incomplete.' }] });
  assert.deepEqual(results[0], { orderId: 'o1', ok: true, already: true, awb: 'AWB1', courier: 'Delhivery' });
  assert.equal(results[1].ok, false);
  const rows = [...applyAssignmentResults(new Map([['A', { created: true, existing: true, orderId: 'o1' }], ['B', { created: true, orderId: 'o2' }]]), ['o1', 'o2'], results).values()];
  const s = summarizeBulk(rows);
  assert.deepEqual([s.booked, s.already, s.refused, s.failed], [1, 1, 1, 0]);
  assert.match(rows[1].failure, /^Order saved, but no courier yet: /);
  assert.match(assignSentence({ assigned: 0, failed: 0, waiting: 0, already: 3 }).text, /3 orders already had a courier\. Nothing was booked or charged again/);
});
