import { createHmac, timingSafeEqual } from 'node:crypto';
import type { PoolClient } from 'pg';
import { config } from '../config.js';
import { db, withSellerTransaction } from '../db/client.js';
import { decryptSecret } from './crypto.js';
import { queueCodConfirmation } from './codConfirmation.js';

// Shopify Admin GraphQL integration: OAuth helpers, order import, webhook registration and tracking push-back.
// REST orders are legacy for new apps, so everything (including webhook-triggered imports) goes through GraphQL.

export const shopifyReady = () => Boolean(config.SHOPIFY_CLIENT_ID && config.SHOPIFY_CLIENT_SECRET);
export const publicBase = () => (config.SHOPIFY_PUBLIC_URL ?? config.FRONTEND_ORIGIN).replace(/\/$/, '');
export const redirectUri = () => `${publicBase()}/v1/channels/shopify/callback`;

export function normalizeShop(input: string): string | null {
  let s = input.trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0];
  if (s && !s.includes('.')) s = `${s}.myshopify.com`;
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(s) ? s : null;
}

const hmacHex = (data: string) => createHmac('sha256', config.SHOPIFY_CLIENT_SECRET ?? '').update(data).digest('hex');
const safeEqual = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };

// Shopify signs the sorted query string (minus hmac) of the OAuth callback with the client secret.
export function validOauthHmac(query: Record<string, string>): boolean {
  const { hmac, ...rest } = query; if (!hmac) return false;
  const message = Object.keys(rest).sort().map((k) => `${k}=${rest[k]}`).join('&');
  return safeEqual(hmacHex(message), hmac);
}
export function validWebhookHmac(raw: string, header: string | undefined): boolean {
  if (!header) return false;
  return safeEqual(createHmac('sha256', config.SHOPIFY_CLIENT_SECRET ?? '').update(raw).digest('base64'), header);
}
// The state ties the install to one seller, one shop and one browser (the nonce is also kept in a cookie).
export function signState(sellerId: string, shop: string, nonce: string) {
  const body = Buffer.from(JSON.stringify({ s: sellerId, h: shop, n: nonce, e: Date.now() + 10 * 60_000 })).toString('base64url');
  return `${body}.${hmacHex(body)}`;
}
export function readState(state: string): { s: string; h: string; n: string } | null {
  const [body, sig] = state.split('.'); if (!body || !sig || !safeEqual(hmacHex(body), sig)) return null;
  try { const v = JSON.parse(Buffer.from(body, 'base64url').toString()); return v.e > Date.now() ? v : null; } catch { return null; }
}

export async function gql(shop: string, token: string, query: string, variables: Record<string, unknown> = {}): Promise<any> {
  const res = await fetch(`https://${shop}/admin/api/${config.SHOPIFY_API_VERSION}/graphql.json`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-shopify-access-token': token }, body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(15_000) });
  if (res.status === 401 || res.status === 403) throw new Error('Shopify rejected the access token. Reconnect the store.');
  if (!res.ok) throw new Error(`Shopify API error ${res.status}`);
  const json = await res.json() as { data?: unknown; errors?: { message: string }[] };
  if (json.errors?.length) {
    const msg = json.errors.map((e) => e.message).join('; ');
    throw new Error(/protected customer data|access denied/i.test(msg) ? 'Shopify has not approved protected customer data access for this app yet (request it in the Dev Dashboard under API access).' : msg.slice(0, 300));
  }
  return json.data;
}

export async function exchangeCode(shop: string, code: string): Promise<string> {
  const res = await fetch(`https://${shop}/admin/oauth/access_token`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ client_id: config.SHOPIFY_CLIENT_ID, client_secret: config.SHOPIFY_CLIENT_SECRET, code }), signal: AbortSignal.timeout(15_000) });
  const json = await res.json().catch(() => ({})) as { access_token?: string };
  if (!res.ok || !json.access_token) throw new Error('Shopify did not return an access token');
  return json.access_token;
}

