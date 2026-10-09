import { applyShipmentFilters, shipmentFilterFields } from '../lib/shipmentFilters.js';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { withSellerTransaction } from '../db/client.js';
import { audit } from '../lib/audit.js';
import { requireSeller } from './seller.js';

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
  const TABS = ['all', 'new', 'action_pending', 'redelivery_scheduled', 'resolved', 'rto'] as const;

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
      if (query.tab !== 'all') add(`(${STATUS_SQL}) = ?`, query.tab);
      if (query.reason) add('nc.ndr_reason::text = ?', query.reason);
      if (query.courier) add('cp.code = ?', query.courier);
      if (query.attemptNumber) add('nc.attempt_number = ?', query.attemptNumber);
      applyShipmentFilters(add, query);
      if (query.from) add('nc.opened_at >= ?::date', query.from);
      if (query.to) add("nc.opened_at < ?::date + 1", query.to);
      if (query.q) add("(o.order_number ILIKE ? OR o.nexgo_order_id ILIKE ? OR s.awb ILIKE ? OR c.full_name ILIKE ? OR c.phone ILIKE ?)".replace(/\?/g, '$' + (params.length + 1)), `%${query.q}%`);
      const from = `FROM ndr_cases nc JOIN shipments s ON s.id = nc.shipment_id JOIN orders o ON o.id = s.order_id JOIN customers c ON c.id = o.customer_id
        JOIN courier_providers cp ON cp.id = s.provider_id JOIN courier_services cs ON cs.id = s.service_id WHERE ${where.join(' AND ')}`;
      const total = Number((await client.query<{ n: string }>(`SELECT count(*) AS n ${from}`, params)).rows[0].n);
      const rows = await client.query(
        `SELECT nc.id, nc.shipment_id, nc.state, nc.ndr_reason, nc.reason_detail, nc.attempt_number, nc.max_attempts, nc.opened_at, nc.sla_deadline_at, nc.resolution_action, nc.resolution_notes, nc.resolved_at,
                (${STATUS_SQL}) AS ndr_status, s.awb, s.state AS shipment_state, o.id AS order_id, o.order_number, o.payment_mode, o.cod_amount_paise,
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

    return withSellerTransaction(p.sellerId, async (client) => {
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

      return result.rows[0];
    });
  });

  // Bulk resolve NDR cases
  app.post('/v1/ndr/cases/bulk-resolve', { preHandler: requireSeller }, async (request) => {
    const p = principal(request);
    const input = bulkResolveInput.parse(request.body);

    return withSellerTransaction(p.sellerId, async (client) => {
      const results = [];

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

      return { 
        results,
        summary: {
          total: input.caseIds.length,
          succeeded: results.filter(r => r.success).length,
          failed: results.filter(r => !r.success).length,
        },
      };
    });
  });

  // Get NDR statistics
  // Board overview: KPI counts, share of shipments, reason mix and courier filter options.
  app.get('/v1/ndr/stats', { preHandler: requireSeller }, async (request) => {
    const p = principal(request);
    return withSellerTransaction(p.sellerId, async (client) => {
      const [counts, shipments, reasons, couriers, cod] = await Promise.all([
        client.query<{ status: string; n: string }>(`SELECT (${STATUS_SQL}) AS status, count(*) AS n FROM ndr_cases nc WHERE nc.seller_id = $1 GROUP BY 1`, [p.sellerId]),
        client.query<{ n: string }>('SELECT count(*) AS n FROM shipments WHERE seller_id = $1 AND state <> \'cancelled\'', [p.sellerId]),
        client.query<{ reason: string; n: string }>('SELECT ndr_reason::text AS reason, count(*) AS n FROM ndr_cases WHERE seller_id = $1 GROUP BY 1 ORDER BY 2 DESC', [p.sellerId]),
        client.query<{ code: string; name: string; n: string }>('SELECT cp.code, cp.name, count(*) AS n FROM ndr_cases nc JOIN shipments s ON s.id = nc.shipment_id JOIN courier_providers cp ON cp.id = s.provider_id WHERE nc.seller_id = $1 GROUP BY cp.code, cp.name ORDER BY cp.name', [p.sellerId]),
        client.query<{ v: string }>(`SELECT COALESCE(SUM(o.cod_amount_paise), 0) AS v FROM ndr_cases nc JOIN shipments s ON s.id = nc.shipment_id JOIN orders o ON o.id = s.order_id WHERE nc.seller_id = $1 AND nc.state = 'open' AND o.payment_mode = 'cod'`, [p.sellerId]),
      ]);
      const by = Object.fromEntries(counts.rows.map((r) => [r.status, Number(r.n)])) as Record<string, number>;
      const total = Object.values(by).reduce((a, b) => a + b, 0);
      const shipmentTotal = Number(shipments.rows[0].n);
      return {
        total, shareOfShipmentsPct: shipmentTotal ? +((total / shipmentTotal) * 100).toFixed(1) : 0,
        counts: { new: by.new ?? 0, action_pending: by.action_pending ?? 0, redelivery_scheduled: by.redelivery_scheduled ?? 0, resolved: by.resolved ?? 0, rto: by.rto ?? 0 },
        codAtRiskPaise: Number(cod.rows[0].v),
        reasons: reasons.rows.map((r) => ({ reason: r.reason, count: Number(r.n), pct: total ? +((Number(r.n) / total) * 100).toFixed(1) : 0 })),
        couriers: couriers.rows.map((r) => ({ code: r.code, name: r.name, count: Number(r.n) })),
      };
    });
  });
}
