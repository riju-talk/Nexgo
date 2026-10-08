import { execSync } from 'node:child_process';
import { db } from './client.js';

// Run on every deploy after migrations: seeds the base demo accounts only once, then (idempotently) the sample activity.
const run = (script: string) => execSync(`npm run ${script}`, { stdio: 'inherit' });
const exists = (await db.query(`SELECT 1 FROM users WHERE email IN ('demo@acmeexports.com','admin@nexgo.in') HAVING count(*) = 2`)).rows[0];
await db.end();
if (!exists) ['seed:demo-seller', 'seed:demo-network', 'seed:demo-admin', 'seed:demo-data'].forEach(run);
run('seed:demo-activity');
