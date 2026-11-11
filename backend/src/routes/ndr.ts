import { applyShipmentFilters, shipmentFilterFields } from '../lib/shipmentFilters.js';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { withSellerTransaction } from '../db/client.js';
import { audit } from '../lib/audit.js';
import { pushNdrToCourier } from '../lib/ndrCourier.js';
import { chargeRtoOnce } from '../lib/shipmentEffects.js';
import { requireSeller } from './seller.js';
import { IST, optWindowSql, pct } from '../lib/metrics.js';

const uuid = z.string().uuid();

const resolveInput = z.object({
  resolutionAction: z.enum(['reattempt', 'rto', 'address_update', 'customer_contact', 'delivery_rescheduled', 'cancelled']),
  resolutionNotes: z.string().trim().max(2000).optional(),
  newAddress: z.object({
    addressLine1: z.string().trim().min(3).max(200),
    addressLine2: z.string().trim().max(200).optional(),
    city: z.string().trim().min(2).max(100),
    pincode: z.string().regex(/^\d{6}$/),
    landmark: z.string().trim().max(200).optional(),
  }).optional(),
  scheduledDeliveryDate: z.string().datetime().optional(),
});

const bulkResolveInput = z.object({
  caseIds: z.array(uuid).min(1).max(100),
  resolutionAction: z.enum(['reattempt', 'rto']),
  resolutionNotes: z.string().trim().max(2000).optional(),
});

function principal(request: FastifyRequest) {
  if (!request.principal) throw Object.assign(new Error('Authentication required'), { statusCode: 401 });
  return request.principal;
}

