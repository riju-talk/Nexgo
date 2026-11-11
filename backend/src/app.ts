import Fastify, { type FastifyInstance } from 'fastify';
import { sellerSafeMessage } from './lib/sellerSafeError.js';
import type { IncomingMessage, ServerResponse } from 'node:http';
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
import { adminProvisionRoutes } from './routes/adminProvision.js';
import { adminMfaRoutes } from './routes/adminMfa.js';
import { adminOperationsRoutes } from './routes/adminOperations.js';
import { fileRoutes } from './routes/files.js';
import { emailScheduleRoutes } from './routes/emailSchedules.js';
import { codConfirmationRoutes } from './routes/codConfirmation.js';
import { adminSellerProfileRoutes, impersonationAudit, impersonationGuard } from './routes/adminSellerProfile.js';
import { adminWriteAudit } from './lib/adminWriteAudit.js';
import { assignBatchRoutes } from './routes/assignBatches.js';
import { cancelBatchRoutes } from './routes/cancelBatches.js';
import { notificationRoutes } from './routes/notifications.js';
import { adminVisibilityRoutes } from './routes/adminVisibility.js';
import { kycRoutes } from './routes/kyc.js';
import { kycSectionRoutes } from './routes/kycSections.js';
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
import { shopifyRoutes } from './routes/shopify.js';
import { shopifyComplianceRoutes } from './routes/shopifyCompliance.js';
import { searchRoutes } from './routes/search.js';
import { aggregatorWebhookRoutes } from './routes/aggregatorWebhooks.js';
import { adminAggregatorRoutes, registerAggregators } from './routes/adminAggregators.js';
import { startCredentialRefresh } from './couriers/credentials.js';
import { pickupRoutes } from './routes/pickups.js';
import { analyticsRoutes } from './routes/analytics.js';
import { workspaceRoutes } from './routes/workspace.js';
import { locationRoutes } from './routes/locations.js';
import { billingExtrasRoutes } from './routes/billingExtras.js';
import { ndrRoutes } from './routes/ndr.js';
import { weightDisputeRoutes } from './routes/weightDisputes.js';
import { bankAccountRoutes } from './routes/bankAccounts.js';
import { partnerRoutes } from './routes/partners.js';
import courierZonesRoutes from './routes/courierZones.js';
import courierSLARoutes from './routes/courierSLA.js';
import courierPerformanceRoutes from './routes/courierPerformance.js';

import { reportRoutes } from './routes/reports.js';
import { adminReportRoutes } from './routes/adminReports.js';
import { registerDocs } from './lib/openapi.js';
import { rtoRoutes } from './routes/rto.js';
import { billingRoutes } from './routes/billing.js';
import { adminDisputeRoutes } from './routes/adminDisputes.js';
import { ensureDevAccounts } from './lib/devAccounts.js';
import { ensureBootstrapAdmin, ensureDeveloperSuperadmin } from './lib/bootstrapAdmin.js';
export async function buildApp() {
const app = Fastify({ logger: { level: config.NODE_ENV === 'production' ? 'info' : 'debug' }, requestIdHeader: 'x-request-id', trustProxy: config.TRUST_PROXY });
if (config.DOCS_ENABLED) registerDocs(app);
// The API only serves JSON (the Swagger page loads its assets from a CDN), so the CSP stays off here; the web app sets its own headers.
await app.register(helmet, { contentSecurityPolicy: false, hsts: config.NODE_ENV === 'production' ? { maxAge: 15552000, includeSubDomains: true } : false });
await app.register(cookie);
await app.register(rawBody, { field: 'rawBody', global: false, encoding: 'utf8', runFirst: true });
await app.register(cors, { origin: config.FRONTEND_ORIGIN, credentials: true, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] });
// Global ceiling blunts scraping/abuse; auth endpoints below get a much
// tighter per-route limit since those are the actual brute-force surface.
await app.register(rateLimit, { global: true, max: 300, timeWindow: '1 minute' });
app.addHook('onRequest', requireCsrfHeader);
// Live figures (Track, dashboard) must never come from a browser or CDN cache.
app.addHook('onSend', async (_req, reply) => { reply.header('Cache-Control', 'no-store'); });
app.addHook('preHandler', impersonationGuard);
app.addHook('onResponse', impersonationAudit);
app.addHook('onResponse', adminWriteAudit);

