// End-to-end check of Track's lazy loading API on ~1,900 records: pages of 50 are contiguous (no row twice, none missing, even when many rows share one
// timestamp), every tab and filter equals an independent brute-force query, the counts equal the walked lists, another seller sees nothing of this one,
// and the first screen is small and fast compared with the old load-everything endpoint.
// Needs the API on :4011 (development) and a throwaway Postgres on :5544. Run: node tests/e2e/lazy.mjs
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
    if (sc.length) { const kv = Object.fromEntries(jar.split('; ').filter(Boolean).map((x) => x.split(/=(.*)/s).slice(0, 2))); for (const c of sc) { const [k, v] = c.split(';')[0].split(/=(.*)/s); kv[k] = v; } jar = Object.entries(kv).map(([k, v]) => `${k}=${v}`).join('; '); csrf = decodeURIComponent(kv.nx_csrf || ''); }
    const text = await r.text(); let j = null; try { j = JSON.parse(text); } catch { /* empty */ }
    return { s: r.status, j, bytes: text.length };
  };
};
const call = client(); const other = client();
const stamp = Date.now().toString().slice(-6);
await call('POST', '/v1/auth/signup', { fullName: 'Lazy Tester', email: `lazy${Date.now()}@example.com`, password: 'Str0ng-Passw0rd!x', businessName: 'Lazy Co', legalName: 'Lazy Co', phone: '9876543210' });
await call('POST', '/v1/seller/agreement', {});
await other('POST', '/v1/auth/signup', { fullName: 'Other Tester', email: `lazyo${Date.now()}@example.com`, password: 'Str0ng-Passw0rd!x', businessName: 'Other Co', legalName: 'Other Co', phone: '9876543211' });
const sellerId = (await db.query(`SELECT s.id FROM sellers s JOIN seller_memberships m ON m.seller_id = s.id JOIN users u ON u.id = m.user_id WHERE u.email LIKE 'lazy%@example.com' AND u.email NOT LIKE 'lazyo%' ORDER BY u.created_at DESC LIMIT 1`)).rows[0].id;
const wh = await call('POST', '/v1/warehouses', { name: 'Main', warehouseType: 'primary', contactName: 'Owner', phone: '9876543210', addressLine1: '5 Test Lane', city: 'Mumbai', state: 'Maharashtra', pincode: '400001' });
const wh2 = await call('POST', '/v1/warehouses', { name: 'Second', warehouseType: 'secondary', contactName: 'Owner', phone: '9876543210', addressLine1: '9 Other Lane', city: 'Mumbai', state: 'Maharashtra', pincode: '400002' });

// ---- 1,900 orders through the real bulk API
const N = 1900; const cities = [['Mumbai', 'Maharashtra', '400002'], ['New Delhi', 'Delhi', '110001'], ['Howrah', 'West Bengal', '711101']];
const mk = (i) => { const c = cities[i % 3]; return { warehouseId: i % 5 === 0 ? wh2.j.id : wh.j.id, orderNumber: `LZ${stamp}${i}`, paymentMode: i % 4 === 0 ? 'cod' : 'prepaid', ...(i % 4 === 0 ? { codAmountPaise: 70000 } : {}), customer: { fullName: `Buyer ${i}`, phone: `9${String(100000000 + i).padStart(9, '0')}`, addressLine1: `${i} Road`, city: c[0], state: c[1], pincode: c[2] }, items: [{ sku: 'S', name: i % 2 ? 'Blue Shirt' : 'Red Mug', quantity: 1, unitPricePaise: 70000, weightG: 300 }], package: { weightG: 300, lengthMm: 100, widthMm: 100, heightMm: 100 } }; };
for (let i = 0; i < N; i += 50) { const r = await call('POST', '/v1/orders/bulk', { orders: Array.from({ length: Math.min(50, N - i) }, (_, k) => mk(i + k)) }); if (r.s !== 200) throw new Error('bulk ' + r.s + JSON.stringify(r.j).slice(0, 200)); }
const prov = (await db.query("SELECT cp.id AS pid, cs.id AS sid FROM courier_providers cp JOIN courier_services cs ON cs.provider_id = cp.id WHERE cs.code = 'delhivery-250-gms'")).rows[0];
const prov2 = (await db.query("SELECT cp.id AS pid, cs.id AS sid FROM courier_providers cp JOIN courier_services cs ON cs.provider_id = cp.id WHERE cs.code = 'ekart-0-5-kg-flat'")).rows[0] || prov;

