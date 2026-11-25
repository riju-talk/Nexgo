// Runs the end-to-end suites, each against its OWN fresh database and its OWN API process, and prints one line per suite.
//   node tests/support/runE2e.mjs            every suite
//   node tests/support/runE2e.mjs speed cod  only these
//
// Isolation is the point. The API reads the repository's .env for anything that is not already set, so a run that merely left a variable out used to pick up the
// REAL courier keys. Here every provider, mail, storage and payment variable is set explicitly, courier base URLs are always loopback, and the process starts in
// an empty folder, so no real key can be loaded and no real courier, mailbox or bucket can be reached.
// Needs a throwaway Postgres on 127.0.0.1:5544 (user nx, may create databases).
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, openSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const pg = require('pg');
const backend = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const tsx = join(backend, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const SERVER = 'postgresql://nx@127.0.0.1:5544';
const work = mkdtempSync(join(tmpdir(), 'nexgo-e2e-'));

const LORRIGO = { LORRIGO_API_KEY: 'test', LORRIGO_BASE_URL: 'http://127.0.0.1:4555' };
const SHIPROCKET = { SHIPROCKET_EMAIL: 'api@test.example', SHIPROCKET_PASSWORD: 'pw', SHIPROCKET_BASE_URL: 'http://127.0.0.1:4666' };
// Each suite: which aggregators are configured, and (for suites that need volume) which suite must run first in the same database.
const SUITES = {
  readiness: { env: LORRIGO }, concurrency: { env: LORRIGO }, reconcile: { env: { ...LORRIGO, RECONCILE_AFTER_SECONDS: '2', BOOKING_STALE_SECONDS: '10' } }, heartbeat: { env: LORRIGO, worker: true }, tenancy: { env: LORRIGO },
  speed: { env: LORRIGO }, cancel: { env: LORRIGO }, actions: { env: LORRIGO }, tracking: { env: LORRIGO }, notifications: { env: LORRIGO }, webhooks: { env: { ...LORRIGO, ...SHIPROCKET } },
  shiprocket: { env: SHIPROCKET }, failover: { env: { ...LORRIGO, ...SHIPROCKET } },
  cod: { env: LORRIGO }, metrics: { env: LORRIGO }, manifests: { env: LORRIGO }, 'states-otp': { env: LORRIGO }, lazy: { env: LORRIGO }, adminLists: { env: LORRIGO, after: 'lazy' }, platform: { env: LORRIGO, after: 'lazy' },
};
const BASE = {
  NODE_ENV: 'development', PORT: '4011', FRONTEND_ORIGIN: 'http://localhost:3021', COOKIE_SECURE: 'false',
  CSRF_SECRET: 'e2e-csrf-secret-e2e-csrf-secret-e2e', LOCAL_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'), ENCRYPTION_KEY: '0'.repeat(63) + '1', RAZORPAY_WEBHOOK_SECRET: 'e2e-razorpay-secret',
  // Everything that could reach the outside world, set to something that cannot.
  LORRIGO_API_KEY: '', LORRIGO_BASE_URL: 'http://127.0.0.1:9', LORRIGO_WEBHOOK_TOKEN: 'hooktoken-hooktoken-1234',
  SHIPROCKET_EMAIL: '', SHIPROCKET_PASSWORD: '', SHIPROCKET_BASE_URL: 'http://127.0.0.1:9', SHIPROCKET_WEBHOOK_TOKEN: 'srhook-srhook-srhook-1234',
  RAZORPAY_KEY_ID: '', RAZORPAY_KEY_SECRET: '', SHOPIFY_CLIENT_ID: '', SHOPIFY_CLIENT_SECRET: '', STORAGE_ENABLED: 'false', AWS_ACCESS_KEY_ID: '', AWS_SECRET_ACCESS_KEY: '',
  SMTP_HOST: '127.0.0.1', SMTP_PORT: '9', SMTP_USER: '', SMTP_PASSWORD: '', MASTER_OTP_EMAIL: '', MASTER_OTP_CODE: '', ADMIN_API_SECRET: '', DEV_SUPERADMIN_EMAIL: '', DEV_SUPERADMIN_PASSWORD: '',
  TRACKING_POLL_MINUTES: '0', ASSIGN_PAUSE_RETRY_SECONDS: '2', ASSIGN_PROBE_SECONDS: '4',
};
const system = Object.fromEntries(['PATH', 'Path', 'SystemRoot', 'TEMP', 'TMP', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'ComSpec'].filter((k) => process.env[k]).map((k) => [k, process.env[k]]));

const admin = async (sql) => { const c = new pg.Client({ connectionString: `${SERVER}/postgres` }); await c.connect(); try { await c.query(sql); } finally { await c.end(); } };
const dropDb = async (name) => admin(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stop = (child) => new Promise((resolve) => { if (!child || child.exitCode !== null) return resolve(); child.once('exit', resolve); spawnSync(process.platform === 'win32' ? 'taskkill' : 'kill', process.platform === 'win32' ? ['/pid', String(child.pid), '/T', '/F'] : ['-9', String(child.pid)], { stdio: 'ignore' }); setTimeout(resolve, 4000); });

async function startApi(env, logName) {
  const log = openSync(join(work, `${logName}.log`), 'w');
  const child = spawn(process.execPath, [tsx, join(backend, 'src', 'local.ts')], { cwd: work, env: { ...system, ...env }, stdio: ['ignore', log, log] });
  for (let i = 0; i < 120; i++) {
    if (child.exitCode !== null) throw new Error(`API exited at start: ${readFileSync(join(work, `${logName}.log`), 'utf8').slice(-600)}`);
    try { if ((await fetch('http://127.0.0.1:4011/health')).ok) return child; } catch { /* not up yet */ }
    await sleep(500);
  }
  throw new Error('API did not start');
}

const TEMPLATE = 'nxe2e_template';
await dropDb(TEMPLATE); await admin(`CREATE DATABASE ${TEMPLATE}`);
const migrated = spawnSync(process.execPath, [tsx, join(backend, 'src', 'db', 'migrate.ts')], { cwd: work, env: { ...system, ...BASE, DATABASE_URL: `${SERVER}/${TEMPLATE}` }, encoding: 'utf8' });
if (migrated.status !== 0) { console.error('Migrations failed on an empty database:\n' + (migrated.stderr || migrated.stdout)); process.exit(1); }
console.log(`migrations on an empty database: ${(migrated.stdout.match(/Applied/g) || []).length} applied`);

const wanted = process.argv.slice(2).filter((a) => SUITES[a]); const names = wanted.length ? wanted : Object.keys(SUITES);
let bad = 0;
for (const name of names) {
  const suite = SUITES[name]; const file = join(backend, 'tests', 'e2e', `${name}.mjs`);
  const dbName = suite.after ? `nxe2e_${suite.after}`.toLowerCase().replace(/-/g, '_') : `nxe2e_${name}`.toLowerCase().replace(/-/g, '_');
  const url = `${SERVER}/${dbName}`;
  const env = { ...BASE, ...suite.env, DATABASE_URL: url, E2E_DATABASE_URL: url };
  let api; const t0 = Date.now();
  try {
    if (!suite.after) { await dropDb(dbName); await admin(`CREATE DATABASE ${dbName} TEMPLATE ${TEMPLATE}`); }
    api = await startApi(suite.worker ? { ...env, NODE_ENV: 'test' } : env, name);
    const run = spawnSync(process.execPath, [file], { cwd: backend, env: { ...system, ...env, E2E_TSX: tsx, E2E_WORKDIR: work }, encoding: 'utf8', timeout: 420_000, maxBuffer: 64e6 });
    const text = `${run.stdout}\n${run.stderr}`; const pass = (text.match(/^PASS /gm) || []).length; const fail = (text.match(/^FAIL /gm) || []);
    const crashed = run.status !== 0 && !fail.length; const ok = pass > 0 && !fail.length && !crashed;
    if (!ok) bad += 1;
    console.log(`${ok ? 'ok  ' : 'BAD '} ${name.padEnd(14)} ${pass} passed, ${fail.length} failed${crashed ? `, CRASHED (${run.status ?? run.error?.code})` : ''}  ${Math.round((Date.now() - t0) / 1000)}s`);
    if (!ok) console.log(text.split('\n').filter((l) => l.startsWith('FAIL ')).slice(0, 12).map((l) => '       ' + l.slice(0, 400)).join('\n') || ('       ' + text.trim().slice(-900)));
  } catch (e) { bad += 1; console.log(`BAD  ${name.padEnd(14)} ${String(e.message).slice(0, 700)}`); }
  finally { await stop(api); }
}
console.log(`\n${names.length - bad}/${names.length} suites passed. Logs: ${work}`);
process.exit(bad ? 1 : 0);
