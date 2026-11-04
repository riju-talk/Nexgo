import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { PoolClient } from 'pg';
import { db, withSellerTransaction } from '../db/client.js';
import { audit } from '../lib/audit.js';
import { normalizeShop, shopifyReady, validWebhookHmac } from '../lib/shopify.js';

// Shopify's three mandatory privacy webhooks, one URL each (the Dev Dashboard asks for them separately):
//   POST /v1/webhooks/shopify/customers-data-request   POST /v1/webhooks/shopify/customers-redact   POST /v1/webhooks/shopify/shop-redact
// Shopify requires 401 for a bad HMAC and any 2xx once the request is accepted; it does not retry a 2xx.
const OPTS = { config: { rawBody: true, rateLimit: { max: 600, timeWindow: '1 minute' } } };
type Shop = { shop: string; connectionId: string | null; sellerId: string | null; body: Record<string, any> };

async function verify(request: FastifyRequest, reply: FastifyReply): Promise<Shop | null> {
  if (!shopifyReady()) { reply.code(503).send({ error: 'SHOPIFY_NOT_CONFIGURED' }); return null; }
  if (!request.rawBody) { reply.code(400).send({ error: 'RAW_WEBHOOK_BODY_REQUIRED' }); return null; }
  const sig = request.headers['x-shopify-hmac-sha256'];
  if (!validWebhookHmac(request.rawBody.toString(), typeof sig === 'string' ? sig : undefined)) { reply.code(401).send({ error: 'INVALID_WEBHOOK_SIGNATURE' }); return null; }
  const body = (request.body && typeof request.body === 'object' ? request.body : {}) as Record<string, any>;
  const header = request.headers['x-shopify-shop-domain'];
  const shop = normalizeShop(String(body.shop_domain ?? (typeof header === 'string' ? header : '')));
  if (!shop) { reply.code(400).send({ error: 'UNKNOWN_SHOP' }); return null; }
  const row = (await db.query<{ id: string; seller_id: string }>("SELECT id,seller_id FROM channel_connections WHERE provider='shopify' AND lower(store_url)=$1", [`https://${shop}`])).rows[0];
  return { shop, connectionId: row?.id ?? null, sellerId: row?.seller_id ?? null, body };
}

// Blank the personal details of customers whose every order is in `orderIds`; a customer who also has other orders is kept
// (the customer row is shared across a seller's orders, and in-flight parcels still need an address).
async function anonymiseCustomers(c: PoolClient, sellerId: string, orderIds: string[]): Promise<number> {
  if (!orderIds.length) return 0;
  const r = await c.query(
    `UPDATE customers SET full_name='Redacted customer', email=NULL, phone='0000000000', address_line_1='Redacted', address_line_2=NULL, updated_at=now()
      WHERE seller_id=$1 AND id IN (SELECT customer_id FROM orders WHERE seller_id=$1 AND id = ANY($2::uuid[]))
        AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.customer_id=customers.id AND o.seller_id=$1 AND NOT (o.id = ANY($2::uuid[])))`, [sellerId, orderIds]);
  return r.rowCount ?? 0;
}

export async function shopifyComplianceRoutes(app: FastifyInstance) {
  // A customer asked the merchant for their data. NEXGO holds only the order records the seller already owns, so the request is
  // recorded for the seller's audit trail and acknowledged; the seller answers the customer from their own order data.
  app.post('/v1/webhooks/shopify/customers-data-request', OPTS, async (request, reply) => {
    const s = await verify(request, reply); if (!s) return;
    if (s.sellerId) await withSellerTransaction(s.sellerId, (c) => audit(c, { sellerId: s.sellerId!, action: 'shopify.customers_data_request', targetType: 'channel_connection', targetId: s.connectionId!, requestId: request.id, metadata: { shop: s.shop, shopifyRequestId: s.body.data_request?.id ?? null, orders: s.body.orders_requested ?? [] } }));
    return { accepted: true };
  });

  // Erase one customer's personal data from the orders Shopify lists.
  app.post('/v1/webhooks/shopify/customers-redact', OPTS, async (request, reply) => {
    const s = await verify(request, reply); if (!s) return;
    if (!s.sellerId) return { accepted: true, ignored: 'store not connected' };
    const ext = (Array.isArray(s.body.orders_to_redact) ? s.body.orders_to_redact : []).map(String).filter((x: string) => /^\d{1,20}$/.test(x));
    const redacted = await withSellerTransaction(s.sellerId, async (c) => {
      const ids = ext.length ? (await c.query<{ id: string }>("SELECT id FROM orders WHERE seller_id=$1 AND channel='shopify' AND external_reference = ANY($2::text[])", [s.sellerId, ext])).rows.map((r) => r.id) : [];
      const n = await anonymiseCustomers(c, s.sellerId!, ids);
      await audit(c, { sellerId: s.sellerId!, action: 'shopify.customers_redact', targetType: 'channel_connection', targetId: s.connectionId!, requestId: request.id, metadata: { shop: s.shop, orders: ids.length, customersRedacted: n } });
      return n;
    });
    return { accepted: true, customersRedacted: redacted };
  });

  // 48 hours after the app is uninstalled: erase everything held for the shop.
  app.post('/v1/webhooks/shopify/shop-redact', OPTS, async (request, reply) => {
    const s = await verify(request, reply); if (!s) return;
    if (!s.sellerId) return { accepted: true, ignored: 'store not connected' };
    await withSellerTransaction(s.sellerId, async (c) => {
      const ids = (await c.query<{ id: string }>("SELECT id FROM orders WHERE seller_id=$1 AND channel_connection_id=$2", [s.sellerId, s.connectionId])).rows.map((r) => r.id);
      const n = await anonymiseCustomers(c, s.sellerId!, ids);
      await c.query('DELETE FROM channel_connections WHERE id=$1 AND seller_id=$2', [s.connectionId, s.sellerId]);
      await audit(c, { sellerId: s.sellerId!, action: 'shopify.shop_redact', targetType: 'channel_connection', targetId: s.connectionId!, requestId: request.id, metadata: { shop: s.shop, orders: ids.length, customersRedacted: n } });
    });
    return { accepted: true };
  });
}
