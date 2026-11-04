import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { withSellerTransaction } from '../db/client.js';
import { audit } from '../lib/audit.js';
import { requireSeller } from './seller.js';

const uuid = z.string().uuid();

const disputeActionInput = z.object({
  action: z.enum(['dispute', 'accept', 'withdraw']),
  sellerNotes: z.string().trim().max(2000).optional(),
  evidenceDocumentIds: z.array(uuid).max(10).optional(),
});

const bulkDisputeInput = z.object({
  disputeIds: z.array(uuid).min(1).max(50),
  action: z.enum(['dispute', 'accept']),
  sellerNotes: z.string().trim().max(2000).optional(),
});

function principal(request: FastifyRequest) {
  if (!request.principal) throw Object.assign(new Error('Authentication required'), { statusCode: 401 });
  return request.principal;
}

export async function weightDisputeRoutes(app: FastifyInstance) {
  // Weight disputes for the seller: status tab, search, courier/date filters, pagination.
  app.get('/v1/weight-disputes', { preHandler: requireSeller }, async (request) => {
    const p = principal(request);
    const query = z.object({
      status: z.enum(['open', 'disputed', 'accepted', 'won', 'lost', 'withdrawn']).optional(),
      q: z.string().trim().max(80).optional(),
      courier: z.string().trim().max(64).optional(),
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(8),
    }).parse(request.query);

    return withSellerTransaction(p.sellerId, async (client) => {
      const where = ['wd.seller_id = $1']; const params: unknown[] = [p.sellerId];
      const add = (sql: string, value: unknown) => { params.push(value); where.push(sql.replaceAll('?', `$${params.length}`)); };
      if (query.status) add('wd.status = ?::dispute_status_enum', query.status);
      if (query.courier) add('cp.code = ?', query.courier);
      if (query.from) add('wd.raised_at >= ?::date', query.from);
      if (query.to) add('wd.raised_at < ?::date + 1', query.to);
      if (query.q) { params.push(`%${query.q}%`); where.push(`(s.awb ILIKE $${params.length} OR o.order_number ILIKE $${params.length})`); }
      const from = `FROM weight_disputes wd JOIN shipments s ON s.id = wd.shipment_id JOIN orders o ON o.id = s.order_id
        JOIN courier_providers cp ON cp.id = wd.raised_by_provider JOIN courier_services cs ON cs.id = s.service_id WHERE ${where.join(' AND ')}`;
      const total = Number((await client.query<{ n: string }>(`SELECT count(*) AS n ${from}`, params)).rows[0].n);
      const rows = await client.query(
        `SELECT wd.*, s.awb, o.order_number, cp.code AS courier_code, cp.name AS courier_name, cs.display_name AS service_name,
                EXTRACT(EPOCH FROM (wd.dispute_deadline - now())) / 86400 AS days_until_deadline,
                COALESCE(array_length(wd.seller_evidence_document_ids, 1), 0) > 0 AS has_evidence
         ${from} ORDER BY (wd.status IN ('open','disputed')) DESC, wd.dispute_deadline ASC, wd.id LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}`, params);
      return { items: rows.rows, total, page: query.page, pageSize: query.pageSize, pages: Math.max(1, Math.ceil(total / query.pageSize)) };
    });
  });

  app.get('/v1/weight-disputes/:disputeId', { preHandler: requireSeller }, async (request) => {
    const p = principal(request);
    const disputeId = uuid.parse((request.params as { disputeId: string }).disputeId);

    return withSellerTransaction(p.sellerId, async (client) => {
      const dispute = await client.query(`
        SELECT 
          wd.*,
          s.awb,
          s.booked_at,
          o.order_number,
          o.total_weight_g AS order_weight_g,
          o.package_length_mm,
          o.package_width_mm,
          o.package_height_mm,
          o.volumetric_weight_g,
          cp.name AS courier_name,
          cs.display_name AS service_name,
          c.full_name AS customer_name,
          c.city AS customer_city,
          c.pincode AS customer_pincode
        FROM weight_disputes wd
        JOIN shipments s ON s.id = wd.shipment_id
        JOIN orders o ON o.id = s.order_id
        JOIN customers c ON c.id = o.customer_id
        JOIN courier_providers cp ON cp.id = wd.raised_by_provider
        JOIN courier_services cs ON cs.id = s.service_id
        WHERE wd.id = $1 AND wd.seller_id = $2
      `, [disputeId, p.sellerId]);

      if (!dispute.rows[0]) {
        throw Object.assign(new Error('Weight dispute not found'), { statusCode: 404 });
      }

      // Get history
      const history = await client.query(`
        SELECT * FROM weight_dispute_history
        WHERE dispute_id = $1
        ORDER BY created_at DESC
      `, [disputeId]);

      return {
        ...dispute.rows[0],
        history: history.rows,
      };
    });
  });

  // Take action on dispute
  app.post('/v1/weight-disputes/:disputeId/action', { preHandler: requireSeller }, async (request) => {
    const p = principal(request);
    const disputeId = uuid.parse((request.params as { disputeId: string }).disputeId);
    const input = disputeActionInput.parse(request.body);

    return withSellerTransaction(p.sellerId, async (client) => {
      const current = await client.query<{ 
        status: string;
        held_amount_paise: number;
        additional_charge_paise: number;
      }>(`
        SELECT status, held_amount_paise, additional_charge_paise
        FROM weight_disputes 
        WHERE id = $1 AND seller_id = $2 
        FOR UPDATE
      `, [disputeId, p.sellerId]);

      if (!current.rows[0]) {
        throw Object.assign(new Error('Weight dispute not found'), { statusCode: 404 });
      }

      if (current.rows[0].status !== 'open') {
        throw Object.assign(new Error('This dispute has already been actioned'), { statusCode: 409 });
      }

      let newStatus: string;
      let amountToDeduct = 0;

      if (input.action === 'dispute') {
        newStatus = 'disputed';
        // Held amount remains held until resolution
      } else if (input.action === 'accept') {
        newStatus = 'accepted';
        amountToDeduct = current.rows[0].additional_charge_paise;
      } else if (input.action === 'withdraw') {
        newStatus = 'withdrawn';
        amountToDeduct = current.rows[0].additional_charge_paise;
      } else {
        throw Object.assign(new Error('Invalid action'), { statusCode: 400 });
      }

      // Update dispute
      const result = await client.query(`
        UPDATE weight_disputes 
        SET 
          status = $1::dispute_status_enum,
          seller_notes = $2,
          seller_evidence_document_ids = $3,
          disputed_at = CASE WHEN $1 = 'disputed' THEN now() ELSE disputed_at END,
          disputed_by = CASE WHEN $1 = 'disputed' THEN $4 ELSE disputed_by END,
          resolved_at = CASE WHEN $1 IN ('accepted', 'withdrawn') THEN now() ELSE resolved_at END,
          resolved_by = CASE WHEN $1 IN ('accepted', 'withdrawn') THEN $4 ELSE resolved_by END,
          updated_at = now()
        WHERE id = $5 
        RETURNING *
      `, [
        newStatus,
        input.sellerNotes || null,
        input.evidenceDocumentIds || [],
        p.userId,
        disputeId,
      ]);

      // Record in history
      await client.query(`
        INSERT INTO weight_dispute_history (
          dispute_id,
          from_status,
          to_status,
          changed_by,
          notes
        ) VALUES ($1, $2::dispute_status_enum, $3::dispute_status_enum, $4, $5)
      `, [
        disputeId,
        current.rows[0].status,
        newStatus,
        p.userId,
        input.sellerNotes || null,
      ]);

      // If accepted or withdrawn, deduct from wallet
      if (amountToDeduct > 0) {
        await client.query(`
          INSERT INTO wallet_entries (
            seller_id,
            entry_type,
            amount_paise,
            reference_type,
            reference_id,
            idempotency_key,
            description
          ) VALUES ($1, 'debit', $2, 'weight_dispute', $3, $4, $5)
        `, [
          p.sellerId,
          amountToDeduct,
          disputeId,
          `weight-dispute-${disputeId}`,
          `Weight dispute ${input.action}: Additional charge for dispute ${disputeId}`,
        ]);
      }

      await audit(client, {
        sellerId: p.sellerId,
        actorUserId: p.userId,
        action: `weight_dispute.${input.action}`,
        targetType: 'weight_dispute',
        targetId: disputeId,
        requestId: request.id,
        metadata: { action: input.action, amountPaise: amountToDeduct },
      });

      return result.rows[0];
    });
  });

  // Bulk action on disputes
  app.post('/v1/weight-disputes/bulk-action', { preHandler: requireSeller }, async (request) => {
    const p = principal(request);
    const input = bulkDisputeInput.parse(request.body);

    return withSellerTransaction(p.sellerId, async (client) => {
      const results = [];
      let totalAmountDeducted = 0;

      for (const disputeId of input.disputeIds) {
        try {
          const current = await client.query<{ 
            status: string;
            additional_charge_paise: number;
          }>(`
            SELECT status, additional_charge_paise
            FROM weight_disputes 
            WHERE id = $1 AND seller_id = $2 AND status = 'open'
            FOR UPDATE
          `, [disputeId, p.sellerId]);

          if (!current.rows[0]) {
            results.push({ disputeId, success: false, error: 'Not found or already actioned' });
            continue;
          }

          const newStatus = input.action === 'dispute' ? 'disputed' : 'accepted';
          const amountToDeduct = input.action === 'accept' ? current.rows[0].additional_charge_paise : 0;

          await client.query(`
            UPDATE weight_disputes 
            SET 
              status = $1::dispute_status_enum,
              seller_notes = $2,
              disputed_at = CASE WHEN $1 = 'disputed' THEN now() ELSE disputed_at END,
              disputed_by = CASE WHEN $1 = 'disputed' THEN $3 ELSE disputed_by END,
              resolved_at = CASE WHEN $1 = 'accepted' THEN now() ELSE resolved_at END,
              resolved_by = CASE WHEN $1 = 'accepted' THEN $3 ELSE resolved_by END,
              updated_at = now()
            WHERE id = $4
          `, [newStatus, input.sellerNotes || null, p.userId, disputeId]);

          if (amountToDeduct > 0) {
            await client.query(`
              INSERT INTO wallet_entries (
                seller_id,
                entry_type,
                amount_paise,
                reference_type,
                reference_id,
                idempotency_key,
                description
              ) VALUES ($1, 'debit', $2, 'weight_dispute', $3, $4, $5)
            `, [
              p.sellerId,
              amountToDeduct,
              disputeId,
              `weight-dispute-bulk-${disputeId}`,
              `Bulk weight dispute acceptance: ${disputeId}`,
            ]);
            totalAmountDeducted += amountToDeduct;
          }

          results.push({ disputeId, success: true, amountDeducted: amountToDeduct });
        } catch (error) {
          results.push({ disputeId, success: false, error: (error as Error).message });
        }
      }

      await audit(client, {
        sellerId: p.sellerId,
        actorUserId: p.userId,
        action: 'weight_dispute.bulk_action',
        targetType: 'weight_dispute',
        targetId: 'bulk',
        requestId: request.id,
        metadata: { 
          count: input.disputeIds.length, 
          action: input.action,
          totalAmountDeductedPaise: totalAmountDeducted,
        },
      });

      return { 
        results,
        summary: {
          total: input.disputeIds.length,
          succeeded: results.filter(r => r.success).length,
          failed: results.filter(r => !r.success).length,
          totalAmountDeductedPaise: totalAmountDeducted,
        },
      };
    });
  });

  // Get dispute statistics
  app.get('/v1/weight-disputes/stats', { preHandler: requireSeller }, async (request) => {
    const p = principal(request);

    return withSellerTransaction(p.sellerId, async (client) => {
      const stats = await client.query(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'open') AS open_count,
          COUNT(*) FILTER (WHERE status = 'disputed') AS disputed_count,
          COUNT(*) FILTER (WHERE status = 'accepted') AS accepted_count,
          COUNT(*) FILTER (WHERE status = 'won') AS won_count,
          COUNT(*) FILTER (WHERE status = 'lost') AS lost_count,
          COUNT(*) FILTER (WHERE status = 'withdrawn') AS withdrawn_count,
          SUM(held_amount_paise) FILTER (WHERE status IN ('open', 'disputed')) AS total_held_paise,
          SUM(additional_charge_paise) FILTER (WHERE status = 'won') AS total_saved_paise,
          SUM(additional_charge_paise) FILTER (WHERE status IN ('lost', 'accepted')) AS total_cost_paise,
          COUNT(*) FILTER (WHERE status = 'open' AND array_length(seller_evidence_document_ids, 1) > 0) AS open_with_evidence_count,
          COUNT(*) FILTER (WHERE status = 'open' AND dispute_deadline < now() + interval '3 days') AS urgent_count
        FROM weight_disputes
        WHERE seller_id = $1
      `, [p.sellerId]);

      const courierBreakdown = await client.query(`
        SELECT 
          cp.id AS courier_id,
          cp.name AS courier_name,
          COUNT(*) AS total_disputes,
          COUNT(*) FILTER (WHERE wd.status = 'open') AS open_count,
          COUNT(*) FILTER (WHERE wd.status = 'disputed') AS disputed_count,
          COUNT(*) FILTER (WHERE wd.status = 'won') AS won_count,
          SUM(wd.held_amount_paise) FILTER (WHERE wd.status IN ('open', 'disputed')) AS held_paise
        FROM weight_disputes wd
        JOIN courier_providers cp ON cp.id = wd.raised_by_provider
        WHERE wd.seller_id = $1
        GROUP BY cp.id, cp.name
        ORDER BY total_disputes DESC
      `, [p.sellerId]);

      return {
        ...stats.rows[0],
        courierBreakdown: courierBreakdown.rows,
      };
    });
  });
}
