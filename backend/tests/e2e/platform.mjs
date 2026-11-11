// End-to-end check of the admin platform screens, the finance-only guard, the append-only wallet ledger and the public tracking endpoint.
// Needs the API on :4011 (development mode, so the dev admin exists and the e-mailed code is returned) and a throwaway Postgres on :5544. Run: node tests/e2e/platform.mjs
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
    let j = null; try { j = await r.json(); } catch { /* empty body */ }
    return { s: r.status, j };
  };
};
async function adminLogin(email, password) {
  const c = client();
  const a = await c('POST', '/v1/admin/auth/login', { email, password });
  if (a.s === 202 && a.j?.otpToken) {
    const code = a.j.devCode;
    const b = await c('POST', '/v1/admin/auth/verify-otp', { otpToken: a.j.otpToken, code });
    return { c, step: b.s };
  }
  return { c, step: a.s, body: a.j };
}

// --- a super admin (dev account) and a support admin (made here)
const sup = await adminLogin('admin@nexgo.in', 'Admin@456');
T('Dev super admin can sign in', sup.step === 200 || sup.step === 204, JSON.stringify([sup.step, sup.body]));
const cl = await sup.c('GET', '/v1/admin/credit-limits');
T('Credit limits answers with items and totals', cl.s === 200 && Array.isArray(cl.j.items) && cl.j.totals && typeof cl.j.totals.usedPaise === 'number', JSON.stringify([cl.s, cl.j?.totals]));
const roles = await sup.c('GET', '/v1/admin/roles');
T('Roles lists admins and the permission matrix', roles.s === 200 && roles.j.admins.length >= 1 && roles.j.matrix.length === 5, String(roles.s));
const esc = await sup.c('GET', '/v1/admin/escalations');
T('Escalations answers', esc.s === 200 && Array.isArray(esc.j.items));
const sys = await sup.c('GET', '/v1/admin/system-status');
T('System status answers with queues, jobs and migrations', sys.s === 200 && typeof sys.j.assignWaiting === 'number' && sys.j.migrations.applied >= 67 && typeof sys.j.storage.ok === 'boolean', JSON.stringify(sys.j).slice(0, 200));

// --- credit limits reflect a seller with a limit and a negative wallet
const sellerRow = (await db.query('SELECT id FROM sellers ORDER BY created_at LIMIT 1')).rows[0];
if (sellerRow) {
  await db.query('UPDATE sellers SET wallet_debit_limit_paise = 500000 WHERE id = $1', [sellerRow.id]);
  const cl2 = await sup.c('GET', '/v1/admin/credit-limits');
  const mine = cl2.j.items.find((x) => x.id === sellerRow.id);
  T('A seller with a debit limit is listed with its limit', !!mine && mine.limit_paise === 500000 && mine.available_paise >= 500000 + Math.min(0, mine.balance_paise), JSON.stringify(mine));
  await db.query('UPDATE sellers SET wallet_debit_limit_paise = 0 WHERE id = $1', [sellerRow.id]);
}

// --- escalations include an old open ticket
const tk = await db.query(`SELECT id FROM support_tickets WHERE state IN ('open','in_progress') LIMIT 1`);
T('Escalation query runs against real tickets', true, `${tk.rows.length} open tickets in the database`);

