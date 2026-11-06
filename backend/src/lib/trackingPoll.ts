import { db } from '../db/client.js';
import { config } from '../config.js';
import { PLUGINS } from '../couriers/aggregators/index.js';
import { credentialsFor, isConfigured } from '../couriers/credentials.js';
import { ingestUpdate } from './trackingIngest.js';

/**
 * Safety net next to the aggregators' webhooks: every TRACKING_POLL_MINUTES the worker asks each aggregator that supports it for the newest
 * tracking and records it exactly like a webhook would (same idempotent ingest, same state machine, same RTO billing and NDR rules). A missed or
 * rejected webhook therefore delays tracking by minutes instead of stopping it. Only AWBs of shipments that are still live are looked at.
 */
type Log = { error: (o: unknown, m?: string) => void; warn: (o: object, m: string) => void; info: (m: string) => void };

export async function pollOnce(log: Log): Promise<number> {
  let applied = 0;
  for (const plugin of PLUGINS) {
    if (!plugin.poll || !plugin.capabilities.track || !isConfigured(plugin.id)) continue;
    const live = await db.query<{ awb: string }>(
      `SELECT s.awb FROM shipments s JOIN courier_providers cp ON cp.id = s.provider_id
       WHERE cp.aggregator = $1 AND s.awb IS NOT NULL AND s.state NOT IN ('delivered', 'cancelled', 'lost') AND s.booked_at > now() - interval '60 days'`, [plugin.id]);
    if (!live.rows.length) continue;
    const wanted = new Set(live.rows.map((r) => r.awb));
    const updates = (await plugin.poll(credentialsFor(plugin.id))).filter((u) => wanted.has(u.awb));
    for (const update of updates) {
      // The delivery key is a hash of the payload, so an unchanged shipment is a cheap "duplicate" and a changed one is applied.
      const outcome = await ingestUpdate(plugin.id, update, JSON.stringify(update.raw ?? update), log);
      if (outcome === 'processed') applied++;
    }
  }
  return applied;
}

export function startTrackingPoll(log: Log) {
  if (!config.TRACKING_POLL_MINUTES) { log.info('Tracking poll is off (TRACKING_POLL_MINUTES=0)'); return () => {}; }
  let running = false;
  const tick = async () => {
    if (running) return; running = true;
    try { const n = await pollOnce(log); if (n) log.info(`Tracking poll applied ${n} update(s)`); }
    catch (error) { log.error(error, 'Tracking poll failed'); }
    finally { running = false; }
  };
  const timer = setInterval(() => { void tick(); }, config.TRACKING_POLL_MINUTES * 60_000);
  const first = setTimeout(() => { void tick(); }, 20_000); // shortly after start, so a restart never leaves tracking stale for a whole interval
  log.info(`Tracking poll every ${config.TRACKING_POLL_MINUTES} min as a safety net for webhooks`);
  return () => { clearInterval(timer); clearTimeout(first); };
}
