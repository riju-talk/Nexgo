// Vercel serverless entry. `npm run build` compiles src/ to dist/; the Fastify
// instance is built once per warm container and reused across invocations.
import { buildApp } from '../dist/app.js';

let ready;
export default async function handler(req, res) {
  ready ??= buildApp().then(async (app) => { await app.ready(); return app; });
  try {
    const app = await ready;
    app.server.emit('request', req, res);
  } catch (error) {
    ready = undefined;
    console.error('API failed to start', error);
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: 'API_START_FAILED' }));
  }
}
