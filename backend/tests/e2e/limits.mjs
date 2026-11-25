// DATA-003 / DATA-005: limits must be visible. A report of exactly 20,000 rows is complete; one row more is marked PARTIAL (answer, stored preview and file name). The numbered
// list offers only pages that really open, and says how many rows those are. Run through tests/support/runE2e.mjs.
import { createRequire } from 'node:module';
const require = createRequire(new URL('../../package.json', import.meta.url));
const pg = require('pg');
const API = 'http://127.0.0.1:4011';
const db = new pg.Client({ connectionString: (process.env.E2E_DATABASE_URL || 'postgresql://nx@127.0.0.1:5544/nxd') }); await db.connect();
const out = []; const T = (n, ok, d = '') => { out.push((ok ? 'PASS ' : 'FAIL ') + n + (d ? ' - ' + d : '')); };
let jar = ''; let csrf = '';
const call = async (m, p, b) => {
  const r = await fetch(API + p, { method: m, headers: { 'content-type': 'application/json', ...(jar ? { cookie: jar } : {}), ...(m !== 'GET' && csrf ? { 'x-csrf-token': csrf } : {}) }, body: b ? JSON.stringify(b) : undefined });
  const sc = r.headers.getSetCookie?.() ?? [];
  if (sc.length) { const kv = Object.fromEntries(jar.split('; ').filter(Boolean).map((x) => x.split(/=(.*)/s).slice(0, 2))); for (const c of sc) { const [k, v] = c.split(';')[0].split(/=(.*)/s); kv[k] = v; } jar = Object.entries(kv).map(([k, v]) => `${k}=${v}`).join('; '); csrf = decodeURIComponent(kv.nx_csrf || ''); }
  const text = await r.text(); let j = null; try { j = JSON.parse(text); } catch { /* csv */ } return { s: r.status, j, text };
};
const email = `lim${Date.now()}@example.com`;
await call('POST', '/v1/auth/signup', { fullName: 'Lim Tester', email, password: 'Str0ng-Passw0rd!x', businessName: 'Lim Co', legalName: 'Lim Co', phone: '9876543210' });
await call('POST', '/v1/seller/agreement', {});
const wh = (await call('POST', '/v1/warehouses', { name: 'Main', warehouseType: 'primary', contactName: 'Owner', phone: '9876543210', addressLine1: '5 Test Lane', city: 'Mumbai', state: 'Maharashtra', pincode: '400001' })).j.id;
const first = (await call('POST', '/v1/orders', { warehouseId: wh, orderNumber: 'LIM-0', paymentMode: 'prepaid', customer: { fullName: 'Buyer One', phone: '9822200001', addressLine1: '12 Street', city: 'Mumbai', state: 'Maharashtra', pincode: '400002' }, items: [{ sku: 'S', name: 'Item', quantity: 1, unitPricePaise: 50000, weightG: 300 }], package: { weightG: 300, lengthMm: 100, widthMm: 100, heightMm: 100 } })).j.id;
const copy = (from, to) => db.query(`INSERT INTO orders (seller_id, warehouse_id, customer_id, order_number, external_reference, payment_mode, cod_amount_paise, subtotal_paise, total_weight_g, state, package_length_mm, package_width_mm, package_height_mm, volumetric_weight_g, total_paise)
  SELECT seller_id, warehouse_id, customer_id, 'LIM-' || g, 'LIM-' || g, payment_mode, 0, subtotal_paise, total_weight_g, 'new', package_length_mm, package_width_mm, package_height_mm, volumetric_weight_g, total_paise FROM orders, generate_series($2::int, $3::int) g WHERE id = $1`, [first, from, to]);
await copy(1, 19999);
const day = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10); const prev = new Date(Date.now() - 86400e3).toISOString().slice(0, 10);
let r = await call('POST', '/v1/reports', { type: 'orders', from: prev, to: day });
T('20,000 rows: the report is complete and not marked partial', r.s === 201 && r.j.row_count === 20000 && r.j.preview.truncated === false && !/PARTIAL/.test(r.j.file_name), `${r.s} ${r.j?.row_count} ${r.j?.file_name}`);
let d = await call('GET', `/v1/reports/${r.j.id}/download`); T('...and the file really has 20,000 rows', d.text.trim().split('\n').length === 20001, String(d.text.trim().split('\n').length - 1));
await copy(20000, 20000);
r = await call('POST', '/v1/reports', { type: 'orders', from: prev, to: day });
T('20,001 rows: marked as incomplete in the answer and in the file name', r.s === 201 && r.j.row_count === 20000 && r.j.preview.truncated === true && /PARTIAL-first-20000-rows/.test(r.j.file_name), `${r.j?.row_count} ${r.j?.preview?.truncated} ${r.j?.file_name}`);
d = await call('GET', `/v1/reports/${r.j.id}`); T('...also when it is opened again later', d.j.preview.truncated === true && /PARTIAL/.test(d.j.file_name));
r = await call('GET', '/v1/shipments/list?tab=ready&page=1&pageSize=25');
T('List of 20,001: the real total is shown, only reachable pages are offered', r.j.total === 20001 && r.j.reachable === 10000 && r.j.pages === 400, JSON.stringify({ total: r.j.total, reachable: r.j.reachable, pages: r.j.pages }));
r = await call('GET', '/v1/shipments/list?tab=ready&page=400&pageSize=25'); T('The last offered page opens and is full', r.j.items.length === 25, String(r.j.items.length));
r = await call('GET', '/v1/shipments/list?tab=ready&page=401&pageSize=25'); T('A page beyond it is empty and says so (no crash, same totals)', r.s === 200 && r.j.items.length === 0 && r.j.reachable === 10000 && r.j.pages === 400);
r = await call('GET', '/v1/shipments/list?tab=ready&page=1&pageSize=25&q=LIM-7'); T('An older order is still found by search', r.j.items.length > 0);
let cursor = null; const seen = new Set(); for (let i = 0; i < 105; i++) { const x = await call('GET', `/v1/shipments/list?tab=ready&limit=200${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`); for (const it of x.j.items) seen.add(it.id); cursor = x.j.nextCursor; if (!cursor) break; }
T('The export path (cursor) reaches every one of the 20,001, once each', seen.size === 20001, String(seen.size));
console.log(out.join('\n')); console.log(`\n${out.filter((x) => x.startsWith('PASS')).length}/${out.length} passed`);
await db.end(); process.exit(0);
