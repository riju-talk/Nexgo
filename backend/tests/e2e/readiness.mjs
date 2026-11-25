// End-to-end proof of the booking readiness gate (defects ORD-001, ORD-004, BOOK-010) against a real API, a real database and a FAKE aggregator.
// An incomplete order must be refused by EVERY way of booking (manual book, synchronous auto-assign, the assign queue) with:
//   - the stable code ORDER_NOT_READY and field-level issues, - ZERO calls to the aggregator, - ZERO wallet movement, - NO change of the order's state.
// Needs Postgres on :5544 (throwaway) and the API on :4011 started with
//   LORRIGO_API_KEY=test LORRIGO_BASE_URL=http://127.0.0.1:4555 TRACKING_POLL_MINUTES=0 ASSIGN_PAUSE_RETRY_SECONDS=2 ASSIGN_PROBE_SECONDS=4
// Run: node tests/e2e/readiness.mjs
import { createRequire } from 'node:module';
import { startFakeAggregator } from '../support/fakeAggregator.mjs';
const require = createRequire(new URL('../../package.json', import.meta.url));
const pg = require('pg');
const API = 'http://127.0.0.1:4011';
const db = new pg.Client({ connectionString: 'postgresql://nx@127.0.0.1:5544/nxd' }); await db.connect();
const out = []; const T = (n, ok, d = '') => out.push((ok ? 'PASS ' : 'FAIL ') + n + (d ? ' - ' + d : ''));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const svc = (await db.query("SELECT cs.id, cs.code, cs.external_service_id AS ext, cp.id AS pid, cp.code AS pcode FROM courier_services cs JOIN courier_providers cp ON cp.id = cs.provider_id WHERE cs.code = 'delhivery-250-gms'")).rows[0];
await db.query("UPDATE courier_providers SET aggregator = 'lorrigo' WHERE id = $1", [svc.pid]);
await db.query("UPDATE courier_aggregators SET last_refused_at = NULL, last_ok_at = NULL WHERE code = 'lorrigo'");
const fake = startFakeAggregator({ port: 4555, latencyMs: 50, courierIds: [svc.ext] });
const calls = () => Object.values(fake.stats.calls).reduce((a, b) => a + b, 0);

let jar = ''; let csrf = '';
const call = async (m, p, b, extra = {}) => {
  const r = await fetch(API + p, { method: m, headers: { 'content-type': 'application/json', ...(jar ? { cookie: jar } : {}), ...(m !== 'GET' && csrf ? { 'x-csrf-token': csrf } : {}), ...extra }, body: b ? JSON.stringify(b) : undefined });
  const sc = r.headers.getSetCookie?.() ?? [];
  if (sc.length) { const kv = Object.fromEntries(jar.split('; ').filter(Boolean).map((x) => x.split(/=(.*)/s).slice(0, 2))); for (const c of sc) { const [k, v] = c.split(';')[0].split(/=(.*)/s); kv[k] = v; } jar = Object.entries(kv).map(([k, v]) => `${k}=${v}`).join('; '); csrf = decodeURIComponent(kv.nx_csrf || ''); }
  let j = null; try { j = await r.json(); } catch { /* empty */ } return { s: r.status, j };
};
const email = `rdy${Date.now()}@example.com`;
await call('POST', '/v1/auth/signup', { fullName: 'Ready Tester', email, password: 'Str0ng-Passw0rd!x', businessName: 'Ready Co', legalName: 'Ready Co', phone: '9876543210' });
await call('POST', '/v1/seller/agreement', {});
const sellerId = (await db.query('SELECT s.id FROM sellers s JOIN seller_memberships m ON m.seller_id = s.id JOIN users u ON u.id = m.user_id WHERE u.email = $1', [email])).rows[0].id;
const wh = await call('POST', '/v1/warehouses', { name: 'Main', warehouseType: 'primary', contactName: 'Owner', phone: '9876543210', addressLine1: '5 Test Lane', city: 'Mumbai', state: 'Maharashtra', pincode: '400001' });
await db.query(`INSERT INTO seller_courier_access (seller_id, service_id, account_mode, state, cod_enabled, auto_assign_eligible) VALUES ($1,$2,'platform','enabled',true,true)`, [sellerId, svc.id]);
const card = (await db.query(`INSERT INTO rate_cards (seller_id, name, state) VALUES ($1,'Ready test','active') RETURNING id`, [sellerId])).rows[0].id;
await db.query(`INSERT INTO rate_card_rates (rate_card_id, service_id, zone_code, min_weight_g, base_weight_g, base_price_paise, additional_weight_g, additional_price_paise) VALUES ($1,$2,'national',0,500,5000,500,0)`, [card, svc.id]);
await db.query("INSERT INTO wallet_entries (seller_id,entry_type,amount_paise,reference_type,reference_id,idempotency_key,description) VALUES ($1,'credit',5000000,'wallet_recharge','seed',$2,'seed')", [sellerId, 'rdy-seed-' + Date.now()]);
const wallet = async () => Number((await db.query(`SELECT COALESCE(SUM(CASE WHEN entry_type IN ('credit','release') THEN amount_paise WHEN entry_type IN ('debit','hold') THEN -amount_paise ELSE amount_paise END),0)::bigint AS b FROM wallet_entries WHERE seller_id = $1`, [sellerId])).rows[0].b);

