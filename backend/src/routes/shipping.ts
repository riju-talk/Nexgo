import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { withSellerTransaction } from '../db/client.js';
import { calculateRate, paiseToAmount, volumetricWeightG, type RateRow } from '../lib/money.js';
import { laneZone, ZONE_LABEL } from '../lib/zone.js';
import { deliveryWindow, serviceabilityReason, type PincodeInfo } from '../lib/serviceability.js';
import { requireSeller } from './seller.js';

const pincode = z.string().regex(/^\d{6}$/);
const quoteInput = z.object({
  destinationPincode: pincode,
  pickupPincode: pincode.optional(),
  // Ignored when both pincodes are known: the zone is derived from the lane (see lib/zone.ts).
  zoneCode: z.string().min(2).max(40).default('national'),
  orderValue: z.number().min(0).max(10_000_000).default(0),
  weightG: z.number().int().min(1).max(50_000),
  paymentMode: z.enum(['prepaid', 'cod']).default('prepaid'),
  // Optional parcel dimensions; when present the quote bills max(dead, volumetric).
  lengthMm: z.number().int().min(10).max(5_000).optional(),
  widthMm: z.number().int().min(10).max(5_000).optional(),
  heightMm: z.number().int().min(10).max(5_000).optional(),
});
const serviceabilityInput = z.object({ pickupPincode: pincode, deliveryPincode: pincode, weightG: z.number().int().min(1).max(50_000), paymentMode: z.enum(['prepaid', 'cod']).optional(), orderValue: z.number().min(0).max(10_000_000).default(0) });

type OptionRow = {
  provider_code: string; provider_name: string; supports_cod: boolean; service_code: string; service_name: string; service_type: string;
  typical_delivery_days: number | null; max_delivery_days: number | null; serves_oda: boolean; delivery_tagline: string | null;
  account_mode: 'platform' | 'seller_owned'; cod_enabled: boolean;
  base_weight_g: number | null; base_price_paise: number | null; additional_weight_g: number | null; additional_price_paise: number | null; cod_fee_paise: number | null; fuel_surcharge_bps: number | null;
  cod_percent_bps: number | null; rto_base_price_paise: number | null; rto_additional_price_paise: number | null;
  blocked: boolean; has_allow: boolean; allow_match: boolean;
};

async function pincodeInfo(client: PoolClient, code?: string): Promise<PincodeInfo | null> {
  if (!code) return null;
  return (await client.query<PincodeInfo>('SELECT pincode, city, state, zone, cod_available, is_oda, is_active FROM pincodes WHERE pincode=$1', [code])).rows[0] ?? null;
}

// Every enabled courier service for the seller with its rate row (if any) and the pincode rule flags for one destination.
async function loadOptions(client: PoolClient, sellerId: string, destination: string, zoneCode: string, chargeableG: number) {
  const result = await client.query<OptionRow>(
    `SELECT cp.code AS provider_code, cp.name AS provider_name, cp.supports_cod, cs.code AS service_code, cs.display_name AS service_name, cs.service_type,
            cs.typical_delivery_days, cs.max_delivery_days, cs.serves_oda, cs.delivery_tagline, sca.account_mode, sca.cod_enabled,
            rcr.base_weight_g, rcr.base_price_paise, rcr.additional_weight_g, rcr.additional_price_paise, rcr.cod_fee_paise, rcr.fuel_surcharge_bps, rcr.cod_percent_bps, rcr.rto_base_price_paise, rcr.rto_additional_price_paise,
            EXISTS (SELECT 1 FROM courier_pincode_rules r WHERE r.service_id = cs.id AND r.rule_type = 'blocked' AND $4 LIKE r.destination_prefix || '%') AS blocked,
            EXISTS (SELECT 1 FROM courier_pincode_rules r WHERE r.service_id = cs.id AND r.rule_type = 'allowed') AS has_allow,
            EXISTS (SELECT 1 FROM courier_pincode_rules r WHERE r.service_id = cs.id AND r.rule_type = 'allowed' AND $4 LIKE r.destination_prefix || '%') AS allow_match
     FROM seller_courier_access sca
     JOIN courier_services cs ON cs.id = sca.service_id AND cs.is_active
     JOIN courier_providers cp ON cp.id = cs.provider_id AND cp.integration_state = 'live'
     LEFT JOIN LATERAL (
       SELECT id FROM rate_cards WHERE seller_id = sca.seller_id AND state = 'active' AND effective_from <= now() AND (effective_to IS NULL OR effective_to > now())
       ORDER BY effective_from DESC LIMIT 1
     ) card ON true
     LEFT JOIN LATERAL (
       SELECT * FROM rate_card_rates r WHERE r.rate_card_id = card.id AND r.service_id = sca.service_id AND r.zone_code IN ($2, 'national') AND r.min_weight_g <= $3
       ORDER BY (r.zone_code = $2) DESC, r.min_weight_g DESC LIMIT 1
     ) rcr ON true
     WHERE sca.seller_id = $1 AND sca.state = 'enabled'
     ORDER BY cp.name, cs.display_name`,
    [sellerId, zoneCode, chargeableG, destination],
  );
  return result.rows;
}

