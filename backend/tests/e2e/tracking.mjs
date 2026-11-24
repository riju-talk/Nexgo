// End-to-end check of tracking state sync with real webhook calls (API on :4011 started with LORRIGO_API_KEY=testkey LORRIGO_BASE_URL=http://127.0.0.1:4555
// LORRIGO_WEBHOOK_TOKEN=hooktoken-hooktoken-1234 TRACKING_POLL_MINUTES=0 and DATABASE_URL pointing at the throwaway Postgres on :5544).
// Covers: a parcel the courier reports as NDR must not stay "in transit" when a later scan arrives (the stuck-parcel bug), a reattempt the seller asked
// for is not undone by the courier's stale NDR status, a new NDR after that answer is attempt 2, the reason is never replaced by the bare word "NDR".
// Run: node tests/e2e/tracking.mjs
import { createRequire } from 'node:module';
const require = createRequire(new URL('../../package.json', import.meta.url));
const pg = require('pg');
const API = 'http://127.0.0.1:4011';
const HOOK = 'hooktoken-hooktoken-1234';
const db = new pg.Client({ connectionString: 'postgresql://nx@127.0.0.1:5544/nxd' }); await db.connect();
const out = []; const T = (n, ok, d = '') => out.push((ok ? 'PASS ' : 'FAIL ') + n + (d ? ' — ' + d : ''));

