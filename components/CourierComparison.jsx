'use client';

import { useMemo, useState } from 'react';
import * as T from '@/lib/theme';

const BRAND = { Delhivery: '#C8102E', 'Blue Dart': '#0057B8', XpressBees: '#F58220', 'Ecom Express': '#D2232A', DTDC: '#1B3A8A', 'Ekart Logistics': '#2874F0', 'India Post': '#D22030' };
const SORTS = [['lowest', 'Cheapest'], ['fastest', 'Fastest'], ['cod', 'COD only']];
const inr = (v) => `₹${Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const days = (t) => (t.minDays === t.maxDays ? `${t.minDays} day${t.minDays === 1 ? '' : 's'}` : `${t.minDays}–${t.maxDays} days`);
const modeOf = (q) => (/air|express/i.test(q.service.type || '') ? 'Air' : 'Surface');

const TH = { padding: '8px 12px', textAlign: 'left', fontSize: 10.5, fontWeight: 800, letterSpacing: '.07em', textTransform: 'uppercase', color: T.TEXT_MUTED, background: 'var(--nx-table-head-bg)', whiteSpace: 'nowrap' };
const TD = { padding: '10px 12px', borderTop: `1px solid ${T.DIVIDER}`, fontSize: 13, color: T.TEXT, verticalAlign: 'middle' };

// Compact courier table: one row per option, whole row is the select target, no inner scrolling.
// `quotes` and `unavailable` come straight from POST /v1/shipping/quotes.
export default function CourierComparison({ quotes = [], unavailable = [], loading = false, message, selectedKey, onSelect, paymentMode = 'prepaid' }) {
  const [sort, setSort] = useState('lowest');
  const keyOf = (q) => `${q.provider.code}:${q.service.code}`;

  const rows = useMemo(() => {
    let list = [...quotes];
    if (sort === 'cod') list = list.filter((q) => q.codAvailable);
    if (sort === 'fastest') list.sort((a, b) => a.tat.minDays - b.tat.minDays || a.tat.maxDays - b.tat.maxDays || a.price.total - b.price.total);
    else list.sort((a, b) => a.price.total - b.price.total);
    return list;
  }, [quotes, sort]);

  const note = loading ? 'Fetching courier rates…' : message || (!rows.length ? (sort === 'cod' ? 'No courier offers cash on delivery for this destination.' : 'No courier is available for this destination and weight.') : '');

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
        {SORTS.map(([id, label]) => (
          <button key={id} type="button" onClick={() => setSort(id)} aria-pressed={sort === id} style={{ height: 28, padding: '0 11px', borderRadius: 7, border: `1px solid ${sort === id ? T.NAVY : T.BORDER}`, background: sort === id ? T.NAVY : T.SURFACE, color: sort === id ? '#fff' : T.TEXT_SECONDARY, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{label}</button>
        ))}
        <span style={{ marginLeft: 'auto', color: T.TEXT_MUTED, fontSize: 11.5 }}>{!loading && !message && rows.length ? `${rows.length} option${rows.length === 1 ? '' : 's'} · ${paymentMode === 'cod' ? 'COD' : 'Prepaid'} · rates include fuel surcharge, excl. GST` : ''}</span>
      </div>

      {note ? (
        <div style={{ padding: '22px 14px', textAlign: 'center', color: T.TEXT_MUTED, fontSize: 13, border: `1px dashed ${T.BORDER}`, borderRadius: 10 }}>{note}</div>
      ) : (
        <div style={{ border: `1px solid ${T.BORDER}`, borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: 560, borderCollapse: 'collapse' }}>
              <thead><tr><th style={{ ...TH, width: 34 }} /><th style={TH}>Courier</th><th style={TH}>Mode</th><th style={TH}>Delivery</th><th style={TH}>COD</th><th style={{ ...TH, textAlign: 'right' }}>Charge</th></tr></thead>
              <tbody>
                {rows.map((q) => {
                  const key = keyOf(q); const selected = selectedKey === key; const brand = BRAND[q.provider.name] || T.NAVY;
                  const pick = () => onSelect && onSelect(q, key);
                  return (
                    <tr key={key} onClick={pick} style={{ cursor: onSelect ? 'pointer' : 'default', background: selected ? 'rgba(27,159,214,.09)' : undefined }}>
                      <td style={TD}><input type="radio" name="courier" aria-label={`Select ${q.provider.name} ${q.service.name}`} checked={selected} onChange={pick} /></td>
                      <td style={TD}>
                        <b style={{ color: brand }}>{q.provider.name}</b> <span style={{ color: T.TEXT_SECONDARY }}>{q.service.name}</span>
                        {q.tags?.includes('cheapest') && <span style={{ marginLeft: 7, padding: '2px 6px', borderRadius: 5, background: `${T.GREEN}16`, color: T.GREEN, fontSize: 10.5, fontWeight: 800 }}>Best value</span>}
                        {q.tags?.includes('fastest') && <span style={{ marginLeft: 5, padding: '2px 6px', borderRadius: 5, background: `${T.AMBER}16`, color: T.AMBER, fontSize: 10.5, fontWeight: 800 }}>Fastest</span>}
                      </td>
                      <td style={{ ...TD, color: T.TEXT_SECONDARY }}>{modeOf(q)}</td>
                      <td style={TD}><b>{days(q.tat)}</b><small style={{ display: 'block', color: T.TEXT_MUTED, fontSize: 11 }}>{q.tat.earliest} – {q.tat.latest}</small></td>
                      <td style={{ ...TD, color: q.codAvailable ? T.GREEN : T.TEXT_MUTED }}>{q.codAvailable ? `Yes · ₹${q.codFee}` : 'No'}</td>
                      <td style={{ ...TD, textAlign: 'right' }} title={`Freight ${inr(q.price.transport)} · Fuel ${inr(q.price.fuelSurcharge)} · COD ${inr(q.price.codFee)}`}><b style={{ fontSize: 15 }}>{inr(q.price.total)}</b></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {!loading && !message && unavailable.length > 0 && (
        <div style={{ marginTop: 9, color: T.TEXT_MUTED, fontSize: 11.5 }}>
          <b style={{ color: T.TEXT_SECONDARY }}>Not available here:</b> {unavailable.map((u) => `${u.provider.name} (${u.reason})`).join(' · ')}
        </div>
      )}
    </div>
  );
}