// ---- 1,500 of them become shipments in every state; 7 rows at a time share ONE timestamp (the hard case for cursors)
const states = ['booked', 'booked', 'in_transit', 'out_for_delivery', 'ndr', 'delivered', 'delivered', 'rto', 'cancelled', 'lost'];
await db.query(`
  WITH picked AS (SELECT o.id, row_number() OVER (ORDER BY o.order_number) AS n FROM orders o WHERE o.seller_id = $1 ORDER BY o.order_number LIMIT 1500)
  INSERT INTO shipments (seller_id, order_id, provider_id, service_id, awb, provider_shipment_id, chargeable_weight_g, shipping_charge_paise, quote_snapshot, idempotency_key, destination_pincode, destination_city, state, booked_at, created_at, tags)
  SELECT $1, p.id, CASE WHEN p.n % 3 = 0 THEN $3::uuid ELSE $2::uuid END, CASE WHEN p.n % 3 = 0 THEN $5::uuid ELSE $4::uuid END, 'LZ' || $6 || lpad(p.n::text, 5, '0'), 'ps-' || p.n, 500, 9000, '{}'::jsonb, 'lz-key-' || $6 || '-' || p.n || '-padding-padding',
         '400002', 'Mumbai', (($7::text[])[1 + (p.n % 10)])::shipment_state, now() - ((p.n / 7) || ' minutes')::interval, now() - ((p.n / 7) || ' minutes')::interval,
         CASE WHEN p.n % 11 = 0 THEN ARRAY['vip'] ELSE ARRAY[]::text[] END
  FROM picked p`, [sellerId, prov.pid, prov2.pid, prov.sid, prov2.sid, stamp, states]);
await db.query(`UPDATE orders SET state = 'booked' WHERE seller_id = $1 AND id IN (SELECT order_id FROM shipments WHERE seller_id = $1)`, [sellerId]);
await db.query(`UPDATE shipments SET courier_cancelled_at = now() WHERE seller_id = $1 AND state = 'booked' AND (awb::text ~ '[05]$')`, [sellerId]);
// the other 400 orders have no courier: some incomplete (bad phone), some cancelled
await db.query(`UPDATE customers SET phone = '1234567890' WHERE id IN (SELECT o.customer_id FROM orders o WHERE o.seller_id = $1 AND NOT EXISTS (SELECT 1 FROM shipments s WHERE s.order_id = o.id) ORDER BY o.order_number LIMIT 90)`, [sellerId]);
await db.query(`UPDATE orders SET state = 'cancelled' WHERE id IN (SELECT o.id FROM orders o WHERE o.seller_id = $1 AND NOT EXISTS (SELECT 1 FROM shipments s WHERE s.order_id = o.id) ORDER BY o.order_number DESC LIMIT 60)`, [sellerId]);

const TABS = ['all', 'ready', 'pickup', 'in_transit', 'out_for_delivery', 'ndr', 'delivered', 'rto', 'lost', 'cancelled', 'failed'];
const qs = (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined && v !== '')).toString();
const walk = async (query, limit = 50, as = call) => {
  const ids = []; let cursor; let pages = 0; let total; let bytes = 0; let prev = null; let sorted = true;
  for (;;) {
    const r = await as('GET', `/v1/shipments/list?${qs({ ...query, limit, cursor })}`);
    if (r.s !== 200) return { error: r.s + ' ' + JSON.stringify(r.j).slice(0, 160) };
    pages += 1; bytes += r.bytes; if (r.j.total !== undefined) total = r.j.total;
    for (const row of r.j.items) { if (prev && row.ts > prev) sorted = false; prev = row.ts; ids.push(row.id); }
    if (!r.j.nextCursor) break; cursor = r.j.nextCursor; if (pages > 200) break;
  }
  return { ids, pages, total, bytes, sorted };
};

