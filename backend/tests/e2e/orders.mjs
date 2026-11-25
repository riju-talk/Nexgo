// Order data integrity: a parcel must go to the address typed on ITS order (repeat buyers move house), one order's correction must not touch another, an order number that
// already exists with different content is a conflict (never a silent discard), and an NDR answer is a request to the courier, not a fact. Run through tests/support/runE2e.mjs.
import { createRequire } from 'node:module';
import { startFakeAggregator } from '../support/fakeAggregator.mjs';
const require = createRequire(new URL('../../package.json', import.meta.url));
const pg = require('pg');
const API = 'http://127.0.0.1:4011';
const db = new pg.Client({ connectionString: (process.env.E2E_DATABASE_URL || 'postgresql://nx@127.0.0.1:5544/nxd') }); await db.connect();
const out = []; const T = (n, ok, d = '') => { out.push((ok ? 'PASS ' : 'FAIL ') + n + (d ? ' - ' + d : '')); };
const one = async (sql, args) => (await db.query(sql, args)).rows[0];
const svc = await one("SELECT cs.id, cs.code, cs.external_service_id AS ext, cp.code AS pcode, cp.id AS pid FROM courier_services cs JOIN courier_providers cp ON cp.id = cs.provider_id WHERE cp.aggregator = 'lorrigo' AND cs.is_active ORDER BY cs.code LIMIT 1");
const fake = startFakeAggregator({ port: 4555, latencyMs: 10, courierIds: [svc.ext] });
let jar = ''; let csrf = '';
const call = async (m, p, b, extra = {}) => {
  const r = await fetch(API + p, { method: m, headers: { 'content-type': 'application/json', ...(jar ? { cookie: jar } : {}), ...(m !== 'GET' && csrf ? { 'x-csrf-token': csrf } : {}), ...extra }, body: b ? JSON.stringify(b) : undefined });
  const sc = r.headers.getSetCookie?.() ?? [];
  if (sc.length) { const kv = Object.fromEntries(jar.split('; ').filter(Boolean).map((x) => x.split(/=(.*)/s).slice(0, 2))); for (const c of sc) { const [k, v] = c.split(';')[0].split(/=(.*)/s); kv[k] = v; } jar = Object.entries(kv).map(([k, v]) => `${k}=${v}`).join('; '); csrf = decodeURIComponent(kv.nx_csrf || ''); }
  let j = null; try { j = await r.json(); } catch { /* empty */ } return { s: r.status, j };
};
const email = `ord${Date.now()}@example.com`;
await call('POST', '/v1/auth/signup', { fullName: 'Ord Tester', email, password: 'Str0ng-Passw0rd!x', businessName: 'Ord Co', legalName: 'Ord Co', phone: '9876543210' });
await call('POST', '/v1/seller/agreement', {});
const sellerId = (await one('SELECT s.id FROM sellers s JOIN seller_memberships m ON m.seller_id = s.id JOIN users u ON u.id = m.user_id WHERE u.email = $1', [email])).id;
const wh = (await call('POST', '/v1/warehouses', { name: 'Main', warehouseType: 'primary', contactName: 'Owner', phone: '9876543210', addressLine1: '5 Test Lane', city: 'Mumbai', state: 'Maharashtra', pincode: '400001' })).j.id;
await db.query(`INSERT INTO seller_courier_access (seller_id, service_id, account_mode, state, cod_enabled, auto_assign_eligible) VALUES ($1,$2,'platform','enabled',true,true)`, [sellerId, svc.id]);
const card = (await one(`INSERT INTO rate_cards (seller_id, name, state) VALUES ($1,'Ord','active') RETURNING id`, [sellerId])).id;
await db.query(`INSERT INTO rate_card_rates (rate_card_id, service_id, zone_code, min_weight_g, base_weight_g, base_price_paise, additional_weight_g, additional_price_paise, rto_base_price_paise, rto_additional_price_paise) VALUES ($1,$2,'national',0,500,5000,500,0,5000,0)`, [card, svc.id]);
await db.query("INSERT INTO wallet_entries (seller_id,entry_type,amount_paise,reference_type,reference_id,idempotency_key,description) VALUES ($1,'credit',5000000,'wallet_recharge','seed',$2,'seed')", [sellerId, 'ord-' + Date.now()]);
const stamp = Date.now().toString().slice(-6);
const body = (n, cust = {}, more = {}) => ({ warehouseId: wh, orderNumber: `OD${stamp}${n}`, paymentMode: 'prepaid', customer: { fullName: 'Asha Rao', phone: '9822200001', addressLine1: '12 Old Street', city: 'Mumbai', state: 'Maharashtra', pincode: '400002', ...cust }, items: [{ sku: 'S', name: 'Item', quantity: 1, unitPricePaise: 50000, weightG: 300 }], package: { weightG: 300, lengthMm: 100, widthMm: 100, heightMm: 100 }, ...more });
const consignee = (id) => one('SELECT c.id, c.full_name, c.address_line_1, c.address_line_2, c.landmark, c.email FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.id = $1', [id]);
const NEW = { fullName: 'Ravi Rao', addressLine1: '99 New Tower', addressLine2: 'Flat 4', landmark: 'Near Park' };

