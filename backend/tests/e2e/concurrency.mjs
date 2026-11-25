// BOOK-002 (P0): many entry paths can book ONE order at the same moment (a double click, two tabs, the assign queue and a manual booking, a retry with a
// different idempotency key). Required: exactly one shipment, exactly one wallet debit, one AWB, no server error, and every loser gets a clean answer.
// Needs Postgres :5544 and the API on :4011 started with LORRIGO_API_KEY=test LORRIGO_BASE_URL=http://127.0.0.1:4555 (and the ASSIGN_* test variables of speed.mjs).
// Run: node tests/e2e/concurrency.mjs
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
const fake = startFakeAggregator({ port: 4555, latencyMs: 150, courierIds: [svc.ext] });

let jar = ''; let csrf = '';
const call = async (m, p, b, extra = {}) => {
  const r = await fetch(API + p, { method: m, headers: { 'content-type': 'application/json', ...(jar ? { cookie: jar } : {}), ...(m !== 'GET' && csrf ? { 'x-csrf-token': csrf } : {}), ...extra }, body: b ? JSON.stringify(b) : undefined });
  const sc = r.headers.getSetCookie?.() ?? [];
  if (sc.length) { const kv = Object.fromEntries(jar.split('; ').filter(Boolean).map((x) => x.split(/=(.*)/s).slice(0, 2))); for (const c of sc) { const [k, v] = c.split(';')[0].split(/=(.*)/s); kv[k] = v; } jar = Object.entries(kv).map(([k, v]) => `${k}=${v}`).join('; '); csrf = decodeURIComponent(kv.nx_csrf || ''); }
  let j = null; try { j = await r.json(); } catch { /* empty */ } return { s: r.status, j };
};
const email = `con${Date.now()}@example.com`;
await call('POST', '/v1/auth/signup', { fullName: 'Conc Tester', email, password: 'Str0ng-Passw0rd!x', businessName: 'Conc Co', legalName: 'Conc Co', phone: '9876543210' });
await call('POST', '/v1/seller/agreement', {});
const sellerId = (await db.query('SELECT s.id FROM sellers s JOIN seller_memberships m ON m.seller_id = s.id JOIN users u ON u.id = m.user_id WHERE u.email = $1', [email])).rows[0].id;
const wh = await call('POST', '/v1/warehouses', { name: 'Main', warehouseType: 'primary', contactName: 'Owner', phone: '9876543210', addressLine1: '5 Test Lane', city: 'Mumbai', state: 'Maharashtra', pincode: '400001' });
await db.query(`INSERT INTO seller_courier_access (seller_id, service_id, account_mode, state, cod_enabled, auto_assign_eligible) VALUES ($1,$2,'platform','enabled',true,true)`, [sellerId, svc.id]);
const card = (await db.query(`INSERT INTO rate_cards (seller_id, name, state) VALUES ($1,'Conc test','active') RETURNING id`, [sellerId])).rows[0].id;
await db.query(`INSERT INTO rate_card_rates (rate_card_id, service_id, zone_code, min_weight_g, base_weight_g, base_price_paise, additional_weight_g, additional_price_paise) VALUES ($1,$2,'national',0,500,5000,500,0)`, [card, svc.id]);
await db.query("INSERT INTO wallet_entries (seller_id,entry_type,amount_paise,reference_type,reference_id,idempotency_key,description) VALUES ($1,'credit',5000000,'wallet_recharge','seed',$2,'seed')", [sellerId, 'con-seed-' + Date.now()]);
const stamp = Date.now().toString().slice(-6); let seq = 0;
const newOrder = async () => {
  const i = ++seq;
  const id = (await call('POST', '/v1/orders', { warehouseId: wh.j.id, orderNumber: `CN${stamp}${i}`, paymentMode: 'prepaid', customer: { fullName: 'Buyer Name' + i, phone: `97${String(10000000 + i * 11)}`, addressLine1: '12 Road', city: 'Mumbai', state: 'Maharashtra', pincode: '400002' }, items: [{ sku: 'S', name: 'Item', quantity: 1, unitPricePaise: 50000, weightG: 300 }], package: { weightG: 300, lengthMm: 100, widthMm: 100, heightMm: 100 } })).j.id;
  await call('PATCH', `/v1/orders/${id}/state`, { state: 'ready_to_ship' });
  return id;
};
const key = (tag) => ({ 'Idempotency-Key': `con-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}` });
const book = (id, extra) => call('POST', '/v1/shipments/book', { orderId: id, providerCode: svc.pcode, serviceCode: svc.code }, extra);
const facts = async (id) => ({
  shipments: (await db.query('SELECT count(*)::int AS n FROM shipments WHERE order_id = $1', [id])).rows[0].n,
  awbs: (await db.query('SELECT count(DISTINCT awb)::int AS n FROM shipments WHERE order_id = $1', [id])).rows[0].n,
  debits: (await db.query("SELECT count(*)::int AS n FROM wallet_entries w JOIN shipments s ON s.id::text = w.reference_id WHERE s.order_id = $1 AND w.entry_type = 'debit' AND w.reference_type = 'shipment'", [id])).rows[0].n,
  state: (await db.query('SELECT state::text AS s FROM orders WHERE id = $1', [id])).rows[0].s,
});
const clean = (rs) => rs.every((r) => r.s < 500);