const WEBHOOK_TOPICS = ['ORDERS_CREATE', 'ORDERS_CANCELLED', 'APP_UNINSTALLED'];
export async function registerWebhooks(shop: string, token: string) {
  const base = publicBase(); if (!base.startsWith('https://')) return { skipped: 'Webhooks need a public https URL (not available on localhost).' };
  for (const topic of WEBHOOK_TOPICS) {
    await gql(shop, token, 'mutation($t:WebhookSubscriptionTopic!,$u:URL!){webhookSubscriptionCreate(topic:$t,webhookSubscription:{callbackUrl:$u,format:JSON}){userErrors{message}}}', { t: topic, u: `${base}/v1/webhooks/shopify` })
      .catch((e) => console.warn(`Shopify webhook ${topic} for ${shop}: ${e.message}`)); // "already registered" must not block the install
  }
  return { registered: WEBHOOK_TOPICS.length };
}

const MONEY = 'shopMoney{amount}';
const ORDER_FIELDS = `id legacyResourceId name createdAt cancelledAt note displayFinancialStatus paymentGatewayNames email phone
  totalPriceSet{${MONEY}} subtotalPriceSet{${MONEY}} totalShippingPriceSet{${MONEY}} totalDiscountsSet{${MONEY}} totalTaxSet{${MONEY}}
  shippingAddress{name address1 address2 city province zip phone company} customer{displayName email phone}
  lineItems(first:50){nodes{sku title quantity originalUnitPriceSet{${MONEY}} variant{inventoryItem{measurement{weight{value unit}}}}}}`;

type Node = Record<string, any>;
const paise = (m?: { shopMoney?: { amount?: string } }) => Math.max(0, Math.round(parseFloat(m?.shopMoney?.amount ?? '0') * 100) || 0);
const grams = (w?: { value?: number; unit?: string }) => { if (!w?.value) return 0; const f = ({ KILOGRAMS: 1000, GRAMS: 1, POUNDS: 453.592, OUNCES: 28.3495 } as Record<string, number>)[w.unit ?? 'GRAMS'] ?? 1; return Math.round(w.value * f); };
const tenDigits = (raw: string) => { const d = raw.replace(/\D/g, ''); return d.length >= 10 ? d.slice(-10) : d.length >= 7 ? d : '0000000000'; };

export async function fetchOrder(shop: string, token: string, gid: string): Promise<Node | null> {
  return (await gql(shop, token, `query($id:ID!){order(id:$id){${ORDER_FIELDS}}}`, { id: gid })).order ?? null;
}

