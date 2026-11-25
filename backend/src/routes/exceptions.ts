import type { FastifyInstance, FastifyRequest } from 'fastify';
import { withSellerTransaction } from '../db/client.js';
import { requireSeller } from './seller.js';

function principal(request: FastifyRequest) { if (!request.principal) throw Object.assign(new Error('Authentication required'), { statusCode: 401 }); return request.principal; }

export async function exceptionRoutes(app: FastifyInstance) {
  app.get('/v1/ndr', { preHandler: requireSeller }, async (request) => { const p = principal(request); return withSellerTransaction(p.sellerId, async (client) => ({ items: (await client.query(`SELECT n.*,s.awb,s.state AS shipment_state,o.order_number FROM ndr_cases n JOIN shipments s ON s.id=n.shipment_id JOIN orders o ON o.id=s.order_id WHERE n.seller_id=$1 ORDER BY n.opened_at DESC`, [p.sellerId])).rows })); });
  app.get('/v1/weight-discrepancies', { preHandler: requireSeller }, async (request) => {
    const p = principal(request);
    // Billed weight above the declared order weight is the discrepancy a seller needs to review.
    return withSellerTransaction(p.sellerId, async (client) => ({ items: (await client.query(`SELECT s.id,s.awb,s.state,s.shipping_charge_paise,s.chargeable_weight_g AS billed_weight_g,o.total_weight_g AS declared_weight_g,(s.chargeable_weight_g-o.total_weight_g) AS difference_g,o.order_number,cp.name AS courier_name,s.booked_at FROM shipments s JOIN orders o ON o.id=s.order_id JOIN courier_providers cp ON cp.id=s.provider_id WHERE s.seller_id=$1 AND s.chargeable_weight_g>o.total_weight_g ORDER BY s.booked_at DESC LIMIT 200`, [p.sellerId])).rows }));
  });
}
