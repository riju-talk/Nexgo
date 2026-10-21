import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withSellerTransaction } from '../db/client.js';
import { audit } from '../lib/audit.js';
import { requireSeller } from './seller.js';

export async function codConfirmationRoutes(app: FastifyInstance) {
  app.get('/v1/cod-confirmations', { preHandler: requireSeller }, async (request) => {
    const p = request.principal!;
    return withSellerTransaction(p.sellerId, async (client) => ({ items: (await client.query(
      `SELECT cc.id, cc.order_id, cc.channel, cc.state, cc.message, cc.queued_at, cc.responded_at, o.order_number, o.nexgo_order_id, o.cod_amount_paise, o.state AS order_state, c.full_name AS customer_name
       FROM cod_confirmations cc JOIN orders o ON o.id = cc.order_id JOIN customers c ON c.id = o.customer_id
       WHERE cc.seller_id = $1 ORDER BY cc.queued_at DESC LIMIT 100`, [p.sellerId])).rows }));
  });

  // Records the customer's answer. Answering twice is a no-op (the first answer stands). Declining cancels an order that has no courier yet.
  app.post('/v1/cod-confirmations/:id/answer', { preHandler: requireSeller }, async (request) => {
    const p = request.principal!;
    const id = z.string().uuid().parse((request.params as { id: string }).id);
    const { answer } = z.object({ answer: z.enum(['confirm', 'decline']) }).parse(request.body);
    return withSellerTransaction(p.sellerId, async (client) => {
      const row = await client.query<{ state: string; order_id: string }>('SELECT state, order_id FROM cod_confirmations WHERE id = $1 AND seller_id = $2 FOR UPDATE', [id, p.sellerId]);
      if (!row.rows[0]) throw Object.assign(new Error('Confirmation not found'), { statusCode: 404 });
      if (row.rows[0].state !== 'pending') return { id, state: row.rows[0].state, replay: true };
      const state = answer === 'confirm' ? 'confirmed' : 'declined';
      await client.query('UPDATE cod_confirmations SET state = $1, responded_at = now(), responded_by = $2 WHERE id = $3', [state, p.userId, id]);
      let cancelled = false;
      if (state === 'declined') {
        const o = await client.query(`UPDATE orders SET state = 'cancelled', updated_at = now() WHERE id = $1 AND seller_id = $2 AND state IN ('new','ready_to_ship') AND NOT EXISTS (SELECT 1 FROM shipments s WHERE s.order_id = orders.id AND s.state <> 'cancelled') RETURNING id`, [row.rows[0].order_id, p.sellerId]);
        cancelled = (o.rowCount ?? 0) > 0;
      }
      await audit(client, { sellerId: p.sellerId, actorUserId: p.userId, action: `cod_confirmation.${state}`, targetType: 'order', targetId: row.rows[0].order_id, requestId: request.id, metadata: { cancelled } });
      return { id, state, orderCancelled: cancelled };
    });
  });
}