const stamp = Date.now().toString().slice(-6); let seq = 0;
const idem = () => ({ 'Idempotency-Key': `rdy-${Date.now()}-${Math.random().toString(36).slice(2, 12)}` });
const newOrder = async (over = {}) => {
  const i = ++seq; // every order gets its OWN customer: customers are shared between orders with the same phone, so editing one would leak into the others
  const r = await call('POST', '/v1/orders', { warehouseId: wh.j.id, orderNumber: `RD${stamp}${i}`, paymentMode: 'prepaid', customer: { fullName: 'Buyer Name' + i, phone: `98${String(10000000 + i * 7)}`, addressLine1: '12 Road', city: 'Mumbai', state: 'Maharashtra', pincode: '400002' }, items: [{ sku: 'S', name: 'Item', quantity: 1, unitPricePaise: 50000, weightG: 300 }], package: { weightG: 300, lengthMm: 100, widthMm: 100, heightMm: 100 }, ...over });
  return r.j.id;
};
const orderRow = async (id) => (await db.query('SELECT state::text AS state FROM orders WHERE id = $1', [id])).rows[0];
const shipCount = async (id) => (await db.query('SELECT count(*)::int AS n FROM shipments WHERE order_id = $1', [id])).rows[0].n;

// each way an order can be incomplete: how to break it in the database, and the issue code the seller must be told
// (A malformed phone or pincode, or a COD order without an amount, cannot be stored at all: table constraints customers_phone_check, customers_pincode_check
// and orders_check refuse them, so the gate never meets them from the database; the unit tests cover those rules.)
const BREAKS = [
  ['weight is zero', "UPDATE orders SET total_weight_g = 0 WHERE id = $1", 'WEIGHT_MISSING'],
  // (a partly filled set of dimensions cannot exist: the database constraint orders_package_dimensions_complete requires all three or none)
  ['all dimensions missing', "UPDATE orders SET package_length_mm = NULL, package_width_mm = NULL, package_height_mm = NULL WHERE id = $1", 'DIMENSION_MISSING'],
  ['customer address too short', "UPDATE customers SET address_line_1 = 'x' WHERE id = (SELECT customer_id FROM orders WHERE id = $1)", 'CUSTOMER_ADDRESS_MISSING'],
  ['customer city missing', "UPDATE customers SET city = '' WHERE id = (SELECT customer_id FROM orders WHERE id = $1)", 'CUSTOMER_CITY_MISSING'],
];

