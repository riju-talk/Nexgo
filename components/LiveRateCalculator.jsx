'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import { useAppState } from '@/lib/AppStateContext';
import * as T from '@/lib/theme';
import PincodeInput from './PincodeInput';

const CARD = { background: 'var(--nx-surface)', border: `1px solid ${T.BORDER}`, borderRadius: 12 };
const FIELD = { width: '100%', height: 42, boxSizing: 'border-box', border: `1px solid ${T.INPUT_BORDER}`, borderRadius: 8, background: T.SURFACE, color: T.TEXT, padding: '0 11px', fontSize: 14, outline: 'none' };
const LABEL = { display: 'block', fontSize: 12.5, fontWeight: 650, color: T.TEXT_LABEL };
const PRODUCT_TYPES = ['Apparel & accessories', 'Electronics', 'Home & kitchen', 'Beauty & personal care', 'Books & stationery', 'Footwear', 'Jewellery', 'Other'];
const BRAND = { Delhivery: '#C8102E', 'Blue Dart': '#0057B8', XpressBees: '#F58220', 'Ecom Express': '#D2232A', DTDC: '#1B3A8A', 'Ekart Logistics': '#2874F0', 'India Post': '#D22030' };
const inr = (v) => `₹${Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const days = (t) => (t.minDays === t.maxDays ? `${t.minDays} Day${t.minDays === 1 ? '' : 's'}` : `${t.minDays} – ${t.maxDays} Days`);
const SORTS = [['lowest', 'Lowest price'], ['fastest', 'Fastest delivery'], ['cod', 'COD available'], ['recommended', 'Recommended']];

export default function LiveRateCalculator({ mobile }) {
  const { nav, showToast } = useAppState();
  const [form, setForm] = useState({ pickup: '', delivery: '', mode: 'prepaid', weightKg: '1.2', length: '20', width: '15', height: '10', value: '2500', productType: 'Electronics' });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [sort, setSort] = useState('lowest');

  // Default the pickup pincode to the seller's default warehouse.
  useEffect(() => {
    apiFetch('/v1/warehouses').then((x) => {
      const w = (x.items || []).find((i) => i.is_default && i.is_active) || (x.items || []).find((i) => i.is_active);
      if (w) setForm((f) => (f.pickup ? f : { ...f, pickup: w.pincode }));
    }).catch(() => {});
  }, []);

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: typeof v === 'string' ? v : v.target.value }));
  const dims = [form.length, form.width, form.height];
  const dimsFilled = dims.filter((d) => d !== '').length;
  const valid = /^\d{6}$/.test(form.pickup) && /^\d{6}$/.test(form.delivery) && Number(form.weightKg) > 0 && (dimsFilled === 0 || dimsFilled === 3);

  const calculate = async (e) => {
    e.preventDefault();
    if (!valid) return setError('Enter both pincodes, a weight, and either all three dimensions or none.');
    setBusy(true); setError('');
    try {
      const body = { destinationPincode: form.delivery, pickupPincode: form.pickup, weightG: Math.round(Number(form.weightKg) * 1000), paymentMode: form.mode, ...(dimsFilled === 3 ? { lengthMm: Math.round(form.length * 10), widthMm: Math.round(form.width * 10), heightMm: Math.round(form.height * 10) } : {}) };
      setResult(await apiFetch('/v1/shipping/quotes', { method: 'POST', body }));
    } catch (x) { setResult(null); setError(x instanceof ApiError ? x.message : 'Rates could not be calculated.'); }
    finally { setBusy(false); }
  };

  const rows = useMemo(() => {
    const list = [...(result?.quotes || [])];
    if (sort === 'lowest') return list.sort((a, b) => a.price.total - b.price.total);
    if (sort === 'fastest') return list.sort((a, b) => a.tat.minDays - b.tat.minDays || a.price.total - b.price.total);
    if (sort === 'cod') return list.filter((q) => q.codAvailable).sort((a, b) => a.price.total - b.price.total);
    // Recommended: best combined rank of price and speed.
    const byPrice = [...list].sort((a, b) => a.price.total - b.price.total); const bySpeed = [...list].sort((a, b) => a.tat.minDays - b.tat.minDays);
    return list.sort((a, b) => (byPrice.indexOf(a) + bySpeed.indexOf(a)) - (byPrice.indexOf(b) + bySpeed.indexOf(b)));
  }, [result, sort]);
  const best = result?.quotes?.[0];

  const select = (q) => {
    try { window.sessionStorage.setItem('nx-order-prefill', JSON.stringify({ pincode: form.delivery, weightKg: form.weightKg, paymentMode: form.mode, courier: { key: `${q.provider.code}:${q.service.code}`, name: q.provider.name, providerCode: q.provider.code, serviceCode: q.service.code } })); } catch { /* optional */ }
    showToast(`${q.provider.name} selected. Fill in the order to book it.`); nav('b2c');
  };

  return (
    <div style={{ padding: mobile ? '14px 12px 42px' : '18px 22px 48px', maxWidth: '100%' }}>
      <p style={{ margin: '0 0 14px', color: T.TEXT_SECONDARY, fontSize: 13.5 }}>Enter your shipment details to compare the best courier rates across multiple partners.</p>
      <form onSubmit={calculate} style={{ ...CARD, padding: 18 }}>
        <b style={{ color: T.TEXT, fontSize: 15 }}>Shipment Details</b>
        <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: mobile ? '1fr' : '1fr 1fr 1fr 1fr', gap: 14, alignItems: 'start' }}>
          <PincodeInput label="Pickup Pincode" value={form.pickup} onChange={set('pickup')} />
          <PincodeInput label="Delivery Pincode" value={form.delivery} onChange={set('delivery')} />
          <div style={LABEL}>Payment Mode <span style={{ color: T.RED }}>*</span>
            <div style={{ marginTop: 6, display: 'flex', borderRadius: 8, overflow: 'hidden', border: `1px solid ${T.INPUT_BORDER}`, height: 42 }}>
              {[['prepaid', 'Prepaid'], ['cod', 'COD']].map(([id, label]) => <button key={id} type="button" aria-pressed={form.mode === id} onClick={() => set('mode')(id)} style={{ flex: 1, border: 0, background: form.mode === id ? '#2454D6' : T.SURFACE, color: form.mode === id ? '#fff' : T.TEXT_SECONDARY, fontWeight: 750, fontSize: 13.5, cursor: 'pointer' }}>{label}</button>)}
            </div>
          </div>
          <label style={LABEL}>Shipment Weight (kg) <span style={{ color: T.RED }}>*</span><input style={{ ...FIELD, marginTop: 6 }} type="number" min="0.01" step="0.01" value={form.weightKg} onChange={set('weightKg')} /></label>
        </div>
        <div style={{ marginTop: 6, display: 'grid', gridTemplateColumns: mobile ? '1fr' : '1.3fr 1fr 1fr auto', gap: 14, alignItems: 'end' }}>
          <div style={LABEL}>Package Dimensions (cm)
            <div style={{ marginTop: 6, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              {[['length', 'L (Length)'], ['width', 'W (Width)'], ['height', 'H (Height)']].map(([k, ph]) => <input key={k} style={FIELD} type="number" min="1" step="0.1" placeholder={ph} value={form[k]} onChange={set(k)} aria-label={ph} />)}
            </div>
          </div>
          <label style={LABEL}>Shipment Value (₹)<input style={{ ...FIELD, marginTop: 6 }} type="number" min="0" value={form.value} onChange={set('value')} /></label>
          <label style={LABEL}>Product Type<select style={{ ...FIELD, marginTop: 6 }} value={form.productType} onChange={set('productType')}>{PRODUCT_TYPES.map((t) => <option key={t}>{t}</option>)}</select></label>
          <button type="submit" disabled={busy || !valid} style={{ height: 44, padding: '0 22px', border: 0, borderRadius: 9, background: '#2454D6', color: '#fff', fontWeight: 800, fontSize: 14, cursor: busy ? 'wait' : 'pointer', opacity: busy || !valid ? 0.6 : 1 }}>{busy ? 'Calculating…' : 'Calculate Rates →'}</button>
        </div>
        {error && <div style={{ marginTop: 12, color: T.RED, fontSize: 13 }}>{error}</div>}
      </form>

      <section style={{ ...CARD, marginTop: 16, overflow: 'hidden' }}>
        <div style={{ padding: '16px 18px', display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <div><b style={{ color: T.TEXT, fontSize: 16 }}>Available Courier Options</b><span style={{ display: 'block', marginTop: 3, color: T.TEXT_MUTED, fontSize: 12.5 }}>{!result ? 'Calculate rates to see couriers.' : `We found ${result.quotes.length} courier partner${result.quotes.length === 1 ? '' : 's'} matching your shipment details.`}</span></div>
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>{SORTS.map(([id, label]) => <button key={id} type="button" onClick={() => setSort(id)} aria-pressed={sort === id} style={{ height: 32, padding: '0 12px', borderRadius: 8, border: `1px solid ${sort === id ? '#2454D6' : T.BORDER}`, background: sort === id ? '#2454D614' : T.SURFACE, color: sort === id ? '#2454D6' : T.TEXT_SECONDARY, fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>{label}</button>)}</div>
        </div>
        {result && <div style={{ padding: '0 18px 12px', display: 'flex', gap: 18, flexWrap: 'wrap', color: T.TEXT_SECONDARY, fontSize: 12.5 }}>
          <span>Dead weight: <b style={{ color: T.TEXT }}>{(result.deadWeightG / 1000).toFixed(2)} kg</b></span>
          <span>Volumetric: <b style={{ color: T.TEXT }}>{result.volumetricWeightG ? `${(result.volumetricWeightG / 1000).toFixed(2)} kg` : '—'}</b></span>
          <span>Billed: <b style={{ color: T.ACCENT }}>{(result.chargeableWeightG / 1000).toFixed(2)} kg</b></span>
          {result.destination?.city && <span>To: <b style={{ color: T.TEXT }}>{result.destination.city}, {result.destination.state}</b></span>}
        </div>}
        {result && !rows.length && <div style={{ padding: '4px 18px 22px', color: T.TEXT_SECONDARY, fontSize: 13 }}>{sort === 'cod' ? 'No courier offers cash on delivery here.' : 'No courier can ship this parcel to this pincode.'}{result.unavailable?.length ? ` Not available: ${result.unavailable.map((u) => `${u.provider.name} (${u.reason})`).join(', ')}.` : ''}</div>}
        {rows.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: 880, borderCollapse: 'collapse' }}>
              <thead><tr>{['Courier', 'Service', 'Delivery Estimate', 'Freight Charge (₹)', 'COD Fee (₹)', 'Total Cost (₹)', 'Serviceability', 'Action'].map((h) => <th key={h} style={{ padding: '11px 14px', textAlign: 'left', fontSize: 12, color: T.TEXT_MUTED, background: T.TABLE_HEAD_BG, fontWeight: 700 }}>{h}</th>)}</tr></thead>
              <tbody>{rows.map((q) => {
                const top = q === best;
                return (
                  <tr key={`${q.provider.code}:${q.service.code}`} style={{ background: top ? 'rgba(20,114,79,.07)' : 'transparent' }}>
                    <td style={{ padding: '14px', borderTop: `1px solid ${T.DIVIDER}` }}><b style={{ color: BRAND[q.provider.name] || T.TEXT, fontSize: 15 }}>{q.provider.name}</b>{top && <span style={{ marginLeft: 8, padding: '3px 8px', borderRadius: 6, background: `${T.GREEN}1f`, color: T.GREEN, fontSize: 11, fontWeight: 800 }}>Best Price</span>}</td>
                    <td style={{ padding: '14px', borderTop: `1px solid ${T.DIVIDER}`, color: T.TEXT, fontSize: 13 }}><b style={{ textTransform: 'capitalize' }}>{q.service.type}</b><small style={{ display: 'block', color: T.TEXT_MUTED }}>{q.service.name}</small></td>
                    <td style={{ padding: '14px', borderTop: `1px solid ${T.DIVIDER}` }}><span style={{ padding: '5px 10px', borderRadius: 8, background: '#2454D612', color: '#2454D6', fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap' }}>🗓 {days(q.tat)}</span></td>
                    <td style={{ padding: '14px', borderTop: `1px solid ${T.DIVIDER}`, fontSize: 14, color: T.TEXT }}>{inr(q.price.freight)}</td>
                    <td style={{ padding: '14px', borderTop: `1px solid ${T.DIVIDER}`, fontSize: 14, color: T.TEXT }}>{form.mode === 'cod' ? inr(q.price.codFee) : q.codAvailable ? <span style={{ color: T.TEXT_MUTED }}>— ({inr(q.codFee)} if COD)</span> : <span style={{ color: T.TEXT_MUTED }}>Prepaid only</span>}</td>
                    <td style={{ padding: '14px', borderTop: `1px solid ${T.DIVIDER}`, fontSize: 18, fontWeight: 800, color: top ? T.GREEN : T.TEXT }}>{inr(q.price.total)}</td>
                    <td style={{ padding: '14px', borderTop: `1px solid ${T.DIVIDER}`, color: T.GREEN, fontSize: 13, fontWeight: 650 }}>● Available</td>
                    <td style={{ padding: '14px', borderTop: `1px solid ${T.DIVIDER}` }}><button type="button" onClick={() => select(q)} style={{ height: 36, padding: '0 16px', borderRadius: 8, border: top ? 0 : `1px solid #2454D6`, background: top ? T.GREEN : T.SURFACE, color: top ? '#fff' : '#2454D6', fontWeight: 750, fontSize: 13, cursor: 'pointer' }}>Select →</button></td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