// ---- brute force: independent SQL, written differently from the route
const READY = `(char_length(btrim(c.full_name)) >= 2 AND right(regexp_replace(c.phone, '\\D', '', 'g'), 10) ~ '^[6-9][0-9]{9}$' AND char_length(btrim(coalesce(c.address_line_1,''))) >= 3 AND c.pincode ~ '^[0-9]{6}$' AND coalesce(c.city,'') <> '' AND coalesce(c.state,'') <> '' AND o.total_weight_g > 0 AND o.package_length_mm IS NOT NULL AND o.package_width_mm IS NOT NULL AND o.package_height_mm IS NOT NULL AND (o.payment_mode <> 'cod' OR o.cod_amount_paise > 0))`;
const SHIP_TAB = { all: 'TRUE', ready: 'FALSE', pickup: `s.state IN ('booked','pickup_pending','pickup_scheduled') AND s.courier_cancelled_at IS NULL`, in_transit: `s.state = 'in_transit'`, out_for_delivery: `s.state = 'out_for_delivery'`, ndr: `s.state = 'ndr'`, delivered: `s.state = 'delivered'`, rto: `s.state IN ('rto','rto_in_transit')`, lost: `s.state = 'lost'`, cancelled: `s.state = 'cancelled'`, failed: `s.courier_cancelled_at IS NOT NULL AND s.state <> 'cancelled'` };
const ORDER_TAB = { all: `(o.state = 'cancelled' OR ${READY})`, ready: `(o.state IN ('new','ready_to_ship') AND ${READY})`, failed: `(o.state IN ('new','ready_to_ship') AND NOT ${READY})`, cancelled: `o.state = 'cancelled'` };
const brute = async (tab, f = {}) => {
  // shipments
  const sp = [sellerId]; const sc = [SHIP_TAB[tab]]; const sadd = (v) => { sp.push(v); return '$' + sp.length; };
  if (f.pay) sc.push(`o.payment_mode = ${sadd(f.pay)}`);
  if (f.courier) sc.push(`cp.name = ${sadd(f.courier)}`);
  if (f.warehouse) sc.push(`w.name = ${sadd(f.warehouse)}`);
  if (f.tag) sc.push(`${sadd(f.tag)} = ANY(s.tags)`);
  if (f.q) { const p = sadd('%' + f.q + '%'); sc.push(`(o.order_number ILIKE ${p} OR c.full_name ILIKE ${p} OR s.awb ILIKE ${p} OR EXISTS (SELECT 1 FROM order_items i WHERE i.order_id = o.id AND i.name ILIKE ${p}))`); }
  const ships = (await db.query(`SELECT s.id FROM shipments s JOIN orders o ON o.id = s.order_id JOIN customers c ON c.id = o.customer_id JOIN warehouses w ON w.id = o.warehouse_id JOIN courier_providers cp ON cp.id = s.provider_id WHERE s.seller_id = $1 AND ${sc.join(' AND ')}`, sp)).rows.map((r) => r.id);
  // orders without a courier (an order has no courier and no tag: those filters leave none)
  let orders = [];
  if (ORDER_TAB[tab] && !f.courier && !f.tag) {
    const op = [sellerId]; const oc = [ORDER_TAB[tab]]; const oadd = (v) => { op.push(v); return '$' + op.length; };
    if (f.pay) oc.push(`o.payment_mode = ${oadd(f.pay)}`);
    if (f.warehouse) oc.push(`w.name = ${oadd(f.warehouse)}`);
    if (f.q) { const p = oadd('%' + f.q + '%'); oc.push(`(o.order_number ILIKE ${p} OR c.full_name ILIKE ${p} OR EXISTS (SELECT 1 FROM order_items i WHERE i.order_id = o.id AND i.name ILIKE ${p}))`); }
    orders = (await db.query(`SELECT o.id FROM orders o JOIN customers c ON c.id = o.customer_id JOIN warehouses w ON w.id = o.warehouse_id WHERE o.seller_id = $1 AND o.order_flow <> 'reverse' AND o.state IN ('new','ready_to_ship','cancelled') AND NOT EXISTS (SELECT 1 FROM shipments s WHERE s.order_id = o.id) AND ${oc.join(' AND ')}`, op)).rows.map((r) => r.id);
  }
  return new Set([...ships, ...orders]);
};
const same = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));

// ---- every tab, no filters: contiguous, complete, sorted, equal to brute force and to the summary
const summary = (await call('GET', '/v1/shipments/summary')).j.counts;
for (const tab of TABS) {
  const w = await walk({ tab }); const b = await brute(tab);
  if (w.error) { T(`Tab ${tab}: walk`, false, w.error); continue; }
  const unique = new Set(w.ids).size === w.ids.length;
  T(`Tab ${tab}: ${w.ids.length} rows in ${w.pages} batches of 50, none twice, newest first`, unique && w.sorted, JSON.stringify({ rows: w.ids.length, unique, sorted: w.sorted }));
  T(`Tab ${tab}: exactly the rows an independent query finds, and the first-batch total and the summary agree`, same(new Set(w.ids), b) && w.total === w.ids.length && summary[tab] === w.ids.length, JSON.stringify({ walked: w.ids.length, brute: b.size, total: w.total, summary: summary[tab] }));
}

