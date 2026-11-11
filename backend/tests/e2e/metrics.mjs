// End-to-end figure check (needs a local API on :4011 and a throwaway Postgres on :5544, see docs). Seeds a clean seller with shipments in every state and asserts
// that the dashboard, RTO, NDR and admin pickup figures agree with hand-worked numbers. Run: node tests/e2e/metrics.mjs
import { createRequire } from 'node:module';
const require = createRequire(new URL('../../package.json', import.meta.url));
const pg = require('pg');
const API = 'http://127.0.0.1:4011';
const db = new pg.Client({ connectionString: 'postgresql://nx@127.0.0.1:5544/nxd' }); await db.connect();
const out = []; const T = (n, ok, d = '') => out.push((ok ? 'PASS ' : 'FAIL ') + n + (d ? ' — ' + d : ''));
let jar = '', csrf = '';
const call = async (m, p, b) => { const r = await fetch(API + p, { method: m, headers: { 'content-type': 'application/json', ...(jar ? { cookie: jar } : {}), ...(m !== 'GET' && csrf ? { 'x-csrf-token': csrf } : {}) }, body: b ? JSON.stringify(b) : undefined }); const sc = r.headers.getSetCookie?.() ?? []; if (sc.length) { const kv = Object.fromEntries(jar.split('; ').filter(Boolean).map((x) => x.split(/=(.*)/s).slice(0, 2))); for (const c of sc) { const [k, v] = c.split(';')[0].split(/=(.*)/s); kv[k] = v; } jar = Object.entries(kv).map(([k, v]) => `${k}=${v}`).join('; '); csrf = decodeURIComponent(kv.nx_csrf || ''); } let j = null; try { j = await r.json(); } catch {} return { s: r.status, j }; };

// a clean seller so other data cannot disturb the expected figures
const email = `metrics${Date.now()}@example.com`;
let r = await call('POST', '/v1/auth/signup', { fullName: 'Metrics Tester', email, password: 'Str0ng-Passw0rd!x', businessName: 'Metrics Test Co', legalName: 'Metrics Test Co', phone: '9876543210' });
if (r.s >= 300) { out.push('signup failed ' + r.s + ' ' + JSON.stringify(r.j)); console.log(out.join('\n')); process.exit(1); }
await call('POST', '/v1/seller/agreement', {});
const sellerId = (await db.query('SELECT s.id FROM sellers s JOIN seller_memberships m ON m.seller_id = s.id JOIN users u ON u.id = m.user_id WHERE u.email = $1', [email])).rows[0].id;
const wh = await call('POST', '/v1/warehouses', { name: 'Main', warehouseType: 'primary', contactName: 'Owner', phone: '9876543210', addressLine1: '5 Test Lane', city: 'Mumbai', state: 'Maharashtra', pincode: '400001' });
const mk = async (n) => (await call('POST', '/v1/orders', { warehouseId: wh.j.id, orderNumber: 'MT' + n, paymentMode: n === 'C' ? 'cod' : 'prepaid', codAmountPaise: n === 'C' ? 100000 : 0, customer: { fullName: 'Buyer ' + n, phone: '9876543210', addressLine1: '12 Road', city: 'Mumbai', state: 'Maharashtra', pincode: '400002' }, items: [{ sku: 'S', name: 'Item', quantity: 1, unitPricePaise: n === 'C' ? 100000 : 50000, weightG: 300 }], package: { weightG: 300, lengthMm: 100, widthMm: 100, heightMm: 100 } })).j.id;
const prov = (await db.query("SELECT cp.id AS pid, cs.id AS sid FROM courier_providers cp JOIN courier_services cs ON cs.provider_id = cp.id WHERE cp.code = 'delhivery' LIMIT 1")).rows[0];
let seq = 0;
const ship = async (orderN, state, o = {}) => {
  const orderId = await mk(orderN); seq += 1;
  const booked = o.booked ?? `now() - interval '5 days'`;
  const created = o.created ?? booked;
  const res = await db.query(`INSERT INTO shipments (seller_id,order_id,provider_id,service_id,awb,chargeable_weight_g,shipping_charge_paise,quote_snapshot,idempotency_key,destination_pincode,destination_city,state,booked_at,created_at,delivered_at,rto_initiated_at,courier_cancelled_at,pickup_deadline_at)
     VALUES ($1,$2,$3,$4,$5,500,10000,'{}',$6,'400002','Mumbai',$7::shipment_state,${booked},${created},${o.delivered ?? 'NULL'},${o.rto ?? 'NULL'},${o.cc ? 'now()' : 'NULL'},${o.deadline ?? `${booked} + interval '24 hours'`}) RETURNING id`,
     [sellerId, orderId, prov.pid, prov.sid, 'MT' + Date.now().toString().slice(-7) + String(seq).padStart(2, '0'), 'mt-key-' + seq + '-' + Date.now() + '-padding-padding', state]);
  return { id: res.rows[0].id, orderId };
};
const A = await ship('A', 'delivered', { booked: `now() - interval '3 days'`, delivered: `now() - interval '1 day'` });
await ship('B', 'delivered', { booked: `now() - interval '4 days'`, delivered: `now() - interval '2 days'` });
const C = await ship('C', 'rto', { booked: `now() - interval '5 days'`, rto: `now() - interval '1 day'` });
await ship('D', 'lost');
const E = await ship('E', 'cancelled'); await db.query("UPDATE orders SET state = 'cancelled' WHERE id = $1", [E.orderId]);
await ship('F', 'in_transit'); await ship('G', 'out_for_delivery');
const H = await ship('H', 'ndr'); await db.query("INSERT INTO ndr_cases (seller_id,shipment_id,reason_code,reason_detail,ndr_reason,courier_notes) VALUES ($1,$2,'courier_ndr','Customer not available','customer_unavailable','x')", [sellerId, H.id]);
await ship('I', 'booked', { booked: `now() - interval '2 hours'` });
await ship('J', 'booked', { booked: `now() - interval '30 hours'` });
await ship('K', 'booked', { booked: `now() - interval '30 hours'`, cc: true });
await mk('L'); // an order still waiting for a courier
await db.query("INSERT INTO wallet_entries (seller_id,entry_type,amount_paise,reference_type,reference_id,idempotency_key,description) VALUES ($1,'debit',5000,'shipment_rto',$2,$3,'RTO charge')", [sellerId, C.id, 'rto-test-' + Date.now()]);
// India day boundary: 00:01 IST on 10 Jan 2026 is inside that day, 23:59 IST on 9 Jan is not.
await ship('M', 'delivered', { booked: `timestamptz '2026-01-10 00:01:00+05:30'`, delivered: `timestamptz '2026-01-10 00:01:00+05:30'` });
await ship('N', 'delivered', { booked: `timestamptz '2026-01-09 23:59:00+05:30'`, delivered: `timestamptz '2026-01-09 23:59:00+05:30'` });