app.setErrorHandler((error, request, reply) => {
  if (error instanceof ZodError) {
    // A readable sentence for the screen (first problem, with the field name), next to the full details for tools.
    const first = error.issues[0];
    const field = first?.path.filter((p) => typeof p === 'string').slice(-1)[0];
    return reply.code(400).send({ error: 'VALIDATION_ERROR', message: first ? `${field ? `${field}: ` : ''}${first.message}` : 'The request is not valid.', details: error.flatten() });
  }
  // Database constraint failures are caller mistakes, not server faults: report them plainly.
  const dbCode = (error as { code?: string }).code;
  if (dbCode === '23505') return reply.code(409).send({ error: 'This record already exists (a duplicate name or reference).' });
  if (dbCode === '23514') return reply.code(400).send({ error: (error as Error).message || 'This value is not allowed.' });
  // `expose` marks 5xx errors we raise on purpose with a seller-safe reason (courier / storefront outage, missing configuration).
  if ((error as { statusCode?: number }).statusCode && ((error as { statusCode?: number }).statusCode! < 500 || (error as { expose?: boolean }).expose)) {
    const errCode = (error as { code?: unknown }).code;
    // Outside the admin panel nothing may name the courier aggregator, whatever raised the error.
    const text = request.url.startsWith('/v1/admin') ? (error as Error).message : sellerSafeMessage((error as Error).message);
    return reply.code((error as { statusCode: number }).statusCode).send({ error: text, ...(typeof errCode === 'string' && /^[A-Z_]+$/.test(errCode) ? { code: errCode } : {}) });
  }
  request.log.error(error);
  return reply.code((error as { statusCode?: number }).statusCode || 500).send({ error: 'INTERNAL_ERROR' });
});

app.get('/health', async () => ({ status: 'ok', service: 'nexgo-api' }));
// Liveness for load balancers / container health checks. No auth, no DB: it only says the process is up.
app.get('/ready', async (_request, reply) => {
  try { await db.query('SELECT 1'); return { status: 'ready' }; }
  catch { return reply.code(503).send({ status: 'not_ready' }); }
});
await app.register(authRoutes);
await app.register(sellerRoutes);
await app.register(shippingRoutes);
await app.register(operationsRoutes);
await app.register(shipmentRoutes);
await app.register(assignBatchRoutes);
await app.register(cancelBatchRoutes);
await app.register(notificationRoutes);
await app.register(trackingRoutes);
await app.register(exceptionRoutes);
await app.register(walletRoutes);
await app.register(walletRechargeRoutes);
await app.register(invoiceRoutes);
await app.register(codRemittanceRoutes);
await app.register(integrationRoutes);
await app.register(shopifyRoutes);
await app.register(shopifyComplianceRoutes);
await app.register(searchRoutes);
await app.register(aggregatorWebhookRoutes);
await app.register(adminAggregatorRoutes);
await app.register(pickupRoutes);
await app.register(analyticsRoutes);
await app.register(workspaceRoutes);
await app.register(locationRoutes);
await app.register(billingExtrasRoutes);
await app.register(teamRoutes);
await app.register(passwordResetRoutes);
await app.register(sessionRoutes);
await app.register(adminRoutes);
await app.register(adminMfaRoutes);
await app.register(adminProvisionRoutes);
await app.register(adminOperationsRoutes);
await app.register(adminSellerProfileRoutes);
await app.register(fileRoutes);
await app.register(emailScheduleRoutes);
await app.register(codConfirmationRoutes);
await app.register(adminVisibilityRoutes);
await app.register(kycRoutes);
await app.register(kycSectionRoutes);
await app.register(ndrRoutes);
await app.register(weightDisputeRoutes);
await app.register(bankAccountRoutes);
await app.register(partnerRoutes);
await app.register(reportRoutes);
await app.register(adminReportRoutes);
await app.register(rtoRoutes);
await app.register(billingRoutes);
await app.register(adminDisputeRoutes);
await app.register(courierZonesRoutes);
await app.register(courierSLARoutes);
await app.register(courierPerformanceRoutes);
await registerAggregators(); // every plugin has its row in courier_aggregators (no migration needed to add one)
startCredentialRefresh(app.log); // saved API keys are cached in memory and refreshed every 30 s
await ensureBootstrapAdmin(app.log);
await ensureDeveloperSuperadmin(app.log);
await ensureDevAccounts(app.log);
return app;
}

// Vercel runs this file as the serverless entrypoint (it auto-detects `app`), so it must default-export a
// request handler. The Fastify instance is built once per warm container and reused. Local dev uses local.ts.
let ready: Promise<FastifyInstance> | undefined;
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  ready ??= buildApp().then(async (app) => { await app.ready(); return app; });
  try {
    const app = await ready;
    app.server.emit('request', req, res);
  } catch (error) {
    ready = undefined;
    console.error('API failed to start', error);
    res.statusCode = 500; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ error: 'API_START_FAILED' }));
  }
}
