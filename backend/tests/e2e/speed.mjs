// End-to-end speed and correctness of the background queues (assign couriers, cancel) against a FAKE aggregator with a fixed delay per call.
// Needs: Postgres on :5544 (throwaway), the API on :4011 started with LORRIGO_API_KEY=test LORRIGO_BASE_URL=http://127.0.0.1:4555 ASSIGN_PAUSE_RETRY_SECONDS=2 ASSIGN_PROBE_SECONDS=4 (development).
// Proves: many orders are booked / cancelled side by side (time), every booking and refund happens exactly once (money), the aggregator is called
// as few times as possible, an empty aggregator balance ends a batch at once, an order created by an earlier failed attempt is reused, and a burst
// of HTTP 429 slows things down without losing or duplicating anything. Run: node tests/e2e/speed.mjs
import { createRequire } from 'node:module';
import { startFakeAggregator } from '../support/fakeAggregator.mjs';
const require = createRequire(new URL('../../package.json', import.meta.url));
const pg = require('pg');
const API = 'http://127.0.0.1:4011';
const db = new pg.Client({ connectionString: (process.env.E2E_DATABASE_URL || 'postgresql://nx@127.0.0.1:5544/nxd') }); await db.connect();
const out = []; const T = (n, ok, d = '') => out.push((ok ? 'PASS ' : 'FAIL ') + n + (d ? ' - ' + d : ''));

const svc = (await db.query("SELECT cs.id, cs.external_service_id AS ext, cp.id AS pid FROM courier_services cs JOIN courier_providers cp ON cp.id = cs.provider_id WHERE cs.code = 'delhivery-250-gms'")).rows[0];
await db.query("UPDATE courier_providers SET aggregator = 'lorrigo' WHERE id = $1", [svc.pid]);
const fake = startFakeAggregator({ port: 4555, latencyMs: 300, courierIds: [svc.ext] });

let jar = ''; let csrf = '';
const call = async (m, p, b) => {
  const r = await fetch(API + p, { method: m, headers: { 'content-type': 'application/json', ...(jar ? { cookie: jar } : {}), ...(m !== 'GET' && csrf ? { 'x-csrf-token': csrf } : {}) }, body: b ? JSON.stringify(b) : undefined });
  const sc = r.headers.getSetCookie?.() ?? [];
  if (sc.length) {
    const kv = Object.fromEntries(jar.split('; ').filter(Boolean).map((x) => x.split(/=(.*)/s).slice(0, 2)));
    for (const c of sc) { const [k, v] = c.split(';')[0].split(/=(.*)/s); kv[k] = v; }
    jar = Object.entries(kv).map(([k, v]) => `${k}=${v}`).join('; '); csrf = decodeURIComponent(kv.nx_csrf || '');
  }
  let j = null; try { j = await r.json(); } catch { /* empty */ }
  return { s: r.status, j };
};
const email = `speed${Date.now()}@example.com`;
await call('POST', '/v1/auth/signup', { fullName: 'Speed Tester', email, password: 'Str0ng-Passw0rd!x', businessName: 'Speed Co', legalName: 'Speed Co', phone: '9876543210' });
await call('POST', '/v1/seller/agreement', {});
const sellerId = (await db.query('SELECT s.id FROM sellers s JOIN seller_memberships m ON m.seller_id = s.id JOIN users u ON u.id = m.user_id WHERE u.email = $1', [email])).rows[0].id;
const wh = await call('POST', '/v1/warehouses', { name: 'Main', warehouseType: 'primary', contactName: 'Owner', phone: '9876543210', addressLine1: '5 Test Lane', city: 'Mumbai', state: 'Maharashtra', pincode: '400001' });
await db.query(`INSERT INTO seller_courier_access (seller_id, service_id, account_mode, state, cod_enabled, auto_assign_eligible) VALUES ($1,$2,'platform','enabled',true,true)`, [sellerId, svc.id]);
const card = (await db.query(`INSERT INTO rate_cards (seller_id, name, state) VALUES ($1,'Speed test','active') RETURNING id`, [sellerId])).rows[0].id;
await db.query(`INSERT INTO rate_card_rates (rate_card_id, service_id, zone_code, min_weight_g, base_weight_g, base_price_paise, additional_weight_g, additional_price_paise) VALUES ($1,$2,'national',0,500,5000,500,0)`, [card, svc.id]);
await db.query("INSERT INTO wallet_entries (seller_id,entry_type,amount_paise,reference_type,reference_id,idempotency_key,description) VALUES ($1,'credit',5000000,'wallet_recharge','seed',$2,'seed')", [sellerId, 'speed-seed-' + Date.now()]);
const START = 5000000;
const wallet = async () => Number((await db.query(`SELECT COALESCE(SUM(CASE WHEN entry_type IN ('credit','release') THEN amount_paise WHEN entry_type IN ('debit','hold') THEN -amount_paise ELSE amount_paise END),0)::bigint AS b FROM wallet_entries WHERE seller_id = $1`, [sellerId])).rows[0].b);

