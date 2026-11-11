import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { withSellerTransaction } from '../db/client.js';
import { requireSeller } from './seller.js';
import { applyShipmentFilters, shipmentFilterFields } from '../lib/shipmentFilters.js';
import { IST, optWindowSql, pct } from '../lib/metrics.js';

function principal(request: FastifyRequest) { if (!request.principal) throw Object.assign(new Error('Authentication required'), { statusCode: 401 }); return request.principal; }

// RTO = shipments the courier is returning (or has returned) to the seller.
// Stage comes from rto_status (set by courier scans); without one it is in transit back, or delivered back once rto_delivered_at is recorded.
export const RTO_STAGES = ['rto_in_transit', 'rto_out_for_delivery', 'rto_delivered', 'rto_lost', 'rto_damaged', 'rto_undelivered'] as const;
const STAGE_SQL = `CASE COALESCE(s.rto_status, CASE WHEN s.rto_delivered_at IS NOT NULL THEN 'delivered' ELSE 'in_transit' END)
  WHEN 'in_transit' THEN 'rto_in_transit' WHEN 'out_for_delivery' THEN 'rto_out_for_delivery' WHEN 'delivered' THEN 'rto_delivered'
  WHEN 'lost' THEN 'rto_lost' WHEN 'damaged' THEN 'rto_damaged' ELSE 'rto_undelivered' END`;
const STARTED_SQL = 's.rto_initiated_at';
const FROM = `FROM shipments s JOIN orders o ON o.id = s.order_id JOIN customers c ON c.id = o.customer_id
  JOIN courier_providers cp ON cp.id = s.provider_id JOIN courier_services cs ON cs.id = s.service_id JOIN warehouses w ON w.id = o.warehouse_id LEFT JOIN ndr_cases n ON n.shipment_id = s.id`;