export async function ndrRoutes(app: FastifyInstance) {
  // Board status shown to sellers, derived from the case state and age:
  // new (open < 48h) -> action_pending (open, older) -> redelivery_scheduled | rto | resolved.
  const STATUS_SQL = `CASE WHEN nc.state = 'resolved' THEN 'resolved' WHEN nc.state = 'rto_requested' THEN 'rto' WHEN nc.state = 'reattempt_requested' THEN 'redelivery_scheduled' WHEN nc.opened_at > now() - interval '48 hours' THEN 'new' ELSE 'action_pending' END`;
  const TABS = ['all', 'new', 'action_pending', 'redelivery_scheduled', 'resolved', 'rto', 'action_required', 'action_requested', 'delivered'] as const;
  // The four tabs sellers work from: what needs an answer, what was answered and is waiting, what ended delivered, what went back.
  const TAB_GROUPS: Record<string, string[]> = { action_required: ['new', 'action_pending'], action_requested: ['redelivery_scheduled'], delivered: ['resolved'], rto: ['rto'] };

  // NDR cases for the seller: tabs, search, reason/courier/date filters, pagination.
  app.get('/v1/ndr/cases', { preHandler: requireSeller }, async (request) => {
    const p = principal(request);
    const query = z.object({
      tab: z.enum(TABS).default('all'),
      q: z.string().trim().max(80).optional(),
      reason: z.string().trim().max(60).optional(),
      courier: z.string().trim().max(64).optional(),
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      attemptNumber: z.coerce.number().int().min(1).max(3).optional(),
      ...shipmentFilterFields,
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(50).default(8),
    }).parse(request.query);

    return withSellerTransaction(p.sellerId, async (client) => {
      const where = ['nc.seller_id = $1']; const params: unknown[] = [p.sellerId];
      const add = (sql: string, value: unknown) => { params.push(value); where.push(sql.replaceAll('?', `$${params.length}`)); };
      if (query.tab !== 'all') add(`(${STATUS_SQL}) = ANY(?::text[])`, TAB_GROUPS[query.tab] ?? [query.tab]);
      if (query.reason) add('nc.ndr_reason::text = ?', query.reason);
      if (query.courier) add('cp.code = ?', query.courier);
      if (query.attemptNumber) add('nc.attempt_number = ?', query.attemptNumber);
      applyShipmentFilters(add, query);
      // India dates, midnight to midnight.
      if (query.from) add(`nc.opened_at >= (?::date::timestamp ${IST})`, query.from);
      if (query.to) add(`nc.opened_at < ((?::date + 1)::timestamp ${IST})`, query.to);
      if (query.q) add("(o.order_number ILIKE ? OR o.nexgo_order_id ILIKE ? OR s.awb ILIKE ? OR c.full_name ILIKE ? OR c.phone ILIKE ?)".replace(/\?/g, '$' + (params.length + 1)), `%${query.q}%`);
      const from = `FROM ndr_cases nc JOIN shipments s ON s.id = nc.shipment_id JOIN orders o ON o.id = s.order_id JOIN customers c ON c.id = o.customer_id
        JOIN courier_providers cp ON cp.id = s.provider_id JOIN courier_services cs ON cs.id = s.service_id WHERE ${where.join(' AND ')}`;
      const total = Number((await client.query<{ n: string }>(`SELECT count(*) AS n ${from}`, params)).rows[0].n);
      const rows = await client.query(
        `SELECT nc.id, nc.shipment_id, nc.state, nc.ndr_reason, nc.reason_detail, nc.attempt_number, nc.max_attempts, nc.opened_at, nc.sla_deadline_at, nc.resolution_action, nc.resolution_notes, nc.resolved_at,
                (${STATUS_SQL}) AS ndr_status, s.awb, s.tags, s.state AS shipment_state, o.id AS order_id, o.order_number, o.payment_mode, o.cod_amount_paise,
                c.full_name AS customer_name, c.phone AS customer_phone, c.city AS customer_city, c.pincode AS customer_pincode,
                cp.code AS courier_code, cp.name AS courier_name, cs.display_name AS service_name,
                (SELECT h.next_attempt_scheduled_at FROM ndr_attempt_history h WHERE h.ndr_case_id = nc.id ORDER BY h.occurred_at DESC LIMIT 1) AS scheduled_delivery_at,
                EXTRACT(EPOCH FROM (nc.sla_deadline_at - now())) / 3600 AS hours_until_deadline
         ${from} ORDER BY nc.opened_at DESC, nc.id LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}`, params);
      return { items: rows.rows, total, page: query.page, pageSize: query.pageSize, pages: Math.max(1, Math.ceil(total / query.pageSize)) };
    });
  });

  // Get NDR case by ID
  app.get('/v1/ndr/cases/:caseId', { preHandler: requireSeller }, async (request) => {
    const p = principal(request);
    const caseId = uuid.parse((request.params as { caseId: string }).caseId);

    return withSellerTransaction(p.sellerId, async (client) => {
      const ndrCase = await client.query(`
        SELECT 
          nc.*,
          s.awb,
          s.state AS shipment_state,
          o.order_number,
          o.payment_mode,
          o.cod_amount_paise,
          c.full_name AS customer_name,
          c.phone AS customer_phone,
          c.alternate_phone AS customer_alternate_phone,
          c.address_line_1,
          c.address_line_2,
          c.city AS customer_city,
          c.state AS customer_state,
          c.pincode AS customer_pincode,
          c.landmark,
          cp.name AS courier_name,
          cs.display_name AS service_name
        FROM ndr_cases nc
        JOIN shipments s ON s.id = nc.shipment_id
        JOIN orders o ON o.id = s.order_id
        JOIN customers c ON c.id = o.customer_id
        JOIN courier_providers cp ON cp.id = s.provider_id
        JOIN courier_services cs ON cs.id = s.service_id
        WHERE nc.id = $1 AND nc.seller_id = $2
      `, [caseId, p.sellerId]);

      if (!ndrCase.rows[0]) throw Object.assign(new Error('NDR case not found'), { statusCode: 404 });

      // Get attempt history
      const attempts = await client.query(`
        SELECT * FROM ndr_attempt_history
        WHERE ndr_case_id = $1
        ORDER BY attempt_number DESC
      `, [caseId]);

      return {
        ...ndrCase.rows[0],
        attemptHistory: attempts.rows,
      };
    });
  });

  // Resolve NDR case
  app.post('/v1/ndr/cases/:caseId/resolve', { preHandler: requireSeller }, async (request) => {
    const p = principal(request);
    const caseId = uuid.parse((request.params as { caseId: string }).caseId);
    const input = resolveInput.parse(request.body);

    const saved = await withSellerTransaction(p.sellerId, async (client) => {
      const current = await client.query<{ 
        shipment_id: string; 
        state: string; 
        attempt_number: number;
        max_attempts: number;
      }>(`
        SELECT shipment_id, state, attempt_number, max_attempts 
        FROM ndr_cases 
        WHERE id = $1 AND seller_id = $2 
        FOR UPDATE
      `, [caseId, p.sellerId]);

      if (!current.rows[0]) {
        throw Object.assign(new Error('NDR case not found'), { statusCode: 404 });
      }

      if (current.rows[0].state !== 'open') {
        throw Object.assign(new Error('This NDR case has already been actioned'), { statusCode: 409 });
      }

      // Update customer address if provided
      if (input.newAddress && input.resolutionAction === 'address_update') {
        await client.query(`
          UPDATE customers c
          SET 
            address_line_1 = $1,
            address_line_2 = $2,
            city = $3,
            pincode = $4,
            landmark = $5,
            updated_at = now()
          FROM orders o
          JOIN shipments s ON s.order_id = o.id
          WHERE c.id = o.customer_id 
            AND s.id = $6
        `, [
          input.newAddress.addressLine1,
          input.newAddress.addressLine2 || null,
          input.newAddress.city,
          input.newAddress.pincode,
          input.newAddress.landmark || null,
          current.rows[0].shipment_id,
        ]);
      }

      // Determine next state
      let nextState: string;
      let shipmentState: string;

      if (input.resolutionAction === 'reattempt' || input.resolutionAction === 'delivery_rescheduled') {
        nextState = 'reattempt_requested';
        shipmentState = 'in_transit';
      } else if (input.resolutionAction === 'rto') {
        nextState = 'rto_requested';
        shipmentState = 'rto';
      } else {
        nextState = 'resolved';
        shipmentState = 'in_transit'; // Address updated, continue delivery
      }

      // Update NDR case
      const result = await client.query(`
        UPDATE ndr_cases 
        SET 
          state = $1::ndr_state,
          resolution_action = $2::ndr_action_enum,
          resolution_notes = $3,
          resolved_at = now(),
          resolved_by = $4,
          updated_at = now()
        WHERE id = $5 
        RETURNING *
      `, [nextState, input.resolutionAction, input.resolutionNotes || null, p.userId, caseId]);

      // Update shipment state
      await client.query(`
        UPDATE shipments 
        SET state = $1::shipment_state, updated_at = now(),
            rto_initiated_at = CASE WHEN $1 = 'rto' THEN COALESCE(rto_initiated_at, now()) ELSE rto_initiated_at END
        WHERE id = $2
      `, [shipmentState, current.rows[0].shipment_id]);
      if (shipmentState === 'rto') await chargeRtoOnce(client, p.sellerId, current.rows[0].shipment_id); // return freight, once

      // Add shipment event
      await client.query(`
        INSERT INTO shipment_events (shipment_id, state, occurred_at, description, source)
        VALUES ($1, $2::shipment_state, now(), $3, 'manual')
      `, [
        current.rows[0].shipment_id,
        shipmentState,
        input.resolutionNotes || `Seller requested ${input.resolutionAction}`,
      ]);

      // Record in attempt history
      await client.query(`
        INSERT INTO ndr_attempt_history (
          ndr_case_id,
          attempt_number,
          ndr_reason,
          courier_notes,
          next_attempt_scheduled_at
        ) VALUES ($1, $2, $3, $4, $5)
      `, [
        caseId,
        current.rows[0].attempt_number,
        'customer_unavailable', // Default for now
        input.resolutionNotes || null,
        input.scheduledDeliveryDate ? new Date(input.scheduledDeliveryDate) : null,
      ]);

      await audit(client, {
        sellerId: p.sellerId,
        actorUserId: p.userId,
        action: `ndr.${input.resolutionAction}_requested`,
        targetType: 'ndr_case',
        targetId: caseId,
        requestId: request.id,
        metadata: { action: input.resolutionAction },
      });

      return { row: result.rows[0], shipmentId: current.rows[0].shipment_id };
    });
    const address = input.newAddress ? ` New address: ${[input.newAddress.addressLine1, input.newAddress.addressLine2, input.newAddress.city, input.newAddress.pincode].filter(Boolean).join(', ')}.` : '';
    const courier = await pushNdrToCourier({ sellerId: p.sellerId, userId: p.userId, shipmentId: saved.shipmentId, caseId, resolution: input.resolutionAction, comment: `${input.resolutionNotes ?? `Seller requested ${input.resolutionAction}`}${address}`, requestId: request.id });
    return { ...saved.row, courier };
  });

  // Bulk resolve NDR cases
  app.post('/v1/ndr/cases/bulk-resolve', { preHandler: requireSeller }, async (request) => {
    const p = principal(request);
    const input = bulkResolveInput.parse(request.body);

    const shipmentOf = new Map<string, string>();
    const outcome = await withSellerTransaction(p.sellerId, async (client) => {
      const results: { caseId: string; success: boolean; error?: string; courier?: unknown }[] = [];

      for (const caseId of input.caseIds) {
        try {
          const current = await client.query<{ 
            shipment_id: string; 
            state: string;
          }>(`
            SELECT shipment_id, state 
            FROM ndr_cases 
            WHERE id = $1 AND seller_id = $2 AND state = 'open'
            FOR UPDATE
          `, [caseId, p.sellerId]);

          if (!current.rows[0]) {
            results.push({ caseId, success: false, error: 'Not found or already actioned' });
            continue;
          }

          const nextState = input.resolutionAction === 'reattempt' ? 'reattempt_requested' : 'rto_requested';
          const shipmentState = input.resolutionAction === 'reattempt' ? 'in_transit' : 'rto';

          await client.query(`
            UPDATE ndr_cases 
            SET 
              state = $1::ndr_state,
              resolution_action = $2::ndr_action_enum,
              resolution_notes = $3,
              resolved_at = now(),
              resolved_by = $4,
              updated_at = now()
            WHERE id = $5
          `, [nextState, input.resolutionAction, input.resolutionNotes || null, p.userId, caseId]);

          await client.query(`
            UPDATE shipments 
            SET state = $1::shipment_state, updated_at = now(),
                rto_initiated_at = CASE WHEN $1 = 'rto' THEN COALESCE(rto_initiated_at, now()) ELSE rto_initiated_at END
            WHERE id = $2
          `, [shipmentState, current.rows[0].shipment_id]);
          if (shipmentState === 'rto') await chargeRtoOnce(client, p.sellerId, current.rows[0].shipment_id);

          shipmentOf.set(caseId, current.rows[0].shipment_id);
          results.push({ caseId, success: true });
        } catch (error) {
          results.push({ caseId, success: false, error: (error as Error).message });
        }
      }

      await audit(client, {
        sellerId: p.sellerId,
        actorUserId: p.userId,
        action: 'ndr.bulk_resolve',
        targetType: 'ndr_case',
        targetId: 'bulk',
        requestId: request.id,
        metadata: { count: input.caseIds.length, action: input.resolutionAction },
      });

      return results;
    });
    // Tell the courier after everything is saved, one case at a time (a slow courier must not hold the database transaction open).
    // Batches of 10 in parallel inside a 20 s budget (the function is capped at 30 s); cases left over are reported, not dropped.
    const comment = input.resolutionNotes ?? `Seller requested ${input.resolutionAction}`; const started = Date.now();
    const todo = outcome.filter((r) => r.success && shipmentOf.has(r.caseId));
    for (let i = 0; i < todo.length; i += 10) {
      const batch = todo.slice(i, i + 10);
      if (Date.now() - started > 20_000) { for (const r of batch) r.courier = { status: 'failed', message: 'Not sent in time. Saved here; tell the courier from its own portal.' }; continue; }
      await Promise.all(batch.map(async (r) => { r.courier = await pushNdrToCourier({ sellerId: p.sellerId, userId: p.userId, shipmentId: shipmentOf.get(r.caseId)!, caseId: r.caseId, resolution: input.resolutionAction, comment, requestId: request.id }); }));
    }
    return {
      results: outcome,
      summary: {
        total: input.caseIds.length,
        succeeded: outcome.filter((r) => r.success).length,
        failed: outcome.filter((r) => !r.success).length,
        courierNotNotified: outcome.filter((r) => (r.courier as { status?: string } | undefined)?.status === 'failed').length,
      },
    };
  });

  // Board overview for the chosen period (India dates) and courier: cases opened in the period, the reason mix, and the NDR rate.
  // NDR rate = of the parcels BOOKED in the period (cancelled ones left out), the share that hit at least one NDR (same as the dashboard).
  app.get('/v1/ndr/stats', { preHandler: requireSeller }, async (request) => {
    const p = principal(request);
    const q = z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), courier: z.string().trim().max(64).optional() }).parse(request.query);
    const args = [p.sellerId, q.from ?? null, q.to ?? null, q.courier ?? null];
    const cases = `nc.seller_id = $1 AND ${optWindowSql('nc.opened_at', 2, 3)} AND ($4::text IS NULL OR cp.code = $4)`;
    const join = 'FROM ndr_cases nc JOIN shipments s ON s.id = nc.shipment_id JOIN courier_providers cp ON cp.id = s.provider_id';
    return withSellerTransaction(p.sellerId, async (client) => {
      const [counts, cohort, reasons, couriers, cod] = await Promise.all([
        client.query<{ status: string; n: string }>(`SELECT (${STATUS_SQL}) AS status, count(*) AS n ${join} WHERE ${cases} GROUP BY 1`, args),
        client.query<{ shipped: number; hit: number }>(
          `SELECT count(*)::int AS shipped, count(*) FILTER (WHERE EXISTS (SELECT 1 FROM ndr_cases n WHERE n.shipment_id = s.id))::int AS hit
           FROM shipments s JOIN courier_providers cp ON cp.id = s.provider_id WHERE s.seller_id = $1 AND s.state <> 'cancelled' AND ${optWindowSql('s.created_at', 2, 3)} AND ($4::text IS NULL OR cp.code = $4)`, args),
        client.query<{ reason: string; n: string }>(`SELECT nc.ndr_reason::text AS reason, count(*) AS n ${join} WHERE ${cases} GROUP BY 1 ORDER BY 2 DESC`, args),
        client.query<{ code: string; name: string; n: string }>(`SELECT cp.code, cp.name, count(*) AS n ${join} WHERE nc.seller_id = $1 AND ${optWindowSql('nc.opened_at', 2, 3)} GROUP BY cp.code, cp.name ORDER BY cp.name`, args.slice(0, 3)),
        client.query<{ v: string }>(`SELECT COALESCE(SUM(o.cod_amount_paise), 0) AS v ${join} JOIN orders o ON o.id = s.order_id WHERE ${cases} AND nc.state = 'open' AND o.payment_mode = 'cod'`, args),
      ]);
      const by = Object.fromEntries(counts.rows.map((r) => [r.status, Number(r.n)])) as Record<string, number>;
      const total = Object.values(by).reduce((a, b) => a + b, 0);
      return {
        total, shipped: cohort.rows[0].shipped, shareOfShipmentsPct: pct(cohort.rows[0].hit, cohort.rows[0].shipped),
        counts: { action_required: (by.new ?? 0) + (by.action_pending ?? 0), action_requested: by.redelivery_scheduled ?? 0, delivered: by.resolved ?? 0, new: by.new ?? 0, action_pending: by.action_pending ?? 0, redelivery_scheduled: by.redelivery_scheduled ?? 0, resolved: by.resolved ?? 0, rto: by.rto ?? 0 },
        codAtRiskPaise: Number(cod.rows[0].v),
        reasons: reasons.rows.map((r) => ({ reason: r.reason, count: Number(r.n), pct: pct(Number(r.n), total) })),
        couriers: couriers.rows.map((r) => ({ code: r.code, name: r.name, count: Number(r.n) })),
      };
    });
  });
}
