import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { withSellerTransaction } from '../db/client.js';
import { calculateRate, paiseToAmount, volumetricWeightG } from '../lib/money.js';
import { requireSeller } from './seller.js';

const quoteInput = z.object({
  destinationPincode: z.string().regex(/^\d{6}$/),
  zoneCode: z.string().min(2).max(40).default('national'),
  weightG: z.number().int().min(1).max(50_000),
  paymentMode: z.enum(['prepaid', 'cod']).default('prepaid'),
  // Optional parcel dimensions; when present the quote bills max(dead, volumetric).
  lengthMm: z.number().int().min(10).max(5_000).optional(),
  widthMm: z.number().int().min(10).max(5_000).optional(),
  heightMm: z.number().int().min(10).max(5_000).optional(),
});

type RateRow = {
  provider_code: string; provider_name: string; service_code: string; service_name: string;
  account_mode: 'platform' | 'seller_owned'; cod_enabled: boolean; base_weight_g: number;
  base_price_paise: number; additional_weight_g: number; additional_price_paise: number;
  cod_fee_paise: number; fuel_surcharge_bps: number;
};

export async function shippingRoutes(app: FastifyInstance) {
  app.get('/v1/shipping/courier-options', { preHandler: requireSeller }, async (request: FastifyRequest) => {
    const { sellerId } = request.principal!;
    return withSellerTransaction(sellerId, async (client) => {
      const result = await client.query(
        `SELECT cp.code, cp.name, cs.code AS service_code, cs.display_name, sca.account_mode,
                sca.cod_enabled, sca.auto_assign_eligible
         FROM seller_courier_access sca
         JOIN courier_services cs ON cs.id = sca.service_id AND cs.is_active
         JOIN courier_providers cp ON cp.id = cs.provider_id AND cp.integration_state = 'live'
         WHERE sca.seller_id = $1 AND sca.state = 'enabled'
         ORDER BY cp.name, cs.display_name`, [sellerId]);
      return { items: result.rows };
    });
  });

  app.post('/v1/shipping/quotes', { preHandler: requireSeller }, async (request: FastifyRequest) => {
    const input = quoteInput.parse(request.body);
    const { sellerId } = request.principal!;
    const isCod = input.paymentMode === 'cod';
    const volumetricG = input.lengthMm && input.widthMm && input.heightMm ? volumetricWeightG(input.lengthMm, input.widthMm, input.heightMm) : 0;
    const chargeableG = Math.max(input.weightG, volumetricG);
    return withSellerTransaction(sellerId, async (client) => {
      const result = await client.query<RateRow>(
        `SELECT cp.code AS provider_code, cp.name AS provider_name, cs.code AS service_code,
                cs.display_name AS service_name, sca.account_mode, sca.cod_enabled,
                rcr.base_weight_g, rcr.base_price_paise, rcr.additional_weight_g,
                rcr.additional_price_paise, rcr.cod_fee_paise, rcr.fuel_surcharge_bps
         FROM seller_courier_access sca
         JOIN courier_services cs ON cs.id = sca.service_id AND cs.is_active
         JOIN courier_providers cp ON cp.id = cs.provider_id AND cp.integration_state = 'live'
         JOIN LATERAL (
           SELECT id FROM rate_cards
           WHERE seller_id = sca.seller_id AND state = 'active'
             AND effective_from <= now() AND (effective_to IS NULL OR effective_to > now())
           ORDER BY effective_from DESC LIMIT 1
         ) current_rate_card ON true
         JOIN rate_cards rc ON rc.id = current_rate_card.id
         JOIN rate_card_rates rcr ON rcr.rate_card_id = rc.id AND rcr.service_id = sca.service_id
              AND rcr.zone_code IN ($2, 'national') AND rcr.min_weight_g <= $3
         WHERE sca.seller_id = $1 AND sca.state = 'enabled'
           AND ($4 = false OR sca.cod_enabled = true)
           AND NOT EXISTS (SELECT 1 FROM courier_pincode_rules blocked WHERE blocked.service_id = cs.id AND blocked.rule_type = 'blocked' AND $5 LIKE blocked.destination_prefix || '%')
           AND (NOT EXISTS (SELECT 1 FROM courier_pincode_rules allowed WHERE allowed.service_id = cs.id AND allowed.rule_type = 'allowed') OR EXISTS (SELECT 1 FROM courier_pincode_rules allowed WHERE allowed.service_id = cs.id AND allowed.rule_type = 'allowed' AND $5 LIKE allowed.destination_prefix || '%'))
         ORDER BY (rcr.zone_code = $2) DESC, rcr.min_weight_g DESC`,
        [sellerId, input.zoneCode, chargeableG, isCod, input.destinationPincode],
      );
      const unique = new Map<string, RateRow>();
      for (const row of result.rows) unique.set(`${row.provider_code}:${row.service_code}`, row);
      const quotes = [...unique.values()].map((row) => {
        const pricing = calculateRate(row, chargeableG, isCod);
        return {
          provider: { code: row.provider_code, name: row.provider_name },
          service: { code: row.service_code, name: row.service_name },
          accountMode: row.account_mode,
          currency: 'INR',
          price: { transport: paiseToAmount(pricing.transportPaise), fuelSurcharge: paiseToAmount(pricing.fuelSurchargePaise), codFee: paiseToAmount(pricing.codFeePaise), total: paiseToAmount(pricing.totalPaise) },
        };
      }).sort((a, b) => a.price.total - b.price.total);
      return { destinationPincode: input.destinationPincode, deadWeightG: input.weightG, volumetricWeightG: volumetricG, chargeableWeightG: chargeableG, quotes };
    });
  });
}
