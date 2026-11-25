import { db } from '../db/client.js';
import { sendMail } from './mailer.js';

/**
 * Is the process that works the queues alive? (OPS-001). The worker writes a heartbeat; the API reads it. A dead worker means accepted work waits: the seller is told
 * the truth (saved, delayed), admins get an e-mail, and /health/worker answers 503 for an outside monitor.
 */
const BEAT_MS = 10_000; const DEAD_AFTER_SECONDS = 45;

export function startHeartbeat(name = 'worker') {
  const startedAt = new Date();
  const beat = () => db.query('INSERT INTO worker_heartbeats (name, started_at, beat_at) VALUES ($1, $2, now()) ON CONFLICT (name) DO UPDATE SET beat_at = now(), started_at = EXCLUDED.started_at', [name, startedAt]).catch((e) => console.error('worker heartbeat failed', (e as Error).message));
  void beat();
  const timer = setInterval(() => { void beat(); }, BEAT_MS);
  return () => clearInterval(timer);
}

export type WorkerHealth = { alive: boolean; lastBeatAt: string | null; ageSeconds: number | null; waiting: number; oldestWaitingSeconds: number; unconfirmedBookings: number; oldestUnconfirmedSeconds: number };
let cache: { at: number; value: WorkerHealth } | null = null;
/** Read at most every 3 s per process. If the check itself fails the worker is reported alive: a broken health check must not stop bookings. */
export async function workerHealth(): Promise<WorkerHealth> {
  if (cache && Date.now() - cache.at < 3000) return cache.value;
  try {
    const r = (await db.query<{ beat: Date | null; age: number | null; waiting: number; oldest: number; open: number; open_age: number }>(
      `SELECT (SELECT max(beat_at) FROM worker_heartbeats) AS beat, (SELECT extract(epoch FROM now() - max(beat_at))::int FROM worker_heartbeats) AS age,
              (SELECT count(*)::int FROM assign_batch_items WHERE state IN ('queued','running')) + (SELECT count(*)::int FROM cancel_batch_items WHERE state IN ('queued','running')) AS waiting,
              COALESCE((SELECT extract(epoch FROM now() - min(b.created_at))::int FROM assign_batches b WHERE b.finished_at IS NULL), 0) AS oldest,
              (SELECT count(*)::int FROM booking_attempts WHERE state IN ('unknown','accepted','cancel_needed')) AS open,
              COALESCE((SELECT extract(epoch FROM now() - min(created_at))::int FROM booking_attempts WHERE state IN ('unknown','accepted','cancel_needed')), 0) AS open_age`)).rows[0];
    const value: WorkerHealth = { alive: r.age !== null && r.age <= DEAD_AFTER_SECONDS, lastBeatAt: r.beat ? r.beat.toISOString() : null, ageSeconds: r.age, waiting: r.waiting, oldestWaitingSeconds: r.oldest, unconfirmedBookings: r.open, oldestUnconfirmedSeconds: r.open_age };
    cache = { at: Date.now(), value };
    return value;
  } catch (e) {
    console.error('worker health could not be read', (e as Error).message);
    return { alive: true, lastBeatAt: null, ageSeconds: null, waiting: 0, oldestWaitingSeconds: 0, unconfirmedBookings: 0, oldestUnconfirmedSeconds: 0 };
  }
}

let mailedAt = 0;
/** Runs in the API: says it in the log every minute, and e-mails the platform admins at most once an hour, while the worker is down or a booking stays unconfirmed. */
export function startWorkerWatch(log: (m: string) => void) {
  const check = async () => {
    const h = await workerHealth();
    const stuck = h.unconfirmedBookings > 0 && h.oldestUnconfirmedSeconds > 900;
    if (h.alive && !stuck) return;
    const text = [
      ...(h.alive ? [] : [`The NEXGO worker is not running (last sign of life: ${h.lastBeatAt ?? 'never'}). ${h.waiting} queued action(s) are waiting and tracking is not being refreshed. Restart it: docker compose up -d worker`]),
      ...(stuck ? [`${h.unconfirmedBookings} courier booking(s) have been unconfirmed for ${Math.round(h.oldestUnconfirmedSeconds / 60)} minutes or less. Check Admin > System settings and the courier's own dashboard.`] : []),
    ].join('\n\n');
    log(text);
    if (Date.now() - mailedAt < 3_600_000) return;
    mailedAt = Date.now();
    try {
      const to = await db.query<{ email: string }>(`SELECT DISTINCT COALESCE(NULLIF(pa.otp_email::text, ''), u.email::text) AS email FROM platform_admins pa JOIN users u ON u.id = pa.user_id WHERE pa.role IN ('super_admin', 'operations_admin')`);
      for (const r of to.rows) await sendMail(r.email, 'ACTION NEEDED: NEXGO background processing', text);
    } catch (e) { log(`The worker alert could not be sent: ${(e as Error).message}`); }
  };
  const timer = setInterval(() => { void check().catch(() => {}); }, 60_000);
  return () => clearInterval(timer);
}
