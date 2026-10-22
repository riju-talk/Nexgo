import { createHmac, timingSafeEqual } from 'node:crypto';
import type { PoolClient } from 'pg';
import { config } from '../config.js';
import { db, withSellerTransaction } from '../db/client.js';
import { decryptSecret } from './crypto.js';
import { queueCodConfirmation } from './codConfirmation.js';

// Shopify Admin GraphQL integration: OAuth helpers, order import, webhook registration and tracking push-back.
// REST orders are legacy for new apps, so everything (including webhook-triggered imports) goes through GraphQL.

// Tests point this at a fake Shopify; it is ignored in production so a stray env var can never redirect real tokens.
const shopBase = (shop: string) => (process.env.NODE_ENV !== 'production' && process.env.SHOPIFY_TEST_BASE) || `https://${shop}`;
export const shopifyReady = () => Boolean(config.SHOPIFY_CLIENT_ID && config.SHOPIFY_CLIENT_SECRET);
export const publicBase = () => (config.SHOPIFY_PUBLIC_URL ?? config.FRONTEND_ORIGIN).replace(/\/$/, '');
export const redirectUri = () => `${publicBase()}/v1/channels/shopify/callback`;

// Accepts "my-store", "my-store.myshopify.com", a pasted URL, or the new admin URL (admin.shopify.com/store/my-store).
// Custom domains (www.shop.com) cannot be mapped to a shop handle, so they return null and the seller is asked for the .myshopify.com address.
export function normalizeShop(input: string): string | null {
  let s = input.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '');
  const admin = s.match(/^admin\.shopify\.com\/store\/([a-z0-9][a-z0-9-]*)/);
  if (admin) s = `${admin[1]}.myshopify.com`;
  s = s.split(/[/?#]/)[0];
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// `kind` lets callers react: an 'auth' failure means the stored token is dead and the store needs reconnecting.
export class ShopifyError extends Error {
  readonly expose = true; // the message is safe to show the seller (see the error handler in app.ts)
  constructor(message: string, readonly kind: 'auth' | 'throttled' | 'access' | 'other' = 'other') { super(message); }
}
export async function gql(shop: string, token: string, query: string, variables: Record<string, unknown> = {}, attempt = 0): Promise<any> {
  let res: Response;
  try { res = await fetch(`${shopBase(shop)}/admin/api/${config.SHOPIFY_API_VERSION}/graphql.json`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-shopify-access-token': token }, body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(10_000) }); }
  catch { throw new ShopifyError('Shopify did not respond in time. Try again in a moment.'); }
  if (res.status === 401 || res.status === 403) throw new ShopifyError('Shopify rejected the access token. Reconnect the store.', 'auth');
  if (res.status === 402 || res.status === 423) throw new ShopifyError('This Shopify store is unavailable (frozen or pending payment).', 'auth');
  if (res.status === 404) throw new ShopifyError('This Shopify store no longer exists or the app was uninstalled. Reconnect the store.', 'auth');
  if (res.status === 429 && attempt < 1) { await sleep(Math.min(3000, (Number(res.headers.get('retry-after')) || 1) * 1000)); return gql(shop, token, query, variables, attempt + 1); }
  if (!res.ok) throw new ShopifyError(`Shopify API error ${res.status}`);
  const json = await res.json().catch(() => null) as { data?: unknown; errors?: { message: string; extensions?: { code?: string } }[] } | null;
  if (!json) throw new ShopifyError('Shopify returned an unreadable response.');
  if (json.errors?.length) {
    if (json.errors.some((e) => e.extensions?.code === 'THROTTLED') && attempt < 1) { await sleep(1500); return gql(shop, token, query, variables, attempt + 1); }
    const msg = json.errors.map((e) => e.message).join('; ');
    if (/protected[ -]customer[ -]data|not approved to access|access denied/i.test(msg)) throw new ShopifyError('Shopify has not approved protected customer data access for this app yet (request it in the Dev Dashboard under API access).', 'access');
    if (/throttled/i.test(msg)) throw new ShopifyError('Shopify is rate limiting this store. Try again in a minute.', 'throttled');
    throw new ShopifyError(msg.slice(0, 300));
  }
  return json.data;
}

export async function exchangeCode(shop: string, code: string): Promise<string> {
  let res: Response;
  try { res = await fetch(`${shopBase(shop)}/admin/oauth/access_token`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ client_id: config.SHOPIFY_CLIENT_ID, client_secret: config.SHOPIFY_CLIENT_SECRET, code }), signal: AbortSignal.timeout(10_000) }); }
  catch { throw new ShopifyError('Shopify did not respond while authorising. Try connecting again.'); }
  const json = await res.json().catch(() => ({})) as { access_token?: string };
  if (!res.ok || !json.access_token) throw new ShopifyError('Shopify did not return an access token. The approval may have expired: start the connection again.');
  return json.access_token;
}

export const WEBHOOK_CREATE = 'mutation($t:WebhookSubscriptionTopic!,$u:String!){webhookSubscriptionCreate(topic:$t,webhookSubscription:{uri:$u,format:JSON}){userErrors{message}}}';
const WEBHOOK_TOPICS = ['ORDERS_CREATE', 'ORDERS_CANCELLED', 'APP_UNINSTALLED'];
export async function registerWebhooks(shop: string, token: string) {
  const base = publicBase(); if (!base.startsWith('https://')) return { skipped: 'Webhooks need a public https URL (not available on localhost).' };
  const problems: string[] = [];
  for (const topic of WEBHOOK_TOPICS) {
    try {
      const r = await gql(shop, token, WEBHOOK_CREATE, { t: topic, u: `${base}/v1/webhooks/shopify` });
      for (const e of r.webhookSubscriptionCreate?.userErrors ?? []) if (!/already been taken|already exists/i.test(e.message)) problems.push(`${topic}: ${e.message}`); // re-installing an app re-registers the same topic
    } catch (e) { problems.push(`${topic}: ${(e as Error).message}`); }
  }
  if (problems.length) console.warn(`Shopify webhook registration for ${shop}: ${problems.join('; ')}`);
  return { registered: WEBHOOK_TOPICS.length - problems.length, problems };
}

const MONEY = 'shopMoney{amount}';
// Shopify refuses a query whose worst-case cost is over 1000 points. Weight therefore comes from Order.totalWeight (a free scalar)
// instead of a four-object lookup per line item, and list pages are small: orders(first:10) x lineItems(first:15) costs about 650.
const orderFields = (lines: number) => `id legacyResourceId name createdAt updatedAt cancelledAt note currencyCode totalWeight displayFinancialStatus displayFulfillmentStatus paymentGatewayNames email phone
  totalPriceSet{${MONEY}} subtotalPriceSet{${MONEY}} totalShippingPriceSet{${MONEY}} totalDiscountsSet{${MONEY}} totalTaxSet{${MONEY}} totalOutstandingSet{${MONEY}}
  shippingAddress{name address1 address2 city province zip phone company countryCodeV2} customer{displayName email phone}
  lineItems(first:${lines}){nodes{sku title quantity requiresShipping originalUnitPriceSet{${MONEY}}}}`;
export const ORDER_QUERY = `query($id:ID!){order(id:$id){${orderFields(50)}}}`;
export const ORDERS_PAGE = 10;
export const ORDERS_QUERY = `query($after:String,$q:String){orders(first:${ORDERS_PAGE},after:$after,query:$q,sortKey:UPDATED_AT){pageInfo{hasNextPage endCursor} nodes{${orderFields(15)}}}}`;
export const FULFILLMENT_ORDERS_QUERY = 'query($id:ID!){order(id:$id){fulfillmentOrders(first:10){nodes{id status}}}}';
export const FULFILLMENT_CREATE = 'mutation($f:FulfillmentInput!){fulfillmentCreate(fulfillment:$f){fulfillment{id} userErrors{message}}}';
export const FULFILLMENT_CANCEL = 'mutation($id:ID!){fulfillmentCancel(id:$id){userErrors{message}}}';

type Node = Record<string, any>;
const paise = (m?: { shopMoney?: { amount?: string } }) => Math.max(0, Math.round(parseFloat(m?.shopMoney?.amount ?? '0') * 100) || 0);
const tenDigits = (raw: string) => { const d = raw.replace(/\D/g, ''); return d.length >= 10 ? d.slice(-10) : d.length >= 7 ? d : '0000000000'; };
const COD_GATEWAY = /cash on delivery|\bcod\b|pay on delivery/i;

export async function fetchOrder(shop: string, token: string, gid: string): Promise<Node | null> {
  return (await gql(shop, token, ORDER_QUERY, { id: gid })).order ?? null;
}

export type Channel = { id: string; seller_id: string; store_url: string; token: string };
export async function loadChannel(channelId: string): Promise<Channel | null> {
  const r = await db.query<{ id: string; seller_id: string; store_url: string; encrypted_credentials: Buffer | null; key_reference: string | null }>("SELECT id,seller_id,store_url,encrypted_credentials,key_reference FROM channel_connections WHERE id=$1 AND provider='shopify'", [channelId]);
  const row = r.rows[0]; if (!row?.encrypted_credentials || !row.key_reference) return null;
  try { return { id: row.id, seller_id: row.seller_id, store_url: row.store_url, token: decryptSecret(row.encrypted_credentials, row.key_reference) }; }
  catch { return null; } // a token we can no longer decrypt (key rotated) is the same as no token: the seller reconnects
}
export const shopOf = (c: Channel) => c.store_url.replace(/^https?:\/\//, '');

export type ImportResult = 'created' | 'exists' | 'cancelled' | 'skipped';
// Which orders are worth importing: shippable domestic INR orders that nobody has fulfilled, voided or refunded already.
function skipReason(node: Node): string | null {
  if (node.cancelledAt) return 'cancelled';
  if (node.currencyCode && node.currencyCode !== 'INR') return 'currency';
  const ship = node.shippingAddress; if (!ship) return 'no shipping address';
  if (ship.countryCodeV2 && ship.countryCodeV2 !== 'IN') return 'international';
  if (['FULFILLED', 'RESTOCKED'].includes(node.displayFulfillmentStatus)) return 'already fulfilled';
  if (['VOIDED', 'REFUNDED', 'EXPIRED'].includes(node.displayFinancialStatus)) return 'voided or refunded';
  if (!(node.lineItems?.nodes ?? []).some((l: Node) => l.requiresShipping !== false)) return 'nothing to ship';
  return null;
}

export async function importOrder(ch: Channel, node: Node): Promise<ImportResult> {
  const ext = String(node.legacyResourceId ?? node.id.split('/').pop());
  return withSellerTransaction(ch.seller_id, async (c: PoolClient): Promise<ImportResult> => {
    const existing = await c.query<{ id: string }>('SELECT id FROM orders WHERE seller_id=$1 AND external_reference=$2', [ch.seller_id, ext]);
    if (existing.rows[0]) {
      if (!node.cancelledAt) return 'exists';
      const done = await c.query("UPDATE orders SET state='cancelled',cancelled_at=now(),updated_at=now() WHERE id=$1 AND state IN ('new','ready_to_ship','draft') AND NOT EXISTS (SELECT 1 FROM shipments s WHERE s.order_id=orders.id)", [existing.rows[0].id]);
      return done.rowCount ? 'cancelled' : 'exists';
    }
    if (skipReason(node)) return 'skipped';
    const ship = node.shippingAddress; const lines: Node[] = (node.lineItems?.nodes ?? []).filter((l: Node) => l.requiresShipping !== false);
    const wh = (await c.query<{ id: string }>('SELECT id FROM warehouses WHERE seller_id=$1 AND is_active ORDER BY is_return_address, created_at LIMIT 1', [ch.seller_id])).rows[0];
    if (!wh) throw new Error('Add a pickup warehouse before importing orders.');

    const totalQty = lines.reduce((n, l) => n + Math.max(1, l.quantity | 0), 0) || 1; const orderWeight = Math.max(0, Math.round(Number(node.totalWeight) || 0));
    let items = lines.map((l) => ({ sku: String(l.sku || 'NA').slice(0, 80), name: String(l.title || 'Item').trim().slice(0, 200).padEnd(2, ' '), quantity: Math.min(10_000, Math.max(1, l.quantity | 0)), unit: paise(l.originalUnitPriceSet), weightG: Math.round(orderWeight / totalQty) }));
    if (items.length > 5) { // the DB allows 5 products per order: fold the tail into one line so no order is lost
      const rest = items.slice(4);
      items = [...items.slice(0, 4), { sku: 'MULTI', name: `${rest.length} more items`, quantity: 1, unit: rest.reduce((s, i) => s + i.unit * i.quantity, 0), weightG: rest.reduce((s, i) => s + i.weightG * i.quantity, 0) }];
    }
    const subtotal = items.reduce((s, i) => s + i.unit * i.quantity, 0);
    const total = paise(node.totalPriceSet) || subtotal;
    const isCod = (node.paymentGatewayNames ?? []).some((g: string) => COD_GATEWAY.test(g)) && total > 0;
    const outstanding = paise(node.totalOutstandingSet); const codAmount = isCod ? Math.min(total, outstanding > 0 ? outstanding : total) : 0; // part-paid COD: collect only what is still owed

    // Missing/odd consignee data still imports (placeholder values) so the order lands in Track > Failed where the seller can correct it.
    const name = String(ship.name || node.customer?.displayName || 'Customer').trim().slice(0, 120).padEnd(2, ' '); const phone = tenDigits(String(ship.phone || node.phone || node.customer?.phone || ''));
    const zip = String(ship.zip ?? '').replace(/\s/g, ''); const pin = /^\d{6}$/.test(zip) ? zip : '000000';
    let customer = (await c.query<{ id: string }>('SELECT id FROM customers WHERE seller_id=$1 AND phone=$2 AND pincode=$3 AND full_name=$4 LIMIT 1', [ch.seller_id, phone, pin, name])).rows[0];
    if (!customer) customer = (await c.query<{ id: string }>('INSERT INTO customers (seller_id,full_name,email,phone,address_line_1,address_line_2,city,state,pincode,company_name) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id', [ch.seller_id, name, node.email || node.customer?.email || null, phone, String(ship.address1 || 'Address missing').slice(0, 200), ship.address2 || null, String(ship.city || 'Unknown').slice(0, 80), String(ship.province || 'Unknown').slice(0, 80), pin, ship.company || null])).rows[0];

    const clash = await c.query('SELECT 1 FROM orders WHERE seller_id=$1 AND order_number=$2', [ch.seller_id, node.name]);
    const orderNumber = String(clash.rowCount ? `${node.name}-${ext}` : node.name).slice(0, 100);
    const inserted = await c.query<{ id: string }>(`INSERT INTO orders (seller_id,warehouse_id,customer_id,order_number,external_reference,payment_mode,cod_amount_paise,subtotal_paise,total_weight_g,notes,state,shipping_charges_paise,discount_paise,tax_paise,total_paise,channel,channel_connection_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'new',$11,$12,$13,$14,'shopify',$15) ON CONFLICT (seller_id, external_reference) DO NOTHING RETURNING id`,
    [ch.seller_id, wh.id, customer.id, orderNumber, ext, isCod ? 'cod' : 'prepaid', codAmount, subtotal, orderWeight, node.note ? String(node.note).slice(0, 2000) : null, paise(node.totalShippingPriceSet), paise(node.totalDiscountsSet), paise(node.totalTaxSet), total, ch.id]);
    if (!inserted.rows[0]) return 'exists';
    for (const i of items) await c.query('INSERT INTO order_items (order_id,sku,name,quantity,unit_price_paise,weight_g) VALUES ($1,$2,$3,$4,$5,$6)', [inserted.rows[0].id, i.sku, i.name, i.quantity, i.unit, i.weightG]);
    await queueCodConfirmation(c, { sellerId: ch.seller_id, orderId: inserted.rows[0].id, paymentMode: isCod ? 'cod' : 'prepaid', channel: 'shopify', customerName: name, orderNumber });
    return 'created';
  }).catch((e): ImportResult => { if ((e as { code?: string }).code === '23505') return 'exists'; throw e; }); // a parallel delivery of the same order won the race
}

// Pulls orders oldest-update-first (60 days on the first sync, then everything updated since the last run).
// A sync that stops early (page budget or the serverless time limit) must not skip what it never reached: the cursor then only advances
// to the last order actually processed, and the next run carries on from there. Imports are idempotent, so overlap is harmless.
export type SyncTally = { created: number; exists: number; cancelled: number; skipped: number; failed: number; complete: boolean; firstError?: string };
export async function syncChannel(channelId: string, maxPages = 8, budgetMs = 20_000): Promise<SyncTally> {
  const ch = await loadChannel(channelId); if (!ch) throw new ShopifyError('This store is not authorised yet. Reconnect it with Shopify.', 'auth');
  const startedAt = new Date().toISOString(); const deadline = Date.now() + budgetMs;
  const since = (await db.query<{ sync_cursor: string | null }>('SELECT sync_cursor FROM channel_connections WHERE id=$1', [channelId])).rows[0]?.sync_cursor ?? new Date(Date.now() - 60 * 86_400_000).toISOString();
  const tally: SyncTally = { created: 0, exists: 0, cancelled: 0, skipped: 0, failed: 0, complete: false }; let after: string | null = null; let lastUpdatedAt = since;
  try {
    for (let page = 0; page < maxPages; page++) {
      const data = await gql(shopOf(ch), ch.token, ORDERS_QUERY, { after, q: `updated_at:>=${since}` });
      for (const node of data.orders.nodes as Node[]) {
        try { tally[await importOrder(ch, node)]++; }
        catch (e) { // one bad order must not block the rest of the store; a missing warehouse is systemic, so that one stops the run
          if (/warehouse/i.test((e as Error).message)) throw e;
          tally.failed++; tally.firstError ??= `${node.name}: ${(e as Error).message}`.slice(0, 200); console.warn(`Shopify order ${node.name} could not be imported: ${(e as Error).message}`);
        }
        if (node.updatedAt && node.updatedAt > lastUpdatedAt) lastUpdatedAt = node.updatedAt;
      }
      if (!data.orders.pageInfo.hasNextPage) { tally.complete = true; break; }
      after = data.orders.pageInfo.endCursor; if (Date.now() > deadline) break;
    }
    await db.query("UPDATE channel_connections SET state='connected',last_synced_at=now(),sync_cursor=$2,last_error=$3,updated_at=now() WHERE id=$1", [channelId, tally.complete ? startedAt : lastUpdatedAt, tally.failed ? `${tally.failed} order(s) could not be imported (${tally.firstError})` : null]);
  } catch (e) {
    const auth = e instanceof ShopifyError && e.kind === 'auth';
    await db.query("UPDATE channel_connections SET last_error=$2,state=CASE WHEN $3::boolean THEN 'error'::integration_state ELSE state END,updated_at=now() WHERE id=$1", [channelId, (e as Error).message.slice(0, 500), auth]);
    throw e;
  }
  return tally;
}

// Marks the order fulfilled in Shopify with the AWB so the customer gets the tracking email. Never throws: booking must not depend on it.
export async function pushTracking(sellerId: string, orderId: string, awb: string, courier: string, shipmentId?: string) {
  try {
    const row = (await db.query<{ ext: string; channel_connection_id: string | null }>("SELECT external_reference AS ext, channel_connection_id FROM orders WHERE id=$1 AND seller_id=$2 AND channel='shopify'", [orderId, sellerId])).rows[0];
    if (!row?.channel_connection_id) return;
    const ch = await loadChannel(row.channel_connection_id); if (!ch) return;
    const q = await gql(shopOf(ch), ch.token, FULFILLMENT_ORDERS_QUERY, { id: `gid://shopify/Order/${row.ext}` });
    const open = (q.order?.fulfillmentOrders?.nodes ?? []).filter((f: Node) => ['OPEN', 'IN_PROGRESS'].includes(f.status));
    if (!open.length) return; // already fulfilled in Shopify, or cancelled there
    const r = await gql(shopOf(ch), ch.token, FULFILLMENT_CREATE, { f: { notifyCustomer: true, trackingInfo: { number: awb, company: courier }, lineItemsByFulfillmentOrder: open.map((f: Node) => ({ fulfillmentOrderId: f.id })) } });
    const err = r.fulfillmentCreate?.userErrors?.[0]?.message; if (err) throw new Error(err);
    const fulfillmentId = r.fulfillmentCreate?.fulfillment?.id;
    if (fulfillmentId && shipmentId) await db.query('UPDATE shipments SET channel_fulfillment_id=$1 WHERE id=$2', [fulfillmentId, shipmentId]);
  } catch (e) {
    console.warn(`Shopify tracking push failed for order ${orderId}: ${(e as Error).message}`);
    await db.query('UPDATE channel_connections SET last_error=$2 WHERE id=(SELECT channel_connection_id FROM orders WHERE id=$1)', [orderId, `Could not mark order fulfilled in Shopify: ${(e as Error).message}`.slice(0, 500)]).catch(() => undefined);
  }
}

// A shipment cancelled in NEXGO must not stay "fulfilled" in the store. Best effort, like pushTracking.
export async function cancelTracking(sellerId: string, shipmentId: string) {
  try {
    const row = (await db.query<{ fid: string | null; cid: string | null }>('SELECT s.channel_fulfillment_id AS fid, o.channel_connection_id AS cid FROM shipments s JOIN orders o ON o.id=s.order_id WHERE s.id=$1 AND s.seller_id=$2', [shipmentId, sellerId])).rows[0];
    if (!row?.fid || !row.cid) return;
    const ch = await loadChannel(row.cid); if (!ch) return;
    const r = await gql(shopOf(ch), ch.token, FULFILLMENT_CANCEL, { id: row.fid });
    const err = r.fulfillmentCancel?.userErrors?.[0]?.message; if (err) throw new Error(err);
    await db.query('UPDATE shipments SET channel_fulfillment_id=NULL WHERE id=$1', [shipmentId]);
  } catch (e) { console.warn(`Shopify fulfillment cancel failed for shipment ${shipmentId}: ${(e as Error).message}`); }
}
