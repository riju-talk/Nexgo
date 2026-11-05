import { config } from './config.js';
import { db } from './db/client.js';
import { buildApp } from './app.js';
import { checkStorage } from './lib/storage.js';

const app = await buildApp();
const close = async () => { await app.close(); await db.end(); };
process.on('SIGTERM', close); process.on('SIGINT', close);
await app.listen({ port: config.PORT, host: '0.0.0.0' });

// Tracking only arrives by Lorrigo's webhook (there is no polling fallback), so say loudly at start-up if it cannot be received.
if (config.LORRIGO_API_KEY && !config.LORRIGO_WEBHOOK_TOKEN) {
  app.log.error('LORRIGO_API_KEY is set but LORRIGO_WEBHOOK_TOKEN is not: Lorrigo tracking webhooks will be rejected (503) and shipments will stay at "booked". Set the same token here and in Lorrigo > Webhooks.');
}

// Say at start-up whether the bucket works, so a missing IAM role shows in the log, not on a seller's first upload.
if (config.STORAGE_ENABLED) {
  void checkStorage().then((r) => (r.ok ? app.log.info({ bucket: r.bucket, region: r.region }, 'Object storage reachable') : app.log.error(r, 'Object storage NOT reachable')));
}