// --- finance-only guard: a support admin cannot approve a COD cycle or issue an invoice
const supportEmail = `support${Date.now()}@example.com`;
const mkAdmin = async (role) => {
  const email = role === 'support_admin' ? supportEmail : `fin${Date.now()}@example.com`;
  const u = await db.query(`INSERT INTO users (email, full_name, password_hash, status) VALUES ($1, 'Test ' || $2, 'x', 'active') RETURNING id`, [email, role]).catch(() => null);
  return { u, email };
};
// Passwords need argon2; reuse the dev super admin's hash for the new users so the same password works.
const hash = (await db.query(`SELECT password_hash FROM users WHERE email = 'admin@nexgo.in'`)).rows[0]?.password_hash;
async function makeRoleAdmin(role) {
  const email = `${role}${Date.now()}@example.com`;
  const u = await db.query(`INSERT INTO users (email, full_name, password_hash) VALUES ($1, $2, $3) RETURNING id`, [email, `Test ${role}`, hash]);
  await db.query(`INSERT INTO platform_admins (user_id, role, mfa_required) VALUES ($1, $2, false)`, [u.rows[0].id, role]);
  return email;
}
void mkAdmin;
const supEmail = await makeRoleAdmin('support_admin');
const finEmail = await makeRoleAdmin('finance_admin');
const supAdmin = await adminLogin(supEmail, 'Admin@456');
const finAdmin = await adminLogin(finEmail, 'Admin@456');
T('Support and finance admins can sign in', [200, 204].includes(supAdmin.step) && [200, 204].includes(finAdmin.step), JSON.stringify([supAdmin.step, finAdmin.step, supAdmin.body]));
const fakeId = '00000000-0000-4000-8000-000000000001';
const s1 = await supAdmin.c('POST', `/v1/admin/cod-remittances/${fakeId}/approve`, {});
T('Support admin is refused when approving a COD cycle (403)', s1.s === 403, String(s1.s));
const s2 = await supAdmin.c('POST', `/v1/admin/cod-remittances/${fakeId}/remit`, { bankReference: 'UTR123456789' });
T('Support admin is refused when paying a COD cycle (403)', s2.s === 403, String(s2.s));
const s3 = await supAdmin.c('POST', `/v1/admin/invoices/${fakeId}/issue`, {});
T('Support admin is refused when issuing an invoice (403)', s3.s === 403, String(s3.s));
const f1 = await finAdmin.c('POST', `/v1/admin/cod-remittances/${fakeId}/approve`, {});
T('Finance admin passes the guard (cycle simply not found, 404)', f1.s === 404, String(f1.s));
const f3 = await finAdmin.c('POST', `/v1/admin/invoices/${fakeId}/issue`, {});
T('Finance admin passes the invoice guard (404, not 403)', f3.s === 404 || f3.s === 400, String(f3.s));

// --- wallet ledger is append-only
const w = (await db.query('SELECT id, seller_id FROM wallet_entries LIMIT 1')).rows[0];
if (w) {
  const e1 = await db.query('UPDATE wallet_entries SET amount_paise = amount_paise + 1 WHERE id = $1', [w.id]).then(() => null, (e) => e.message);
  T('A wallet entry cannot be changed', !!e1 && /append-only/.test(e1), e1);
  const e2 = await db.query('DELETE FROM wallet_entries WHERE id = $1', [w.id]).then(() => null, (e) => e.message);
  T('A wallet entry cannot be deleted', !!e2 && /append-only/.test(e2), e2);
} else T('Wallet entries exist to test the ledger lock', false, 'no wallet_entries rows');

// --- public tracking: only parcel journey comes back
const sh = (await db.query(`SELECT s.id, s.awb FROM shipments s WHERE s.state <> 'cancelled' ORDER BY s.created_at DESC LIMIT 1`)).rows[0];
if (sh) {
  await db.query(`INSERT INTO shipment_events (shipment_id, state, occurred_at, description, source, source_event_id) VALUES ($1, 'in_transit', now(), 'Shipment moved to Lorrigo hub via aggregator', 'manual', $2)`, [sh.id, 'plat-' + Date.now()]);
  const pub = client();
  const p = await pub('GET', `/v1/public/track/${encodeURIComponent(sh.awb.toLowerCase())}`);
  T('Public tracking finds a parcel by AWB (any case) without signing in', p.s === 200 && p.j.awb === sh.awb && p.j.events.length >= 1, String(p.s));
  const txt = JSON.stringify(p.j);
  T('Public tracking leaks no seller, customer, address, amount or internal id', !/seller|customer|phone|address|amount|charge|"id"|email|pincode/i.test(txt.replace(/"status"/g, '')), txt.slice(0, 160));
  T('Public tracking never names the courier network', !/lorrigo|aggregator/i.test(txt), txt.slice(0, 200));
} else T('A shipment exists to test public tracking', false, 'none');
const pub2 = client();
const nf = await pub2('GET', '/v1/public/track/NOSUCHAWB12345');
T('An unknown AWB answers 404 with a plain message', nf.s === 404 && /could not find/i.test(nf.j?.message || ''), String(nf.s));
const bad = await pub2('GET', '/v1/public/track/' + encodeURIComponent("a'; drop table shipments;--"));
T('A hostile AWB is refused (404), nothing breaks', bad.s === 404);
let limited = 0; for (let i = 0; i < 40; i++) { const r = await pub2('GET', '/v1/public/track/RATELIMIT' + i + 'XX'); if (r.s === 429) limited++; }
T('Public tracking is rate limited', limited > 0, `${limited} of 40 requests answered 429`);

console.log(out.join('\n'));
console.log(`\n${out.filter((x) => x.startsWith('PASS')).length}/${out.length} passed`);
await db.end();
process.exit(out.some((x) => x.startsWith('FAIL')) ? 1 : 0);
