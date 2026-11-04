import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { withSellerTransaction, withTransaction } from '../db/client.js';
import { audit } from '../lib/audit.js';
import { createRazorpayOrder, verifyRazorpayWebhookSignature } from '../lib/razorpay.js';
import { requireSeller } from './seller.js';

function principal(request: FastifyRequest) {
  if (!request.principal) throw Object.assign(new Error('Authentication required'), { statusCode: 401 });
  return request.principal;
}

const recharge = z.object({ amountPaise: z.number().int().min(10_000).max(10_00_00_000) }); // ₹100 – ₹10L
const razorpayEvent = z.object({
  event: z.string(),
  payload: z.object({ payment: z.object({ entity: z.object({ id: z.string(), order_id: z.string(), status: z.string() }) }) }),
});

export async function walletRechargeRoutes(app: FastifyInstance) {
  app.post('/v1/wallet/recharge', { preHandler: requireSeller }, async (request, reply) => {
    const input = recharge.parse(request.body);
    const p = principal(request);
    const order = await createRazorpayOrder(input.amountPaise, `nx-${p.sellerId}-${Date.now()}`);
    const row = await withSellerTransaction(p.sellerId, async (client) => {
      const result = await client.query(
        `INSERT INTO wallet_recharges (seller_id, amount_paise, provider_order_id) VALUES ($1,$2,$3) RETURNING id, amount_paise, status, provider_order_id`,
        [p.sellerId, input.amountPaise, order.id],
      );
      await audit(client, { sellerId: p.sellerId, actorUserId: p.userId, action: 'wallet.recharge_initiated', targetType: 'wallet_recharge', targetId: result.rows[0].id, requestId: request.id, metadata: { amountPaise: input.amountPaise } });
      return result.rows[0];
    });
    return reply.code(201).send({ rechargeId: row.id, providerOrderId: order.id, amountPaise: order.amountPaise, currency: order.currency, keyId: order.keyId });
  });

  app.get('/v1/wallet/recharges', { preHandler: requireSeller }, async (request) => {
    const p = principal(request);
    return withSellerTransaction(p.sellerId, async (client) => ({
      items: (await client.query('SELECT id, amount_paise, status, provider_order_id, created_at, completed_at FROM wallet_recharges WHERE seller_id=$1 ORDER BY created_at DESC LIMIT 100', [p.sellerId])).rows,
    }));
  });

  // Public endpoint (no session — Razorpay calls this directly), authenticated
  // entirely by HMAC signature over the raw body. Idempotent on provider_order_id
  // so a retried webhook delivery never double-credits the wallet.
  app.post('/v1/webhooks/razorpay', { config: { rawBody: true } }, async (request, reply) => {
    if (!request.rawBody) return reply.code(400).send({ error: 'RAW_WEBHOOK_BODY_REQUIRED' });
    const raw = request.rawBody.toString();
    const signature = request.headers['x-razorpay-signature'];
    if (!verifyRazorpayWebhookSignature(raw, typeof signature === 'string' ? signature : undefined)) {
      return reply.code(401).send({ error: 'INVALID_WEBHOOK_SIGNATURE' });
    }
    const input = razorpayEvent.parse(request.body);
    const payment = input.payload.payment.entity;
    // Logged for admin webhook-delivery visibility, same table couriers use —
    // this is independent of the recharge-status idempotency check below,
    // which remains the actual business-logic guard against double-crediting.
    const delivery = await withTransaction((client) => client.query(
      `INSERT INTO webhook_deliveries (provider_code, external_event_id, payload_hash, payload)
       VALUES ('razorpay', $1, $2, $3) ON CONFLICT (provider_code, external_event_id) DO NOTHING RETURNING id`,
      ['razorpay:' + payment.id, createHash('sha256').update(raw).digest('hex'), JSON.stringify(input)],
    ));
    if (input.event !== 'payment.captured') return { accepted: true, ignored: input.event };
    const result = await withTransaction(async (client) => {
      const recharge = await client.query<{ id: string; seller_id: string; amount_paise: string; status: string }>(
        'SELECT id, seller_id, amount_paise, status FROM wallet_recharges WHERE provider_order_id = $1 FOR UPDATE',
        [payment.order_id],
      );
      if (!recharge.rows[0]) return { matched: false };
      if (recharge.rows[0].status === 'succeeded') return { matched: true, duplicate: true };
      await client.query('SELECT set_config(\'app.seller_id\', $1, true)', [recharge.rows[0].seller_id]);
      await client.query('UPDATE wallet_recharges SET status=\'succeeded\', provider_payment_id=$1, completed_at=now() WHERE id=$2', [payment.id, recharge.rows[0].id]);
      await client.query(
        `INSERT INTO wallet_entries (seller_id, entry_type, amount_paise, reference_type, reference_id, idempotency_key, description)
         VALUES ($1,'credit',$2,'wallet_recharge',$3,$4,'Wallet recharge via Razorpay')
         ON CONFLICT (seller_id, idempotency_key) DO NOTHING`,
        [recharge.rows[0].seller_id, recharge.rows[0].amount_paise, recharge.rows[0].id, `recharge:${recharge.rows[0].id}`],
      );
      await audit(client, { sellerId: recharge.rows[0].seller_id, action: 'wallet.recharge_succeeded', targetType: 'wallet_recharge', targetId: recharge.rows[0].id, requestId: request.id, metadata: { providerPaymentId: payment.id } });
      return { matched: true, duplicate: false };
    });
    if (delivery.rows[0]) {
      await withTransaction((client) => client.query('UPDATE webhook_deliveries SET processed_at=now(), processing_error=$1 WHERE id=$2', [result.matched ? null : 'Recharge not found for this order', delivery.rows[0].id]));
    }
    if (!result.matched) return reply.code(404).send({ error: 'RECHARGE_NOT_FOUND' });
    return { accepted: true, duplicate: result.duplicate ?? false };
  });
}
