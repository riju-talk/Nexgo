'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import { useAppState } from '@/lib/AppStateContext';
import * as T from '@/lib/theme';

const CARD = { background: 'var(--nx-surface)', border: '1px solid var(--nx-border)', borderRadius: 10, boxShadow: '0 1px 2px rgba(20,44,66,.04), 0 8px 24px rgba(20,44,66,.045)' };
const inr = (paise) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Number(paise || 0) / 100);
const title = (v = '') => String(v).replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const stamp = (v) => (v ? new Date(v).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—');

const STAGES = ['booked', 'in_transit', 'out_for_delivery', 'delivered'];
const FILTERS = [['all', 'All'], ['booked', 'Booked'], ['in_transit', 'In transit'], ['out_for_delivery', 'Out for delivery'], ['delivered', 'Delivered'], ['ndr', 'NDR'], ['rto', 'RTO'], ['cancelled', 'Cancelled']];
const tone = (state) => (state === 'delivered' ? T.GREEN : state === 'ndr' || state === 'rto' ? T.AMBER : state === 'cancelled' ? T.RED : T.ACCENT);

function Pill({ state }) {
  const c = tone(state);
  return <span style={{ display: 'inline-flex', padding: '3px 8px', borderRadius: 99, color: c, background: `${c}14`, fontWeight: 740, fontSize: 11.5, whiteSpace: 'nowrap' }}>{title(state)}</span>;
}

function Btn({ children, onClick, primary, disabled }) {
  return <button disabled={disabled} onClick={onClick} style={{ height: 32, padding: '0 11px', borderRadius: 8, border: `1px solid ${primary ? T.NAVY : T.INPUT_BORDER}`, background: primary ? T.NAVY : T.SURFACE, color: primary ? '#fff' : T.TEXT, fontSize: 12, fontWeight: 720, cursor: disabled ? 'wait' : 'pointer', opacity: disabled ? 0.6 : 1 }}>{children}</button>;
}

// Four-step progress rail for the happy path; NDR/RTO/cancelled show as a flagged state instead.
function Progress({ state }) {
  const idx = STAGES.indexOf(state);
  const off = idx < 0;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 4, margin: '14px 0 4px' }}>
      {STAGES.map((s, i) => (
        <div key={s}>
          <div style={{ height: 5, borderRadius: 4, background: !off && i <= idx ? tone(state) : T.BORDER }} />
          <div style={{ marginTop: 6, fontSize: 10.5, fontWeight: !off && i === idx ? 750 : 560, color: !off && i <= idx ? T.TEXT_LABEL : T.TEXT_MUTED }}>{title(s)}</div>
        </div>
      ))}
    </div>
  );
}

