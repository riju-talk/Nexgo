// End-to-end check of pickup manifests and the new dashboard figures (pickup speed, first-attempt delivery, promised-date adherence per zone,
// previous-period comparison), with hand-worked expectations. Needs the API on :4011 (development) and a throwaway Postgres on :5544.
// Run: node tests/e2e/manifests.mjs
import { createRequire } from 'node:module';
const require = createRequire(new URL('../../package.json', import.meta.url));
const pg = require('pg');
const API = 'http://127.0.0.1:4011';
const db = new pg.Client({ connectionString: 'postgresql://nx@127.0.0.1:5544/nxd' }); await db.connect();
const out = []; const T = (n, ok, d = '') => out.push((ok ? 'PASS ' : 'FAIL ') + n + (d ? ' - ' + d : ''));
const client = () => {
  let jar = ''; let csrf = '';
  return async (m, p, b) => {
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
};
const call = client(); const other = client();
const stamp = Date.now().toString().slice(-7);
const email = `mf${Date.now()}@example.com`;
await call('POST', '/v1/auth/signup', { fullName: 'Manifest Tester', email, password: 'Str0ng-Passw0rd!x', businessName: 'Manifest Co', legalName: 'Manifest Co', phone: '9876543210' });
await call('POST', '/v1/seller/agreement', {});
await other('POST', '/v1/auth/signup', { fullName: 'Other Seller', email: `mfo${Date.now()}@example.com`, password: 'Str0ng-Passw0rd!x', businessName: 'Other Co', legalName: 'Other Co', phone: '9876543211' });
const sellerId = (await db.query('SELECT s.id FROM sellers s JOIN seller_memberships m ON m.seller_id = s.id JOIN users u ON u.id = m.user_id WHERE u.email = $1', [email])).rows[0].id;
const wh = await call('POST', '/v1/warehouses', { name: 'Main', warehouseType: 'primary', contactName: 'Owner', phone: '9876543210', addressLine1: '5 Test Lane', city: 'Mumbai', state: 'Maharashtra', pincode: '400001' });
const mk = async (n) => (await call('POST', '/v1/orders', { warehouseId: wh.j.id, orderNumber: `MF${stamp}${n}`, paymentMode: 'prepaid', customer: { fullName: 'Buyer ' + n, phone: '9876543210', addressLine1: '12 Road', city: 'Mumbai', state: 'Maharashtra', pincode: '400002' }, items: [{ sku: 'S', name: 'Item', quantity: 1, unitPricePaise: 50000, weightG: 300 }], package: { weightG: 300, lengthMm: 100, widthMm: 100, heightMm: 100 } })).j.id;
const prov = (await db.query("SELECT cp.id AS pid, cs.id AS sid FROM courier_providers cp JOIN courier_services cs ON cs.provider_id = cp.id WHERE cs.is_active = true LIMIT 1")).rows[0];
const hrs = (h) => `now() - interval '${h} hours'`;
// tag, state, booked h ago, first scan h after booking (null = none), delivered h after booking (null), promised h after booking, zone, ndr?
const ship = async (tag, state, bookedAgo, scanAfter, deliveredAfter, promisedAfter, zone, ndr = false, createdAgoDays = null) => {
  const orderId = await mk(tag);
  const sh = await db.query(`INSERT INTO shipments (seller_id,order_id,provider_id,service_id,awb,provider_shipment_id,chargeable_weight_g,shipping_charge_paise,quote_snapshot,idempotency_key,destination_pincode,destination_city,state,booked_at,created_at,delivered_at,promised_delivery_at)
    VALUES ($1,$2,$3,$4,$5,$6,500,10000,$7::jsonb,$8,'400002','Mumbai',$9::shipment_state, ${hrs(bookedAgo)}, ${createdAgoDays ? `now() - interval '${createdAgoDays} days'` : hrs(bookedAgo)},
      ${deliveredAfter === null ? 'NULL' : `${hrs(bookedAgo)} + interval '${deliveredAfter} hours'`}, ${promisedAfter === null ? 'NULL' : `${hrs(bookedAgo)} + interval '${promisedAfter} hours'`}) RETURNING id`,
    [sellerId, orderId, prov.pid, prov.sid, `MF${stamp}${tag}`, 'ps-' + tag, JSON.stringify({ zone }), `mf-key-${stamp}${tag}-padding-padding`, state]);
  if (scanAfter !== null) await db.query(`INSERT INTO shipment_events (shipment_id,state,occurred_at,description,source) VALUES ($1,'in_transit', ${hrs(bookedAgo)} + interval '${scanAfter} hours','Picked up','manual')`, [sh.rows[0].id]);
  if (ndr) await db.query(`INSERT INTO ndr_cases (seller_id,shipment_id,reason_code,ndr_reason,state) VALUES ($1,$2,'courier_ndr','customer_unavailable','resolved')`, [sellerId, sh.rows[0].id]).catch((e) => { throw new Error('ndr insert: ' + e.message); });
  await db.query("UPDATE orders SET state = 'booked' WHERE id = $1", [orderId]);
  return sh.rows[0].id;
};
const S1 = await ship('A1', 'booked', 1, null, null, null, 'within_city');
const S2 = await ship('A2', 'booked', 2, null, null, null, 'within_state');
await ship('A3', 'in_transit', 30, 10, null, null, 'within_city');
await ship('A4', 'in_transit', 60, 30, null, null, 'within_city');
await ship('A5', 'delivered', 100, 60, 90, 120, 'within_city');
await ship('A6', 'delivered', 100, 5, 110, 60, 'within_city', true);
await ship('P1', 'delivered', 960, 5, 20, 120, 'within_city', false, 40); // booked 40 days ago: belongs to the previous 30-day period

// ---- dashboard figures
const d = (await call('GET', '/v1/analytics/dashboard?days=30')).j;
T('Pickup speed: 6 booked parcels in the period (cancelled and the 40-day-old one excluded)', d.pickupSpeed.booked === 6, JSON.stringify(d.pickupSpeed));
T('Pickup speed: 2 collected within 24 h, 1 within 24-48 h, 1 beyond 48 h', d.pickupSpeed.within24h === 2 && d.pickupSpeed.between24and48h === 1 && d.pickupSpeed.beyond48h === 1, JSON.stringify(d.pickupSpeed));
T('Pickup speed percentages are shares of booked parcels (33.3 / 16.7 / 16.7)', d.pickupSpeed.within24hPct === 33.3 && d.pickupSpeed.between24and48hPct === 16.7 && d.pickupSpeed.beyond48hPct === 16.7, JSON.stringify([d.pickupSpeed.within24hPct, d.pickupSpeed.between24and48hPct, d.pickupSpeed.beyond48hPct]));
T('Delivery quality: 2 delivered, first attempt 50 % (one had an NDR)', d.deliveryQuality.delivered === 2 && d.deliveryQuality.firstAttemptPct === 50, JSON.stringify(d.deliveryQuality));
T('Delivery quality: delivered by the promised date 50 % (one on time, one late)', d.deliveryQuality.withinPromisedDatePct === 50);
const zA = d.zoneSla.find((z) => z.zone === 'Zone A');
T('Zone A on time 50 % of 2; zones with no deliveries show no percentage', zA.withinPromisedDatePct === 50 && zA.delivered === 2 && d.zoneSla.filter((z) => z.zone !== 'Zone A').every((z) => z.withinPromisedDatePct === null), JSON.stringify(d.zoneSla));
T('Previous period holds only the 40-day-old parcel (1 shipped, 1 delivered)', d.previous.shipped === 1 && d.previous.delivered === 1 && d.previous.deliveryRate === 100, JSON.stringify(d.previous));
T('Previous period dates are the 30 days right before this one', (Date.parse(d.window?.to ?? new Date().toISOString().slice(0, 10)) || true) && /^\d{4}-\d{2}-\d{2}$/.test(d.previous.from) && /^\d{4}-\d{2}-\d{2}$/.test(d.previous.to));
const dx = (await call('GET', '/v1/analytics/dashboard?days=7')).j;
T('A 7-day window compares with the 7 days before it (the 40-day-old parcel is in neither)', dx.previous.shipped === 0);

// ---- manifests
let r = await call('POST', '/v1/manifests/generate', {});
T('Generate makes one manifest (one courier + one address) covering the 2 parcels waiting for pickup', r.s === 201 && r.j.created === 1 && r.j.parcels === 2, JSON.stringify(r.j));
r = await call('POST', '/v1/manifests/generate', {});
T('Generating again creates nothing: those parcels are already on a manifest', r.s === 200 && r.j.created === 0, JSON.stringify(r.j));
let l = (await call('GET', '/v1/manifests')).j;
const m = l.items[0];
T('The list shows the manifest with number, courier, address, 2 parcels, 0 collected, status pending', l.total === 1 && /^MF\d{6}001$/.test(m.manifest_no) && m.parcels === 2 && m.collected === 0 && m.status === 'pending' && !!m.courier, JSON.stringify(m));
const items = (await call('GET', `/v1/manifests/${m.id}/items`)).j;
T('The manifest lists its two parcels with AWB and order', items.items.length === 2 && items.items.every((x) => /^MF\d+A[12]$/.test(x.awb)) && items.manifest.manifest_no === m.manifest_no, JSON.stringify(items.items.map((x) => x.awb)));
await db.query("UPDATE shipments SET state = 'in_transit' WHERE id = $1", [S1]);
l = (await call('GET', '/v1/manifests')).j;
T('After one parcel is collected the manifest is in progress (1 of 2)', l.items[0].collected === 1 && l.items[0].status === 'in_progress');
await db.query("UPDATE shipments SET state = 'in_transit' WHERE id = $1", [S2]);
l = (await call('GET', '/v1/manifests')).j;
T('After both are collected it is completed', l.items[0].status === 'completed' && l.items[0].collected === 2);
T('Status filter works (pending shows none now, completed shows one)', (await call('GET', '/v1/manifests?status=pending')).j.total === 0 && (await call('GET', '/v1/manifests?status=completed')).j.total === 1);
T('Search by manifest number works', (await call('GET', `/v1/manifests?q=${m.manifest_no}`)).j.total === 1 && (await call('GET', '/v1/manifests?q=nomatch')).j.total === 0);
const o = await other('GET', '/v1/manifests');
T('Another seller sees no manifests', o.s === 200 && o.j.total === 0);
const ox = await other('GET', `/v1/manifests/${m.id}/items`);
T("Another seller cannot open this seller's manifest (404)", ox.s === 404);
T('Nothing in the manifest responses names the courier network', !/lorrigo|aggregator/i.test(JSON.stringify([l, items])));

console.log(out.join('\n'));
console.log(`\n${out.filter((x) => x.startsWith('PASS')).length}/${out.length} passed`);
await db.end();
process.exit(out.some((x) => x.startsWith('FAIL')) ? 1 : 0);
