// End-to-end speed and correctness of the background queues (assign couriers, cancel) against a FAKE aggregator with a fixed delay per call.
// Needs: Postgres on :5544 (throwaway), the API on :4011 started with LORRIGO_API_KEY=test LORRIGO_BASE_URL=http://127.0.0.1:4555 (development).
// Proves: many orders are booked / cancelled side by side (time), every booking and refund happens exactly once (money), the aggregator is called
// as few times as possible, an empty aggregator balance ends a batch at once, an order created by an earlier failed attempt is reused, and a burst
// of HTTP 429 slows things down without losing or duplicating anything. Run: node tests/e2e/speed.mjs
import { createRequire } from 'node:module';
import { startFakeAggregator } from '../support/fakeAggregator.mjs';
const require = createRequire(new URL('../../package.json', import.meta.url));
const pg = require('pg');
const API = 'http://127.0.0.1:4011';
const db = new pg.Client({ connectionString: 'postgresql://nx@127.0.0.1:5544/nxd' }); await db.connect();
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

// ---------------- 4. the aggregator has no balance: the whole batch ends at once, clearly
fake.mode.nobalance = true; const shipsBefore = fake.stats.calls['POST /shipments'] || 0;
orders = await makeOrders(20);
r = await runBatch('/v1/shipments/assign-batch', { orderIds: orders }, '/v1/shipments/assign-batch');
const refused = (fake.stats.calls['POST /shipments'] || 0) - shipsBefore;
T('Empty aggregator balance: the batch of 20 ends within 6 s, none booked, all say booking is paused', r.batch && r.ms < 6000 && r.batch.assigned === 0 && r.batch.failed === 20 && r.batch.results.every((x) => /Courier booking is paused/.test(x.error || '')), `${r.ms} ms ${JSON.stringify(r.batch && r.batch.results?.[0])}`);
T('...and it stopped after the first refusals (no retry storm: at most one refusal per order)', refused <= 20, `${refused} booking attempts for 20 orders`);
T('The seller was charged nothing', (await wallet()) === START - Number((await db.query(`SELECT COALESCE(sum(shipping_charge_paise),0)::bigint AS c FROM shipments WHERE seller_id = $1 AND state <> 'cancelled'`, [sellerId])).rows[0].c));

// ---------------- 5. "Order Id already exists": the earlier failed attempt left the order on the aggregator; the retry must reuse it
fake.mode.nobalance = false; const createdBefore = fake.stats.ordersCreated;
r = await runBatch('/v1/shipments/assign-batch', { orderIds: orders }, '/v1/shipments/assign-batch');
T('After the balance is back, the same 20 orders are booked by re-pushing them', r.batch && r.batch.assigned === 20 && r.batch.failed === 0, JSON.stringify(r.batch && { assigned: r.batch.assigned, failed: r.batch.failed, first: r.batch.results?.find((x) => !x.ok) }));
T('...reusing the orders already on the aggregator (no duplicate created, the "already exists" answer was handled)', fake.stats.ordersCreated === createdBefore && fake.stats.duplicateOrderRefusals >= 1, JSON.stringify([fake.stats.ordersCreated - createdBefore, fake.stats.duplicateOrderRefusals]));

// ---------------- 6. a burst of HTTP 429: slower, never lost or duplicated
fake.mode.maxInflight = 5; fake.stats.tooMany = 0;
orders = await makeOrders(24);
r = await runBatch('/v1/shipments/assign-batch', { orderIds: orders }, '/v1/shipments/assign-batch');
T('With the aggregator answering 429 under load, all 24 are still booked', r.batch && r.batch.assigned === 24 && r.batch.failed === 0, JSON.stringify(r.batch && { assigned: r.batch.assigned, failed: r.batch.failed, err: r.batch.results?.find((x) => !x.ok)?.error }) + ` in ${r.ms} ms`);
T('...the limiter saw and slowed down for the 429s', fake.stats.tooMany > 0, `${fake.stats.tooMany} calls answered 429`);
const dup = (await db.query(`SELECT count(*)::int AS n FROM (SELECT order_id FROM shipments WHERE seller_id = $1 GROUP BY order_id HAVING count(*) > 1) x`, [sellerId])).rows[0].n;
T('No order has two shipments after all of it', dup === 0);

console.log(out.join('\n'));
console.log(`\n${out.filter((x) => x.startsWith('PASS')).length}/${out.length} passed`);
fake.close(); await db.end();
process.exit(out.some((x) => x.startsWith('FAIL')) ? 1 : 0);
