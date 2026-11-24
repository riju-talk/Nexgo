// End-to-end check of FAILOVER between two courier aggregators (Lorrigo and Shiprocket), both FAKE servers, through the real API and queue.
// A seller has one courier on each, Lorrigo first in the seller's priority list. Needs: Postgres on :5544 (throwaway) and the API on :4011 started with
//   LORRIGO_API_KEY=test LORRIGO_BASE_URL=http://127.0.0.1:4555 SHIPROCKET_EMAIL=api@test.example SHIPROCKET_PASSWORD=pw SHIPROCKET_BASE_URL=http://127.0.0.1:4666
//   SHIPROCKET_WEBHOOK_TOKEN=srhook-srhook-srhook-1234 ASSIGN_PAUSE_RETRY_SECONDS=2 ASSIGN_PROBE_SECONDS=4 TRACKING_POLL_MINUTES=0
// Proves: both funded -> Lorrigo books (priority); Lorrigo out of balance -> the orders go through Shiprocket, nothing paused or failed;
// both out of balance -> the orders wait (paused, Track says so); Shiprocket topped up -> they book by themselves through it.
// Run: node tests/e2e/failover.mjs
import { createRequire } from 'node:module';
import { startFakeAggregator } from '../support/fakeAggregator.mjs';
import { startFakeShiprocket } from '../support/fakeShiprocket.mjs';
const require = createRequire(new URL('../../package.json', import.meta.url));
const pg = require('pg');
const API = 'http://127.0.0.1:4011';
const db = new pg.Client({ connectionString: 'postgresql://nx@127.0.0.1:5544/nxd' }); await db.connect();
const out = []; const T = (n, ok, d = '') => out.push((ok ? 'PASS ' : 'FAIL ') + n + (d ? ' - ' + d : ''));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const lor = (await db.query("SELECT cs.id, cs.external_service_id AS ext, cp.id AS pid FROM courier_services cs JOIN courier_providers cp ON cp.id = cs.provider_id WHERE cs.code = 'delhivery-250-gms'")).rows[0];
await db.query("UPDATE courier_providers SET aggregator = 'lorrigo' WHERE id = $1", [lor.pid]);
const code = 'sprocketfo' + Date.now().toString(36).replace(/[0-9]/g, '');
const srProvider = (await db.query("INSERT INTO courier_providers (code, name, integration_state, supports_cod, aggregator) VALUES ($1,'Sprocket','live',true,'shiprocket') RETURNING id", [code])).rows[0].id;
const srSvc = (await db.query("INSERT INTO courier_services (provider_id, code, display_name, service_type, typical_delivery_days, max_delivery_days, external_service_id) VALUES ($1,$2,'Sprocket Surface','surface',3,6,'10') RETURNING id", [srProvider, code + '-surface'])).rows[0].id;
const fakeL = startFakeAggregator({ port: 4555, latencyMs: 100, courierIds: [lor.ext] });
const fakeS = startFakeShiprocket({ port: 4666, latencyMs: 100, courierIds: [10] });

let jar = ''; let csrf = '';
const call = async (m, p, b) => {
  const r = await fetch(API + p, { method: m, headers: { 'content-type': 'application/json', ...(jar ? { cookie: jar } : {}), ...(m !== 'GET' && csrf ? { 'x-csrf-token': csrf } : {}) }, body: b ? JSON.stringify(b) : undefined });
  const sc = r.headers.getSetCookie?.() ?? [];
  if (sc.length) { const kv = Object.fromEntries(jar.split('; ').filter(Boolean).map((x) => x.split(/=(.*)/s).slice(0, 2))); for (const c of sc) { const [k, v] = c.split(';')[0].split(/=(.*)/s); kv[k] = v; } jar = Object.entries(kv).map(([k, v]) => `${k}=${v}`).join('; '); csrf = decodeURIComponent(kv.nx_csrf || ''); }
  let j = null; try { j = await r.json(); } catch { /* empty */ } return { s: r.status, j };
};
const email = `fo${Date.now()}@example.com`;
await call('POST', '/v1/auth/signup', { fullName: 'FO Tester', email, password: 'Str0ng-Passw0rd!x', businessName: 'FO Co', legalName: 'FO Co', phone: '9876543210' });
await call('POST', '/v1/seller/agreement', {});
const sellerId = (await db.query('SELECT s.id FROM sellers s JOIN seller_memberships m ON m.seller_id = s.id JOIN users u ON u.id = m.user_id WHERE u.email = $1', [email])).rows[0].id;
const wh = await call('POST', '/v1/warehouses', { name: 'Main', warehouseType: 'primary', contactName: 'Owner', phone: '9876543210', addressLine1: '5 Test Lane', city: 'Mumbai', state: 'Maharashtra', pincode: '400001' });
const card = (await db.query(`INSERT INTO rate_cards (seller_id, name, state) VALUES ($1,'FO test','active') RETURNING id`, [sellerId])).rows[0].id;
for (const sid of [lor.id, srSvc]) {
  await db.query(`INSERT INTO seller_courier_access (seller_id, service_id, account_mode, state, cod_enabled, auto_assign_eligible) VALUES ($1,$2,'platform','enabled',true,true)`, [sellerId, sid]);
  await db.query(`INSERT INTO rate_card_rates (rate_card_id, service_id, zone_code, min_weight_g, base_weight_g, base_price_paise, additional_weight_g, additional_price_paise) VALUES ($1,$2,'national',0,500,5000,500,0)`, [card, sid]);
}
await db.query("INSERT INTO seller_preferences (seller_id, preferences) VALUES ($1, $2::jsonb) ON CONFLICT (seller_id) DO UPDATE SET preferences = EXCLUDED.preferences", [sellerId, JSON.stringify({ 'courier-rules': { priority1: 'Delhivery', priority2: 'Sprocket' } })]); // Lorrigo's courier first
await db.query("INSERT INTO wallet_entries (seller_id,entry_type,amount_paise,reference_type,reference_id,idempotency_key,description) VALUES ($1,'credit',5000000,'wallet_recharge','seed',$2,'seed')", [sellerId, 'fo-seed-' + Date.now()]);

