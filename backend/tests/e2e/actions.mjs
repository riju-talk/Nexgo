// End-to-end check that every ACTION (create / push / cancel) moves the dashboard figures and the "Decisions waiting on you" block by exactly the right amount,
// with hand-worked expectations. Needs the API on :4011 started with LORRIGO_API_KEY=test LORRIGO_BASE_URL=http://127.0.0.1:4555 (development) and a throwaway Postgres on :5544.
// Run: node tests/e2e/actions.mjs
import http from 'node:http';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../../package.json', import.meta.url));
const pg = require('pg');
const API = 'http://127.0.0.1:4011';
const db = new pg.Client({ connectionString: 'postgresql://nx@127.0.0.1:5544/nxd' }); await db.connect();
const out = []; const T = (n, ok, d = '') => out.push((ok ? 'PASS ' : 'FAIL ') + n + (d ? ' - ' + d : ''));
const fake = http.createServer((req, res) => { setTimeout(() => { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"success":true}'); }, 80); }).listen(4555);

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
// a different window length each call = a different cache key, so figures written straight into the database are read fresh
let win = 40; const dash = async () => (await call('GET', `/v1/analytics/dashboard?days=${win++}`)).j;
const wallet = async () => Number((await db.query(`SELECT COALESCE(SUM(CASE WHEN entry_type IN ('credit','release') THEN amount_paise WHEN entry_type IN ('debit','hold') THEN -amount_paise ELSE amount_paise END),0)::bigint AS b FROM wallet_entries WHERE seller_id = $1`, [sellerId])).rows[0].b);

const email = `act${Date.now()}@example.com`;
await call('POST', '/v1/auth/signup', { fullName: 'Action Tester', email, password: 'Str0ng-Passw0rd!x', businessName: 'Action Co', legalName: 'Action Co', phone: '9876543210' });
await call('POST', '/v1/seller/agreement', {});
const sellerId = (await db.query('SELECT s.id FROM sellers s JOIN seller_memberships m ON m.seller_id = s.id JOIN users u ON u.id = m.user_id WHERE u.email = $1', [email])).rows[0].id;
const wh = await call('POST', '/v1/warehouses', { name: 'Main', warehouseType: 'primary', contactName: 'Owner', phone: '9876543210', addressLine1: '5 Test Lane', city: 'Mumbai', state: 'Maharashtra', pincode: '400001' });
const stamp = Date.now().toString().slice(-6);
const mk = async (n) => (await call('POST', '/v1/orders', { warehouseId: wh.j.id, orderNumber: `AC${stamp}${n}`, paymentMode: 'prepaid', customer: { fullName: 'Buyer ' + n, phone: '9876543210', addressLine1: '12 Road', city: 'Mumbai', state: 'Maharashtra', pincode: '400002' }, items: [{ sku: 'S', name: 'Item', quantity: 1, unitPricePaise: 50000, weightG: 300 }], package: { weightG: 300, lengthMm: 100, widthMm: 100, heightMm: 100 } })).j.id;
await db.query("UPDATE courier_providers SET aggregator = 'lorrigo' WHERE code = 'delhivery' AND aggregator IS NULL");
const prov = (await db.query("SELECT cp.id AS pid, cs.id AS sid FROM courier_providers cp JOIN courier_services cs ON cs.provider_id = cp.id WHERE cp.aggregator = 'lorrigo' LIMIT 1")).rows[0];
await db.query("INSERT INTO wallet_entries (seller_id,entry_type,amount_paise,reference_type,reference_id,idempotency_key,description) VALUES ($1,'credit',500000,'wallet_recharge','seed',$2,'seed')", [sellerId, 'act-seed-' + stamp]);

// ---- 1. creating orders
const orders = []; for (let i = 0; i < 6; i++) orders.push(await mk('O' + i));
let d = await dash();
T('6 orders created: 6 placed, 6 today, 6 waiting for a courier (Ready to ship)', d.metrics.orderVolume === 6 && d.metrics.todayVolume === 6 && d.pipeline.ready_to_ship === 6, JSON.stringify([d.metrics.orderVolume, d.metrics.todayVolume, d.pipeline.ready_to_ship]));
T('Nothing is shipped, delivered or cancelled yet; no rates are invented from zero parcels', d.metrics.shipped === 0 && d.pipeline.delivered === 0 && d.pipeline.cancelled === 0 && d.metrics.deliveryRate === null && d.metrics.rtoRate === null);

// ---- 2. cancelling two orders that never shipped (queued, with progress)
const waitBatch = async (id) => { for (let i = 0; i < 60; i++) { const b = (await call('GET', `/v1/shipments/cancel-batch/${id}`)).j; if (b?.finished_at || b?.finishedAt) return b; await new Promise((r) => setTimeout(r, 500)); } return null; };
let q = await call('POST', '/v1/shipments/cancel-batch', { orderIds: [orders[0], orders[1]] });
T('Cancel batch accepted for 2 orders', q.s === 202 || q.s === 200 || q.s === 201, JSON.stringify(q.j));
const b1 = await waitBatch(q.j.id);
T('Batch finishes: 2 cancelled, 0 failed', !!b1 && b1.cancelled === 2 && b1.failed === 0, JSON.stringify(b1));
d = await dash();
T('After cancelling 2 orders: 4 placed, 4 waiting, 2 cancelled', d.metrics.orderVolume === 4 && d.pipeline.ready_to_ship === 4 && d.pipeline.cancelled === 2 && d.metrics.orderCancelled === 2, JSON.stringify([d.metrics.orderVolume, d.pipeline.ready_to_ship, d.pipeline.cancelled]));
T('Cancelling unshipped orders costs and refunds nothing', (await wallet()) === 500000);

// ---- 3. pushing 3 orders (booked with a courier: pickup pending, wallet debited 100 each)
const booked = [];
for (let i = 2; i < 5; i++) {
  const sh = await db.query(`INSERT INTO shipments (seller_id,order_id,provider_id,service_id,awb,provider_shipment_id,chargeable_weight_g,shipping_charge_paise,quote_snapshot,idempotency_key,destination_pincode,destination_city,state,booked_at,promised_delivery_at,pickup_deadline_at)
    VALUES ($1,$2,$3,$4,$5,$6,500,10000,'{"zone":"within_city"}',$7,'400002','Mumbai','booked',now(), now() + interval '4 days', now() + interval '24 hours') RETURNING id`, [sellerId, orders[i], prov.pid, prov.sid, `AC${stamp}${i}`, 'ps-' + i, `act-key-${stamp}${i}-padding-padding`]);
  await db.query("UPDATE orders SET state = 'booked' WHERE id = $1", [orders[i]]);
  await db.query("INSERT INTO wallet_entries (seller_id,entry_type,amount_paise,reference_type,reference_id,idempotency_key,description) VALUES ($1,'debit',10000,'shipment',$2,$3,'Shipping charge')", [sellerId, sh.rows[0].id, 'act-debit-' + sh.rows[0].id]);
  booked.push(sh.rows[0].id);
}
d = await dash();
T('After pushing 3: 1 order still waiting, 3 pickups pending, 3 shipped', d.pipeline.ready_to_ship === 1 && d.pipeline.pickup_pending === 3 && d.metrics.shipped === 3, JSON.stringify([d.pipeline.ready_to_ship, d.pipeline.pickup_pending, d.metrics.shipped]));
T('Decisions: pickups waiting 3, none missed', d.queue.pickup.pending === 3 && d.queue.pickup.missed === 0, JSON.stringify(d.queue.pickup));
T('Wallet is 5,000 - 3 x 100 = 4,700', (await wallet()) === 470000);
T('Shipping spend = 3 x 100 and average 100', d.metrics.shippingSpendPaise === 30000 && d.metrics.avgShippingPaise === 10000);

// ---- 4. cancelling one pushed shipment refunds exactly its booking debit, once
q = await call('POST', '/v1/shipments/cancel-batch', { shipmentIds: [booked[0]] });
const b2 = await waitBatch(q.j.id);
T('Shipment cancel finishes with 100 refunded', !!b2 && b2.cancelled === 1 && Number(b2.refunded_paise ?? b2.refundedPaise) === 10000, JSON.stringify(b2));
T('Wallet is back to 4,800 (refund once)', (await wallet()) === 480000);
d = await dash();
T('After cancelling a pushed shipment: 2 pickups pending, 2 shipped, 3 cancelled in total', d.pipeline.pickup_pending === 2 && d.metrics.shipped === 2 && d.pipeline.cancelled === 3, JSON.stringify([d.pipeline.pickup_pending, d.metrics.shipped, d.pipeline.cancelled]));
q = await call('POST', '/v1/shipments/cancel-batch', { shipmentIds: [booked[0]] });
T('Cancelling the same shipment again does nothing and refunds nothing more', (q.j?.queued ?? 0) === 0 && (await wallet()) === 480000, JSON.stringify(q.j));
T('Decisions: pickups waiting now 2', (await dash()).queue.pickup.pending === 2);

// ---- 5. decisions waiting on you
const dec = async (tag, state, extra = '') => {
  const orderId = await mk(tag);
  const sh = await db.query(`INSERT INTO shipments (seller_id,order_id,provider_id,service_id,awb,provider_shipment_id,chargeable_weight_g,shipping_charge_paise,quote_snapshot,idempotency_key,destination_pincode,destination_city,state,booked_at,created_at,delivered_at,promised_delivery_at)
    VALUES ($1,$2,$3,$4,$5,$6,500,10000,'{"zone":"within_city"}',$7,'400002','Mumbai',$8::shipment_state, now() - interval '3 days', now() - interval '3 days', ${state === 'delivered' ? "now() - interval '1 hour'" : 'NULL'}, now() + interval '2 days') RETURNING id`, [sellerId, orderId, prov.pid, prov.sid, `AC${stamp}${tag}`, 'ps-' + tag, `act-key-${stamp}${tag}-padding-padding`, state]);
  await db.query("UPDATE orders SET state = 'booked' WHERE id = $1", [orderId]);
  await db.query("INSERT INTO wallet_entries (seller_id,entry_type,amount_paise,reference_type,reference_id,idempotency_key,description) VALUES ($1,'debit',10000,'shipment',$2,$3,'Shipping charge')", [sellerId, sh.rows[0].id, 'act-debit-' + sh.rows[0].id]);
  void extra; return { orderId, shipmentId: sh.rows[0].id };
};
const n1 = await dec('N1', 'ndr'); const n2 = await dec('N2', 'ndr'); const w1 = await dec('W1', 'in_transit'); const w2 = await dec('W2', 'in_transit'); const c1 = await dec('C1', 'delivered');
await db.query(`INSERT INTO ndr_cases (seller_id,shipment_id,reason_code,ndr_reason,state) VALUES ($1,$2,'courier_ndr','customer_unavailable','open'), ($1,$3,'courier_ndr','address_incomplete','reattempt_requested')`, [sellerId, n1.shipmentId, n2.shipmentId]);
await db.query(`INSERT INTO weight_disputes (seller_id,shipment_id,declared_weight_g,billed_weight_g,original_charge_paise,disputed_charge_paise,held_amount_paise,raised_by_provider,status,resolved_at) VALUES ($1,$2,500,1000,10000,15000,5000,$4,'open',NULL), ($1,$3,500,1000,10000,15000,5000,$4,'won',now())`, [sellerId, w1.shipmentId, w2.shipmentId, prov.pid]);
await db.query("UPDATE orders SET payment_mode = 'cod', cod_amount_paise = 80000 WHERE id = $1", [c1.orderId]);
d = await dash();
T('Decisions - NDR: 1 open case needs a decision (the answered one is not counted but shown as answered)', d.queue.ndr.open === 1 && d.queue.ndr.answered === 1 && d.queue.ndr.reasons.length === 1 && d.queue.ndr.reasons[0].reason === 'customer_unavailable', JSON.stringify(d.queue.ndr));
T('Decisions - weight: 1 open dispute, 50 held, 50 extra charge from the courier (the won one is not counted)', d.queue.weight.open === 1 && d.queue.weight.heldPaise === 5000 && d.queue.weight.couriers.length === 1 && d.queue.weight.couriers[0].amountPaise === 5000 && d.queue.weight.couriers[0].count === 1, JSON.stringify(d.queue.weight));
T('Decisions - COD: delivered COD 800 minus freight 100 = 700 still to be paid out; 800 delivered today', d.queue.cod.pendingPaise === 70000 && d.queue.cod.deliveredTodayPaise === 80000, JSON.stringify(d.queue.cod));
T('Decisions - pickups: still just the 2 parcels waiting (in-transit, NDR and delivered ones are not pickups)', d.queue.pickup.pending === 2);
T('Dashboard NDR rate counts parcels that hit an NDR: 2 of 7 shipped = 28.6%', d.metrics.shipped === 7 && d.metrics.ndrParcels === 2 && d.metrics.ndrRate === 28.6, JSON.stringify([d.metrics.shipped, d.metrics.ndrParcels, d.metrics.ndrRate]));
T('Delivery performance: 1 delivered, first attempt 100 %, promised date kept 100 %', d.deliveryQuality.delivered === 1 && d.deliveryQuality.firstAttemptPct === 100 && d.deliveryQuality.withinPromisedDatePct === 100, JSON.stringify(d.deliveryQuality));
T('Delivery rate = 1 delivered of 1 finished = 100 %', d.metrics.deliveryRate === 100);

console.log(out.join('\n'));
console.log(`\n${out.filter((x) => x.startsWith('PASS')).length}/${out.length} passed`);
fake.close(); await db.end();
process.exit(out.some((x) => x.startsWith('FAIL')) ? 1 : 0);
