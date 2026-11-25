// Aggregator webhook endpoints: a dashboard's "test" request must get a 200 (otherwise the URL cannot be saved), and nothing that looks like a tracking update may
// ever be accepted without the right token or swallowed when it cannot be read. Run through tests/support/runE2e.mjs.
import { createRequire } from 'node:module';
import http from 'node:http';
const require = createRequire(new URL('../../package.json', import.meta.url));
const pg = require('pg');
const db = new pg.Client({ connectionString: (process.env.E2E_DATABASE_URL || 'postgresql://nx@127.0.0.1:5544/nxd') }); await db.connect();
const out = []; const T = (n, ok, d = '') => { out.push((ok ? 'PASS ' : 'FAIL ') + n + (d ? ' - ' + d : '')); };
const SR = { path: '/v1/webhooks/carrier-events', token: 'srhook-srhook-srhook-1234' }; const LO = { path: '/v1/webhooks/lorrigo', token: 'hooktoken-hooktoken-1234' };
// Raw requests (fetch adds headers of its own): exactly the headers and body given.
const send = (method, path, headers = {}, body = '') => new Promise((resolve, reject) => {
  const req = http.request({ host: '127.0.0.1', port: 4011, method, path, headers: { ...headers, ...(body ? { 'content-length': Buffer.byteLength(body) } : method === 'POST' ? { 'content-length': 0 } : {}) } }, (res) => { let d = ''; res.on('data', (c) => { d += c; }); res.on('end', () => resolve({ s: res.statusCode, b: d })); });
  req.on('error', reject); if (body) req.write(body); req.end();
});
const json = { 'content-type': 'application/json' };
const rows = async () => (await db.query('SELECT count(*)::int AS n FROM shipment_events')).rows[0].n;
const before = await rows();
const real = JSON.stringify({ awb: '123456789', current_status: 'Delivered', current_status_id: 7, scans: [] });

for (const [name, w] of [['Shiprocket', SR], ['Lorrigo', LO]]) {
  const tok = { 'x-api-key': w.token };
  let r = await send('POST', w.path, { ...json, ...tok }, '{"test":true}'); T(`${name}: test ping with the token`, r.s === 200, `${r.s}`);
  r = await send('POST', w.path, { ...json, ...tok }); T(`${name}: empty body with the token`, r.s === 200, `${r.s}`);
  r = await send('POST', w.path, json); T(`${name}: empty body, no token`, r.s === 200, `${r.s}`);
  r = await send('POST', w.path, {}); T(`${name}: empty body, no headers at all`, r.s === 200, `${r.s}`);
  r = await send('POST', w.path, json, '{}'); T(`${name}: {} without a token is only a ping`, r.s === 200 && /ping/.test(r.b), `${r.s} ${r.b.slice(0, 60)}`);
  r = await send('POST', w.path, { ...json, 'x-api-key': 'wrong-wrong-wrong-1234' }, '{}'); T(`${name}: a WRONG token is refused even for a ping (a mistyped token is noticed)`, r.s === 401, `${r.s}`);
  r = await send('POST', w.path, json, real); T(`${name}: a tracking update without a token is refused`, r.s === 401, `${r.s}`);
  r = await send('POST', w.path, { ...json, 'x-api-key': 'wrong-wrong-wrong-1234' }, real); T(`${name}: a tracking update with a wrong token is refused`, r.s === 401, `${r.s}`);
  r = await send('POST', w.path, { ...json, ...tok }, real.slice(0, -8)); T(`${name}: a damaged update (broken JSON) is an error, never a silent 200`, r.s === 400, `${r.s}`);
  r = await send('POST', w.path, { 'content-type': 'text/plain', ...tok }, real); T(`${name}: an update sent as text/plain is read, not dropped`, r.s === 200 && /result/.test(r.b), `${r.s} ${r.b}`);
  r = await send('POST', w.path, { 'content-type': 'text/plain', ...tok }, 'awb=123&status=x'); T(`${name}: text that is not JSON is an error`, r.s === 400, `${r.s}`);
  r = await send('POST', w.path, { 'content-type': 'application/x-www-form-urlencoded', ...tok }, 'awb=123&status=x'); T(`${name}: a form post is an error, never a silent 200`, r.s === 415, `${r.s}`);
  r = await send('POST', w.path, { 'content-type': 'text/plain' }, real); T(`${name}: text/plain without a token is refused too`, r.s === 401, `${r.s}`);
  r = await send('POST', w.path, { ...json, ...tok }, real); T(`${name}: an update for an AWB we do not know is accepted (so the subscription survives)`, r.s === 200, `${r.s} ${r.b.slice(0, 60)}`);
}
let r = await send('GET', SR.path); T('Shiprocket: opening the URL in a browser answers 200 and reveals nothing', r.s === 200 && r.b === '{"ok":true,"ping":true}', `${r.s} ${r.b}`);
r = await send('POST', SR.path, { ...json, authorization: `Bearer ${SR.token}` }, '{}'); T('Shiprocket: the token as a Bearer header works too', r.s === 200 && /accepted/.test(r.b), `${r.s} ${r.b}`);
T('None of this recorded a tracking event', await rows() === before);

console.log(out.join('\n')); console.log(`\n${out.filter((x) => x.startsWith('PASS')).length}/${out.length} passed`);
await db.end(); process.exit(0);
