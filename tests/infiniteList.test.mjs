import test from 'node:test';
import assert from 'node:assert/strict';
import { createListLoader } from '../lib/infiniteListCore.js';

const rows = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => ({ id: `r${from + i}` }));
// A cursor list over 120 rows (what Track will use): cursor = index to start at.
const cursorSource = (total = 120, delay = 0) => async (cursor, limit) => {
  if (delay) await new Promise((r) => setTimeout(r, delay));
  const start = cursor === null ? 0 : Number(cursor);
  const items = rows(start + 1, Math.min(total, start + limit));
  return { items, nextCursor: start + limit < total ? String(start + limit) : null, total };
};
// A page list over 95 rows (the older endpoints): { items, page, pages, total }.
const pageSource = (total = 95) => async (page, limit) => {
  const p = page === null ? 1 : Number(page);
  return { items: rows((p - 1) * limit + 1, Math.min(total, p * limit)), page: p, pages: Math.ceil(total / limit), total };
};

test('first batch, then more, until the end; nothing is requested after the end', async () => {
  let calls = 0; const src = cursorSource(120);
  const loader = createListLoader({ fetchPage: async (c, l) => { calls += 1; return src(c, l); }, pageSize: 50 });
  await loader.reset();
  assert.equal(loader.state.items.length, 50); assert.equal(loader.state.total, 120); assert.equal(loader.state.hasMore, true);
  await loader.loadMore(); assert.equal(loader.state.items.length, 100);
  await loader.loadMore(); assert.equal(loader.state.items.length, 120); assert.equal(loader.state.hasMore, false);
  await loader.loadMore(); await loader.loadMore();
  assert.equal(calls, 3); // no request once the end is reached
  assert.deepEqual(loader.state.items.map((r) => r.id), rows(1, 120).map((r) => r.id)); // in order, nothing missing
});

test('page lists work the same way', async () => {
  const loader = createListLoader({ fetchPage: pageSource(95), pageSize: 40 });
  await loader.reset(); assert.equal(loader.state.items.length, 40); assert.equal(loader.state.hasMore, true);
  await loader.loadMore(); await loader.loadMore();
  assert.equal(loader.state.items.length, 95); assert.equal(loader.state.hasMore, false);
});

test('only one batch is requested at a time', async () => {
  let calls = 0;
  const loader = createListLoader({ fetchPage: async (c, l) => { calls += 1; return cursorSource(300, 20)(c, l); }, pageSize: 50 });
  await loader.reset(); calls = 0;
  await Promise.all([loader.loadMore(), loader.loadMore(), loader.loadMore(), loader.loadMore()]); // the scroll sentinel can fire many times
  assert.equal(calls, 1); assert.equal(loader.state.items.length, 100);
});

test('an answer that arrives after a reset (new filter) is ignored: the newest request wins', async () => {
  const slow = async () => { await new Promise((r) => setTimeout(r, 60)); return { items: [{ id: 'old' }], nextCursor: null, total: 1 }; };
  const fast = async () => ({ items: [{ id: 'new' }], nextCursor: null, total: 1 });
  let which = slow;
  const loader = createListLoader({ fetchPage: (c, l) => which(c, l), pageSize: 50 });
  const first = loader.reset(); // old filter, slow
  which = fast; const second = loader.reset(); // new filter, fast
  await Promise.all([first, second]);
  assert.deepEqual(loader.state.items.map((r) => r.id), ['new']);
  await new Promise((r) => setTimeout(r, 90));
  assert.deepEqual(loader.state.items.map((r) => r.id), ['new']); // the slow old answer never overwrote it
});

test('a row that shifts into the next batch is shown once', async () => {
  let n = 0;
  const loader = createListLoader({
    fetchPage: async (c) => (c === null ? { items: [{ id: 'a' }, { id: 'b' }], nextCursor: 'x', total: 4 } : { items: [{ id: 'b' }, { id: 'c' }, { id: 'd' }], nextCursor: null, total: 4 }),
    pageSize: 2,
  });
  void n; await loader.reset(); await loader.loadMore();
  assert.deepEqual(loader.state.items.map((r) => r.id), ['a', 'b', 'c', 'd']);
});

test('a failed batch keeps what is on screen and can be retried', async () => {
  let fail = true;
  const loader = createListLoader({ fetchPage: async (c, l) => { if (c !== null && fail) throw new Error('network'); return cursorSource(100)(c, l); }, pageSize: 50 });
  await loader.reset(); await loader.loadMore();
  assert.equal(loader.state.items.length, 50); assert.equal(loader.state.error.message, 'network'); assert.equal(loader.state.loadingMore, false);
  fail = false; await loader.loadMore();
  assert.equal(loader.state.items.length, 100); assert.equal(loader.state.error, null);
});

test('an empty batch that claims there is more cannot loop forever', async () => {
  const loader = createListLoader({ fetchPage: async (c) => (c === null ? { items: [{ id: 'a' }], nextCursor: 'x' } : { items: [], nextCursor: 'y' }), pageSize: 50 });
  await loader.reset(); await loader.loadMore();
  assert.equal(loader.state.hasMore, false);
});

test('a quiet refresh replaces the first batch only when nothing else is loaded', async () => {
  let version = 1;
  const loader = createListLoader({ fetchPage: async (c, l) => { const r = await cursorSource(120)(c, l); return version === 1 ? r : { ...r, items: c === null ? [{ id: 'fresh' }, ...r.items.slice(0, 49)] : r.items, total: 121 }; }, pageSize: 50 });
  await loader.reset();
  version = 2; assert.equal(await loader.refreshFirst(), true);
  assert.equal(loader.state.items[0].id, 'fresh'); assert.equal(loader.state.total, 121);
  await loader.loadMore(); // now 100 rows on screen: a refresh must not move them
  const before = loader.state.items.map((r) => r.id);
  assert.equal(await loader.refreshFirst(), false);
  assert.deepEqual(loader.state.items.map((r) => r.id), before);
});

test('subscribers hear about every change and can leave', async () => {
  const loader = createListLoader({ fetchPage: cursorSource(10), pageSize: 5 });
  const seen = []; const off = loader.subscribe((s) => seen.push(s.loading ? 'loading' : s.items.length));
  await loader.reset(); off(); await loader.loadMore();
  assert.deepEqual(seen, ['loading', 5]); // nothing after unsubscribing
});

test('rows without an id are all kept (no accidental de-duplication)', async () => {
  const loader = createListLoader({ fetchPage: async (p, l) => { const page = p === null ? 1 : Number(p); return { items: Array.from({ length: l }, (_, i) => ({ label: `x${page}-${i}` })), page, pages: 3, total: 3 * l }; }, pageSize: 4 });
  await loader.reset(); await loader.loadMore(); await loader.loadMore();
  assert.equal(loader.state.items.length, 12); assert.equal(loader.state.hasMore, false);
});
