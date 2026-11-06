import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db, withTransaction } from '../db/client.js';
import { audit } from '../lib/audit.js';
import { requireCommercialAdmin, requirePlatformAdmin } from '../lib/adminAuth.js';
import { applyEvent, type Mapped } from '../lib/trackingIngest.js';

/**
 * Test tools for QA accounts.
 *  - The Sandbox courier books through the in-process mock adapter: instant, no real shipment, no real cost (₹1 flat in the seller's wallet so
 *    the wallet maths can still be checked). A seller sees it only while its rate card has rates for it; an admin switches that here.
 *  - A sandbox shipment can be moved through the courier lifecycle by hand, so delivered / NDR / RTO / COD remittance can be tested without
 *    waiting for a real parcel. Real courier shipments are refused here.
 */
const ZONES = ['within_city', 'within_state', 'metro_to_metro', 'rest_of_india', 'ne_jk'];
const sellerParam = (request: { params: unknown }) => z.string().uuid().parse((request.params as { sellerId: string }).sellerId);

const SIMULATED: Record<string, { mapped: Mapped; text: string }> = {
  picked_up: { mapped: { state: 'in_transit' }, text: 'Picked up by the courier (simulated)' },
  in_transit: { mapped: { state: 'in_transit' }, text: 'In transit (simulated)' },
  out_for_delivery: { mapped: { state: 'out_for_delivery' }, text: 'Out for delivery (simulated)' },
  delivered: { mapped: { state: 'delivered' }, text: 'Delivered (simulated)' },
  ndr: { mapped: { state: 'ndr' }, text: 'Delivery attempt failed: customer not available (simulated)' },
  rto_initiated: { mapped: { state: 'rto' }, text: 'Return to origin started (simulated)' },
  rto_delivered: { mapped: { state: 'rto', rto: 'delivered' }, text: 'Returned to the seller (simulated)' },
};

