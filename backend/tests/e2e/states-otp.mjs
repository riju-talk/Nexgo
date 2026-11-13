// End-to-end check of (1) state abbreviations on orders and (2) the admin sign-in code going to the admin's own verification inbox.
// Needs the API on :4011 (development) and a throwaway Postgres on :5544. Run: node tests/e2e/states-otp.mjs
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

// ---- states
const call = client();
const email = `st${Date.now()}@example.com`;
await call('POST', '/v1/auth/signup', { fullName: 'State Tester', email, password: 'Str0ng-Passw0rd!x', businessName: 'State Co', legalName: 'State Co', phone: '9876543210' });
await call('POST', '/v1/seller/agreement', {});
const wh = await call('POST', '/v1/warehouses', { name: 'Main', warehouseType: 'primary', contactName: 'Owner', phone: '9876543210', addressLine1: '5 Test Lane', city: 'Kolkata', state: 'WB', pincode: '700001' });
T('A warehouse saved with state "WB" is stored as West Bengal', wh.s === 201 || wh.s === 200, JSON.stringify(wh.j).slice(0, 120));
const stored = (await db.query("SELECT state FROM warehouses WHERE id = $1", [wh.j.id])).rows[0];
T('Warehouse state is the standard name', stored?.state === 'West Bengal', stored?.state);
const stamp = Date.now().toString().slice(-6);
const order = (n, state, pin = '711101', city = 'Howrah') => call('POST', '/v1/orders', { warehouseId: wh.j.id, orderNumber: `ST${stamp}${n}`, paymentMode: 'prepaid', customer: { fullName: 'Subhasis Roy', phone: '9876543210', addressLine1: '12 Road', city, state, pincode: pin }, items: [{ sku: 'S', name: 'Item', quantity: 1, unitPricePaise: 50000, weightG: 400 }], package: { weightG: 400, lengthMm: 100, widthMm: 100, heightMm: 100 } });
let r = await order('A', 'WB');
T('Pincode 711101 with state "WB" is accepted (this was refused as "belongs to West Bengal, not WB")', r.s === 201 || r.s === 200, JSON.stringify(r.j).slice(0, 160));
const saved = (await db.query("SELECT c.state FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.id = $1", [r.j.id])).rows[0];
T('The customer state is stored as West Bengal', saved?.state === 'West Bengal', saved?.state);
r = await order('B', 'wb');
T('Lower case "wb" works too', r.s === 201 || r.s === 200, JSON.stringify(r.j).slice(0, 120));
r = await order('C', 'West Bengal');
T('The full name still works', r.s === 201 || r.s === 200);
r = await order('D', 'MH');
T('A wrong state ("MH" for a West Bengal pincode) is still refused, now with full names', r.s === 400 && /West Bengal, not Maharashtra/.test(r.j?.message || r.j?.error || ''), JSON.stringify(r.j));
const bulk = await call('POST', '/v1/orders/bulk', { orders: ['E', 'F'].map((n, i) => ({ warehouseId: wh.j.id, orderNumber: `ST${stamp}${n}`, paymentMode: 'prepaid', customer: { fullName: 'Bulk Buyer', phone: '9876543210', addressLine1: '12 Road', city: 'Howrah', state: i ? 'W.B.' : 'WB', pincode: '711101' }, items: [{ sku: 'S', name: 'Item', quantity: 1, unitPricePaise: 50000, weightG: 400 }], package: { weightG: 400, lengthMm: 100, widthMm: 100, heightMm: 100 } })) });
T('Bulk upload accepts "WB" for Howrah', bulk.s === 200 && bulk.j.results?.[0]?.ok === true, JSON.stringify(bulk.j).slice(0, 200));

// ---- admin code destination
const login = async (e) => (await client()('POST', '/v1/admin/auth/login', { email: e, password: 'Admin@456' }));
await db.query("UPDATE platform_admins SET otp_email = NULL WHERE user_id = (SELECT id FROM users WHERE email = 'admin@nexgo.in')");
let a = await login('admin@nexgo.in');
T('With no verification inbox set, the code goes to the sign-in email', a.s === 202 && a.j.sentTo === 'a•••@nexgo.in', JSON.stringify(a.j?.sentTo));
await db.query("UPDATE platform_admins SET otp_email = 'person.real@gmail.com' WHERE user_id = (SELECT id FROM users WHERE email = 'admin@nexgo.in')");
a = await login('admin@nexgo.in');
T("With a verification inbox set, the code goes there, not to the sign-in email", a.s === 202 && a.j.sentTo === 'p•••@gmail.com', JSON.stringify(a.j?.sentTo));
await db.query("UPDATE platform_admins SET otp_email = NULL WHERE user_id = (SELECT id FROM users WHERE email = 'admin@nexgo.in')");

console.log(out.join('\n'));
console.log(`\n${out.filter((x) => x.startsWith('PASS')).length}/${out.length} passed`);
await db.end();
process.exit(out.some((x) => x.startsWith('FAIL')) ? 1 : 0);
