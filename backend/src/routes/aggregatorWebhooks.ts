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
    let body: unknown = request.body;
    if (typeof body === 'string' && body.trim()) { // sent as text/plain: read it if it is JSON, refuse it if it is not (never drop it)
      try { body = JSON.parse(body); }
      catch { request.log.error({ aggregator: id }, 'a webhook body could not be read'); return reply.code(400).send({ error: 'INVALID_BODY' }); }
    }
    const updates = plugin.webhook.parse(body);
    // A dashboard's "test" button may send no token: a request with NO token and no shipment in it is only a ping (200, nothing recorded). A wrong token is always
    // refused, so a mistyped token is noticed, and anything that carries a shipment needs the right one.
    if (!plugin.webhook.verify(request.headers, credentials, raw)) {
      const sentToken = !!(request.headers['x-api-key'] || request.headers['authorization']);
      if (sentToken || updates.length) return reply.code(401).send({ error: 'INVALID_WEBHOOK_TOKEN' });
      return { ok: true, ping: true };
    }
    if (!updates.length) { // a "Test webhook" button, or a payload shape we do not know: never silent, so a changed format is noticed
      const keys = body && typeof body === 'object' ? Object.keys(body).slice(0, 15) : [];
      if (keys.length) request.log.warn({ aggregator: id, keys }, 'webhook carried no shipment');
      return { accepted: true, ignored: 'no awb' };
    }
    const outcomes: IngestOutcome[] = [];
    for (const update of updates) outcomes.push(await ingestUpdate(id, update, raw, request.log)); // a database error throws -> 500 -> the aggregator retries; replays are idempotent
    if (outcomes.includes('unknown')) request.log.warn({ count: outcomes.filter((o) => o === 'unknown').length }, `${id} webhook for unknown AWB(s)`);
    return { accepted: true, result: outcomes.length === 1 ? outcomes[0] : outcomes.includes('processed') ? 'processed' : outcomes[0] };
  };
  // A long shipment history is large (a sample is ~12 KB) and a batch can hold several, so the default 1 MB limit is raised.
  // A "test webhook" button may send an EMPTY body: that is a ping, not an error (a 4xx makes the dashboard refuse to save the URL). A body that is there but cannot be
  // read stays an error: answering 200 to a damaged tracking update would lose it without a trace.
  app.setErrorHandler((error, request, reply) => {
    const code = (error as { code?: string }).code;
    const empty = !Number(request.headers['content-length'] ?? 0) && !request.headers['transfer-encoding'];
    if (empty && (code === 'FST_ERR_CTP_EMPTY_JSON_BODY' || code === 'FST_ERR_CTP_INVALID_MEDIA_TYPE')) return reply.code(200).send({ ok: true, ping: true });
    if (code?.startsWith('FST_ERR_CTP')) request.log.error({ url: request.url, code, contentType: request.headers['content-type'] }, 'a webhook body could not be read');
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
