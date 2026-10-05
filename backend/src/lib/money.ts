export function paiseToAmount(paise: number) {
  return Number((paise / 100).toFixed(2));
}

export function calculateRate(rate: {
  base_weight_g: number;
  base_price_paise: number;
  additional_weight_g: number;
  additional_price_paise: number;
  cod_fee_paise: number;
  fuel_surcharge_bps: number;
}, weightG: number, isCod: boolean) {
  const extraWeight = Math.max(0, weightG - rate.base_weight_g);
  const extraSlabs = Math.ceil(extraWeight / rate.additional_weight_g);
  const transportPaise = rate.base_price_paise + extraSlabs * rate.additional_price_paise;
  const fuelSurchargePaise = Math.round((transportPaise * rate.fuel_surcharge_bps) / 10_000);
  const codFeePaise = isCod ? rate.cod_fee_paise : 0;
  return { transportPaise, fuelSurchargePaise, codFeePaise, totalPaise: transportPaise + fuelSurchargePaise + codFeePaise };
}

// Couriers bill the greater of dead and volumetric weight. Volumetric kg is
// L×W×H (cm³) / 5000, which in grams works out to L×W×H (mm³) / 5000.
export const VOLUMETRIC_DIVISOR = 5000;

export function volumetricWeightG(lengthMm: number, widthMm: number, heightMm: number) {
  return Math.ceil((lengthMm * widthMm * heightMm) / VOLUMETRIC_DIVISOR);
}
