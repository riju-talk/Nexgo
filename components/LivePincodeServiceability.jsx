'use client';

import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import { useAppState } from '@/lib/AppStateContext';
import * as T from '@/lib/theme';
import PincodeInput from './PincodeInput';

const CARD = { background: 'var(--nx-surface)', border: `1px solid ${T.BORDER}`, borderRadius: 12 };
const FIELD = { width: '100%', height: 42, boxSizing: 'border-box', border: `1px solid ${T.INPUT_BORDER}`, borderRadius: 8, background: T.SURFACE, color: T.TEXT, padding: '0 11px', fontSize: 14, outline: 'none' };
const BRAND = { Delhivery: '#C8102E', 'Blue Dart': '#0057B8', XpressBees: '#F58220', 'Ecom Express': '#D2232A', DTDC: '#1B3A8A', 'Ekart Logistics': '#2874F0', 'India Post': '#D22030' };
const days = (t) => (t.minDays === t.maxDays ? `${t.minDays} Day${t.minDays === 1 ? '' : 's'}` : `${t.minDays} – ${t.maxDays} Days`);
const WINDOW_TONE = (t) => (t.maxDays <= 2 ? ['#7C3AED', '#7C3AED14'] : t.maxDays <= 4 ? ['#3877fc', '#3877fc12'] : ['#C2410C', '#F5822014']);

function Stat({ icon, label, value }) {
  return <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 0', borderTop: `1px solid ${T.DIVIDER}` }}><span style={{ fontSize: 18 }}>{icon}</span><span style={{ flex: 1, color: T.TEXT_SECONDARY, fontSize: 13 }}>{label}</span><b style={{ color: T.TEXT, fontSize: 14 }}>{value}</b></div>;
}

