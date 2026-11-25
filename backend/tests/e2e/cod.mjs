// COD remittance end-to-end check (needs a local API on :4011 and a throwaway Postgres on :5544). Hand-worked figures, seller on D+2.
// Run: node tests/e2e/cod.mjs
import { createRequire } from 'node:module';
const require = createRequire(new URL('../../package.json', import.meta.url));
const pg = require('pg');
const API = 'http://127.0.0.1:4011';
const db = new pg.Client({ connectionString: (process.env.E2E_DATABASE_URL || 'postgresql://nx@127.0.0.1:5544/nxd') }); await db.connect();
const out = []; const T = (n, ok, d = '') => out.push((ok ? 'PASS ' : 'FAIL ') + n + (d ? ' - ' + d : ''));
let jar = '', csrf = '';
const call = async (m, p, b) => {
  const r = await fetch(API + p, { method: m, headers: { 'content-type': 'application/json', ...(jar ? { cookie: jar } : {}), ...(m !== 'GET' && csrf ? { 'x-csrf-token': csrf } : {}) }, body: b ? JSON.stringify(b) : undefined });
  const set = r.headers.getSetCookie?.() ?? [];
  if (set.length) { const m2 = new Map(jar.split('; ').filter(Boolean).map((c) => c.split(/=(.*)/s).slice(0, 2))); for (const c of set) { const [kv] = c.split(';'); const [k, v] = kv.split(/=(.*)/s); m2.set(k, v); if (k === 'nx_csrf') csrf = decodeURIComponent(v); } jar = [...m2].map(([k, v]) => `${k}=${v}`).join('; '); }
  let j = null; try { j = await r.json(); } catch { /* empty */ }
  return { s: r.status, j };
};
const email = `cod${Date.now()}@example.com`;
let r = await call('POST', '/v1/auth/signup', { fullName: 'Cod Tester', email, password: 'Str0ng-Passw0rd!x', businessName: 'Cod Test Co', legalName: 'Cod Test Co', phone: '9876543210' });
if (r.s >= 300) { console.log('signup failed', r.s, JSON.stringify(r.j)); process.exit(1); }
await call('POST', '/v1/seller/agreement', {});
const sellerId = (await db.query('SELECT s.id FROM sellers s JOIN seller_memberships m ON m.seller_id = s.id JOIN users u ON u.id = m.user_id WHERE u.email = $1', [email])).rows[0].id;
const wh = await call('POST', '/v1/warehouses', { name: 'Main', warehouseType: 'primary', contactName: 'Owner', phone: '9876543210', addressLine1: '5 Test Lane', city: 'Mumbai', state: 'Maharashtra', pincode: '400001' });
const prov = (await db.query("SELECT cp.id AS pid, cs.id AS sid FROM courier_providers cp JOIN courier_services cs ON cs.provider_id = cp.id WHERE cp.code = 'delhivery' LIMIT 1")).rows[0];
let seq = 0;
const ship = async (n, mode, cod, state, deliveredAgo) => {
  const o = await call('POST', '/v1/orders', { warehouseId: wh.j.id, orderNumber: 'CD' + n, paymentMode: mode, codAmountPaise: cod, customer: { fullName: 'Buyer ' + n, phone: '9876543210', addressLine1: '1 Road', city: 'Mumbai', state: 'Maharashtra', pincode: '400002' }, items: [{ sku: 'S', name: 'Item', quantity: 1, unitPricePaise: Math.max(cod, 10000), weightG: 300 }], package: { weightG: 300, lengthMm: 100, widthMm: 100, heightMm: 100 } });
  if (o.s >= 300) throw new Error('order ' + n + ' ' + o.s + JSON.stringify(o.j));
  seq += 1;
  await db.query(`INSERT INTO shipments (seller_id,order_id,provider_id,service_id,awb,chargeable_weight_g,shipping_charge_paise,quote_snapshot,idempotency_key,destination_pincode,destination_city,state,booked_at,created_at,delivered_at)
    VALUES ($1,$2,$3,$4,$5,500,7000,'{}',$6,'400002','Mumbai',$7::shipment_state, now() - interval '6 days', now() - interval '6 days', ${deliveredAgo == null ? 'NULL' : `now() - interval '${deliveredAgo} days'`})`,
  [sellerId, o.j.id, prov.pid, prov.sid, 'CD' + Date.now().toString().slice(-7) + seq, 'cd-key-' + seq + '-' + Date.now() + '-padding-padding', state]);
};
const cod = async () => (await call('GET', '/v1/billing/cod')).j;

