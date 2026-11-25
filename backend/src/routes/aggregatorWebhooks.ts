import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { credentialsFor } from '../couriers/credentials.js';
import { PLUGINS, pluginById } from '../couriers/aggregators/index.js';
import { ingestUpdate, type IngestOutcome } from '../lib/trackingIngest.js';

/**
 * Tracking webhooks for every aggregator: POST /v1/webhooks/aggregators/:id. The plugin checks the request (token / signature) and turns the
 * payload into updates; the shared ingest records them. The URL already saved at Lorrigo (/v1/webhooks/lorrigo, and the unused /v2 alias)
 * keeps working: it is the same handler with the aggregator fixed.
 * Answers: 503 not configured, 401 wrong token, 200 otherwise (also for unknown AWBs and payloads with no shipment, so the aggregator
 * does not drop the subscription over something a retry cannot fix).
 */
export async function aggregatorWebhookRoutes(app: FastifyInstance) {
  const handle = (fixedId?: string) => async (request: FastifyRequest, reply: FastifyReply) => {
    const id = fixedId ?? (request.params as { id: string }).id;
    const plugin = pluginById(id);
    if (!plugin?.webhook) return reply.code(404).send({ error: 'UNKNOWN_AGGREGATOR' });
    const credentials = credentialsFor(id);
    if (!plugin.webhook.configured(credentials)) return reply.code(503).send({ error: `${id.toUpperCase()}_WEBHOOKS_NOT_CONFIGURED` });
    const raw = request.rawBody ? request.rawBody.toString() : JSON.stringify(request.body);
    const updates = plugin.webhook.parse(request.body);
    // A dashboard's "test" button may send no token or a bare body. Anything that carries no shipment is only a ping: answer 200 and record nothing.
    // A payload that carries an AWB still needs the right token.
    if (!plugin.webhook.verify(request.headers, credentials, raw)) {
      if (updates.length) return reply.code(401).send({ error: 'INVALID_WEBHOOK_TOKEN' });
      return { ok: true, ping: true };
    }
    if (!updates.length) return { accepted: true, ignored: 'no awb' }; // also answers a "Test webhook" button
    const outcomes: IngestOutcome[] = [];
    for (const update of updates) outcomes.push(await ingestUpdate(id, update, raw, request.log)); // a database error throws -> 500 -> the aggregator retries; replays are idempotent
    if (outcomes.includes('unknown')) request.log.warn({ count: outcomes.filter((o) => o === 'unknown').length }, `${id} webhook for unknown AWB(s)`);
    return { accepted: true, result: outcomes.length === 1 ? outcomes[0] : outcomes.includes('processed') ? 'processed' : outcomes[0] };
  };
  // A long shipment history is large (a sample is ~12 KB) and a batch can hold several, so the default 1 MB limit is raised.
  // A "test webhook" button may send an empty body, no content type, or a GET: those are pings, not errors (a 4xx here makes the dashboard refuse to save the URL).
  const PING_ERRORS = new Set(['FST_ERR_CTP_EMPTY_JSON_BODY', 'FST_ERR_CTP_INVALID_MEDIA_TYPE', 'FST_ERR_CTP_INVALID_JSON_BODY']);
  app.setErrorHandler((error, request, reply) => {
    const code = (error as { code?: string }).code;
    if (code && PING_ERRORS.has(code)) return reply.code(200).send({ ok: true, ping: true });
    return reply.send(error);
  });
  const options = { bodyLimit: 5_000_000, config: { rawBody: true, rateLimit: { max: 1200, timeWindow: '1 minute' } } };
  app.post('/v1/webhooks/aggregators/:id', options, handle());
  for (const path of ['/v2/webhooks/lorrigo', '/v1/webhooks/lorrigo']) app.post(path, options, handle('lorrigo'));
  // An aggregator that needs its own URL path (see AggregatorWebhook.path) gets it as well.
  for (const plugin of PLUGINS) if (plugin.webhook?.path) {
    app.post(plugin.webhook.path, options, handle(plugin.id));
    app.get(plugin.webhook.path, async () => ({ ok: true, ping: true })); // reachability check from a browser or a dashboard; reveals nothing
  }
}
