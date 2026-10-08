import { config } from './config.js';
import { db } from './db/client.js';
import { buildApp } from './app.js';

const app = await buildApp();
const close = async () => { await app.close(); await db.end(); };
process.on('SIGTERM', close); process.on('SIGINT', close);
await app.listen({ port: config.PORT, host: '0.0.0.0' });
