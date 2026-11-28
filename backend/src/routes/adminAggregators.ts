import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { config } from '../config.js';
import { db } from '../db/client.js';
import { audit } from '../lib/audit.js';
import { requireCommercialAdmin, requirePlatformAdmin } from '../lib/adminAuth.js';
import { pluginById } from '../couriers/aggregators/index.js';
import { allPlugins, describeCredentials, isConfigured, saveCredentials } from '../couriers/credentials.js';
import { aggregatorAdapter } from '../couriers/registry.js';
import { aggregatorBalances } from '../lib/aggregatorBalance.js';
import { pollPlugin } from '../lib/trackingPoll.js';

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
    const balances = await aggregatorBalances().catch(() => []);
    return {
      items: allPlugins().map((p) => {
        const saved = rows.rows.find((r) => r.aggregator === p.id); const hook = hooks.rows.find((h) => h.provider_code === p.id);
        return {
          id: p.id, label: p.label, configured: isConfigured(p.id), capabilities: p.capabilities, fields: describeCredentials(p.id),
          webhookUrl: p.webhook ? `${config.FRONTEND_ORIGIN}${p.webhook.path ?? (p.id === 'lorrigo' ? '/v1/webhooks/lorrigo' : `/v1/webhooks/aggregators/${p.id}`)}` : null,
          lastWebhookAt: hook?.last_at ?? null, webhooks24h: hook?.last24 ?? 0,
          lastTestedAt: saved?.last_tested_at ?? null, lastTestOk: saved?.last_test_ok ?? null, lastTestMessage: saved?.last_test_message ?? null,
          balance: balances.find((b) => b.id === p.id) ?? null, lowBalanceBelow: config.AGGREGATOR_LOW_BALANCE,
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
    } catch (e) { message = (((e as { detail?: string }).detail ?? (e as Error).message) || 'The connection test failed.').slice(0, 300); }
    await db.query(`UPDATE aggregator_credentials SET last_tested_at = now(), last_test_ok = $2, last_test_message = $3 WHERE aggregator = $1`, [plugin.id, ok, message]);
    await db.query(`INSERT INTO audit_events (actor_user_id, action, target_type, target_id, request_id, metadata) VALUES ($1, 'aggregator.tested', 'aggregator', $2, $3, $4)`,
      [request.adminPrincipal!.userId, plugin.id, request.id, JSON.stringify({ ok })]);
    return { ok, message, services };
  });

  // "Sync tracking now": asks the aggregator for the newest tracking of every parcel still on the way (the same work the worker does every few minutes).
  app.post('/v1/admin/aggregators/:aggregator/sync-tracking', { preHandler: [requirePlatformAdmin, requireCommercialAdmin], config: { rateLimit: { max: 6, timeWindow: '1 minute' } } }, async (request, reply) => {
    const plugin = idParam(request);
    if (!plugin.poll || !plugin.capabilities.track) return reply.code(409).send({ error: 'NO_TRACKING_READ', message: 'This aggregator has no tracking read; it relies on its webhook.' });
    try {
      const r = await pollPlugin(plugin, { error: (o, m) => request.log.error(o as object, m), warn: (o, m) => request.log.warn(o, m), info: (m) => request.log.info(m) });
      await db.query(`INSERT INTO audit_events (actor_user_id, action, target_type, target_id, request_id, metadata) VALUES ($1, 'aggregator.sync_tracking', 'aggregator', $2, $3, $4)`, [request.adminPrincipal!.userId, plugin.id, request.id, JSON.stringify(r)]);
      return { ok: true, ...r };
    } catch (e) { return reply.code(502).send({ error: 'SYNC_FAILED', message: (((e as { detail?: string }).detail ?? (e as Error).message) || 'The tracking sync failed.').slice(0, 300) }); }
  });

  // The aggregator's own list of courier services, so an admin picks the id from a list instead of typing it when adding a courier.
  app.get('/v1/admin/aggregators/:aggregator/couriers', { preHandler: requirePlatformAdmin }, async (request) => {
    const plugin = idParam(request);
    const adapter = aggregatorAdapter(plugin.id);
    if (!adapter.listServices) return { aggregator: plugin.id, items: [] };
    return { aggregator: plugin.id, items: await adapter.listServices() };
  });

  // One click: creates a courier + service row for every courier service the aggregator offers (the lists in Assign courier & rates, Add courier and the rate card read these rows).
  // Safe to repeat: existing rows are only refreshed. Nothing is offered to a seller until an admin gives them access and a rate card.
  app.post('/v1/admin/aggregators/:aggregator/import-couriers', { preHandler: [requirePlatformAdmin, requireCommercialAdmin], config: { rateLimit: { max: 6, timeWindow: '1 minute' } } }, async (request, reply) => {
    const plugin = idParam(request);
    const adapter = aggregatorAdapter(plugin.id);
    if (!adapter.listServices) return reply.code(400).send({ error: 'NOT_SUPPORTED', message: `${plugin.label} cannot list its couriers.` });
    let offered: { id: string; name: string; type: string }[];
    try { offered = await adapter.listServices(); }
    catch (e) { return reply.code(502).send({ error: 'LIST_FAILED', message: (((e as { detail?: string }).detail ?? (e as Error).message) || 'The courier list could not be read.').slice(0, 300) }); }
    const slug = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    let providers = 0; let services = 0;
    for (const c of offered) {
      if (/reverse|rvp|return/i.test(c.name) || c.type === 'reverse') continue; // forward bookings only
      // One courier per company (courierBrand): "Blue Dart Air" and "BlueDart Surface 2KG" both sit under Blue Dart.
      const brand = courierBrand(c.name); const providerCode = `${slug(brand)}-${plugin.id}`.slice(0, 64);
      if (providerCode.length < 2) continue;
      const serviceType = /air/i.test(c.name) || c.type === 'air' ? 'air' : /express/i.test(c.name) || c.type === 'express' ? 'express' : 'surface';
      const provider = await db.query<{ id: string; inserted: boolean }>(
        `INSERT INTO courier_providers (code, name, integration_state, supports_cod, supports_reverse, aggregator) VALUES ($1, $2, 'live', true, false, $3)
         ON CONFLICT (code) DO UPDATE SET aggregator = EXCLUDED.aggregator RETURNING id, (xmax = 0) AS inserted`, [providerCode, brand, plugin.id]);
      if (provider.rows[0].inserted) providers += 1;
      const code = `${slug(c.name)}-${slug(c.id)}`.slice(0, 64);
      const svc = await db.query<{ inserted: boolean }>(
        `INSERT INTO courier_services (provider_id, code, display_name, service_type, service_provider, external_service_id) VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (provider_id, code) DO UPDATE SET external_service_id = EXCLUDED.external_service_id, display_name = EXCLUDED.display_name, is_active = true RETURNING (xmax = 0) AS inserted`,
        [provider.rows[0].id, code, c.name.slice(0, 120), serviceType, plugin.label, c.id]);
      if (svc.rows[0].inserted) services += 1;
    }
    await db.query(`INSERT INTO audit_events (actor_user_id, action, target_type, target_id, request_id, metadata) VALUES ($1, 'aggregator.couriers_imported', 'aggregator', $4, $2, $3)`,
      [request.adminPrincipal!.userId, request.id, JSON.stringify({ aggregator: plugin.id, offered: offered.length, newProviders: providers, newServices: services }), plugin.id]);
    return { aggregator: plugin.id, offered: offered.length, newProviders: providers, newServices: services };
  });
}

