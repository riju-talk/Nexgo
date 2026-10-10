import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Pool, PoolClient } from 'pg';
import { db, withSellerTransaction } from '../db/client.js';
import { requireSeller } from './seller.js';
import { requirePlatformAdmin } from '../lib/adminAuth.js';

function seller(request: FastifyRequest) { if (!request.principal) throw Object.assign(new Error('Authentication required'), { statusCode: 401 }); return request.principal.sellerId; }

// Reporting day boundaries are India time, whatever the database session timezone is.
const IST = `AT TIME ZONE 'Asia/Kolkata'`;
const range = z.object({ days: z.coerce.number().int().min(1).max(365).default(30), from: z.string().date().optional(), to: z.string().date().optional() });
type Range = z.infer<typeof range>;

// Dashboard stage cards: awaiting-pickup shipments count as "pickup scheduled", every RTO sub-state as RTO.
const stages = (m: Record<string, number>) => ({ ...m, pickup_scheduled: (m.pickup_scheduled || 0) + (m.pickup_pending || 0) + (m.booked || 0), rto: (m.rto || 0) + (m.rto_in_transit || 0) });

const summarize = async (client: Pool | PoolClient, q: Range, sellerId?: string) => {
  const explicit = q.from && q.to ? { from: q.from, to: q.to } : null;
  // $1 = seller (when scoped); the window is expressed as parameters so every query shares them.
  const args: unknown[] = sellerId ? [sellerId] : [];
  const s = sellerId ? 'AND seller_id = $1' : '';
  const alias = (a: string) => (sellerId ? `AND ${a}.seller_id = $1` : '');
  args.push(explicit ? explicit.from : null, explicit ? explicit.to : null, q.days);
  const f = args.length - 2, t = args.length - 1, d = args.length;
  // inWindow(col): the timestamp falls on a day inside the selected window (explicit dates, otherwise the last N days incl. today).
  const inWindow = (col: string) => `((${col} ${IST})::date BETWEEN COALESCE($${f}::date, (now() ${IST})::date - ($${d}::int - 1)) AND COALESCE($${t}::date, (now() ${IST})::date))`;
  const [orders, shipments, today, spend, trend, states, couriers] = await Promise.all([
    client.query(`SELECT state::text, count(*)::int AS count FROM orders WHERE ${inWindow('created_at')} ${s} GROUP BY state`, args),
    client.query(`SELECT state::text, count(*)::int AS count FROM shipments WHERE ${inWindow('created_at')} ${s} GROUP BY state`, args),
    client.query(`SELECT count(*)::int AS count FROM orders WHERE (created_at ${IST})::date = (now() ${IST})::date ${s}`, sellerId ? [sellerId] : []),
    client.query<{ value: string }>(`SELECT COALESCE(SUM(shipping_charge_paise),0)::bigint AS value FROM shipments WHERE ${inWindow('created_at')} AND state <> 'cancelled' ${s}`, args),
    client.query<{ day: string; orders: number; delivered: number }>(
      `WITH days AS (SELECT generate_series(COALESCE($${f}::date, (now() ${IST})::date - ($${d}::int - 1)), COALESCE($${t}::date, (now() ${IST})::date), interval '1 day')::date AS day)
       SELECT to_char(days.day,'DD Mon') AS day,
              (SELECT count(*) FROM orders o WHERE (o.created_at ${IST})::date = days.day ${alias('o')})::int AS orders,
              (SELECT count(*) FROM shipments sh WHERE (COALESCE(sh.delivered_at, sh.created_at) ${IST})::date = days.day AND sh.state = 'delivered' ${alias('sh')})::int AS delivered
       FROM days ORDER BY days.day`, args),
    // State-wise delivery: delivered parcels grouped by the customer's state, for the selected window.
    client.query<{ state: string; delivered: number; total: number }>(
      `SELECT c.state, count(*) FILTER (WHERE sh.state = 'delivered')::int AS delivered, count(*)::int AS total
       FROM shipments sh JOIN orders o ON o.id = sh.order_id JOIN customers c ON c.id = o.customer_id
       WHERE ${inWindow('sh.created_at')} AND sh.state <> 'cancelled' ${alias('sh')}
       GROUP BY c.state HAVING count(*) FILTER (WHERE sh.state = 'delivered') > 0 ORDER BY delivered DESC, c.state LIMIT 12`, args),
    client.query<{ name: string; total: number; delivered: number }>(
      `SELECT cp.name, count(*)::int AS total, count(*) FILTER (WHERE sh.state = 'delivered')::int AS delivered
       FROM shipments sh JOIN courier_providers cp ON cp.id = sh.provider_id
       WHERE ${inWindow('sh.created_at')} AND sh.state <> 'cancelled' ${alias('sh')} GROUP BY cp.name ORDER BY total DESC LIMIT 6`, args),
  ]);
  const by = (rows: { state: string; count: number }[]) => Object.fromEntries(rows.map((x) => [x.state, Number(x.count)]));
  const orderBy = by(orders.rows), shipmentBy = by(shipments.rows);
  const totalShipments = Object.entries(shipmentBy).filter(([k]) => k !== 'cancelled').reduce((a, [, b]) => a + b, 0);
  const pct = (n: number) => (totalShipments ? +((n / totalShipments) * 100).toFixed(1) : 0);
  const orderTotal = Object.values(orderBy).reduce((a, b) => a + b, 0);
  return {
    window: explicit ?? { days: q.days },
    metrics: {
      orderVolume: orderTotal, todayVolume: Number(today.rows[0].count),
      inTransit: (shipmentBy.in_transit || 0) + (shipmentBy.out_for_delivery || 0), deliveryRate: pct(shipmentBy.delivered || 0), ndrRate: pct(shipmentBy.ndr || 0),
      rtoRate: pct((shipmentBy.rto || 0) + (shipmentBy.rto_in_transit || 0)), shippingSpendPaise: Number(spend.rows[0].value), orderCancelled: orderBy.cancelled || 0,
    },
    // Order stages come from orders, shipment stages from shipments; shipment states win where both exist.
    pipeline: stages({ ...orderBy, ...shipmentBy }),
    trend: trend.rows.map((x) => ({ ...x, orders: Number(x.orders), delivered: Number(x.delivered) })),
    stateDelivery: states.rows.map((x) => ({ state: x.state, delivered: Number(x.delivered), total: Number(x.total) })),
    courierMix: couriers.rows.map((x) => ({ name: x.name, total: Number(x.total), delivered: Number(x.delivered) })),
  };
};

