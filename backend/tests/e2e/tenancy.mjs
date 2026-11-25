// SEC-001 (P0): seller isolation, brute force over EVERY route the API registers (read from its own route table, so a new route is covered by itself).
// Seller A owns at least one row in every seller table, full of unique marker texts. Then, as seller B (a valid, signed-in owner) and as nobody:
//   - every GET without an id: no marker and no id of A may appear in the answer
//   - every GET with an id: A's ids of every kind are tried; none of A's data may come back
//   - every POST / PUT / PATCH / DELETE: A's ids in the path AND in the body; afterwards every row of A must be byte-for-byte unchanged
//   - every /v1/admin route: refused for a seller; every non-public route: refused without a session
// Run through tests/support/runE2e.mjs (TRUST_PROXY=true, so each request can come from its own address and the rate limiter does not stop the sweep).
import { createRequire } from 'node:module';
import { startFakeAggregator } from '../support/fakeAggregator.mjs';
const require = createRequire(new URL('../../package.json', import.meta.url));
const pg = require('pg');
const API = 'http://127.0.0.1:4011';
const db = new pg.Client({ connectionString: (process.env.E2E_DATABASE_URL || 'postgresql://nx@127.0.0.1:5544/nxd') }); await db.connect();
const out = []; const T = (n, ok, d = '') => { out.push((ok ? 'PASS ' : 'FAIL ') + n + (d ? ' - ' + d : '')); };
const rows = async (sql, args) => (await db.query(sql, args)).rows;
const fake = startFakeAggregator({ port: 4555, latencyMs: 5, courierIds: [] });
let ip = 0; const addr = () => { ip += 1; return `10.${(ip >> 16) & 255}.${(ip >> 8) & 255}.${ip & 255}`; };
const client = () => {
  let jar = ''; let csrf = '';
  return async (m, p, b) => {
    const r = await fetch(API + p, { method: m, redirect: 'manual', headers: { 'x-forwarded-for': addr(), ...(b !== undefined ? { 'content-type': 'application/json' } : {}), 'Idempotency-Key': `ten-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`, ...(jar ? { cookie: jar } : {}), ...(m !== 'GET' && csrf ? { 'x-csrf-token': csrf } : {}) }, body: b !== undefined ? JSON.stringify(b) : undefined });
    if (p.startsWith('/v1/auth/')) { const sc = r.headers.getSetCookie?.() ?? []; if (sc.length) { const kv = Object.fromEntries(jar.split('; ').filter(Boolean).map((x) => x.split(/=(.*)/s).slice(0, 2))); for (const c of sc) { const [k, v] = c.split(';')[0].split(/=(.*)/s); kv[k] = v; } jar = Object.entries(kv).map(([k, v]) => `${k}=${v}`).join('; '); csrf = decodeURIComponent(kv.nx_csrf || ''); } }
    const text = await r.text(); let j = null; try { j = JSON.parse(text); } catch { /* not json */ }
    return { s: r.status, j, text };
  };
};
const A = client(); const B = client(); const nobody = client();
const signup = async (c, tag) => {
  const email = `${tag}${Date.now()}@example.com`;
  await c('POST', '/v1/auth/signup', { fullName: `${tag} Person`, email, password: 'Str0ng-Passw0rd!x', businessName: `${tag} Co`, legalName: `${tag} Co`, phone: tag === 'zzsecreta' ? '9876500001' : '9876500002' });
  await c('POST', '/v1/seller/agreement', {});
  return (await rows('SELECT s.id, u.id AS uid FROM sellers s JOIN seller_memberships m ON m.seller_id = s.id JOIN users u ON u.id = m.user_id WHERE u.email = $1', [email]))[0];
};
const a = await signup(A, 'zzsecreta'); const b = await signup(B, 'plainb');
const MARK = 'ZZSECRETA';

