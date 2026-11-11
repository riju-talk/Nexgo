import type { FastifyInstance } from 'fastify';
import { db } from '../db/client.js';
import { requirePlatformAdmin } from '../lib/adminAuth.js';
import { checkStorage } from '../lib/storage.js';

// What each platform role may do. Mirrors the guards in lib/adminAuth.ts, shown read-only on the Role permissions screen.
export const ROLE_MATRIX = [
  { role: 'super_admin', label: 'Super admin', can: ['Everything', 'Create other administrators'] },
  { role: 'operations_admin', label: 'Operations', can: ['Couriers, zones, pincode rules, rate cards', 'Suspend or restore sellers', 'View a seller panel as the seller'] },
  { role: 'finance_admin', label: 'Finance', can: ['Approve and pay COD cycles', 'Issue invoices', 'Add or deduct wallet money', 'Review KYC and sellers'] },
  { role: 'support_admin', label: 'Support', can: ['View sellers, shipments and tickets', 'Answer tickets', 'View a seller panel as the seller'] },
  { role: 'analyst', label: 'Analyst', can: ['Read-only access to reports and dashboards'] },
];

export default async function adminPlatformRoutes(app: FastifyInstance) {
  // Credit limits: how far each seller may go below zero, and how much of it is used.
  app.get('/v1/admin/credit-limits', { preHandler: requirePlatformAdmin }, async () => {
    const r = await db.query(
      `SELECT s.id, s.legal_name, s.nexgo_code, s.wallet_debit_limit_paise AS limit_paise,
              COALESCE(w.bal,0)::bigint AS balance_paise
         FROM sellers s
         LEFT JOIN LATERAL (SELECT SUM(CASE WHEN entry_type IN ('credit','release') THEN amount_paise WHEN entry_type IN ('debit','hold') THEN -amount_paise ELSE amount_paise END) AS bal FROM wallet_entries WHERE seller_id = s.id) w ON true
        WHERE s.wallet_debit_limit_paise > 0 OR COALESCE(w.bal,0) < 0
        ORDER BY (CASE WHEN COALESCE(w.bal,0) < 0 THEN -COALESCE(w.bal,0) ELSE 0 END) DESC, s.legal_name LIMIT 300`);
    const items = r.rows.map((x) => {
      const balance = Number(x.balance_paise); const limit = Number(x.limit_paise);
      const used = balance < 0 ? -balance : 0;
      return { id: x.id, legal_name: x.legal_name, nexgo_code: x.nexgo_code, limit_paise: limit, balance_paise: balance, used_paise: used, available_paise: Math.max(0, balance + limit), utilisation_pct: limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : null };
    });
    return { items, totals: { sellers: items.length, limitPaise: items.reduce((a, x) => a + x.limit_paise, 0), usedPaise: items.reduce((a, x) => a + x.used_paise, 0) } };
  });

  // Platform administrators and the permission matrix.
  app.get('/v1/admin/roles', { preHandler: requirePlatformAdmin }, async () => {
    const r = await db.query(
      `SELECT u.id, u.full_name, u.email, pa.role, pa.created_at,
              (pa.totp_enrolled_at IS NOT NULL) AS authenticator_enrolled
         FROM platform_admins pa JOIN users u ON u.id = pa.user_id ORDER BY pa.created_at`);
    return { admins: r.rows, matrix: ROLE_MATRIX };
  });

  // Escalations: tickets that need a person now (urgent or high, or any open ticket older than 48 hours).
  app.get('/v1/admin/escalations', { preHandler: requirePlatformAdmin }, async () => {
    const r = await db.query(
      `SELECT t.id, t.subject, t.priority, t.state, t.created_at, s.legal_name AS seller_name,
              floor(extract(epoch FROM (now() - t.created_at)) / 3600)::int AS age_hours
         FROM support_tickets t JOIN sellers s ON s.id = t.seller_id
        WHERE t.state IN ('open','in_progress') AND (t.priority IN ('urgent','high') OR t.created_at < now() - interval '48 hours')
        ORDER BY CASE t.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 ELSE 3 END, t.created_at LIMIT 200`);
    return { items: r.rows };
  });

  // System status: queues, failed jobs, storage and the migration level, all read from the database.
  app.get('/v1/admin/system-status', { preHandler: requirePlatformAdmin }, async () => {
    const [jobs, assign, cancel, mig, lastJob] = await Promise.all([
      db.query(`SELECT state, count(*)::int AS n FROM job_runs WHERE queued_at > now() - interval '7 days' GROUP BY state`),
      db.query(`SELECT count(*) FILTER (WHERE state IN ('queued','running'))::int AS waiting FROM assign_batch_items`),
      db.query(`SELECT count(*) FILTER (WHERE state IN ('queued','running'))::int AS waiting FROM cancel_batch_items`),
      db.query(`SELECT count(*)::int AS applied, max(name) AS latest FROM schema_migrations`),
      db.query(`SELECT max(started_at) AS at FROM job_runs`),
    ]);
    let storage: { ok: boolean; message?: string | null } = { ok: false };
    try { const c = await checkStorage(); storage = { ok: c.ok, message: c.ok ? null : `${c.failedStep ?? ''}: ${c.reason ?? ''}` }; } catch (e) { storage = { ok: false, message: (e as Error).message }; }
    const byState = Object.fromEntries(jobs.rows.map((x) => [x.state, x.n]));
    return {
      jobsLast7Days: byState,
      assignWaiting: assign.rows[0].waiting, cancelWaiting: cancel.rows[0].waiting,
      migrations: mig.rows[0], lastJobAt: lastJob.rows[0].at, storage,
      checkedAt: new Date().toISOString(),
    };
  });
}
