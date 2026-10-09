// Shipping zone for a pickup → delivery lane, derived from the pincode directory (city/state).
// Same rules and order as the SwiftCourier rate calculator, so rate-card rows keyed by zone line up.

export type LaneZone = 'within_city' | 'metro_to_metro' | 'ne_jk' | 'within_state' | 'rest_of_india';

export const LANE_ZONES: LaneZone[] = ['within_city', 'within_state', 'metro_to_metro', 'rest_of_india', 'ne_jk'];

export const ZONE_LABEL: Record<LaneZone, string> = {
  within_city: 'Within city', within_state: 'Within state', metro_to_metro: 'Metro to metro', rest_of_india: 'Rest of India', ne_jk: 'North-East & J&K',
};

const METROS = ['delhi', 'mumbai', 'kolkata', 'calcutta', 'chennai', 'bengaluru', 'bangalore', 'hyderabad'];
const NE_JK = new Set(['assam', 'arunachal pradesh', 'manipur', 'meghalaya', 'mizoram', 'nagaland', 'tripura', 'sikkim', 'jammu and kashmir']);

const norm = (s: string) => s.trim().toLowerCase().replace(/&/g, 'and').replace(/\s+/g, ' ');
const isMetro = (city: string) => METROS.some((m) => city.includes(m));

type Place = { city: string; state: string };

export function laneZone(pickup: Place | null | undefined, dest: Place | null | undefined): LaneZone {
  if (!pickup || !dest) return 'rest_of_india';
  const [pc, dc, ps, ds] = [norm(pickup.city), norm(dest.city), norm(pickup.state), norm(dest.state)];
  if (pc === dc) return 'within_city';
  if (isMetro(pc) && isMetro(dc)) return 'metro_to_metro';
  if (NE_JK.has(ps) || NE_JK.has(ds)) return 'ne_jk';
  if (ps === ds) return 'within_state';
  return 'rest_of_india';
}
