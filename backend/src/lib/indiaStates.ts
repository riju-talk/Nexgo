// Indian states and union territories: one spelling everywhere (the same names the pincode directory uses).
// Sellers type "WB", "Orissa", "Jammu & Kashmir" or "NCT of Delhi"; all of them must mean the state the pincode says.
const STATES = [
  'Andaman and Nicobar Islands', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chandigarh', 'Chhattisgarh',
  'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jammu and Kashmir', 'Jharkhand',
  'Karnataka', 'Kerala', 'Ladakh', 'Lakshadweep', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha',
  'Puducherry', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
] as const;

// Two-letter codes (the vehicle / postal style used on invoices and marketplaces) and older or common alternative spellings.
const ALIASES: Record<string, string> = {
  an: 'Andaman and Nicobar Islands', ap: 'Andhra Pradesh', ar: 'Arunachal Pradesh', as: 'Assam', br: 'Bihar', ch: 'Chandigarh', cg: 'Chhattisgarh', ct: 'Chhattisgarh',
  dn: 'Dadra and Nagar Haveli and Daman and Diu', dd: 'Dadra and Nagar Haveli and Daman and Diu', dh: 'Dadra and Nagar Haveli and Daman and Diu',
  dl: 'Delhi', ga: 'Goa', gj: 'Gujarat', hr: 'Haryana', hp: 'Himachal Pradesh', jk: 'Jammu and Kashmir', jh: 'Jharkhand', ka: 'Karnataka', kl: 'Kerala',
  la: 'Ladakh', ld: 'Lakshadweep', mp: 'Madhya Pradesh', mh: 'Maharashtra', mn: 'Manipur', ml: 'Meghalaya', mz: 'Mizoram', nl: 'Nagaland',
  od: 'Odisha', or: 'Odisha', py: 'Puducherry', pb: 'Punjab', rj: 'Rajasthan', sk: 'Sikkim', tn: 'Tamil Nadu', ts: 'Telangana', tg: 'Telangana', tr: 'Tripura',
  up: 'Uttar Pradesh', uk: 'Uttarakhand', ua: 'Uttarakhand', wb: 'West Bengal',
  orissa: 'Odisha', pondicherry: 'Puducherry', uttaranchal: 'Uttarakhand', telengana: 'Telangana', bengal: 'West Bengal', 'new delhi': 'Delhi', 'nct of delhi': 'Delhi',
  'national capital territory of delhi': 'Delhi', 'andaman nicobar': 'Andaman and Nicobar Islands', 'andaman and nicobar': 'Andaman and Nicobar Islands',
  'daman and diu': 'Dadra and Nagar Haveli and Daman and Diu', 'dadra and nagar haveli': 'Dadra and Nagar Haveli and Daman and Diu',
  'dadra nagar haveli': 'Dadra and Nagar Haveli and Daman and Diu', 'dadra and nagar haveli and daman and diu': 'Dadra and Nagar Haveli and Daman and Diu',
  chattisgarh: 'Chhattisgarh', 'tamilnadu': 'Tamil Nadu', 'jammu kashmir': 'Jammu and Kashmir', 'j and k': 'Jammu and Kashmir',
};

const key = (s: string) => s.toLowerCase().replace(/\./g, '').replace(/&/g, ' and ').replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
const BY_KEY = new Map<string, string>([...STATES.map((s) => [key(s), s] as [string, string]), ...Object.entries(ALIASES)]);

/** The standard name of a state or union territory, whatever way it was typed ("WB", "orissa", "Jammu & Kashmir"). Unknown text is returned trimmed, unchanged. */
export function normalizeState(input: string): string {
  const text = String(input ?? '').trim();
  return BY_KEY.get(key(text)) ?? text;
}

/** True when two spellings name the same state. */
export const sameState = (a: string, b: string) => normalizeState(a).toLowerCase() === normalizeState(b).toLowerCase();