// ---------------------------------------------------------------- A owns rows everywhere
const whA = (await A('POST', '/v1/warehouses', { name: `${MARK} Hub`, warehouseType: 'primary', contactName: `${MARK} Owner`, phone: '9876500003', addressLine1: `${MARK} Lane 5`, city: 'Mumbai', state: 'Maharashtra', pincode: '400001' })).j.id;
await B('POST', '/v1/warehouses', { name: 'B Hub', warehouseType: 'primary', contactName: 'B Owner', phone: '9876500004', addressLine1: '5 B Lane', city: 'Mumbai', state: 'Maharashtra', pincode: '400001' });
const order = async (c, wh, n, mark) => (await c('POST', '/v1/orders', { warehouseId: wh, orderNumber: `${mark}-${n}`, paymentMode: 'prepaid', customer: { fullName: `${mark} Buyer`, phone: `98765${String(10000 + n)}`, addressLine1: `${mark} Street 12`, city: 'Mumbai', state: 'Maharashtra', pincode: '400002' }, items: [{ sku: `${mark}SKU`, name: `${mark} Item`, quantity: 1, unitPricePaise: 50000, weightG: 300 }], package: { weightG: 300, lengthMm: 100, widthMm: 100, heightMm: 100 } })).j.id;
const oShip = await order(A, whA, 1, MARK); const oOpen = await order(A, whA, 2, MARK); const oNdr = await order(A, whA, 3, MARK);
const prov = (await rows("SELECT cp.id AS pid, cs.id AS sid, cp.code AS pcode, cs.code AS scode FROM courier_providers cp JOIN courier_services cs ON cs.provider_id = cp.id WHERE cp.aggregator = 'lorrigo' LIMIT 1"))[0];
for (const [o, n, state] of [[oShip, 1, 'booked'], [oNdr, 2, 'ndr']]) await db.query(`INSERT INTO shipments (seller_id, order_id, provider_id, service_id, awb, provider_shipment_id, chargeable_weight_g, shipping_charge_paise, quote_snapshot, idempotency_key, destination_pincode, destination_city, state) VALUES ($1,$2,$3,$4,$5,$6,500,9000,'{}',$7,'400002','Mumbai',$8)`, [a.id, o, prov.pid, prov.sid, `${MARK}AWB${n}`, `${MARK}PS${n}`, `ten-key-${n}-padding-padding`, state]);
await db.query("UPDATE orders SET state = 'booked' WHERE id = ANY($1::uuid[])", [[oShip, oNdr]]);
await db.query("INSERT INTO wallet_entries (seller_id,entry_type,amount_paise,reference_type,reference_id,idempotency_key,description) VALUES ($1,'credit',777777,'wallet_recharge','seed',$2,$3)", [a.id, `ten-${Date.now()}`, `${MARK} recharge`]);