function Detail({ shipment, mobile, onClose }) {
  const { showToast, nav } = useAppState();
  const [events, setEvents] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    apiFetch(`/v1/shipments/${shipment.id}/tracking`).then((x) => live && setEvents(x.items || [])).catch(() => live && setEvents([]));
    return () => { live = false; };
  }, [shipment.id]);

  const label = async () => {
    setBusy(true);
    try {
      const existing = await apiFetch(`/v1/shipments/${shipment.id}/label`).catch(() => null);
      if (existing?.status === 'ready' && existing.downloadUrl) { window.open(existing.downloadUrl, '_blank', 'noopener'); return; }
      if (!existing) { await apiFetch(`/v1/shipments/${shipment.id}/label`, { method: 'POST' }); showToast('Label is being generated. Press Get label again in a moment.'); return; }
      showToast('Label is still being generated. Try again in a moment.');
    } catch (e) { showToast(e instanceof ApiError ? e.message : 'Label could not be fetched', 'error'); } finally { setBusy(false); }
  };
  const copy = () => { navigator.clipboard?.writeText(shipment.awb).then(() => showToast('AWB copied')).catch(() => showToast('Copy is not available in this browser', 'error')); };

  return (
    <aside style={{ ...CARD, padding: 18, position: mobile ? 'static' : 'sticky', top: 120, alignSelf: 'start' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <span style={{ color: T.TEXT_MUTED, fontSize: 11, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase' }}>AWB</span>
          <b style={{ display: 'block', marginTop: 5, fontFamily: T.MONO, fontSize: 16, color: T.TEXT, wordBreak: 'break-all' }}>{shipment.awb}</b>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}><Pill state={shipment.state} /><button aria-label="Close tracking panel" onClick={onClose} style={{ border: 0, background: 'transparent', color: T.TEXT_MUTED, fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>×</button></div>
      </div>
      <Progress state={shipment.state} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 14px', margin: '14px 0', paddingTop: 14, borderTop: `1px solid ${T.DIVIDER}` }}>
        {[['Order', shipment.order_number], ['Courier', `${shipment.courier_name} · ${shipment.service_name}`], ['Deliver to', `${shipment.customer_name}, ${shipment.customer_city} ${shipment.customer_pincode}`], ['Payment', String(shipment.payment_mode || '').toUpperCase()], ['Billed weight', `${(shipment.chargeable_weight_g / 1000).toFixed(2)} kg`], ['Shipping charge', inr(shipment.shipping_charge_paise)]].map(([k, v]) => (
          <div key={k} style={{ minWidth: 0 }}><span style={{ color: T.TEXT_MUTED, fontSize: 10.5, fontWeight: 800, letterSpacing: '.07em', textTransform: 'uppercase' }}>{k}</span><div style={{ marginTop: 4, color: T.TEXT_LABEL, fontSize: 13, fontWeight: 620 }}>{v}</div></div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 14 }}><Btn primary disabled={busy} onClick={label}>Get label</Btn><Btn onClick={copy}>Copy AWB</Btn><Btn onClick={() => nav('ndr')}>View NDR report</Btn></div>
      <b style={{ color: T.TEXT, fontSize: 13.5 }}>Tracking history</b>
      <div style={{ marginTop: 10 }}>
        {!events ? <span style={{ color: T.TEXT_MUTED, fontSize: 13 }}>Loading scans…</span>
          : !events.length ? <span style={{ color: T.TEXT_MUTED, fontSize: 13 }}>The courier has not posted a scan yet.</span>
          : events.map((e, i) => (
            <div key={`${e.occurred_at}-${i}`} style={{ display: 'grid', gridTemplateColumns: '14px 1fr', gap: 10, paddingBottom: 14 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}><span style={{ width: 10, height: 10, marginTop: 3, borderRadius: 99, background: i === 0 ? tone(shipment.state) : T.BORDER }} />{i < events.length - 1 && <span style={{ flex: 1, width: 1.5, background: T.BORDER, marginTop: 3 }} />}</div>
              <div><b style={{ display: 'block', color: T.TEXT_LABEL, fontSize: 13 }}>{e.description || title(e.state)}</b><small style={{ display: 'block', marginTop: 3, color: T.TEXT_MUTED }}>{stamp(e.occurred_at)} · {e.location || 'Courier network'}</small></div>
            </div>
          ))}
      </div>
    </aside>
  );
}

export default function LiveTrack({ mobile }) {
  const { nav } = useAppState();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(null);

  const load = useCallback(() => apiFetch('/v1/shipments').then((x) => { setRows(x.items || []); setError(null); }).catch(setError), []);
  useEffect(() => { load(); }, [load]);

  const counts = useMemo(() => {
    const c = { all: rows?.length || 0 };
    (rows || []).forEach((r) => { c[r.state] = (c[r.state] || 0) + 1; });
    return c;
  }, [rows]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (rows || []).filter((r) => (filter === 'all' || r.state === filter) && (!q || [r.awb, r.order_number, r.customer_name, r.customer_pincode, r.courier_name].some((v) => String(v || '').toLowerCase().includes(q))));
  }, [rows, filter, query]);

  const selected = rows?.find((r) => r.id === selectedId) || null;
  const pad = mobile ? '12px 12px 28px' : '16px 22px 32px';

  if (error) {
    const unauth = error instanceof ApiError && error.status === 401;
    return <div style={{ padding: pad }}><div style={{ ...CARD, minHeight: 74, padding: '18px 26px', display: 'flex', alignItems: 'center', gap: 8, color: T.TEXT_SECONDARY, fontSize: 13.5 }}>{unauth ? 'Sign in to track your shipments.' : 'Shipments could not be loaded right now.'}{unauth ? <button onClick={() => nav('login')} style={{ border: 0, background: 'transparent', color: T.ACCENT, fontWeight: 750, cursor: 'pointer' }}>Sign in</button> : <button onClick={load} style={{ border: 0, background: 'transparent', color: T.ACCENT, fontWeight: 750, cursor: 'pointer' }}>Retry</button>}</div></div>;
  }
  if (!rows) return <div style={{ padding: pad }}><div style={{ ...CARD, padding: 26, color: T.TEXT_MUTED, fontSize: 13 }}>Loading shipments…</div></div>;

  const exportCsv = () => {
    const text = [['AWB', 'Order', 'Customer', 'Pincode', 'Courier', 'Payment', 'Charge INR', 'Status'], ...visible.map((r) => [r.awb, r.order_number, r.customer_name, r.customer_pincode, r.courier_name, r.payment_mode, r.shipping_charge_paise / 100, r.state])].map((r) => r.map((c) => `"${String(c ?? '').replaceAll('"', '""')}"`).join(',')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' })); a.download = 'shipments.csv'; a.click(); URL.revokeObjectURL(a.href);
  };

  const inFlight = (counts.booked || 0) + (counts.in_transit || 0) + (counts.out_for_delivery || 0);
  const exceptions = (counts.ndr || 0) + (counts.rto || 0);
  const delivered = counts.delivered || 0;
  const rate = rows.length ? Math.round((delivered / rows.length) * 100) : 0;

  return (
    <div style={{ padding: pad }}>
      <div style={{ display: 'grid', gridTemplateColumns: mobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: 12, marginBottom: 14 }}>
        {[['Total shipments', rows.length], ['In flight', inFlight], ['Needs attention', exceptions], ['Delivered', `${delivered} · ${rate}%`]].map(([label, value]) => (
          <section key={label} style={{ ...CARD, padding: 14 }}><span style={{ color: T.TEXT_MUTED, fontSize: 10.5, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase' }}>{label}</span><div style={{ marginTop: 7, color: T.TEXT, fontSize: 22, fontWeight: 760 }}>{value}</div></section>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <input aria-label="Search shipments" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search AWB, order, customer or pincode" style={{ flex: '1 1 260px', height: 38, boxSizing: 'border-box', borderRadius: 8, border: `1px solid ${T.INPUT_BORDER}`, background: T.SURFACE, color: T.TEXT, padding: '0 12px', fontSize: 13, outline: 'none' }} />
        <Btn onClick={load}>Refresh</Btn><Btn onClick={exportCsv} disabled={!visible.length}>Export CSV</Btn><Btn primary onClick={() => nav('orders')}>Ship an order</Btn>
      </div>
      <div role="tablist" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
        {FILTERS.map(([key, label]) => {
          const on = filter === key;
          return <button key={key} role="tab" aria-selected={on} onClick={() => setFilter(key)} style={{ height: 32, padding: '0 12px', borderRadius: 99, border: `1px solid ${on ? T.NAVY : T.BORDER}`, background: on ? T.NAVY : T.SURFACE, color: on ? '#fff' : T.TEXT_SECONDARY, fontSize: 12.5, fontWeight: 680, cursor: 'pointer' }}>{label} <span style={{ opacity: 0.7, fontWeight: 600 }}>{counts[key] || 0}</span></button>;
        })}
      </div>

      {!rows.length ? (
        <section style={{ ...CARD, padding: 34, textAlign: 'center' }}><b style={{ color: T.TEXT, fontSize: 16 }}>No shipments yet</b><p style={{ color: T.TEXT_SECONDARY, fontSize: 13 }}>Create an order, compare rates and book a courier. Every shipment and its scans appear here.</p><Btn primary onClick={() => nav('b2c')}>Create an order</Btn></section>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: selected && !mobile ? 'minmax(0,1fr) 380px' : '1fr', gap: 14, alignItems: 'start' }}>
          <section style={{ ...CARD, overflow: 'hidden' }}>
            {!visible.length ? <div style={{ padding: 26, color: T.TEXT_MUTED, fontSize: 13 }}>No shipments match this filter.</div> : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', minWidth: 720, borderCollapse: 'collapse' }}>
                  <thead><tr>{['AWB', 'Order', 'Deliver to', 'Courier', 'Charge', 'Status', 'Booked'].map((h) => <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 10.5, letterSpacing: '.07em', color: T.TEXT_MUTED, background: T.TABLE_HEAD_BG, textTransform: 'uppercase' }}>{h}</th>)}</tr></thead>
                  <tbody>
                    {visible.map((r) => (
                      <tr key={r.id} onClick={() => setSelectedId(r.id)} style={{ cursor: 'pointer', background: r.id === selectedId ? 'rgba(0,179,164,.08)' : undefined }}>
                        {[<b key="a" style={{ fontFamily: T.MONO }}>{r.awb}</b>, r.order_number, <span key="c"><b>{r.customer_name}</b><small style={{ display: 'block', color: T.TEXT_MUTED, marginTop: 2 }}>{r.customer_city} · {r.customer_pincode}</small></span>, <span key="o"><b>{r.courier_name}</b><small style={{ display: 'block', color: T.TEXT_MUTED, marginTop: 2 }}>{r.service_name}</small></span>, inr(r.shipping_charge_paise), <Pill key="s" state={r.state} />, stamp(r.booked_at)].map((cell, i) => <td key={i} style={{ padding: '12px 14px', borderTop: `1px solid ${T.DIVIDER}`, color: T.TEXT_LABEL, fontSize: 13 }}>{cell}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          {selected && <Detail key={selected.id} shipment={selected} mobile={mobile} onClose={() => setSelectedId(null)} />}
        </div>
      )}
    </div>
  );
}
