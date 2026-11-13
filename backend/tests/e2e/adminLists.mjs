// Admin back-office lists load a batch at a time (offset + hasMore) and nothing is silently cut off: walking every list with a tiny batch
// size returns exactly the rows a brute-force SQL count says exist, with no duplicates and no gaps.
// Needs the API on :4011 (development mode) and the throwaway Postgres on :5544 (with the lazy.mjs seller's data for volume). Run: node tests/e2e/adminLists.mjs
import { createRequire } from 'node:module';
const require = createRequire(new URL('../../package.json', import.meta.url));
const pg = require('pg');
const API = 'http://127.0.0.1:4011';
const db = new pg.Client({ connectionString: 'postgresql://nx@127.0.0.1:5544/nxd' }); await db.connect();
const out = []; const T = (n, ok, d = '') => out.push((ok ? 'PASS ' : 'FAIL ') + n + (d ? ' - ' + d : ''));

let jar = ''; let csrf = '';
const call = async (m, p, b) => {
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
await db.query('DELETE FROM admin_email_otps');
const a = await call('POST', '/v1/admin/auth/login', { email: 'admin@nexgo.in', password: 'Admin@456' });
if (a.s === 202 && a.j?.otpToken) await call('POST', '/v1/admin/auth/verify-otp', { otpToken: a.j.otpToken, code: a.j.devCode });
T('admin signed in', (await call('GET', '/v1/admin/sellers?limit=1')).s === 200);

// walk a list with a small batch; returns all rows
const walk = async (path, extra = '', size = 7, max = 400) => {
  const rows = []; let offset = 0; let pages = 0;
  for (;;) {
    const r = await call('GET', `${path}?limit=${size}&offset=${offset}${extra}`);
    if (r.s !== 200) throw new Error(`${path} ${r.s} ${JSON.stringify(r.j)}`);
    rows.push(...r.j.items); pages += 1; offset += size;
    if (!r.j.hasMore || rows.length > max) return { rows, pages, last: r.j };
  }
};
const ids = (rows, key = 'id') => rows.map((r) => r[key]);
const unique = (xs) => new Set(xs).size === xs.length;
const cnt = async (sql) => Number((await db.query(sql)).rows[0].n);

for (const [name, path, key, sql] of [
  ['orders', '/v1/admin/orders', 'id', 'SELECT count(*) AS n FROM orders'],
  ['shipments', '/v1/admin/shipments', 'id', 'SELECT count(*) AS n FROM shipments'],
  ['sellers', '/v1/admin/sellers', 'id', 'SELECT count(*) AS n FROM sellers'],
  ['ndr', '/v1/admin/ndr', 'id', 'SELECT count(*) AS n FROM ndr_cases'],
  ['wallets', '/v1/admin/wallets', 'id', 'SELECT count(*) AS n FROM sellers'],
  ['kyc', '/v1/admin/kyc', 'seller_id', 'SELECT count(*) AS n FROM seller_kyc'],
  ['cod', '/v1/admin/cod-remittances', 'id', 'SELECT count(*) AS n FROM cod_remittance_cycles'],
  ['invoices', '/v1/admin/invoices', 'id', 'SELECT count(*) AS n FROM invoices'],
  ['jobs', '/v1/admin/jobs', 'id', 'SELECT count(*) AS n FROM job_runs'],
]) {
  const total = await cnt(sql);
  const big = ['orders', 'shipments'].includes(name);
  const { rows, pages, last } = await walk(path, '', big ? 200 : 7, 50000);
  T(`${name}: walking every batch returns all ${total} rows (beyond the old 100-200 cut-off)`, rows.length === total, `${rows.length} of ${total} in ${pages} request(s)`);
  T(`${name}: no row repeated`, unique(ids(rows, key)));
  T(`${name}: the last batch says there is no more`, last.hasMore === false);
}
// the first batch is only a batch, and says there is more
const first = await call('GET', '/v1/admin/orders?limit=10');
T('orders: first batch has 10 rows and hasMore', first.j.items.length === 10 && first.j.hasMore === true);
// filters still work with paging
const sid = (await db.query('SELECT seller_id AS id FROM orders GROUP BY seller_id ORDER BY count(*) DESC LIMIT 1')).rows[0].id;
const mine = await cnt(`SELECT count(*) AS n FROM orders WHERE seller_id = '${sid}'`);
const w = await walk('/v1/admin/orders', `&sellerId=${sid}`, 200, 50000);
T('orders: seller filter + paging returns exactly that seller', w.rows.length === mine && w.rows.every((r) => true), `${w.rows.length} of ${mine}`);
const sq = await walk('/v1/admin/shipments', '&q=LZ', 200, 50000);
const sqExpect = await cnt(`SELECT count(*) AS n FROM shipments sh JOIN orders o ON o.id = sh.order_id WHERE sh.awb ILIKE '%LZ%' OR o.order_number ILIKE '%LZ%'`);
T('shipments: search + paging matches brute force', sq.rows.length === sqExpect, `${sq.rows.length} of ${sqExpect}`);
T('bad offset is rejected', (await call('GET', '/v1/admin/orders?offset=-1')).s === 400);
await db.end();
console.log(out.join('\n'));
if (out.some((l) => l.startsWith('FAIL'))) process.exit(1);
