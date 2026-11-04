import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { db, withSellerTransaction } from '../db/client.js';
import { audit } from '../lib/audit.js';
import { requireSeller } from './seller.js';
import { requirePlatformAdmin } from '../lib/adminAuth.js';

const uuid = z.string().uuid();

const partnerInput = z.object({
  code: z.string().trim().regex(/^[a-z0-9-]{2,40}$/),
  name: z.string().trim().min(2).max(120),
  legalName: z.string().trim().max(200).optional(),
  contactPerson: z.string().trim().max(120).optional(),
  contactEmail: z.string().email().max(254).optional(),
  contactPhone: z.string().trim().max(20).optional(),
  gstin: z.string().trim().regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/).optional(),
  pan: z.string().trim().regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/).optional(),
  commissionPercentage: z.number().min(0).max(100).optional(),
  fulfillmentFeePaise: z.number().int().min(0).optional(),
  webhookUrl: z.string().url().optional(),
});

const partnerMappingInput = z.object({
  sellerId: uuid,
  isActive: z.boolean().default(true),
  autoAcceptOrders: z.boolean().default(false),
  skuPrefix: z.string().trim().max(20).optional(),
  customCommissionPercentage: z.number().min(0).max(100).optional(),
  customFulfillmentFeePaise: z.number().int().min(0).optional(),
});

function principal(request: FastifyRequest) {
  if (!request.principal) throw Object.assign(new Error('Authentication required'), { statusCode: 401 });
  return request.principal;
}