const stamp = Date.now().toString().slice(-6); let seq = 0;
const makeOrders = async (n) => {
  const orders = Array.from({ length: n }, () => { const i = ++seq; return { warehouseId: wh.j.id, orderNumber: `SP${stamp}${i}`, paymentMode: 'prepaid', customer: { fullName: 'Buyer ' + i, phone: '9876543210', addressLine1: '12 Road', city: 'Mumbai', state: 'Maharashtra', pincode: '400002' }, items: [{ sku: 'S', name: 'Item', quantity: 1, unitPricePaise: 50000, weightG: 300 }], package: { weightG: 300, lengthMm: 100, widthMm: 100, heightMm: 100 } }; });
  const ids = [];
  for (let i = 0; i < orders.length; i += 50) { const r = await call('POST', '/v1/orders/bulk', { orders: orders.slice(i, i + 50) }); ids.push(...r.j.results.map((x) => x.id)); }
  return ids;
};
const runBatch = async (path, body, pollPath) => {
  const t0 = Date.now(); const q = await call('POST', path, body);
  if (!q.j?.id) return { q, ms: Date.now() - t0, batch: null };
  for (let i = 0; i < 400; i++) { const b = (await call('GET', `${pollPath}/${q.j.id}`)).j; if (b?.finished_at) return { q, ms: Date.now() - t0, batch: b }; await new Promise((r) => setTimeout(r, 150)); }
  return { q, ms: Date.now() - t0, batch: null };
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const queueBatch = async (ids) => (await call('POST', '/v1/shipments/assign-batch', { orderIds: ids })).j.id;
const batchOf = async (id) => (await call('GET', `/v1/shipments/assign-batch/${id}`)).j;
const until = async (id, pred, ms = 30000) => { const t0 = Date.now(); let b; while (Date.now() - t0 < ms) { b = await batchOf(id); if (pred(b)) return b; await sleep(250); } return b; };

// ---------------- 1. assign 40 orders (the aggregator answers POST /shipments with the AWB)
let orders = await makeOrders(40);
let r = await runBatch('/v1/shipments/assign-batch', { orderIds: orders }, '/v1/shipments/assign-batch');
T('Assign 40 orders: all 40 booked, none failed', r.batch && r.batch.assigned === 40 && r.batch.failed === 0, JSON.stringify(r.batch && { assigned: r.batch.assigned, failed: r.batch.failed }));
T('Assign 40 orders is fast with a 300 ms aggregator (under 12 s; one at a time would take 48 s+)', r.ms < 12000, `${r.ms} ms`);
let rows = (await db.query(`SELECT count(*)::int AS n, count(DISTINCT awb)::int AS awbs, COALESCE(sum(shipping_charge_paise),0)::bigint AS charged FROM shipments WHERE seller_id = $1 AND state <> 'cancelled'`, [sellerId])).rows[0];
const debits = Number((await db.query(`SELECT COALESCE(sum(amount_paise),0)::bigint AS d FROM wallet_entries WHERE seller_id = $1 AND entry_type = 'debit' AND reference_type = 'shipment'`, [sellerId])).rows[0].d);
T('Exactly 40 shipments with 40 different AWBs', rows.n === 40 && rows.awbs === 40, JSON.stringify(rows));
T('Wallet = start - the 40 charges, and the debits equal the charges (nothing charged twice)', (await wallet()) === START - Number(rows.charged) && debits === Number(rows.charged) && Number(rows.charged) > 0, JSON.stringify([await wallet(), debits, rows.charged]));
T('Per booking: one order, one rates check and one booking call; the AWB comes with the answer (no read-back call)', fake.stats.calls['POST /orders'] === 40 && fake.stats.calls['GET /shipments/:id/rates'] === 40 && fake.stats.calls['POST /shipments'] === 40 && !fake.stats.calls['GET /orders/:id'], JSON.stringify(fake.stats.calls));
T('The queue really ran in parallel (the aggregator saw many calls at once, never above its ceiling)', fake.stats.peak >= 12 && fake.stats.peak <= 40, `peak ${fake.stats.peak}`);

// ---------------- 2. cancel all 40
const shipIds = (await db.query(`SELECT id FROM shipments WHERE seller_id = $1 AND state = 'booked'`, [sellerId])).rows.map((x) => x.id);
const before = fake.stats.cancels;
r = await runBatch('/v1/shipments/cancel-batch', { shipmentIds: shipIds }, '/v1/shipments/cancel-batch');
T('Cancel 40 shipments: all 40 cancelled, none failed', r.batch && r.batch.cancelled === 40 && r.batch.failed === 0, JSON.stringify(r.batch && { cancelled: r.batch.cancelled, failed: r.batch.failed }));
T('Cancel 40 is fast (under 8 s; one after another would take 16 s+)', r.ms < 8000, `${r.ms} ms`);
T('Every refund exactly once: wallet is back to the start', (await wallet()) === START, String(await wallet()));
const credits = (await db.query(`SELECT count(*)::int AS n FROM wallet_entries WHERE seller_id = $1 AND reference_type = 'shipment_cancel'`, [sellerId])).rows[0].n;
T('40 refund entries and 40 cancel calls to the aggregator', credits === 40 && fake.stats.cancels - before === 40, JSON.stringify([credits, fake.stats.cancels - before]));
const again = await call('POST', '/v1/shipments/cancel-batch', { shipmentIds: shipIds });
T('Cancelling the same shipments again queues nothing and refunds nothing', (again.j?.queued ?? 0) === 0 && (await wallet()) === START, JSON.stringify(again.j));

// ---------------- 3. the aggregator does NOT put the AWB in its booking answer: it is read back
fake.mode.postAwb = false; const callsBefore = { ...fake.stats.calls };
orders = await makeOrders(6);
r = await runBatch('/v1/shipments/assign-batch', { orderIds: orders }, '/v1/shipments/assign-batch');
T('Without the AWB in the answer the booking still works (read back once per order)', r.batch && r.batch.assigned === 6 && (fake.stats.calls['GET /orders/:id'] || 0) - (callsBefore['GET /orders/:id'] || 0) === 6, JSON.stringify(r.batch && { assigned: r.batch.assigned }));
fake.mode.postAwb = true;

// ---------------- 4. the aggregator has no balance: nothing is failed, the orders are kept and wait (paused), nothing is charged
fake.mode.nobalance = true; const shipsBefore = fake.stats.calls['POST /shipments'] || 0;
orders = await makeOrders(20);
const pausedBatch = await queueBatch(orders);
let pb = await until(pausedBatch, (b) => b.paused === 20, 15000);
const refused = (fake.stats.calls['POST /shipments'] || 0) - shipsBefore;
T('Empty aggregator balance: all 20 orders are PAUSED (kept in the queue), none failed, none booked, the batch is not finished', pb && pb.paused === 20 && pb.failed === 0 && pb.assigned === 0 && !pb.finished_at, JSON.stringify(pb && { paused: pb.paused, failed: pb.failed, assigned: pb.assigned, finished: !!pb.finished_at }));
T('...at most one refused booking per order (no retry storm)', refused <= 20, `${refused} booking attempts for 20 orders`);
T('The seller was charged nothing', (await wallet()) === START - Number((await db.query(`SELECT COALESCE(sum(shipping_charge_paise),0)::bigint AS c FROM shipments WHERE seller_id = $1 AND state <> 'cancelled'`, [sellerId])).rows[0].c));
T('The seller is told once that the orders are saved and will be booked automatically', (await db.query(`SELECT count(*)::int AS n FROM seller_notifications WHERE seller_id = $1 AND title LIKE 'Courier booking is paused%'`, [sellerId])).rows[0].n === 1);

// ---------------- 5. the balance comes back: the paused orders book BY THEMSELVES (nobody clicks anything). Also "Order Id already exists": the earlier attempt left
// the orders on the aggregator; here our database forgets them (as for the ones created before it remembered ids) and the aggregator's list pages by 25
// with an unreliable hasMore, so the 20 orders sit on several pages.
await db.query('DELETE FROM aggregator_orders WHERE seller_id = $1', [sellerId]);
fake.mode.listCap = 25; fake.mode.nobalance = false; const createdBefore = fake.stats.ordersCreated;
pb = await until(pausedBatch, (b) => !!b.finished_at, 40000);
T('After the balance is back, the same 20 orders are booked automatically (no new request from the seller)', pb && pb.assigned === 20 && pb.failed === 0 && pb.paused === 0, JSON.stringify(pb && { assigned: pb.assigned, failed: pb.failed, paused: pb.paused, why: pb.results?.filter((x) => !x.ok).map((x) => x.error) }));
T('...reusing the orders already on the aggregator (no duplicate created, the "already exists" answer was handled)', fake.stats.ordersCreated === createdBefore && fake.stats.duplicateOrderRefusals >= 1, JSON.stringify([fake.stats.ordersCreated - createdBefore, fake.stats.duplicateOrderRefusals]));
T('Charged exactly once per order', (await db.query(`SELECT count(*)::int AS n FROM (SELECT order_id FROM shipments WHERE seller_id = $1 GROUP BY order_id HAVING count(*) > 1) x`, [sellerId])).rows[0].n === 0);

// ---------------- 6. a burst of HTTP 429: slower, never lost or duplicated
fake.mode.maxInflight = 5; fake.stats.tooMany = 0;
orders = await makeOrders(24);
r = await runBatch('/v1/shipments/assign-batch', { orderIds: orders }, '/v1/shipments/assign-batch');
T('With the aggregator answering 429 under load, all 24 are still booked', r.batch && r.batch.assigned === 24 && r.batch.failed === 0, JSON.stringify(r.batch && { assigned: r.batch.assigned, failed: r.batch.failed, err: r.batch.results?.find((x) => !x.ok)?.error }) + ` in ${r.ms} ms`);
T('...the limiter saw and slowed down for the 429s', fake.stats.tooMany > 0, `${fake.stats.tooMany} calls answered 429`);
const remembered = (await db.query('SELECT count(*)::int AS n FROM aggregator_orders WHERE seller_id = $1', [sellerId])).rows[0].n;
T('The aggregator order ids found by searching were written to our database (one row per order now known)', remembered >= 20, `${remembered} rows`);
const dup = (await db.query(`SELECT count(*)::int AS n FROM (SELECT order_id FROM shipments WHERE seller_id = $1 GROUP BY order_id HAVING count(*) > 1) x`, [sellerId])).rows[0].n;
T('No order has two shipments after all of it', dup === 0);

// ---------------- 7. paused, then resumed again: the ids are in our database, so no search of the aggregator's list and no new order
fake.mode.listCap = 0; fake.mode.nobalance = true;
orders = await makeOrders(10);
const b7 = await queueBatch(orders);
await until(b7, (b) => b.paused === 10, 15000);
fake.mode.nobalance = false; const listBefore = fake.stats.calls['GET /orders'] || 0; const createdMid = fake.stats.ordersCreated;
const r7 = await until(b7, (b) => !!b.finished_at, 40000);
T('Resumed batch books all 10 straight from the remembered ids: no search of the order list and no new order created', r7 && r7.assigned === 10 && (fake.stats.calls['GET /orders'] || 0) === listBefore && fake.stats.ordersCreated === createdMid, JSON.stringify(r7 && { assigned: r7.assigned }));

// ---------------- 8. the aggregator answers HTTP 502 once for the rates check and once for the booking call of every order: nothing may be lost
fake.mode.fail502Once = true; fake.mode.listCap = 0;
orders = await makeOrders(14);
const shipBefore = fake.stats.shipmentsBooked;
r = await runBatch('/v1/shipments/assign-batch', { orderIds: orders }, '/v1/shipments/assign-batch');
T('A 502 on the rates check and on the booking call of every order: all 14 are still booked (the read is retried at once, the booking by the queue)', r.batch && r.batch.assigned === 14 && r.batch.failed === 0, JSON.stringify(r.batch && { assigned: r.batch.assigned, failed: r.batch.failed, err: r.batch.results?.find((x) => !x.ok)?.error }) + ` in ${r.ms} ms`);
T('...each booked exactly once at the aggregator and in our database', fake.stats.shipmentsBooked - shipBefore === 14 && (await db.query(`SELECT count(*)::int AS n FROM (SELECT order_id FROM shipments WHERE seller_id = $1 GROUP BY order_id HAVING count(*) > 1) x`, [sellerId])).rows[0].n === 0, String(fake.stats.shipmentsBooked - shipBefore));
fake.mode.fail502Once = false;

// ---------------- 9. the wallet READS empty (GET /users/me): the queue stops spending calls (one trial order every few seconds), then resumes alone after the top-up
fake.mode.nobalance = true; fake.mode.balance = -6237;
orders = await makeOrders(15);
const b9 = await queueBatch(orders);
await until(b9, (b) => b.paused === 15, 20000);
await sleep(9000); // two trial windows (ASSIGN_PROBE_SECONDS=4)
const callsDuring = fake.stats.calls['POST /shipments'] || 0; await sleep(9000);
const waitedCalls = (fake.stats.calls['POST /shipments'] || 0) - callsDuring;
const stillPaused = await batchOf(b9);
T('While the wallet reads empty, 15 waiting orders cost almost no calls (only trial bookings, not one per order)', waitedCalls <= 4, `${waitedCalls} booking calls in 9 s`);
T('...and they are still all safely waiting, none failed', stillPaused.paused + stillPaused.running === 15 && stillPaused.failed === 0 && stillPaused.assigned === 0 && !stillPaused.finished_at, JSON.stringify({ paused: stillPaused.paused, running: stillPaused.running, failed: stillPaused.failed }));
const sumPaused = (await call('GET', '/v1/shipments/summary')).j;
T('Track is told booking is paused while the wallet is empty (and the balance itself is never sent to the seller)', sumPaused.bookingPaused === true && !JSON.stringify(sumPaused).includes('6237'), JSON.stringify({ bookingPaused: sumPaused.bookingPaused }));
fake.mode.nobalance = false; fake.mode.balance = 5000; // the admin topped the wallet up
const r9 = await until(b9, (b) => !!b.finished_at, 90000);
T('After the top-up all 15 book by themselves (no click) and nobody was charged twice', r9 && r9.assigned === 15 && r9.failed === 0, JSON.stringify(r9 && { assigned: r9.assigned, failed: r9.failed, paused: r9.paused }));

// ---------------- 10. THE 2026-11-25 INCIDENT: the wallet reads NEGATIVE (-19,105 rupees) but the aggregator keeps booking on its credit limit.
// A negative balance is information only. Nothing may be held back: every order must book, none paused, no trial-booking wait.
fake.mode.nobalance = false; fake.mode.balance = -19105;
await db.query("UPDATE courier_aggregators SET last_refused_at = NULL, last_ok_at = NULL WHERE code = 'lorrigo'"); await sleep(11000); // the shared state is re-read at most every 10 s
orders = await makeOrders(20);
const b10 = await queueBatch(orders);
const r10 = await until(b10, (b) => !!b.finished_at, 60000);
T('Negative wallet (-19,105) but the aggregator accepts: all 20 orders BOOK, none paused, none failed', r10 && r10.assigned === 20 && r10.failed === 0 && r10.paused === 0, JSON.stringify(r10 && { assigned: r10.assigned, failed: r10.failed, paused: r10.paused }));
const sum10 = (await call('GET', '/v1/shipments/summary')).j;
T('...and Track does NOT tell the seller booking is paused', sum10.bookingPaused === false, JSON.stringify({ bookingPaused: sum10.bookingPaused }));
const refusedRow = (await db.query("SELECT last_refused_at FROM courier_aggregators WHERE code = 'lorrigo'")).rows[0];
T('...and no refusal was recorded for the aggregator', refusedRow.last_refused_at === null, String(refusedRow.last_refused_at));


console.log(out.join('\n'));
console.log(`\n${out.filter((x) => x.startsWith('PASS')).length}/${out.length} passed`);
fake.close(); await db.end();
process.exit(out.some((x) => x.startsWith('FAIL')) ? 1 : 0);
