import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { config } from '../config.js';
import { db } from '../db/client.js';
import { audit } from '../lib/audit.js';
import { requireCommercialAdmin, requirePlatformAdmin } from '../lib/adminAuth.js';
import { pluginById } from '../couriers/aggregators/index.js';
import { allPlugins, describeCredentials, isConfigured, saveCredentials } from '../couriers/credentials.js';
import { aggregatorAdapter } from '../couriers/registry.js';

/**
 * Admin > Integrations: the courier aggregators NEXGO can book through (one plugin each, see couriers/aggregators). An admin pastes an API key,
 * tests the connection and copies the webhook URL here. Secrets are stored encrypted and are never sent back to the browser.
 */
const idParam = (request: { params: unknown }) => {
  const id = z.string().regex(/^[a-z0-9-]{2,40}$/).parse((request.params as { aggregator: string }).aggregator);
  const plugin = pluginById(id);
  if (!plugin) throw Object.assign(new Error('Unknown aggregator'), { statusCode: 404 });
  return plugin;
};

export async function adminAggregatorRoutes(app: FastifyInstance) {
  app.get('/v1/admin/aggregators', { preHandler: requirePlatformAdmin }, async () => {
    const rows = await db.query<{ aggregator: string; last_tested_at: string | null; last_test_ok: boolean | null; last_test_message: string | null; updated_at: string }>(
      'SELECT aggregator, last_tested_at, last_test_ok, last_test_message, updated_at FROM aggregator_credentials');
    const hooks = await db.query<{ provider_code: string; last_at: string | null; last24: number }>(
      `SELECT provider_code, max(received_at) AS last_at, count(*) FILTER (WHERE received_at > now() - interval '24 hours')::int AS last24 FROM webhook_deliveries GROUP BY provider_code`);
    const couriers = await db.query<{ aggregator: string; couriers: number }>(`SELECT aggregator, count(*)::int AS couriers FROM courier_providers WHERE aggregator IS NOT NULL GROUP BY aggregator`);
    return {
      items: allPlugins().map((p) => {
        const saved = rows.rows.find((r) => r.aggregator === p.id); const hook = hooks.rows.find((h) => h.provider_code === p.id);
        return {
          id: p.id, label: p.label, configured: isConfigured(p.id), capabilities: p.capabilities, fields: describeCredentials(p.id),
          webhookUrl: p.webhook ? `${config.FRONTEND_ORIGIN}${p.id === 'lorrigo' ? '/v1/webhooks/lorrigo' : `/v1/webhooks/aggregators/${p.id}`}` : null,
          lastWebhookAt: hook?.last_at ?? null, webhooks24h: hook?.last24 ?? 0,
          lastTestedAt: saved?.last_tested_at ?? null, lastTestOk: saved?.last_test_ok ?? null, lastTestMessage: saved?.last_test_message ?? null,
          courierCount: couriers.rows.find((c) => c.aggregator === p.id)?.couriers ?? 0,
        };
      }),
    };
  });

  app.put('/v1/admin/aggregators/:aggregator/credentials', { preHandler: [requirePlatformAdmin, requireCommercialAdmin] }, async (request) => {
    const plugin = idParam(request);
    const { values } = z.object({ values: z.record(z.string().max(500)) }).parse(request.body);
    await saveCredentials(plugin.id, values, request.adminPrincipal!.userId);
    // Field names only, never values.
    await db.query(`INSERT INTO audit_events (actor_user_id, action, target_type, target_id, request_id, metadata) VALUES ($1, 'aggregator.credentials_saved', 'aggregator', $2, $3, $4)`,
      [request.adminPrincipal!.userId, plugin.id, request.id, JSON.stringify({ fields: Object.keys(values).filter((k) => values[k]) })]);
    return { saved: true, fields: describeCredentials(plugin.id) };
  });

  // Calls the aggregator with the current credentials (its list of courier services) and remembers the outcome.
  app.post('/v1/admin/aggregators/:aggregator/test', { preHandler: [requirePlatformAdmin, requireCommercialAdmin], config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request) => {
    const plugin = idParam(request);
    let ok = false; let message = ''; let services = 0;
    try {
      const adapter = aggregatorAdapter(plugin.id);
      if (!adapter.listServices) throw new Error('This aggregator has no test call.');
      services = (await adapter.listServices()).length; ok = true; message = `Connected. ${services} courier service${services === 1 ? '' : 's'} available.`;
    } catch (e) { message = ((e as Error).message || 'The connection test failed.').slice(0, 300); }
    await db.query(`UPDATE aggregator_credentials SET last_tested_at = now(), last_test_ok = $2, last_test_message = $3 WHERE aggregator = $1`, [plugin.id, ok, message]);
    await db.query(`INSERT INTO audit_events (actor_user_id, action, target_type, target_id, request_id, metadata) VALUES ($1, 'aggregator.tested', 'aggregator', $2, $3, $4)`,
      [request.adminPrincipal!.userId, plugin.id, request.id, JSON.stringify({ ok })]);
    return { ok, message, services };
  });

  // The aggregator's own list of courier services, so an admin picks the id from a list instead of typing it when adding a courier.
  app.get('/v1/admin/aggregators/:aggregator/couriers', { preHandler: requirePlatformAdmin }, async (request) => {
    const plugin = idParam(request);
    const adapter = aggregatorAdapter(plugin.id);
    if (!adapter.listServices) return { aggregator: plugin.id, items: [] };
    return { aggregator: plugin.id, items: await adapter.listServices() };
  });
}

/** Called once at start-up: makes sure every plugin has its row in courier_aggregators, so adding a plugin needs no migration. */
export async function registerAggregators() {
  for (const p of allPlugins()) await db.query('INSERT INTO courier_aggregators (code, label) VALUES ($1, $2) ON CONFLICT (code) DO UPDATE SET label = EXCLUDED.label', [p.id, p.label]);
}