r = await call('GET', '/v1/analytics/dashboard?days=365');
const m = r.j?.metrics; const pl = r.j?.pipeline; const q = r.j?.queue;
// the window is 365 days so M and N (Jan 2026) may or may not fall in: compare relative to the base set using explicit dates for the base rows
const today = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
const from = new Date(Date.now() + 5.5 * 3600e3 - 6 * 864e5).toISOString().slice(0, 10);
r = await call('GET', `/v1/analytics/dashboard?from=${from}&to=${today}`);
const d = r.j;
T('Dashboard answers', r.s === 200 && !!d.metrics, String(r.s));
T('Shipped parcels exclude the cancelled one', d.metrics.shipped === 10, 'shipped ' + d.metrics.shipped);
T('Delivery rate = delivered / finished (2 of 4 = 50%)', d.metrics.deliveryRate === 50, String(d.metrics.deliveryRate));
T('RTO rate = returned / finished (1 of 4 = 25%)', d.metrics.rtoRate === 25, String(d.metrics.rtoRate));
T('NDR rate = parcels with an NDR / shipped (1 of 10 = 10%)', d.metrics.ndrRate === 10, String(d.metrics.ndrRate));
T('In transit right now = in transit + out for delivery (2)', d.metrics.inTransit === 2, String(d.metrics.inTransit));
T('Pickup pending excludes the courier-cancelled parcel (2)', d.pipeline.pickup_pending === 2 && d.queue.pickup.pending === 2, `${d.pipeline.pickup_pending}/${d.queue.pickup.pending}`);
T('Pickup missed = only the one booked 30 h ago (1)', d.queue.pickup.missed === 1, String(d.queue.pickup.missed));
T('Ready to ship = orders still without a courier (1)', d.pipeline.ready_to_ship === 1, String(d.pipeline.ready_to_ship));
T('Pipeline cancelled = 1, lost = 1, rto = 1, delivered = 2', d.pipeline.cancelled === 1 && d.pipeline.lost === 1 && d.pipeline.rto === 1 && d.pipeline.delivered === 2, JSON.stringify(d.pipeline));
T('Average delivery days is a real number (about 2)', typeof d.metrics.avgDeliveryDays === 'number' && d.metrics.avgDeliveryDays > 1 && d.metrics.avgDeliveryDays < 3, String(d.metrics.avgDeliveryDays));
T('Return freight is read from the wallet (₹50)', d.rto.returnFreightPaise === 5000, String(d.rto.returnFreightPaise));
T('Upcoming COD card is gone from the API', !('upcomingPaise' in d.queue.cod) && 'pendingPaise' in d.queue.cod, Object.keys(d.queue.cod).join(','));
T('Order volume excludes the cancelled order (14 orders, 1 cancelled = 13)', d.metrics.orderVolume === 13, String(d.metrics.orderVolume));

