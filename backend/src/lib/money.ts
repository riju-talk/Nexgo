export function paiseToAmount(paise: number) {
  return Number((paise / 100).toFixed(2));
}

export type RateRow = {
  base_weight_g: number;
  base_price_paise: number;
  additional_weight_g: number;
  additional_price_paise: number;
  cod_fee_paise: number;
  fuel_surcharge_bps: number;
  cod_percent_bps?: number;
  rto_base_price_paise?: number | null;
  rto_additional_price_paise?: number | null;
};

export const GST_BPS = 1800; // 18% GST on freight and COD, invoiced after the shipment (the wallet debit is pre-GST)

// Slab maths: the matched slab's base price covers base_weight_g, every started additional slab adds one
// additional price. COD is the greater of the flat fee and a percentage of the order value.
export function calculateRate(rate: RateRow, weightG: number, isCod: boolean, orderValuePaise = 0) {
  const extraWeight = Math.max(0, weightG - rate.base_weight_g);
  const extraSlabs = Math.ceil(extraWeight / rate.additional_weight_g);
  const transportPaise = rate.base_price_paise + extraSlabs * rate.additional_price_paise;
  const fuelSurchargePaise = Math.round((transportPaise * rate.fuel_surcharge_bps) / 10_000);
  const codPercentPaise = Math.round((orderValuePaise * (rate.cod_percent_bps ?? 0)) / 10_000);
  const codFeePaise = isCod ? Math.max(rate.cod_fee_paise, codPercentPaise) : 0;
  const totalPaise = transportPaise + fuelSurchargePaise + codFeePaise;
  const gstPaise = Math.round((totalPaise * GST_BPS) / 10_000);
  const rtoTransportPaise = (rate.rto_base_price_paise ?? rate.base_price_paise) + extraSlabs * (rate.rto_additional_price_paise ?? rate.additional_price_paise);
  const rtoFuelPaise = Math.round((rtoTransportPaise * rate.fuel_surcharge_bps) / 10_000);
  const rtoPaise = rtoTransportPaise + rtoFuelPaise;
  const rtoGstPaise = Math.round((rtoPaise * GST_BPS) / 10_000);
  return { transportPaise, fuelSurchargePaise, codFeePaise, extraSlabs, totalPaise, gstPaise, totalWithGstPaise: totalPaise + gstPaise, rtoPaise, rtoGstPaise, rtoWithGstPaise: rtoPaise + rtoGstPaise };
}

// Couriers bill the greater of dead and volumetric weight. Volumetric kg is
// L×W×H (cm³) / 5000, which in grams works out to L×W×H (mm³) / 5000.
export const VOLUMETRIC_DIVISOR = 5000;

export function volumetricWeightG(lengthMm: number, widthMm: number, heightMm: number) {
  return Math.ceil((lengthMm * widthMm * heightMm) / VOLUMETRIC_DIVISOR);
}