// 1. single order: same phone and pincode, different name and address
const o1 = (await call('POST', '/v1/orders', body('1'))).j.id; const o2 = (await call('POST', '/v1/orders', body('2', NEW))).j.id;
let c1 = await consignee(o1); let c2 = await consignee(o2);
T('1. A repeat buyer\'s new order keeps its OWN name and address (not the old one)', c2.full_name === 'Ravi Rao' && c2.address_line_1 === '99 New Tower' && c2.address_line_2 === 'Flat 4' && c2.landmark === 'Near Park', JSON.stringify(c2));
T('1. ...and the first order still has its own', c1.full_name === 'Asha Rao' && c1.address_line_1 === '12 Old Street');
const o3 = (await call('POST', '/v1/orders', body('3'))).j.id;
T('1. The very same details reuse the same customer record (no duplicates)', (await consignee(o3)).id === c1.id);
// 2. bulk: the same, inside one request and against an existing customer
let r = await call('POST', '/v1/orders/bulk', { orders: [body('4', { phone: '9822200002', addressLine1: 'A Wing 1' }), body('5', { phone: '9822200002', addressLine1: 'B Wing 2', fullName: 'Second Person' }), body('6', NEW), body('7', { phone: '9822200001', addressLine1: 'Third Place 3' })] });
const b = r.j.results.map((x) => x.id); const cs = []; for (const id of b) cs.push(await consignee(id));
T('2. Bulk: two buyers behind one phone each keep their own address; a changed address is kept', r.j.created === 4 && cs[0].address_line_1 === 'A Wing 1' && cs[1].address_line_1 === 'B Wing 2' && cs[1].full_name === 'Second Person' && cs[2].address_line_1 === '99 New Tower' && cs[3].address_line_1 === 'Third Place 3', JSON.stringify(cs.map((x) => x?.address_line_1)));
// 3. what the courier and the label get
const key = () => ({ 'Idempotency-Key': `ord-${Date.now()}-${Math.random().toString(36).slice(2, 12)}` });
for (const id of [o1, o2]) { await call('PATCH', `/v1/orders/${id}/state`, { state: 'ready_to_ship' }); await call('POST', '/v1/shipments/book', { orderId: id, providerCode: svc.pcode, serviceCode: svc.code }, key()); }
const sh2 = await one('SELECT id, awb FROM shipments WHERE order_id = $1', [o2]); const sh1 = await one('SELECT id, awb FROM shipments WHERE order_id = $1', [o1]);
r = await call('GET', `/v1/shipments/documents?ids=${sh2?.id}`);
T('3. The label of the second order carries the second address', JSON.stringify(r.j).includes('99 New Tower') && !JSON.stringify(r.j).includes('12 Old Street'), `${r.s}`);
// 4. correcting one order leaves the other alone
const o8 = (await call('POST', '/v1/orders', body('8', { phone: '9822200003' }))).j.id; const o9 = (await call('POST', '/v1/orders', body('9', { phone: '9822200003' }))).j.id;
await call('PATCH', `/v1/orders/${o8}/details`, { customer: { ...body('x', { phone: '9822200003' }).customer, addressLine2: 'Floor 7' }, paymentMode: 'prepaid', codAmountPaise: 0, package: { weightG: 300, lengthMm: 100, widthMm: 100, heightMm: 100 } });
T('4. Correcting only the second address line of one order is saved, and the other order is unchanged', (await consignee(o8)).address_line_2 === 'Floor 7' && (await consignee(o9)).address_line_2 === null, JSON.stringify([(await consignee(o8)).address_line_2, (await consignee(o9)).address_line_2]));
// 5. duplicate order numbers
r = await call('POST', '/v1/orders/bulk', { orders: [body('4', { phone: '9822200002', addressLine1: 'A Wing 1' })] });
T('5. The same order again is recognised as already existing', r.j.existing === 1 && r.j.failed === 0, JSON.stringify(r.j));
r = await call('POST', '/v1/orders/bulk', { orders: [body('4', { phone: '9833300009', fullName: 'Somebody Else', addressLine1: 'Other' }), body('10', { phone: '9822200010' })] });
T('5. The same NUMBER for a different customer is a conflict with a clear message, not a silent discard; the other row is created', r.j.results[0].ok === false && /different/i.test(r.j.results[0].error) && r.j.results[1].ok === true && !r.j.results[1].existing, JSON.stringify(r.j.results));
r = await call('POST', '/v1/orders/bulk', { orders: [body('4', { phone: '9822200002', addressLine1: 'A Wing 1' }, { items: [{ sku: 'S', name: 'Item', quantity: 3, unitPricePaise: 50000, weightG: 300 }] })] });
T('5. The same number with a different amount is a conflict too', r.j.results[0].ok === false && /different/i.test(r.j.results[0].error), JSON.stringify(r.j.results));
// 6. NDR answers
const hook = (awb, status, ts, desc) => call('POST', '/v1/webhooks/lorrigo', { data: { awb, status, tracking_events: [{ status, timestamp: ts, description: desc || status, location: 'Mumbai' }] } }, { 'x-api-key': 'hooktoken-hooktoken-1234' });
const t = (min) => new Date(Date.now() - min * 60000).toISOString();
for (const s of [sh1, sh2]) { await hook(s.awb, 'PICKED_UP', t(90)); await hook(s.awb, 'OUT_FOR_DELIVERY', t(60)); await hook(s.awb, 'NDR', t(50), 'Customer not available'); }
const caseOf = (id) => one('SELECT id, state::text FROM ndr_cases WHERE shipment_id = $1', [id]); const ship = (id) => one('SELECT state::text, rto_initiated_at FROM shipments WHERE id = $1', [id]);
const rtoDebits = async (id) => (await one("SELECT count(*)::int AS n FROM wallet_entries WHERE reference_type = 'shipment_rto' AND reference_id = $1", [id])).n;
r = await call('POST', `/v1/ndr/cases/${(await caseOf(sh1.id)).id}/resolve`, { resolutionAction: 'address_update', newAddress: { addressLine1: 'Corrected House 1', city: 'Mumbai', pincode: '400002' } });
c1 = await consignee(o1); const c3 = await consignee(o3);
T('6. An NDR address correction changes that order only (order 3 of the same buyer keeps its address)', c1.address_line_1 === 'Corrected House 1' && c3.address_line_1 === '12 Old Street', JSON.stringify([c1.address_line_1, c3.address_line_1]));
r = await call('POST', `/v1/ndr/cases/${(await caseOf(sh2.id)).id}/resolve`, { resolutionAction: 'rto' });
let s2 = await ship(sh2.id);
T('6. Asking for RTO is a request: the parcel is not shown as returning and no return freight is charged until the courier turns it round', r.s === 200 && s2.state === 'ndr' && !s2.rto_initiated_at && await rtoDebits(sh2.id) === 0 && (await caseOf(sh2.id)).state === 'rto_requested', JSON.stringify({ ...s2, debits: await rtoDebits(sh2.id), c: (await caseOf(sh2.id)).state }));
await hook(sh2.awb, 'RTO_INITIATED', t(10)); s2 = await ship(sh2.id);
T('6. When the courier starts the return it shows as RTO and the return freight is charged once', s2.state === 'rto' && await rtoDebits(sh2.id) === 1, JSON.stringify({ ...s2, debits: await rtoDebits(sh2.id) }));
await hook(sh2.awb, 'RTO_INITIATED', t(10)); await hook(sh2.awb, 'RTO_IN_TRANSIT', t(5));
T('6. Repeated RTO updates charge nothing more', await rtoDebits(sh2.id) === 1);
// 6b. RTO asked, but the courier delivers after all
const o11 = (await call('POST', '/v1/orders', body('11', { phone: '9822200011' }))).j.id; await call('PATCH', `/v1/orders/${o11}/state`, { state: 'ready_to_ship' }); await call('POST', '/v1/shipments/book', { orderId: o11, providerCode: svc.pcode, serviceCode: svc.code }, key());
const sh3 = await one('SELECT id, awb FROM shipments WHERE order_id = $1', [o11]);
await hook(sh3.awb, 'PICKED_UP', t(90)); await hook(sh3.awb, 'NDR', t(50), 'Refused'); await call('POST', '/v1/ndr/cases/bulk-resolve', { caseIds: [(await caseOf(sh3.id)).id], resolutionAction: 'rto' });
T('6. Bulk RTO behaves the same (request only)', (await ship(sh3.id)).state === 'ndr' && await rtoDebits(sh3.id) === 0, JSON.stringify(await ship(sh3.id)));
await hook(sh3.awb, 'OUT_FOR_DELIVERY', t(20)); await hook(sh3.awb, 'DELIVERED', t(5));
T('6. If the courier delivers it after all it is Delivered, no return freight is ever charged and the case is closed', (await ship(sh3.id)).state === 'delivered' && await rtoDebits(sh3.id) === 0 && (await caseOf(sh3.id)).state === 'resolved', JSON.stringify({ ...(await ship(sh3.id)), c: (await caseOf(sh3.id)).state }));
// 7. things only NEXGO (or the courier) may decide
r = await call('PATCH', `/v1/ndr/${(await caseOf(sh2.id)).id}`, { action: 'rto' }); T('7. The old NDR shortcut that forced parcel states is gone', r.s === 404, `${r.s}`);
const acc = await call('POST', '/v1/bank-accounts', { accountHolderName: 'Ord Person', accountNumber: '123456789012', ifscCode: 'HDFC0001234', bankName: 'HDFC Bank', accountType: 'current' });
r = await call('POST', `/v1/bank-accounts/${acc.j?.id ?? acc.j?.account?.id ?? '00000000-0000-4000-8000-000000000001'}/verify`, { verificationMethod: 'manual' });
T('7. A seller cannot mark their own bank account verified', r.s === 403 || r.s === 404, `${r.s}; account ${acc.s}`);
r = await call('POST', `/v1/shipments/${sh2.id}/label`, {}); T('7. The stub "label" PDF (no address, no barcode) is not offered', r.s >= 400 && r.j?.error === 'CARRIER_LABEL_UNAVAILABLE', `${r.s} ${r.j?.error}`);
// 8. quote and booking agree
await db.query("UPDATE pincodes SET is_active = false WHERE pincode = '400002'");
const o12 = (await call('POST', '/v1/orders', body('12', { phone: '9822200012' }))).j?.id;
if (o12) await call('PATCH', `/v1/orders/${o12}/state`, { state: 'ready_to_ship' });
const q = await call('POST', '/v1/shipping/quotes', { destinationPincode: '400002', pickupPincode: '400001', weightG: 300, paymentMode: 'prepaid', lengthMm: 100, widthMm: 100, heightMm: 100 });
const shipsBefore = fake.stats.shipmentsBooked; r = await call('POST', '/v1/shipments/book', { orderId: o12, providerCode: svc.pcode, serviceCode: svc.code }, key());
T('8. A suspended pincode: no courier is quoted AND booking is refused with the same reason, without asking the courier', q.j.quotes.length === 0 && r.s === 422 && /suspended/i.test(r.j?.error || '') && fake.stats.shipmentsBooked === shipsBefore, `${q.j.quotes?.length} ${r.s} ${r.j?.error}`);
await db.query("UPDATE pincodes SET is_active = true WHERE pincode = '400002'");
await db.query('UPDATE courier_providers SET supports_cod = false WHERE id = $1', [svc.pid]);
const o13 = (await call('POST', '/v1/orders', body('13', { phone: '9822200013' }, { paymentMode: 'cod', codAmountPaise: 50000 }))).j.id; await call('PATCH', `/v1/orders/${o13}/state`, { state: 'ready_to_ship' });
const qc = await call('POST', '/v1/shipping/quotes', { destinationPincode: '400002', pickupPincode: '400001', weightG: 300, paymentMode: 'cod', orderValue: 500, lengthMm: 100, widthMm: 100, heightMm: 100 });
r = await call('POST', '/v1/shipments/book', { orderId: o13, providerCode: svc.pcode, serviceCode: svc.code }, key());
T('8. A courier without COD: not quoted for COD and not bookable for COD', qc.j.quotes.length === 0 && r.s === 422, `${qc.j.quotes?.length} ${r.s} ${r.j?.error}`);
await db.query('UPDATE courier_providers SET supports_cod = true WHERE id = $1', [svc.pid]);
await db.query(`INSERT INTO rate_card_rates (rate_card_id, service_id, zone_code, min_weight_g, base_weight_g, base_price_paise, additional_weight_g, additional_price_paise) VALUES ($1,$2,'within_city',0,500,3000,500,0)`, [card, svc.id]);
await db.query("UPDATE warehouses SET city = 'Bombay' WHERE id = $1", [wh]); // the seller typed another spelling; the pincode says Mumbai
const qz = await call('POST', '/v1/shipping/quotes', { destinationPincode: '400002', pickupPincode: '400001', weightG: 300, paymentMode: 'prepaid', lengthMm: 100, widthMm: 100, heightMm: 100 });
const o14 = (await call('POST', '/v1/orders', body('14', { phone: '9822200014' }))).j.id; await call('PATCH', `/v1/orders/${o14}/state`, { state: 'ready_to_ship' });
r = await call('POST', '/v1/shipments/book', { orderId: o14, providerCode: svc.pcode, serviceCode: svc.code }, key());
const charged = (await one('SELECT shipping_charge_paise::int AS c FROM shipments WHERE order_id = $1', [o14]))?.c;
T('8. The price charged at booking is the price quoted (a city spelled differently on the warehouse changes nothing)', Math.round(qz.j.quotes[0]?.price.total * 100) === charged, `quoted ${qz.j.quotes[0]?.price.total} charged ${charged}`);

console.log(out.join('\n')); console.log(`\n${out.filter((x) => x.startsWith('PASS')).length}/${out.length} passed`);
await db.end(); fake.close(); process.exit(0);