// IST day boundary
r = await call('GET', '/v1/analytics/dashboard?from=2026-01-10&to=2026-01-10');
T('Day boundary: 00:01 IST on 10 Jan is counted, 23:59 IST on 9 Jan is not', r.j.metrics.shipped === 1 && r.j.pipeline.delivered === 1, 'shipped ' + r.j.metrics.shipped);
r = await call('GET', '/v1/analytics/dashboard?from=2026-01-09&to=2026-01-09');
T('Day boundary: 9 Jan shows only the 23:59 parcel', r.j.metrics.shipped === 1, 'shipped ' + r.j.metrics.shipped);
// no data window gives null rates, not fake zeros
r = await call('GET', '/v1/analytics/dashboard?from=2020-01-01&to=2020-01-02');
T('Empty window: rates are null (shown as a dash), not 0%', r.j.metrics.deliveryRate === null && r.j.metrics.rtoRate === null && r.j.metrics.ndrRate === null, JSON.stringify([r.j.metrics.deliveryRate, r.j.metrics.rtoRate]));

// RTO and NDR pages use the same definitions
r = await call('GET', `/v1/rto/stats?from=${from}&to=${today}`);
T('RTO page: 1 returned, rate 25% (same definition as the dashboard)', r.j.total === 1 && r.j.rtoRatePct === 25, JSON.stringify([r.j.total, r.j.rtoRatePct]));
T('RTO page: forward ₹100 + return ₹50 = ₹150 paid for the returned parcel', r.j.forwardFreightPaise === 10000 && r.j.returnFreightPaise === 5000 && r.j.freightOnRtoPaise === 15000, JSON.stringify([r.j.forwardFreightPaise, r.j.returnFreightPaise]));
r = await call('GET', `/v1/ndr/stats?from=${from}&to=${today}`);
T('NDR page: 1 case and the same 10% NDR rate as the dashboard', r.j.total === 1 && r.j.shareOfShipmentsPct === 10, JSON.stringify([r.j.total, r.j.shareOfShipmentsPct]));
r = await call('GET', '/v1/ndr/stats?from=2020-01-01&to=2020-01-02');
T('NDR page: empty period gives 0 cases and a null rate', r.j.total === 0 && r.j.shareOfShipmentsPct === null, JSON.stringify([r.j.total, r.j.shareOfShipmentsPct]));

// admin side (dev admin: password then the code)
let a = await call('POST', '/v1/admin/auth/login', { email: 'admin@nexgo.in', password: 'Admin@456' });
if (a.j?.requiresEmailOtp) {
  const code = a.j.devCode || (await (async () => { const rs = await call('POST', '/v1/admin/auth/resend-otp', { otpToken: a.j.otpToken }); return rs.j.devCode; })());
  const v = await call('POST', '/v1/admin/auth/verify-otp', { otpToken: a.j.otpToken, code });
  T('Admin signs in with the code', v.s === 200, String(v.s));
  const ap = await call('GET', '/v1/admin/pickups?page=1&pageSize=1000');
  const mine = ap.j.items.filter((x) => x.seller_id === sellerId);
  T('Admin pickups: this seller shows 2 pending, 1 missed, same as the seller dashboard', mine.length === 2 && mine.filter((x) => x.overdue).length === 1, `${mine.length}/${mine.filter((x) => x.overdue).length}`);
  T('Admin pickups: exact totals and filter lists', ap.j.summary.total >= 2 && ap.j.total === ap.j.summary.total && Array.isArray(ap.j.filters.sellers), JSON.stringify(ap.j.summary));
  const ms = await call('GET', `/v1/admin/pickups?sellerId=${sellerId}&age=missed`);
  T('Admin pickups: missed tab lists only the overdue parcel', ms.j.items.length === 1, String(ms.j.items.length));
  const ad = await call('GET', `/v1/admin/analytics/dashboard?days=${20 + Math.floor(Math.random() * 300)}`);
  const grouped = {}; for (const x of ap.j.items) grouped[x.seller_id] = (grouped[x.seller_id] || 0) + 1; const topCount = Math.max(...Object.values(grouped)); const row = { count: ad.j.pickupPending.sellers[0]?.count, overdue: 1 };
  T('Admin overview: seller-wise list leads with the seller that has the most pending pickups', row.count === topCount && ad.j.pickupPending.sellers.length <= 10, JSON.stringify([row.count, topCount]));
  T('Admin overview: pickup total equals Admin Pickups total', ad.j.pickupPending.total === ap.j.summary.total, `${ad.j.pickupPending.total}/${ap.j.summary.total}`);
}
console.log(out.join('\n'));
await db.end();
