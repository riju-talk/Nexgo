import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Pool, PoolClient } from 'pg';
import { db, withSellerTransaction } from '../db/client.js';
import { requireSeller } from './seller.js';
import { requirePlatformAdmin } from '../lib/adminAuth.js';
import { IST, cached, codPending, invalidateMetrics, pct, pickupMissedSql, pickupPendingSql, windowSql } from '../lib/metrics.js';

function seller(request: FastifyRequest) { if (!request.principal) throw Object.assign(new Error('Authentication required'), { statusCode: 401 }); return request.principal.sellerId; }

// Definitions (one place for every dashboard): see lib/metrics.ts. Windows are India dates; cancelled shipments are never in a rate;
// delivery / RTO rates are shares of FINISHED parcels (delivered + returned + lost); in transit, pickup pending and open NDR are live snapshots.
const range = z.object({ days: z.coerce.number().int().min(1).max(365).default(30), from: z.string().date().optional(), to: z.string().date().optional() })
  .refine((v) => !v.from === !v.to, { message: 'Send both from and to, or neither' })
  .refine((v) => !v.from || !v.to || (v.from <= v.to && (Date.parse(v.to) - Date.parse(v.from)) / 864e5 <= 365), { message: 'Pick a from and to date up to 366 days apart, with from on or before to' });
type Range = z.infer<typeof range>;
const rangeKey = (q: Range) => (q.from && q.to ? `${q.from}_${q.to}` : `d${q.days}`);

