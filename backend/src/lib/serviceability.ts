// Shared pincode + delivery-window logic used by quotes, the serviceability check and booking.

export type PincodeInfo = { pincode: string; city: string; state: string; zone: 'metro' | 'tier1' | 'tier2' | 'remote'; cod_available: boolean; is_oda: boolean; is_active: boolean };

const ZONE_EXTRA_DAYS: Record<PincodeInfo['zone'], number> = { metro: 0, tier1: 0, tier2: 1, remote: 2 };

const dayLabel = (d: Date) => d.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'Asia/Kolkata' });

// Courier's base window, stretched for harder destination zones and shortened for same-city lanes.
export function deliveryWindow(base: { typical: number | null; max: number | null }, dest: PincodeInfo | null, pickup: PincodeInfo | null, now = new Date()) {
  const typical = base.typical ?? 3;
  const max = Math.max(base.max ?? typical + 2, typical);
  const extra = ZONE_EXTRA_DAYS[dest?.zone ?? 'tier2'];
  const sameCity = !!(dest && pickup && dest.city === pickup.city && dest.state === pickup.state);
  const minDays = Math.max(1, typical + extra - (sameCity ? 1 : 0));
  const maxDays = Math.max(minDays, max + extra - (sameCity ? 1 : 0));
  const add = (days: number) => { const d = new Date(now); d.setDate(d.getDate() + 1 + days); return d; }; // pickup next day
  return { minDays, maxDays, earliest: dayLabel(add(minDays)), latest: dayLabel(add(maxDays)), sameCity };
}

export type ServiceCheck = { blocked: boolean; hasAllow: boolean; allowMatch: boolean; servesOda: boolean; courierCod: boolean; hasRate: boolean };

// Returns why a courier service cannot ship this parcel, or null when it can.
export function serviceabilityReason(check: ServiceCheck, dest: PincodeInfo | null, cod: boolean): string | null {
  if (dest && !dest.is_active) return 'Pincode is currently suspended';
  if (check.blocked || (check.hasAllow && !check.allowMatch)) return 'Courier does not deliver to this area';
  if (dest?.is_oda && !check.servesOda) return 'Out of delivery area for this courier';
  if (!check.hasRate) return 'No rate configured for this weight';
  if (cod && !(check.courierCod && (dest?.cod_available ?? true))) return 'COD is not available here (prepaid only)';
  return null;
}