await db.query('UPDATE sellers SET remittance_days = 2 WHERE id = $1', [sellerId]);
await ship('A', 'cod', 50000, 'delivered', 3);   // delivered 3 days ago -> due yesterday
await ship('B', 'cod', 30000, 'delivered', 1);   // delivered yesterday -> due tomorrow
await ship('C', 'cod', 20000, 'in_transit', null); // not delivered -> owes nothing yet
await ship('D', 'prepaid', 0, 'delivered', 3);    // prepaid -> never COD

let d = await cod();
T('API answers', !!d?.summary, JSON.stringify(d).slice(0, 120));
T('Total due = delivered COD not yet paid (50,000 + 30,000)', d.summary.totalDuePaise === 80000, String(d.summary.totalDuePaise));
T('Due now = the parcel past D+2 (50,000)', d.summary.dueNowPaise === 50000, String(d.summary.dueNowPaise));
T('Next remittance = what is already due (50,000)', d.summary.nextRemittancePaise === 50000, String(d.summary.nextRemittancePaise));
const yesterday = new Date(Date.now() + 5.5 * 3600e3 - 864e5).toISOString().slice(0, 10);
const tomorrow = new Date(Date.now() + 5.5 * 3600e3 + 864e5).toISOString().slice(0, 10);
T('Next remittance date = delivered day + 2', String(d.summary.nextRemittanceDate).slice(0, 10) === yesterday, String(d.summary.nextRemittanceDate));
T('Remitted till date is 0', d.summary.remittedTillDatePaise === 0);
T('The due parcel was cut into one pending cycle automatically', d.items.length === 1 && d.items[0].status === 'pending' && Number(d.items[0].remittance_paise) === 50000 && Number(d.items[0].shipment_count) === 1, JSON.stringify(d.items[0] ?? null));
T('The cycle is due on delivered day + 2', String(d.items[0]?.due_date).slice(0, 10) === yesterday, String(d.items[0]?.due_date));
T('Freight is not taken a second time (wallet paid it at booking)', Number(d.items[0]?.freight_deduction_paise) === 0, String(d.items[0]?.freight_deduction_paise));
T('The other parcel waits for its day (tomorrow, 30,000)', d.upcoming.length === 1 && Number(d.upcoming[0].amount_paise) === 30000 && String(d.upcoming[0].due_date).slice(0, 10) === tomorrow, JSON.stringify(d.upcoming));

d = await cod();
T('Opening the page again makes no second cycle', d.items.length === 1, String(d.items.length));
const linked = (await db.query('SELECT count(*)::int AS n FROM shipments WHERE seller_id = $1 AND cod_cycle_id IS NOT NULL', [sellerId])).rows[0].n;
T('Exactly one parcel is linked to a cycle', linked === 1, String(linked));

// the seller is paid: 50,000 remitted
await db.query("UPDATE cod_remittance_cycles SET status = 'remitted', remitted_at = now(), payout_paise = net_remitted_paise, bank_reference = 'UTR1' WHERE seller_id = $1", [sellerId]);
d = await cod();
T('After payment: remitted 50,000', d.summary.remittedTillDatePaise === 50000, String(d.summary.remittedTillDatePaise));
T('After payment: total due 30,000', d.summary.totalDuePaise === 30000, String(d.summary.totalDuePaise));
T('After payment: nothing due yet, next = 30,000 on tomorrow', d.summary.dueNowPaise === 0 && d.summary.nextRemittancePaise === 30000 && String(d.summary.nextRemittanceDate).slice(0, 10) === tomorrow, JSON.stringify(d.summary));

// D+0: the remaining parcel is due today; a late delivery scan (delivered 4 days ago, recorded now) must not be missed
await db.query('UPDATE sellers SET remittance_days = 0 WHERE id = $1', [sellerId]);
await ship('E', 'cod', 10000, 'delivered', 4);
d = await cod();
T('D+0: both remaining parcels are cut, 40,000 due now', d.summary.totalDuePaise === 40000 && d.summary.dueNowPaise === 40000, JSON.stringify(d.summary));
T('Two payout cycles in total (paid one + new one)', d.items.length === 2, String(d.items.length));
const open = d.items.find((i) => i.status === 'pending');
T('The new cycle holds both late parcels (2 shipments, 40,000)', Number(open?.shipment_count) === 2 && Number(open?.remittance_paise) === 40000, JSON.stringify(open ?? null));
T('Nothing is left waiting outside a cycle', d.upcoming.length === 0, JSON.stringify(d.upcoming));
if (!open) { console.log(out.join(String.fromCharCode(10))); process.exit(1); }
const lines = await call('GET', `/v1/seller/cod-remittances/${open.id}/lines`);
T('Statement lists exactly the cycle\'s parcels', lines.j?.lines?.length === 2, String(lines.j?.lines?.length));

console.log(out.join('\n'));
await db.end();
process.exit(out.some((l) => l.startsWith('FAIL')) ? 1 : 0);