const walletBefore = await wallet();
for (const [label, sql, code] of BREAKS) {
  const id = await newOrder();
  try { await db.query(sql, [id]); } catch (e) { T(`setup (${label})`, false, e.message); continue; }
  const before = calls();
  const state0 = (await orderRow(id)).state;

  const book = await call('POST', '/v1/shipments/book', { orderId: id, providerCode: svc.pcode, serviceCode: svc.code }, idem());
  T(`[${label}] manual book is refused with ORDER_NOT_READY and the field-level issue ${code}`, book.s === 422 && book.j?.code === 'ORDER_NOT_READY' && Array.isArray(book.j?.issues) && book.j.issues.some((x) => x.code === code) && !book.j.issues.some((x) => x.code === 'ORDER_INCOMPLETE'), `${book.s} ${book.j?.code} ${JSON.stringify((book.j?.issues || []).map((x) => x.code))}`);
  T(`[${label}] the refusal text is plain (what is wrong and where to fix it)`, /cannot be booked yet/.test(book.j?.error || '') && /Track > Needs fixing/.test(book.j?.error || ''), (book.j?.error || '').slice(0, 120));

  const auto = await call('POST', '/v1/shipments/auto-assign', { orderIds: [id] });
  const r0 = auto.j?.results?.[0];
  T(`[${label}] synchronous auto-assign refuses it and reports why`, auto.s === 200 && r0 && r0.ok === false && /cannot be booked yet/.test(r0.error || ''), JSON.stringify(r0 || auto.j).slice(0, 140));

  const q = await call('POST', '/v1/shipments/assign-batch', { orderIds: [id] });
  T(`[${label}] the assign queue does not accept it (notReady = 1, queued = 0)`, q.s === 200 && q.j?.id === null && q.j?.queued === 0 && q.j?.notReady === 1, JSON.stringify(q.j));

  T(`[${label}] NO call reached the courier network`, calls() === before, `${calls() - before} calls`);
  T(`[${label}] the order did not change state and has no shipment`, (await orderRow(id)).state === state0 && (await shipCount(id)) === 0, JSON.stringify(await orderRow(id)));
}
T('The seller wallet did not move during all of that', (await wallet()) === walletBefore, `${walletBefore} -> ${await wallet()}`);

// the same orders, once corrected, book normally (the gate blocks only what is genuinely incomplete)
const fixed = await newOrder();
await db.query("UPDATE orders SET total_weight_g = 0 WHERE id = $1", [fixed]);
const markBad = await call('PATCH', `/v1/orders/${fixed}/state`, { state: 'ready_to_ship' });
T('An incomplete order cannot be marked ready to ship (422 ORDER_NOT_READY) and stays "new"', markBad.s === 422 && markBad.j?.code === 'ORDER_NOT_READY' && (await orderRow(fixed)).state === 'new', `${markBad.s} ${markBad.j?.code}`);
let b = await call('POST', '/v1/shipments/book', { orderId: fixed, providerCode: svc.pcode, serviceCode: svc.code }, idem());
T('Before the fix the order is refused', b.s === 422 && b.j?.code === 'ORDER_NOT_READY');
await db.query("UPDATE orders SET total_weight_g = 300 WHERE id = $1", [fixed]);
T('Once corrected the order can be marked ready', (await call('PATCH', `/v1/orders/${fixed}/state`, { state: 'ready_to_ship' })).s === 200);
b = await call('POST', '/v1/shipments/book', { orderId: fixed, providerCode: svc.pcode, serviceCode: svc.code }, idem());
T('After the fix the SAME order books (AWB returned, one shipment)', b.s === 201 || b.s === 200, `${b.s} ${JSON.stringify(b.j).slice(0, 120)}`);
T('...exactly one booking reached the courier network and the wallet was charged once', (await shipCount(fixed)) === 1 && fake.stats.shipmentsBooked === 1 && (await wallet()) < walletBefore, JSON.stringify({ booked: fake.stats.shipmentsBooked }));

