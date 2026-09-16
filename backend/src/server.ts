import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import rawBody from 'fastify-raw-body';
import { ZodError } from 'zod';
import { config } from './config.js';
import { db } from './db/client.js';
import { requireCsrfHeader } from './lib/csrf.js';
import { authRoutes } from './routes/auth.js';
import { sellerRoutes } from './routes/seller.js';
import { adminRoutes } from './routes/admin.js';
import { adminMfaRoutes } from './routes/adminMfa.js';
import { adminOperationsRoutes } from './routes/adminOperations.js';
import { adminVisibilityRoutes } from './routes/adminVisibility.js';
import { kycRoutes } from './routes/kyc.js';
import { teamRoutes } from './routes/team.js';
import { passwordResetRoutes } from './routes/passwordReset.js';
import { sessionRoutes } from './routes/sessions.js';
import { shippingRoutes } from './routes/shipping.js';
import { operationsRoutes } from './routes/operations.js';
import { shipmentRoutes } from './routes/shipments.js';
import { trackingRoutes } from './routes/tracking.js';
import { exceptionRoutes } from './routes/exceptions.js';
import { walletRoutes } from './routes/wallet.js';
import { walletRechargeRoutes } from './routes/walletRecharge.js';
import { invoiceRoutes } from './routes/invoices.js';
import { codRemittanceRoutes } from './routes/codRemittance.js';
import { integrationRoutes } from './routes/integrations.js';
import { pickupRoutes } from './routes/pickups.js';
import { analyticsRoutes } from './routes/analytics.js';
import { workspaceRoutes } from './routes/workspace.js';
import { locationRoutes } from './routes/locations.js';

const app = Fastify({ logger: { level: config.NODE_ENV === 'production' ? 'info' : 'debug' }, requestIdHeader: 'x-request-id' });
await app.register(helmet, { contentSecurityPolicy: false });
await app.register(cookie);
await app.register(rawBody, { field: 'rawBody', global: false, encoding: 'utf8', runFirst: true });
await app.register(cors, { origin: config.FRONTEND_ORIGIN, credentials: true, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] });
// Global ceiling blunts scraping/abuse; auth endpoints below get a much
// tighter per-route limit since those are the actual brute-force surface.
await app.register(rateLimit, { global: true, max: 300, timeWindow: '1 minute' });
app.addHook('onRequest', requireCsrfHeader);

app.setErrorHandler((error, request, reply) => {
  if (error instanceof ZodError) return reply.code(400).send({ error: 'VALIDATION_ERROR', details: error.flatten() });
  if ((error as { statusCode?: number }).statusCode && (error as { statusCode?: number }).statusCode! < 500) {
    return reply.code((error as { statusCode: number }).statusCode).send({ error: (error as Error).message });
  }
  request.log.error(error);
  return reply.code((error as { statusCode?: number }).statusCode || 500).send({ error: 'INTERNAL_ERROR' });
});

app.get('/health', async () => ({ status: 'ok', service: 'nexgo-api' }));
app.get('/ready', async (_request, reply) => {
  try { await db.query('SELECT 1'); return { status: 'ready' }; }
  catch { return reply.code(503).send({ status: 'not_ready' }); }
});
await app.register(authRoutes);
await app.register(sellerRoutes);
await app.register(shippingRoutes);
await app.register(operationsRoutes);
await app.register(shipmentRoutes);
await app.register(trackingRoutes);
await app.register(exceptionRoutes);
await app.register(walletRoutes);
await app.register(walletRechargeRoutes);
await app.register(invoiceRoutes);
await app.register(codRemittanceRoutes);
await app.register(integrationRoutes);
await app.register(pickupRoutes);
await app.register(analyticsRoutes);
await app.register(workspaceRoutes);
await app.register(locationRoutes);
await app.register(teamRoutes);
await app.register(passwordResetRoutes);
await app.register(sessionRoutes);
await app.register(adminRoutes);
await app.register(adminMfaRoutes);
await app.register(adminOperationsRoutes);
await app.register(adminVisibilityRoutes);
await app.register(kycRoutes);

const close = async () => { await app.close(); await db.end(); };
process.on('SIGTERM', close); process.on('SIGINT', close);
await app.listen({ port: config.PORT, host: '0.0.0.0' });