// Generic seeding: one row of A in every remaining table that has a seller_id, built from the table's own columns.
const baseTables = new Set((await rows("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'")).map((r) => r.table_name));
const sellerTables = (await rows("SELECT table_name FROM information_schema.columns WHERE table_schema='public' AND column_name='seller_id' ORDER BY 1")).map((r) => r.table_name).filter((t) => baseTables.has(t));
const fks = await rows(`SELECT tc.table_name AS t, kcu.column_name AS c, ccu.table_name AS rt, ccu.column_name AS rc FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu USING (constraint_name, constraint_schema) JOIN information_schema.constraint_column_usage ccu USING (constraint_name, constraint_schema) WHERE tc.constraint_type='FOREIGN KEY' AND tc.table_schema='public'`);
const checks = await rows("SELECT c.conrelid::regclass::text AS t, pg_get_constraintdef(c.oid) AS d FROM pg_constraint c WHERE c.contype='c'");
const hasA = async (t) => (await rows(`SELECT count(*)::int AS n FROM ${t} WHERE seller_id = $1`, [a.id]))[0].n > 0;
const seed = async (t) => {
  if (await hasA(t)) return true;
  const cols = await rows("SELECT column_name AS c, data_type AS ty, udt_name AS udt, is_nullable AS n, column_default AS d, character_maximum_length AS len FROM information_schema.columns WHERE table_schema='public' AND table_name=$1", [t]);
  const vals = {};
  for (const c of cols) {
    if (c.c === 'seller_id') { vals[c.c] = a.id; continue; }
    const fk = fks.find((f) => f.t === t && f.c === c.c);
    if (fk) {
      const own = sellerTables.includes(fk.rt) ? (await rows(`SELECT ${fk.rc} AS v FROM ${fk.rt} WHERE seller_id = $1 LIMIT 1`, [a.id]))[0]?.v : undefined;
      const any = own ?? (fk.rt === 'users' ? a.uid : sellerTables.includes(fk.rt) ? undefined : (await rows(`SELECT ${fk.rc} AS v FROM ${fk.rt} LIMIT 1`))[0]?.v);
      if (any !== undefined) vals[c.c] = any; else if (c.n === 'NO') return false; continue;
    }
    const chk = checks.filter((k) => k.t === t && new RegExp(`\\b${c.c}\\b`).test(k.d)).map((k) => k.d).find((d) => /= ANY \(ARRAY\[|= ANY \(\(ARRAY\[/.test(d));
    if (c.d !== null && !/text|character/.test(c.ty)) continue;
    if (chk) { vals[c.c] = chk.match(/'([^']+)'/)[1]; continue; }
    if (c.n === 'YES' && !/text|character/.test(c.ty)) continue;
    if (c.d !== null) continue;
    if (c.ty === 'USER-DEFINED') { const e = (await rows('SELECT enumlabel FROM pg_enum WHERE enumtypid = $1::regtype ORDER BY enumsortorder LIMIT 1', [c.udt]))[0]?.enumlabel; vals[c.c] = e ?? `${MARK}@example.com`; }
    else if (c.ty === 'uuid') vals[c.c] = a.uid;
    else if (/int|numeric|double|real/.test(c.ty)) vals[c.c] = 7;
    else if (c.ty === 'boolean') vals[c.c] = true;
    else if (c.ty === 'date') vals[c.c] = '2026-10-01';
    else if (/timestamp/.test(c.ty)) vals[c.c] = new Date();
    else if (/json/.test(c.ty)) vals[c.c] = JSON.stringify({ note: MARK });
    else if (c.ty === 'ARRAY') vals[c.c] = [];
    else if (c.ty === 'bytea') vals[c.c] = Buffer.from(MARK);
    else if (c.n === 'NO') vals[c.c] = `${MARK}_${t}_${c.c}`.slice(0, c.len || 80);
  }
  const keys = Object.keys(vals);
  try { await db.query(`INSERT INTO ${t} (${keys.map((k) => `"${k}"`).join(',')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(',')})`, keys.map((k) => vals[k])); return true; } catch { return false; }
};
for (let round = 0; round < 3; round++) for (const t of sellerTables) await seed(t);
// the ones with rules the generic builder cannot guess
const tryq = (sql, args) => db.query(sql, args).catch((e) => e.message);
const nr = (await rows("SELECT e.enumlabel AS v FROM pg_enum e JOIN information_schema.columns c ON e.enumtypid = c.udt_name::regtype WHERE c.table_name='ndr_cases' AND c.column_name='ndr_reason' LIMIT 1"))[0]?.v;
if (!(await hasA('ndr_cases'))) await tryq("INSERT INTO ndr_cases (seller_id, shipment_id, reason_code, ndr_reason) SELECT seller_id, id, 'cust_unavailable', $2 FROM shipments WHERE seller_id = $1 AND state='ndr'", [a.id, nr]);
if (!(await hasA('weight_disputes'))) await tryq('INSERT INTO weight_disputes (seller_id, shipment_id, declared_weight_g, billed_weight_g, original_charge_paise, disputed_charge_paise, held_amount_paise, raised_by_provider) SELECT seller_id, id, 500, 900, 5000, 8000, 3000, $2 FROM shipments WHERE seller_id = $1 LIMIT 1', [a.id, prov.pid]);
if (!(await hasA('invoices'))) await tryq("INSERT INTO invoices (seller_id, invoice_number, period_start, period_end, subtotal_paise, gst_paise, total_paise) VALUES ($1,$2,'2026-01-01','2026-01-31',1000,180,1180)", [a.id, `${MARK}/INV/1`]);
if (!(await hasA('pickup_manifests'))) await tryq('INSERT INTO pickup_manifests (seller_id, manifest_no, provider_id) VALUES ($1,$2,$3)', [a.id, `${MARK}MF1`, prov.pid]);
if (!(await hasA('cancel_batches'))) await tryq('INSERT INTO cancel_batches (seller_id, created_by, total, finished_at) VALUES ($1,$2,1,now())', [a.id, a.uid]);
if (!(await hasA('assign_batches'))) await tryq('INSERT INTO assign_batches (seller_id, created_by, total, finished_at) VALUES ($1,$2,1,now())', [a.id, a.uid]);
if (!(await hasA('report_runs'))) await tryq("INSERT INTO report_runs (seller_id, report_type, range_start, range_end, row_count, file_name, csv_content, preview, created_by) VALUES ($1,'orders','2026-10-01','2026-10-02',1,$2,$3,$4,$5)", [a.id, `${MARK}.csv`, `${MARK},row`, JSON.stringify({ columns: [MARK], rows: [[MARK]] }), a.uid]);
if (!(await hasA('wallet_recharges'))) await tryq("INSERT INTO wallet_recharges (seller_id, amount_paise, status, provider_order_id) VALUES ($1, 5000, 'created', $2)", [a.id, `${MARK}_order`]);
for (let round = 0; round < 2; round++) for (const t of sellerTables) await seed(t);
// Background work must not touch A's seeded rows while the sweep runs (the comparison below is byte for byte).
await db.query("UPDATE assign_batch_items SET state='ok', finished_at=now() WHERE state IN ('queued','running')"); await db.query("UPDATE cancel_batch_items SET state='ok', finished_at=now() WHERE state IN ('queued','running')"); await db.query("UPDATE booking_attempts SET state='refused', context=NULL WHERE state NOT IN ('recorded','refused','cancelled')");
await db.query("UPDATE job_runs SET state='succeeded' WHERE state IN ('queued','running')").catch(() => {});
const unseeded = []; for (const t of sellerTables) if (!(await hasA(t))) unseeded.push(t);
T(`Seller A owns rows in at least 85% of the ${sellerTables.length} seller tables`, (sellerTables.length - unseeded.length) / sellerTables.length >= 0.85, `${sellerTables.length - unseeded.length}/${sellerTables.length}; none in: ${unseeded.join(', ') || '-'}`);

// ---------------------------------------------------------------- what must never appear in an answer to somebody else
const ids = {}; // table -> uuid ids of A
for (const t of sellerTables) { const c = (await rows("SELECT 1 FROM information_schema.columns WHERE table_name=$1 AND column_name='id' AND udt_name='uuid'", [t])).length; if (c) ids[t] = (await rows(`SELECT id FROM ${t} WHERE seller_id = $1 LIMIT 3`, [a.id])).map((r) => r.id); }
ids.order_items = (await rows('SELECT i.id FROM order_items i JOIN orders o ON o.id = i.order_id WHERE o.seller_id = $1 LIMIT 1', [a.id])).map((r) => r.id);
ids.sessions = (await rows('SELECT id FROM sessions WHERE user_id = $1 LIMIT 1', [a.uid])).map((r) => r.id);
const allIds = [...new Set(Object.values(ids).flat())];
const secretWords = [MARK, MARK.toLowerCase(), '9876500001', '9876500003', a.id, ...allIds];
const leaks = (text, asked = []) => secretWords.filter((w) => text.includes(w) && !asked.includes(w));

const spec = (await nobody('GET', '/openapi.json')).j; const routes = [];
for (const [path, ops] of Object.entries(spec.paths)) for (const m of Object.keys(ops)) routes.push({ m: m.toUpperCase(), path });
const PUBLIC = /^\/(health|ready|docs|openapi\.json)|^\/v1\/health\/|^\/v1\/(auth\/(login|signup|forgot-password|reset-password|logout|heartbeat)|admin\/auth\/|webhooks\/|public\/|locations\/|payments\/|channels\/shopify\/callback|admin\/accounts$)|^\/v2\/webhooks\//;
const seller = routes.filter((r) => r.path.startsWith('/v1/') && !r.path.startsWith('/v1/admin') && !PUBLIC.test(r.path) && !r.path.startsWith('/v1/auth/'));
const admin = routes.filter((r) => r.path.startsWith('/v1/admin') && !/\/v1\/admin\/(auth\/|accounts$)/.test(r.path));
T('The API describes its own routes (the sweep covers all of them)', seller.length > 100 && admin.length > 50, `${seller.length} seller routes, ${admin.length} admin routes`);
const fill = (path, id) => path.replace(/\{(\w+)\}/g, () => encodeURIComponent(id));

// control: the sweep can see A's data when A asks (so "no leak" below means something)
let seen = 0; for (const r of seller.filter((x) => x.m === 'GET' && !x.path.includes('{'))) { const x = await A('GET', r.path); if (x.s === 200 && leaks(x.text).length) seen += 1; }
T('Control: as seller A many lists DO show A\'s data', seen >= 15, `${seen} lists`);

// ---------------------------------------------------------------- 1. lists as B
const snapshot = async () => {
  const s = {};
  for (const t of sellerTables) s[t] = (await rows(`SELECT md5(COALESCE(string_agg(md5(to_jsonb(x)::text), ',' ORDER BY md5(to_jsonb(x)::text)), '')) AS h FROM ${t} x WHERE seller_id = $1`, [a.id]))[0].h;
  s.sellers = (await rows('SELECT md5(to_jsonb(x)::text) AS h FROM sellers x WHERE id = $1', [a.id]))[0].h;
  s.users = (await rows('SELECT md5(to_jsonb(x)::text) AS h FROM users x WHERE id = $1', [a.uid]))[0].h;
  s.order_items = (await rows('SELECT md5(COALESCE(string_agg(to_jsonb(i)::text, \',\' ORDER BY i.id), \'\')) AS h FROM order_items i JOIN orders o ON o.id = i.order_id WHERE o.seller_id = $1', [a.id]))[0].h;
  s.shipment_events = (await rows('SELECT md5(COALESCE(string_agg(to_jsonb(e)::text, \',\' ORDER BY e.id), \'\')) AS h FROM shipment_events e JOIN shipments x ON x.id = e.shipment_id WHERE x.seller_id = $1', [a.id]))[0].h;
  return s;
};
const before = await snapshot();
const bad = { list: [], byId: [], anon: [], admin: [] }; let asked = 0;
for (const r of seller.filter((x) => x.m === 'GET' && !x.path.includes('{'))) {
  for (const q of ['', `?q=${MARK}&search=${MARK}&sellerId=${a.id}&seller_id=${a.id}&ids=${allIds.slice(0, 20).join(',')}&shipmentIds=${(ids.shipments || []).join(',')}&status=all&page=1&pageSize=100&limit=100`]) {
    const x = await B('GET', r.path + q); asked += 1;
    const l = leaks(x.text, q ? [MARK, MARK.toLowerCase(), a.id, ...allIds] : []);
    // a search echoes the text that was asked for; anything else of A is a leak: compare against things the query did not contain
    const real = q ? ['9876500001', '9876500003', `${MARK} Buyer`, `${MARK} Street`, `${MARK} Hub`, `${MARK}AWB1`, `${MARK}-1`, `${MARK}/INV`].filter((w) => x.text.includes(w)) : l;
    if (real.length) bad.list.push(`${r.path}${q ? ' (with filters)' : ''}: ${real.slice(0, 2).join(', ')}`);
    if (x.s >= 500) bad.list.push(`${r.path}${q ? ' (with filters)' : ''}: HTTP ${x.s}`);
  }
}
T(`Lists: seller B sees nothing of seller A (${asked} requests, with and without filters), and nothing crashes`, bad.list.length === 0, bad.list.slice(0, 8).join(' | '));

// ---------------------------------------------------------------- 2. single records as B, with every id A owns
asked = 0; const idTries = [...allIds, `${MARK}AWB1`];
for (const r of seller.filter((x) => x.m === 'GET' && x.path.includes('{'))) for (const id of idTries) {
  const x = await B('GET', fill(r.path, id)); asked += 1;
  const l = leaks(x.text, [id, ...(id.startsWith(MARK) ? [MARK] : [])]);
  if (l.length) bad.byId.push(`${r.path} with ${id.slice(0, 12)}: ${x.s} ${l[0]}`);
  if (x.s >= 500) bad.byId.push(`${r.path}: HTTP ${x.s}`);
}
T(`Records: with A's own ids seller B gets none of A's data (${asked} requests), and nothing crashes`, bad.byId.length === 0, [...new Set(bad.byId)].slice(0, 8).join(' | '));

// ---------------------------------------------------------------- 3. changes as B: A's ids in the path and in a body that carries every field name we know
const first = (t) => ids[t]?.[0];
const mega = () => ({
  id: first('shipments'), ids: [...(ids.seller_notifications || [])], orderId: oOpen, orderIds: [oOpen], shipmentId: first('shipments'), shipmentIds: ids.shipments, warehouseId: whA, customerId: first('customers'), caseIds: ids.ndr_cases, caseId: first('ndr_cases'), disputeIds: ids.weight_disputes, disputeId: first('weight_disputes'),
  invoiceId: first('invoices'), documentId: first('documents'), evidenceDocumentIds: ids.documents, pickupRequestId: first('pickup_requests'), channelId: first('channel_connections'), membershipId: first('seller_memberships'), fileId: first('seller_files'), reportId: first('report_runs'), sellerId: a.id, paymentId: first('wallet_recharges'), awbs: [`${MARK}AWB1`], awb: `${MARK}AWB1`,
  providerCode: prov.pcode, serviceCode: prov.scode, courierProviderId: prov.pid, providerId: prov.pid, serviceId: prov.sid, orderNumber: `B-${Math.random().toString(36).slice(2, 8)}`, state: 'cancelled', action: 'reattempt', resolutionAction: 'reattempt', decision: 'accepted', answer: 'declined', status: 'all', add: ['hacked'], remove: ['vip'], tags: ['hacked'], all: true, name: 'Hacked', notes: 'Hacked', note: 'Hacked', message: 'Hacked hacked', subject: 'Hacked subject', title: 'Hacked', category: 'Operations', priority: 'normal', reason: 'Hacked reason',
  fullName: 'Hacked Person', contactName: 'Hacked Person', phone: '9811111111', email: 'hacked@example.com', addressLine1: 'Hacked lane 1', city: 'Mumbai', state_: 'Maharashtra', pincode: '400002', paymentMode: 'prepaid', codAmountPaise: 0, weightG: 300, requestedFor: '2026-12-01', scheduledDeliveryDate: '2026-12-01T10:00:00.000Z', amountPaise: 50000, from: '2026-10-01', to: '2026-10-02', type: 'orders', permissions: [], role: 'operations', warehouseType: 'primary', isDefault: true, isActive: false,
  customer: { fullName: 'Hacked Person', phone: '9811111111', addressLine1: 'Hacked lane 1', city: 'Mumbai', state: 'Maharashtra', pincode: '400002' }, package: { weightG: 900, lengthMm: 100, widthMm: 100, heightMm: 100 }, items: [{ sku: 'S', name: 'Item', quantity: 1, unitPricePaise: 5000, weightG: 300 }],
});
// Routes with stricter bodies: a body that passes their validation (so the ownership check behind it is really reached).
const sched = { reportType: 'delivery', frequency: 'daily', runTimes: ['09:00'], toEmails: ['x@example.com'] };
const OWN = {
  'POST /v1/shipping/quotes': { destinationPincode: '400002', pickupPincode: '400001', weightG: 300, paymentMode: 'prepaid' }, 'POST /v1/shipping/serviceability': { pickupPincode: '400001', deliveryPincode: '400002', weightG: 300 },
  'POST /v1/products': { sku: `${'B'}${Date.now()}`, name: 'B product', unitPricePaise: 100 }, 'POST /v1/channels': { provider: 'custom', displayName: 'B store', storeUrl: 'https://b.example.com' }, 'POST /v1/marketing/campaigns': { channel: 'email', name: 'B camp', audience: 'all', message: 'Hello there' },
  'PUT /v1/settings/{area}': { someKey: 'x' }, 'POST /v1/seller/team/employees': { fullName: 'B Emp', email: `bemp${Date.now()}@example.com`, password: 'Str0ng-Passw0rd!x', permissions: ['orders.manage'] }, 'PUT /v1/seller/team/{userId}/permissions': { permissions: ['orders.manage'] },
  'POST /v1/email-schedules': sched, 'PUT /v1/email-schedules/{scheduleId}': sched,
  'POST /v1/orders/bulk': { orders: [{ warehouseId: whA, orderNumber: `BULK${Date.now()}`, paymentMode: 'prepaid', customer: { fullName: 'Hacked Person', phone: '9811111111', addressLine1: 'Hacked lane 1', city: 'Mumbai', state: 'Maharashtra', pincode: '400002' }, items: [{ sku: 'S', name: 'Item', quantity: 1, unitPricePaise: 5000, weightG: 300 }], package: { weightG: 300, lengthMm: 100, widthMm: 100, heightMm: 100 } }] },
  'POST /v1/orders': { warehouseId: whA, orderNumber: `ONE${Date.now()}`, paymentMode: 'prepaid', customer: { fullName: 'Hacked Person', phone: '9811111111', addressLine1: 'Hacked lane 1', city: 'Mumbai', state: 'Maharashtra', pincode: '400002' }, items: [{ sku: 'S', name: 'Item', quantity: 1, unitPricePaise: 5000, weightG: 300 }], package: { weightG: 300, lengthMm: 100, widthMm: 100, heightMm: 100 } },
  'POST /v1/bank-accounts': { accountHolderName: 'B Person', accountNumber: '123456789012', ifscCode: 'HDFC0001234', bankName: 'HDFC Bank', branchName: 'Main', accountType: 'current' }, 'POST /v1/bank-accounts/{accountId}/verify': { verificationMethod: 'manual', verificationReference: 'REF12345' },
};
const guess = (msg) => { const e = msg.match(/Expected '([^']+)'/); if (e) return e[1]; if (/Expected array/.test(msg)) return []; if (/Expected object/.test(msg)) return {}; if (/Expected number/.test(msg)) return 1; if (/Expected boolean/.test(msg)) return true; if (/Expected string/.test(msg)) return 'Hacked text'; if (/uuid/i.test(msg)) return oOpen; if (/date/i.test(msg)) return '2026-12-01'; return undefined; };
let reached = 0; let blockedByValidation = []; let changes = 0; const crash = []; const leaked = [];
const SKIP = /^\/v1\/(sessions|auth)|\/v1\/channels\/shopify|\/v1\/wallet\/recharge|\/v1\/team/;
const wh0 = (await rows('SELECT count(*)::int AS n FROM orders WHERE warehouse_id = $1', [whA]))[0].n;
for (const r of seller.filter((x) => x.m !== 'GET')) {
  const targets = r.path.includes('{') ? allIds.filter((_, i) => i < 400) : [null]; let best = 'validation';
  for (const id of targets) {
    let body = OWN[`${r.m} ${r.path}`] ? { ...OWN[`${r.m} ${r.path}`] } : mega(); let x;
    for (let k = 0; k < 5; k++) {
      x = await B(r.m, id ? fill(r.path, id) : r.path, body); changes += 1;
      const fe = x.s === 400 && x.j?.details?.fieldErrors; if (!fe || !Object.keys(fe).length) break;
      for (const [f, msgs] of Object.entries(fe)) { const g = guess(msgs[0] || ''); if (g !== undefined) body[f] = g; else delete body[f]; }
    }
    if (!(x.s === 400 && x.j?.error === 'VALIDATION_ERROR')) best = 'reached';
    if (x.s >= 500 && x.s !== 501 && x.s !== 503) crash.push(`${r.m} ${r.path}: ${x.s}`);
    const echo = JSON.stringify(body) + (id ?? ''); const l = leaks(x.text).filter((w) => !echo.includes(w) && !echo.toUpperCase().includes(w.toUpperCase())); if (l.length) leaked.push(`${r.m} ${r.path}: ${l[0]}`);
    if (best === 'validation' && id && targets.indexOf(id) > 6) break; // the body never got past validation for this route: more ids would not either
  }
  if (best === 'reached') reached += 1; else if (!SKIP.test(r.path)) blockedByValidation.push(`${r.m} ${r.path}`);
}
const after = await snapshot();
const changed = Object.keys(before).filter((t) => before[t] !== after[t]);
T(`Changes: ${changes} write attempts by seller B with A's ids left every row of seller A unchanged`, changed.length === 0, changed.join(', '));
T('Changes: no answer to seller B contained A\'s data', leaked.length === 0, [...new Set(leaked)].slice(0, 6).join(' | '));
T('Changes: no write attempt crashed the server', crash.length === 0, [...new Set(crash)].slice(0, 8).join(' | '));
const writes = seller.filter((x) => x.m !== 'GET').length;
T('Changes: at least 85% of the write routes were really exercised past validation', reached / writes >= 0.85, `${reached}/${writes}; not: ${blockedByValidation.join(', ')}`);
T('A\'s wallet is untouched', Number((await rows("SELECT COALESCE(SUM(CASE WHEN entry_type IN ('credit','release') THEN amount_paise ELSE -amount_paise END),0) AS b FROM wallet_entries WHERE seller_id = $1 AND description = $2", [a.id, `${MARK} recharge`]))[0].b) === 777777);
T('Seller B could not attach an order to a warehouse of A', (await rows('SELECT count(*)::int AS n FROM orders WHERE warehouse_id = $1', [whA]))[0].n === wh0);
T('Nothing was asked of the courier on behalf of A', !(fake.stats.calls['POST /shipments/:id/cancel']) && !(fake.stats.calls['POST /shipments']));

// ---------------------------------------------------------------- 4. nobody, and a seller on the admin side
// Public by design, checked for what they say instead: the Shopify install link (sends a visitor to the login page), accepting an e-mailed invitation (its token is the
// key), and the impersonation banner (says only whether THIS browser is impersonating).
const BY_DESIGN = { 'GET /v1/channels/shopify/install': (x) => x.s === 302, 'POST /v1/team/invitations/accept': (x) => x.s === 400 || x.s === 404, 'GET /v1/impersonation': (x) => x.s === 200 && x.text === '{"active":false}', 'POST /v1/impersonation/exit': (x) => x.s === 409 };
for (const r of seller) { const x = await nobody(r.m, r.path.includes('{') ? fill(r.path, allIds[0]) : r.path, r.m === 'GET' ? undefined : mega()); const fine = BY_DESIGN[`${r.m} ${r.path}`]; if (fine ? !fine(x) : ![401, 403].includes(x.s)) bad.anon.push(`${r.m} ${r.path}: ${x.s}`); if (leaks(x.text).length) bad.anon.push(`${r.m} ${r.path} leaks`); }
T(`Without a session every one of the ${seller.length} seller routes answers 401 / 403`, bad.anon.length === 0, bad.anon.slice(0, 8).join(' | '));
for (const r of admin) for (const [who, c] of [['seller', B], ['nobody', nobody]]) { const x = await c(r.m, r.path.includes('{') ? fill(r.path, r.path.includes('sellers') ? a.id : allIds[0]) : r.path, r.m === 'GET' ? undefined : mega()); if (![401, 403].includes(x.s)) bad.admin.push(`${who} ${r.m} ${r.path}: ${x.s}`); }
T(`Every one of the ${admin.length} admin routes refuses a seller and a visitor`, bad.admin.length === 0, bad.admin.slice(0, 8).join(' | '));
const last = await snapshot(); T('Nothing of A changed in any of it', Object.keys(before).every((t) => before[t] === last[t]), Object.keys(before).filter((t) => before[t] !== last[t]).join(', '));

// ---------------------------------------------------------------- 5. public tracking shows no personal data
const pub = await nobody('GET', `/v1/public/track/${MARK}AWB1`);
T('Public tracking of A\'s AWB shows no customer, seller or amount', pub.s === 200 && !/Buyer|Street|9876|Hub|zzsecreta co/i.test(pub.text), `${pub.s} ${pub.text.slice(0, 120)}`);

console.log(out.join('\n')); console.log(`\n${out.filter((x) => x.startsWith('PASS')).length}/${out.length} passed`);
await db.end(); fake.close(); process.exit(0);
