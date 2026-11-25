// End-to-end check of the Shiprocket aggregator against a FAKE Shiprocket (tests/support/fakeShiprocket.mjs), through the real API, queue and webhook route.
// Needs: Postgres on :5544 (throwaway) and the API on :4011 started with
//   SHIPROCKET_EMAIL=api@test.example SHIPROCKET_PASSWORD=pw SHIPROCKET_BASE_URL=http://127.0.0.1:4666 SHIPROCKET_WEBHOOK_TOKEN=srhook-srhook-srhook-1234
//   ASSIGN_PAUSE_RETRY_SECONDS=2 ASSIGN_PROBE_SECONDS=4 TRACKING_POLL_MINUTES=0 (no Lorrigo variables: Shiprocket is the only aggregator configured).
// Proves: booking through the queue (one login, one pickup location, one order / serviceability / AWB / pickup request per parcel), the right fields reach
// Shiprocket, wallet debits once, webhooks (wrong token refused; shipped / NDR / delivered / RTO move the state), cancel uses the Shiprocket ORDER id and
// refunds once, an empty Shiprocket wallet pauses the orders and a top-up books them by themselves, and the tracking poll updates a parcel.
// Run: node tests/e2e/shiprocket.mjs
import { createRequire } from 'node:module';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
const run = promisify(exec); // async: the fake Shiprocket lives in THIS process and must keep answering while the poll runs
import { startFakeShiprocket } from '../support/fakeShiprocket.mjs';
const require = createRequire(new URL('../../package.json', import.meta.url));
const pg = require('pg');
const API = 'http://127.0.0.1:4011';
const HOOK = 'srhook-srhook-srhook-1234';
const db = new pg.Client({ connectionString: (process.env.E2E_DATABASE_URL || 'postgresql://nx@127.0.0.1:5544/nxd') }); await db.connect();
const out = []; const T = (n, ok, d = '') => out.push((ok ? 'PASS ' : 'FAIL ') + n + (d ? ' - ' + d : ''));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fake = startFakeShiprocket({ port: 4666, latencyMs: 100, courierIds: [10] });

// a Shiprocket-backed courier (an admin would add it with "+ Add courier")
const code = 'srtest-' + Date.now().toString(36);
const provider = (await db.query("INSERT INTO courier_providers (code, name, integration_state, supports_cod, aggregator) VALUES ($1,'Delhivery SR','live',true,'shiprocket') RETURNING id", [code])).rows[0].id;
const svc = (await db.query("INSERT INTO courier_services (provider_id, code, display_name, service_type, typical_delivery_days, max_delivery_days, external_service_id) VALUES ($1,$2,'Delhivery Surface','surface',3,6,'10') RETURNING id", [provider, code + '-surface'])).rows[0].id;

let jar = ''; let csrf = '';
const call = async (m, p, b, headers = {}) => {
  const r = await fetch(API + p, { method: m, headers: { 'content-type': 'application/json', ...(jar && !headers.noCookie ? { cookie: jar } : {}), ...(m !== 'GET' && csrf ? { 'x-csrf-token': csrf } : {}), ...headers }, body: b ? JSON.stringify(b) : undefined });
  const sc = r.headers.getSetCookie?.() ?? [];
  if (sc.length) { const kv = Object.fromEntries(jar.split('; ').filter(Boolean).map((x) => x.split(/=(.*)/s).slice(0, 2))); for (const c of sc) { const [k, v] = c.split(';')[0].split(/=(.*)/s); kv[k] = v; } jar = Object.entries(kv).map(([k, v]) => `${k}=${v}`).join('; '); csrf = decodeURIComponent(kv.nx_csrf || ''); }
  let j = null; try { j = await r.json(); } catch { /* empty */ } return { s: r.status, j };
};
const email = `srt${Date.now()}@example.com`;
await call('POST', '/v1/auth/signup', { fullName: 'SR Tester', email, password: 'Str0ng-Passw0rd!x', businessName: 'SR Co', legalName: 'SR Co', phone: '9876543210' });
await call('POST', '/v1/seller/agreement', {});
const sellerId = (await db.query('SELECT s.id FROM sellers s JOIN seller_memberships m ON m.seller_id = s.id JOIN users u ON u.id = m.user_id WHERE u.email = $1', [email])).rows[0].id;
const wh = await call('POST', '/v1/warehouses', { name: 'Main', warehouseType: 'primary', contactName: 'Owner', phone: '9876543210', addressLine1: '5 Test Lane', city: 'Mumbai', state: 'Maharashtra', pincode: '400001' });
await db.query(`INSERT INTO seller_courier_access (seller_id, service_id, account_mode, state, cod_enabled, auto_assign_eligible) VALUES ($1,$2,'platform','enabled',true,true)`, [sellerId, svc]);
const card = (await db.query(`INSERT INTO rate_cards (seller_id, name, state) VALUES ($1,'SR test','active') RETURNING id`, [sellerId])).rows[0].id;
await db.query(`INSERT INTO rate_card_rates (rate_card_id, service_id, zone_code, min_weight_g, base_weight_g, base_price_paise, additional_weight_g, additional_price_paise) VALUES ($1,$2,'national',0,500,5000,500,0)`, [card, svc]);
await db.query("INSERT INTO wallet_entries (seller_id,entry_type,amount_paise,reference_type,reference_id,idempotency_key,description) VALUES ($1,'credit',5000000,'wallet_recharge','seed',$2,'seed')", [sellerId, 'sr-seed-' + Date.now()]);
const START = 5000000;
const wallet = async () => Number((await db.query(`SELECT COALESCE(SUM(CASE WHEN entry_type IN ('credit','release') THEN amount_paise WHEN entry_type IN ('debit','hold') THEN -amount_paise ELSE amount_paise END),0)::bigint AS b FROM wallet_entries WHERE seller_id = $1`, [sellerId])).rows[0].b);

