import { startAssignProcessor } from './lib/assignQueue.js';
import { PLUGINS } from './couriers/aggregators/index.js';
import { config } from './config.js';
import { db } from './db/client.js';
import { buildApp } from './app.js';
import { checkStorage } from './lib/storage.js';

const app = await buildApp();
const close = async () => { await app.close(); await db.end(); };
process.on('SIGTERM', close); process.on('SIGINT', close);
await app.listen({ port: config.PORT, host: '0.0.0.0' });

// In production the worker container runs the courier-assignment queue. Elsewhere (local development, tests) there is no worker, so the API runs it.
if (config.NODE_ENV !== 'production') startAssignProcessor({ error: (o, m) => app.log.error(o as object, m), info: (m) => app.log.info(m) });

// Tracking only arrives by Lorrigo's webhook (there is no polling fallback), so say loudly at start-up if it cannot be received.
for (const plugin of PLUGINS) {
  const env = plugin.envCredentials();
  if (plugin.webhook && Object.values(env).some(Boolean) && !plugin.webhook.configured(env)) {
    app.log.error(`${plugin.label} credentials are set in the environment but its webhook token is not: ${plugin.label} tracking webhooks will be rejected (503) and shipments will stay at "booked" unless the token is saved on Admin > Integrations.`);
  }
}

// Say at start-up whether the bucket works, so a missing IAM role shows in the log, not on a seller's first upload.
if (config.STORAGE_ENABLED) {
  void checkStorage().then((r) => (r.ok ? app.log.info({ bucket: r.bucket, region: r.region }, 'Object storage reachable') : app.log.error(r, 'Object storage NOT reachable')));
}
