import { config } from './config.js';
import { db } from './db/client.js';
import { buildApp } from './app.js';
import { checkStorage } from './lib/storage.js';

const app = await buildApp();
const close = async () => { await app.close(); await db.end(); };
process.on('SIGTERM', close); process.on('SIGINT', close);
await app.listen({ port: config.PORT, host: '0.0.0.0' });

// Say at start-up whether the bucket works, so a missing IAM role shows in the log, not on a seller's first upload.
if (config.STORAGE_ENABLED) {
  void checkStorage().then((r) => (r.ok ? app.log.info({ bucket: r.bucket, region: r.region }, 'Object storage reachable') : app.log.error(r, 'Object storage NOT reachable')));
}
