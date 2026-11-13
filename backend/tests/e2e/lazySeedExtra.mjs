// Adds volume for the lists lazy.mjs does not seed (NDR cases, weight disputes, manifests, notifications, wallet entries, invoices) to the latest "lazy" test seller,
// so the browser check can scroll through them. Local throwaway Postgres only. Run: node tests/e2e/lazySeedExtra.mjs
import { createRequire } from 'node:module';
const require = createRequire(new URL('../../package.json', import.meta.url));
const pg = require('pg');
const db = new pg.Client({ connectionString: 'postgresql://nx@127.0.0.1:5544/nxd' }); await db.connect();
const S = (await db.query(`SELECT s.id FROM sellers s JOIN seller_memberships m ON m.seller_id = s.id JOIN users u ON u.id = m.user_id WHERE u.email LIKE 'lazy%@example.com' AND u.email NOT LIKE 'lazyo%' ORDER BY u.created_at DESC LIMIT 1`)).rows[0].id;
const type = (await db.query(`SELECT udt_name FROM information_schema.columns WHERE table_name='ndr_cases' AND column_name='ndr_reason'`)).rows[0].udt_name;
const reason = (await db.query(`SELECT enumlabel FROM pg_enum WHERE enumtypid = $1::regtype LIMIT 1`, [type])).rows[0].enumlabel;
const prov = (await db.query('SELECT provider_id FROM shipments WHERE seller_id = $1 LIMIT 1', [S])).rows[0].provider_id;
const n = async (t) => Number((await db.query(`SELECT count(*) AS n FROM ${t} WHERE seller_id = $1`, [S])).rows[0].n);
if (!(await n('ndr_cases'))) await db.query(`INSERT INTO ndr_cases (seller_id, shipment_id, reason_code, ndr_reason) SELECT seller_id, id, 'cust_unavailable', $2::${type} FROM shipments WHERE seller_id = $1 AND state = 'ndr' LIMIT 120`, [S, reason]);
if (!(await n('weight_disputes'))) await db.query(`INSERT INTO weight_disputes (seller_id, shipment_id, declared_weight_g, billed_weight_g, original_charge_paise, disputed_charge_paise, held_amount_paise, raised_by_provider) SELECT seller_id, id, 500, 900, 5000, 8000, 3000, $2 FROM shipments WHERE seller_id = $1 AND state IN ('delivered','in_transit') LIMIT 60`, [S, prov]);
if (!(await n('pickup_manifests'))) await db.query(`INSERT INTO pickup_manifests (seller_id, manifest_no, provider_id) SELECT $1, 'MFTEST' || lpad(g::text, 4, '0'), $2 FROM generate_series(1, 45) g`, [S, prov]);
if (!(await n('seller_notifications'))) await db.query(`INSERT INTO seller_notifications (seller_id, kind, title) SELECT $1, 'delivered', 'Test notification ' || g FROM generate_series(1, 70) g`, [S]);
if (!(await n('invoices'))) await db.query(`INSERT INTO invoices (seller_id, invoice_number, period_start, period_end, subtotal_paise, gst_paise, total_paise) SELECT $1, 'LZ/' || g, '2026-01-01', '2026-01-31', 1000, 180, 1180 FROM generate_series(1, 30) g`, [S]);
if (!(await n('wallet_entries'))) await db.query(`INSERT INTO wallet_entries (seller_id, entry_type, amount_paise, reference_type, reference_id, idempotency_key, description) SELECT $1, 'credit', 1000, 'test', 't' || g, 'lazytest-' || g, 'Recharge ' || g FROM generate_series(1, 60) g`, [S]);
for (const t of ['ndr_cases', 'weight_disputes', 'pickup_manifests', 'seller_notifications', 'invoices', 'wallet_entries']) console.log(t, await n(t));
await db.end();
