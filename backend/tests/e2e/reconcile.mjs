// BOOK-001 (P0): the courier accepts a booking but NEXGO does not know it (answer lost, our database failed, the process died). Required, whatever the seller does next:
// never two courier bookings, never a shipment under the wrong courier or price, exactly one debit, and the booking is recorded BY ITSELF once the facts are known.
// Run through tests/support/runE2e.mjs (it sets RECONCILE_AFTER_SECONDS / BOOKING_STALE_SECONDS low).
import { createRequire } from 'node:module';
import { startFakeAggregator } from '../support/fakeAggregator.mjs';
const require = createRequire(new URL('../../package.json', import.meta.url));
const pg = require('pg');
const API = 'http://127.0.0.1:4011';
const db = new pg.Client({ connectionString: (process.env.E2E_DATABASE_URL || 'postgresql://nx@127.0.0.1:5544/nxd') }); await db.connect();
const out = []; const T = (n, ok, d = '') => { out.push((ok ? 'PASS ' : 'FAIL ') + n + (d ? ' - ' + d : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const one = async (sql, args) => (await db.query(sql, args)).rows[0];

const svcs = (await db.query("SELECT cs.id, cs.code, cs.external_service_id AS ext, cp.code AS pcode, cp.name FROM courier_services cs JOIN courier_providers cp ON cp.id = cs.provider_id WHERE cp.aggregator = 'lorrigo' AND cs.is_active ORDER BY cs.code LIMIT 2")).rows;
const [A, B] = svcs;
await db.query("UPDATE courier_providers SET integration_state='live' WHERE code = ANY($1)", [[A.pcode, B.pcode]]);
const fake = startFakeAggregator({ port: 4555, latencyMs: 40, courierIds: [A.ext, B.ext] });

let jar = ''; let csrf = '';
const call = async (m, p, b, extra = {}) => {
  const r = await fetch(API + p, { method: m, headers: { 'content-type': 'application/json', ...(jar ? { cookie: jar } : {}), ...(m !== 'GET' && csrf ? { 'x-csrf-token': csrf } : {}), ...extra }, body: b ? JSON.stringify(b) : undefined });
  const sc = r.headers.getSetCookie?.() ?? [];
  if (sc.length) { const kv = Object.fromEntries(jar.split('; ').filter(Boolean).map((x) => x.split(/=(.*)/s).slice(0, 2))); for (const c of sc) { const [k, v] = c.split(';')[0].split(/=(.*)/s); kv[k] = v; } jar = Object.entries(kv).map(([k, v]) => `${k}=${v}`).join('; '); csrf = decodeURIComponent(kv.nx_csrf || ''); }
  let j = null; try { j = await r.json(); } catch { /* empty */ } return { s: r.status, j };
};
const email = `rec${Date.now()}@example.com`;
await call('POST', '/v1/auth/signup', { fullName: 'Rec Tester', email, password: 'Str0ng-Passw0rd!x', businessName: 'Rec Co', legalName: 'Rec Co', phone: '9876543210' });
await call('POST', '/v1/seller/agreement', {});
const sellerId = (await one('SELECT s.id FROM sellers s JOIN seller_memberships m ON m.seller_id = s.id JOIN users u ON u.id = m.user_id WHERE u.email = $1', [email])).id;
const wh = await call('POST', '/v1/warehouses', { name: 'Main', warehouseType: 'primary', contactName: 'Owner', phone: '9876543210', addressLine1: '5 Test Lane', city: 'Mumbai', state: 'Maharashtra', pincode: '400001' });
const card = (await one(`INSERT INTO rate_cards (seller_id, name, state) VALUES ($1,'Rec test','active') RETURNING id`, [sellerId])).id;
for (const [s, price] of [[A, 5000], [B, 9000]]) { // different prices, so a booking recorded under the wrong courier shows in the money
  await db.query(`INSERT INTO seller_courier_access (seller_id, service_id, account_mode, state, cod_enabled, auto_assign_eligible) VALUES ($1,$2,'platform','enabled',true,true)`, [sellerId, s.id]);
  await db.query(`INSERT INTO rate_card_rates (rate_card_id, service_id, zone_code, min_weight_g, base_weight_g, base_price_paise, additional_weight_g, additional_price_paise) VALUES ($1,$2,'national',0,500,$3,500,0)`, [card, s.id, price]);
}
const fund = (paise) => db.query("INSERT INTO wallet_entries (seller_id,entry_type,amount_paise,reference_type,reference_id,idempotency_key,description) VALUES ($1,$2,$3,'wallet_recharge','seed',$4,'seed')", [sellerId, paise > 0 ? 'credit' : 'debit', Math.abs(paise), 'rec-' + Math.random()]);
await fund(5000000);
const stamp = Date.now().toString().slice(-6); let seq = 0;
const newOrder = async () => {
  const i = ++seq;
  const r = await call('POST', '/v1/orders', { warehouseId: wh.j.id, orderNumber: `RC${stamp}${i}`, paymentMode: 'prepaid', customer: { fullName: 'Buyer Name' + i, phone: `96${String(10000000 + i * 13)}`, addressLine1: '12 Road', city: 'Mumbai', state: 'Maharashtra', pincode: '400002' }, items: [{ sku: 'S', name: 'Item', quantity: 1, unitPricePaise: 50000, weightG: 300 }], package: { weightG: 300, lengthMm: 100, widthMm: 100, heightMm: 100 } });
  await call('PATCH', `/v1/orders/${r.j.id}/state`, { state: 'ready_to_ship' });
  return r.j.id;
};
const key = () => ({ 'Idempotency-Key': `rec-${Date.now()}-${Math.random().toString(36).slice(2, 12)}` });
const book = (id, s, extra = key()) => call('POST', '/v1/shipments/book', { orderId: id, providerCode: s.pcode, serviceCode: s.code }, extra);
const facts = async (id) => {
  const ship = (await db.query(`SELECT s.awb, cs.code, s.shipping_charge_paise::int AS charge, s.state::text FROM shipments s JOIN courier_services cs ON cs.id = s.service_id WHERE s.order_id = $1`, [id])).rows;
  const debits = (await db.query("SELECT w.amount_paise::int AS a FROM wallet_entries w JOIN shipments s ON s.id::text = w.reference_id WHERE s.order_id = $1 AND w.entry_type = 'debit' AND w.reference_type = 'shipment'", [id])).rows.map((x) => x.a);
  return { n: ship.length, awb: ship[0]?.awb, code: ship[0]?.code, charge: ship[0]?.charge, debits, order: (await one('SELECT state::text AS s FROM orders WHERE id = $1', [id])).s };
};
const until = async (fn, ms = 30000) => { const end = Date.now() + ms; for (;;) { const v = await fn(); if (v || Date.now() > end) return v; await sleep(400); } };
const atCourier = async (id) => { const n = (await one('SELECT nexgo_order_id AS n FROM orders WHERE id = $1', [id])).n; return [...fake.orders.values()].filter((o) => o.ref.startsWith(n)); };
const liveAtCourier = async (id) => (await atCourier(id)).filter((o) => o.shipment && !o.cancelled);
const good = (f, s, price, awb) => f.n === 1 && f.code === s.code && f.charge === price && f.debits.length === 1 && f.debits[0] === price && f.awb === awb && f.order === 'booked';
const BLOCK = 'CREATE TRIGGER e2e_block BEFORE INSERT ON shipments FOR EACH ROW EXECUTE FUNCTION e2e_block()';
await db.query(`CREATE OR REPLACE FUNCTION e2e_block() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'injected database failure'; END $$ LANGUAGE plpgsql`);

// 1. the answer is lost and the courier's records cannot be read: UNKNOWN, not failed. The seller then picks ANOTHER courier.
let id = await newOrder(); fake.mode.loseAnswer = true; fake.mode.readsDown = true;
let r = await book(id, A); let f = await facts(id);
T('1. Lost answer: the seller is not told it is booked, nothing is charged yet', r.s >= 400 && f.n === 0 && f.debits.length === 0, `${r.s} ${r.j?.code ?? ''}`);
fake.mode.loseAnswer = false; fake.mode.readsDown = true;
r = await book(id, B); f = await facts(id);
T('1. Picking ANOTHER courier while the first is unconfirmed is refused with a clear message (no second booking)', r.s === 409 && f.n === 0 && (await liveAtCourier(id)).length === 1, `${r.s} ${r.j?.code} ${String(r.j?.error).slice(0, 90)} shipments=${f.n} code=${f.code}`);
r = await call('PATCH', `/v1/orders/${id}/state`, { state: 'cancelled' });
T('1. The order cannot be cancelled while a courier may hold it', r.s === 409 && (await facts(id)).order !== 'cancelled', `${r.s} ${r.j?.code}`);
r = await call('PATCH', `/v1/orders/${id}/details`, { customer: { fullName: 'Other', phone: '9811111111', addressLine1: '1 Elsewhere', city: 'Mumbai', state: 'Maharashtra', pincode: '400003' }, paymentMode: 'prepaid', codAmountPaise: 0, package: { weightG: 900, lengthMm: 100, widthMm: 100, heightMm: 100 } });
T('1. ...nor edited (the courier already has the old details)', r.s === 409, `${r.s} ${r.j?.code}`);
fake.mode.readsDown = false;
const held = (await liveAtCourier(id))[0];
f = await until(async () => { const x = await facts(id); return x.n ? x : null; }) || await facts(id);
T('1. When the courier can be asked again the booking is recorded BY ITSELF: courier A, its price, one debit, the courier\'s own AWB', good(f, A, 5000, held?.shipment?.awb), JSON.stringify(f));
T('1. The courier holds exactly one live parcel for the order and was never asked to ship it twice', (await liveAtCourier(id)).length === 1 && fake.stats.repeatShips === 0, `live=${(await liveAtCourier(id)).length} repeats=${fake.stats.repeatShips}`);

// 2. the courier booked, then OUR database refused the write
id = await newOrder(); await db.query(BLOCK);
const ships0 = fake.stats.calls['POST /shipments'] || 0;
r = await book(id, A); f = await facts(id);
T('2. Our database fails after the courier booked: an error, no shipment, no debit, no false success', r.s >= 400 && f.n === 0 && f.debits.length === 0, `${r.s}`);
r = await book(id, B);
T('2. Another courier cannot be booked meanwhile', r.s === 409 && (await liveAtCourier(id)).length === 1, `${r.s} ${r.j?.code}`);
await db.query('DROP TRIGGER e2e_block ON shipments');
f = await until(async () => { const x = await facts(id); return x.n ? x : null; }) || await facts(id);
T('2. Once the database works the booking is recorded by itself, once, under courier A', good(f, A, 5000, (await liveAtCourier(id))[0]?.shipment?.awb), JSON.stringify(f));
T('2. The courier was asked to ship exactly once', (fake.stats.calls['POST /shipments'] || 0) - ships0 === 1, String((fake.stats.calls['POST /shipments'] || 0) - ships0));

// 3. the booking really failed at the courier (502, nothing booked): found out, released, and the seller can use another courier
id = await newOrder(); fake.mode.dropShip = true; fake.mode.readsDown = true;
r = await book(id, A); f = await facts(id);
T('3. Courier 502: reported as being checked (not failed, not booked), nothing charged', r.s === 409 && r.j?.code === 'BOOKING_OUTCOME_UNKNOWN' && f.n === 0, `${r.s} ${r.j?.code}`);
fake.mode.dropShip = false; fake.mode.readsDown = false;
r = await until(async () => { const x = await book(id, B); return x.s < 300 ? x : null; }, 25000) || { s: 0 };
f = await facts(id);
T('3. The courier confirms it has no booking, so another courier can be used: one shipment under B at its price', r.s === 201 && f.n === 1 && f.code === B.code && f.charge === 9000 && f.debits.length === 1 && f.debits[0] === 9000, JSON.stringify(f));
T('3. ...and only one live parcel at the courier', (await liveAtCourier(id)).length === 1);

// 4. a batch of 12 in the queue while every answer is lost
const ids = []; for (let i = 0; i < 12; i++) ids.push(await newOrder());
fake.mode.loseAnswer = true; fake.mode.readsDown = true;
const q = await call('POST', '/v1/shipments/assign-batch', { orderIds: ids, providerCode: A.pcode, serviceCode: A.code });
await sleep(4000); fake.mode.loseAnswer = false; fake.mode.readsDown = false;
await until(async () => (await one('SELECT count(*)::int AS n FROM shipments WHERE order_id = ANY($1::uuid[])', [ids])).n === 12, 60000);
const b4 = await one('SELECT count(*)::int AS n, count(DISTINCT awb)::int AS awbs FROM shipments WHERE order_id = ANY($1::uuid[])', [ids]);
const d4 = (await one("SELECT count(*)::int AS n FROM wallet_entries w JOIN shipments s ON s.id::text = w.reference_id WHERE s.order_id = ANY($1::uuid[]) AND w.entry_type='debit'", [ids])).n;
let live4 = 0; for (const x of ids) live4 += (await liveAtCourier(x)).length;
T('4. Queue of 12 with every answer lost: all 12 end booked exactly once (12 shipments, 12 AWBs, 12 debits, 12 parcels at the courier)', q.s === 202 && b4.n === 12 && b4.awbs === 12 && d4 === 12 && live4 === 12 && fake.stats.repeatShips === 0, JSON.stringify({ ...b4, d4, live4, repeats: fake.stats.repeatShips }));

// 5. the money is gone by the time the courier answers AND the undo at the courier fails at first: retried until it is really undone, seller never charged
id = await newOrder(); fake.mode.cancelDown = true; fake.mode.latencyMs = 500;
const bal = Number((await one(`SELECT COALESCE(SUM(CASE WHEN entry_type IN ('credit','release') THEN amount_paise ELSE -amount_paise END),0)::bigint AS b FROM wallet_entries WHERE seller_id = $1`, [sellerId])).b);
const slow = book(id, A); await sleep(900); await fund(-(bal - 100)); r = await slow; fake.mode.latencyMs = 40; f = await facts(id);
T('5. Wallet emptied during the courier call: refused with 402, nothing recorded, nothing charged', r.s === 402 && f.n === 0 && f.debits.length === 0, `${r.s} ${r.j?.code}`);
await fund(5000000);
r = await book(id, B);
T('5. While the undo is pending the order cannot be booked again', r.s === 409 && (await facts(id)).n === 0, `${r.s} ${r.j?.code}`);
fake.mode.cancelDown = false;
const undone = await until(async () => (await liveAtCourier(id)).length === 0, 25000);
T('5. The courier booking is cancelled by itself once the courier accepts it', !!undone, `live=${(await liveAtCourier(id)).length}`);
r = await until(async () => { const x = await book(id, B); return x.s < 300 ? x : null; }, 15000) || { s: 0 };
f = await facts(id); const live5 = await liveAtCourier(id);
T('5. Booking again afterwards makes a NEW courier booking (never the cancelled AWB)', r.s === 201 && live5.length === 1 && f.awb === live5[0].shipment.awb && f.charge === 9000, JSON.stringify({ f, live: live5.map((x) => x.shipment.awb) }));

// 6. the process died mid-booking: the courier has the parcel, our record only says "started"
id = await newOrder(); await db.query(BLOCK);
await book(id, A);
const table = (await one("SELECT to_regclass('public.booking_attempts') AS t")).t;
if (table) await db.query("UPDATE booking_attempts SET state = 'started', awb = NULL, provider_shipment_id = NULL, updated_at = now() - interval '10 minutes', next_check_at = now() WHERE order_id = $1", [id]);
await db.query('DROP TRIGGER e2e_block ON shipments');
f = await until(async () => { const x = await facts(id); return x.n ? x : null; }) || await facts(id);
T('6. A booking interrupted by a crash is found at the courier and recorded once', good(f, A, 5000, (await liveAtCourier(id))[0]?.shipment?.awb), JSON.stringify(f));

// 7. delayed visibility: the courier booked, the answer was lost, and its records do not show the order for a while. One empty lookup must not free the order.
id = await newOrder(); fake.mode.loseAnswer = true; fake.mode.hideMs = 6000;
r = await book(id, A); fake.mode.loseAnswer = false;
T('7. Lost answer: the seller is told the outcome is being checked (not failed, not booked)', r.s === 409 && r.j?.code === 'BOOKING_OUTCOME_UNKNOWN', `${r.s} ${r.j?.code}`);
r = await book(id, B);
T('7. While the courier\'s records lag (order invisible), another courier is refused', r.s === 409 && (await liveAtCourier(id)).length === 1, `${r.s} ${r.j?.code}`);
f = await until(async () => { const x = await facts(id); return x.n ? x : null; }) || await facts(id); fake.mode.hideMs = 0;
T('7. When the booking becomes visible it is recorded under the first courier, never released in between', good(f, A, 5000, (await liveAtCourier(id))[0]?.shipment?.awb), JSON.stringify(f));
const st7 = (await one('SELECT state, misses FROM booking_attempts WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1', [id]));
T('7. ...and the attempt went straight to recorded (an unreadable or empty lookup never released it)', st7?.state === 'recorded' && (await one("SELECT count(*)::int n FROM booking_attempts WHERE order_id = $1 AND state = 'refused'", [id])).n === 0, JSON.stringify(st7));

// 8. our record of the courier's order id is missing (it was never stored): the courier is searched instead
id = await newOrder(); fake.mode.loseAnswer = true; fake.mode.readsDown = true;
await book(id, A); fake.mode.loseAnswer = false;
await db.query('DELETE FROM aggregator_orders WHERE order_id = $1', [id]); fake.mode.readsDown = false;
f = await until(async () => { const x = await facts(id); return x.n ? x : null; }) || await facts(id);
T('8. Missing order-id record: found by searching the courier, recorded once under courier A', good(f, A, 5000, (await liveAtCourier(id))[0]?.shipment?.awb), JSON.stringify(f));

// 9. the courier can never be asked: after BOOKING_REVIEW_SECONDS a person checks it. Locked until then; settled by hand with what the portal shows.
id = await newOrder(); fake.mode.loseAnswer = true; fake.mode.readsDown = true;
await book(id, A); fake.mode.loseAnswer = false;
const inReview = await until(async () => (await one('SELECT state FROM booking_attempts WHERE order_id = $1', [id]))?.state === 'needs_review', 70000);
T('9. Never confirmed: handed to a person (needs_review) instead of being released or retried for ever', !!inReview);
r = await book(id, B); T('9. Meanwhile another courier is refused with a clear reason', r.s === 409 && r.j?.code === 'BOOKING_IN_REVIEW', `${r.s} ${r.j?.code}`);
r = await call('PATCH', `/v1/orders/${id}/state`, { state: 'cancelled' }); T('9. ...and the order cannot be cancelled', r.s === 409);
const adm = await (async () => { let aj = ''; let ac = ''; const c = async (m, p, b) => { const x = await fetch(API + p, { method: m, headers: { 'content-type': 'application/json', ...(aj ? { cookie: aj } : {}), ...(m !== 'GET' && ac ? { 'x-csrf-token': ac } : {}) }, body: b ? JSON.stringify(b) : undefined }); for (const k of x.headers.getSetCookie?.() ?? []) { const [n, v] = k.split(';')[0].split(/=(.*)/s); aj = (aj ? aj + '; ' : '') + `${n}=${v}`; if (n === 'nx_csrf') ac = decodeURIComponent(v); } let j = null; try { j = await x.json(); } catch { /* */ } return { s: x.status, j }; };
  await db.query('DELETE FROM admin_email_otps'); const a = await c('POST', '/v1/admin/auth/login', { email: 'admin@nexgo.in', password: 'Admin@456' }); if (a.j?.requiresEmailOtp) await c('POST', '/v1/admin/auth/verify-otp', { otpToken: a.j.otpToken, code: a.j.devCode }); return c; })();
const list9 = await adm('GET', '/v1/admin/booking-reviews'); const row9 = list9.j?.items?.find((x) => x.order_number.startsWith('RC'));
T('9. The admin sees it on the list to check by hand', list9.s === 200 && !!row9, `${list9.s} ${list9.j?.items?.length}`);
fake.mode.readsDown = true; const portalAwb = (await liveAtCourier(id))[0]?.shipment?.awb;
r = await adm('POST', `/v1/admin/booking-reviews/${row9?.id}/resolve`, { kind: 'booked', awb: portalAwb }); f = await facts(id); fake.mode.readsDown = false;
T('9. Settled by hand as booked with the AWB from the portal: one shipment, one debit, courier A', r.s === 200 && good(f, A, 5000, portalAwb), `${r.s} ${JSON.stringify(r.j)} ${JSON.stringify(f)}`);
id = await newOrder(); fake.mode.dropShip = true; fake.mode.readsDown = true; await book(id, A); fake.mode.dropShip = false;
await until(async () => (await one('SELECT state FROM booking_attempts WHERE order_id = $1', [id]))?.state === 'needs_review', 70000);
const row9b = (await adm('GET', '/v1/admin/booking-reviews')).j.items[0];
r = await adm('POST', `/v1/admin/booking-reviews/${row9b.id}/resolve`, { kind: 'not_booked', note: 'Portal shows no shipment' }); fake.mode.readsDown = false;
const rb = await book(id, B);
T('9. Settled by hand as not booked: the order is free and can be booked with another courier', r.s === 200 && rb.s === 201 && (await facts(id)).code === B.code, `${r.s} ${rb.s}`);
const audit9 = (await one("SELECT count(*)::int n FROM audit_events WHERE action IN ('booking.verified_booked','booking.verified_not_booked')")).n;
T('9. Both decisions are in the audit trail', audit9 === 2, String(audit9));

const left = table ? (await one("SELECT count(*)::int AS n FROM booking_attempts WHERE state IN ('started','accepted','unknown','cancel_needed','needs_review')")).n : -1;
T('No unfinished booking record is left behind, and finished ones keep no customer data', left === 0 && (await one('SELECT count(*)::int AS n FROM booking_attempts WHERE context IS NOT NULL')).n === 0, `open=${left}`);
const wallet = Number((await one(`SELECT COALESCE(SUM(amount_paise),0)::bigint AS b FROM wallet_entries WHERE seller_id = $1 AND entry_type='debit' AND reference_type='shipment'`, [sellerId])).b);
const charged = Number((await one('SELECT COALESCE(sum(shipping_charge_paise),0)::bigint AS c FROM shipments WHERE seller_id = $1', [sellerId])).c);
T('Total debits equal total shipment charges', wallet === charged && wallet > 0, JSON.stringify({ wallet, charged }));

console.log(out.join('\n')); console.log(`\n${out.filter((x) => x.startsWith('PASS')).length}/${out.length} passed`);
await db.end(); fake.close(); process.exit(0);