export async function rtoRoutes(app: FastifyInstance) {
  app.get('/v1/rto/shipments', { preHandler: requireSeller }, async (request) => {
    const p = principal(request);
    const query = z.object({
      stage: z.enum(['all', ...RTO_STAGES]).default('all'),
      ...shipmentFilterFields,
      q: z.string().trim().max(80).optional(), courier: z.string().trim().max(64).optional(),
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(500).default(8),
    }).parse(request.query);
    return withSellerTransaction(p.sellerId, async (client) => {
      const where = [`s.seller_id = $1`, `s.state IN ('rto','rto_in_transit')`]; const params: unknown[] = [p.sellerId];
      const add = (sql: string, value: unknown) => { params.push(value); where.push(sql.replaceAll('?', `$${params.length}`)); };
      if (query.stage !== 'all') add(`(${STAGE_SQL}) = ?`, query.stage);
      if (query.courier) add('cp.code = ?', query.courier);
      applyShipmentFilters(add, query);
      // India dates, midnight to midnight.
      if (query.from) add(`${STARTED_SQL} >= (?::date::timestamp ${IST})`, query.from);
      if (query.to) add(`${STARTED_SQL} < ((?::date + 1)::timestamp ${IST})`, query.to);
      if (query.q) { params.push(`%${query.q}%`); where.push(`(s.awb ILIKE $${params.length} OR o.order_number ILIKE $${params.length} OR o.nexgo_order_id ILIKE $${params.length} OR c.full_name ILIKE $${params.length} OR c.phone ILIKE $${params.length})`); }
      const base = `${FROM} WHERE ${where.join(' AND ')}`;
      const total = Number((await client.query<{ n: string }>(`SELECT count(*) AS n ${base}`, params)).rows[0].n);
      const rows = await client.query(
        `SELECT s.id, s.awb, s.tags, o.order_number, o.nexgo_order_id, o.channel, o.order_flow, o.payment_mode, o.cod_amount_paise, s.shipping_charge_paise, s.whatsapp_status, w.name AS warehouse_name,
                c.full_name AS customer_name, c.phone AS customer_phone, c.city AS customer_city, c.pincode AS customer_pincode,
                cp.code AS courier_code, cp.name AS courier_name, cs.display_name AS service_name, ${STARTED_SQL} AS rto_started_at, s.rto_delivered_at, (${STAGE_SQL}) AS stage,
                n.ndr_reason, n.attempt_number
         ${base} ORDER BY ${STARTED_SQL} DESC, s.id LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}`, params);
      return { items: rows.rows, total, page: query.page, pageSize: query.pageSize, pages: Math.max(1, Math.ceil(total / query.pageSize)) };
    });
  });

  // Figures for the RTO page. The period (from / to, India dates) and the courier match the list: returns STARTED in the period.
  // The RTO rate is the same definition as the dashboard: of the parcels BOOKED in the period that have finished (delivered + returned + lost), the share returned.
  app.get('/v1/rto/stats', { preHandler: requireSeller }, async (request) => {
    const p = principal(request);
    const q = z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), courier: z.string().trim().max(64).optional() }).parse(request.query);
    const args = [p.sellerId, q.from ?? null, q.to ?? null, q.courier ?? null];
    const returned = `s.seller_id = $1 AND s.state IN ('rto','rto_in_transit') AND ${optWindowSql(STARTED_SQL, 2, 3)} AND ($4::text IS NULL OR cp.code = $4)`;
    return withSellerTransaction(p.sellerId, async (client) => {
      const [totals, stageRows, couriers, attempts, cohort, returnFreight] = await Promise.all([
        client.query(`SELECT count(*)::int AS total, count(*) FILTER (WHERE (${STAGE_SQL}) = 'rto_in_transit')::int AS in_transit_back, count(*) FILTER (WHERE (${STAGE_SQL}) = 'rto_delivered')::int AS delivered_back,
                             COALESCE(sum(o.cod_amount_paise) FILTER (WHERE o.payment_mode = 'cod'), 0)::bigint AS cod_paise, COALESCE(sum(s.shipping_charge_paise), 0)::bigint AS forward_paise
                      FROM shipments s JOIN orders o ON o.id = s.order_id JOIN courier_providers cp ON cp.id = s.provider_id WHERE ${returned}`, args),
        client.query(`SELECT (${STAGE_SQL}) AS stage, count(*)::int AS n FROM shipments s JOIN courier_providers cp ON cp.id = s.provider_id WHERE ${returned} GROUP BY 1`, args),
        // Per courier: parcels booked in the period and how many of them came back.
        client.query(`SELECT cp.code, cp.name, count(*)::int AS shipments, count(*) FILTER (WHERE s.state IN ('rto','rto_in_transit'))::int AS rto,
                             count(*) FILTER (WHERE s.state IN ('delivered','rto','rto_in_transit','lost'))::int AS finished
                      FROM shipments s JOIN courier_providers cp ON cp.id = s.provider_id
                      WHERE s.seller_id = $1 AND s.state <> 'cancelled' AND ${optWindowSql('s.created_at', 2, 3)} AND ($4::text IS NULL OR cp.code = $4) GROUP BY cp.code, cp.name ORDER BY cp.name`, args),
        client.query(`SELECT COALESCE((SELECT max(n.attempt_number) FROM ndr_cases n WHERE n.shipment_id = s.id), 0)::int AS attempts, count(*)::int AS n
                      FROM shipments s JOIN courier_providers cp ON cp.id = s.provider_id WHERE ${returned} GROUP BY 1`, args),
        client.query(`SELECT count(*) FILTER (WHERE s.state IN ('delivered','rto','rto_in_transit','lost'))::int AS finished, count(*) FILTER (WHERE s.state IN ('rto','rto_in_transit'))::int AS rto
                      FROM shipments s JOIN courier_providers cp ON cp.id = s.provider_id
                      WHERE s.seller_id = $1 AND s.state <> 'cancelled' AND ${optWindowSql('s.created_at', 2, 3)} AND ($4::text IS NULL OR cp.code = $4)`, args),
        // What the return journeys cost (one wallet debit per returned parcel), for the parcels listed above.
        client.query(`SELECT COALESCE(sum(w.amount_paise), 0)::bigint AS v FROM wallet_entries w JOIN shipments s ON s.id::text = w.reference_id JOIN courier_providers cp ON cp.id = s.provider_id
                      WHERE w.reference_type = 'shipment_rto' AND w.entry_type = 'debit' AND ${returned}`, args),
      ]);
      const t = totals.rows[0]; const c = cohort.rows[0];
      return {
        total: t.total, inTransitBack: t.in_transit_back, deliveredBack: t.delivered_back, stages: Object.fromEntries(stageRows.rows.map((r) => [r.stage, r.n])),
        finished: c.finished, rtoRatePct: pct(c.rto, c.finished),
        codReturnedPaise: Number(t.cod_paise),
        // Forward freight already paid on the returned parcels, the extra return freight charged, and what the seller paid in all for them.
        forwardFreightPaise: Number(t.forward_paise), returnFreightPaise: Number(returnFreight.rows[0].v), freightOnRtoPaise: Number(t.forward_paise) + Number(returnFreight.rows[0].v),
        couriers: couriers.rows.map((r) => ({ code: r.code, name: r.name, shipments: r.shipments, rto: r.rto, finished: r.finished, ratePct: pct(r.rto, r.finished) })),
        // Delivery attempts made before the parcel went back (0 = the courier returned it without an NDR).
        attempts: [[0, 'No NDR'], [1, '1 attempt'], [2, '2 attempts'], [3, '3 attempts']].map(([k, label]) => ({ label, n: attempts.rows.filter((r) => (k === 3 ? r.attempts >= 3 : r.attempts === k)).reduce((x, r) => x + r.n, 0) })),
      };
    });
  });
}
