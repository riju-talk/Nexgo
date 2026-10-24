// Pure logic behind Admin > Assign courier & rates (components/AdminRateAssign.jsx), kept free of React so it can be unit tested.
// A "slab" is one courier service + one weight band; it holds the five lane zones, each with forward and RTO prices (rupees, as typed).

// The five lane zones the rating engine uses (same names and order as SwiftCourier's rate card).
export const ZONES = [['within_city', 'Within city'], ['within_state', 'Within state'], ['metro_to_metro', 'Metro to metro'], ['rest_of_india', 'Rest of India'], ['ne_jk', 'North-East & J&K']];

export const rupees = (paise) => (paise === null || paise === undefined ? '' : String(Number(paise) / 100));
export const toPaise = (v) => Math.round(Number(v) * 100);
export const kgToG = (v) => Math.round(Number(v) * 1000);

const emptyZone = () => ({ fwdBase: '', fwdAdd: '', rtoBase: '', rtoAdd: '' });
let slabCounter = 0;

// One weight slab of a courier service, built from the stored rows (one row per zone). A card that only has the old single 'national' price fills all five zones with it.
export function slabsFromRates(rates) {
  const byKey = new Map();
  for (const r of rates) {
    const key = `${r.service_id}|${r.min_weight_g}`;
    if (!byKey.has(key)) byKey.set(key, { key: `s${slabCounter++}`, serviceId: r.service_id, minWeightG: r.min_weight_g, baseWeightG: r.base_weight_g, additionalWeightG: r.additional_weight_g, fromKg: String(r.min_weight_g / 1000), baseKg: String(r.base_weight_g / 1000), addKg: String(r.additional_weight_g / 1000), codFee: rupees(r.cod_fee_paise), codPct: String((r.cod_percent_bps || 0) / 100), fuelBps: r.fuel_surcharge_bps || 0, rows: {} });
    byKey.get(key).rows[r.zone_code] = { fwdBase: rupees(r.base_price_paise), fwdAdd: rupees(r.additional_price_paise), rtoBase: rupees(r.rto_base_price_paise), rtoAdd: rupees(r.rto_additional_price_paise) };
  }
  return [...byKey.values()].map((s) => {
    const zones = {};
    for (const [z] of ZONES) zones[z] = s.rows[z] || s.rows.national || emptyZone();
    const { rows, ...rest } = s;
    return { ...rest, zones };
  });
}

export const blankSlab = (serviceId, minWeightG = 0) => ({ key: `s${slabCounter++}`, serviceId, minWeightG, baseWeightG: 500, additionalWeightG: 500, fromKg: String(minWeightG / 1000), baseKg: '0.5', addKg: '0.5', codFee: '', codPct: '', fuelBps: 0, zones: Object.fromEntries(ZONES.map(([z]) => [z, emptyZone()])) });

// Where a configuration's weight band starts when a courier is picked: 0 for the courier's first configuration,
// otherwise 1 g past the heaviest base weight already configured for it: the rating engine uses the band with the highest start the parcel reaches, so a parcel of exactly the base weight must stay in the lighter band.
export function nextSlabStartKg(slabs, key, serviceId) {
  const others = slabs.filter((x) => x.key !== key && x.serviceId === serviceId);
  return others.length ? String((kgToG(Math.max(...others.map((x) => Number(x.baseKg) || 0))) + 1) / 1000) : '0';
}

// First problem found, as a sentence for the admin, or '' when the card can be saved. `services` = [{id, name, provider_name}].
export function validateSlabs(slabs, services) {
  if (!slabs.length) return 'Add at least one rate configuration.';
  const seen = new Set();
  for (const [n, s] of slabs.entries()) {
    const svc = services.find((x) => x.id === s.serviceId);
    if (!svc) return `Rate Configuration #${n + 1}: choose a courier.`;
    const where = `Rate Configuration #${n + 1} (${svc.provider_name} ${svc.name})`;
    if (!(Number(s.baseKg) > 0) || !(Number(s.addKg) > 0)) return `${where}: weight and additional weight must be more than 0.`;
    if (!(Number(s.fromKg) >= 0)) return `${where}: "slab starts at" weight is not a number.`;
    const dup = `${s.serviceId}|${kgToG(s.fromKg)}`;
    if (seen.has(dup)) return `${where}: another configuration already covers this courier from ${s.fromKg} kg (change "Slab starts at" under COD charges and weight slab start).`;
    seen.add(dup);
    for (const [z, label] of ZONES) {
      for (const col of ['fwdBase', 'fwdAdd']) { const v = s.zones[z][col]; if (v === '' || !(Number(v) >= 0)) return `${where}, ${label}: enter the forward ${col === 'fwdBase' ? 'price' : 'additional price'}.`; }
      for (const col of ['rtoBase', 'rtoAdd']) { const v = s.zones[z][col]; if (v !== '' && !(Number(v) >= 0)) return `${where}, ${label}: the RTO price is not a number.`; }
    }
    if (s.codFee !== '' && !(Number(s.codFee) >= 0)) return `${where}: COD charge is not a number.`;
    if (s.codPct !== '' && !(Number(s.codPct) >= 0 && Number(s.codPct) <= 100)) return `${where}: COD % must be between 0 and 100.`;
  }
  return '';
}

// Body rows for POST /v1/admin/sellers/:id/rate-cards: one per slab x zone, plus the couriers that get switched on for the seller.
export function buildRatePayload(slabs, offered, services) {
  const used = new Set(slabs.map((x) => x.serviceId));
  const access = services.filter((s) => used.has(s.id)).map((s) => ({ serviceId: s.id, codEnabled: !!offered[s.id]?.cod }));
  const rates = [];
  for (const s of slabs) {
    for (const [z] of ZONES) {
      const c = s.zones[z];
      rates.push({ serviceId: s.serviceId, zoneCode: z, minWeightG: kgToG(s.fromKg) || 0, baseWeightG: kgToG(s.baseKg), basePricePaise: toPaise(c.fwdBase), additionalWeightG: kgToG(s.addKg), additionalPricePaise: toPaise(c.fwdAdd),
        codFeePaise: s.codFee === '' ? 0 : toPaise(s.codFee), codPercentBps: s.codPct === '' ? 0 : Math.round(Number(s.codPct) * 100), fuelSurchargeBps: s.fuelBps || 0,
        rtoBasePricePaise: c.rtoBase === '' ? null : toPaise(c.rtoBase), rtoAdditionalPricePaise: c.rtoAdd === '' ? null : toPaise(c.rtoAdd) });
    }
  }
  return { rates, access, used };
}
