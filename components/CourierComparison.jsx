'use client';

import { useMemo, useState } from 'react';
import * as T from '@/lib/theme';

const BRAND = { Delhivery: '#C8102E', 'Blue Dart': '#0057B8', XpressBees: '#F58220', 'Ecom Express': '#D2232A', DTDC: '#1B3A8A', 'Ekart Logistics': '#2874F0', 'India Post': '#D22030' };
const FILTERS = [['all', 'All couriers'], ['lowest', 'Lowest price'], ['fastest', 'Fastest delivery'], ['cod', 'COD available']];
const inr = (v) => `₹${Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const days = (t) => (t.minDays === t.maxDays ? `${t.minDays} Day${t.minDays === 1 ? '' : 's'}` : `${t.minDays} – ${t.maxDays} Days`);

function Chip({ children, tone = 'ok' }) {
  const color = tone === 'ok' ? T.GREEN : tone === 'warn' ? T.AMBER : T.TEXT_MUTED;
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 99, background: `${tone === 'muted' ? '#8391a0' : color}14`, color, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>{children}</span>;
}

// Courier options with price, delivery window, COD availability and a select action.
// `quotes` and `unavailable` come straight from POST /v1/shipping/quotes.
export default function CourierComparison({ quotes = [], unavailable = [], loading = false, message, selectedKey, onSelect, paymentMode = 'prepaid', title = 'Courier comparison', subtitle = 'Compare rates, delivery estimates and COD support', actionLabel = 'Select', compact = false }) {
  const [filter, setFilter] = useState('all');
  const [open, setOpen] = useState({});
  const keyOf = (q) => `${q.provider.code}:${q.service.code}`;

  const rows = useMemo(() => {
    let list = [...quotes];
    if (filter === 'cod') list = list.filter((q) => q.codAvailable);
    if (filter === 'lowest') list.sort((a, b) => a.price.total - b.price.total);
    if (filter === 'fastest') list.sort((a, b) => a.tat.minDays - b.tat.minDays || a.tat.maxDays - b.tat.maxDays || a.price.total - b.price.total);
    return list;
  }, [quotes, filter]);

  return (
    <section style={{ background: 'var(--nx-surface)', border: `1px solid ${T.BORDER}`, borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ padding: '14px 16px', background: T.SURFACE_SOFT, borderBottom: `1px solid ${T.DIVIDER}`, display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
        <div><b style={{ color: T.TEXT, fontSize: 15 }}>{title}</b><span style={{ display: 'block', marginTop: 3, color: T.TEXT_MUTED, fontSize: 12.5 }}>{subtitle}</span></div>
        <Chip>● Live rates</Chip>
      </div>
      <div style={{ padding: '12px 16px 4px', display: 'flex', gap: 7, flexWrap: 'wrap' }}>
        {FILTERS.map(([id, label]) => (
          <button key={id} type="button" onClick={() => setFilter(id)} aria-pressed={filter === id} style={{ height: 30, padding: '0 12px', borderRadius: 99, border: `1px solid ${filter === id ? T.NAVY : T.BORDER}`, background: filter === id ? T.NAVY : T.SURFACE, color: filter === id ? '#fff' : T.TEXT_SECONDARY, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{label}</button>
        ))}
      </div>
      <div style={{ padding: 16, display: 'grid', gap: 11 }}>
        {loading && <div style={{ padding: 18, textAlign: 'center', color: T.TEXT_MUTED, fontSize: 13 }}>Fetching courier rates…</div>}
        {!loading && message && <div style={{ padding: 18, textAlign: 'center', color: T.TEXT_MUTED, fontSize: 13 }}>{message}</div>}
        {!loading && !message && !rows.length && <div style={{ padding: 18, textAlign: 'center', color: T.TEXT_SECONDARY, fontSize: 13 }}>{filter === 'cod' ? 'No courier offers cash on delivery for this destination.' : 'No courier is available for this destination and weight.'}</div>}
        {!loading && !message && rows.map((q) => {
          const key = keyOf(q); const selected = selectedKey === key; const brand = BRAND[q.provider.name] || T.NAVY;
          return (
            <article key={key} style={{ padding: 14, borderRadius: 11, border: `${selected ? 2 : 1}px solid ${selected ? T.ACCENT : T.BORDER}`, background: selected ? 'rgba(0,215,195,.06)' : T.SURFACE }}>
              <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : '104px minmax(0,1fr) auto', gap: 12, alignItems: 'center' }}>
                <div style={{ fontWeight: 900, fontSize: 15, letterSpacing: '-.02em', color: brand, lineHeight: 1.1 }}>{q.provider.name}<span style={{ display: 'block', marginTop: 3, fontSize: 10.5, fontWeight: 600, color: T.TEXT_MUTED, letterSpacing: 0 }}>{q.service.tagline || q.service.name}</span></div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                    <b style={{ color: T.TEXT, fontSize: 14 }}>{q.service.name}</b>
                    {q.tags?.includes('cheapest') && <Chip>Best value</Chip>}
                    {q.tags?.includes('fastest') && <Chip tone="warn">Fastest</Chip>}
                  </div>
                  <div style={{ marginTop: 5, color: T.TEXT_SECONDARY, fontSize: 12.5 }}>🗓 <b style={{ color: T.TEXT }}>{days(q.tat)}</b> · {q.tat.earliest} – {q.tat.latest}</div>
                  <div style={{ marginTop: 7, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {q.codAvailable ? <Chip>✓ COD available (₹{q.codFee})</Chip> : <Chip tone="muted">COD not available · prepaid only</Chip>}
                    <Chip>✓ Serviceable</Chip>
                  </div>
                </div>
                <div style={{ textAlign: compact ? 'left' : 'right' }}>
                  <div style={{ fontSize: 21, fontWeight: 800, color: T.TEXT }}>{inr(q.price.total)}</div>
                  <div style={{ fontSize: 11, color: T.TEXT_MUTED }}>({paymentMode === 'cod' ? 'COD' : 'Prepaid'})</div>
                  {onSelect && <button type="button" onClick={() => onSelect(q, key)} style={{ marginTop: 8, height: 34, padding: '0 14px', borderRadius: 8, border: `1px solid ${T.NAVY}`, background: selected ? T.NAVY : T.SURFACE, color: selected ? '#fff' : T.NAVY, fontSize: 12.5, fontWeight: 750, cursor: 'pointer' }}>{selected ? '✓ Selected' : `${actionLabel} →`}</button>}
                </div>
              </div>
              <button type="button" onClick={() => setOpen((o) => ({ ...o, [key]: !o[key] }))} style={{ marginTop: 9, border: 0, background: 'transparent', color: T.ACCENT, fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: 0 }}>{open[key] ? 'Hide details ▴' : 'View details ▾'}</button>
              {open[key] && (
                <div style={{ marginTop: 8, padding: '10px 12px', borderRadius: 8, background: T.SURFACE_SOFT, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 8, fontSize: 12 }}>
                  {[['Freight charge', inr(q.price.transport)], ['Fuel surcharge', inr(q.price.fuelSurcharge)], ['COD fee', inr(q.price.codFee)], ['Total', inr(q.price.total)], ['Service', q.service.type]].map(([l, v]) => <span key={l}><span style={{ display: 'block', color: T.TEXT_MUTED, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.05em' }}>{l}</span><b style={{ color: T.TEXT, textTransform: l === 'Service' ? 'capitalize' : 'none' }}>{v}</b></span>)}
                </div>
              )}
            </article>
          );
        })}
        {!loading && !message && unavailable.length > 0 && (
          <div style={{ padding: '10px 12px', borderRadius: 8, background: T.SURFACE_SOFT, color: T.TEXT_MUTED, fontSize: 12 }}>
            <b style={{ color: T.TEXT_SECONDARY }}>Not available here:</b> {unavailable.map((u) => `${u.provider.name} (${u.reason})`).join(' · ')}
          </div>
        )}
      </div>
      <div style={{ padding: '10px 16px', borderTop: `1px solid ${T.DIVIDER}`, background: '#2454D60d', color: T.TEXT_SECONDARY, fontSize: 11.5 }}>ⓘ Rates are indicative and may vary based on weight, zone and actual serviceability.</div>
    </section>
  );
}