// the false-"booked" defect: a seller must not be able to declare an order booked or returned (no courier, no AWB, no debit)
const ghost = await newOrder(); await call('PATCH', `/v1/orders/${ghost}/state`, { state: 'ready_to_ship' });
const w0 = await wallet();
const setBooked = await call('PATCH', `/v1/orders/${ghost}/state`, { state: 'booked' });
T('A seller CANNOT set an order to "booked" by hand (409 ORDER_STATE_SYSTEM_ONLY); no shipment, no debit', setBooked.s === 409 && setBooked.j?.code === 'ORDER_STATE_SYSTEM_ONLY' && (await orderRow(ghost)).state === 'ready_to_ship' && (await shipCount(ghost)) === 0 && (await wallet()) === w0, `${setBooked.s} ${setBooked.j?.code}`);
T('...nor to "returned"', (await call('PATCH', `/v1/orders/${ghost}/state`, { state: 'returned' })).s === 409);
T('...but the order is still there, ready, and can be cancelled by the seller', (await call('PATCH', `/v1/orders/${ghost}/state`, { state: 'cancelled' })).s === 200 && (await orderRow(ghost)).state === 'cancelled');
const bookedOrder = fixed; // it has a real shipment now
const cancelWithShipment = await call('PATCH', `/v1/orders/${bookedOrder}/state`, { state: 'cancelled' });
T('An order that has a shipment cannot be cancelled by hand: cancel the shipment instead', cancelWithShipment.s === 409 && (await orderRow(bookedOrder)).state === 'booked', `${cancelWithShipment.s} ${cancelWithShipment.j?.code}`);

// a mix through the queue: only the complete orders are queued, the incomplete ones come back as notReady
const mixGood = [await newOrder(), await newOrder()]; const mixBad = await newOrder(); await db.query("UPDATE orders SET package_length_mm = NULL, package_width_mm = NULL, package_height_mm = NULL WHERE id = $1", [mixBad]);
const mq = await call('POST', '/v1/shipments/assign-batch', { orderIds: [...mixGood, mixBad] });
T('A mixed batch queues only the 2 complete orders and reports 1 not ready', mq.s === 202 && mq.j?.queued === 2 && mq.j?.notReady === 1 && mq.j?.notReadyIds?.includes(mixBad), JSON.stringify(mq.j));
let done = null; for (let i = 0; i < 80; i++) { done = (await call('GET', `/v1/shipments/assign-batch/${mq.j.id}`)).j; if (done?.finished_at) break; await sleep(250); }
T('...and the 2 complete ones book', done?.assigned === 2 && done?.failed === 0, JSON.stringify(done && { assigned: done.assigned, failed: done.failed }));
T('...the incomplete one is untouched', (await shipCount(mixBad)) === 0 && (await orderRow(mixBad)).state === 'new');

// another seller cannot probe someone else's order through the gate (tenant isolation): a foreign id is "not found", never a readiness answer
const other = await (async () => { let j2 = ''; let c2 = ''; const c = async (m, p, bd, ex = {}) => { const r = await fetch(API + p, { method: m, headers: { 'content-type': 'application/json', ...(j2 ? { cookie: j2 } : {}), ...(m !== 'GET' && c2 ? { 'x-csrf-token': c2 } : {}), ...ex }, body: bd ? JSON.stringify(bd) : undefined }); const sc = r.headers.getSetCookie?.() ?? []; if (sc.length) { const kv = Object.fromEntries(j2.split('; ').filter(Boolean).map((x) => x.split(/=(.*)/s).slice(0, 2))); for (const k of sc) { const [a, v] = k.split(';')[0].split(/=(.*)/s); kv[a] = v; } j2 = Object.entries(kv).map(([a, v]) => `${a}=${v}`).join('; '); c2 = decodeURIComponent(kv.nx_csrf || ''); } let jj = null; try { jj = await r.json(); } catch { /* empty */ } return { s: r.status, j: jj }; }; await c('POST', '/v1/auth/signup', { fullName: 'Other Seller', email: `rdyo${Date.now()}@example.com`, password: 'Str0ng-Passw0rd!x', businessName: 'Other Co', legalName: 'Other Co', phone: '9876543299' }); await c('POST', '/v1/seller/agreement', {}); return c; })();
const foreign = await other('POST', '/v1/shipments/book', { orderId: mixBad, providerCode: svc.pcode, serviceCode: svc.code }, idem());
T('Another seller booking this seller\'s incomplete order gets "not found", never its readiness details', foreign.s === 404 && !JSON.stringify(foreign.j).includes('ORDER_NOT_READY') && !JSON.stringify(foreign.j).includes('weight'), `${foreign.s} ${JSON.stringify(foreign.j).slice(0, 100)}`);

console.log(out.join('\n'));
console.log(`\n${out.filter((x) => x.startsWith('PASS')).length}/${out.length} passed`);
await db.end(); fake.close(); process.exit(0);