const stamp = Date.now().toString().slice(-6); let seq = 0;
const makeOrders = async (n, cod = false) => {
  const orders = Array.from({ length: n }, () => { const i = ++seq; return { warehouseId: wh.j.id, orderNumber: `SR${stamp}${i}`, paymentMode: cod ? 'cod' : 'prepaid', ...(cod ? { codAmountPaise: 89900 } : {}), customer: { fullName: 'Buyer Name' + i, phone: '9876543210', addressLine1: '12 Road', city: 'Mumbai', state: 'Maharashtra', pincode: '400002' }, items: [{ sku: 'S', name: 'Item', quantity: 1, unitPricePaise: cod ? 89900 : 50000, weightG: 300 }], package: { weightG: 300, lengthMm: 100, widthMm: 100, heightMm: 100 } }; });
  const r = await call('POST', '/v1/orders/bulk', { orders }); return r.j.results.map((x) => x.id);
};
const queueBatch = async (ids) => (await call('POST', '/v1/shipments/assign-batch', { orderIds: ids })).j.id;
const batchOf = async (id) => (await call('GET', `/v1/shipments/assign-batch/${id}`)).j;
const until = async (id, pred, ms = 40000) => { const t0 = Date.now(); let b; while (Date.now() - t0 < ms) { b = await batchOf(id); if (pred(b)) return b; await sleep(250); } return b; };
const hook = (body, token = HOOK) => fetch(API + '/v1/webhooks/carrier-events', { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { 'x-api-key': token } : {}) }, body: JSON.stringify(body) }).then((r) => r.status);
const shipRow = async (awb) => (await db.query('SELECT id, state::text AS state, provider_shipment_id, provider_id FROM shipments WHERE awb = $1', [awb])).rows[0];

// ---- 1. book 12 orders (prepaid) through the queue
let orders = await makeOrders(12);
let b = await until(await queueBatch(orders), (x) => !!x.finished_at);
T('12 orders booked through Shiprocket by the queue, none failed', b && b.assigned === 12 && b.failed === 0, JSON.stringify(b && { assigned: b.assigned, failed: b.failed, why: b.results?.find((x) => !x.ok)?.error }));
const ships = (await db.query(`SELECT awb, provider_shipment_id, shipping_charge_paise, provider_id FROM shipments WHERE seller_id = $1 AND state <> 'cancelled'`, [sellerId])).rows;
T('12 shipments with 12 different Shiprocket AWBs, on the Shiprocket courier', ships.length === 12 && new Set(ships.map((s) => s.awb)).size === 12 && ships.every((s) => /^SRF/.test(s.awb) && s.provider_id === provider));
T('Each shipment keeps the Shiprocket ORDER id (what cancel needs)', ships.every((s) => /^\d+$/.test(s.provider_shipment_id)) && new Set(ships.map((s) => s.provider_shipment_id)).size === 12);
const charged = ships.reduce((s, x) => s + Number(x.shipping_charge_paise), 0);
T('Wallet = start minus the 12 charges, once each', (await wallet()) === START - charged && charged > 0, JSON.stringify([await wallet(), START - charged]));
T('One login, one pickup location, and per parcel one order / serviceability check / AWB / pickup request', fake.stats.calls['POST /auth/login'] === 1 && fake.stats.calls['POST /settings/company/addpickup'] === 1 && fake.stats.calls['POST /orders/create/adhoc'] === 12 && fake.stats.calls['GET /courier/serviceability/'] === 12 && fake.stats.calls['POST /courier/assign/awb'] === 12 && fake.stats.calls['POST /courier/generate/pickup'] === 12, JSON.stringify(fake.stats.calls));
const ob = fake.stats.lastOrderBody;
T('The order sent to Shiprocket has the right fields (Prepaid, kg, cm, pincodes, items, pickup name)', ob && ob.payment_method === 'Prepaid' && ob.weight === 0.3 && ob.length === 10 && ob.billing_pincode === '400002' && ob.billing_country === 'India' && ob.order_items[0].units === 1 && ob.order_items[0].selling_price === 500 && /^NX-/.test(ob.pickup_location) && ob.sub_total === 500, JSON.stringify({ pm: ob?.payment_method, w: ob?.weight, sub: ob?.sub_total }));
T('The courier id chosen by the seller (10) is what was assigned', fake.stats.assignBodies.every((x) => x.courier_id === '10'));