const summarize = async (client: Pool | PoolClient, q: Range, sellerId?: string) => {
  const explicit = q.from && q.to ? { from: q.from, to: q.to } : null;
  // $1 = seller (when scoped); the window is expressed as parameters so every query shares them.
  const args: unknown[] = sellerId ? [sellerId] : [];
  const sc = sellerId ? 'AND seller_id = $1' : '';
  const al = (a: string) => (sellerId ? `AND ${a}.seller_id = $1` : '');
  args.push(explicit ? explicit.from : null, explicit ? explicit.to : null, q.days);
  const f = args.length - 2, t = args.length - 1, d = args.length;
  const win = (col: string) => windowSql(col, f, t, d);
  const live = sellerId ? [sellerId] : [];
  const [ndrReasons, ship, now, orders, awaiting, today, trend, states, couriers, payments, rtoCost, pickups] = await Promise.all([
    // Why parcels hit an NDR: cases opened in the window (same window as every other card).
    client.query<{ reason: string; n: number }>(`SELECT ndr_reason::text AS reason, count(*)::int AS n FROM ndr_cases WHERE ${windowSql('opened_at', f, t, d)} ${sc} GROUP BY 1 ORDER BY 2 DESC LIMIT 8`, args),
    // One pass over the window's shipments.
    client.query<{ shipped: number; delivered: number; rto: number; lost: number; ndr_hit: number; spend: string; rto_forward: string; avg_days: string | null }>(
      `SELECT count(*) FILTER (WHERE sh.state <> 'cancelled')::int AS shipped,
              count(*) FILTER (WHERE sh.state = 'delivered')::int AS delivered,
              count(*) FILTER (WHERE sh.state IN ('rto','rto_in_transit'))::int AS rto,
              count(*) FILTER (WHERE sh.state = 'lost')::int AS lost,
              count(*) FILTER (WHERE sh.state <> 'cancelled' AND EXISTS (SELECT 1 FROM ndr_cases n WHERE n.shipment_id = sh.id))::int AS ndr_hit,
              COALESCE(sum(sh.shipping_charge_paise) FILTER (WHERE sh.state <> 'cancelled'),0)::bigint AS spend,
              COALESCE(sum(sh.shipping_charge_paise) FILTER (WHERE sh.state IN ('rto','rto_in_transit')),0)::bigint AS rto_forward,
              avg(EXTRACT(EPOCH FROM (sh.delivered_at - sh.booked_at)) / 86400) FILTER (WHERE sh.state = 'delivered' AND sh.delivered_at IS NOT NULL AND sh.booked_at IS NOT NULL) AS avg_days
       FROM shipments sh WHERE ${win('sh.created_at')} ${al('sh')}`, args),
    // Right now, whatever the window.
    client.query<{ in_transit: number; ofd: number; ndr: number; pickup_pending: number; pickup_missed: number }>(
      `SELECT count(*) FILTER (WHERE state = 'in_transit')::int AS in_transit, count(*) FILTER (WHERE state = 'out_for_delivery')::int AS ofd,
              count(*) FILTER (WHERE state = 'ndr')::int AS ndr, count(*) FILTER (WHERE ${pickupPendingSql()})::int AS pickup_pending, count(*) FILTER (WHERE ${pickupMissedSql()})::int AS pickup_missed
       FROM shipments WHERE state IN ('booked','pickup_pending','pickup_scheduled','in_transit','out_for_delivery','ndr') ${sc}`, live),
    client.query<{ placed: number; cancelled: number }>(
      `SELECT count(*) FILTER (WHERE state NOT IN ('draft','cancelled'))::int AS placed, count(*) FILTER (WHERE state = 'cancelled')::int AS cancelled
       FROM orders WHERE ${win('created_at')} ${sc}`, args),
    // Orders still waiting for a courier (live): they are the "Ready to ship" tab in Track.
    client.query<{ n: number }>(`SELECT count(*)::int AS n FROM orders o WHERE o.state IN ('new','ready_to_ship') AND o.order_flow <> 'reverse' AND NOT EXISTS (SELECT 1 FROM shipments s WHERE s.order_id = o.id) ${al('o')}`, live),
    client.query<{ n: number }>(`SELECT count(*)::int AS n FROM orders WHERE created_at >= ((now() ${IST})::date::timestamp ${IST}) AND state NOT IN ('draft','cancelled') ${sc}`, live),
    // Orders per day (by order date) and deliveries per day (by delivery date), one grouped pass each.
    client.query<{ day: string; orders: number; delivered: number }>(
      `WITH days AS (SELECT generate_series(COALESCE($${f}::date, (now() ${IST})::date - ($${d}::int - 1)), COALESCE($${t}::date, (now() ${IST})::date), interval '1 day')::date AS day),
            o AS (SELECT (created_at ${IST})::date AS day, count(*)::int AS n FROM orders WHERE ${win('created_at')} AND state NOT IN ('draft','cancelled') ${sc} GROUP BY 1),
            dl AS (SELECT (delivered_at ${IST})::date AS day, count(*)::int AS n FROM shipments WHERE state = 'delivered' AND ${win('delivered_at')} ${sc} GROUP BY 1)
       SELECT to_char(days.day,'DD Mon') AS day, COALESCE(o.n,0) AS orders, COALESCE(dl.n,0) AS delivered
       FROM days LEFT JOIN o ON o.day = days.day LEFT JOIN dl ON dl.day = days.day ORDER BY days.day`, args),
    // State-wise delivery: delivered parcels grouped by the customer's state (spelling and case normalised).
    client.query<{ state: string; delivered: number; total: number }>(
      `SELECT initcap(btrim(c.state)) AS state, count(*) FILTER (WHERE sh.state = 'delivered')::int AS delivered, count(*)::int AS total
       FROM shipments sh JOIN orders o ON o.id = sh.order_id JOIN customers c ON c.id = o.customer_id
       WHERE ${win('sh.created_at')} AND sh.state <> 'cancelled' ${al('sh')}
       GROUP BY initcap(btrim(c.state)) HAVING count(*) FILTER (WHERE sh.state = 'delivered') > 0 ORDER BY delivered DESC, 1 LIMIT 12`, args),
    client.query<{ name: string; total: number; delivered: number; finished: number }>(
      `SELECT cp.name, count(*)::int AS total, count(*) FILTER (WHERE sh.state = 'delivered')::int AS delivered,
              count(*) FILTER (WHERE sh.state IN ('delivered','rto','rto_in_transit','lost'))::int AS finished
       FROM shipments sh JOIN courier_providers cp ON cp.id = sh.provider_id
       WHERE ${win('sh.created_at')} AND sh.state <> 'cancelled' AND cp.name NOT ILIKE 'ecom%express%' ${al('sh')} GROUP BY cp.name ORDER BY total DESC LIMIT 6`, args),
    // COD vs prepaid: orders (not cancelled) created in the window, with the COD amount to collect and the prepaid order value.
    client.query<{ mode: string; orders: number; value: string }>(
      `SELECT payment_mode::text AS mode, count(*)::int AS orders, COALESCE(sum(CASE WHEN payment_mode = 'cod' THEN cod_amount_paise ELSE total_paise END),0)::bigint AS value
       FROM orders WHERE ${win('created_at')} AND state NOT IN ('draft','cancelled') ${sc} GROUP BY payment_mode`, args),
    // Freight charged for the return journey (one wallet debit per returned parcel).
    client.query<{ v: string }>(`SELECT COALESCE(sum(amount_paise),0)::bigint AS v FROM wallet_entries WHERE reference_type = 'shipment_rto' AND entry_type = 'debit' AND ${win('created_at')} ${sc}`, args),
    // Pickup compliance: of the parcels booked in the window whose 24 hours are over (or already scanned), how many were picked up within 24 hours.
    client.query<{ on_time: number; due: number }>(
      `SELECT count(*) FILTER (WHERE fs.first_scan IS NOT NULL AND fs.first_scan <= sh.booked_at + interval '24 hours')::int AS on_time,
              count(*) FILTER (WHERE fs.first_scan IS NOT NULL OR sh.booked_at < now() - interval '24 hours')::int AS due
       FROM shipments sh
       LEFT JOIN LATERAL (SELECT min(e.occurred_at) AS first_scan FROM shipment_events e WHERE e.shipment_id = sh.id AND e.state IN ('in_transit','out_for_delivery','delivered','ndr','rto','rto_in_transit')) fs ON true
       WHERE ${win('sh.booked_at')} AND sh.state <> 'cancelled' AND sh.courier_cancelled_at IS NULL ${al('sh')}`, args),
  ]);
  const s = ship.rows[0]; const n = now.rows[0]; const o = orders.rows[0];
  const finished = s.delivered + s.rto + s.lost;
  const payMix = (mode: string) => { const r = payments.rows.find((x) => x.mode === mode); return { orders: r ? Number(r.orders) : 0, valuePaise: r ? Number(r.value) : 0 }; };
  return {
    window: explicit ?? { days: q.days },
    metrics: {
      orderVolume: o.placed, todayVolume: today.rows[0].n,
      shipped: s.shipped, finished, ndrParcels: s.ndr_hit,
      inTransit: n.in_transit + n.ofd, // right now
      deliveryRate: pct(s.delivered, finished), rtoRate: pct(s.rto, finished), ndrRate: pct(s.ndr_hit, s.shipped),
      avgDeliveryDays: s.avg_days === null ? null : Math.round(Number(s.avg_days) * 10) / 10,
      pickupCompliance: pct(pickups.rows[0].on_time, pickups.rows[0].due),
      shippingSpendPaise: Number(s.spend), avgShippingPaise: s.shipped ? Math.round(Number(s.spend) / s.shipped) : null,
      orderCancelled: o.cancelled,
    },
    rto: { count: s.rto, ratePct: pct(s.rto, finished), forwardFreightPaise: Number(s.rto_forward), returnFreightPaise: Number(rtoCost.rows[0].v) },
    // Cards: Ready to ship, Pickup pending, In transit, Out for delivery, NDR are live; Delivered, RTO, Lost, Cancelled cover the window.
    pipeline: { ready_to_ship: awaiting.rows[0].n, pickup_pending: n.pickup_pending, in_transit: n.in_transit, out_for_delivery: n.ofd, ndr: n.ndr, delivered: s.delivered, rto: s.rto, lost: s.lost, cancelled: o.cancelled },
    trend: trend.rows.map((x) => ({ ...x, orders: Number(x.orders), delivered: Number(x.delivered) })),
    stateDelivery: states.rows.map((x) => ({ state: x.state, delivered: Number(x.delivered), total: Number(x.total) })),
    courierMix: couriers.rows.map((x) => ({ name: x.name, total: Number(x.total), delivered: Number(x.delivered), finished: Number(x.finished) })),
    paymentMix: { cod: payMix('cod'), prepaid: payMix('prepaid') },
    ndrReasons: (() => { const total = ndrReasons.rows.reduce((a, r) => a + r.n, 0); return ndrReasons.rows.map((r) => ({ reason: r.reason, count: r.n, pct: pct(r.n, total) })); })(),
  };
};