export async function adminSandboxRoutes(app: FastifyInstance) {
  app.get('/v1/admin/sellers/:sellerId/sandbox', { preHandler: requirePlatformAdmin }, async (request) => {
    const sellerId = sellerParam(request);
    const state = await db.query<{ enabled: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM seller_courier_access a JOIN courier_services cs ON cs.id = a.service_id JOIN courier_providers cp ON cp.id = cs.provider_id
                      WHERE a.seller_id = $1 AND cp.code = 'sandbox' AND a.state = 'enabled') AS enabled`, [sellerId]);
    const shipments = await db.query(
      `SELECT s.id, s.awb, s.state::text AS state, o.order_number, o.payment_mode
       FROM shipments s JOIN courier_providers cp ON cp.id = s.provider_id JOIN orders o ON o.id = s.order_id
       WHERE s.seller_id = $1 AND cp.code = 'sandbox' ORDER BY s.booked_at DESC LIMIT 25`, [sellerId]);
    return { enabled: state.rows[0]?.enabled ?? false, shipments: shipments.rows };
  });

  app.post('/v1/admin/sellers/:sellerId/sandbox', { preHandler: [requirePlatformAdmin, requireCommercialAdmin] }, async (request, reply) => {
    const sellerId = sellerParam(request);
    const { enabled } = z.object({ enabled: z.boolean() }).parse(request.body);
    const result = await withTransaction(async (client) => {
      const service = (await client.query<{ id: string }>(`SELECT cs.id FROM courier_services cs JOIN courier_providers cp ON cp.id = cs.provider_id WHERE cp.code = 'sandbox' AND cs.code = 'sandbox-surface'`)).rows[0];
      if (!service) return { error: 'SANDBOX_NOT_INSTALLED' as const };
      const card = (await client.query<{ id: string }>(`SELECT id FROM rate_cards WHERE seller_id = $1 AND state = 'active' ORDER BY effective_from DESC, created_at DESC LIMIT 1`, [sellerId])).rows[0];
      if (enabled) {
        if (!card) return { error: 'NO_RATE_CARD' as const };
        await client.query(
          `INSERT INTO seller_courier_access (seller_id, service_id, account_mode, state, cod_enabled, auto_assign_eligible) VALUES ($1, $2, 'platform', 'enabled', true, true)
           ON CONFLICT (seller_id, service_id) DO UPDATE SET state = 'enabled', cod_enabled = true, auto_assign_eligible = true, updated_at = now()`, [sellerId, service.id]);
        for (const zone of ZONES) {
          await client.query(
            `INSERT INTO rate_card_rates (rate_card_id, service_id, zone_code, min_weight_g, base_weight_g, base_price_paise, additional_weight_g, additional_price_paise, cod_fee_paise, fuel_surcharge_bps, cod_percent_bps, rto_base_price_paise, rto_additional_price_paise)
             VALUES ($1, $2, $3, 0, 500, 100, 500, 100, 0, 0, 0, 100, 100)
             ON CONFLICT (rate_card_id, service_id, zone_code, min_weight_g) DO UPDATE SET base_price_paise = 100, additional_price_paise = 100`, [card.id, service.id, zone]);
        }
      } else {
        await client.query(`UPDATE seller_courier_access SET state = 'disabled', updated_at = now() WHERE seller_id = $1 AND service_id = $2`, [sellerId, service.id]);
        await client.query(`DELETE FROM rate_card_rates WHERE service_id = $1 AND rate_card_id IN (SELECT id FROM rate_cards WHERE seller_id = $2)`, [service.id, sellerId]);
      }
      await audit(client, { sellerId, actorUserId: request.adminPrincipal!.userId, action: enabled ? 'seller.sandbox_courier_enabled' : 'seller.sandbox_courier_disabled', targetType: 'seller', targetId: sellerId, requestId: request.id });
      return { ok: true as const };
    });
    if ('error' in result) return reply.code(409).send({ error: result.error, message: result.error === 'NO_RATE_CARD' ? 'This seller has no active rate card yet. Assign courier & rates first.' : 'The sandbox courier is not installed. Apply the latest migrations.' });
    return { enabled };
  });

  // Move one sandbox shipment forward by hand (delivered, NDR, RTO ...). Same code path as a real courier update.
  app.post('/v1/admin/shipments/:shipmentId/simulate', { preHandler: requirePlatformAdmin }, async (request, reply) => {
    const shipmentId = z.string().uuid().parse((request.params as { shipmentId: string }).shipmentId);
    const { event } = z.object({ event: z.enum(Object.keys(SIMULATED) as [string, ...string[]]) }).parse(request.body);
    const sim = SIMULATED[event];
    const outcome = await withTransaction(async (client) => {
      const found = await client.query<{ id: string; seller_id: string; state: 'booked'; code: string }>(
        `SELECT s.id, s.seller_id, s.state::text AS state, cp.code FROM shipments s JOIN courier_providers cp ON cp.id = s.provider_id WHERE s.id = $1 FOR UPDATE OF s`, [shipmentId]);
      const row = found.rows[0];
      if (!row) return 'missing' as const;
      if (row.code !== 'sandbox') return 'not_sandbox' as const;
      await applyEvent(client, { id: row.id, seller_id: row.seller_id, state: row.state }, sim.mapped, new Date().toISOString(), 'Sandbox', sim.text, `sim:${Date.now()}:${event}`, { simulated: true, by: request.adminPrincipal!.userId });
      await audit(client, { sellerId: row.seller_id, actorUserId: request.adminPrincipal!.userId, action: 'shipment.event_simulated', targetType: 'shipment', targetId: row.id, requestId: request.id, metadata: { event } });
      return 'ok' as const;
    });
    if (outcome === 'missing') return reply.code(404).send({ error: 'SHIPMENT_NOT_FOUND' });
    if (outcome === 'not_sandbox') return reply.code(422).send({ error: 'NOT_A_SANDBOX_SHIPMENT', message: 'Only shipments booked with the Sandbox courier can be simulated.' });
    const now = await db.query<{ state: string }>('SELECT state::text AS state FROM shipments WHERE id = $1', [shipmentId]);
    return { state: now.rows[0]?.state };
  });
}