export default function LivePincodeServiceability({ mobile }) {
  const { nav, showToast } = useAppState();
  const [form, setForm] = useState({ pickup: '', delivery: '', weightKg: '1.2' });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch('/v1/warehouses').then((x) => {
      const w = (x.items || []).find((i) => i.is_default && i.is_active) || (x.items || []).find((i) => i.is_active);
      if (w) setForm((f) => (f.pickup ? f : { ...f, pickup: w.pincode }));
    }).catch(() => {});
  }, []);

  const valid = /^\d{6}$/.test(form.pickup) && /^\d{6}$/.test(form.delivery) && Number(form.weightKg) > 0;
  const check = async (e) => {
    e.preventDefault();
    if (!valid) return setError('Enter a 6-digit pickup pincode, a 6-digit delivery pincode and the weight.');
    setBusy(true); setError('');
    try { setResult(await apiFetch('/v1/shipping/serviceability', { method: 'POST', body: { pickupPincode: form.pickup, deliveryPincode: form.delivery, weightG: Math.round(Number(form.weightKg) * 1000) } })); }
    catch (x) { setResult(null); setError(x instanceof ApiError ? x.message : 'Serviceability could not be checked.'); }
    finally { setBusy(false); }
  };

  const select = (item) => {
    try { window.sessionStorage.setItem('nx-order-prefill', JSON.stringify({ pincode: form.delivery, weightKg: form.weightKg, courier: { key: `${item.provider.code}:${item.service.code}`, name: item.provider.name, providerCode: item.provider.code, serviceCode: item.service.code } })); } catch { /* optional */ }
    showToast(`${item.provider.name} selected. Fill in the order to book it.`); nav('b2c');
  };

  const ok = result?.serviceable;
  const sum = result?.summary;
  return (
    <div style={{ padding: mobile ? '14px 12px 42px' : '18px 28px 48px', maxWidth: '100%' }}>
      <p style={{ margin: '0 0 14px', color: T.TEXT_SECONDARY, fontSize: 13.5 }}>Check if your shipment can be delivered to the destination pincode and view available courier partners.</p>
      <form onSubmit={check} style={{ ...CARD, padding: 18, display: 'grid', gridTemplateColumns: mobile ? '1fr' : '1fr 1fr .8fr auto', gap: 14, alignItems: 'start' }}>
        <PincodeInput label="Pickup Pincode" value={form.pickup} onChange={(v) => setForm((f) => ({ ...f, pickup: v }))} />
        <PincodeInput label="Delivery Pincode" value={form.delivery} onChange={(v) => setForm((f) => ({ ...f, delivery: v }))} />
        <label style={{ display: 'block', fontSize: 12.5, fontWeight: 650, color: T.TEXT_LABEL }}>Shipment Weight (kg) <span style={{ color: T.RED }}>*</span><input style={{ ...FIELD, marginTop: 6 }} type="number" min="0.01" step="0.01" value={form.weightKg} onChange={(e) => setForm((f) => ({ ...f, weightKg: e.target.value }))} /></label>
        <button type="submit" disabled={busy || !valid} style={{ marginTop: mobile ? 0 : 22, height: 44, padding: '0 22px', border: 0, borderRadius: 9, background: '#3877fc', color: '#fff', fontWeight: 800, fontSize: 14, cursor: busy ? 'wait' : 'pointer', opacity: busy || !valid ? 0.6 : 1 }}>{busy ? 'Checking…' : 'Check Serviceability →'}</button>
      </form>
      {error && <div style={{ marginTop: 12, color: T.RED, fontSize: 13 }}>{error}</div>}

      {!result ? <div style={{ ...CARD, marginTop: 16, padding: 28, textAlign: 'center', color: T.TEXT_MUTED, fontSize: 13.5 }}>Enter pincodes and press <b>Check Serviceability</b> to see which couriers can deliver.</div> : (
        <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: mobile ? '1fr' : 'minmax(0,1fr) 300px', gap: 16, alignItems: 'start' }}>
          <div style={{ display: 'grid', gap: 14, minWidth: 0 }}>
            <section style={{ ...CARD, padding: 18, background: ok ? 'rgba(20,114,79,.07)' : 'rgba(178,58,43,.07)', borderColor: ok ? `${T.GREEN}44` : `${T.RED}44`, display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                <span style={{ width: 46, height: 46, borderRadius: 23, background: ok ? T.GREEN : T.RED, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 22, fontWeight: 800 }}>{ok ? '✓' : '✕'}</span>
                <div><b style={{ color: ok ? T.GREEN : T.RED, fontSize: 19 }}>{ok ? 'Delivery is Serviceable' : 'Delivery is not serviceable'}</b>
                  <span style={{ display: 'block', marginTop: 3, color: T.TEXT_SECONDARY, fontSize: 13 }}>{ok ? `Your shipment from ${result.pickup.pincode} to ${result.delivery.pincode} is deliverable. Here are the available courier partners:` : `No enabled courier can deliver from ${result.pickup.pincode} to ${result.delivery.pincode} for this weight.`}</span></div>
              </div>
              <div style={{ padding: '10px 14px', borderRadius: 10, background: T.SURFACE, border: `1px solid ${T.BORDER}`, display: 'grid', gap: 6, fontSize: 12.5 }}>
                <span>📍 Pickup <b style={{ color: T.TEXT }}>{result.pickup.pincode}</b>{result.pickup.city && <small style={{ color: T.TEXT_MUTED }}> · {result.pickup.city}</small>}</span>
                <span>📍 Delivery <b style={{ color: T.TEXT }}>{result.delivery.pincode}</b>{result.delivery.city && <small style={{ color: T.TEXT_MUTED }}> · {result.delivery.city}, {result.delivery.state}</small>}</span>
              </div>
            </section>

            <section style={{ ...CARD, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', minWidth: 820, borderCollapse: 'collapse' }}>
                  <thead><tr>{['Courier', 'Service', 'Delivery Estimate', 'COD Availability', 'Serviceability', 'Action'].map((h) => <th key={h} style={{ padding: '12px 14px', textAlign: 'left', fontSize: 12, color: T.TEXT_MUTED, background: T.TABLE_HEAD_BG, fontWeight: 700 }}>{h}</th>)}</tr></thead>
                  <tbody>{result.items.map((i) => {
                    const [fg, bg] = WINDOW_TONE(i.tat);
                    return (
                      <tr key={`${i.provider.code}:${i.service.code}`} style={{ opacity: i.serviceable ? 1 : 0.7 }}>
                        <td style={{ padding: '14px', borderTop: `1px solid ${T.DIVIDER}` }}><b style={{ color: BRAND[i.provider.name] || T.TEXT, fontSize: 15 }}>{i.provider.name}</b><small style={{ display: 'block', color: T.TEXT_MUTED, marginTop: 2 }}>{i.service.tagline}</small></td>
                        <td style={{ padding: '14px', borderTop: `1px solid ${T.DIVIDER}`, fontSize: 13 }}><b style={{ color: T.TEXT, textTransform: 'capitalize' }}>{i.service.type}</b><small style={{ display: 'block', color: T.TEXT_MUTED }}>{i.service.name}</small></td>
                        <td style={{ padding: '14px', borderTop: `1px solid ${T.DIVIDER}` }}>{i.serviceable ? <span style={{ padding: '5px 10px', borderRadius: 8, background: bg, color: fg, fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap' }}>🗓 {days(i.tat)}</span> : <span style={{ color: T.TEXT_MUTED }}>—</span>}</td>
                        <td style={{ padding: '14px', borderTop: `1px solid ${T.DIVIDER}`, fontSize: 13 }}>{i.codAvailable ? <><b style={{ color: T.GREEN }}>● Available</b><small style={{ display: 'block', color: T.TEXT_MUTED }}>(₹{i.codFee})</small></> : <><b style={{ color: T.TEXT_MUTED }}>● Not Available</b><small style={{ display: 'block', color: T.TEXT_MUTED }}>(Prepaid Only)</small></>}</td>
                        <td style={{ padding: '14px', borderTop: `1px solid ${T.DIVIDER}` }}>{i.serviceable ? <span style={{ padding: '5px 11px', borderRadius: 99, background: `${T.GREEN}18`, color: T.GREEN, fontSize: 12.5, fontWeight: 700 }}>✓ Serviceable</span> : <span title={i.reason} style={{ padding: '5px 11px', borderRadius: 99, background: `${T.RED}14`, color: T.RED, fontSize: 12, fontWeight: 700 }}>✕ {i.reason}</span>}</td>
                        <td style={{ padding: '14px', borderTop: `1px solid ${T.DIVIDER}` }}><button type="button" disabled={!i.serviceable} onClick={() => select(i)} style={{ height: 36, padding: '0 16px', borderRadius: 8, border: '1px solid #3877fc', background: T.SURFACE, color: '#3877fc', fontWeight: 750, fontSize: 13, cursor: i.serviceable ? 'pointer' : 'not-allowed', opacity: i.serviceable ? 1 : 0.5 }}>Select →</button></td>
                      </tr>
                    );
                  })}</tbody>
                </table>
              </div>
            </section>
          </div>

          <aside style={{ display: 'grid', gap: 14 }}>
            <section style={{ ...CARD, padding: 18 }}>
              <b style={{ color: T.TEXT, fontSize: 15 }}>Serviceability Summary</b>
              <div style={{ marginTop: 12, marginBottom: 6 }}><b style={{ color: ok ? T.GREEN : T.RED, fontSize: 17 }}>{ok ? '✓ Deliverable' : '✕ Not deliverable'}</b><span style={{ display: 'block', color: T.TEXT_SECONDARY, fontSize: 12.5, marginTop: 3 }}>{ok ? 'Your shipment can be delivered to this pincode.' : 'Try a different pincode or weight.'}</span></div>
              <Stat icon="🚚" label="Total Couriers Available" value={sum.serviceableCount} />
              <Stat icon="⏱" label="Fastest Delivery" value={sum.fastest ? days(sum.fastest) : '—'} />
              <Stat icon="🛡" label="COD Available" value={`${sum.codCount} out of ${sum.serviceableCount}`} />
            </section>
            <section style={{ ...CARD, padding: 18, background: '#3877fc0a' }}>
              <b style={{ color: T.TEXT, fontSize: 15 }}>ⓘ Quick Info</b>
              <ul style={{ margin: '10px 0 0', paddingLeft: 18, color: T.TEXT_SECONDARY, fontSize: 12.5, lineHeight: 1.7 }}>
                <li>Serviceability depends on the weight and delivery area.</li>
                <li>Remote (out-of-delivery-area) pincodes are served by fewer couriers.</li>
                <li>Rates and delivery estimates are indicative and may vary.</li>
              </ul>
            </section>
          </aside>
        </div>
      )}
    </div>
  );
}
