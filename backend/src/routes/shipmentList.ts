import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { withSellerTransaction } from '../db/client.js';
import { maskCustomerRows } from '../lib/permissions.js';
import { IST, pickupPendingSql } from '../lib/metrics.js';
import { decodeCursor, encodeCursor, keysetBefore, mergeNewestFirst, parseLimit, tsText } from '../lib/paging.js';
import { requireSeller } from './seller.js';
import { READY_SQL, publicShipment } from './shipments.js';

/**
 * Track, loaded a screenful at a time. The browser asks for the first 50 rows, then "50 older than the last one you got" (keyset cursor) as the
 * user scrolls; tabs, search and filters are applied HERE, on all of the seller's records, not on whatever happens to be loaded.
 *
 *   GET /v1/shipments/list      one batch: { items, nextCursor, total? }   (total on the first batch only)
 *   GET /v1/shipments/summary   exact count of every tab with the current filters applied
 *   GET /v1/shipments/ids       the ids of everything matching a tab + filters (select all N, assign / cancel all N); up to 5,000
 *   GET /v1/shipments/filters   the seller's couriers / warehouses / channels for the drop-downs
 *
 * Two kinds of rows live in Track: shipments (a courier has the parcel) and orders that have no courier yet (Ready to ship, Exception & Error, and
 * orders cancelled before shipping). Tabs that mix them (All, Exception & Error, Cancelled) read both sources and merge them newest first.
 */
const TABS = ['all', 'ready', 'pickup', 'in_transit', 'out_for_delivery', 'ndr', 'delivered', 'rto', 'lost', 'cancelled', 'failed'] as const;
type Tab = (typeof TABS)[number];
const SHIPMENT_TABS: Tab[] = ['all', 'pickup', 'in_transit', 'out_for_delivery', 'ndr', 'delivered', 'rto', 'lost', 'cancelled', 'failed'];
const ORDER_TABS: Tab[] = ['all', 'ready', 'failed', 'cancelled'];

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const filterShape = {
  q: z.string().trim().max(120).optional(),
  courier: z.string().trim().max(120).optional(),
  pay: z.enum(['cod', 'prepaid']).optional(),
  mode: z.enum(['Air', 'Surface']).optional(),
  channel: z.string().trim().max(40).optional(),
  warehouse: z.string().trim().max(120).optional(),
  tag: z.string().trim().max(60).optional(),
  from: date.optional(),
  to: date.optional(),
};
type Filters = z.infer<z.ZodObject<typeof filterShape>>;
const escLike = (v: string) => v.replace(/[\\%_]/g, '\\$&');

function principal(request: FastifyRequest) {
  if (!request.principal) throw Object.assign(new Error('Authentication required'), { statusCode: 401 });
  return request.principal;
}

// ---- what each tab means, per source (the same definitions drive the list, the counts and the id lists)
const shipmentTabSql = (tab: Tab): string | null => ({
  all: 'TRUE', ready: null, pickup: pickupPendingSql('s.'), in_transit: `s.state = 'in_transit'`, out_for_delivery: `s.state = 'out_for_delivery'`, ndr: `s.state = 'ndr'`,
  delivered: `s.state = 'delivered'`, rto: `s.state IN ('rto','rto_in_transit')`, lost: `(s.state = 'lost' OR s.rto_status = 'lost')`, cancelled: `s.state = 'cancelled'`,
  failed: `(s.courier_cancelled_at IS NOT NULL AND s.state <> 'cancelled')`,
} as Record<Tab, string | null>)[tab];
const orderTabSql = (tab: Tab): string | null => ({
  all: `(o.state = 'cancelled' OR ${READY_SQL})`, ready: `(o.state IN ('new','ready_to_ship') AND ${READY_SQL})`, failed: `(o.state IN ('new','ready_to_ship') AND NOT ${READY_SQL})`,
  cancelled: `o.state = 'cancelled'`,
} as Partial<Record<Tab, string>>)[tab] ?? null;

const ORDER_BASE = `o.order_flow <> 'reverse' AND o.state IN ('new','ready_to_ship','cancelled') AND NOT EXISTS (SELECT 1 FROM shipments s2 WHERE s2.order_id = o.id)`;
const ITEMS = `LEFT JOIN LATERAL (SELECT count(*)::int AS products, COALESCE(sum(quantity),0)::int AS quantity, string_agg(name, ', ' ORDER BY name) AS product_names FROM order_items WHERE order_id = o.id) it ON true`;
const EVENT = `LEFT JOIN LATERAL (SELECT description, location, occurred_at FROM shipment_events WHERE shipment_id = s.id ORDER BY occurred_at DESC LIMIT 1) ev ON true`;

