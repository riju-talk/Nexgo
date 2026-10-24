import test from 'node:test';
import assert from 'node:assert/strict';
import { ZONES, slabsFromRates, blankSlab, nextSlabStartKg, validateSlabs, buildRatePayload, toPaise, kgToG, rupees } from '../lib/rateConfig.js';

const SERVICES = [
  { id: 'bd', name: 'Surface 500g', provider_name: 'Blue Dart', supports_cod: true },
  { id: 'dl', name: 'Express', provider_name: 'Delhivery', supports_cod: true },
];
const fill = (slab, over = {}) => {
  for (const [z] of ZONES) slab.zones[z] = { fwdBase: '40', fwdAdd: '30', rtoBase: '35', rtoAdd: '25', ...over };
  return slab;
};
const good = (serviceId = 'bd', minWeightG = 0) => fill({ ...blankSlab(serviceId, minWeightG) });

// Same rule as backend/src/routes/shipping.ts: a zone row beats 'national', then the highest min_weight_g <= parcel weight.
const pickRow = (rows, serviceId, zone, weightG) => rows
  .filter((r) => r.serviceId === serviceId && [zone, 'national'].includes(r.zoneCode) && r.minWeightG <= weightG)
  .sort((a, b) => Number(b.zoneCode === zone) - Number(a.zoneCode === zone) || b.minWeightG - a.minWeightG)[0];

test('unit helpers', () => {
  assert.equal(toPaise('40.1'), 4010); // float noise rounded away
  assert.equal(toPaise('0.29'), 29);
  assert.equal(kgToG('0.5'), 500);
  assert.equal(kgToG('1.001'), 1001);
  assert.equal(rupees(4010), '40.1');
  assert.equal(rupees(null), '');
});

