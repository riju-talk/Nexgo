'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import { useAppState } from '@/lib/AppStateContext';
import { FORMATS, saveRows } from '@/lib/exportFile';
import * as T from '@/lib/theme';

const CARD = { background: 'var(--nx-surface)', border: `1px solid ${T.BORDER}`, borderRadius: 12 };
const FIELD = { height: 38, boxSizing: 'border-box', border: `1px solid ${T.INPUT_BORDER}`, borderRadius: 8, background: T.SURFACE, color: T.TEXT, padding: '0 10px', fontSize: 13, outline: 'none' };
const STATUS = { open: ['Action needed', '#C2410C', '#F5822018'], disputed: ['Disputed', '#2454D6', '#2454D614'], accepted: ['Accepted', '#6B7280', '#6B728018'], won: ['Won', T.GREEN, `${T.GREEN}18`], lost: ['Lost', T.RED, `${T.RED}16`], withdrawn: ['Withdrawn', '#6B7280', '#6B728018'] };
const TABS = [['', 'All'], ['open', 'Action needed'], ['disputed', 'Disputed'], ['accepted', 'Accepted'], ['won', 'Won'], ['lost', 'Lost'], ['withdrawn', 'Withdrawn']];
const kg = (g) => `${(Number(g) / 1000).toFixed(2)} kg`;
const inr = (paise) => `₹${(Number(paise || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (v) => (v ? new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

function Pill({ s }) { const [label, color, bg] = STATUS[s] || [s, T.TEXT, T.SURFACE_SOFT]; return <span style={{ display: 'inline-block', padding: '4px 9px', borderRadius: 6, background: bg, color, fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap' }}>{label}</span>; }
function Btn({ children, onClick, primary, danger, disabled, small }) { return <button type="button" disabled={disabled} onClick={onClick} style={{ height: small ? 32 : 38, padding: `0 ${small ? 11 : 16}px`, borderRadius: 8, border: `1px solid ${primary ? '#2454D6' : danger ? T.RED : T.BORDER}`, background: primary ? '#2454D6' : danger ? T.RED : T.SURFACE, color: primary || danger ? '#fff' : T.TEXT, fontWeight: 700, fontSize: small ? 12.5 : 13.5, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.55 : 1 }}>{children}</button>; }

function ActionDialog({ row, onClose, onDone }) {
  const { showToast } = useAppState();
  const open = row.status === 'open';
  const [action, setAction] = useState('dispute');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const extra = Number(row.additional_charge_paise);
  const needsNotes = action === 'dispute';
  const ok = !needsNotes || notes.trim().length >= 10;
  const submit = async () => {
    setBusy(true);
    try { await apiFetch(`/v1/weight-disputes/${row.id}/action`, { method: 'POST', body: { action, sellerNotes: notes.trim() || undefined } }); showToast(action === 'dispute' ? 'Dispute submitted to the courier' : action === 'accept' ? `Charge accepted — ${inr(extra)} debited from your wallet` : 'Dispute withdrawn'); onDone(); }
    catch (e) { showToast(e instanceof ApiError ? e.message : 'Action failed', 'error'); setBusy(false); }
  };
  return (
    <div role="dialog" aria-modal="true" aria-label="Weight discrepancy" onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(8,16,30,.5)', display: 'grid', placeItems: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...CARD, width: 'min(100%, 520px)', maxHeight: '92vh', overflow: 'auto', padding: 22 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><div><b style={{ fontSize: 17, color: T.TEXT }}>{open ? 'Respond to weight discrepancy' : 'Dispute details'} · {row.order_number}</b><span style={{ display: 'block', marginTop: 3, fontFamily: T.MONO, fontSize: 12, color: T.TEXT_MUTED }}>{row.awb} · {row.courier_name}</span></div><button type="button" aria-label="Close" onClick={onClose} style={{ border: 0, background: 'transparent', fontSize: 22, color: T.TEXT_MUTED, cursor: 'pointer' }}>×</button></div>
        <div style={{ marginTop: 14, padding: 12, borderRadius: 9, background: T.SURFACE_SOFT, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 13 }}>
          {[['Declared weight', kg(row.declared_weight_g)], ['Billed weight', kg(row.billed_weight_g)], ['Difference', `+${kg(row.difference_g)}`], ['Original charge', inr(row.original_charge_paise)], ['Revised charge', inr(row.disputed_charge_paise)], ['Extra charge', inr(extra)], ['Amount held', inr(row.held_amount_paise)], ['Respond by', day(row.dispute_deadline)]].map(([l, v]) => <span key={l}><span style={{ display: 'block', fontSize: 10.5, color: T.TEXT_MUTED, textTransform: 'uppercase', letterSpacing: '.05em' }}>{l}</span><b style={{ color: T.TEXT }}>{v}</b></span>)}
        </div>
        {row.courier_notes && <p style={{ margin: '12px 0 0', fontSize: 12.5, color: T.TEXT_SECONDARY }}><b>Courier:</b> {row.courier_notes}</p>}
        {!open && <div style={{ marginTop: 12, display: 'grid', gap: 6, fontSize: 13, color: T.TEXT_SECONDARY }}><span>Status: <Pill s={row.status} /></span>{row.seller_notes && <span><b>Your note:</b> {row.seller_notes}</span>}{row.resolved_at && <span>Resolved on {day(row.resolved_at)}</span>}</div>}
        {open && (
          <div style={{ marginTop: 14, display: 'grid', gap: 12 }}>
            <div style={{ display: 'grid', gap: 8 }}>
              {[['dispute', 'Dispute the weight', 'Send your evidence to the courier. The held amount stays on hold until they decide.'], ['accept', 'Accept the charge', `${inr(extra)} is debited from your wallet and the case closes.`], ['withdraw', 'Withdraw', 'Close the case and pay the extra charge.']].map(([id, title, hint]) => (
                <label key={id} style={{ display: 'flex', gap: 10, padding: '10px 12px', borderRadius: 9, border: `1px solid ${action === id ? '#2454D6' : T.BORDER}`, background: action === id ? '#2454D608' : T.SURFACE, cursor: 'pointer' }}>
                  <input type="radio" name="wd-action" checked={action === id} onChange={() => setAction(id)} style={{ marginTop: 3 }} /><span><b style={{ color: T.TEXT, fontSize: 13.5 }}>{title}</b><small style={{ display: 'block', color: T.TEXT_MUTED, marginTop: 2 }}>{hint}</small></span>
                </label>
              ))}
            </div>
            <label style={{ fontSize: 12.5, fontWeight: 650, color: T.TEXT_LABEL }}>{needsNotes ? 'Explain why the weight is wrong (min. 10 characters)' : 'Notes (optional)'}<textarea style={{ ...FIELD, width: '100%', height: 84, padding: 10, marginTop: 6, resize: 'vertical' }} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Parcel weighed 500g at packing; photos of the scale and box are available." /></label>
            {needsNotes && <small style={{ color: T.TEXT_MUTED }}>📎 Photo evidence upload is coming soon — describe what you have for now.</small>}
          </div>
        )}
        <div style={{ marginTop: 18, display: 'flex', justifyContent: 'flex-end', gap: 10 }}><Btn onClick={onClose}>{open ? 'Cancel' : 'Close'}</Btn>{open && <Btn primary={action === 'dispute'} danger={action !== 'dispute'} disabled={busy || !ok} onClick={submit}>{busy ? 'Submitting…' : action === 'dispute' ? 'Submit dispute' : action === 'accept' ? 'Accept charge' : 'Withdraw'}</Btn>}</div>
      </div>
    </div>
  );
}

export default function LiveWeightDisputes({ mobile }) {
  const { showToast } = useAppState();
  const [status, setStatus] = useState(''); const [page, setPage] = useState(1);
  const [qInput, setQInput] = useState(''); const [q, setQ] = useState('');
  const [courier, setCourier] = useState(''); const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const [tick, setTick] = useState(0);
  const [data, setData] = useState({ key: '', items: [], total: 0, pages: 1, error: '' });
  const [stats, setStats] = useState(null); const [couriers, setCouriers] = useState([]);
  const [selected, setSelected] = useState(() => new Set()); const [dialog, setDialog] = useState(null);
  const [busy, setBusy] = useState(false); const [format, setFormat] = useState('csv');

  useEffect(() => { const t = window.setTimeout(() => { setQ(qInput.trim()); setPage(1); }, 300); return () => window.clearTimeout(t); }, [qInput]);
  const params = useMemo(() => { const p = new URLSearchParams({ page: String(page), pageSize: '8' }); if (status) p.set('status', status); if (q) p.set('q', q); if (courier) p.set('courier', courier); if (from) p.set('from', from); if (to) p.set('to', to); return p.toString(); }, [status, page, q, courier, from, to]);
  const key = `${params}#${tick}`;
  useEffect(() => {
    let live = true;
    apiFetch(`/v1/weight-disputes?${params}`)
      .then((x) => { if (live) setData({ key, items: x.items, total: x.total, pages: x.pages, error: '' }); })
      .catch((e) => { if (live) setData({ key, items: [], total: 0, pages: 1, error: e.status === 401 ? 'Sign in to view weight discrepancies.' : e.message || 'Could not load weight discrepancies.' }); });
    return () => { live = false; };
  }, [params, key]);
  useEffect(() => { let live = true; apiFetch('/v1/weight-disputes/stats').then((x) => { if (live) setStats(x); }).catch(() => {}); return () => { live = false; }; }, [tick]);
  useEffect(() => { apiFetch('/v1/shipping/courier-options').then((x) => setCouriers([...new Map((x.items || []).map((c) => [c.code, c.name])).entries()])).catch(() => {}); }, []);

  const loading = data.key !== key;
  const refresh = () => { setSelected(new Set()); setTick((t) => t + 1); };
  const filter = (setter) => (e) => { setter(e.target.value); setPage(1); };
  const s = stats?.stats || stats || {}; const n = (v) => Number(v || 0);
  const anyFilter = q || courier || from || to;
  const openSelected = data.items.filter((r) => selected.has(r.id) && r.status === 'open');
  const toggle = (id) => setSelected((cur) => { const x = new Set(cur); if (x.has(id)) x.delete(id); else x.add(id); return x; });

  const bulk = async (action) => {
    if (!openSelected.length) return showToast('Select disputes that still need action.', 'error');
    if (action === 'dispute' && !window.confirm(`Dispute ${openSelected.length} charge(s)? Add details per case afterwards if the courier asks.`)) return;
    setBusy(true);
    try { const r = await apiFetch('/v1/weight-disputes/bulk-action', { method: 'POST', body: { disputeIds: openSelected.map((x) => x.id), action, sellerNotes: action === 'dispute' ? 'Disputed in bulk from the weight discrepancy page' : undefined } }); showToast(`${action === 'dispute' ? 'Disputed' : 'Accepted'} ${r.summary?.succeeded ?? openSelected.length} case(s)`); refresh(); }
    catch (e) { showToast(e.message || 'Bulk action failed', 'error'); } finally { setBusy(false); }
  };
  const exportAll = async () => {
    setBusy(true);
    try {
      const p = new URLSearchParams(params); p.set('pageSize', '100'); const rows = [];
      for (let pg = 1; pg <= 20; pg++) { p.set('page', String(pg)); const x = await apiFetch(`/v1/weight-disputes?${p}`); rows.push(...x.items); if (pg >= x.pages) break; }
      if (!rows.length) { showToast('Nothing to export for these filters.', 'error'); return; }
      await saveRows([['AWB', 'Order', 'Courier', 'Declared g', 'Billed g', 'Difference g', 'Original charge INR', 'Revised charge INR', 'Extra charge INR', 'Held INR', 'Status', 'Raised', 'Respond by', 'Resolved'], ...rows.map((r) => [r.awb, r.order_number, r.courier_name, r.declared_weight_g, r.billed_weight_g, r.difference_g, r.original_charge_paise / 100, r.disputed_charge_paise / 100, r.additional_charge_paise / 100, r.held_amount_paise / 100, r.status, day(r.raised_at), day(r.dispute_deadline), day(r.resolved_at)])], 'weight-discrepancies', format, 'Weight discrepancies');
      showToast(`Exported ${rows.length} rows (${format === 'xlsx' ? 'Excel' : 'CSV'})`);
    } catch (e) { showToast(e.message || 'Export failed', 'error'); } finally { setBusy(false); }
  };

  const kpis = [['Needs action', n(s.open_count), 'Respond before the deadline', '#F58220'], ['Disputed', n(s.disputed_count), 'Awaiting courier decision', '#2454D6'], ['Won', n(s.won_count), `${inr(s.total_saved_paise)} recovered`, '#14724F'], ['Accepted / lost', n(s.accepted_count) + n(s.lost_count), `${inr(s.total_cost_paise)} charged`, '#6B7280'], ['Amount on hold', inr(s.total_held_paise), n(s.urgent_count) ? `${n(s.urgent_count)} due within 3 days` : 'Held until resolved', '#B23A2B']];
  const pad = mobile ? '14px 12px 42px' : '18px 22px 48px';
  return (
    <div style={{ padding: pad }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
        <p style={{ margin: 0, color: T.TEXT_SECONDARY, fontSize: 13.5 }}>Shipments where the courier billed a higher weight than you declared. Dispute with evidence, or accept the revised charge.</p>
        <div style={{ display: 'flex', gap: 8 }}><select aria-label="Export format" value={format} onChange={(e) => setFormat(e.target.value)} style={FIELD}>{FORMATS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select><Btn onClick={exportAll} disabled={busy}>⤓ Export</Btn></div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: mobile ? 'repeat(2,1fr)' : 'repeat(5,1fr)', gap: 12, marginBottom: 14 }}>
        {kpis.map(([label, value, note, color]) => <div key={label} style={{ ...CARD, padding: 14, borderTop: `3px solid ${color}` }}><span style={{ fontSize: 11.5, color: T.TEXT_MUTED }}>{label}</span><b style={{ display: 'block', fontSize: 22, color: T.TEXT, marginTop: 3 }}>{value}</b><small style={{ color: T.TEXT_MUTED, fontSize: 11 }}>{note}</small></div>)}
      </div>
      <section style={CARD}>
        <div role="tablist" style={{ display: 'flex', gap: 4, padding: '4px 14px 0', borderBottom: `1px solid ${T.DIVIDER}`, overflowX: 'auto' }}>
          {TABS.map(([id, label]) => { const on = status === id; const count = id ? n(s[`${id}_count`]) : null; return <button key={id || 'all'} role="tab" aria-selected={on} type="button" onClick={() => { setStatus(id); setPage(1); setSelected(new Set()); }} style={{ padding: '12px 14px', border: 0, borderBottom: `3px solid ${on ? '#2454D6' : 'transparent'}`, background: 'transparent', color: on ? '#2454D6' : T.TEXT_SECONDARY, fontWeight: on ? 800 : 600, fontSize: 13.5, cursor: 'pointer', whiteSpace: 'nowrap' }}>{label}{count > 0 && <span style={{ marginLeft: 6, padding: '1px 7px', borderRadius: 99, background: id === 'open' ? T.RED : '#2454D6', color: '#fff', fontSize: 11 }}>{count}</span>}</button>; })}
        </div>
        <div style={{ padding: 14, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input aria-label="Search" style={{ ...FIELD, flex: '1 1 200px', minWidth: 160 }} placeholder="Search by AWB or Order ID…" value={qInput} onChange={(e) => setQInput(e.target.value)} />
          <select aria-label="Courier" style={FIELD} value={courier} onChange={filter(setCourier)}><option value="">All Couriers</option>{couriers.map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select>
          <input aria-label="From date" type="date" style={FIELD} value={from} max={to || undefined} onChange={filter(setFrom)} /><span style={{ color: T.TEXT_MUTED }}>–</span><input aria-label="To date" type="date" style={FIELD} value={to} min={from || undefined} onChange={filter(setTo)} />
          {anyFilter && <Btn small onClick={() => { setQInput(''); setQ(''); setCourier(''); setFrom(''); setTo(''); setPage(1); }}>Clear filters</Btn>}
        </div>
        {openSelected.length > 0 && <div style={{ margin: '0 14px 10px', padding: '8px 12px', borderRadius: 8, background: '#2454D60d', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 13 }}><b style={{ color: T.TEXT }}>{openSelected.length} selected</b><Btn small disabled={busy} onClick={() => bulk('dispute')}>Dispute all</Btn><Btn small danger disabled={busy} onClick={() => bulk('accept')}>Accept all charges</Btn><Btn small onClick={() => setSelected(new Set())}>Clear</Btn></div>}
        {data.error ? <div style={{ padding: 24, color: T.RED, fontSize: 13 }}>{data.error}</div> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: 980, borderCollapse: 'collapse' }}>
              <thead><tr><th style={{ width: 40, padding: '10px 14px', background: T.TABLE_HEAD_BG }} />{['Order / AWB', 'Courier', 'Declared → Billed', 'Extra charge', 'On hold', 'Respond by', 'Status', 'Action'].map((h) => <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11.5, color: T.TEXT_MUTED, background: T.TABLE_HEAD_BG, fontWeight: 700 }}>{h}</th>)}</tr></thead>
              <tbody>
                {loading && <tr><td colSpan={9} style={{ padding: 28, textAlign: 'center', color: T.TEXT_MUTED, fontSize: 13 }}>Loading weight discrepancies…</td></tr>}
                {!loading && !data.items.length && <tr><td colSpan={9} style={{ padding: 32, textAlign: 'center', color: T.TEXT_SECONDARY, fontSize: 13 }}>{anyFilter || status ? 'No weight discrepancies match these filters.' : 'No weight discrepancies — every shipment was billed at its declared weight.'}</td></tr>}
                {!loading && data.items.map((r) => {
                  const open = r.status === 'open'; const days = Number(r.days_until_deadline); const urgent = (r.status === 'open' || r.status === 'disputed') && days <= 2;
                  return (
                    <tr key={r.id}>
                      <td style={{ padding: '12px 14px', borderTop: `1px solid ${T.DIVIDER}` }}>{open && <input type="checkbox" aria-label={`Select ${r.order_number}`} checked={selected.has(r.id)} onChange={() => toggle(r.id)} />}</td>
                      <td style={{ padding: 12, borderTop: `1px solid ${T.DIVIDER}` }}><b style={{ color: '#2454D6', fontSize: 13 }}>{r.order_number}</b><small style={{ display: 'block', fontFamily: T.MONO, color: T.TEXT_MUTED, fontSize: 11.5 }}>{r.awb}</small></td>
                      <td style={{ padding: 12, borderTop: `1px solid ${T.DIVIDER}`, fontSize: 13 }}><b style={{ color: T.TEXT }}>{r.courier_name}</b><small style={{ display: 'block', color: T.TEXT_MUTED }}>{r.service_name}</small></td>
                      <td style={{ padding: 12, borderTop: `1px solid ${T.DIVIDER}`, fontSize: 13, color: T.TEXT }}>{kg(r.declared_weight_g)} → <b>{kg(r.billed_weight_g)}</b><small style={{ display: 'block', color: T.AMBER, fontWeight: 700 }}>+{kg(r.difference_g)}</small></td>
                      <td style={{ padding: 12, borderTop: `1px solid ${T.DIVIDER}`, fontSize: 13.5, fontWeight: 700, color: T.TEXT }}>{inr(r.additional_charge_paise)}</td>
                      <td style={{ padding: 12, borderTop: `1px solid ${T.DIVIDER}`, fontSize: 13, color: T.TEXT_SECONDARY }}>{inr(r.held_amount_paise)}</td>
                      <td style={{ padding: 12, borderTop: `1px solid ${T.DIVIDER}`, fontSize: 12.5, whiteSpace: 'nowrap', color: urgent ? T.RED : T.TEXT_SECONDARY }}>{r.status === 'open' || r.status === 'disputed' ? <><b>{day(r.dispute_deadline)}</b><small style={{ display: 'block' }}>{days < 0 ? 'overdue' : days < 1 ? 'due today' : `${Math.ceil(days)} day${Math.ceil(days) === 1 ? '' : 's'} left`}</small></> : '—'}</td>
                      <td style={{ padding: 12, borderTop: `1px solid ${T.DIVIDER}` }}><Pill s={r.status} /></td>
                      <td style={{ padding: 12, borderTop: `1px solid ${T.DIVIDER}` }}><Btn small primary={open} onClick={() => setDialog(r)}>{open ? 'Respond' : 'View'}</Btn></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ padding: '12px 14px', display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap', borderTop: `1px solid ${T.DIVIDER}`, fontSize: 13, color: T.TEXT_SECONDARY }}>
          <span>{data.total ? `Showing ${(page - 1) * 8 + 1} to ${Math.min(page * 8, data.total)} of ${data.total}` : 'Showing 0 results'}</span>
          <div style={{ display: 'flex', gap: 6 }}><Btn small disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>‹ Prev</Btn><Btn small disabled={page >= data.pages || loading} onClick={() => setPage((p) => p + 1)}>Next ›</Btn></div>
        </div>
      </section>
      {dialog && <ActionDialog row={dialog} onClose={() => setDialog(null)} onDone={() => { setDialog(null); refresh(); }} />}
    </div>
  );
}
