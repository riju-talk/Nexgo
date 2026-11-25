// OPS-001 / OPS-004: the worker is a separate process. While it is down, accepted work must be kept, the seller must be told the truth (saved, delayed, NOT booked),
// the health endpoint must say so, and everything must run by itself when the worker comes back. Also: the worker killed in the middle of a batch loses and repeats nothing.
// Run through tests/support/runE2e.mjs (it starts the API with QUEUES_IN_API=false).
import { createRequire } from 'node:module';
import { spawn, spawnSync } from 'node:child_process';
import { startFakeAggregator } from '../support/fakeAggregator.mjs';
const require = createRequire(new URL('../../package.json', import.meta.url));
const pg = require('pg');
const API = 'http://127.0.0.1:4011';
const db = new pg.Client({ connectionString: (process.env.E2E_DATABASE_URL || 'postgresql://nx@127.0.0.1:5544/nxd') }); await db.connect();
const out = []; const T = (n, ok, d = '') => { out.push((ok ? 'PASS ' : 'FAIL ') + n + (d ? ' - ' + d : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 40000) => { const end = Date.now() + ms; for (;;) { const v = await fn(); if (v || Date.now() > end) return v; await sleep(400); } };
const svc = (await db.query("SELECT cs.id, cs.code, cs.external_service_id AS ext, cp.code AS pcode FROM courier_services cs JOIN courier_providers cp ON cp.id = cs.provider_id WHERE cp.aggregator = 'lorrigo' AND cs.is_active ORDER BY cs.code LIMIT 1")).rows[0];
const fake = startFakeAggregator({ port: 4555, latencyMs: 250, courierIds: [svc.ext] });
let jar = ''; let csrf = '';
const call = async (m, p, b) => {
  const r = await fetch(API + p, { method: m, headers: { 'content-type': 'application/json', ...(jar ? { cookie: jar } : {}), ...(m !== 'GET' && csrf ? { 'x-csrf-token': csrf } : {}) }, body: b ? JSON.stringify(b) : undefined });
  const sc = r.headers.getSetCookie?.() ?? [];
  if (sc.length) { const kv = Object.fromEntries(jar.split('; ').filter(Boolean).map((x) => x.split(/=(.*)/s).slice(0, 2))); for (const c of sc) { const [k, v] = c.split(';')[0].split(/=(.*)/s); kv[k] = v; } jar = Object.entries(kv).map(([k, v]) => `${k}=${v}`).join('; '); csrf = decodeURIComponent(kv.nx_csrf || ''); }
  let j = null; try { j = await r.json(); } catch { /* empty */ } return { s: r.status, j };
};
const email = `hb${Date.now()}@example.com`;
await call('POST', '/v1/auth/signup', { fullName: 'Hb Tester', email, password: 'Str0ng-Passw0rd!x', businessName: 'Hb Co', legalName: 'Hb Co', phone: '9876543210' });
await call('POST', '/v1/seller/agreement', {});
const sellerId = (await db.query('SELECT s.id FROM sellers s JOIN seller_memberships m ON m.seller_id = s.id JOIN users u ON u.id = m.user_id WHERE u.email = $1', [email])).rows[0].id;
const wh = await call('POST', '/v1/warehouses', { name: 'Main', warehouseType: 'primary', contactName: 'Owner', phone: '9876543210', addressLine1: '5 Test Lane', city: 'Mumbai', state: 'Maharashtra', pincode: '400001' });
await db.query(`INSERT INTO seller_courier_access (seller_id, service_id, account_mode, state, cod_enabled, auto_assign_eligible) VALUES ($1,$2,'platform','enabled',true,true)`, [sellerId, svc.id]);
const card = (await db.query(`INSERT INTO rate_cards (seller_id, name, state) VALUES ($1,'Hb','active') RETURNING id`, [sellerId])).rows[0].id;
await db.query(`INSERT INTO rate_card_rates (rate_card_id, service_id, zone_code, min_weight_g, base_weight_g, base_price_paise, additional_weight_g, additional_price_paise) VALUES ($1,$2,'national',0,500,5000,500,0)`, [card, svc.id]);
await db.query("INSERT INTO wallet_entries (seller_id,entry_type,amount_paise,reference_type,reference_id,idempotency_key,description) VALUES ($1,'credit',5000000,'wallet_recharge','seed',$2,'seed')", [sellerId, 'hb-' + Date.now()]);
let seq = 0; const stamp = Date.now().toString().slice(-6);
const mk = async (n, weight = 300) => { const ids = []; for (let i = 0; i < n; i++) { const k = ++seq; const r = await call('POST', '/v1/orders', { warehouseId: wh.j.id, orderNumber: `HB${stamp}${k}`, paymentMode: 'prepaid', customer: { fullName: 'Buyer Name' + k, phone: `95${String(10000000 + k * 7)}`, addressLine1: '12 Road', city: 'Mumbai', state: 'Maharashtra', pincode: '400002' }, items: [{ sku: 'S', name: 'Item', quantity: 1, unitPricePaise: 50000, weightG: weight }], package: { weightG: weight, lengthMm: 100, widthMm: 100, heightMm: 100 } }); ids.push(r.j.id); } return ids; };
const booked = async (ids) => (await db.query('SELECT count(*)::int AS n, count(DISTINCT awb)::int AS a FROM shipments WHERE order_id = ANY($1::uuid[])', [ids])).rows[0];
const debits = async (ids) => (await db.query("SELECT count(*)::int AS n FROM wallet_entries w JOIN shipments s ON s.id::text = w.reference_id WHERE s.order_id = ANY($1::uuid[]) AND w.entry_type='debit'", [ids])).rows[0].n;
const health = async () => (await fetch(API + '/health/worker')).status;

// a worker, as the compose file starts it
let worker;
const startWorker = () => { worker = spawn(process.execPath, [process.env.E2E_TSX, 'src/worker.ts'], { cwd: new URL('../..', import.meta.url), env: process.env, stdio: 'ignore' }); };
const killWorker = async () => { spawnSync(process.platform === 'win32' ? 'taskkill' : 'kill', process.platform === 'win32' ? ['/pid', String(worker.pid), '/T', '/F'] : ['-9', String(worker.pid)], { stdio: 'ignore' }); await sleep(800); };

// 1. no worker has ever run
T('No worker: /health/worker answers 503', await health() === 503, String(await health()));
T('...also at the public address /v1/health/worker (the only prefix nginx forwards), without a session', (await fetch(API + '/v1/health/worker')).status === 503);
T('...and the API itself stays healthy (the site does not go down with the worker)', (await fetch(API + '/health')).status === 200 && (await fetch(API + '/ready')).status === 200);
const first = await mk(6);
let q = await call('POST', '/v1/shipments/assign-batch', { orderIds: first });
T('Orders queued while the worker is down are accepted, and the answer says processing is delayed', q.s === 202 && q.j.queued === 6 && q.j.workerDelayed === true, JSON.stringify(q.j));
await sleep(3500);
let g = await call('GET', `/v1/shipments/assign-batch/${q.j.id}`);
T('Progress says stalled, 0 assigned; nothing is called booked', g.j.stalled === true && g.j.assigned === 0 && g.j.queued === 6 && !g.j.finished_at, JSON.stringify({ stalled: g.j.stalled, assigned: g.j.assigned, queued: g.j.queued }));
g = await call('GET', '/v1/shipments/assign-batch/active');
T('Track (after a refresh) sees the same waiting batch, marked stalled', g.j.batch?.id === q.j.id && g.j.batch.stalled === true);
T('Nothing was booked or charged meanwhile', (await booked(first)).n === 0 && await debits(first) === 0);
const again = await call('POST', '/v1/shipments/assign-batch', { orderIds: first });
T('Pressing Assign again queues nothing twice', again.s === 200 && again.j.queued === 0 && again.j.notQueued.length === 0, JSON.stringify({ queued: again.j.queued, notQueued: again.j.notQueued }));

// 2. the worker comes back
startWorker();
await until(async () => await health() === 200, 30000);
T('Worker started: /health/worker answers 200', await health() === 200);
await until(async () => (await booked(first)).n === 6);
T('The waiting orders are booked by themselves: 6 shipments, 6 AWBs, 6 debits', (await booked(first)).n === 6 && (await booked(first)).a === 6 && await debits(first) === 6, JSON.stringify(await booked(first)));
g = await call('GET', `/v1/shipments/assign-batch/${q.j.id}`);
T('Progress is finished and no longer stalled', !!g.j.finished_at && g.j.stalled === false && g.j.assigned === 6);

// 3. every order of a request is accounted for: queued, or not queued with a reason
const [incomplete] = await mk(1); await db.query('UPDATE orders SET total_weight_g = 0, volumetric_weight_g = 0 WHERE id = $1', [incomplete]);
const [cancelled] = await mk(1); await call('PATCH', `/v1/orders/${cancelled}/state`, { state: 'cancelled' });
const [fine] = await mk(1); const ghost = '00000000-0000-4000-8000-000000000001';
q = await call('POST', '/v1/shipments/assign-batch', { orderIds: [incomplete, cancelled, fine, first[0], ghost] });
const why = Object.fromEntries((q.j.notQueued || []).map((x) => [x.id, x.reason]));
T('Incomplete, cancelled, already booked and unknown orders each come back with their reason; the good one is queued', q.j.queued === 1 && /incomplete/.test(why[incomplete]) && /cancelled/.test(why[cancelled]) && /already has a courier/.test(why[first[0]]) && /not found/i.test(why[ghost]) && !why[fine], JSON.stringify(why));
T('Counts add up: queued + not queued = asked', q.j.queued + q.j.notQueued.length === 5);

// 4. the worker is killed in the middle of a batch
await db.query("UPDATE assign_batch_items SET started_at = now() WHERE state = 'running'");
fake.mode.latencyMs = 900;
const mid = await mk(10);
q = await call('POST', '/v1/shipments/assign-batch', { orderIds: mid });
await until(async () => (fake.stats.calls['POST /shipments'] || 0) >= 8, 30000);
await killWorker();
fake.mode.latencyMs = 60;
const partial = await booked(mid);
T('Worker killed mid-batch: not everything was recorded (the test really hit the middle)', partial.n < 10, JSON.stringify(partial));
// what a running row looks like after the stale limit has passed
await db.query("UPDATE assign_batch_items SET started_at = now() - interval '10 minutes' WHERE state = 'running'");
startWorker();
await until(async () => (await booked(mid)).n === 10, 90000);
const live = [...fake.orders.values()].filter((o) => o.shipment && !o.cancelled);
const ids = (await db.query('SELECT nexgo_order_id AS n FROM orders WHERE id = ANY($1::uuid[])', [mid])).rows.map((r) => r.n);
const perOrder = ids.map((n) => live.filter((o) => o.ref.startsWith(n)).length);
T('After the restart every order is booked exactly once: 10 shipments, 10 AWBs, 10 debits, 1 parcel each at the courier', (await booked(mid)).n === 10 && (await booked(mid)).a === 10 && await debits(mid) === 10 && perOrder.every((x) => x === 1), JSON.stringify({ ...(await booked(mid)), debits: await debits(mid), perOrder }));
T('The courier was never asked to ship the same order twice', fake.stats.repeatShips === 0, String(fake.stats.repeatShips));
T('No unfinished booking is left', (await until(async () => (await db.query("SELECT count(*)::int AS n FROM booking_attempts WHERE state IN ('started','unknown','accepted','cancel_needed')")).rows[0].n === 0, 30000)) === true);

// 5. the worker dies quietly: noticed within a minute
await killWorker();
await db.query("UPDATE worker_heartbeats SET beat_at = now() - interval '2 minutes'");
await sleep(3500);
T('A worker that stopped is noticed (its last heartbeat is old): 503 again', await health() === 503);

console.log(out.join('\n')); console.log(`\n${out.filter((x) => x.startsWith('PASS')).length}/${out.length} passed`);
await db.end(); fake.close(); process.exit(0);