// "Decisions waiting on you": live NDR, weight-dispute, missed-pickup and COD figures for the seller (open items, not date-filtered).
async function sellerQueue(client: PoolClient, sellerId: string) {
  const overdue = (a = '') => `${a}state IN ('booked','pickup_pending','pickup_scheduled') AND COALESCE(${a}pickup_deadline_at, ${a}booked_at + interval '1 day') < now()`;
  const [ndr, ndrReasons, wd, wdCouriers, pickup, pickupCouriers, codToday, cycles, uncycled] = await Promise.all([
    client.query<{ n: number }>(`SELECT count(*)::int AS n FROM ndr_cases WHERE seller_id = $1 AND state = 'open'`, [sellerId]),
    client.query<{ reason: string; n: number }>(`SELECT ndr_reason::text AS reason, count(*)::int AS n FROM ndr_cases WHERE seller_id = $1 AND state = 'open' GROUP BY 1 ORDER BY 2 DESC LIMIT 4`, [sellerId]),
    client.query<{ n: number; held: string }>(`SELECT count(*)::int AS n, COALESCE(sum(held_amount_paise),0)::bigint AS held FROM weight_disputes WHERE seller_id = $1 AND status = 'open'`, [sellerId]),
    client.query<{ name: string; n: number; amount: string }>(`SELECT cp.name, count(*)::int AS n, COALESCE(sum(wd.additional_charge_paise),0)::bigint AS amount FROM weight_disputes wd JOIN courier_providers cp ON cp.id = wd.raised_by_provider WHERE wd.seller_id = $1 AND wd.status = 'open' GROUP BY cp.name ORDER BY n DESC LIMIT 4`, [sellerId]),
    client.query<{ n: number }>(`SELECT count(*)::int AS n FROM shipments WHERE seller_id = $1 AND ${overdue()}`, [sellerId]),
    client.query<{ name: string; n: number }>(`SELECT cp.name, count(*)::int AS n FROM shipments s JOIN courier_providers cp ON cp.id = s.provider_id WHERE s.seller_id = $1 AND ${overdue('s.')} GROUP BY cp.name ORDER BY n DESC LIMIT 4`, [sellerId]),
    client.query<{ v: string }>(`SELECT COALESCE(sum(o.cod_amount_paise),0)::bigint AS v FROM shipments s JOIN orders o ON o.id = s.order_id WHERE s.seller_id = $1 AND s.state = 'delivered' AND o.payment_mode = 'cod' AND (COALESCE(s.delivered_at, s.booked_at) ${IST})::date = (now() ${IST})::date`, [sellerId]),
    client.query<{ net: string; due_date: string | null }>(`SELECT net_remitted_paise::text AS net, due_date::text FROM cod_remittance_cycles WHERE seller_id = $1 AND status IN ('pending','approved') ORDER BY due_date NULLS LAST, cycle_end`, [sellerId]),
    // Delivered COD not yet in any remittance cycle: money the seller is owed once a cycle is cut.
    client.query<{ v: string }>(`SELECT COALESCE(sum(o.cod_amount_paise),0)::bigint AS v FROM shipments s JOIN orders o ON o.id = s.order_id WHERE s.seller_id = $1 AND s.state = 'delivered' AND o.payment_mode = 'cod' AND NOT EXISTS (SELECT 1 FROM cod_remittance_cycles c WHERE c.seller_id = s.seller_id AND COALESCE(s.delivered_at, s.booked_at)::date BETWEEN c.cycle_start AND c.cycle_end)`, [sellerId]),
  ]);
  const cycleDue = cycles.rows.reduce((a, r) => a + Number(r.net), 0);
  return {
    ndr: { open: ndr.rows[0].n, reasons: ndrReasons.rows },
    weight: { open: wd.rows[0].n, heldPaise: Number(wd.rows[0].held), couriers: wdCouriers.rows.map((r) => ({ name: r.name, count: r.n, amountPaise: Number(r.amount) })) },
    pickup: { missed: pickup.rows[0].n, couriers: pickupCouriers.rows },
    cod: {
      deliveredTodayPaise: Number(codToday.rows[0].v),
      nextExpectedPaise: cycles.rows[0] ? Number(cycles.rows[0].net) : 0, nextExpectedDate: cycles.rows[0]?.due_date ?? null,
      totalDuePaise: cycleDue + Number(uncycled.rows[0].v),
    },
  };
}

