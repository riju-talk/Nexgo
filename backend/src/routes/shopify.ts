import { randomBytes } from 'node:crypto';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { config } from '../config.js';
import { db, withSellerTransaction } from '../db/client.js';
import { audit } from '../lib/audit.js';
import { encryptSecret } from '../lib/crypto.js';
import { exchangeCode, fetchOrder, importOrder, loadChannel, normalizeShop, readState, redirectUri, registerWebhooks, shopOf, shopifyReady, signState, syncChannel, validOauthHmac, validWebhookHmac } from '../lib/shopify.js';
import { requireSeller } from './seller.js';

const NONCE_COOKIE = 'nx_shopify_nonce';
const COOKIE_PATH = '/v1/channels/shopify';
const back = (reply: FastifyReply, result: string, reason?: string) => reply.redirect(`${config.FRONTEND_ORIGIN}/channels/shopify?shopify=${result}${reason ? `&reason=${encodeURIComponent(reason)}` : ''}`);

export async function shopifyRoutes(app: FastifyInstance) {
  // Step 1: the seller types their shop domain; we send the browser to Shopify's consent screen.
  app.get('/v1/channels/shopify/install', { preHandler: requireSeller }, async (request, reply) => {
    if (!shopifyReady()) return reply.code(503).send({ error: 'SHOPIFY_NOT_CONFIGURED', message: 'Shopify is not configured on this server.' });
    const { shop: raw } = z.object({ shop: z.string().trim().min(1).max(200) }).parse(request.query);
    const shop = normalizeShop(raw); if (!shop) return back(reply, 'error', 'Enter your store address like my-store.myshopify.com');
    const nonce = randomBytes(16).toString('hex');
    reply.setCookie(NONCE_COOKIE, nonce, { httpOnly: true, sameSite: 'lax', secure: config.NODE_ENV === 'production', path: COOKIE_PATH, maxAge: 600 });
    const url = new URL(`https://${shop}/admin/oauth/authorize`);
    url.search = new URLSearchParams({ client_id: config.SHOPIFY_CLIENT_ID!, scope: config.SHOPIFY_SCOPES, redirect_uri: redirectUri(), state: signState(request.principal!.sellerId, shop, nonce) }).toString();
    return reply.redirect(url.toString());
  });

  // Step 2: Shopify sends the merchant back here with a one-time code, which we exchange for the store's access token.
  app.get('/v1/channels/shopify/callback', { preHandler: requireSeller }, async (request, reply) => {
    const x = request.principal!; const q = request.query as Record<string, string>;
    reply.clearCookie(NONCE_COOKIE, { path: COOKIE_PATH });
    if (!shopifyReady()) return back(reply, 'error', 'Shopify is not configured on this server.');
    if (q.error) return back(reply, 'error', q.error_description || 'Shopify authorisation was declined.');
    const state = readState(q.state ?? ''); const shop = normalizeShop(q.shop ?? '');
    if (!validOauthHmac(q) || !state || !shop || state.h !== shop || state.s !== x.sellerId || state.n !== request.cookies[NONCE_COOKIE]) return back(reply, 'error', 'The Shopify request could not be verified. Start the connection again.');
    try {
      const token = await exchangeCode(shop, q.code); const enc = encryptSecret(token);
      const channelId = await withSellerTransaction(x.sellerId, async (c) => {
        await c.query("DELETE FROM channel_connections WHERE seller_id=$1 AND provider='shopify' AND lower(store_url)=$2 AND encrypted_credentials IS NULL", [x.sellerId, `https://${shop}`]);
        const row = await c.query<{ id: string }>(`INSERT INTO channel_connections (seller_id,provider,display_name,store_url,state,encrypted_credentials,key_reference) VALUES ($1,'shopify',$2,$3,'connected',$4,$5)
          ON CONFLICT (seller_id,provider,display_name) DO UPDATE SET store_url=EXCLUDED.store_url,state='connected',encrypted_credentials=EXCLUDED.encrypted_credentials,key_reference=EXCLUDED.key_reference,last_error=NULL,updated_at=now() RETURNING id`,
        [x.sellerId, shop.replace('.myshopify.com', ''), `https://${shop}`, enc.ciphertext, enc.keyReference]);
        await audit(c, { sellerId: x.sellerId, actorUserId: x.userId, action: 'channel.shopify_connected', targetType: 'channel', targetId: row.rows[0].id, requestId: request.id, metadata: { shop } });
        return row.rows[0].id;
      });
      await registerWebhooks(shop, token).catch((e) => console.warn(`Shopify webhook registration failed: ${e.message}`));
      await syncChannel(channelId, 2).catch((e) => console.warn(`Initial Shopify sync failed: ${e.message}`)); // the error is kept on the connection and shown in the Marketplace table
      return back(reply, 'connected');
    } catch (e) {
      const clash = (e as { code?: string }).code === '23505';
      return back(reply, 'error', clash ? 'This Shopify store is already connected to another NEXGO account.' : (e as Error).message);
    }
  });

  // Order + lifecycle webhooks, signed by Shopify (HMAC of the raw body). Compliance topics are registered in the Dev Dashboard.
  app.post('/v1/webhooks/shopify', { config: { rawBody: true } }, async (request, reply) => {
    if (!shopifyReady()) return reply.code(503).send({ error: 'SHOPIFY_NOT_CONFIGURED' });
    if (!request.rawBody) return reply.code(400).send({ error: 'RAW_WEBHOOK_BODY_REQUIRED' });
    const h = request.headers; const header = (n: string) => (typeof h[n] === 'string' ? (h[n] as string) : undefined);
    if (!validWebhookHmac(request.rawBody.toString(), header('x-shopify-hmac-sha256'))) return reply.code(401).send({ error: 'INVALID_WEBHOOK_SIGNATURE' });
    const topic = header('x-shopify-topic') ?? ''; const shop = normalizeShop(header('x-shopify-shop-domain') ?? '');
    if (!shop) return reply.code(400).send({ error: 'UNKNOWN_SHOP' });
    const row = (await db.query<{ id: string; seller_id: string }>("SELECT id,seller_id FROM channel_connections WHERE provider='shopify' AND lower(store_url)=$1", [`https://${shop}`])).rows[0];
    if (!row) return { accepted: true, ignored: 'store not connected' }; // already disconnected on our side: acknowledge so Shopify stops retrying
    const body = (request.body ?? {}) as { admin_graphql_api_id?: string };

    if (topic === 'app/uninstalled') {
      await db.query("UPDATE channel_connections SET state='disconnected',encrypted_credentials=NULL,key_reference=NULL,last_error='The store uninstalled the NEXGO app. Connect it again to resume syncing.',updated_at=now() WHERE id=$1", [row.id]);
    } else if (topic === 'shop/redact') {
      await db.query('DELETE FROM channel_connections WHERE id=$1', [row.id]);
    } else if (topic === 'orders/create' || topic === 'orders/cancelled') {
      const ch = await loadChannel(row.id);
      if (ch && body.admin_graphql_api_id) { const node = await fetchOrder(shopOf(ch), ch.token, body.admin_graphql_api_id); if (node) await importOrder(ch, node); }
    } // customers/data_request and customers/redact: nothing is held outside the seller's own order records, so they are acknowledged.
    return { accepted: true };
  });
}
