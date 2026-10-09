'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { useAppState } from '@/lib/AppStateContext';
import { FORMATS, saveRows } from '@/lib/exportFile';
import * as T from '@/lib/theme';
import { BLUE, Btn, CARD, FIELD, Pill, dayText, inr, isoDay, titleCase } from './Kit';

const BRAND = { Delhivery: '#C8102E', 'Blue Dart': '#0057B8', XpressBees: '#F58220', 'Ecom Express': '#D2232A', DTDC: '#1B3A8A', 'Ekart Logistics': '#2874F0', 'India Post': '#D22030' };
const ZONES = { national: 'National (default)', within_city: 'Within city', within_state: 'Within state', metro_to_metro: 'Metro to metro', rest_of_india: 'Rest of India', ne_jk: 'North-East & J&K' };
const grams = (g) => (g >= 1000 ? `${g / 1000} kg` : `${g} g`);
const window_ = (s) => (s.minDays ? (s.minDays === s.maxDays ? `${s.minDays} day${s.minDays === 1 ? '' : 's'}` : `${s.minDays} – ${s.maxDays} days`) : '—');

// The seller's current rate chart (read-only: rates are set by NEXGO operations in the admin panel).
export default function LiveRateCard({ mobile, embedded = false }) {
  const { showToast, nav } = useAppState();
  const [data, setData] = useState(null); const [error, setError] = useState('');
  const [courier, setCourier] = useState(''); const [format, setFormat] = useState('csv');

  useEffect(() => {
    let live = true;
    apiFetch('/v1/shipping/rate-card').then((x) => { if (live) setData(x); }).catch((e) => { if (live) { setData({ card: null, services: [] }); setError(e.status === 401 ? 'Sign in to view your rate card.' : e.message || 'The rate card could not be loaded.'); } });
    return () => { live = false; };
  }, []);

  const services = useMemo(() => (data?.services || []).filter((s) => !courier || s.providerCode === courier), [data, courier]);
  const couriers = useMemo(() => [...new Map((data?.services || []).map((s) => [s.providerCode, s.providerName])).entries()], [data]);

  const exportChart = async () => {
    const rows = [['Courier', 'Service', 'Zone', 'From weight g', 'Base weight g', 'Base price INR', 'Additional slab g', 'Additional price INR', 'COD flat fee INR', 'COD % of order value', 'RTO base INR', 'RTO additional INR', 'Fuel surcharge %']];
    for (const s of services) for (const l of s.slabs) rows.push([s.providerName, s.serviceName, ZONES[l.zone] || l.zone, l.fromWeightG, l.baseWeightG, l.basePaise / 100, l.additionalWeightG, l.additionalPaise / 100, l.codFeePaise / 100, l.codPercentBps / 100, l.rtoBasePaise / 100, l.rtoAdditionalPaise / 100, l.fuelBps / 100]);
    if (rows.length === 1) return showToast('Nothing to export.', 'error');
    await saveRows(rows, `rate-card-${isoDay()}`, format, 'Rate card'); showToast(`Rate card exported (${format === 'xlsx' ? 'Excel' : 'CSV'})`);
  };

  return (
    <div style={{ padding: embedded ? 0 : mobile ? '14px 12px 42px' : '18px 22px 48px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
        <div>
          <b style={{ color: T.TEXT, fontSize: 16 }}>{data?.card ? data.card.name : 'Rate card'}</b>
          <span style={{ display: 'block', marginTop: 3, color: T.TEXT_MUTED, fontSize: 12.5 }}>{data?.card ? `Effective from ${dayText(data.card.effectiveFrom)} · all prices are before 18% GST` : 'Your negotiated rates by courier and weight slab.'}</span>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select aria-label="Courier" style={FIELD} value={courier} onChange={(e) => setCourier(e.target.value)}><option value="">All couriers</option>{couriers.map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select>
          <select aria-label="Export format" style={FIELD} value={format} onChange={(e) => setFormat(e.target.value)}>{FORMATS.map(([id, l]) => <option key={id} value={id}>{l}</option>)}</select>
          <Btn onClick={exportChart}>⤓ Export</Btn>
          <Btn primary onClick={() => nav('ratecalc')}>Open rate calculator</Btn>
        </div>
      </div>

      {data === null && <div style={{ ...CARD, padding: 22, color: T.TEXT_MUTED }}>Loading your rate card…</div>}
      {error && <div style={{ ...CARD, padding: 22, color: T.RED }}>{error}</div>}
      {data && !error && !data.card && <div style={{ ...CARD, padding: 28, textAlign: 'center', color: T.TEXT_SECONDARY }}>No active rate card yet. NEXGO operations will publish your rates here once they are configured.</div>}

      <div style={{ display: 'grid', gap: 14 }}>
        {services.map((s) => (
          <section key={`${s.providerCode}:${s.serviceName}`} style={{ ...CARD, overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center', borderBottom: `1px solid ${T.DIVIDER}`, background: T.SURFACE_SOFT }}>
              <div><b style={{ color: BRAND[s.providerName] || T.TEXT, fontSize: 16 }}>{s.providerName}</b><span style={{ marginLeft: 10, color: T.TEXT_SECONDARY, fontSize: 13 }}>{s.serviceName}</span>{s.tagline && <small style={{ display: 'block', color: T.TEXT_MUTED, marginTop: 2 }}>{s.tagline}</small>}</div>
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}><Pill color={BLUE}>{titleCase(s.serviceType)}</Pill><Pill color={T.TEXT_SECONDARY}>🗓 {window_(s)}</Pill>{s.codEnabled ? <Pill>COD available</Pill> : <Pill color={T.AMBER}>Prepaid only</Pill>}</div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', minWidth: 900, borderCollapse: 'collapse' }}>
                <thead><tr>{['Zone', 'Weight from', 'First slab', 'Each additional slab', 'COD (flat / % of value)', 'RTO (first / additional)', 'Fuel'].map((h) => <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 10.5, letterSpacing: '.06em', textTransform: 'uppercase', color: T.TEXT_MUTED, background: T.TABLE_HEAD_BG, fontWeight: 800, whiteSpace: 'nowrap' }}>{h}</th>)}</tr></thead>
                <tbody>
                  {s.slabs.map((l, i) => (
                    <tr key={i}>
                      <td style={{ padding: 12, borderTop: `1px solid ${T.DIVIDER}`, fontSize: 13, fontWeight: 700, color: T.TEXT }}>{ZONES[l.zone] || titleCase(l.zone)}</td>
                      <td style={{ padding: 12, borderTop: `1px solid ${T.DIVIDER}`, fontSize: 13 }}>{grams(l.fromWeightG)}</td>
                      <td style={{ padding: 12, borderTop: `1px solid ${T.DIVIDER}`, fontSize: 13 }}>{inr(l.basePaise)} <small style={{ color: T.TEXT_MUTED }}>/ {grams(l.baseWeightG)}</small></td>
                      <td style={{ padding: 12, borderTop: `1px solid ${T.DIVIDER}`, fontSize: 13 }}>{inr(l.additionalPaise)} <small style={{ color: T.TEXT_MUTED }}>/ {grams(l.additionalWeightG)}</small></td>
                      <td style={{ padding: 12, borderTop: `1px solid ${T.DIVIDER}`, fontSize: 13 }}>{s.codEnabled ? <>{inr(l.codFeePaise)} <small style={{ color: T.TEXT_MUTED }}>/ {(l.codPercentBps / 100).toFixed(2)}%</small></> : '—'}</td>
                      <td style={{ padding: 12, borderTop: `1px solid ${T.DIVIDER}`, fontSize: 13 }}>{inr(l.rtoBasePaise)} <small style={{ color: T.TEXT_MUTED }}>/ {inr(l.rtoAdditionalPaise)}</small></td>
                      <td style={{ padding: 12, borderTop: `1px solid ${T.DIVIDER}`, fontSize: 13 }}>{(l.fuelBps / 100).toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>
      {data?.card && <p style={{ marginTop: 12, color: T.TEXT_MUTED, fontSize: 12 }}>Reference only. A parcel is priced in the rate calculator: the zone comes from the pickup and delivery pincodes, the matching weight slab gives the first-slab price, every started additional slab adds the additional price, COD is the greater of the flat fee and the % of order value, then 18% GST is added. Billed weight is the higher of dead weight and volumetric weight (L × W × H ÷ 5000).</p>}
    </div>
  );
}