/** The filter conditions for one source. `params[0]` is always the seller. Filters a source cannot satisfy (an order has no courier) exclude it. */
function filterSql(f: Filters, source: 'shipment' | 'order', params: unknown[]): string[] {
  const out: string[] = []; const add = (value: unknown) => { params.push(value); return `$${params.length}`; };
  const day = source === 'shipment' ? 's.booked_at' : 'o.created_at';
  if (f.q) {
    const cols = source === 'shipment' ? `concat_ws(' ', s.awb, o.order_number, o.nexgo_order_id, c.full_name, c.phone, c.pincode, c.city, cp.name, it.product_names)` : `concat_ws(' ', o.order_number, o.nexgo_order_id, c.full_name, c.phone, c.pincode, c.city, it.product_names)`;
    out.push(`${cols} ILIKE ${add(`%${escLike(f.q)}%`)}`);
  }
  if (f.courier) out.push(source === 'shipment' ? `cp.name = ${add(f.courier)}` : 'FALSE');
  if (f.pay) out.push(`o.payment_mode = ${add(f.pay)}`);
  if (f.mode) out.push(source === 'shipment' ? `(CASE WHEN cs.service_type::text ~* '(air|express)' THEN 'Air' ELSE 'Surface' END) = ${add(f.mode)}` : 'FALSE');
  if (f.channel) out.push(`o.channel = ${add(f.channel)}`);
  if (f.warehouse) out.push(`w.name = ${add(f.warehouse)}`);
  if (f.tag) out.push(source === 'shipment' ? `${add(f.tag)} = ANY(s.tags)` : 'FALSE');
  if (f.from) out.push(`${day} >= (${add(f.from)}::date::timestamp ${IST})`);
  if (f.to) out.push(`${day} < ((${add(f.to)}::date + 1)::timestamp ${IST})`);
  return out;
}

const SHIPMENT_FROM = (withEvent: boolean) => `FROM shipments s JOIN orders o ON o.id = s.order_id JOIN customers c ON c.id = o.customer_id JOIN warehouses w ON w.id = o.warehouse_id
  JOIN courier_providers cp ON cp.id = s.provider_id JOIN courier_services cs ON cs.id = s.service_id ${ITEMS} ${withEvent ? EVENT : ''}`;
const ORDER_FROM = `FROM orders o JOIN customers c ON c.id = o.customer_id JOIN warehouses w ON w.id = o.warehouse_id ${ITEMS}`;

const SHIPMENT_COLUMNS = `s.*, o.order_number, o.nexgo_order_id, o.channel, o.payment_mode, o.cod_amount_paise, o.subtotal_paise, o.total_weight_g, o.order_flow, o.created_at AS order_created_at,
  c.full_name AS customer_name, c.phone AS customer_phone, c.city AS customer_city, c.pincode AS customer_pincode, cp.name AS courier_name, cs.display_name AS service_name, cs.service_type,
  w.name AS warehouse_name, w.pincode AS warehouse_pincode, w.city AS warehouse_city, it.products, it.quantity, it.product_names,
  ev.description AS last_description, ev.location AS last_location, ev.occurred_at AS last_event_at`;
const ORDER_STATE = `(CASE WHEN o.state = 'cancelled' THEN 'cancelled' WHEN ${READY_SQL} THEN 'ready' ELSE 'failed' END)`;
const ORDER_COLUMNS = `o.id, o.order_number, o.nexgo_order_id, o.channel, o.state AS order_state, ${ORDER_STATE} AS state, ${READY_SQL} AS ready, o.payment_mode, o.cod_amount_paise, o.subtotal_paise, o.total_weight_g, o.created_at,
  o.package_length_mm, o.package_width_mm, o.package_height_mm, c.full_name AS customer_name, c.phone AS customer_phone, c.city AS customer_city, c.pincode AS customer_pincode,
  c.address_line_1 AS customer_address1, c.address_line_2 AS customer_address2, c.landmark AS customer_landmark, c.state AS customer_state, c.email AS customer_email,
  w.name AS warehouse_name, w.pincode AS warehouse_pincode, w.city AS warehouse_city, it.quantity, it.product_names`;

