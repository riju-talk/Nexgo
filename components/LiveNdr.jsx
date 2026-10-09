'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch, reportsApi, ApiError } from '@/lib/api';
import { useAppState } from '@/lib/AppStateContext';
import { usePincode } from '@/lib/usePincode';
import * as T from '@/lib/theme';
import { FORMATS } from '@/lib/exportFile';
import ShipmentFilters, { EMPTY_FILTERS, filterParams } from './ShipmentFilters';

const CARD = { background: 'var(--nx-surface)', border: `1px solid ${T.BORDER}`, borderRadius: 12 };
const FIELD = { height: 38, boxSizing: 'border-box', border: `1px solid ${T.INPUT_BORDER}`, borderRadius: 8, background: T.SURFACE, color: T.TEXT, padding: '0 10px', fontSize: 13, outline: 'none' };
const REASONS = { customer_unavailable: 'Customer Not Available', address_incomplete: 'Incomplete Address', address_incorrect: 'Wrong Address', refused_delivery: 'Customer Refused', payment_not_ready: 'Payment Not Ready', customer_requested_reschedule: 'Reschedule Requested', premises_closed: 'Premises Closed', customer_not_contactable: 'Not Contactable', incorrect_product: 'Incorrect Product', damaged_product: 'Damaged Product', other: 'Other' };
const STATUS = {
  new: ['New NDR', '#C2410C', '#F5822018'], action_pending: ['Action Pending', '#B45309', '#F5B30018'], redelivery_scheduled: ['Redelivery Scheduled', '#3877fc', '#3877fc14'], resolved: ['Resolved', T.GREEN, `${T.GREEN}18`], rto: ['RTO', T.RED, `${T.RED}16`],
};
const TABS = [['all', 'All NDR'], ['new', 'New NDR'], ['action_pending', 'Action Pending'], ['redelivery_scheduled', 'Redelivery Scheduled'], ['resolved', 'Resolved'], ['rto', 'RTO']];
const when = (v) => (v ? new Date(v).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
const dayInput = (offset) => { const d = new Date(Date.now() + offset * 864e5); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const inr = (paise) => `₹${(Number(paise || 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

function Pill({ color, bg, children }) { return <span style={{ display: 'inline-block', padding: '4px 9px', borderRadius: 6, background: bg, color, fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap' }}>{children}</span>; }
function Btn({ children, onClick, primary, danger, disabled, small }) {
  return <button type="button" disabled={disabled} onClick={onClick} style={{ height: small ? 32 : 38, padding: `0 ${small ? 12 : 16}px`, borderRadius: 8, border: `1px solid ${primary ? '#3877fc' : danger ? T.RED : T.BORDER}`, background: primary ? '#3877fc' : danger ? T.RED : T.SURFACE, color: primary || danger ? '#fff' : T.TEXT, fontWeight: 700, fontSize: small ? 12.5 : 13.5, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.55 : 1 }}>{children}</button>;
}

// Take action / view details dialog for one NDR case.
function CaseDialog({ row, initialAction, onClose, onDone }) {
  const { showToast } = useAppState();
  const open = row.ndr_status === 'new' || row.ndr_status === 'action_pending';
  const [action, setAction] = useState(initialAction || 'delivery_rescheduled');
  const [date, setDate] = useState(dayInput(1));
  const [notes, setNotes] = useState('');
  const [addr, setAddr] = useState({ line1: '', line2: '', pincode: '', city: null, landmark: '' });
  const [busy, setBusy] = useState(false);
  const { info, status } = usePincode(addr.pincode);
  const city = addr.city ?? info?.city ?? '';

  const submit = async () => {
    setBusy(true);
    try {
      const body = { resolutionAction: action, resolutionNotes: notes.trim() || undefined };
      if (action === 'delivery_rescheduled') body.scheduledDeliveryDate = new Date(`${date}T10:00:00`).toISOString();
      if (action === 'address_update') body.newAddress = { addressLine1: addr.line1.trim(), addressLine2: addr.line2.trim() || undefined, city: city.trim(), pincode: addr.pincode, landmark: addr.landmark.trim() || undefined };
      await apiFetch(`/v1/ndr/cases/${row.id}/resolve`, { method: 'POST', body });
      showToast('NDR action submitted'); onDone();
    } catch (e) { showToast(e instanceof ApiError ? (e.body?.details ? 'Check the details entered' : e.message) : 'Action failed', 'error'); setBusy(false); }
  };
  const addrOk = action !== 'address_update' || (addr.line1.trim().length >= 3 && /^\d{6}$/.test(addr.pincode) && city.trim().length >= 2);
  const dateOk = action !== 'delivery_rescheduled' || date >= dayInput(0);

  return (
    <div role="dialog" aria-modal="true" aria-label="NDR action" onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(8,16,30,.5)', display: 'grid', placeItems: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...CARD, width: 'min(100%, 520px)', maxHeight: '92vh', overflow: 'auto', padding: 22 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <div><b style={{ fontSize: 17, color: T.TEXT }}>{open ? 'Take action' : 'NDR details'} · {row.order_number}</b><span style={{ display: 'block', marginTop: 3, fontFamily: T.MONO, fontSize: 12, color: T.TEXT_MUTED }}>{row.awb}</span></div>
          <button type="button" aria-label="Close" onClick={onClose} style={{ border: 0, background: 'transparent', fontSize: 22, color: T.TEXT_MUTED, cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ marginTop: 14, padding: 12, borderRadius: 9, background: T.SURFACE_SOFT, fontSize: 13, color: T.TEXT_SECONDARY, display: 'grid', gap: 4 }}>
          <span><b style={{ color: T.TEXT }}>{row.customer_name}</b> · {row.customer_phone} · {row.customer_city}, {row.customer_pincode}</span>
          <span>{row.courier_name} · {REASONS[row.ndr_reason] || row.ndr_reason} · attempt {row.attempt_number} of {row.max_attempts}</span>
          {row.payment_mode === 'cod' && <span>COD to collect: <b style={{ color: T.TEXT }}>{inr(row.cod_amount_paise)}</b></span>}
        </div>
        {!open ? (
          <div style={{ marginTop: 14, display: 'grid', gap: 7, fontSize: 13, color: T.TEXT_SECONDARY }}>
            <span>Status: <Pill color={STATUS[row.ndr_status][1]} bg={STATUS[row.ndr_status][2]}>{STATUS[row.ndr_status][0]}</Pill></span>
            {row.resolution_action && <span>Action taken: <b style={{ color: T.TEXT }}>{row.resolution_action.replaceAll('_', ' ')}</b></span>}
            {row.scheduled_delivery_at && <span>Redelivery scheduled: <b style={{ color: T.TEXT }}>{when(row.scheduled_delivery_at)}</b></span>}
            {row.resolution_notes && <span>Notes: {row.resolution_notes}</span>}
            <span>NDR raised: {when(row.opened_at)}{row.resolved_at ? ` · actioned ${when(row.resolved_at)}` : ''}</span>
          </div>
        ) : (
          <div style={{ marginTop: 14, display: 'grid', gap: 12 }}>
            <label style={{ fontSize: 12.5, fontWeight: 650, color: T.TEXT_LABEL }}>What would you like to do?
              <select style={{ ...FIELD, width: '100%', marginTop: 6 }} value={action} onChange={(e) => setAction(e.target.value)}>
                <option value="delivery_rescheduled">Schedule redelivery</option><option value="reattempt">Reattempt delivery</option><option value="address_update">Update address</option><option value="customer_contact">Customer contacted — issue sorted</option><option value="rto">Mark as RTO (return to origin)</option>
              </select></label>
            {action === 'delivery_rescheduled' && <label style={{ fontSize: 12.5, fontWeight: 650, color: T.TEXT_LABEL }}>Redelivery date<input type="date" min={dayInput(0)} style={{ ...FIELD, width: '100%', marginTop: 6 }} value={date} onChange={(e) => setDate(e.target.value)} /></label>}
            {action === 'address_update' && (
              <div style={{ display: 'grid', gap: 10 }}>
                <input style={FIELD} placeholder="Address line 1" value={addr.line1} onChange={(e) => setAddr({ ...addr, line1: e.target.value })} />
                <input style={FIELD} placeholder="Address line 2 (optional)" value={addr.line2} onChange={(e) => setAddr({ ...addr, line2: e.target.value })} />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <input style={FIELD} placeholder="Pincode" inputMode="numeric" maxLength={6} value={addr.pincode} onChange={(e) => setAddr({ ...addr, pincode: e.target.value.replace(/\D/g, ''), city: null })} />
                  <input style={FIELD} placeholder="City" value={city} onChange={(e) => setAddr({ ...addr, city: e.target.value })} />
                </div>
                <small style={{ color: status === 'found' ? T.GREEN : T.TEXT_MUTED }}>{status === 'found' ? `${info.city}, ${info.state}` : status === 'missing' ? 'Pincode not in directory — enter the city manually' : ''}</small>
                <input style={FIELD} placeholder="Landmark (optional)" value={addr.landmark} onChange={(e) => setAddr({ ...addr, landmark: e.target.value })} />
              </div>
            )}
            {action === 'rto' && <div style={{ padding: '9px 12px', borderRadius: 8, background: `${T.RED}10`, color: T.RED, fontSize: 12.5 }}>The parcel will be returned to your warehouse and return charges may apply. This cannot be undone.</div>}
            <label style={{ fontSize: 12.5, fontWeight: 650, color: T.TEXT_LABEL }}>Notes (optional)<textarea style={{ ...FIELD, width: '100%', height: 70, padding: 10, marginTop: 6, resize: 'vertical' }} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
          </div>
        )}
        <div style={{ marginTop: 18, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <Btn onClick={onClose}>{open ? 'Cancel' : 'Close'}</Btn>
          {open && <Btn primary={action !== 'rto'} danger={action === 'rto'} disabled={busy || !addrOk || !dateOk} onClick={submit}>{busy ? 'Submitting…' : action === 'rto' ? 'Mark as RTO' : 'Submit'}</Btn>}
        </div>
      </div>
    </div>
  );
}

export default function LiveNdr({ mobile }) {
  const { showToast } = useAppState();
  const [tab, setTab] = useState('all'); const [page, setPage] = useState(1);
  const [filters, setFilters] = useState(EMPTY_FILTERS); const [panel, setPanel] = useState(true);
  const [reason, setReason] = useState('');
  const [tick, setTick] = useState(0);
  const [data, setData] = useState({ key: '', items: [], total: 0, pages: 1, error: '' });
  const [stats, setStats] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [dialog, setDialog] = useState(null);
  const [help, setHelp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [format, setFormat] = useState('csv');


  const params = useMemo(() => { const p = filterParams(filters, new URLSearchParams({ tab, page: String(page), pageSize: '8' })); if (reason) p.set('reason', reason); return p.toString(); }, [tab, page, filters, reason]);
  const key = `${params}#${tick}`;
  useEffect(() => {
    let live = true;
    apiFetch(`/v1/ndr/cases?${params}`)
      .then((x) => { if (live) setData({ key, items: x.items, total: x.total, pages: x.pages, error: '' }); })
      .catch((e) => { if (live) setData({ key, items: [], total: 0, pages: 1, error: e.status === 401 ? 'Sign in to view NDR cases.' : e.message || 'NDR cases could not be loaded.' }); });
    return () => { live = false; };
  }, [params, key]);
  useEffect(() => { let live = true; apiFetch('/v1/ndr/stats').then((x) => { if (live) setStats(x); }).catch(() => {}); return () => { live = false; }; }, [tick]);

  const loading = data.key !== key;
  const refresh = () => { setSelected(new Set()); setTick((t) => t + 1); };
  const filter = (setter) => (e) => { setter(e.target.value); setPage(1); };
  const applyFilters = (next) => { setFilters(next); setPage(1); };
  const anyFilter = reason || Object.values(filters).some(Boolean);
  const counts = stats?.counts || {};
  const toggle = (id) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allOnPage = data.items.length > 0 && data.items.every((r) => selected.has(r.id));
  const selectedRows = data.items.filter((r) => selected.has(r.id));
  const openSelected = selectedRows.filter((r) => r.ndr_status === 'new' || r.ndr_status === 'action_pending');

  const bulk = async (action, label) => {
    if (!openSelected.length) return showToast('Select at least one NDR that still needs action.', 'error');
    setBusy(true);
    try {
      const r = await apiFetch('/v1/ndr/cases/bulk-resolve', { method: 'POST', body: { caseIds: openSelected.map((x) => x.id), resolutionAction: action } });
      showToast(`${label}: ${r.summary.succeeded} updated${r.summary.failed ? `, ${r.summary.failed} skipped` : ''}`, r.summary.failed ? 'error' : 'success'); refresh();
    } catch (e) { showToast(e.message || 'Bulk action failed', 'error'); } finally { setBusy(false); }
  };
  const exportReport = async () => {
    setBusy(true);
    try {
      const run = await reportsApi.generate({ type: 'ndr', from: filters.from || dayInput(-90), to: filters.to || dayInput(0) });
      if (!run.row_count) showToast('No NDR cases in this period.', 'error'); else { await reportsApi.download(run.id, run.file_name, format); showToast(`NDR report downloaded · ${run.row_count} rows (${format === 'xlsx' ? 'Excel' : 'CSV'})`); }
    } catch (e) { showToast(e.message || 'Report could not be generated', 'error'); } finally { setBusy(false); }
  };

  const kpis = [['Total NDR', stats?.total ?? '—', stats ? `${stats.shareOfShipmentsPct}% of total shipments` : '', '#6D28D9'], ['New NDR', counts.new ?? '—', 'Requires attention', '#F58220'], ['Action Pending', counts.action_pending ?? '—', 'Awaiting your action', '#F5B301'], ['Redelivery Scheduled', counts.redelivery_scheduled ?? '—', 'Scheduled for redelivery', '#3877fc'], ['Resolved', counts.resolved ?? '—', 'Successfully resolved', '#14724F'], ['Auto RTO', counts.rto ?? '—', 'Marked as RTO', '#B23A2B']];
  const pad = mobile ? '14px 12px 42px' : '18px 28px 48px';

  return (
    <div style={{ padding: pad, maxWidth: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
        <p style={{ margin: 0, color: T.TEXT_SECONDARY, fontSize: 13.5 }}>Track and manage Non-Delivery Reports (NDR) and take appropriate actions to ensure successful redelivery.</p>
        <div style={{ display: 'flex', gap: 8 }}><Btn onClick={() => setHelp((h) => !h)}>ⓘ How it works?</Btn><select aria-label="Report format" value={format} onChange={(e) => setFormat(e.target.value)} style={{ ...FIELD, height: 38 }}>{FORMATS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select><Btn onClick={exportReport} disabled={busy}>⤓ Download Report</Btn></div>
      </div>
      {help && <div style={{ ...CARD, padding: 16, marginBottom: 14, fontSize: 13, color: T.TEXT_SECONDARY, lineHeight: 1.7 }}><b style={{ color: T.TEXT }}>How NDR works.</b> When a courier cannot deliver, an NDR appears as <b>New NDR</b>. Open it with <b>Take Action</b> to schedule a redelivery, correct the address or return the parcel (RTO). Cases not actioned within the SLA window need attention first; after three failed attempts parcels return to you automatically.</div>}

      <div style={{ display: 'grid', gridTemplateColumns: mobile ? 'repeat(2,1fr)' : 'repeat(6,1fr)', gap: 12, marginBottom: 14 }}>
        {kpis.map(([label, value, note, color]) => <div key={label} style={{ ...CARD, padding: 14, display: 'flex', gap: 11, alignItems: 'center' }}><span style={{ width: 40, height: 40, borderRadius: 10, background: `${color}18`, color, display: 'grid', placeItems: 'center', fontWeight: 900, fontSize: 18 }}>●</span><div><span style={{ fontSize: 11.5, color: T.TEXT_MUTED }}>{label}</span><b style={{ display: 'block', fontSize: 22, color: T.TEXT, lineHeight: 1.15 }}>{value}</b><small style={{ color: T.TEXT_MUTED, fontSize: 10.5 }}>{note}</small></div></div>)}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16, alignItems: 'start' }}>
        <section style={{ ...CARD, minWidth: 0 }}>
          <div role="tablist" style={{ display: 'flex', gap: 4, padding: '4px 14px 0', borderBottom: `1px solid ${T.DIVIDER}`, overflowX: 'auto' }}>
            {TABS.map(([id, label]) => { const n = id === 'all' ? stats?.total : counts[id]; const on = tab === id; return <button key={id} role="tab" aria-selected={on} type="button" onClick={() => { setTab(id); setPage(1); setSelected(new Set()); }} style={{ padding: '12px 14px', border: 0, borderBottom: `3px solid ${on ? '#3877fc' : 'transparent'}`, background: 'transparent', color: on ? '#3877fc' : T.TEXT_SECONDARY, fontWeight: on ? 800 : 600, fontSize: 13.5, cursor: 'pointer', whiteSpace: 'nowrap' }}>{label}{id !== 'all' && n > 0 && <span style={{ marginLeft: 6, padding: '1px 7px', borderRadius: 99, background: id === 'new' || id === 'action_pending' ? T.RED : '#3877fc', color: '#fff', fontSize: 11 }}>{n}</span>}</button>; })}
          </div>
          <div style={{ padding: '12px 14px 4px', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <Btn small onClick={() => setPanel((o) => !o)}>{panel ? 'Hide filters' : `Filters${anyFilter ? ' •' : ''}`}</Btn>
            <select aria-label="Reason" style={{ ...FIELD, height: 32 }} value={reason} onChange={(e) => { setReason(e.target.value); setPage(1); }}><option value="">All reasons</option>{Object.entries(REASONS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
          </div>
          {panel && <ShipmentFilters key={JSON.stringify(filters)} value={filters} onApply={applyFilters} couriers={stats?.couriers || []} mobile={mobile} />}

          {selectedRows.length > 0 && <div style={{ margin: '0 14px 10px', padding: '8px 12px', borderRadius: 8, background: '#3877fc0d', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 13 }}><b style={{ color: T.TEXT }}>{selectedRows.length} selected</b><Btn small disabled={busy} onClick={() => bulk('reattempt', 'Redelivery requested')}>Request reattempt</Btn><Btn small danger disabled={busy} onClick={() => bulk('rto', 'Marked as RTO')}>Mark as RTO</Btn><Btn small onClick={() => setSelected(new Set())}>Clear</Btn></div>}

          {data.error ? <div style={{ padding: 24, color: T.RED, fontSize: 13 }}>{data.error}</div> : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', minWidth: 900, borderCollapse: 'collapse' }}>
                <thead><tr>
                  <th style={{ width: 40, padding: '10px 14px', background: T.TABLE_HEAD_BG }}><input type="checkbox" aria-label="Select all" checked={allOnPage} onChange={() => setSelected(allOnPage ? new Set() : new Set(data.items.map((r) => r.id)))} /></th>
                  {['Order / AWB Details', 'Customer Details', 'Courier / Service', 'NDR Reason', 'NDR Date', 'Status', 'Action'].map((h) => <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11.5, color: T.TEXT_MUTED, background: T.TABLE_HEAD_BG, fontWeight: 700 }}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {loading && <tr><td colSpan={8} style={{ padding: 28, textAlign: 'center', color: T.TEXT_MUTED, fontSize: 13 }}>Loading NDR cases…</td></tr>}
                  {!loading && !data.items.length && <tr><td colSpan={8} style={{ padding: 32, textAlign: 'center', color: T.TEXT_SECONDARY, fontSize: 13 }}>{anyFilter || tab !== 'all' ? 'No NDR cases match these filters.' : 'No NDR cases — every delivery is on track.'}</td></tr>}
                  {!loading && data.items.map((r) => {
                    const [label, color, bg] = STATUS[r.ndr_status]; const open = r.ndr_status === 'new' || r.ndr_status === 'action_pending';
                    return (
                      <tr key={r.id} style={{ background: selected.has(r.id) ? '#3877fc08' : 'transparent' }}>
                        <td style={{ padding: '12px 14px', borderTop: `1px solid ${T.DIVIDER}` }}><input type="checkbox" aria-label={`Select ${r.order_number}`} checked={selected.has(r.id)} onChange={() => toggle(r.id)} /></td>
                        <td style={{ padding: '12px', borderTop: `1px solid ${T.DIVIDER}` }}><b style={{ color: '#3877fc', fontSize: 13 }}>{r.order_number}</b><small style={{ display: 'block', fontFamily: T.MONO, color: T.TEXT_MUTED, fontSize: 11 }}>{r.nexgo_order_id}</small>{(r.tags || []).length > 0 && <small style={{ display: 'block', color: '#3877fc', fontSize: 11 }}>{r.tags.map((t) => `#${t}`).join(' ')}</small>}<small style={{ display: 'block', fontFamily: T.MONO, color: T.TEXT_MUTED, fontSize: 11.5 }}>{r.awb}</small></td>
                        <td style={{ padding: '12px', borderTop: `1px solid ${T.DIVIDER}`, fontSize: 13 }}><b style={{ color: T.TEXT }}>{r.customer_name}</b><small style={{ display: 'block', color: T.TEXT_MUTED }}>{r.customer_phone}</small><small style={{ color: T.TEXT_MUTED }}>{r.customer_city}, {r.customer_pincode}</small></td>
                        <td style={{ padding: '12px', borderTop: `1px solid ${T.DIVIDER}`, fontSize: 13 }}><b style={{ color: T.TEXT }}>{r.courier_name}</b><small style={{ display: 'block', color: T.TEXT_MUTED }}>{r.service_name}</small></td>
                        <td style={{ padding: '12px', borderTop: `1px solid ${T.DIVIDER}` }}><Pill color="#9A3412" bg="#F5822018">{REASONS[r.ndr_reason] || r.ndr_reason}</Pill><small style={{ display: 'block', marginTop: 3, color: T.TEXT_MUTED, fontSize: 11 }}>Attempt {r.attempt_number}/{r.max_attempts}</small></td>
                        <td style={{ padding: '12px', borderTop: `1px solid ${T.DIVIDER}`, fontSize: 12.5, color: T.TEXT_SECONDARY, whiteSpace: 'nowrap' }}>{when(r.opened_at)}</td>
                        <td style={{ padding: '12px', borderTop: `1px solid ${T.DIVIDER}` }}><Pill color={color} bg={bg}>{label}</Pill>{r.ndr_status === 'redelivery_scheduled' && r.scheduled_delivery_at && <small style={{ display: 'block', marginTop: 3, color: T.TEXT_MUTED, fontSize: 11 }}>{new Date(r.scheduled_delivery_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</small>}</td>
                        <td style={{ padding: '12px', borderTop: `1px solid ${T.DIVIDER}` }}><Btn small primary={open} onClick={() => setDialog({ row: r })}>{open ? 'Take Action' : 'View Details'}</Btn></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div style={{ padding: '12px 14px', display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap', borderTop: `1px solid ${T.DIVIDER}`, fontSize: 13, color: T.TEXT_SECONDARY }}>
            <span>{data.total ? `Showing ${(page - 1) * 8 + 1} to ${Math.min(page * 8, data.total)} of ${data.total} NDRs` : 'Showing 0 NDRs'}</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <Btn small disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>‹ Prev</Btn>
              {Array.from({ length: Math.min(data.pages, 5) }, (_, i) => i + 1).map((n) => <button key={n} type="button" onClick={() => setPage(n)} aria-current={n === page} style={{ width: 32, height: 32, borderRadius: 8, border: `1px solid ${n === page ? '#3877fc' : T.BORDER}`, background: n === page ? '#3877fc' : T.SURFACE, color: n === page ? '#fff' : T.TEXT, fontWeight: 700, cursor: 'pointer' }}>{n}</button>)}
              <Btn small disabled={page >= data.pages || loading} onClick={() => setPage((p) => p + 1)}>Next ›</Btn>
            </div>
          </div>
        </section>

      </div>
      {dialog && <CaseDialog row={dialog.row} initialAction={dialog.action} onClose={() => setDialog(null)} onDone={() => { setDialog(null); refresh(); }} />}
    </div>
  );
}
