import test from 'node:test';
import assert from 'node:assert/strict';
import { applyAssignmentResults, summarizeBulk, bookingSentence } from '../lib/bulkOutcome.js';

// UX-008: a bulk upload whose courier assignment paused (or whose worker is down) must NOT report those orders as booked or assigned.
const created = (n, over = {}) => ({ created: true, orderId: `id-${n}`, errors: [], ...over });
const rows = () => new Map([['A1', created(1)], ['A2', created(2)], ['A3', created(3)], ['A4', { failure: 'Pincode not found' }], ['A5', created(5)]]);

test('a paused batch returns no results: every sent order is "queued", none is "booked"', () => {
  const out = applyAssignmentResults(rows(), ['id-1', 'id-2', 'id-3', 'id-5'], []);
  const s = summarizeBulk([...out.values()]);
  assert.equal(s.booked, 0);
  assert.equal(s.queued, 4);
  assert.equal(s.created, 4);
  assert.equal(s.failed, 1);
  assert.match(bookingSentence(s), /0 booked, 4 saved and waiting/);
  assert.doesNotMatch(bookingSentence(s), /assigned to a courier/);
});

test('partial results: booked ones keep their AWB, refused ones are refused, the rest wait', () => {
  const results = [
    { orderId: 'id-1', ok: true, awb: 'AWB1', courier: 'Delhivery' },
    { orderId: 'id-2', ok: false, error: 'Courier does not serve this pincode' },
  ];
  const out = applyAssignmentResults(rows(), ['id-1', 'id-2', 'id-3', 'id-5'], results);
  assert.equal(out.get('A1').awb, 'AWB1');
  assert.equal(out.get('A2').unassigned, true);
  assert.match(out.get('A2').failure, /does not serve/);
  assert.equal(out.get('A3').queued, true);
  assert.equal(out.get('A5').queued, true);
  const s = summarizeBulk([...out.values()]);
  assert.deepEqual({ booked: s.booked, queued: s.queued, refused: s.refused, failed: s.failed, created: s.created }, { booked: 1, queued: 2, refused: 1, failed: 1, created: 3 });
});

test('every row has exactly one state and the counts add up to the input', () => {
  const results = [{ orderId: 'id-1', ok: true, awb: 'AWB1', courier: 'X' }, { orderId: 'id-2', ok: false, error: 'no' }];
  const out = applyAssignmentResults(rows(), ['id-1', 'id-2', 'id-3'], results); // id-5 was created but NOT sent for booking
  const s = summarizeBulk([...out.values()]);
  assert.equal(s.booked + s.queued + s.waiting + s.refused + s.failed, s.total, JSON.stringify(s));
  assert.equal(s.waiting, 1); // A5: saved, not sent
});

test('orders that were not sent for booking are left alone (assignment mode "none")', () => {
  const out = applyAssignmentResults(rows(), [], []);
  const s = summarizeBulk([...out.values()]);
  assert.equal(s.queued, 0);
  assert.equal(s.waiting, 4);
  assert.equal(out.get('A1').queued, undefined);
});

test('everything booked reads as assigned', () => {
  const results = [1, 2, 3, 5].map((n) => ({ orderId: `id-${n}`, ok: true, awb: `AWB${n}`, courier: 'D' }));
  const s = summarizeBulk([...applyAssignmentResults(rows(), [1, 2, 3, 5].map((n) => `id-${n}`), results).values()]);
  assert.equal(s.booked, 4);
  assert.equal(bookingSentence(s), '4 orders created and assigned to a courier.');
});

test('a result without an AWB is not counted as booked', () => {
  const out = applyAssignmentResults(rows(), ['id-1'], [{ orderId: 'id-1', ok: true, courier: 'D' }]); // ok but no AWB: not a confirmed booking
  const s = summarizeBulk([...out.values()]);
  assert.equal(s.booked, 0);
});

test('the input Map is not mutated', () => {
  const input = rows();
  applyAssignmentResults(input, ['id-1'], []);
  assert.equal(input.get('A1').queued, undefined);
});
