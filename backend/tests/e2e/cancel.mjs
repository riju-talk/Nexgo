// End-to-end check of "cancel everything" (needs the API on :4011 started with LORRIGO_API_KEY=test LORRIGO_BASE_URL=http://127.0.0.1:4555 and a throwaway Postgres on :5544).
// Seeds a clean seller with 60 booked shipments (each with its wallet debit) and 5 orders that never shipped, queues ONE cancel batch and checks that every
// item is cancelled, each refund is exact and happens once, queuing the same items again does nothing, and a picked-up parcel is refused alone. Run: node tests/e2e/cancel.mjs
import http from 'node:http';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../../package.json', import.meta.url));
const pg = require('pg');
const API = 'http://127.0.0.1:4011';
const db = new pg.Client({ connectionString: 'postgresql://nx@127.0.0.1:5544/nxd' }); await db.connect();
const out = []; const T = (n, ok, d = '') => out.push((ok ? 'PASS ' : 'FAIL ') + n + (d ? ' — ' + d : ''));

// a fake courier that cancels in about 150 ms and counts the calls
let cancelCalls = 0;
const fake = http.createServer((req, res) => { if (/\/shipments\/.+\/cancel/.test(req.url)) { cancelCalls += 1; setTimeout(() => { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"success":true}'); }, 150); } else { res.writeHead(404); res.end('{}'); } }).listen(4555);

let jar = '', csrf = '';
const call = async (m, p, b) => { const r = await fetch(API + p, { method: m, headers: { 'content-type': 'application/json', ...(jar ? { cookie: jar } : {}), ...(m !== 'GET' && csrf ? { 'x-csrf-token': csrf } : {}) }, body: b ? JSON.stringify(b) : undefined }); const sc = r.headers.getSetCookie?.() ?? []; if (sc.length) { const kv = Object.fromEntries(jar.split('; ').filter(Boolean).map((x) => x.split(/=(.*)/s).slice(0, 2))); for (const c of sc) { const [k, v] = c.split(';')[0].split(/=(.*)/s); kv[k] = v; } jar = Object.entries(kv).map(([k, v]) => `${k}=${v}`).join('; '); csrf = decodeURIComponent(kv.nx_csrf || ''); } let j = null; try { j = await r.json(); } catch {} return { s: r.status, j }; };

const email = `cancel${Date.now()}@example.com`;
let r = await call('POST', '/v1/auth/signup', { fullName: 'Cancel Tester', email, password: 'Str0ng-Passw0rd!x', businessName: 'Cancel Test Co', legalName: 'Cancel Test Co', phone: '9876543210' });
await call('POST', '/v1/seller/agreement', {});
const sellerId = (await db.query('SELECT s.id FROM sellers s JOIN seller_memberships m ON m.seller_id = s.id JOIN users u ON u.id = m.user_id WHERE u.email = $1', [email])).rows[0].id;
const wh = await call('POST', '/v1/warehouses', { name: 'Main', warehouseType: 'primary', contactName: 'Owner', phone: '9876543210', addressLine1: '5 Test Lane', city: 'Mumbai', state: 'Maharashtra', pincode: '400001' });
const mk = async (n) => (await call('POST', '/v1/orders', { warehouseId: wh.j.id, orderNumber: 'CX' + n, paymentMode: 'prepaid', customer: { fullName: 'Buyer ' + n, phone: '9876543210', addressLine1: '12 Road', city: 'Mumbai', state: 'Maharashtra', pincode: '400002' }, items: [{ sku: 'S', name: 'Item', quantity: 1, unitPricePaise: 50000, weightG: 300 }], package: { weightG: 300, lengthMm: 100, widthMm: 100, heightMm: 100 } })).j.id;
await db.query("UPDATE courier_providers SET aggregator = 'lorrigo' WHERE code = 'delhivery' AND aggregator IS NULL"); // local databases may have this courier without its aggregator
const prov = (await db.query("SELECT cp.id AS pid, cs.id AS sid FROM courier_providers cp JOIN courier_services cs ON cs.provider_id = cp.id WHERE cp.aggregator = 'lorrigo' LIMIT 1")).rows[0];
await db.query("INSERT INTO wallet_entries (seller_id,entry_type,amount_paise,reference_type,reference_id,idempotency_key,description) VALUES ($1,'credit',10000000,'wallet_recharge','seed',$2,'seed')", [sellerId, 'seed-' + Date.now()]);
const stamp = Date.now().toString().slice(-6);
const shipIds = [];
for (let i = 0; i < 60; i++) {
  const orderId = await mk('S' + i);
  const sh = await db.query(`INSERT INTO shipments (seller_id,order_id,provider_id,service_id,awb,provider_shipment_id,chargeable_weight_g,shipping_charge_paise,quote_snapshot,idempotency_key,destination_pincode,destination_city,state,booked_at)
    VALUES ($1,$2,$3,$4,$5,$6,500,10000,'{}',$7,'400002','Mumbai','booked',now()) RETURNING id`, [sellerId, orderId, prov.pid, prov.sid, 'CX' + stamp + String(i).padStart(3, '0'), 'ps-' + i, 'cx-key-' + stamp + '-' + i + '-padding-padding']);
  await db.query("UPDATE orders SET state = 'booked' WHERE id = $1", [orderId]);
  await db.query("INSERT INTO wallet_entries (seller_id,entry_type,amount_paise,reference_type,reference_id,idempotency_key,description) VALUES ($1,'debit',10000,'shipment',$2,$3,'Shipping charge')", [sellerId, sh.rows[0].id, 'ship-debit-' + sh.rows[0].id]);
  shipIds.push(sh.rows[0].id);
}
const orderOnly = []; for (let i = 0; i < 5; i++) orderOnly.push(await mk('O' + i));
// a parcel that has been picked up cannot be cancelled
const pickedOrder = await mk('P');
const picked = await db.query(`INSERT INTO shipments (seller_id,order_id,provider_id,service_id,awb,provider_shipment_id,chargeable_weight_g,shipping_charge_paise,quote_snapshot,idempotency_key,destination_pincode,destination_city,state,booked_at)
  VALUES ($1,$2,$3,$4,$5,'ps-p',500,10000,'{}',$6,'400002','Mumbai','in_transit',now()) RETURNING id`, [sellerId, pickedOrder, prov.pid, prov.sid, 'CXP' + stamp, 'cx-key-p-' + stamp + '-padding-padding']);
const balance = async () => Number((await db.query("SELECT COALESCE(SUM(CASE WHEN entry_type IN ('credit','release') THEN amount_paise WHEN entry_type IN ('debit','hold') THEN -amount_paise ELSE amount_paise END),0)::bigint AS b FROM wallet_entries WHERE seller_id = $1", [sellerId])).rows[0].b);
const before = await balance();

const t0 = Date.now();
r = await call('POST', '/v1/shipments/cancel-batch', { shipmentIds: [...shipIds, picked.rows[0].id], orderIds: orderOnly });
T('Queue accepts 60 shipments + 5 orders (the picked-up parcel is left out)', r.s === 202 && r.j.queued === 65 && r.j.skipped === 1, JSON.stringify(r.j));
const batchId = r.j.id;
const again = await call('POST', '/v1/shipments/cancel-batch', { shipmentIds: shipIds.slice(0, 5) });
T('Queuing the same shipments again while they wait does nothing (no double cancel)', again.j.queued === 0, JSON.stringify(again.j));
let prog = null; let polls = 0; let sawProgress = false;
for (; polls < 120; polls++) {
  prog = (await call('GET', '/v1/shipments/cancel-batch/' + batchId)).j;
  if (prog.done > 0 && prog.done < prog.total) sawProgress = true;
  if (prog.finished_at) break; await new Promise((x) => setTimeout(x, 500));
}
const secs = Math.round((Date.now() - t0) / 100) / 10;
T('The whole batch finishes (65 of 65), with progress visible on the way', prog.finished_at && prog.cancelled === 65 && prog.failed === 0 && sawProgress, `done ${prog.done}/${prog.total} in ${secs}s, ${polls} polls`);
const refundTotal = (await balance()) - before;
T('Refund is exact: 60 x ₹100 = ₹6,000 credited back, once', refundTotal === 600000 && prog.refunded_paise === 600000, `wallet +${refundTotal} paise, reported ${prog.refunded_paise}`);
T('Every shipment is cancelled and the courier was asked once per shipment', (await db.query("SELECT count(*)::int AS n FROM shipments WHERE seller_id = $1 AND state = 'cancelled'", [sellerId])).rows[0].n === 60 && cancelCalls === 60, `courier calls ${cancelCalls}`);
T('The 5 never-shipped orders are cancelled', (await db.query("SELECT count(*)::int AS n FROM orders WHERE id = ANY($1::uuid[]) AND state = 'cancelled'", [orderOnly])).rows[0].n === 5);
T('The picked-up parcel is untouched', (await db.query("SELECT state::text FROM shipments WHERE id = $1", [picked.rows[0].id])).rows[0].state === 'in_transit');
T('Results list every item once finished', Array.isArray(prog.results) && prog.results.length === 65 && prog.results.every((x) => x.ok), String(prog.results?.length));
// replaying the cancel of a cancelled shipment refunds nothing more
const replay = await call('POST', `/v1/shipments/${shipIds[0]}/cancel`, {});
T('Cancelling an already cancelled shipment again refunds nothing', replay.s === 200 && (await balance()) - before === 600000);
const active = await call('GET', '/v1/shipments/cancel-batch/active');
T('No active batch after it finishes', active.j.batch === null);
// another seller cannot see or cancel these
const other = await call('POST', '/v1/auth/signup', { fullName: 'Other', email: `other${Date.now()}@example.com`, password: 'Str0ng-Passw0rd!x', businessName: 'Other Co', legalName: 'Other Co', phone: '9876543211' });
const peek = await call('GET', '/v1/shipments/cancel-batch/' + batchId);
T("Another seller cannot read this seller's batch", peek.s === 404);
console.log(out.join('\n'));
fake.close(); await db.end(); process.exit(0);
