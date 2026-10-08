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
  // Get all NDR cases for seller
  app.get('/v1/ndr/cases', { preHandler: requireSeller }, async (request) => {
    const p = principal(request);
    const query = z.object({
      state: z.enum(['open', 'reattempt_requested', 'rto_requested', 'resolved']).optional(),
      reason: z.enum(['customer_unavailable', 'address_incomplete', 'address_incorrect', 'refused_delivery', 'payment_not_ready', 'customer_requested_reschedule', 'premises_closed', 'customer_not_contactable', 'incorrect_product', 'damaged_product', 'other']).optional(),
      attemptNumber: z.coerce.number().int().min(1).max(3).optional(),
      courierId: uuid.optional(),
    }).parse(request.query);

    return withSellerTransaction(p.sellerId, async (client) => {
      let sql = `
        SELECT 
          nc.*,
          s.awb,
          s.state AS shipment_state,
          o.order_number,
          o.payment_mode,
          o.cod_amount_paise,
          c.full_name AS customer_name,
          c.phone AS customer_phone,
          c.city AS customer_city,
          c.pincode AS customer_pincode,
          cp.name AS courier_name,
          cs.display_name AS service_name,
          EXTRACT(EPOCH FROM (nc.sla_deadline_at - now())) / 3600 AS hours_until_deadline
        FROM ndr_cases nc
        JOIN shipments s ON s.id = nc.shipment_id
        JOIN orders o ON o.id = s.order_id
        JOIN customers c ON c.id = o.customer_id
        JOIN courier_providers cp ON cp.id = s.provider_id
        JOIN courier_services cs ON cs.id = s.service_id
        WHERE nc.seller_id = $1
      `;
      
      const params: any[] = [p.sellerId];
      let paramIdx = 2;

      if (query.state) {
        sql += ` AND nc.state = $${paramIdx}::ndr_state`;
        params.push(query.state);
        paramIdx++;
      }

      if (query.reason) {
        sql += ` AND nc.ndr_reason = $${paramIdx}::ndr_reason_enum`;
        params.push(query.reason);
        paramIdx++;
      }

      if (query.attemptNumber) {
        sql += ` AND nc.attempt_number = $${paramIdx}`;
        params.push(query.attemptNumber);
        paramIdx++;
      }

      if (query.courierId) {
        sql += ` AND s.provider_id = $${paramIdx}`;
        params.push(query.courierId);
        paramIdx++;
      }

      sql += ` ORDER BY nc.sla_deadline_at ASC, nc.opened_at DESC LIMIT 200`;

      return { items: (await client.query(sql, params)).rows };
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
        SET state = $1::shipment_state, updated_at = now() 
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
            SET state = $1::shipment_state, updated_at = now() 
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
  app.get('/v1/ndr/stats', { preHandler: requireSeller }, async (request) => {
    const p = principal(request);

    return withSellerTransaction(p.sellerId, async (client) => {
      const stats = await client.query(`
        SELECT
          COUNT(*) FILTER (WHERE nc.state = 'open') AS open_count,
          COUNT(*) FILTER (WHERE nc.state = 'open' AND nc.sla_deadline_at < now() + interval '24 hours') AS urgent_count,
          COUNT(*) FILTER (WHERE nc.state = 'reattempt_requested') AS reattempt_requested_count,
          COUNT(*) FILTER (WHERE nc.state = 'rto_requested') AS rto_requested_count,
          COUNT(*) FILTER (WHERE nc.state = 'resolved') AS resolved_count,
          SUM(CASE WHEN o.payment_mode = 'cod' THEN o.cod_amount_paise ELSE 0 END) 
            FILTER (WHERE nc.state = 'open') AS cod_at_risk_paise,
          COUNT(*) FILTER (WHERE nc.state = 'open' AND nc.attempt_number = 1) AS first_attempt_count,
          COUNT(*) FILTER (WHERE nc.state = 'open' AND nc.attempt_number = 2) AS second_attempt_count,
          COUNT(*) FILTER (WHERE nc.state = 'open' AND nc.attempt_number = 3) AS third_attempt_count
        FROM ndr_cases nc
        JOIN shipments s ON s.id = nc.shipment_id
        JOIN orders o ON o.id = s.order_id
        WHERE nc.seller_id = $1
      `, [p.sellerId]);

      const reasonBreakdown = await client.query(`
        SELECT 
          ndr_reason,
          COUNT(*) AS count,
          COUNT(*) FILTER (WHERE state = 'open') AS open_count
        FROM ndr_cases
        WHERE seller_id = $1
        GROUP BY ndr_reason
        ORDER BY count DESC
      `, [p.sellerId]);

      return {
        ...stats.rows[0],
        reasonBreakdown: reasonBreakdown.rows,
      };
    });
  });
}