/** The courier company behind a service name, so every service of one company sits under one courier:
 *  "Blue Dart Air" / "BlueDart Surface 2KG" -> Blue Dart, "DTDC Air 500gm" -> DTDC, "Ekart Logistics Surface" -> Ekart,
 *  "Shadowfax Heavy 5Kg" -> Shadowfax, "Amazon COD Surface 500gm" / "Amazon Shipping Surface 1kg" -> Amazon, "India Post-Speed Post Air" -> India Post. */
export function courierBrand(name: string): string {
  const n = name.trim();
  const head = n.split(/\s+(?=(?:surface|air|express|lite|standard|premium|prime|economy|priority|plus|sdd|ndd|same|next|\d+(?:\.\d+)?\s*(?:kg|kgs|gm|gms|g)\b|\d))/i)[0].trim() || n.split(/\s+/)[0];
  const known: [RegExp, string][] = [[/^blue\s*dart\b/i, 'Blue Dart'], [/^ekart\b/i, 'Ekart'], [/^shadowfax\b/i, 'Shadowfax'], [/^amazon\b/i, 'Amazon'], [/^india\s*post\b/i, 'India Post'], [/^ecom\b/i, 'Ecom Express'], [/^delhivery\b/i, 'Delhivery'], [/^dtdc\b/i, 'DTDC'], [/^xpress\s*bees\b/i, 'Xpressbees']];
  for (const [re, label] of known) if (re.test(n)) return label;
  return head;
}

/** Called once at start-up: makes sure every plugin has its row in courier_aggregators, so adding a plugin needs no migration. */
export async function registerAggregators() {
  for (const p of allPlugins()) await db.query('INSERT INTO courier_aggregators (code, label) VALUES ($1, $2) ON CONFLICT (code) DO UPDATE SET label = EXCLUDED.label', [p.id, p.label]);
}