export async function partnerRoutes(app: FastifyInstance) {
  // ============================================================================
  // ADMIN ROUTES - Partner Management
  // ============================================================================

  // Get all partners (admin only)
  app.get('/v1/admin/partners', { preHandler: requirePlatformAdmin }, async (request) => {
    const query = z.object({
      status: z.enum(['onboarding', 'active', 'suspended', 'terminated']).optional(),
    }).parse(request.query);

    let sql = `
      SELECT 
        p.*,
        COUNT(psm.id) AS active_seller_count,
        COUNT(o.id) AS total_orders,
        SUM(o.total_paise) AS total_order_value_paise
      FROM marketplace_partners p
      LEFT JOIN partner_seller_mappings psm ON psm.partner_id = p.id AND psm.is_active = true
      LEFT JOIN orders o ON o.partner_id = p.id AND o.order_flow = 'dropship'
      WHERE 1=1
    `;

    const params: any[] = [];
    if (query.status) {
      params.push(query.status);
      sql += ` AND p.status = $${params.length}::partner_status_enum`;
    }

    sql += ` GROUP BY p.id ORDER BY p.name`;

    const result = await db.query(sql, params);
    return { items: result.rows };
  });

  // Create new partner (admin only)
  app.post('/v1/admin/partners', { preHandler: requirePlatformAdmin }, async (request, reply) => {
    const input = partnerInput.parse(request.body);

    const result = await db.query(`
      INSERT INTO marketplace_partners (
        code,
        name,
        legal_name,
        contact_person,
        contact_email,
        contact_phone,
        gstin,
        pan,
        commission_percentage,
        fulfillment_fee_paise,
        webhook_url,
        status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'onboarding')
      RETURNING *
    `, [
      input.code.toLowerCase(),
      input.name,
      input.legalName || null,
      input.contactPerson || null,
      input.contactEmail || null,
      input.contactPhone || null,
      input.gstin?.toUpperCase() || null,
      input.pan?.toUpperCase() || null,
      input.commissionPercentage || null,
      input.fulfillmentFeePaise || 0,
      input.webhookUrl || null,
    ]);

    await db.query(`
      INSERT INTO audit_events (
        seller_id,
        actor_user_id,
        action,
        target_type,
        target_id,
        request_id
      ) VALUES (NULL, $1, 'partner.created', 'marketplace_partner', $2, $3)
    `, [request.adminPrincipal!.userId, result.rows[0].id, request.id]);

    return reply.code(201).send(result.rows[0]);
  });

  // Update partner status (admin only)
  app.patch('/v1/admin/partners/:partnerId/status', { preHandler: requirePlatformAdmin }, async (request) => {
    const partnerId = uuid.parse((request.params as { partnerId: string }).partnerId);
    const { status } = z.object({
      status: z.enum(['active', 'suspended', 'terminated']),
    }).parse(request.body);

    const current = await db.query<{ status: string }>(`
      SELECT status FROM marketplace_partners WHERE id = $1 FOR UPDATE
    `, [partnerId]);

    if (!current.rows[0]) {
      throw Object.assign(new Error('Partner not found'), { statusCode: 404 });
    }

    const result = await db.query(`
      UPDATE marketplace_partners 
      SET 
        status = $1::partner_status_enum,
        onboarded_at = CASE WHEN $1 = 'active' AND onboarded_at IS NULL THEN now() ELSE onboarded_at END,
        suspended_at = CASE WHEN $1 = 'suspended' THEN now() ELSE suspended_at END,
        terminated_at = CASE WHEN $1 = 'terminated' THEN now() ELSE terminated_at END,
        updated_at = now()
      WHERE id = $2
      RETURNING *
    `, [status, partnerId]);

    await db.query(`
      INSERT INTO audit_events (
        seller_id,
        actor_user_id,
        action,
        target_type,
        target_id,
        request_id,
        metadata
      ) VALUES (NULL, $1, 'partner.status_changed', 'marketplace_partner', $2, $3, $4)
    `, [
      request.adminPrincipal!.userId,
      partnerId,
      request.id,
      JSON.stringify({ from: current.rows[0].status, to: status }),
    ]);

    return result.rows[0];
  });

  // Create partner-seller mapping (admin only)
  app.post('/v1/admin/partners/:partnerId/sellers', { preHandler: requirePlatformAdmin }, async (request, reply) => {
    const partnerId = uuid.parse((request.params as { partnerId: string }).partnerId);
    const input = partnerMappingInput.parse(request.body);

    // Verify partner exists
    const partner = await db.query(`
      SELECT id FROM marketplace_partners WHERE id = $1
    `, [partnerId]);

    if (!partner.rows[0]) {
      throw Object.assign(new Error('Partner not found'), { statusCode: 404 });
    }

    // Verify seller exists
    const seller = await db.query(`
      SELECT id FROM sellers WHERE id = $1
    `, [input.sellerId]);

    if (!seller.rows[0]) {
      throw Object.assign(new Error('Seller not found'), { statusCode: 404 });
    }

    const result = await db.query(`
      INSERT INTO partner_seller_mappings (
        partner_id,
        seller_id,
        is_active,
        auto_accept_orders,
        sku_prefix,
        custom_commission_percentage,
        custom_fulfillment_fee_paise
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (partner_id, seller_id) 
      DO UPDATE SET
        is_active = EXCLUDED.is_active,
        auto_accept_orders = EXCLUDED.auto_accept_orders,
        sku_prefix = EXCLUDED.sku_prefix,
        custom_commission_percentage = EXCLUDED.custom_commission_percentage,
        custom_fulfillment_fee_paise = EXCLUDED.custom_fulfillment_fee_paise,
        activated_at = CASE WHEN EXCLUDED.is_active THEN now() ELSE partner_seller_mappings.activated_at END
      RETURNING *
    `, [
      partnerId,
      input.sellerId,
      input.isActive,
      input.autoAcceptOrders,
      input.skuPrefix || null,
      input.customCommissionPercentage || null,
      input.customFulfillmentFeePaise || null,
    ]);

    return reply.code(201).send(result.rows[0]);
  });

  // Get partner statistics
  app.get('/v1/admin/partners/:partnerId/stats', { preHandler: requirePlatformAdmin }, async (request) => {
    const partnerId = uuid.parse((request.params as { partnerId: string }).partnerId);

    const stats = await db.query(`
      SELECT * FROM partner_order_stats
      WHERE partner_id = $1
    `, [partnerId]);

    if (!stats.rows[0]) {
      throw Object.assign(new Error('Partner not found'), { statusCode: 404 });
    }

    return stats.rows[0];
  });

  // ============================================================================
  // SELLER ROUTES - Partner Orders (Dropshipping)
  // ============================================================================

  // Get partner orders for seller (dropship orders received from partners)
  app.get('/v1/seller/partner-orders', { preHandler: requireSeller }, async (request) => {
    const p = principal(request);
    const query = z.object({
      partnerId: uuid.optional(),
      state: z.enum(['new', 'ready_to_ship', 'booked', 'cancelled']).optional(),
    }).parse(request.query);

    return withSellerTransaction(p.sellerId, async (client) => {
      let sql = `
        SELECT 
          o.*,
          p.name AS partner_name,
          p.code AS partner_code,
          c.full_name AS customer_name,
          c.city AS customer_city,
          c.pincode AS customer_pincode,
          w.name AS warehouse_name
        FROM orders o
        JOIN marketplace_partners p ON p.id = o.partner_id
        JOIN customers c ON c.id = o.customer_id
        JOIN warehouses w ON w.id = o.warehouse_id
        WHERE o.seller_id = $1 
          AND o.order_flow = 'dropship'
      `;

      const params: any[] = [p.sellerId];
      let paramIdx = 2;

      if (query.partnerId) {
        sql += ` AND o.partner_id = $${paramIdx}`;
        params.push(query.partnerId);
        paramIdx++;
      }

      if (query.state) {
        sql += ` AND o.state = $${paramIdx}::order_state`;
        params.push(query.state);
        paramIdx++;
      }

      sql += ` ORDER BY o.created_at DESC LIMIT 200`;

      return { items: (await client.query(sql, params)).rows };
    });
  });

  // Get partners seller is fulfilling for
  app.get('/v1/seller/partners', { preHandler: requireSeller }, async (request) => {
    const p = principal(request);

    return withSellerTransaction(p.sellerId, async (client) => {
      const partners = await client.query(`
        SELECT 
          p.id,
          p.code,
          p.name,
          p.status,
          psm.is_active,
          psm.auto_accept_orders,
          psm.custom_commission_percentage,
          psm.custom_fulfillment_fee_paise,
          COUNT(o.id) AS order_count,
          SUM(o.total_paise) AS total_order_value_paise
        FROM partner_seller_mappings psm
        JOIN marketplace_partners p ON p.id = psm.partner_id
        LEFT JOIN orders o ON o.partner_id = p.id AND o.seller_id = psm.seller_id
        WHERE psm.seller_id = $1
        GROUP BY p.id, p.code, p.name, p.status, psm.is_active, psm.auto_accept_orders, 
                 psm.custom_commission_percentage, psm.custom_fulfillment_fee_paise
        ORDER BY p.name
      `, [p.sellerId]);

      return { items: partners.rows };
    });
  });

  // Get partner order stats for seller
  app.get('/v1/seller/partner-orders/stats', { preHandler: requireSeller }, async (request) => {
    const p = principal(request);

    return withSellerTransaction(p.sellerId, async (client) => {
      const stats = await client.query(`
        SELECT
          COUNT(*) AS total_orders,
          COUNT(*) FILTER (WHERE state = 'new') AS new_orders,
          COUNT(*) FILTER (WHERE state = 'ready_to_ship') AS ready_orders,
          COUNT(*) FILTER (WHERE state = 'booked') AS shipped_orders,
          COUNT(*) FILTER (WHERE state = 'cancelled') AS cancelled_orders,
          SUM(total_paise) AS total_order_value_paise,
          SUM(partner_commission_paise) AS total_commission_paise,
          SUM(partner_fulfillment_fee_paise) AS total_fulfillment_fee_paise,
          AVG(total_paise) AS avg_order_value_paise
        FROM orders
        WHERE seller_id = $1 AND order_flow = 'dropship'
      `, [p.sellerId]);

      const partnerBreakdown = await client.query(`
        SELECT 
          p.id AS partner_id,
          p.name AS partner_name,
          COUNT(o.id) AS order_count,
          SUM(o.total_paise) AS total_order_value_paise,
          SUM(o.partner_commission_paise) AS total_commission_paise
        FROM orders o
        JOIN marketplace_partners p ON p.id = o.partner_id
        WHERE o.seller_id = $1 AND o.order_flow = 'dropship'
        GROUP BY p.id, p.name
        ORDER BY order_count DESC
      `, [p.sellerId]);

      return {
        ...stats.rows[0],
        partnerBreakdown: partnerBreakdown.rows,
      };
    });
  });
}