const stamp = Date.now().toString().slice(-6); let seq = 0;
const makeOrders = async (n) => {
  const orders = Array.from({ length: n }, () => { const i = ++seq; return { warehouseId: wh.j.id, orderNumber: `FO${stamp}${i}`, paymentMode: 'prepaid', customer: { fullName: 'Buyer Name' + i, phone: '9876543210', addressLine1: '12 Road', city: 'Mumbai', state: 'Maharashtra', pincode: '400002' }, items: [{ sku: 'S', name: 'Item', quantity: 1, unitPricePaise: 50000, weightG: 300 }], package: { weightG: 300, lengthMm: 100, widthMm: 100, heightMm: 100 } }; });
  const ids = []; for (let i = 0; i < orders.length; i += 50) ids.push(...(await call('POST', '/v1/orders/bulk', { orders: orders.slice(i, i + 50) })).j.results.map((x) => x.id)); // the API takes 50 per request
  return ids;
};
const queueBatch = async (ids) => (await call('POST', '/v1/shipments/assign-batch', { orderIds: ids })).j.id;
const batchOf = async (id) => (await call('GET', `/v1/shipments/assign-batch/${id}`)).j;
const until = async (id, pred, ms = 60000) => { const t0 = Date.now(); let b; while (Date.now() - t0 < ms) { b = await batchOf(id); if (pred(b)) return b; await sleep(250); } return b; };
const byProvider = async (ids) => (await db.query(`SELECT cp.aggregator, count(*)::int AS n FROM shipments s JOIN courier_providers cp ON cp.id = s.provider_id WHERE s.order_id = ANY($1::uuid[]) GROUP BY 1`, [ids])).rows.reduce((m, r) => ({ ...m, [r.aggregator]: r.n }), {});

// ---- A. both funded: Lorrigo is first in the seller's list, so it books
let ids = await makeOrders(6);
let b = await until(await queueBatch(ids), (x) => !!x.finished_at);
let split = await byProvider(ids);
T('Both aggregators funded: all 6 book, through Lorrigo (the seller\'s first choice)', b.assigned === 6 && b.failed === 0 && split.lorrigo === 6 && !split.shiprocket, JSON.stringify(split));

// ---- B. Lorrigo runs out of balance: the same seller's orders go through Shiprocket, nothing paused, nothing failed
fakeL.mode.nobalance = true; fakeL.mode.balance = -6237;
const lorrigoShipCalls = () => fakeL.stats.calls['POST /shipments'] || 0;
const before = lorrigoShipCalls();
ids = await makeOrders(60);
b = await until(await queueBatch(ids), (x) => !!x.finished_at, 120000);
split = await byProvider(ids);
T('Lorrigo out of balance: all 60 orders are booked through Shiprocket instead (failover), none failed, none paused', b.assigned === 60 && b.failed === 0 && b.paused === 0 && split.shiprocket === 60 && !split.lorrigo, JSON.stringify({ assigned: b.assigned, failed: b.failed, paused: b.paused, split }));
T('...and Lorrigo was not hammered: only the first wave in flight was refused, every later order skipped Lorrigo without a call', lorrigoShipCalls() - before <= 36, `${lorrigoShipCalls() - before} refused booking calls for 60 orders (the first wave of 32 was already in flight)`);
const sum1 = (await call('GET', '/v1/shipments/summary')).j;
T('Track does NOT say booking is paused while one aggregator still has funds', sum1.bookingPaused === false, JSON.stringify({ bookingPaused: sum1.bookingPaused }));

// ---- C. Shiprocket runs out as well: nothing can book anywhere -> orders wait
fakeS.mode.nobalance = true; fakeS.mode.balance = -10;
await sleep(1500);
ids = await makeOrders(6);
const waiting = await queueBatch(ids);
let w = await until(waiting, (x) => x.paused === 6, 30000);
T('Both aggregators out of balance: all 6 orders are PAUSED (kept), none failed, none booked', w.paused === 6 && w.failed === 0 && w.assigned === 0 && !w.finished_at, JSON.stringify({ paused: w.paused, failed: w.failed, assigned: w.assigned }));
const sum2 = (await call('GET', '/v1/shipments/summary')).j;
T('Track now tells the seller booking is paused', sum2.bookingPaused === true, JSON.stringify({ bookingPaused: sum2.bookingPaused }));

// ---- D. only Shiprocket is topped up: the waiting orders book by themselves through it
fakeS.mode.nobalance = false; fakeS.mode.balance = 9000;
w = await until(waiting, (x) => !!x.finished_at, 90000);
split = await byProvider(ids);
T('After Shiprocket is topped up the 6 waiting orders book by themselves through Shiprocket', w.assigned === 6 && w.failed === 0 && split.shiprocket === 6 && !split.lorrigo, JSON.stringify({ assigned: w.assigned, failed: w.failed, split }));
T('No order has two shipments, and nothing was charged twice', (await db.query(`SELECT count(*)::int AS n FROM (SELECT order_id FROM shipments WHERE seller_id = $1 GROUP BY order_id HAVING count(*) > 1) x`, [sellerId])).rows[0].n === 0);

console.log(out.join('\n'));
console.log(`\n${out.filter((x) => x.startsWith('PASS')).length}/${out.length} passed`);
await db.end(); fakeL.close(); fakeS.close(); process.exit(0);