// 1. the same request six times at once (a hammered button / a retrying client): ONE Idempotency-Key
let id = await newOrder(); const sameKey = key('same');
let rs = await Promise.all(Array.from({ length: 6 }, () => book(id, sameKey)));
let f = await facts(id);
T('6 identical booking requests at once: exactly ONE shipment, ONE AWB, ONE debit', f.shipments === 1 && f.awbs === 1 && f.debits === 1 && f.state === 'booked', JSON.stringify({ ...f, codes: rs.map((r) => r.s) }));
T('...and none of the 6 got a server error (each is a success or a replay)', clean(rs) && rs.some((r) => r.s === 201 || r.s === 200), JSON.stringify(rs.map((r) => r.s)));
T('...the AWB the 6 answers carry is the same one', new Set(rs.filter((r) => r.j?.shipment?.awb).map((r) => r.j.shipment.awb)).size <= 1);

// 2. six requests at once, each with its OWN key (two tabs, a client that lost its key): still ONE booking
id = await newOrder();
rs = await Promise.all(Array.from({ length: 6 }, (_, i) => book(id, key('diff' + i))));
f = await facts(id);
T('6 requests at once with DIFFERENT keys: exactly ONE shipment, ONE AWB, ONE debit', f.shipments === 1 && f.awbs === 1 && f.debits === 1 && f.state === 'booked', JSON.stringify({ ...f, codes: rs.map((r) => r.s) }));
const losers = rs.filter((r) => r.s >= 300);
T('...the losers are told exactly what happened: code ORDER_ALREADY_BOOKED, the AWB, "nothing charged twice" (not the old "This record already exists")', clean(rs) && losers.length >= 1 && losers.every((r) => r.s === 409 && r.j?.code === 'ORDER_ALREADY_BOOKED' && /AWB \S+/.test(r.j?.error || '') && /Nothing was charged twice/.test(r.j?.error || '')), JSON.stringify(losers.slice(0, 2).map((r) => `${r.s}:${r.j?.code}:${String(r.j?.error ?? '').slice(0, 80)}`)));

// 3. manual booking + synchronous auto-assign + the queue, all at once for the same order
id = await newOrder();
const [m1, a1, q1, m2] = await Promise.all([
  book(id, key('mix')),
  call('POST', '/v1/shipments/auto-assign', { orderIds: [id] }),
  call('POST', '/v1/shipments/assign-batch', { orderIds: [id] }),
  book(id, key('mix2')),
]);
await sleep(3000); // the queue works in the background
f = await facts(id);
T('manual + auto-assign + queue + manual at once: exactly ONE shipment, ONE AWB, ONE debit', f.shipments === 1 && f.awbs === 1 && f.debits === 1 && f.state === 'booked', JSON.stringify({ ...f, manual1: m1.s, auto: a1.j?.results?.[0]?.ok, queue: q1.s, manual2: m2.s }));
T('...no server error from any of them', clean([m1, a1, q1, m2]), JSON.stringify([m1.s, a1.s, q1.s, m2.s]));

// 4. an order that is ALREADY booked: every path refuses to book it again, nothing is charged
const before = (await db.query("SELECT count(*)::int AS n FROM wallet_entries WHERE seller_id = $1 AND entry_type = 'debit'", [sellerId])).rows[0].n;
const callsBefore = fake.stats.calls['POST /orders'] || 0;
const again = await Promise.all([book(id, key('again')), call('POST', '/v1/shipments/auto-assign', { orderIds: [id] }), call('POST', '/v1/shipments/assign-batch', { orderIds: [id] })]);
const after = (await db.query("SELECT count(*)::int AS n FROM wallet_entries WHERE seller_id = $1 AND entry_type = 'debit'", [sellerId])).rows[0].n;
T('Booking an already-booked order again (3 paths): refused, no new debit, no new order at the courier network', after === before && (fake.stats.calls['POST /orders'] || 0) === callsBefore && (await facts(id)).shipments === 1, JSON.stringify({ before, after, codes: again.map((r) => r.s) }));

// 5. many different orders at once never share or lose a booking (no cross-talk between orders)
const many = await Promise.all(Array.from({ length: 12 }, () => newOrder()));
const manyRs = await Promise.all(many.map((o) => book(o, key('many'))));
const rows = (await db.query('SELECT count(*)::int AS n, count(DISTINCT awb)::int AS awbs, count(DISTINCT order_id)::int AS orders FROM shipments WHERE order_id = ANY($1::uuid[])', [many])).rows[0];
T('12 different orders booked at once: 12 shipments, 12 different AWBs, 12 orders, all answered cleanly', rows.n === 12 && rows.awbs === 12 && rows.orders === 12 && clean(manyRs), JSON.stringify({ ...rows, codes: [...new Set(manyRs.map((r) => r.s))] }));
const walletOk = Number((await db.query(`SELECT COALESCE(SUM(CASE WHEN entry_type IN ('credit','release') THEN amount_paise ELSE -amount_paise END),0)::bigint AS b FROM wallet_entries WHERE seller_id = $1`, [sellerId])).rows[0].b);
const charged = Number((await db.query(`SELECT COALESCE(sum(shipping_charge_paise),0)::bigint AS c FROM shipments WHERE seller_id = $1 AND state <> 'cancelled'`, [sellerId])).rows[0].c);
T('The wallet equals the start minus the charges of the shipments that exist (no double charge, no free shipment)', walletOk === 5000000 - charged, JSON.stringify({ wallet: walletOk, expected: 5000000 - charged }));

console.log(out.join('\n'));
console.log(`\n${out.filter((x) => x.startsWith('PASS')).length}/${out.length} passed`);
await db.end(); fake.close(); process.exit(0);