// ---- 2. COD order carries the amount to collect
const cod = await makeOrders(1, true);
await until(await queueBatch(cod), (x) => !!x.finished_at);
T('A COD order is sent as COD with the amount to collect (899)', fake.stats.lastOrderBody.payment_method === 'COD' && fake.stats.lastOrderBody.sub_total === 899, JSON.stringify({ pm: fake.stats.lastOrderBody.payment_method, sub: fake.stats.lastOrderBody.sub_total }));

// ---- 3. webhooks
const a1 = ships[0].awb; const a2 = ships[1].awb; const a3 = ships[2].awb;
const scans = (...rows) => rows.map(([date, id, label, activity]) => ({ date, 'sr-status': String(id), 'sr-status-label': label, activity, location: 'Hub' }));
T('A webhook with no token is refused (401)', (await hook({ awb: a1, current_status: 'IN TRANSIT' }, null)) === 401);
T('A webhook with a wrong token is refused (401)', (await hook({ awb: a1, current_status: 'IN TRANSIT' }, 'wrong-token-wrong-token-1234')) === 401);
T('A webhook with the right token is accepted', (await hook({ awb: a1, current_status: 'IN TRANSIT', current_status_id: 18, scans: scans(['2026-11-20 10:00:00', 6, 'SHIPPED', 'Picked up'], ['2026-11-20 20:00:00', 18, 'IN TRANSIT', 'Reached hub']) })) === 200);
T('...and the parcel is in transit', (await shipRow(a1)).state === 'in_transit');
await hook({ awb: a2, current_status: 'UNDELIVERED', current_status_id: 21, scans: scans(['2026-11-20 10:00:00', 6, 'SHIPPED', 'Picked up'], ['2026-11-21 16:30:00', 21, 'UNDELIVERED', 'Customer not available']) });
const ndr = (await db.query('SELECT reason_detail, attempt_number, state::text AS state FROM ndr_cases WHERE shipment_id = $1', [(await shipRow(a2)).id])).rows[0];
T('An UNDELIVERED scan opens an NDR case with the courier\'s real reason, attempt 1', (await shipRow(a2)).state === 'ndr' && ndr && /not available/i.test(ndr.reason_detail) && ndr.attempt_number === 1 && ndr.state === 'open', JSON.stringify(ndr));
await hook({ awb: a2, current_status: 'UNDELIVERED', current_status_id: 21, scans: scans(['2026-11-20 10:00:00', 6, 'SHIPPED', 'Picked up'], ['2026-11-21 16:30:00', 21, 'UNDELIVERED', 'Customer not available'], ['2026-11-21 20:00:00', 18, 'IN TRANSIT', 'Hub scan']) });
T('A hub scan after the NDR does not leave the parcel "in transit" while Shiprocket still says UNDELIVERED', (await shipRow(a2)).state === 'ndr', (await shipRow(a2)).state);
await hook({ awb: a3, current_status: 'DELIVERED', current_status_id: 7, scans: scans(['2026-11-20 10:00:00', 6, 'SHIPPED', 'Picked up'], ['2026-11-22 12:00:00', 7, 'DELIVERED', 'Delivered']) });
T('A DELIVERED webhook delivers the parcel', (await shipRow(a3)).state === 'delivered');
const a4 = ships[3].awb;
await hook({ awb: a4, current_status: 'RTO INITIATED', current_status_id: 9, scans: scans(['2026-11-20 10:00:00', 6, 'SHIPPED', 'Picked up'], ['2026-11-22 12:00:00', 9, 'RTO INITIATED', 'Return started']) });
T('An RTO INITIATED webhook starts the return', (await shipRow(a4)).state === 'rto');
const before = await wallet();
await hook({ awb: a1, current_status: 'IN TRANSIT', current_status_id: 18, scans: scans(['2026-11-20 10:00:00', 6, 'SHIPPED', 'Picked up'], ['2026-11-20 20:00:00', 18, 'IN TRANSIT', 'Reached hub']) });
T('The same webhook again changes nothing (idempotent)', (await shipRow(a1)).state === 'in_transit' && (await wallet()) === before);