// ---- filters on all records (not just the loaded ones)
for (const [name, f] of [['COD only', { pay: 'cod' }], ['courier Delhivery', { courier: (await db.query('SELECT name FROM courier_providers WHERE id = $1', [prov.pid])).rows[0].name }], ['second warehouse', { warehouse: 'Second' }], ['tag vip', { tag: 'vip' }], ['search "Blue Shirt"', { q: 'Blue Shirt' }], ['search "Buyer 12"', { q: 'Buyer 12' }]]) {
  const w = await walk({ tab: 'all', ...f }); const b = await brute('all', f);
  T(`Filter ${name}: ${w.ids?.length} rows equal brute force (${b.size})`, !w.error && same(new Set(w.ids), b), w.error || `${w.ids.length} vs ${b.size}`);
  const s = (await call('GET', `/v1/shipments/summary?${qs(f)}`)).j.counts;
  T(`Filter ${name}: the tab counts follow the filter (All = ${w.ids?.length})`, s.all === w.ids?.length, JSON.stringify(s.all));
}
const dt = await walk({ tab: 'all', from: '2000-01-01', to: '2000-01-02' });
T('A date range with no records returns nothing', !dt.error && dt.ids.length === 0, JSON.stringify(dt));

// ---- ids for "select all N matching"
const ids = (await call('GET', '/v1/shipments/ids?tab=ready')).j; const readyWalk = await walk({ tab: 'ready' });
T('/ids for the Ready tab equals the walked list (every row an order)', ids.items.length === readyWalk.ids.length && same(new Set(ids.items.map((x) => x.id)), new Set(readyWalk.ids)) && ids.items.every((x) => x.kind === 'order') && ids.truncated === false, `${ids.items.length} vs ${readyWalk.ids.length}`);
const idsCap = (await call('GET', '/v1/shipments/ids?tab=all&limit=100')).j;
T('/ids honours a limit and says when it cut the list', idsCap.items.length === 100 && idsCap.truncated === true);

// ---- the first screen is small and fast
const first = await call('GET', '/v1/shipments/list?tab=all&limit=50');
const t0 = Date.now(); const firstAgain = await call('GET', '/v1/shipments/list?tab=all&limit=50'); const firstMs = Date.now() - t0;
const t1 = Date.now(); const old = await call('GET', '/v1/shipments'); const oldMs = Date.now() - t1;
T(`First screen: 50 rows in ${firstAgain.bytes} bytes and ${firstMs} ms; the old load-everything endpoint: ${old.bytes} bytes and ${oldMs} ms`, first.j.items.length === 50 && firstAgain.bytes < old.bytes / 8, `new ${firstAgain.bytes} B / ${firstMs} ms vs old ${old.bytes} B / ${oldMs} ms`);

// ---- safety
const o = await other('GET', '/v1/shipments/list?tab=all'); const os = (await other('GET', '/v1/shipments/summary')).j.counts; const oi = (await other('GET', '/v1/shipments/ids?tab=all')).j;
T("Another seller sees none of these records (list, counts and ids)", o.j.items.length === 0 && os.all === 0 && oi.items.length === 0);
const bad = await call('GET', '/v1/shipments/list?tab=all&cursor=garbage');
T('A made-up cursor is refused (400), not obeyed', bad.s === 400);
const badTab = await call('GET', '/v1/shipments/list?tab=nope');
T('An unknown tab is refused (400)', badTab.s === 400);
const inj = await call('GET', `/v1/shipments/list?tab=all&q=${encodeURIComponent("x'; DROP TABLE shipments;--")}`);
T('Hostile search text is harmless', inj.s === 200 && inj.j.items.length === 0 && (await db.query("SELECT count(*)::int AS n FROM shipments")).rows[0].n > 0);
const fl = (await call('GET', '/v1/shipments/filters')).j;
T('Filter options list the seller\'s couriers, warehouses and channels', fl.warehouses.includes('Main') && fl.warehouses.includes('Second') && fl.couriers.length >= 1 && fl.channels.length >= 1, JSON.stringify(fl));

console.log(out.join('\n'));
console.log(`\n${out.filter((x) => x.startsWith('PASS')).length}/${out.length} passed`);
await db.end();
process.exit(out.some((x) => x.startsWith('FAIL')) ? 1 : 0);