const newClient = () => { let jar = '', csrf = ''; return async (m, p, b) => { const r = await fetch(API + p, { method: m, headers: { 'content-type': 'application/json', ...(jar ? { cookie: jar } : {}), ...(m !== 'GET' && csrf ? { 'x-csrf-token': csrf } : {}) }, body: b ? JSON.stringify(b) : undefined }); const sc = r.headers.getSetCookie?.() ?? []; if (sc.length) { const kv = Object.fromEntries(jar.split('; ').filter(Boolean).map((x) => x.split(/=(.*)/s).slice(0, 2))); for (const c of sc) { const [k, v] = c.split(';')[0].split(/=(.*)/s); kv[k] = v; } jar = Object.entries(kv).map(([k, v]) => `${k}=${v}`).join('; '); csrf = decodeURIComponent(kv.nx_csrf || ''); } let j = null; try { j = await r.json(); } catch {} return { s: r.status, j }; }; };
const call = newClient();
const email = `track${Date.now()}@example.com`;
await call('POST', '/v1/auth/signup', { fullName: 'Track Tester', email, password: 'Str0ng-Passw0rd!x', businessName: 'Track Co', legalName: 'Track Co', phone: '9876543210' });
await call('POST', '/v1/seller/agreement', {});
const sellerId = (await db.query('SELECT s.id FROM sellers s JOIN seller_memberships m ON m.seller_id = s.id JOIN users u ON u.id = m.user_id WHERE u.email = $1', [email])).rows[0].id;
const wh = await call('POST', '/v1/warehouses', { name: 'Main', warehouseType: 'primary', contactName: 'Owner', phone: '9876543210', addressLine1: '5 Test Lane', city: 'Mumbai', state: 'Maharashtra', pincode: '400001' });
const mk = async (n) => (await call('POST', '/v1/orders', { warehouseId: wh.j.id, orderNumber: 'TR' + n, paymentMode: 'cod', codAmountPaise: 89900, customer: { fullName: 'Buyer ' + n, phone: '9876543210', addressLine1: '12 Road', city: 'Mumbai', state: 'Maharashtra', pincode: '400002' }, items: [{ sku: 'S', name: 'Item', quantity: 1, unitPricePaise: 89900, weightG: 300 }], package: { weightG: 300, lengthMm: 100, widthMm: 100, heightMm: 100 } })).j.id;
await db.query("UPDATE courier_providers SET aggregator = 'lorrigo' WHERE code = 'delhivery' AND aggregator IS NULL");
const prov = (await db.query("SELECT cp.id AS pid, cs.id AS sid FROM courier_providers cp JOIN courier_services cs ON cs.provider_id = cp.id WHERE cp.aggregator = 'lorrigo' LIMIT 1")).rows[0];
const stamp = Date.now().toString().slice(-6);
const ship = async (tag) => {
  const orderId = await mk(tag); const awb = 'TK' + stamp + tag;
  const sh = await db.query(`INSERT INTO shipments (seller_id,order_id,provider_id,service_id,awb,provider_shipment_id,chargeable_weight_g,shipping_charge_paise,quote_snapshot,idempotency_key,destination_pincode,destination_city,state,booked_at)
    VALUES ($1,$2,$3,$4,$5,$6,500,10000,'{}',$7,'400002','Mumbai','booked',now()) RETURNING id`, [sellerId, orderId, prov.pid, prov.sid, awb, 'ps-' + tag, 'tk-key-' + stamp + tag + '-padding-padding']);
  await db.query("UPDATE orders SET state = 'booked' WHERE id = $1", [orderId]);
  return { id: sh.rows[0].id, awb };
};
const hook = (awb, status, events) => fetch(API + '/v1/webhooks/aggregators/lorrigo', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': HOOK }, body: JSON.stringify({ awb, status, tracking_events: events }) }).then((r) => r.status);
const when = (mins) => new Date(Date.now() - mins * 60000).toISOString();
const state = async (id) => (await db.query('SELECT state::text AS s FROM shipments WHERE id = $1', [id])).rows[0].s;
const ndrCase = async (id) => (await db.query('SELECT state::text AS s, attempt_number AS a, reason_detail AS r, ndr_reason::text AS reason FROM ndr_cases WHERE shipment_id = $1', [id])).rows[0];

// 1. The stuck parcel: NDR first, then a hub scan, the courier's overall status is still NDR
const A = await ship('A');
const PICK = { status: 'PICKED_UP', timestamp: when(600), location: 'Mumbai' };
const NDR1 = { status: 'NDR', timestamp: when(300), location: 'Pune', description: 'Customer not available' };
T('webhook 1 accepted', (await hook(A.awb, 'NDR', [PICK, NDR1])) === 200);
T('first NDR: state ndr, case open, attempt 1', (await state(A.id)) === 'ndr' && (await ndrCase(A.id))?.a === 1);
const HUB = { status: 'IN_TRANSIT', timestamp: when(200), location: 'Pune hub' };
T('webhook 2 (a later hub scan, overall status still NDR) accepted', (await hook(A.awb, 'NDR', [PICK, NDR1, HUB])) === 200);
let c = await ndrCase(A.id);
T('STUCK-PARCEL FIX: the parcel is back in NDR, not "in transit"', (await state(A.id)) === 'ndr', await state(A.id));
T('...with the same case, attempt 1 (no false attempt) and the real reason', c.a === 1 && c.s === 'open' && /not available/i.test(c.r) && c.reason === 'customer_unavailable', JSON.stringify(c));
await hook(A.awb, 'NDR', [PICK, NDR1, HUB]);
T('an identical webhook again changes nothing', (await state(A.id)) === 'ndr' && (await ndrCase(A.id)).a === 1);

// 2. Start from the broken state it used to reach: in_transit + open case, then the courier status arrives (what the poll sees)
const B = await ship('B');
await hook(B.awb, 'NDR', [PICK, { ...NDR1, timestamp: when(300) }]);
await db.query("UPDATE shipments SET state = 'in_transit' WHERE id = $1", [B.id]); // as the old code left it
await hook(B.awb, 'NDR', [PICK, { ...NDR1, timestamp: when(300) }, { status: 'IN_TRANSIT', timestamp: when(100) }]);
T('a parcel already stuck in transit with an open case is repaired by the next update', (await state(B.id)) === 'ndr');

// 3. The seller asked for a reattempt: the courier still says NDR (it has not acted yet): the parcel stays "in transit", no false attempt 2
const C = await ship('C');
const NDRC = { status: 'NDR', timestamp: when(300), description: 'Customer not available' };
await hook(C.awb, 'NDR', [PICK, NDRC]);
await db.query("UPDATE ndr_cases SET state = 'reattempt_requested', resolved_at = now(), updated_at = now() WHERE shipment_id = $1", [C.id]);
await db.query("UPDATE shipments SET state = 'in_transit' WHERE id = $1", [C.id]); // what answering an NDR does
await hook(C.awb, 'NDR', [PICK, NDRC, { status: 'IN_TRANSIT', timestamp: when(100) }]);
c = await ndrCase(C.id);
T('seller reattempt is not undone by the stale NDR status (state stays in_transit)', (await state(C.id)) === 'in_transit', await state(C.id));
T('...and the case stays "reattempt_requested" at attempt 1', c.s === 'reattempt_requested' && c.a === 1, JSON.stringify(c));
// then the courier fails again, a NEW NDR scan after the seller's answer: attempt 2
const NDR2 = { status: 'NDR', timestamp: new Date(Date.now() + 120000).toISOString(), description: 'Customer refused to accept the parcel' };
await hook(C.awb, 'NDR', [PICK, NDRC, { status: 'IN_TRANSIT', timestamp: when(100) }, NDR2]);
c = await ndrCase(C.id);
T('a new NDR scan after the answer is attempt 2, case open, state ndr', (await state(C.id)) === 'ndr' && c.a === 2 && c.s === 'open', JSON.stringify(c));
T('...with the new reason (refused)', c.reason === 'refused_delivery', c.reason);

// 4. A parcel that moved on to RTO / delivered is never pulled back to NDR by a stale NDR overall status
const D = await ship('D');
await hook(D.awb, 'RTO_INITIATED', [PICK, NDRC, { status: 'RTO_INITIATED', timestamp: when(100) }]);
await hook(D.awb, 'NDR', [PICK, NDRC, { status: 'RTO_INITIATED', timestamp: when(100) }]);
T('an RTO parcel is not dragged back to NDR', (await state(D.id)) === 'rto', await state(D.id));
const E = await ship('E');
await hook(E.awb, 'DELIVERED', [PICK, NDRC, { status: 'DELIVERED', timestamp: when(50) }]);
await hook(E.awb, 'NDR', [PICK, NDRC, { status: 'DELIVERED', timestamp: when(50) }]);
T('a delivered parcel stays delivered', (await state(E.id)) === 'delivered', await state(E.id));

// 5. The courier says NDR: answering it in NEXGO must NOT make the parcel look "in transit" (the courier still shows NDR)
const F = await ship('F');
const NDRF = { status: 'NDR', timestamp: when(300), description: 'Customer not available' };
await hook(F.awb, 'NDR', [PICK, NDRF]);
const caseF = (await db.query('SELECT id FROM ndr_cases WHERE shipment_id = $1', [F.id])).rows[0].id;
const ans = await call('POST', `/v1/ndr/cases/${caseF}/resolve`, { resolutionAction: 'reattempt', resolutionNotes: 'please retry' });
T('The seller answers the NDR (reattempt)', ans.s === 200 || ans.s === 201, String(ans.s));
T('...the parcel STAYS in NDR, as the courier shows it (it used to flip to in transit)', (await state(F.id)) === 'ndr', await state(F.id));
c = await ndrCase(F.id);
T('...and the case is "reattempt_requested" at attempt 1 (the NDR board shows "Action requested")', c.s === 'reattempt_requested' && c.a === 1, JSON.stringify(c));
await hook(F.awb, 'NDR', [PICK, NDRF]);
T('The courier repeating the same status changes nothing', (await state(F.id)) === 'ndr' && (await ndrCase(F.id)).a === 1);
const NDRF2 = { status: 'NDR', timestamp: new Date(Date.now() + 180000).toISOString(), description: 'Customer refused to accept the parcel' };
await hook(F.awb, 'NDR', [PICK, NDRF, NDRF2]);
c = await ndrCase(F.id);
T('A NEW failed attempt after the seller\'s answer is attempt 2: the case reopens, the parcel stays NDR', (await state(F.id)) === 'ndr' && c.a === 2 && c.s === 'open' && c.reason === 'refused_delivery', JSON.stringify(c));
await hook(F.awb, 'OUT_FOR_DELIVERY', [PICK, NDRF, NDRF2, { status: 'OUT_FOR_DELIVERY', timestamp: new Date(Date.now() + 360000).toISOString() }]);
T('When the courier moves on (out for delivery) the parcel moves with it', (await state(F.id)) === 'out_for_delivery', await state(F.id));

// 6. Parcels the OLD code forced to "in transit" after an NDR answer are put back (the data repair in migration 0074)
const G = await ship('G');
await hook(G.awb, 'NDR', [PICK, { status: 'NDR', timestamp: when(300), description: 'Consignee Unavailable' }]);
await db.query("UPDATE ndr_cases SET state = 'reattempt_requested', resolved_at = now(), updated_at = now() WHERE shipment_id = $1", [G.id]);
await db.query("UPDATE shipments SET state = 'in_transit' WHERE id = $1", [G.id]);
await db.query("INSERT INTO shipment_events (shipment_id,state,occurred_at,description,source) VALUES ($1,'in_transit',now(),'Seller requested reattempt','manual')", [G.id]);
const repairSql = (await import('node:fs')).readFileSync(new URL('../../src/db/migrations/0074_courier_status_and_ndr_state.sql', import.meta.url), 'utf8').split('\n').filter((l) => !l.startsWith('--') && !/^ALTER TABLE/.test(l)).join('\n');
await db.query(repairSql);
T('Migration 0074 puts a parcel the old code forced to "in transit" (newest event = the seller\'s own answer) back to NDR', (await state(G.id)) === 'ndr', await state(G.id));
const H = await ship('H');
await hook(H.awb, 'IN_TRANSIT', [PICK, { status: 'IN_TRANSIT', timestamp: when(200) }]);
await db.query(repairSql);
T('...and leaves a normal in-transit parcel alone', (await state(H.id)) === 'in_transit', await state(H.id));

// 7. What the courier itself says (status + reason) is kept and shown, e.g. a failed pickup attempt
const I = await ship('I');
await hook(I.awb, 'PICKUP_EXCEPTION', [{ status: 'PICKUP_EXCEPTION', timestamp: when(30), description: 'Manifested - Shipper unavailable' }]);
const csRow = (await db.query('SELECT state::text AS s, courier_status AS cs, courier_status_note AS note FROM shipments WHERE id = $1', [I.id])).rows[0];
T('A pickup exception is recorded as the courier\'s own status with its reason, while the parcel stays waiting for pickup', csRow.s === 'booked' && csRow.cs === 'PICKUP_EXCEPTION' && /Shipper unavailable/.test(csRow.note || ''), JSON.stringify(csRow));
const nn = (await call('GET', '/v1/notifications?pageSize=50')).j.items.filter((n) => /Pickup attempt failed/.test(n.title));
T('...and the seller is told once: "Pickup attempt failed"', nn.length === 1 && nn[0].body.includes(I.awb), JSON.stringify(nn.map((n) => n.title)));
await hook(I.awb, 'PICKUP_EXCEPTION', [{ status: 'PICKUP_EXCEPTION', timestamp: when(30), description: 'Manifested - Shipper unavailable' }]);
T('...the same news again does not notify twice', (await call('GET', '/v1/notifications?pageSize=50')).j.items.filter((n) => /Pickup attempt failed/.test(n.title)).length === 1);
const listRow = (await call('GET', '/v1/shipments/list?tab=pickup&limit=50')).j.items.find((r) => r.awb === I.awb);
T('Track\'s list carries the courier status and reason for that parcel', listRow && listRow.courier_status === 'PICKUP_EXCEPTION' && /Shipper unavailable/.test(listRow.courier_status_note || ''), JSON.stringify(listRow && { cs: listRow.courier_status }));


// 5. Track shows the counts the board shows
const cnt = (await call('GET', '/v1/shipments/summary')).j?.counts ?? {};
T('Track tab counts match what was done: 4 NDR (A, B, C, G), 1 in transit (H), 1 out for delivery (F), 1 RTO, 1 delivered, 1 waiting for pickup (I)', cnt.ndr === 4 && cnt.in_transit === 1 && cnt.out_for_delivery === 1 && cnt.rto === 1 && cnt.delivered === 1 && cnt.pickup === 1, JSON.stringify(cnt));

console.log(out.join('\n'));
console.log(out.filter((l) => l.startsWith('FAIL')).length ? 'SOME FAILED' : 'ALL PASSED');
await db.end(); process.exit(0);
