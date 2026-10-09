'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { useAppState } from '@/lib/AppStateContext';
import { FORMATS, saveRows } from '@/lib/exportFile';
import * as T from '@/lib/theme';

export const CARD = { background: 'var(--nx-surface)', border: `1px solid ${T.BORDER}`, borderRadius: 12 };
export const FIELD = { height: 38, boxSizing: 'border-box', border: `1px solid ${T.INPUT_BORDER}`, borderRadius: 8, background: T.SURFACE, color: T.TEXT, padding: '0 10px', fontSize: 13, outline: 'none' };
export const BLUE = '#3877fc';
export const inr = (paise) => `₹${(Number(paise || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const inr0 = (paise) => `₹${(Number(paise || 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
export const kg = (g) => `${(Number(g || 0) / 1000).toFixed(2)} kg`;
export const dayText = (v) => (v ? new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
export const dateTime = (v) => (v ? new Date(v).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
export const titleCase = (v = '') => String(v).replaceAll('_', ' ').replaceAll('-', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
export const isoDay = (offset = 0) => { const d = new Date(Date.now() + offset * 864e5); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };

export function Btn({ children, onClick, primary, danger, disabled, small, type = 'button', style }) {
  return <button type={type} disabled={disabled} onClick={onClick} style={{ height: small ? 32 : 38, padding: `0 ${small ? 11 : 16}px`, borderRadius: 8, border: `1px solid ${primary ? BLUE : danger ? T.RED : T.BORDER}`, background: primary ? BLUE : danger ? T.RED : T.SURFACE, color: primary || danger ? '#fff' : T.TEXT, fontWeight: 700, fontSize: small ? 12.5 : 13.5, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.55 : 1, whiteSpace: 'nowrap', ...style }}>{children}</button>;
}

export function Pill({ children, color = T.GREEN, bg }) {
  return <span style={{ display: 'inline-block', padding: '4px 9px', borderRadius: 6, background: bg || `${color}18`, color, fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap' }}>{children}</span>;
}

export function Stat({ label, value, note, color = BLUE }) {
  return <div style={{ ...CARD, padding: 14, borderTop: `3px solid ${color}` }}><span style={{ fontSize: 11.5, color: T.TEXT_MUTED }}>{label}</span><b style={{ display: 'block', fontSize: 22, color: T.TEXT, marginTop: 3 }}>{value}</b>{note && <small style={{ color: T.TEXT_MUTED, fontSize: 11 }}>{note}</small>}</div>;
}

export function Pager({ page, pages, total, pageSize, onPage, loading }) {
  return (
    <div style={{ padding: '12px 14px', display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap', borderTop: `1px solid ${T.DIVIDER}`, fontSize: 13, color: T.TEXT_SECONDARY }}>
      <span>{total ? `Showing ${(page - 1) * pageSize + 1} to ${Math.min(page * pageSize, total)} of ${total}` : 'Showing 0 results'}</span>
      <div style={{ display: 'flex', gap: 6 }}><Btn small disabled={page <= 1 || loading} onClick={() => onPage(page - 1)}>‹ Prev</Btn><span style={{ alignSelf: 'center', fontSize: 12.5 }}>Page {page} of {pages}</span><Btn small disabled={page >= pages || loading} onClick={() => onPage(page + 1)}>Next ›</Btn></div>
    </div>
  );
}

export function Table({ columns, rows, loading, error, empty = 'Nothing to show yet.', minWidth = 760, rowKey }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', minWidth, borderCollapse: 'collapse' }}>
        <thead><tr>{columns.map((c) => <th key={c.h} style={{ padding: '10px 12px', textAlign: c.right ? 'right' : 'left', fontSize: 10.5, letterSpacing: '.06em', textTransform: 'uppercase', color: T.TEXT_MUTED, background: T.TABLE_HEAD_BG, fontWeight: 800, whiteSpace: 'nowrap' }}>{c.h}</th>)}</tr></thead>
        <tbody>
          {error && <tr><td colSpan={columns.length} style={{ padding: 24, color: T.RED, fontSize: 13 }}>{error}</td></tr>}
          {!error && loading && <tr><td colSpan={columns.length} style={{ padding: 28, textAlign: 'center', color: T.TEXT_MUTED, fontSize: 13 }}>Loading…</td></tr>}
          {!error && !loading && !rows.length && <tr><td colSpan={columns.length} style={{ padding: 32, textAlign: 'center', color: T.TEXT_SECONDARY, fontSize: 13 }}>{empty}</td></tr>}
          {!error && !loading && rows.map((r, i) => <tr key={rowKey ? rowKey(r) : r.id || i}>{columns.map((c) => <td key={c.h} style={{ padding: '12px', borderTop: `1px solid ${T.DIVIDER}`, fontSize: 13, color: T.TEXT_LABEL, textAlign: c.right ? 'right' : 'left', whiteSpace: c.wrap ? 'normal' : 'nowrap' }}>{c.cell(r, i)}</td>)}</tr>)}
        </tbody>
      </table>
    </div>
  );
}

// Server-paged list with date / type / AWB filters ("Apply" / "Clear" like the billing screens) and CSV / Excel export of
// every row matching the applied filters. `children(data)` renders anything that sits above the table (summary cards).
export function ListTab({ path, filters = [], columns, exportColumns, exportName, empty, pageSize = 10, children, toolbar, minWidth }) {
  const { showToast } = useAppState();
  const blank = useMemo(() => ({ from: '', to: '', type: 'all', q: '', status: '' }), []);
  const [draft, setDraft] = useState(blank);
  const [applied, setApplied] = useState(blank);
  const [page, setPage] = useState(1);
  const [format, setFormat] = useState('csv');
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState({ key: '', error: '' });

  const query = useMemo(() => {
    const p = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (applied.from) p.set('from', applied.from); if (applied.to) p.set('to', applied.to);
    if (filters.includes('type') && applied.type !== 'all') p.set('type', applied.type);
    if (filters.includes('q') && applied.q.trim()) p.set('q', applied.q.trim());
    if (filters.includes('status') && applied.status) p.set('status', applied.status);
    return p;
  }, [applied, page, pageSize, filters]);
  const key = query.toString();
  useEffect(() => {
    let live = true;
    apiFetch(`${path}?${key}`)
      .then((x) => { if (live) setData({ key, error: '', ...x }); })
      .catch((e) => { if (live) setData({ key, error: e.status === 401 ? 'Sign in to view this data.' : e.message || 'Could not load this data.', items: [], total: 0, pages: 1 }); });
    return () => { live = false; };
  }, [path, key]);

  const loading = data.key !== key;
  const rows = data.items || [];
  const apply = () => { if (draft.from && draft.to && draft.to < draft.from) return showToast('The end date must be on or after the start date.', 'error'); setApplied(draft); setPage(1); };
  const clear = () => { setDraft(blank); setApplied(blank); setPage(1); };

  const exportAll = async () => {
    setBusy(true);
    try {
      const all = []; const p = new URLSearchParams(query); p.set('pageSize', '100');
      for (let pg = 1; pg <= 50; pg++) { p.set('page', String(pg)); const x = await apiFetch(`${path}?${p}`); all.push(...(x.items || [])); if (pg >= (x.pages || 1)) break; }
      if (!all.length) { showToast('Nothing to export for these filters.', 'error'); return; }
      await saveRows([exportColumns.map((c) => c.h), ...all.map((r, i) => exportColumns.map((c) => c.value(r, i)))], `${exportName}-${isoDay()}`, format, exportName.slice(0, 30));
      showToast(`Exported ${all.length} rows (${format === 'xlsx' ? 'Excel' : 'CSV'})`);
    } catch (e) { showToast(e.message || 'Export failed', 'error'); } finally { setBusy(false); }
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <input aria-label="From date" type="date" style={FIELD} value={draft.from} max={draft.to || undefined} onChange={(e) => setDraft({ ...draft, from: e.target.value })} />
        <span style={{ color: T.TEXT_MUTED }}>–</span>
        <input aria-label="To date" type="date" style={FIELD} value={draft.to} min={draft.from || undefined} onChange={(e) => setDraft({ ...draft, to: e.target.value })} />
        {filters.includes('type') && <select aria-label="Type" style={FIELD} value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value })}><option value="all">Show all</option><option value="shipping">Shipping</option><option value="recharge">Recharge</option><option value="dispute">Weight dispute</option><option value="credit">Credits only</option><option value="debit">Debits only</option></select>}
        {filters.includes('q') && <input aria-label="AWB numbers" style={{ ...FIELD, width: 240 }} placeholder="AWB no(s) separated by comma" value={draft.q} onChange={(e) => setDraft({ ...draft, q: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && apply()} />}
        <Btn primary small onClick={apply}>Apply</Btn>
        <Btn small onClick={clear}>Clear</Btn>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {toolbar}
          <select aria-label="Export format" style={FIELD} value={format} onChange={(e) => setFormat(e.target.value)}>{FORMATS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
          <Btn onClick={exportAll} disabled={busy}>⤓ Export</Btn>
        </div>
      </div>
      {children && children(data)}
      <section style={{ ...CARD, overflow: 'hidden' }}>
        <Table columns={columns} rows={rows} loading={loading} error={data.error} empty={empty} minWidth={minWidth} />
        <Pager page={page} pages={data.pages || 1} total={data.total || 0} pageSize={pageSize} onPage={setPage} loading={loading} />
      </section>
    </div>
  );
}
