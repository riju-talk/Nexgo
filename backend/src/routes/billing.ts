import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { withSellerTransaction } from '../db/client.js';
import { requireSeller } from './seller.js';

function principal(request: FastifyRequest) { if (!request.principal) throw Object.assign(new Error('Authentication required'), { statusCode: 401 }); return request.principal; }
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const page = { page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(10) };
// "AWB no(s) separated by comma" search box.
const refList = (q?: string) => (q ? q.split(/[,\s]+/).map((x) => x.trim()).filter(Boolean).slice(0, 50) : []);

export async function billingRoutes(app: FastifyInstance) {
  // Wallet transactions with a running closing balance. The balance is computed over the whole ledger
  // first and filtered afterwards, so a filtered view still shows the true balance after each entry.
  app.get('/v1/billing/wallet', { preHandler: requireSeller }, async (request) => {
    const p = principal(request);
    const query = z.object({ from: day.optional(), to: day.optional(), type: z.enum(['all', 'shipping', 'recharge', 'dispute', 'refund', 'credit', 'debit']).default('all'), q: z.string().trim().max(500).optional(), ...page }).parse(request.query);
    return withSellerTransaction(p.sellerId, async (client) => {
      const where: string[] = []; const params: unknown[] = [p.sellerId];
      const add = (sql: string, value: unknown) => { params.push(value); where.push(sql.replaceAll('?', `$${params.length}`)); };
      if (query.from) add('l.created_at >= ?::date', query.from);
      if (query.to) add('l.created_at < ?::date + 1', query.to);
      if (query.type === 'shipping') where.push(`l.reference_type = 'shipment'`);
      if (query.type === 'recharge') where.push(`l.reference_type = 'wallet_recharge'`);
      if (query.type === 'dispute') where.push(`l.reference_type = 'weight_dispute'`);
      if (query.type === 'refund') where.push(`l.reference_type = 'shipment_cancel'`);
      if (query.type === 'credit') where.push('l.credit_paise > 0');
      if (query.type === 'debit') where.push('l.debit_paise > 0');
      const refs = refList(query.q);
      if (refs.length) add('(s.awb = ANY(?::text[]) OR l.reference_id = ANY(?::text[]))', refs);
      const cte = `WITH ledger AS (
          SELECT w.id, w.created_at, w.reference_type, w.reference_id, w.description,
                 CASE WHEN w.entry_type IN ('credit','release','adjustment') THEN w.amount_paise ELSE 0 END AS credit_paise,
                 CASE WHEN w.entry_type IN ('debit','hold') THEN w.amount_paise ELSE 0 END AS debit_paise,
                 SUM(CASE WHEN w.entry_type IN ('debit','hold') THEN -w.amount_paise ELSE w.amount_paise END) OVER (ORDER BY w.created_at, w.id) AS closing_paise
          FROM wallet_entries w WHERE w.seller_id = $1)`;
      const from = `FROM ledger l LEFT JOIN shipments s ON l.reference_type = 'shipment' AND s.id::text = l.reference_id ${where.length ? `WHERE ${where.join(' AND ')}` : ''}`;
      const total = Number((await client.query<{ n: string }>(`${cte} SELECT count(*) AS n ${from}`, params)).rows[0].n);
      const rows = await client.query(
        `${cte} SELECT l.id, l.created_at, CASE l.reference_type WHEN 'shipment' THEN 'Shipping' WHEN 'wallet_recharge' THEN 'Recharge' WHEN 'weight_dispute' THEN 'Weight dispute' WHEN 'shipment_cancel' THEN 'Cancellation refund' WHEN 'cod_remittance' THEN 'COD wallet recovery' ELSE 'Adjustment' END AS txn_type,
                COALESCE(s.awb, l.reference_id) AS ref_no, upper(substr(replace(l.id::text, '-', ''), 1, 10)) AS txn_id, l.credit_paise, l.debit_paise, l.closing_paise, l.description
         ${from} ORDER BY l.created_at DESC, l.id DESC LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}`, params);
      const balance = await client.query<{ b: string }>(`SELECT COALESCE(SUM(CASE WHEN entry_type IN ('debit','hold') THEN -amount_paise ELSE amount_paise END), 0)::bigint AS b FROM wallet_entries WHERE seller_id = $1`, [p.sellerId]);
      return { items: rows.rows, total, page: query.page, pageSize: query.pageSize, pages: Math.max(1, Math.ceil(total / query.pageSize)), balancePaise: Number(balance.rows[0].b) };
    });
  });

  // Per-shipment charge breakdown. Components the platform does not model (RTO / insurance surcharges)
  // are not invented here; the client shows them as "–".
  app.get('/v1/billing/shipping-charges', { preHandler: requireSeller }, async (request) => {
    const p = principal(request);
    const query = z.object({ from: day.optional(), to: day.optional(), q: z.string().trim().max(500).optional(), status: z.string().trim().max(30).optional(), ...page }).parse(request.query);
    return withSellerTransaction(p.sellerId, async (client) => {
      const where = ['s.seller_id = $1']; const params: unknown[] = [p.sellerId];
      const add = (sql: string, value: unknown) => { params.push(value); where.push(sql.replaceAll('?', `$${params.length}`)); };
      if (query.from) add('s.booked_at >= ?::date', query.from);
      if (query.to) add('s.booked_at < ?::date + 1', query.to);
      if (query.status) add('s.state::text = ?', query.status);
      const refs = refList(query.q);
      if (refs.length) add('s.awb = ANY(?::text[])', refs);
      const from = `FROM shipments s JOIN orders o ON o.id = s.order_id JOIN courier_providers cp ON cp.id = s.provider_id JOIN courier_services cs ON cs.id = s.service_id
        LEFT JOIN LATERAL (SELECT COALESCE(sum(wd.additional_charge_paise), 0)::bigint AS extra FROM weight_disputes wd WHERE wd.shipment_id = s.id AND wd.status IN ('accepted', 'lost', 'withdrawn')) d ON true
        WHERE ${where.join(' AND ')}`;
      const money = `CASE WHEN s.state = 'cancelled' THEN 0 ELSE s.shipping_charge_paise END`;
      const total = await client.query<{ n: string; sum: string }>(`SELECT count(*) AS n, COALESCE(sum(${money} + d.extra), 0)::bigint AS sum ${from}`, params);
      const rows = await client.query(
        `SELECT s.id, s.booked_at, s.awb, s.state, cp.name AS courier_name, cs.display_name AS service_name,
                ${money}::bigint AS freight_paise,
                COALESCE((s.quote_snapshot->'price'->>'codFeePaise')::bigint, 0) AS cod_fee_paise,
                CASE WHEN s.state = 'cancelled' THEN COALESCE((s.quote_snapshot->'price'->>'codFeePaise')::bigint, 0) ELSE 0 END AS cod_reversed_paise,
                o.total_weight_g AS entered_weight_g, s.chargeable_weight_g AS applied_weight_g, d.extra AS extra_weight_paise, (${money} + d.extra)::bigint AS total_paise
         ${from} ORDER BY s.booked_at DESC, s.id LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}`, params);
      const n = Number(total.rows[0].n);
      return { items: rows.rows, total: n, page: query.page, pageSize: query.pageSize, pages: Math.max(1, Math.ceil(n / query.pageSize)), totalChargesPaise: Number(total.rows[0].sum) };
    });
  });

  // COD remittance: headline figures plus every payout cycle.
  app.get('/v1/billing/cod', { preHandler: requireSeller }, async (request) => {
    const p = principal(request);
    const query = z.object({ from: day.optional(), to: day.optional(), ...page }).parse(request.query);
    return withSellerTransaction(p.sellerId, async (client) => {
      const where = ['c.seller_id = $1']; const params: unknown[] = [p.sellerId];
      if (query.from) { params.push(query.from); where.push(`c.cycle_end >= $${params.length}::date`); }
      if (query.to) { params.push(query.to); where.push(`c.cycle_start <= $${params.length}::date`); }
      const total = Number((await client.query<{ n: string }>(`SELECT count(*) AS n FROM cod_remittance_cycles c WHERE ${where.join(' AND ')}`, params)).rows[0].n);
      const rows = await client.query(
        `SELECT c.id, 'CR' || to_char(c.cycle_end, 'YYMMDD') || upper(substr(replace(c.id::text, '-', ''), 1, 3)) AS remittance_no, c.cycle_start, c.cycle_end, c.shipment_count, c.cod_collected_paise, c.charges_deducted_paise AS freight_deduction_paise,
                c.net_remitted_paise AS remittance_paise, c.wallet_offset_paise, c.payout_paise, c.due_date, c.status, c.remitted_at AS payment_date, c.bank_reference
         FROM cod_remittance_cycles c WHERE ${where.join(' AND ')} ORDER BY c.cycle_end DESC, c.id LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}`, params);
      const sum = await client.query(`SELECT COALESCE(sum(COALESCE(payout_paise, net_remitted_paise)) FILTER (WHERE status = 'remitted'), 0)::bigint AS remitted, COALESCE(sum(net_remitted_paise) FILTER (WHERE status IN ('pending','approved')), 0)::bigint AS due FROM cod_remittance_cycles WHERE seller_id = $1`, [p.sellerId]);
      const last = await client.query(`SELECT COALESCE(payout_paise, net_remitted_paise) AS net_remitted_paise, remitted_at FROM cod_remittance_cycles WHERE seller_id = $1 AND status = 'remitted' ORDER BY remitted_at DESC NULLS LAST LIMIT 1`, [p.sellerId]);
      const next = await client.query(`SELECT net_remitted_paise, cycle_end FROM cod_remittance_cycles WHERE seller_id = $1 AND status IN ('pending','approved') ORDER BY cycle_end LIMIT 1`, [p.sellerId]);
      const cfg = await client.query<{ remittance_days: number }>('SELECT remittance_days FROM sellers WHERE id = $1', [p.sellerId]);
      return {
        items: rows.rows, total, page: query.page, pageSize: query.pageSize, pages: Math.max(1, Math.ceil(total / query.pageSize)),
        summary: { remittanceDays: cfg.rows[0]?.remittance_days ?? 2, remittedTillDatePaise: Number(sum.rows[0].remitted), lastRemittancePaise: Number(last.rows[0]?.net_remitted_paise ?? 0), lastRemittanceAt: last.rows[0]?.remitted_at ?? null, nextRemittancePaise: Number(next.rows[0]?.net_remitted_paise ?? 0), totalDuePaise: Number(sum.rows[0].due) },
      };
    });
  });

  // The seller's current rate chart: every enabled courier service with its zone-wise slabs (information only; prices are worked out in the rate calculator).
  app.get('/v1/shipping/rate-card', { preHandler: requireSeller }, async (request) => {
    const p = principal(request);
    return withSellerTransaction(p.sellerId, async (client) => {
      const card = (await client.query<{ id: string; name: string; effective_from: string }>(`SELECT id, name, effective_from FROM rate_cards WHERE seller_id = $1 AND state = 'active' AND effective_from <= now() AND (effective_to IS NULL OR effective_to > now()) ORDER BY effective_from DESC LIMIT 1`, [p.sellerId])).rows[0];
      if (!card) return { card: null, services: [] };
      const rows = await client.query(
        `SELECT cp.code AS provider_code, cp.name AS provider_name, cs.code AS service_code, cs.display_name AS service_name, cs.service_type, cs.typical_delivery_days, cs.max_delivery_days, cs.delivery_tagline, sca.cod_enabled,
                r.zone_code, r.min_weight_g, r.base_weight_g, r.base_price_paise, r.additional_weight_g, r.additional_price_paise, r.cod_fee_paise, r.fuel_surcharge_bps, r.cod_percent_bps, r.rto_base_price_paise, r.rto_additional_price_paise
         FROM seller_courier_access sca JOIN courier_services cs ON cs.id = sca.service_id AND cs.is_active JOIN courier_providers cp ON cp.id = cs.provider_id AND cp.integration_state = 'live'
         JOIN rate_card_rates r ON r.rate_card_id = $2 AND r.service_id = sca.service_id
         WHERE sca.seller_id = $1 AND sca.state = 'enabled' ORDER BY cp.name, cs.display_name, array_position(ARRAY['national','within_city','within_state','metro_to_metro','rest_of_india','ne_jk'], r.zone_code), r.min_weight_g`, [p.sellerId, card.id]);
      const services = new Map<string, Record<string, unknown>>();
      for (const r of rows.rows) {
        const key = `${r.provider_code}:${r.service_code}`;
        if (!services.has(key)) services.set(key, { providerCode: r.provider_code, providerName: r.provider_name, serviceName: r.service_name, serviceType: r.service_type, tagline: r.delivery_tagline, minDays: r.typical_delivery_days, maxDays: r.max_delivery_days, codEnabled: r.cod_enabled, slabs: [] });
        (services.get(key)!.slabs as unknown[]).push({
          zone: r.zone_code, fromWeightG: r.min_weight_g, baseWeightG: r.base_weight_g, basePaise: r.base_price_paise, additionalWeightG: r.additional_weight_g, additionalPaise: r.additional_price_paise, codFeePaise: r.cod_fee_paise, codPercentBps: r.cod_percent_bps, fuelBps: r.fuel_surcharge_bps, rtoBasePaise: r.rto_base_price_paise ?? r.base_price_paise, rtoAdditionalPaise: r.rto_additional_price_paise ?? r.additional_price_paise,
        });
      }
      return { card: { name: card.name, effectiveFrom: card.effective_from }, services: [...services.values()] };
    });
  });
}