type Row = Record<string, unknown> & { id: string; ts: string; kind: 'shipment' | 'order' };

async function fetchSource(client: import('pg').PoolClient, sellerId: string, source: 'shipment' | 'order', tab: Tab, f: Filters, cursor: ReturnType<typeof decodeCursor>, take: number, minimal: boolean): Promise<Row[]> {
  const tabSql = source === 'shipment' ? shipmentTabSql(tab) : orderTabSql(tab);
  if (!tabSql) return [];
  const params: unknown[] = [sellerId];
  const where = [source === 'shipment' ? 's.seller_id = $1' : `o.seller_id = $1 AND ${ORDER_BASE}`, tabSql, ...filterSql(f, source, params)];
  const idCol = source === 'shipment' ? 's.id' : 'o.id'; const tsCol = source === 'shipment' ? 's.created_at' : 'o.created_at';
  where.push(keysetBefore(cursor, tsCol, idCol, params));
  params.push(take);
  const select = minimal
    ? (source === 'shipment' ? `s.id, 'shipment' AS kind, s.state::text AS state, ${tsText(tsCol)} AS ts` : `o.id, 'order' AS kind, ${ORDER_STATE} AS state, ${tsText(tsCol)} AS ts`)
    : (source === 'shipment' ? `${SHIPMENT_COLUMNS}, 'shipment' AS kind, ${tsText(tsCol)} AS ts` : `${ORDER_COLUMNS}, 'order' AS kind, ${tsText(tsCol)} AS ts`);
  const from = source === 'shipment' ? SHIPMENT_FROM(!minimal) : ORDER_FROM;
  const rows = (await client.query(`SELECT ${select} ${from} WHERE ${where.join(' AND ')} ORDER BY ${tsCol} DESC, ${idCol} DESC LIMIT $${params.length}`, params)).rows as Row[];
  return rows;
}

async function countSource(client: import('pg').PoolClient, sellerId: string, source: 'shipment' | 'order', tab: Tab, f: Filters): Promise<number> {
  const tabSql = source === 'shipment' ? shipmentTabSql(tab) : orderTabSql(tab);
  if (!tabSql) return 0;
  const params: unknown[] = [sellerId];
  const where = [source === 'shipment' ? 's.seller_id = $1' : `o.seller_id = $1 AND ${ORDER_BASE}`, tabSql, ...filterSql(f, source, params)];
  const from = source === 'shipment' ? SHIPMENT_FROM(false) : ORDER_FROM;
  return (await client.query<{ n: number }>(`SELECT count(*)::int AS n ${from} WHERE ${where.join(' AND ')}`, params)).rows[0].n;
}