export async function analyticsRoutes(app: FastifyInstance) {
  app.get('/v1/analytics/dashboard', { preHandler: requireSeller }, async (request) => {
    const q = range.parse(request.query);
    return withSellerTransaction(seller(request), async (client) => ({ ...(await summarize(client, q, seller(request))), queue: await sellerQueue(client, seller(request)) }));
  });
  // Pickup reschedule: every overdue pickup gets a fresh pickup window tomorrow.
  app.post('/v1/analytics/dashboard/reschedule-pickups', { preHandler: requireSeller }, async (request) => {
    const id = seller(request);
    return withSellerTransaction(id, async (client) => {
      const r = await client.query(`UPDATE shipments SET pickup_scheduled_at = (((now() ${IST})::date + 1 + time '14:00') ${IST}), pickup_deadline_at = (((now() ${IST})::date + 1 + time '18:00') ${IST}), updated_at = now()
        WHERE seller_id = $1 AND state IN ('booked','pickup_pending','pickup_scheduled') AND COALESCE(pickup_deadline_at, booked_at + interval '1 day') < now() RETURNING id`, [id]);
      return { rescheduled: r.rowCount ?? 0, message: 'Re-scheduled for tomorrow' };
    });
  });
  app.get('/v1/admin/analytics/dashboard', { preHandler: requirePlatformAdmin }, async (request) => {
    const data = await summarize(db, range.parse(request.query));
    const sellers = await db.query<{ value: string }>(`SELECT count(*)::int AS value FROM sellers WHERE state='active'`);
    const ndr = await db.query<{ value: string }>(`SELECT count(*)::int AS value FROM ndr_cases WHERE state = 'open'`);
    return { ...data, activeSellers: Number(sellers.rows[0].value), ndrOpen: Number(ndr.rows[0].value) };
  });
}
