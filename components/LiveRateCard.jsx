'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { useAppState } from '@/lib/AppStateContext';
import { FORMATS, saveRows } from '@/lib/exportFile';
import * as T from '@/lib/theme';
import { Btn, CARD, FIELD, dayText, isoDay } from './Kit';

const BRAND = { Delhivery: '#C8102E', 'Blue Dart': '#0057B8', XpressBees: '#F58220', 'Ecom Express': '#D2232A', DTDC: '#1B3A8A', 'Ekart Logistics': '#2874F0', 'India Post': '#D22030', 'Shree Maruti': '#E11D48' };
// Zones A–E, in the order couriers publish them. `rate_card_rates.zone_code` for each.
const ZONES = [['within_city', 'Zone A', 'Within City'], ['within_state', 'Zone B', 'Within State'], ['metro_to_metro', 'Zone C', 'Metro to Metro'], ['rest_of_india', 'Zone D', 'Rest of India'], ['ne_jk', 'Zone E', 'Special Zones']];
const grams = (g) => (g >= 1000 ? `${g / 1000} kg` : `${g} g`);
const rs = (paise) => `₹${(Number(paise || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const modeOf = (s) => (/air|express/i.test(s.serviceType || '') ? 'Air' : 'Surface');

// The seller's rate card as a zone matrix (read-only information: prices are worked out in the rate calculator).
// Each zone cell reads Forward | RTO, Add. Forward | Add. RTO, COD charges | COD %.
function ZoneCell({ rate, cod }) {
  if (!rate) return <td style={{ ...CELL, color: T.TEXT_MUTED, textAlign: 'center' }}>—</td>;
  const row = (a, b, strong) => <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontVariantNumeric: 'tabular-nums', fontWeight: strong ? 700 : 500, color: strong ? T.TEXT : T.TEXT_SECONDARY }}><span>{a}</span><span>{b}</span></div>;
  return (
    <td style={CELL}>
      <div style={{ display: 'grid', gap: 3, fontSize: 12.5, minWidth: 128 }}>
        {row(rs(rate.basePaise), rs(rate.rtoBasePaise), true)}
        {row(rs(rate.additionalPaise), rs(rate.rtoAdditionalPaise))}
        {row(cod ? rs(rate.codFeePaise) : '—', cod ? `${(rate.codPercentBps / 100).toFixed(rate.codPercentBps % 100 ? 1 : 0)}%` : '—')}
      </div>
    </td>
  );
}

const CELL = { padding: '12px 10px', borderTop: `1px solid ${T.DIVIDER}`, verticalAlign: 'middle', borderLeft: `1px solid ${T.DIVIDER}` };
const HEAD = { padding: '10px', textAlign: 'center', fontSize: 12.5, fontWeight: 750, color: T.TEXT, background: T.TABLE_HEAD_BG, borderLeft: `1px solid ${T.DIVIDER}` };
const SUBHEAD = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 6, fontSize: 10, fontWeight: 600, color: T.TEXT_MUTED, textAlign: 'left' };

export default function LiveRateCard({ mobile, embedded = false }) {
  const { showToast, nav } = useAppState();
  const [data, setData] = useState(null); const [error, setError] = useState('');
  const [courier, setCourier] = useState(''); const [mode, setMode] = useState(''); const [format, setFormat] = useState('csv');
  const [slab, setSlab] = useState({});

  useEffect(() => {
    let live = true;
    apiFetch('/v1/shipping/rate-card').then((x) => { if (live) setData(x); }).catch((e) => { if (live) { setData({ card: null, services: [] }); setError(e.status === 401 ? 'Sign in to view your rate card.' : e.message || 'The rate card could not be loaded.'); } });
    return () => { live = false; };
  }, []);

  const services = useMemo(() => (data?.services || []).filter((s) => (!courier || s.providerCode === courier) && (!mode || modeOf(s) === mode)), [data, courier, mode]);
  const couriers = useMemo(() => [...new Map((data?.services || []).map((s) => [s.providerCode, s.providerName])).entries()], [data]);

  // A service can have several weight slabs; show one at a time (default: the lightest).
  const slabsOf = (s) => [...new Set(s.slabs.map((l) => l.fromWeightG))].sort((a, b) => a - b);
  const slabFor = (s) => { const key = `${s.providerCode}:${s.serviceName}`; const all = slabsOf(s); return all.includes(slab[key]) ? slab[key] : all[0]; };
  // Zone rows fall back to the national row where a service has no row for that zone.
  const rateFor = (s, zoneCode, from) => s.slabs.find((l) => l.zone === zoneCode && l.fromWeightG === from) || s.slabs.find((l) => l.zone === 'national' && l.fromWeightG === from) || null;

  const exportChart = async () => {
    const rows = [['Courier', 'Service', 'Mode', 'Zone', 'From weight g', 'First slab g', 'Forward INR', 'RTO INR', 'Additional slab g', 'Add. forward INR', 'Add. RTO INR', 'COD charges INR', 'COD %', 'Fuel surcharge %']];
    for (const s of services) for (const from of slabsOf(s)) for (const [code, , name] of ZONES) {
      const l = rateFor(s, code, from); if (!l) continue;
      rows.push([s.providerName, s.serviceName, modeOf(s), name, from, l.baseWeightG, l.basePaise / 100, l.rtoBasePaise / 100, l.additionalWeightG, l.additionalPaise / 100, l.rtoAdditionalPaise / 100, s.codEnabled ? l.codFeePaise / 100 : 0, s.codEnabled ? l.codPercentBps / 100 : 0, l.fuelBps / 100]);
    }
    if (rows.length === 1) return showToast('Nothing to export.', 'error');
    await saveRows(rows, `rate-card-${isoDay()}`, format, 'Rate card'); showToast(`Rate card exported (${format === 'xlsx' ? 'Excel' : 'CSV'})`);
  };

  return (
    <div style={{ padding: embedded ? 0 : mobile ? '14px 12px 42px' : '18px 22px 48px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
        <div>
          <b style={{ color: T.TEXT, fontSize: 16 }}>{data?.card ? data.card.name : 'Rate card'}</b>
          <span style={{ display: 'block', marginTop: 3, color: T.TEXT_MUTED, fontSize: 12.5 }}>{data?.card ? `Effective from ${dayText(data.card.effectiveFrom)} · all prices are before 18% GST` : 'Your negotiated rates by courier and zone'}</span>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select aria-label="Courier" style={FIELD} value={courier} onChange={(e) => setCourier(e.target.value)}><option value="">All couriers</option>{couriers.map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select>
          <select aria-label="Mode" style={FIELD} value={mode} onChange={(e) => setMode(e.target.value)}><option value="">All modes</option><option value="Surface">Surface</option><option value="Air">Air</option></select>
          <select aria-label="Export format" style={FIELD} value={format} onChange={(e) => setFormat(e.target.value)}>{FORMATS.map(([id, l]) => <option key={id} value={id}>{l}</option>)}</select>
          <Btn onClick={exportChart}>⤓ Export</Btn>
          <Btn primary onClick={() => nav('ratecalc')}>Open rate calculator</Btn>
        </div>
      </div>

      {data === null && <div style={{ ...CARD, padding: 22, color: T.TEXT_MUTED }}>Loading your rate card…</div>}
      {error && <div style={{ ...CARD, padding: 22, color: T.RED }}>{error}</div>}
      {data && !error && !data.card && <div style={{ ...CARD, padding: 28, textAlign: 'center', color: T.TEXT_SECONDARY }}>No active rate card yet. NEXGO operations will publish your rates here once they are configured.</div>}
      {data?.card && !services.length && <div style={{ ...CARD, padding: 22, color: T.TEXT_SECONDARY }}>No courier matches these filters.</div>}

      {services.length > 0 && (
        <section style={{ ...CARD, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: 1120, borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ ...HEAD, textAlign: 'left', borderLeft: 0, minWidth: 190 }}>Couriers</th>
                  <th style={{ ...HEAD, width: 70 }}>Mode</th>
                  {ZONES.map(([code, label, name]) => (
                    <th key={code} style={HEAD}>{label}<small style={{ display: 'block', fontWeight: 500, color: T.TEXT_MUTED, fontSize: 11 }}>({name})</small>
                      <div style={SUBHEAD}><span>Forward<br />Add. forward<br />COD charges</span><span>RTO<br />Add. RTO<br />COD %</span></div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {services.map((s) => {
                  const from = slabFor(s); const slabs = slabsOf(s); const first = rateFor(s, 'within_city', from) || s.slabs[0];
                  return (
                    <tr key={`${s.providerCode}:${s.serviceName}`}>
                      <td style={{ ...CELL, borderLeft: 0 }}>
                        <b style={{ color: BRAND[s.providerName] || T.TEXT, fontSize: 14 }}>{s.providerName}</b>
                        <div style={{ color: T.TEXT, fontSize: 13, fontWeight: 650, marginTop: 2 }}>{s.serviceName}</div>
                        <small style={{ display: 'block', color: T.TEXT_MUTED, marginTop: 3 }}>(extra weight: {grams(first?.additionalWeightG || 500)})</small>
                        {s.minDays ? <small style={{ display: 'block', color: T.TEXT_MUTED }}>Delivery: {s.minDays === s.maxDays ? `${s.minDays} day${s.minDays === 1 ? '' : 's'}` : `${s.minDays}–${s.maxDays} days`}</small> : null}
                        {slabs.length > 1 && <select aria-label={`Weight slab for ${s.serviceName}`} value={from} onChange={(e) => setSlab((o) => ({ ...o, [`${s.providerCode}:${s.serviceName}`]: Number(e.target.value) }))} style={{ ...FIELD, height: 28, marginTop: 7, fontSize: 12 }}>{slabs.map((g) => <option key={g} value={g}>From {grams(g)}</option>)}</select>}
                      </td>
                      <td style={{ ...CELL, textAlign: 'center', fontSize: 12, fontWeight: 650, color: T.TEXT_SECONDARY }}><span aria-hidden="true" style={{ display: 'block', fontSize: 18 }}>{modeOf(s) === 'Air' ? '✈' : '🚚'}</span>{modeOf(s)}</td>
                      {ZONES.map(([code]) => <ZoneCell key={code} rate={rateFor(s, code, from)} cod={s.codEnabled} />)}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {data?.card && <p style={{ marginTop: 12, color: T.TEXT_MUTED, fontSize: 12 }}>Reference only. A parcel is priced in the rate calculator: the zone comes from the pickup and delivery pincodes, the matching weight slab gives the first-slab price, every started additional slab adds the additional price, COD is the greater of the flat charge and the COD % of the order value, then 18% GST is added. Billed weight is the higher of dead weight and volumetric weight (L × B × H ÷ 5000).</p>}
    </div>
  );
}