test('validate: empty card and missing courier', () => {
  assert.match(validateSlabs([], SERVICES), /at least one/);
  assert.match(validateSlabs([blankSlab('')], SERVICES), /#1: choose a courier/);
});

test('validate: a complete configuration passes, RTO may be blank', () => {
  assert.equal(validateSlabs([good()], SERVICES), '');
  const s = good();
  for (const [z] of ZONES) s.zones[z].rtoBase = s.zones[z].rtoAdd = '';
  assert.equal(validateSlabs([s], SERVICES), '');
});

test('validate: weights must be positive numbers', () => {
  for (const bad of ['0', '', 'abc', '-1']) {
    const a = good(); a.baseKg = bad; assert.match(validateSlabs([a], SERVICES), /must be more than 0/, `base ${bad}`);
    const b = good(); b.addKg = bad; assert.match(validateSlabs([b], SERVICES), /must be more than 0/, `add ${bad}`);
  }
  const c = good(); c.fromKg = '-2'; assert.match(validateSlabs([c], SERVICES), /slab starts at/);
});

test('validate: forward prices are mandatory in every zone, RTO must be numeric', () => {
  const a = good(); a.zones.metro_to_metro.fwdBase = ''; assert.match(validateSlabs([a], SERVICES), /Metro to metro: enter the forward price/);
  const b = good(); b.zones.ne_jk.fwdAdd = '-5'; assert.match(validateSlabs([b], SERVICES), /North-East & J&K: enter the forward additional price/);
  const c = good(); c.zones.within_city.rtoBase = 'x'; assert.match(validateSlabs([c], SERVICES), /Within city: the RTO price is not a number/);
});

test('validate: COD limits', () => {
  const a = good(); a.codFee = '-1'; assert.match(validateSlabs([a], SERVICES), /COD charge/);
  const b = good(); b.codPct = '101'; assert.match(validateSlabs([b], SERVICES), /between 0 and 100/);
  const c = good(); c.codPct = '2.5'; c.codFee = '30'; assert.equal(validateSlabs([c], SERVICES), '');
});

test('validate: the error names the configuration number', () => {
  const bad = good('dl'); bad.zones.within_state.fwdBase = '';
  assert.match(validateSlabs([good(), bad], SERVICES), /^Rate Configuration #2 \(Delhivery Express\)/);
});

test('validate: same courier twice needs different slab starts; different couriers may share', () => {
  assert.match(validateSlabs([good('bd'), good('bd')], SERVICES), /already covers this courier/);
  assert.equal(validateSlabs([good('bd'), good('dl')], SERVICES), '');
  assert.equal(validateSlabs([good('bd', 0), good('bd', 500)], SERVICES), '');
  const a = good('bd'); const b = good('bd'); a.fromKg = '1'; b.fromKg = '1.0'; // same grams written differently
  assert.match(validateSlabs([a, b], SERVICES), /already covers/);
});

test('nextSlabStartKg: 0 for the first configuration, heaviest base weight afterwards', () => {
  const a = good('bd'); a.baseKg = '0.5';
  const b = good('bd', 500); b.baseKg = '2';
  const c = blankSlab('');
  assert.equal(nextSlabStartKg([a, c], c.key, 'dl'), '0');
  assert.equal(nextSlabStartKg([a, c], c.key, 'bd'), '0.501');
  assert.equal(nextSlabStartKg([a, b, c], c.key, 'bd'), '2.001');
  assert.equal(nextSlabStartKg([a], a.key, 'bd'), '0'); // re-picking the only configuration does not count itself
});

test('buildRatePayload: one row per zone, prices in paise, blanks handled', () => {
  const s = good('bd'); s.codFee = '30'; s.codPct = '1.5'; s.baseKg = '0.5'; s.addKg = '0.25';
  s.zones.ne_jk = { fwdBase: '99.99', fwdAdd: '0', rtoBase: '', rtoAdd: '' };
  const { rates, access } = buildRatePayload([s], { bd: { on: true, cod: true } }, SERVICES);
  assert.equal(rates.length, 5);
  assert.deepEqual(rates.map((r) => r.zoneCode), ZONES.map(([z]) => z));
  assert.deepEqual(rates[0], { serviceId: 'bd', zoneCode: 'within_city', minWeightG: 0, baseWeightG: 500, basePricePaise: 4000, additionalWeightG: 250, additionalPricePaise: 3000, codFeePaise: 3000, codPercentBps: 150, fuelSurchargeBps: 0, rtoBasePricePaise: 3500, rtoAdditionalPricePaise: 2500 });
  const ne = rates[4];
  assert.equal(ne.basePricePaise, 9999); assert.equal(ne.additionalPricePaise, 0);
  assert.equal(ne.rtoBasePricePaise, null); assert.equal(ne.rtoAdditionalPricePaise, null);
  assert.deepEqual(access, [{ serviceId: 'bd', codEnabled: true }]);
});

test('buildRatePayload: blank COD fields become 0, access only for used couriers, COD flag follows the toggle', () => {
  const { rates, access } = buildRatePayload([good('bd'), good('dl', 0)], { bd: { on: true, cod: false }, dl: { on: true, cod: true } }, SERVICES);
  assert.equal(rates[0].codFeePaise, 0); assert.equal(rates[0].codPercentBps, 0);
  assert.deepEqual(access, [{ serviceId: 'bd', codEnabled: false }, { serviceId: 'dl', codEnabled: true }]);
  const only = buildRatePayload([good('dl')], {}, SERVICES);
  assert.deepEqual(only.access, [{ serviceId: 'dl', codEnabled: false }]); // no toggle entry -> COD off
  assert.deepEqual([...only.used], ['dl']);
});

test('load, edit, save round trip returns the same stored rows', () => {
  const stored = ZONES.map(([z], i) => ({ service_id: 'bd', zone_code: z, min_weight_g: 0, base_weight_g: 500, base_price_paise: 4000 + i * 100, additional_weight_g: 500, additional_price_paise: 3000 + i, cod_fee_paise: 3000, cod_percent_bps: 150, fuel_surcharge_bps: 200, rto_base_price_paise: 3500, rto_additional_price_paise: null }));
  const slabs = slabsFromRates(stored);
  assert.equal(slabs.length, 1);
  assert.equal(slabs[0].codPct, '1.5'); assert.equal(slabs[0].codFee, '30'); assert.equal(slabs[0].baseKg, '0.5');
  assert.equal(validateSlabs(slabs, SERVICES), '');
  const { rates } = buildRatePayload(slabs, { bd: { cod: true } }, SERVICES);
  assert.equal(rates.length, stored.length);
  rates.forEach((r, i) => {
    const o = stored[i];
    assert.equal(r.zoneCode, o.zone_code); assert.equal(r.basePricePaise, o.base_price_paise); assert.equal(r.additionalPricePaise, o.additional_price_paise);
    assert.equal(r.codFeePaise, o.cod_fee_paise); assert.equal(r.codPercentBps, o.cod_percent_bps); assert.equal(r.fuelSurchargeBps, 200);
    assert.equal(r.rtoBasePricePaise, 3500); assert.equal(r.rtoAdditionalPricePaise, null);
  });
});

test('slabsFromRates: groups by courier and weight band, keeps bands apart', () => {
  const row = (service_id, min, zone) => ({ service_id, zone_code: zone, min_weight_g: min, base_weight_g: 500, base_price_paise: 1000, additional_weight_g: 500, additional_price_paise: 500, cod_fee_paise: 0, cod_percent_bps: 0 });
  const slabs = slabsFromRates([row('bd', 0, 'within_city'), row('bd', 0, 'ne_jk'), row('bd', 500, 'within_city'), row('dl', 0, 'within_city')]);
  assert.equal(slabs.length, 3);
  assert.deepEqual(slabs.map((s) => `${s.serviceId}|${s.minWeightG}`), ['bd|0', 'bd|500', 'dl|0']);
  assert.equal(new Set(slabs.map((s) => s.key)).size, 3); // React keys are unique
  assert.equal(slabs[1].fromKg, '0.5');
});

test('slabsFromRates: an old national card fills all five zones; a zone row beats national', () => {
  const nat = { service_id: 'bd', zone_code: 'national', min_weight_g: 0, base_weight_g: 500, base_price_paise: 5000, additional_weight_g: 500, additional_price_paise: 4000, cod_fee_paise: 0, cod_percent_bps: 0, rto_base_price_paise: null, rto_additional_price_paise: null };
  const [s] = slabsFromRates([nat, { ...nat, zone_code: 'ne_jk', base_price_paise: 9000 }]);
  assert.equal(s.zones.within_city.fwdBase, '50');
  assert.equal(s.zones.ne_jk.fwdBase, '90');
  assert.equal(s.zones.rest_of_india.fwdAdd, '40');
  assert.equal(s.zones.within_city.rtoBase, '');
  assert.equal(validateSlabs([s], SERVICES), '');
});

test('two configurations of one courier: the engine picks the right band for each parcel weight', () => {
  const light = good('bd'); light.baseKg = '0.5'; light.zones.within_city.fwdBase = '40';
  const heavy = good('bd', 0); heavy.fromKg = nextSlabStartKg([light, heavy], heavy.key, 'bd'); heavy.baseKg = '2'; heavy.zones.within_city.fwdBase = '90';
  assert.equal(heavy.fromKg, '0.501');
  assert.equal(validateSlabs([light, heavy], SERVICES), '');
  const { rates } = buildRatePayload([light, heavy], { bd: { cod: true } }, SERVICES);
  assert.equal(pickRow(rates, 'bd', 'within_city', 300).basePricePaise, 4000);
  assert.equal(pickRow(rates, 'bd', 'within_city', 499).basePricePaise, 4000);
  assert.equal(pickRow(rates, 'bd', 'within_city', 500).basePricePaise, 4000); // exactly the base weight stays in the light band
  assert.equal(pickRow(rates, 'bd', 'within_city', 501).basePricePaise, 9000);
  assert.equal(pickRow(rates, 'bd', 'within_city', 1800).basePricePaise, 9000);
  assert.equal(pickRow(rates, 'dl', 'within_city', 300), undefined); // a courier with no configuration is not priced
});

test('no two rows share the backend unique key (rate card, service, zone, min weight)', () => {
  const a = good('bd'); const b = good('bd'); b.fromKg = '0.5';
  const { rates } = buildRatePayload([a, b, good('dl')], {}, SERVICES);
  const keys = rates.map((r) => `${r.serviceId}|${r.zoneCode}|${r.minWeightG}`);
  assert.equal(new Set(keys).size, keys.length);
});