function describe(row: OptionRow, dest: PincodeInfo | null, pickup: PincodeInfo | null, chargeableG: number, cod: boolean, orderValuePaise = 0) {
  const hasRate = row.base_price_paise !== null;
  const reason = serviceabilityReason({ blocked: row.blocked, hasAllow: row.has_allow, allowMatch: row.allow_match, servesOda: row.serves_oda, courierCod: row.cod_enabled && row.supports_cod, hasRate }, dest, cod);
  const codAvailable = row.cod_enabled && row.supports_cod && (dest?.cod_available ?? true);
  const pricing = hasRate ? calculateRate(row as unknown as RateRow, chargeableG, cod, orderValuePaise) : null;
  const window = deliveryWindow({ typical: row.typical_delivery_days, max: row.max_delivery_days }, dest, pickup);
  return {
    provider: { code: row.provider_code, name: row.provider_name },
    service: { code: row.service_code, name: row.service_name, type: row.service_type, tagline: row.delivery_tagline },
    accountMode: row.account_mode,
    serviceable: reason === null,
    reason,
    codAvailable,
    // The fee this courier would charge for COD: the priced amount on a COD parcel, otherwise its flat fee (shown as "COD available (₹x)").
    codFee: paiseToAmount(cod ? (pricing?.codFeePaise ?? 0) : (row.cod_fee_paise ?? 0)),
    tat: { minDays: window.minDays, maxDays: window.maxDays, earliest: window.earliest, latest: window.latest },
    currency: 'INR' as const,
    price: pricing ? { transport: paiseToAmount(pricing.transportPaise), fuelSurcharge: paiseToAmount(pricing.fuelSurchargePaise), freight: paiseToAmount(pricing.transportPaise + pricing.fuelSurchargePaise), codFee: paiseToAmount(pricing.codFeePaise), additionalSlabs: pricing.extraSlabs, total: paiseToAmount(pricing.totalPaise), gst: paiseToAmount(pricing.gstPaise), totalWithGst: paiseToAmount(pricing.totalWithGstPaise), rto: paiseToAmount(pricing.rtoPaise), rtoGst: paiseToAmount(pricing.rtoGstPaise), rtoWithGst: paiseToAmount(pricing.rtoWithGstPaise) } : null,
  };
}

const place = (p: PincodeInfo | null, code: string) => ({ pincode: code, city: p?.city ?? null, state: p?.state ?? null, zone: p?.zone ?? null, known: !!p, codAvailable: p?.cod_available ?? null, outOfDeliveryArea: p?.is_oda ?? null });

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

  // Priced, bookable options for one parcel: only couriers that can actually ship it.
  app.post('/v1/shipping/quotes', { preHandler: requireSeller }, async (request: FastifyRequest) => {
    const input = quoteInput.parse(request.body);
    const { sellerId } = request.principal!;
    const isCod = input.paymentMode === 'cod';
    const volumetricG = input.lengthMm && input.widthMm && input.heightMm ? volumetricWeightG(input.lengthMm, input.widthMm, input.heightMm) : 0;
    const chargeableG = Math.max(input.weightG, volumetricG);
    return withSellerTransaction(sellerId, async (client) => {
      const [dest, pickup] = await Promise.all([pincodeInfo(client, input.destinationPincode), pincodeInfo(client, input.pickupPincode)]);
      const zone = pickup && dest ? laneZone(pickup, dest) : input.zoneCode;
      const rows = await loadOptions(client, sellerId, input.destinationPincode, zone, chargeableG);
      const options = rows.map((row) => describe(row, dest, pickup, chargeableG, isCod, Math.round(input.orderValue * 100)));
      const quotes = options.filter((o) => o.serviceable && o.price).sort((a, b) => a.price!.total - b.price!.total);
      const fastest = quotes.reduce<typeof quotes[number] | null>((best, q) => (!best || q.tat.minDays < best.tat.minDays || (q.tat.minDays === best.tat.minDays && q.price!.total < best.price!.total) ? q : best), null);
      const tagged = quotes.map((q, i) => ({ ...q, tags: [...(i === 0 ? ['cheapest'] : []), ...(q === fastest ? ['fastest'] : [])] }));
      return {
        destinationPincode: input.destinationPincode, destination: place(dest, input.destinationPincode), pickup: input.pickupPincode ? place(pickup, input.pickupPincode) : null,
        zone, zoneLabel: ZONE_LABEL[zone as keyof typeof ZONE_LABEL] ?? zone, gstPercent: 18,
        deadWeightG: input.weightG, volumetricWeightG: volumetricG, chargeableWeightG: chargeableG, paymentMode: input.paymentMode,
        quotes: tagged, unavailable: options.filter((o) => !o.serviceable).map((o) => ({ provider: o.provider, service: o.service, reason: o.reason })),
      };
    });
  });

  // Coverage view: every enabled courier for a pickup → delivery lane, serviceable or not, with the reason.
  app.post('/v1/shipping/serviceability', { preHandler: requireSeller }, async (request: FastifyRequest) => {
    const input = serviceabilityInput.parse(request.body);
    const { sellerId } = request.principal!;
    return withSellerTransaction(sellerId, async (client) => {
      const [dest, pickup] = await Promise.all([pincodeInfo(client, input.deliveryPincode), pincodeInfo(client, input.pickupPincode)]);
      const zone = laneZone(pickup, dest);
      const rows = await loadOptions(client, sellerId, input.deliveryPincode, zone, input.weightG);
      const items = rows.map((row) => describe(row, dest, pickup, input.weightG, input.paymentMode === 'cod', Math.round(input.orderValue * 100)));
      const ok = items.filter((i) => i.serviceable);
      const fastest = ok.length ? ok.reduce((a, b) => (b.tat.minDays < a.tat.minDays ? b : a)) : null;
      return {
        zone, zoneLabel: ZONE_LABEL[zone], pickup: place(pickup, input.pickupPincode), delivery: place(dest, input.deliveryPincode), weightG: input.weightG,
        serviceable: ok.length > 0, items,
        summary: { totalCouriers: items.length, serviceableCount: ok.length, codCount: ok.filter((i) => i.codAvailable).length, fastest: fastest ? { courier: fastest.provider.name, minDays: fastest.tat.minDays, maxDays: fastest.tat.maxDays } : null },
      };
    });
  });
}