export type Channel = { id: string; seller_id: string; store_url: string; token: string };
export async function loadChannel(channelId: string): Promise<Channel | null> {
  const r = await db.query<{ id: string; seller_id: string; store_url: string; encrypted_credentials: Buffer | null; key_reference: string | null }>("SELECT id,seller_id,store_url,encrypted_credentials,key_reference FROM channel_connections WHERE id=$1 AND provider='shopify'", [channelId]);
  const row = r.rows[0]; if (!row?.encrypted_credentials || !row.key_reference) return null;
  return { id: row.id, seller_id: row.seller_id, store_url: row.store_url, token: decryptSecret(row.encrypted_credentials, row.key_reference) };
}
export const shopOf = (c: Channel) => c.store_url.replace(/^https?:\/\//, '');

export async function importOrder(ch: Channel, node: Node): Promise<'created' | 'exists' | 'cancelled' | 'skipped'> {
  const ext = String(node.legacyResourceId ?? node.id.split('/').pop());
  return withSellerTransaction(ch.seller_id, async (c: PoolClient) => {
    const existing = await c.query<{ id: string }>('SELECT id FROM orders WHERE seller_id=$1 AND external_reference=$2', [ch.seller_id, ext]);
    if (existing.rows[0]) {
      if (!node.cancelledAt) return 'exists';
      const done = await c.query("UPDATE orders SET state='cancelled',cancelled_at=now(),updated_at=now() WHERE id=$1 AND state IN ('new','ready_to_ship','draft') AND NOT EXISTS (SELECT 1 FROM shipments s WHERE s.order_id=orders.id)", [existing.rows[0].id]);
      return done.rowCount ? 'cancelled' : 'exists';
    }
    const ship = node.shippingAddress; const lines: Node[] = node.lineItems?.nodes ?? [];
    if (node.cancelledAt || !ship || !lines.length) return 'skipped'; // cancelled before import, or nothing to ship
    const wh = (await c.query<{ id: string }>('SELECT id FROM warehouses WHERE seller_id=$1 AND is_active ORDER BY is_return_address, created_at LIMIT 1', [ch.seller_id])).rows[0];
    if (!wh) throw new Error('Add a pickup warehouse before importing orders.');

    let items = lines.map((l) => ({ sku: String(l.sku || 'NA').slice(0, 80), name: String(l.title || 'Item').slice(0, 200), quantity: Math.min(10_000, Math.max(1, l.quantity | 0)), unit: paise(l.originalUnitPriceSet), weightG: grams(l.variant?.inventoryItem?.measurement?.weight) }));
    if (items.length > 5) { // the DB allows 5 products per order: fold the tail into one line so no order is lost
      const rest = items.slice(4);
      items = [...items.slice(0, 4), { sku: 'MULTI', name: `${rest.length} more items`, quantity: 1, unit: rest.reduce((s, i) => s + i.unit * i.quantity, 0), weightG: rest.reduce((s, i) => s + i.weightG * i.quantity, 0) }];
    }
    const subtotal = items.reduce((s, i) => s + i.unit * i.quantity, 0); const weight = items.reduce((s, i) => s + i.weightG * i.quantity, 0);
    const total = paise(node.totalPriceSet) || subtotal; const cod = (node.paymentGatewayNames ?? []).some((g: string) => /cash on delivery|\bcod\b/i.test(g)) && total > 0;

    // Missing/odd consignee data still imports (placeholder values) so the order lands in Track > Failed where the seller can correct it.
    const name = String(ship.name || node.customer?.displayName || 'Customer').slice(0, 120); const phone = tenDigits(String(ship.phone || node.phone || node.customer?.phone || ''));
    const zip = String(ship.zip ?? '').replace(/\s/g, ''); const pin = /^\d{6}$/.test(zip) ? zip : '000000';
    let customer = (await c.query<{ id: string }>('SELECT id FROM customers WHERE seller_id=$1 AND phone=$2 AND pincode=$3 AND full_name=$4 LIMIT 1', [ch.seller_id, phone, pin, name])).rows[0];
    if (!customer) customer = (await c.query<{ id: string }>('INSERT INTO customers (seller_id,full_name,email,phone,address_line_1,address_line_2,city,state,pincode,company_name) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id', [ch.seller_id, name, node.email || node.customer?.email || null, phone, String(ship.address1 || 'Address missing').slice(0, 200), ship.address2 || null, String(ship.city || 'Unknown').slice(0, 80), String(ship.province || 'Unknown').slice(0, 80), pin, ship.company || null])).rows[0];

    const clash = await c.query('SELECT 1 FROM orders WHERE seller_id=$1 AND order_number=$2', [ch.seller_id, node.name]);
    const orderNumber = clash.rowCount ? `${node.name}-${ext}` : String(node.name);
    const inserted = await c.query<{ id: string }>(`INSERT INTO orders (seller_id,warehouse_id,customer_id,order_number,external_reference,payment_mode,cod_amount_paise,subtotal_paise,total_weight_g,notes,state,shipping_charges_paise,discount_paise,tax_paise,total_paise,channel,channel_connection_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'new',$11,$12,$13,$14,'shopify',$15) ON CONFLICT (seller_id, external_reference) DO NOTHING RETURNING id`,
    [ch.seller_id, wh.id, customer.id, orderNumber, ext, cod ? 'cod' : 'prepaid', cod ? total : 0, subtotal, weight, node.note ? String(node.note).slice(0, 2000) : null, paise(node.totalShippingPriceSet), paise(node.totalDiscountsSet), paise(node.totalTaxSet), total, ch.id]);
    if (!inserted.rows[0]) return 'exists';
    for (const i of items) await c.query('INSERT INTO order_items (order_id,sku,name,quantity,unit_price_paise,weight_g) VALUES ($1,$2,$3,$4,$5,$6)', [inserted.rows[0].id, i.sku, i.name, i.quantity, i.unit, i.weightG]);
    await queueCodConfirmation(c, { sellerId: ch.seller_id, orderId: inserted.rows[0].id, paymentMode: cod ? 'cod' : 'prepaid', channel: 'shopify', customerName: name, orderNumber });
    return 'created';
  });
}

// Pulls orders (60 days on first sync, then everything updated since the last run), a page of 50 at a time.
export async function syncChannel(channelId: string, maxPages = 5) {
  const ch = await loadChannel(channelId); if (!ch) throw new Error('This store is not authorised yet. Reconnect it with Shopify.');
  const startedAt = new Date().toISOString();
  const since = (await db.query<{ sync_cursor: string | null }>('SELECT sync_cursor FROM channel_connections WHERE id=$1', [channelId])).rows[0]?.sync_cursor ?? new Date(Date.now() - 60 * 86_400_000).toISOString();
  const tally = { created: 0, exists: 0, cancelled: 0, skipped: 0 }; let after: string | null = null;
  try {
    for (let page = 0; page < maxPages; page++) {
      const data = await gql(shopOf(ch), ch.token, `query($after:String,$q:String){orders(first:50,after:$after,query:$q,sortKey:UPDATED_AT){pageInfo{hasNextPage endCursor} nodes{${ORDER_FIELDS}}}}`, { after, q: `updated_at:>=${since}` });
      for (const node of data.orders.nodes as Node[]) tally[await importOrder(ch, node)]++;
      if (!data.orders.pageInfo.hasNextPage) break; after = data.orders.pageInfo.endCursor;
    }
    await db.query("UPDATE channel_connections SET state='connected',last_synced_at=now(),sync_cursor=$2,last_error=NULL,updated_at=now() WHERE id=$1", [channelId, startedAt]);
  } catch (e) {
    await db.query('UPDATE channel_connections SET last_error=$2,updated_at=now() WHERE id=$1', [channelId, (e as Error).message.slice(0, 500)]);
    throw e;
  }
  return tally;
}

// Marks the order fulfilled in Shopify with the AWB so the customer gets the tracking email. Never throws: booking must not depend on it.
export async function pushTracking(sellerId: string, orderId: string, awb: string, courier: string) {
  try {
    const row = (await db.query<{ ext: string; channel_connection_id: string | null }>("SELECT external_reference AS ext, channel_connection_id FROM orders WHERE id=$1 AND seller_id=$2 AND channel='shopify'", [orderId, sellerId])).rows[0];
    if (!row?.channel_connection_id) return;
    const ch = await loadChannel(row.channel_connection_id); if (!ch) return;
    const q = await gql(shopOf(ch), ch.token, 'query($id:ID!){order(id:$id){fulfillmentOrders(first:10){nodes{id status}}}}', { id: `gid://shopify/Order/${row.ext}` });
    const open = (q.order?.fulfillmentOrders?.nodes ?? []).filter((f: Node) => ['OPEN', 'IN_PROGRESS'].includes(f.status));
    if (!open.length) return;
    const r = await gql(shopOf(ch), ch.token, 'mutation($f:FulfillmentInput!){fulfillmentCreate(fulfillment:$f){userErrors{message}}}', { f: { notifyCustomer: true, trackingInfo: { number: awb, company: courier }, lineItemsByFulfillmentOrder: open.map((f: Node) => ({ fulfillmentOrderId: f.id })) } });
    const err = r.fulfillmentCreate?.userErrors?.[0]?.message; if (err) throw new Error(err);
  } catch (e) {
    console.warn(`Shopify tracking push failed for order ${orderId}: ${(e as Error).message}`);
    await db.query('UPDATE channel_connections SET last_error=$2 WHERE id=(SELECT channel_connection_id FROM orders WHERE id=$1)', [orderId, `Could not mark order fulfilled in Shopify: ${(e as Error).message}`.slice(0, 500)]).catch(() => undefined);
  }
}
