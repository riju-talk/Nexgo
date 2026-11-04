import Fastify, { type FastifyInstance } from 'fastify';
import type { IncomingMessage, ServerResponse } from 'node:http';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import rawBody from 'fastify-raw-body';
import { ZodError } from 'zod';
import { config } from './config.js';
import { db } from './db/client.js';
import { registerDocs } from './lib/openapi.js';

export async function buildApp() {
  const app = Fastify({
    logger: { level: config.NODE_ENV === 'production' ? 'info' : 'debug' },
    requestIdHeader: 'x-request-id',
    trustProxy: config.TRUST_PROXY
  });

  if (config.DOCS_ENABLED) registerDocs(app);

  await app.register(helmet, {
    contentSecurityPolicy: false,
    hsts: config.NODE_ENV === 'production' ? { maxAge: 15552000, includeSubDomains: true } : false
  });
  await app.register(cookie);
  await app.register(rawBody, { field: 'rawBody', global: false, encoding: 'utf8', runFirst: true });
  await app.register(cors, { origin: config.FRONTEND_ORIGIN, credentials: true, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] });
  await app.register(rateLimit, { global: true, max: 300, timeWindow: '1 minute' });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({ error: 'VALIDATION_ERROR', details: error.flatten() });
    }

    const dbCode = (error as { code?: string }).code;
    if (dbCode === '23505') return reply.code(409).send({ error: 'This record already exists (a duplicate name or reference).' });
    if (dbCode === '23514') return reply.code(400).send({ error: (error as Error).message || 'This value is not allowed.' });

    if ((error as { statusCode?: number }).statusCode && ((error as { statusCode?: number }).statusCode! < 500 || (error as { expose?: boolean }).expose)) {
      return reply.code((error as { statusCode: number }).statusCode).send({ error: (error as Error).message });
    }

    request.log.error(error);
    return reply.code((error as { statusCode?: number }).statusCode || 500).send({ error: 'INTERNAL_ERROR' });
  });

  app.get('/health', async () => ({ status: 'ok', service: 'nexgo-api' }));
  app.get('/ready', async (_request, reply) => {
    try {
      await db.query('SELECT 1');
      return { status: 'ready' };
    } catch {
      return reply.code(503).send({ status: 'not_ready' });
    }
  });

  // Routes would be registered here if they existed
  // Current implementation uses services instead of traditional routes

  return app;
}

// Vercel runs this file as the serverless entrypoint (it auto-detects `app`), so it must default-export a
// request handler. The Fastify instance is built once per warm container and reused. Local dev uses local.ts.
let ready: Promise<FastifyInstance> | undefined;
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  ready ??= buildApp().then(async (app) => {
    await app.ready();
    return app;
  });
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