// "Decisions waiting on you": live NDR, weight-dispute, missed-pickup and COD figures for the seller (open items, not date-filtered).
async function sellerQueue(client: PoolClient, sellerId: string) {
  const [ndr, ndrReasons, wd, wdCouriers, pickup, pickupCouriers, codToday, cod] = await Promise.all([
    client.query<{ n: number }>(`SELECT count(*)::int AS n FROM ndr_cases WHERE seller_id = $1 AND state = 'open'`, [sellerId]),
    client.query<{ reason: string; n: number }>(`SELECT ndr_reason::text AS reason, count(*)::int AS n FROM ndr_cases WHERE seller_id = $1 AND state = 'open' GROUP BY 1 ORDER BY 2 DESC LIMIT 4`, [sellerId]),
    client.query<{ n: number; held: string }>(`SELECT count(*)::int AS n, COALESCE(sum(held_amount_paise),0)::bigint AS held FROM weight_disputes WHERE seller_id = $1 AND status = 'open'`, [sellerId]),
    client.query<{ name: string; n: number; amount: string }>(`SELECT cp.name, count(*)::int AS n, COALESCE(sum(wd.additional_charge_paise),0)::bigint AS amount FROM weight_disputes wd JOIN courier_providers cp ON cp.id = wd.raised_by_provider WHERE wd.seller_id = $1 AND wd.status = 'open' GROUP BY cp.name ORDER BY n DESC LIMIT 4`, [sellerId]),
    client.query<{ pending: number; missed: number; oldest_hours: number | null }>(
      `SELECT count(*) FILTER (WHERE ${pickupPendingSql()})::int AS pending, count(*) FILTER (WHERE ${pickupMissedSql()})::int AS missed,
              (EXTRACT(EPOCH FROM now() - min(booked_at) FILTER (WHERE ${pickupPendingSql()})) / 3600)::int AS oldest_hours
       FROM shipments WHERE seller_id = $1 AND state IN ('booked','pickup_pending','pickup_scheduled')`, [sellerId]),
    client.query<{ name: string; n: number }>(`SELECT cp.name, count(*)::int AS n FROM shipments s JOIN courier_providers cp ON cp.id = s.provider_id WHERE s.seller_id = $1 AND ${pickupMissedSql('s.')} GROUP BY cp.name ORDER BY n DESC LIMIT 4`, [sellerId]),
    client.query<{ v: string }>(`SELECT COALESCE(sum(o.cod_amount_paise),0)::bigint AS v FROM shipments s JOIN orders o ON o.id = s.order_id WHERE s.seller_id = $1 AND s.state = 'delivered' AND o.payment_mode = 'cod' AND s.delivered_at >= ((now() ${IST})::date::timestamp ${IST})`, [sellerId]),
    codPending(client, sellerId),
  ]);
  return {
    ndr: { open: ndr.rows[0].n, reasons: ndrReasons.rows },
    weight: { open: wd.rows[0].n, heldPaise: Number(wd.rows[0].held), couriers: wdCouriers.rows.map((r) => ({ name: r.name, count: r.n, amountPaise: Number(r.amount) })) },
    pickup: { pending: pickup.rows[0].pending, missed: pickup.rows[0].missed, oldestHours: pickup.rows[0].oldest_hours, couriers: pickupCouriers.rows },
    // COD: delivered today, the next payout, and everything still owed to the seller (cycles not paid + delivered COD not yet in a cycle, both after freight).
    cod: { deliveredTodayPaise: Number(codToday.rows[0].v), nextExpectedPaise: cod.nextExpectedPaise, nextExpectedDate: cod.nextExpectedDate, pendingPaise: cod.totalPaise },
  };
}