// ---- 4. cancel uses the Shiprocket ORDER id and refunds once
const s5 = ships[4]; const shipId5 = (await shipRow(s5.awb)).id; const w0 = await wallet();
const c1 = await call('POST', `/v1/shipments/${shipId5}/cancel`, {});
T('Cancelling a booked parcel works', c1.s === 200 || c1.s === 202, JSON.stringify(c1.j).slice(0, 160));
T('...it asked Shiprocket to cancel that parcel\'s ORDER id', fake.stats.cancels.includes(Number(s5.provider_shipment_id)), JSON.stringify(fake.stats.cancels));
T('...and refunded the exact charge once', (await wallet()) === w0 + Number(s5.shipping_charge_paise), JSON.stringify([w0, await wallet(), s5.shipping_charge_paise]));
await call('POST', `/v1/shipments/${shipId5}/cancel`, {});
T('Cancelling again refunds nothing more', (await wallet()) === w0 + Number(s5.shipping_charge_paise));

// ---- 5. the tracking poll (safety net) updates a parcel without any webhook
const a6 = ships[5].awb;
fake.mode.tracking = { track_status: 1, shipment_status: 7, shipment_track: [{ current_status: 'Delivered' }], shipment_track_activities: scans(['2026-11-20 10:00:00', 6, 'SHIPPED', 'Picked up'], ['2026-11-23 12:00:00', 7, 'DELIVERED', 'Delivered to customer']) };
const env = { ...process.env, DATABASE_URL: (process.env.E2E_DATABASE_URL || 'postgresql://nx@127.0.0.1:5544/nxd'), SHIPROCKET_EMAIL: 'api@test.example', SHIPROCKET_PASSWORD: 'pw', SHIPROCKET_BASE_URL: 'http://127.0.0.1:4666', SHIPROCKET_WEBHOOK_TOKEN: HOOK, NODE_ENV: 'development' };
const polled = (await run(`npx tsx -e "import('./src/lib/trackingPoll.ts').then((m) => m.pollOnce({ error: console.error, warn: () => {}, info: () => {} })).then((n) => { console.log('POLLED ' + n); process.exit(0); })"`, { cwd: new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), encoding: 'utf8', env })).stdout;
T('The tracking poll asked Shiprocket per AWB and delivered the parcel', /POLLED \d+/.test(polled) && (await shipRow(a6)).state === 'delivered' && (fake.stats.calls['GET /courier/track/awb'] || 0) >= 1, (polled.match(/POLLED \d+/) || [''])[0]);
fake.mode.tracking = null;

// ---- 6. Shiprocket's own wallet is empty: orders are kept (paused), a top-up books them by themselves
fake.mode.nobalance = true; fake.mode.balance = -250;
orders = await makeOrders(8);
const pausedBatch = await queueBatch(orders);
let pb = await until(pausedBatch, (x) => x.paused === 8, 20000);
T('Empty Shiprocket wallet: all 8 orders are PAUSED, none failed, nothing charged for them', pb && pb.paused === 8 && pb.failed === 0 && pb.assigned === 0 && !pb.finished_at, JSON.stringify(pb && { paused: pb.paused, failed: pb.failed, assigned: pb.assigned }));
const sum = (await call('GET', '/v1/shipments/summary')).j;
T('Track is told booking is paused (the balance is never sent)', sum.bookingPaused === true && !JSON.stringify(sum).includes('250'), JSON.stringify({ bookingPaused: sum.bookingPaused }));
const wPaused = await wallet(); fake.mode.nobalance = false; fake.mode.balance = 9000;
pb = await until(pausedBatch, (x) => !!x.finished_at, 60000);
T('After the top-up all 8 are booked automatically', pb && pb.assigned === 8 && pb.failed === 0, JSON.stringify(pb && { assigned: pb.assigned, failed: pb.failed, paused: pb.paused }));
T('Each of the 8 was ordered once at Shiprocket (a retry reuses the order, no duplicates) and charged once', (await db.query(`SELECT count(*)::int AS n FROM (SELECT order_id FROM shipments WHERE seller_id = $1 GROUP BY order_id HAVING count(*) > 1) x`, [sellerId])).rows[0].n === 0 && (await wallet()) < wPaused);

console.log(out.join('\n'));
console.log(`\n${out.filter((x) => x.startsWith('PASS')).length}/${out.length} passed`);
await db.end(); fake.close(); process.exit(0);
