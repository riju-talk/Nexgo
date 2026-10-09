import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { withSellerTransaction } from '../db/client.js';
import { requireSeller } from './seller.js';

function principal(request: FastifyRequest) { if (!request.principal) throw Object.assign(new Error('Authentication required'), { statusCode: 401 }); return request.principal; }

// RTO = shipments the courier is returning (or has returned) to the seller.
// Stage: in_transit_back until rto_delivered_at is recorded, then delivered_back.
const STAGE_SQL = `CASE WHEN s.rto_delivered_at IS NOT NULL THEN 'delivered_back' ELSE 'in_transit_back' END`;
const STARTED_SQL = 'COALESCE(s.rto_initiated_at, s.updated_at)';
const FROM = `FROM shipments s JOIN orders o ON o.id = s.order_id JOIN customers c ON c.id = o.customer_id
  JOIN courier_providers cp ON cp.id = s.provider_id JOIN courier_services cs ON cs.id = s.service_id LEFT JOIN ndr_cases n ON n.shipment_id = s.id`;

export async function rtoRoutes(app: FastifyInstance) {
  app.get('/v1/rto/shipments', { preHandler: requireSeller }, async (request) => {
    const p = principal(request);
    const query = z.object({
      stage: z.enum(['all', 'in_transit_back', 'delivered_back']).default('all'),
      q: z.string().trim().max(80).optional(), courier: z.string().trim().max(64).optional(),
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(8),
    }).parse(request.query);
    return withSellerTransaction(p.sellerId, async (client) => {
      const where = [`s.seller_id = $1`, `s.state = 'rto'`]; const params: unknown[] = [p.sellerId];
      const add = (sql: string, value: unknown) => { params.push(value); where.push(sql.replaceAll('?', `$${params.length}`)); };
      if (query.stage !== 'all') add(`(${STAGE_SQL}) = ?`, query.stage);
      if (query.courier) add('cp.code = ?', query.courier);
      if (query.from) add(`${STARTED_SQL} >= ?::date`, query.from);
      if (query.to) add(`${STARTED_SQL} < ?::date + 1`, query.to);
      if (query.q) { params.push(`%${query.q}%`); where.push(`(s.awb ILIKE $${params.length} OR o.order_number ILIKE $${params.length} OR c.full_name ILIKE $${params.length})`); }
      const base = `${FROM} WHERE ${where.join(' AND ')}`;
      const total = Number((await client.query<{ n: string }>(`SELECT count(*) AS n ${base}`, params)).rows[0].n);
      const rows = await client.query(
        `SELECT s.id, s.awb, o.order_number, o.payment_mode, o.cod_amount_paise, s.shipping_charge_paise, c.full_name AS customer_name, c.city AS customer_city, c.pincode AS customer_pincode,
                cp.code AS courier_code, cp.name AS courier_name, cs.display_name AS service_name, ${STARTED_SQL} AS rto_started_at, s.rto_delivered_at, (${STAGE_SQL}) AS stage,
                n.ndr_reason, n.attempt_number
         ${base} ORDER BY ${STARTED_SQL} DESC, s.id LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}`, params);
      return { items: rows.rows, total, page: query.page, pageSize: query.pageSize, pages: Math.max(1, Math.ceil(total / query.pageSize)) };
    });
  });

  app.get('/v1/rto/stats', { preHandler: requireSeller }, async (request) => {
    const p = principal(request);
    return withSellerTransaction(p.sellerId, async (client) => {
      const [totals, couriers, reasons, weekly, all] = await Promise.all([
        client.query(`SELECT count(*)::int AS total, count(*) FILTER (WHERE s.rto_delivered_at IS NULL)::int AS in_transit_back, count(*) FILTER (WHERE s.rto_delivered_at IS NOT NULL)::int AS delivered_back,
                             COALESCE(sum(o.cod_amount_paise) FILTER (WHERE o.payment_mode = 'cod'), 0)::bigint AS cod_paise, COALESCE(sum(s.shipping_charge_paise), 0)::bigint AS freight_paise
                      FROM shipments s JOIN orders o ON o.id = s.order_id WHERE s.seller_id = $1 AND s.state = 'rto'`, [p.sellerId]),
        client.query(`SELECT cp.code, cp.name, count(*)::int AS shipments, count(*) FILTER (WHERE s.state = 'rto')::int AS rto
                      FROM shipments s JOIN courier_providers cp ON cp.id = s.provider_id WHERE s.seller_id = $1 AND s.state <> 'cancelled' GROUP BY cp.code, cp.name ORDER BY cp.name`, [p.sellerId]),
        client.query(`SELECT COALESCE(n.ndr_reason::text, 'other') AS reason, count(*)::int AS n FROM shipments s LEFT JOIN ndr_cases n ON n.shipment_id = s.id WHERE s.seller_id = $1 AND s.state = 'rto' GROUP BY 1 ORDER BY 2 DESC`, [p.sellerId]),
        client.query(`SELECT to_char(w, 'DD Mon') AS label, (SELECT count(*) FROM shipments s WHERE s.seller_id = $1 AND s.state = 'rto' AND ${STARTED_SQL} >= w AND ${STARTED_SQL} < w + interval '7 days')::int AS n
                      FROM generate_series(date_trunc('week', current_date) - interval '7 weeks', date_trunc('week', current_date), interval '1 week') w ORDER BY w`, [p.sellerId]),
        client.query(`SELECT count(*)::int AS n FROM shipments WHERE seller_id = $1 AND state <> 'cancelled'`, [p.sellerId]),
      ]);
      const t = totals.rows[0]; const shipmentTotal = all.rows[0].n;
      return {
        total: t.total, inTransitBack: t.in_transit_back, deliveredBack: t.delivered_back, rtoRatePct: shipmentTotal ? +((t.total / shipmentTotal) * 100).toFixed(1) : 0,
        codReturnedPaise: Number(t.cod_paise), freightOnRtoPaise: Number(t.freight_paise),
        couriers: couriers.rows.map((r) => ({ code: r.code, name: r.name, shipments: r.shipments, rto: r.rto, ratePct: r.shipments ? +((r.rto / r.shipments) * 100).toFixed(1) : 0 })),
        reasons: reasons.rows.map((r) => ({ reason: r.reason, count: r.n, pct: t.total ? +((r.n / t.total) * 100).toFixed(1) : 0 })),
        weekly: weekly.rows,
      };
    });
  });
}