export async function analyticsRoutes(app: FastifyInstance) {
  // Figures are shared for a few seconds between tabs; a booking, cancel or tracking update by this seller clears them (invalidateMetrics).
  app.get('/v1/analytics/dashboard', { preHandler: requireSeller }, async (request) => {
    const q = range.parse(request.query);
    const id = seller(request);
    return cached(`seller:${id}:dash:${rangeKey(q)}`, 10_000, () => withSellerTransaction(id, async (client) => ({ ...(await summarize(client, q, id)), queue: await sellerQueue(client, id) })));
  });
  // Pickup reschedule: every missed pickup gets a fresh pickup window tomorrow. The courier is not contacted from here.
  app.post('/v1/analytics/dashboard/reschedule-pickups', { preHandler: requireSeller }, async (request) => {
    const id = seller(request);
    const out = await withSellerTransaction(id, async (client) => {
      const r = await client.query(`UPDATE shipments SET pickup_scheduled_at = (((now() ${IST})::date + 1 + time '14:00') ${IST}), pickup_deadline_at = (((now() ${IST})::date + 1 + time '18:00') ${IST}), updated_at = now()
        WHERE seller_id = $1 AND ${pickupMissedSql()} RETURNING id`, [id]);
      return { rescheduled: r.rowCount ?? 0, message: r.rowCount ? `${r.rowCount} pickup${r.rowCount === 1 ? '' : 's'} marked for re-pickup tomorrow` : 'No missed pickups to reschedule' };
    });
    invalidateMetrics(id);
    return out;
  });
  app.get('/v1/admin/analytics/dashboard', { preHandler: requirePlatformAdmin }, async (request, reply) => {
    const q = range.parse(request.query);
    // A custom range needs both dates, in order, at most a year apart (it drives a per-day series).
    if (!q.from !== !q.to || (q.from && q.to && (q.from > q.to || (Date.parse(q.to) - Date.parse(q.from)) / 864e5 > 365))) return reply.code(400).send({ error: 'INVALID_DATE_RANGE', message: 'Pick a from and to date up to 366 days apart.' });
    return cached(`admin:dash:${rangeKey(q)}`, 30_000, async () => {
      const data = await summarize(db, q);
      const explicit = q.from && q.to;
      const f = 1, t = 2, d = 3;
      const [tracking, sellers, ndr, kyc, cod, daily, pickups, pickupTotal, signups] = await Promise.all([
        // Tracking arrives by the aggregator's webhook (or the poll): say so loudly when it is not arriving.
        db.query<{ last_at: string | null; last24: number; stuck: number; live: number; courier_cancelled: number }>(
          `SELECT (SELECT max(received_at) FROM webhook_deliveries WHERE provider_code IN (SELECT code FROM courier_aggregators)) AS last_at,
                  (SELECT count(*)::int FROM webhook_deliveries WHERE provider_code IN (SELECT code FROM courier_aggregators) AND received_at > now() - interval '24 hours') AS last24,
                  (SELECT count(*)::int FROM shipments sh JOIN courier_providers cp ON cp.id = sh.provider_id WHERE cp.aggregator IS NOT NULL AND sh.state = 'booked' AND sh.courier_cancelled_at IS NULL AND sh.booked_at < now() - interval '48 hours') AS stuck,
                  (SELECT count(*)::int FROM shipments sh JOIN courier_providers cp ON cp.id = sh.provider_id WHERE cp.aggregator IS NOT NULL AND sh.state NOT IN ('cancelled','delivered')) AS live,
                  (SELECT count(*)::int FROM shipments WHERE courier_cancelled_at IS NOT NULL AND state IN ('booked','pickup_pending','pickup_scheduled')) AS courier_cancelled`),
        db.query<{ value: number }>(`SELECT count(*)::int AS value FROM sellers WHERE state='active'`),
        db.query<{ value: number }>(`SELECT count(*)::int AS value FROM ndr_cases WHERE state = 'open'`),
        db.query<{ value: number }>(`SELECT count(*)::int AS value FROM seller_kyc WHERE status = 'pending_review'`),
        codPending(db),
        // Packets (non-cancelled shipments) per day split by payment mode, for the same window as the stat cards.
        db.query<{ day: string; prepaid: number; cod: number }>(
          `WITH days AS (SELECT generate_series(COALESCE($${f}::date, (now() ${IST})::date - ($${d}::int - 1)), COALESCE($${t}::date, (now() ${IST})::date), interval '1 day')::date AS day),
                p AS (SELECT (sh.created_at ${IST})::date AS day, count(*) FILTER (WHERE o.payment_mode = 'prepaid')::int AS prepaid, count(*) FILTER (WHERE o.payment_mode = 'cod')::int AS cod
                      FROM shipments sh JOIN orders o ON o.id = sh.order_id WHERE ${windowSql('sh.created_at', f, t, d)} AND sh.state <> 'cancelled' GROUP BY 1)
           SELECT to_char(days.day,'DD Mon') AS day, COALESCE(p.prepaid,0) AS prepaid, COALESCE(p.cod,0) AS cod FROM days LEFT JOIN p ON p.day = days.day ORDER BY days.day`, [explicit ? q.from : null, explicit ? q.to : null, q.days]),
        // Pickups pending right now (not date-filtered), grouped by seller.
        db.query<{ id: string; legal_name: string; nexgo_code: string; n: number; overdue: number; oldest_hours: number | null }>(
          `SELECT s.id, s.legal_name, s.nexgo_code, count(*)::int AS n, count(*) FILTER (WHERE ${pickupMissedSql('sh.')})::int AS overdue,
                  (EXTRACT(EPOCH FROM now() - min(sh.booked_at)) / 3600)::int AS oldest_hours
           FROM shipments sh JOIN sellers s ON s.id = sh.seller_id
           WHERE ${pickupPendingSql('sh.')} GROUP BY s.id, s.legal_name, s.nexgo_code ORDER BY n DESC, s.legal_name LIMIT 10`),
        db.query<{ total: number; missed: number }>(`SELECT count(*)::int AS total, count(*) FILTER (WHERE ${pickupMissedSql()})::int AS missed FROM shipments WHERE ${pickupPendingSql()}`),
        db.query(`SELECT s.id, s.legal_name, s.nexgo_code, s.created_at, COALESCE(k.status, 'unsubmitted') AS kyc_status, poc.email
           FROM sellers s LEFT JOIN seller_kyc k ON k.seller_id = s.id
           LEFT JOIN LATERAL (SELECT u.email FROM seller_memberships m JOIN users u ON u.id = m.user_id WHERE m.seller_id = s.id ORDER BY (m.role = 'owner') DESC, m.created_at LIMIT 1) poc ON true
           ORDER BY s.created_at DESC LIMIT 6`),
      ]);
      // Courier assignment queue: how many bookings wait, run, and how long a recent booking took (95th percentile).
      const queue = await db.query<{ queued: number; running: number; p95: number | null; oldest: number | null }>(
        `SELECT count(*) FILTER (WHERE state = 'queued')::int AS queued, count(*) FILTER (WHERE state = 'running')::int AS running,
                (SELECT percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms)::int FROM (SELECT duration_ms FROM assign_batch_items WHERE state IN ('ok','failed') AND duration_ms IS NOT NULL ORDER BY finished_at DESC LIMIT 200) r) AS p95,
                (EXTRACT(EPOCH FROM now() - min(b.created_at) FILTER (WHERE i.state = 'queued')))::int AS oldest
         FROM assign_batch_items i JOIN assign_batches b ON b.id = i.batch_id WHERE i.state IN ('queued','running')`);
      return {
        ...data, activeSellers: sellers.rows[0].value, ndrOpen: ndr.rows[0].value, kycPending: kyc.rows[0].value, codPendingPaise: cod.totalPaise,
        daily: daily.rows.map((r) => ({ day: r.day, prepaid: r.prepaid, cod: r.cod })),
        pickupPending: { total: pickupTotal.rows[0].total, missed: pickupTotal.rows[0].missed, sellers: pickups.rows.map((r) => ({ id: r.id, name: r.legal_name, code: r.nexgo_code, count: r.n, overdue: r.overdue, oldestHours: r.oldest_hours })) },
        recentSignups: signups.rows,
        assignQueue: { queued: queue.rows[0]?.queued ?? 0, running: queue.rows[0]?.running ?? 0, p95Ms: queue.rows[0]?.p95 ?? null, oldestWaitSeconds: queue.rows[0]?.oldest ?? null },
        trackingHealth: { lastWebhookAt: tracking.rows[0].last_at, webhooks24h: tracking.rows[0].last24, stuckBooked: tracking.rows[0].stuck, liveShipments: tracking.rows[0].live, courierCancelled: tracking.rows[0].courier_cancelled },
      };
    });
  });
}
