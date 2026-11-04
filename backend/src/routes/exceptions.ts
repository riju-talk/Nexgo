import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { withSellerTransaction } from '../db/client.js';
import { audit } from '../lib/audit.js';
import { requireSeller } from './seller.js';

const uuid = z.string().uuid();
const actionInput = z.object({ action: z.enum(['reattempt', 'rto']), note: z.string().trim().max(500).optional() });
function principal(request: FastifyRequest) { if (!request.principal) throw Object.assign(new Error('Authentication required'), { statusCode: 401 }); return request.principal; }

export async function exceptionRoutes(app: FastifyInstance) {
  app.get('/v1/ndr', { preHandler: requireSeller }, async (request) => { const p = principal(request); return withSellerTransaction(p.sellerId, async (client) => ({ items: (await client.query(`SELECT n.*,s.awb,s.state AS shipment_state,o.order_number FROM ndr_cases n JOIN shipments s ON s.id=n.shipment_id JOIN orders o ON o.id=s.order_id WHERE n.seller_id=$1 ORDER BY n.opened_at DESC`, [p.sellerId])).rows })); });
  app.patch('/v1/ndr/:caseId', { preHandler: requireSeller }, async (request) => {
    const p = principal(request); const caseId = uuid.parse((request.params as { caseId: string }).caseId); const input = actionInput.parse(request.body);
    return withSellerTransaction(p.sellerId, async (client) => {
      const current = await client.query<{ shipment_id: string; state: string }>('SELECT shipment_id,state FROM ndr_cases WHERE id=$1 AND seller_id=$2 FOR UPDATE', [caseId, p.sellerId]);
      if (!current.rows[0]) throw Object.assign(new Error('NDR case not found'), { statusCode: 404 }); if (current.rows[0].state !== 'open') throw Object.assign(new Error('This NDR case has already been actioned'), { statusCode: 409 });
      const next = input.action === 'reattempt' ? 'reattempt_requested' : 'rto_requested'; const shipmentState = input.action === 'reattempt' ? 'in_transit' : 'rto';
      const result = await client.query(`UPDATE ndr_cases SET state=$1::ndr_state,resolved_at=now(),updated_at=now() WHERE id=$2 RETURNING *`, [next, caseId]);
      await client.query('UPDATE shipments SET state=$1::shipment_state,updated_at=now() WHERE id=$2', [shipmentState, current.rows[0].shipment_id]);
      await client.query(`INSERT INTO shipment_events (shipment_id,state,occurred_at,description,source) VALUES ($1,$2::shipment_state,now(),$3,'manual')`, [current.rows[0].shipment_id, shipmentState, input.note ?? `Seller requested ${input.action}`]);
      await audit(client, { sellerId: p.sellerId, actorUserId: p.userId, action: `ndr.${input.action}_requested`, targetType: 'ndr_case', targetId: caseId, requestId: request.id }); return result.rows[0];
    });
  });
  app.get('/v1/weight-discrepancies', { preHandler: requireSeller }, async (request) => {
    const p = principal(request);
    // Billed weight above the declared order weight is the discrepancy a seller needs to review.
    return withSellerTransaction(p.sellerId, async (client) => ({ items: (await client.query(`SELECT s.id,s.awb,s.state,s.shipping_charge_paise,s.chargeable_weight_g AS billed_weight_g,o.total_weight_g AS declared_weight_g,(s.chargeable_weight_g-o.total_weight_g) AS difference_g,o.order_number,cp.name AS courier_name,s.booked_at FROM shipments s JOIN orders o ON o.id=s.order_id JOIN courier_providers cp ON cp.id=s.provider_id WHERE s.seller_id=$1 AND s.chargeable_weight_g>o.total_weight_g ORDER BY s.booked_at DESC LIMIT 200`, [p.sellerId])).rows }));
  });
}
