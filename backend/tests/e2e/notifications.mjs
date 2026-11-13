// End-to-end check of the Notifications feature (needs the API on :4011 started with LORRIGO_API_KEY=test LORRIGO_BASE_URL=http://127.0.0.1:4555
// LORRIGO_WEBHOOK_TOKEN=hooktoken-hooktoken-1234 and a throwaway Postgres on :5544). Real webhook events create the notifications; batches report when they finish;
// the inbox can be read, filtered and marked read; another seller sees none of it. Run: node tests/e2e/notifications.mjs
import http from 'node:http';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../../package.json', import.meta.url));
const pg = require('pg');
const API = 'http://127.0.0.1:4011';
const HOOK = 'hooktoken-hooktoken-1234';
const db = new pg.Client({ connectionString: 'postgresql://nx@127.0.0.1:5544/nxd' }); await db.connect();
const out = []; const T = (n, ok, d = '') => out.push((ok ? 'PASS ' : 'FAIL ') + n + (d ? ' — ' + d : ''));
const fake = http.createServer((req, res) => { setTimeout(() => { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"success":true}'); }, 100); }).listen(4555);

const newClient = () => { let jar = '', csrf = ''; return async (m, p, b, headers = {}) => { const r = await fetch(API + p, { method: m, headers: { 'content-type': 'application/json', ...(jar ? { cookie: jar } : {}), ...(m !== 'GET' && csrf ? { 'x-csrf-token': csrf } : {}), ...headers }, body: b ? JSON.stringify(b) : undefined }); const sc = r.headers.getSetCookie?.() ?? []; if (sc.length) { const kv = Object.fromEntries(jar.split('; ').filter(Boolean).map((x) => x.split(/=(.*)/s).slice(0, 2))); for (const c of sc) { const [k, v] = c.split(';')[0].split(/=(.*)/s); kv[k] = v; } jar = Object.entries(kv).map(([k, v]) => `${k}=${v}`).join('; '); csrf = decodeURIComponent(kv.nx_csrf || ''); } let j = null; try { j = await r.json(); } catch {} return { s: r.status, j }; }; };
const call = newClient(); const other = newClient();
const email = `notif${Date.now()}@example.com`;
await call('POST', '/v1/auth/signup', { fullName: 'Notif Tester', email, password: 'Str0ng-Passw0rd!x', businessName: 'Notif Co', legalName: 'Notif Co', phone: '9876543210' });
await call('POST', '/v1/seller/agreement', {});
await other('POST', '/v1/auth/signup', { fullName: 'Someone Else', email: `else${Date.now()}@example.com`, password: 'Str0ng-Passw0rd!x', businessName: 'Else Co', legalName: 'Else Co', phone: '9876543211' });
const sellerId = (await db.query('SELECT s.id FROM sellers s JOIN seller_memberships m ON m.seller_id = s.id JOIN users u ON u.id = m.user_id WHERE u.email = $1', [email])).rows[0].id;
const wh = await call('POST', '/v1/warehouses', { name: 'Main', warehouseType: 'primary', contactName: 'Owner', phone: '9876543210', addressLine1: '5 Test Lane', city: 'Mumbai', state: 'Maharashtra', pincode: '400001' });
const mk = async (n) => (await call('POST', '/v1/orders', { warehouseId: wh.j.id, orderNumber: 'NT' + n, paymentMode: 'prepaid', customer: { fullName: 'Buyer ' + n, phone: '9876543210', addressLine1: '12 Road', city: 'Mumbai', state: 'Maharashtra', pincode: '400002' }, items: [{ sku: 'S', name: 'Item', quantity: 1, unitPricePaise: 50000, weightG: 300 }], package: { weightG: 300, lengthMm: 100, widthMm: 100, heightMm: 100 } })).j.id;
await db.query("UPDATE courier_providers SET aggregator = 'lorrigo' WHERE code = 'delhivery' AND aggregator IS NULL");
const prov = (await db.query("SELECT cp.id AS pid, cs.id AS sid FROM courier_providers cp JOIN courier_services cs ON cs.provider_id = cp.id WHERE cp.aggregator = 'lorrigo' LIMIT 1")).rows[0];
const stamp = Date.now().toString().slice(-6);
const ship = async (tag, state = 'booked') => {
  const orderId = await mk(tag);
  const awb = 'NT' + stamp + tag;
  const sh = await db.query(`INSERT INTO shipments (seller_id,order_id,provider_id,service_id,awb,provider_shipment_id,chargeable_weight_g,shipping_charge_paise,quote_snapshot,idempotency_key,destination_pincode,destination_city,state,booked_at)
    VALUES ($1,$2,$3,$4,$5,$6,500,10000,'{}',$7,'400002','Mumbai',$8::shipment_state,now()) RETURNING id`, [sellerId, orderId, prov.pid, prov.sid, awb, 'ps-' + tag, 'nt-key-' + stamp + tag + '-padding-padding', state]);
  await db.query("UPDATE orders SET state = 'booked' WHERE id = $1", [orderId]);
  await db.query("INSERT INTO wallet_entries (seller_id,entry_type,amount_paise,reference_type,reference_id,idempotency_key,description) VALUES ($1,'debit',10000,'shipment',$2,$3,'Shipping charge')", [sellerId, sh.rows[0].id, 'nt-debit-' + sh.rows[0].id]);
  return { id: sh.rows[0].id, awb };
};
const hook = (awb, status, events) => fetch(API + '/v1/webhooks/aggregators/lorrigo', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': HOOK }, body: JSON.stringify({ awb, status, tracking_events: events }) }).then((r) => r.status);
const when = (mins) => new Date(Date.now() - mins * 60000).toISOString();
const list = async () => (await call('GET', '/v1/notifications?pageSize=100')).j;

const A = await ship('A'), B = await ship('B'), C = await ship('C');
T('A new seller starts with an empty inbox', (await list()).total === 0);
let st = await hook(A.awb, 'DELIVERED', [{ status: 'PICKED_UP', timestamp: when(300), location: 'Mumbai' }, { status: 'DELIVERED', timestamp: when(60), location: 'Mumbai' }]);
T('Courier webhook accepted', st === 200, String(st));
let L = await list();
T('Delivered parcel creates a "Shipment delivered" notification', L.items.some((n) => n.kind === 'delivered' && /delivered/i.test(n.title) && n.body.includes(A.awb)), JSON.stringify(L.items.map((n) => n.title)));
await hook(A.awb, 'DELIVERED', [{ status: 'PICKED_UP', timestamp: when(300) }, { status: 'DELIVERED', timestamp: when(60) }]);
T('The same webhook again does not create a second notification', (await list()).items.filter((n) => n.kind === 'delivered').length === 1);

await hook(B.awb, 'NDR', [{ status: 'PICKED_UP', timestamp: when(400) }, { status: 'NDR', timestamp: when(200), description: 'Customer not available at the address' }]);
L = await list();
const ndr1 = L.items.find((n) => n.kind === 'ndr');
T('A failed delivery creates an NDR notification (attempt 1) with the real reason', !!ndr1 && /attempt 1/.test(ndr1.title) && /not available/i.test(ndr1.body), ndr1 && ndr1.title + ' | ' + ndr1.body);
// seller answers the NDR, then the courier fails again: attempt 2, a new notification
await db.query("UPDATE ndr_cases SET state = 'reattempt_requested' WHERE shipment_id = $1", [B.id]);
await db.query("UPDATE shipments SET state = 'out_for_delivery' WHERE id = $1", [B.id]);
await hook(B.awb, 'NDR', [{ status: 'PICKED_UP', timestamp: when(400) }, { status: 'NDR', timestamp: when(200), description: 'Customer not available at the address' }, { status: 'OUT_FOR_DELIVERY', timestamp: when(100) }, { status: 'NDR', timestamp: when(20), description: 'Customer refused to accept the parcel' }]);
L = await list();
const attempts = L.items.filter((n) => n.kind === 'ndr').map((n) => n.title);
T('A repeat NDR after a reattempt is a second notification (attempt 2)', attempts.some((t) => /attempt 2/.test(t)), JSON.stringify(attempts));
await hook(C.awb, 'RTO_INITIATED', [{ status: 'PICKED_UP', timestamp: when(500) }, { status: 'RTO_INITIATED', timestamp: when(30) }]);
T('A returning parcel creates an RTO notification', (await list()).items.some((n) => n.kind === 'rto'));

// batch completion (cancel queue) and the missed-pickup check
const D = await ship('D'), E = await ship('E');
const qd = await call('POST', '/v1/shipments/cancel-batch', { shipmentIds: [D.id, E.id] });
await new Promise((r) => setTimeout(r, 6000));
L = await list();
T('A finished cancellation batch creates a notification with the refund', L.items.some((n) => n.kind === 'batch' && /Cancellation finished: 2 cancelled/.test(n.title) && /₹200/.test(n.body)), JSON.stringify(L.items.filter((n) => n.kind === 'batch').map((n) => n.title)));
const F = await ship('F'); await db.query("UPDATE shipments SET booked_at = now() - interval '30 hours', pickup_deadline_at = now() - interval '6 hours' WHERE id = $1", [F.id]);
// the scheduled check (the worker runs it every 10 minutes): run it once now, and twice to see it is stored once a day
import { execSync } from 'node:child_process';
const scan = () => execSync(`npx tsx -e "import('./src/lib/notify.ts').then((m) => m.scanPickupMissed()).then((n) => { console.log('SCAN ' + n); process.exit(0); })"`, { cwd: new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), encoding: 'utf8', env: { ...process.env, DATABASE_URL: 'postgresql://nx@127.0.0.1:5544/nxd' } });
scan(); scan();
L = await list();
const missed = L.items.filter((n) => n.kind === 'pickup_missed');
T('A missed pickup creates ONE notification per day, however often the check runs', missed.length === 1 && /1 pickup missed/.test(missed[0].title), JSON.stringify(missed.map((n) => n.title)));
// funds
execSync(`npx tsx -e "import('./src/lib/notify.ts').then(async (m) => { await m.notifyFunds('${sellerId}', 'Debit limit reached: you cannot push more orders until you recharge your wallet.'); await m.notifyFunds('${sellerId}', 'Debit limit reached: you cannot push more orders until you recharge your wallet.'); process.exit(0); })"`, { cwd: new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), encoding: 'utf8', env: { ...process.env, DATABASE_URL: 'postgresql://nx@127.0.0.1:5544/nxd' } });
L = await list();
T('"Debit limit reached" is told once an hour, not once per refused order', L.items.filter((n) => n.kind === 'wallet' && n.title === 'Debit limit reached').length === 1);

// the inbox
let sum = await call('GET', '/v1/notifications/summary');
T('Summary gives the unread count and the latest items', sum.j.unread === L.total && sum.j.items.length > 0 && sum.j.items.length <= 6, JSON.stringify([sum.j.unread, L.total]));
const first = L.items[0];
let r = await call('POST', '/v1/notifications/read', { ids: [first.id] });
T('Marking one notification as read lowers the unread count by one', r.j.marked === 1 && (await call('GET', '/v1/notifications/summary')).j.unread === L.total - 1);
r = await call('GET', '/v1/notifications?unread=1&pageSize=100');
T('The unread filter leaves out the one that was read', r.j.items.every((n) => !n.read_at) && !r.j.items.some((n) => n.id === first.id));
r = await call('GET', '/v1/notifications?group=parcels&pageSize=100');
T('The parcels group shows only parcel events (delivered, NDR, RTO, pickup, batch)', r.j.items.length > 0 && r.j.items.every((n) => ['delivered', 'rto', 'ndr', 'pickup_missed', 'batch'].includes(n.kind)), r.j.items.map((n) => n.kind).join(','));
r = await call('GET', '/v1/notifications?group=money&pageSize=100');
T('The money group shows the wallet notification only', r.j.items.length === 1 && r.j.items[0].kind === 'wallet', r.j.items.map((n) => n.kind).join(','));
r = await call('POST', '/v1/notifications/read', { all: true });
T('Mark all as read clears the unread count', r.j.marked >= 1 && (await call('GET', '/v1/notifications/summary')).j.unread === 0);
r = await call('POST', '/v1/notifications/read', {});
T('Marking with nothing chosen is refused', r.s === 400, String(r.s));
// isolation
const o = await other('GET', '/v1/notifications?pageSize=100');
T('Another seller sees none of these notifications', o.j.total === 0 && o.j.items.length === 0);
const oth = await other('POST', '/v1/notifications/read', { ids: [first.id] });
T("Another seller cannot mark this seller's notification as read", oth.j.marked === 0);
const noaggr = JSON.stringify(L.items);
T('No notification text mentions the courier network', !/lorrigo|aggregator/i.test(noaggr));
await db.end();
console.log(out.join('\n'));
fake.close();
process.exit(0);