export async function shipmentListRoutes(app: FastifyInstance) {
  const listQuery = z.object({ tab: z.enum(TABS).default('all'), ...filterShape, limit: z.string().optional(), cursor: z.string().max(400).optional() });

  app.get('/v1/shipments/list', { preHandler: requireSeller }, async (request) => {
    const p = principal(request);
    const q = listQuery.parse(request.query);
    const limit = parseLimit(q.limit, 50, 200); const cursor = decodeCursor(q.cursor);
    return withSellerTransaction(p.sellerId, async (client) => {
      const wantShip = SHIPMENT_TABS.includes(q.tab); const wantOrder = ORDER_TABS.includes(q.tab);
      const [ships, orders] = await Promise.all([
        wantShip ? fetchSource(client, p.sellerId, 'shipment', q.tab, q, cursor, limit + 1, false) : Promise.resolve([]),
        wantOrder ? fetchSource(client, p.sellerId, 'order', q.tab, q, cursor, limit + 1, false) : Promise.resolve([]),
      ]);
      const merged = mergeNewestFirst([ships, orders], limit + 1);
      const hasMore = merged.length > limit; const page = merged.slice(0, limit);
      const last = page[page.length - 1];
      const shown = page.filter((r) => r.kind === 'shipment'); const unshipped = page.filter((r) => r.kind === 'order');
      const shownMasked = new Map(maskCustomerRows(shown.map((r) => publicShipment(r) as Row), p, 'shipments.view_customer').map((r) => [r.id, r]));
      const unshippedMasked = new Map(maskCustomerRows(unshipped, p, 'orders.view_customer').map((r) => [r.id, r]));
      const items = page.map((r) => (r.kind === 'shipment' ? shownMasked.get(r.id) : unshippedMasked.get(r.id)) as Row);
      // The grand total only on the first batch (it costs a count): the browser keeps it while scrolling.
      const total = cursor ? undefined : (wantShip ? await countSource(client, p.sellerId, 'shipment', q.tab, q) : 0) + (wantOrder ? await countSource(client, p.sellerId, 'order', q.tab, q) : 0);
      return { items, nextCursor: hasMore && last ? encodeCursor(last.ts, last.id) : null, ...(total !== undefined ? { total } : {}) };
    });
  });

  app.get('/v1/shipments/summary', { preHandler: requireSeller }, async (request) => {
    const p = principal(request);
    const f = z.object(filterShape).parse(request.query);
    return withSellerTransaction(p.sellerId, async (client) => {
      const ship: Tab[] = SHIPMENT_TABS; const ord: Tab[] = ORDER_TABS;
      const counts = Object.fromEntries(TABS.map((t) => [t, 0])) as Record<Tab, number>;
      // One scan per source, every tab counted with FILTER: eleven tabs do not mean eleven queries.
      const sp: unknown[] = [p.sellerId]; const sFilters = filterSql(f, 'shipment', sp);
      const s = (await client.query(`SELECT ${ship.map((t) => `count(*) FILTER (WHERE ${shipmentTabSql(t)})::int AS "${t}"`).join(', ')} ${SHIPMENT_FROM(false)} WHERE s.seller_id = $1 ${sFilters.map((c) => `AND ${c}`).join(' ')}`, sp)).rows[0] as Record<Tab, number>;
      const op: unknown[] = [p.sellerId]; const oFilters = filterSql(f, 'order', op);
      const o = (await client.query(`SELECT ${ord.map((t) => `count(*) FILTER (WHERE ${orderTabSql(t)})::int AS "${t}"`).join(', ')} ${ORDER_FROM} WHERE o.seller_id = $1 AND ${ORDER_BASE} ${oFilters.map((c) => `AND ${c}`).join(' ')}`, op)).rows[0] as Record<Tab, number>;
      for (const t of ship) counts[t] += s[t] ?? 0;
      for (const t of ord) counts[t] += o[t] ?? 0;
      return { counts };
    });
  });

  app.get('/v1/shipments/ids', { preHandler: requireSeller }, async (request) => {
    const p = principal(request);
    const q = z.object({ tab: z.enum(TABS).default('all'), ...filterShape, limit: z.string().optional() }).parse(request.query);
    const limit = parseLimit(q.limit, 5000, 5000);
    return withSellerTransaction(p.sellerId, async (client) => {
      const [ships, orders] = await Promise.all([
        SHIPMENT_TABS.includes(q.tab) ? fetchSource(client, p.sellerId, 'shipment', q.tab, q, null, limit + 1, true) : Promise.resolve([]),
        ORDER_TABS.includes(q.tab) ? fetchSource(client, p.sellerId, 'order', q.tab, q, null, limit + 1, true) : Promise.resolve([]),
      ]);
      const merged = mergeNewestFirst([ships, orders], limit + 1);
      return { items: merged.slice(0, limit).map((r) => ({ id: r.id, kind: r.kind, state: r.state })), truncated: merged.length > limit };
    });
  });

  app.get('/v1/shipments/filters', { preHandler: requireSeller }, async (request) => {
    const p = principal(request);
    return withSellerTransaction(p.sellerId, async (client) => {
      const [couriers, warehouses, channels] = await Promise.all([
        client.query<{ v: string }>(`SELECT DISTINCT cp.name AS v FROM shipments s JOIN courier_providers cp ON cp.id = s.provider_id WHERE s.seller_id = $1 ORDER BY 1`, [p.sellerId]),
        client.query<{ v: string }>(`SELECT name AS v FROM warehouses WHERE seller_id = $1 ORDER BY 1`, [p.sellerId]),
        client.query<{ v: string }>(`SELECT DISTINCT channel AS v FROM orders WHERE seller_id = $1 AND channel IS NOT NULL ORDER BY 1`, [p.sellerId]),
      ]);
      return { couriers: couriers.rows.map((r) => r.v), warehouses: warehouses.rows.map((r) => r.v), channels: channels.rows.map((r) => r.v) };
    });
  });
}
