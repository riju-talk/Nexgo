'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { useAppState } from '@/lib/AppStateContext';
import { FORMATS, saveRows } from '@/lib/exportFile';
import * as T from '@/lib/theme';
import { useAutoLoad, useInfiniteList } from '@/lib/useInfiniteList';

export const CARD = { background: 'var(--nx-surface)', border: `1px solid ${T.BORDER}`, borderRadius: 12 };
export const FIELD = { height: 38, boxSizing: 'border-box', border: `1px solid ${T.INPUT_BORDER}`, borderRadius: 8, background: T.SURFACE, color: T.TEXT, padding: '0 10px', fontSize: 13, outline: 'none' };
export const BLUE = '#3877fc';
export const inr = (paise) => `₹${(Number(paise || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const inr0 = (paise) => `₹${(Number(paise || 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
export const kg = (g) => `${(Number(g || 0) / 1000).toFixed(2)} kg`;
export const dayText = (v) => (v ? new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
export const dateTime = (v) => (v ? new Date(v).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
export const titleCase = (v = '') => String(v).replaceAll('_', ' ').replaceAll('-', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
// Accepts a day offset from today (isoDay(-7)) or a Date (isoDay(new Date()))
export const isoDay = (offset = 0) => { const d = offset instanceof Date ? offset : Math.abs(offset) > 1e6 ? new Date(offset) /* a timestamp */ : new Date(Date.now() + offset * 864e5); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };

// An AWB that opens that shipment on the Track page (detail panel + timeline). Used wherever an AWB is listed.
export function AwbLink({ awb, style }) {
  const { setTrackFocus, nav } = useAppState();
  if (!awb) return <span style={{ color: T.TEXT_MUTED, ...style }}>-</span>;
  return <button type="button" title="Open tracking" onClick={(e) => { e.stopPropagation(); setTrackFocus(awb); nav('shipments'); }} style={{ border: 0, background: 'transparent', padding: 0, cursor: 'pointer', color: BLUE, fontFamily: T.MONO, fontSize: 12, textDecoration: 'underline', textUnderlineOffset: 2, ...style }}>{awb}</button>;
}

// A small rotating ring (CSS keyframes in app/globals.css). Colour follows the text it sits in.
export function Spinner({ size = 16, color = 'currentColor' }) {
  return <span role="status" aria-label="Loading" style={{ display: 'inline-block', width: size, height: size, borderRadius: '50%', border: `2px solid ${color}`, borderRightColor: 'transparent', animation: 'nx-spin .7s linear infinite', flex: 'none' }} />;
}

// Determinate progress (value/total); with no total it shows a moving bar.
export function ProgressBar({ value = 0, total = 0, color = BLUE }) {
  const pct = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : null;
  return (
    <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct ?? undefined} style={{ height: 8, borderRadius: 4, background: T.BORDER, overflow: 'hidden' }}>
      <div style={{ height: '100%', width: pct === null ? '40%' : `${pct}%`, borderRadius: 4, background: color, transition: 'width .3s ease', animation: pct === null ? 'nx-indeterminate 1.1s ease-in-out infinite' : 'none' }} />
    </div>
  );
}

// Placeholder rows shown while a list loads its first batch or the next one (keeps the table from jumping).
export function TableSkeleton({ cols = 6, rows = 5 }) {
  return (
    <tbody aria-hidden>
      {Array.from({ length: rows }, (_, r) => (
        <tr key={r}>{Array.from({ length: cols }, (_, c) => <td key={c} style={{ padding: 12, borderTop: `1px solid ${T.DIVIDER}` }}><div style={{ height: 12, width: `${55 + ((r * 7 + c * 13) % 40)}%`, borderRadius: 6, background: 'var(--nx-divider)', opacity: 0.7 }} /></td>)}</tr>
      ))}
    </tbody>
  );
}

// Footer of a list that loads more as you scroll: "Showing 50 of 213", the next batch is requested when this comes into view,
// and the button is always there (keyboard, no IntersectionObserver, or a failed batch to retry).
export function LoadMore({ shown, total, hasMore, loading, loadingMore, error, onMore, noun = 'results' }) {
  const ref = useRef(null);
  useAutoLoad(ref, onMore, { enabled: hasMore && !loading && !loadingMore && !error });
  const count = total !== null && total !== undefined ? `Showing ${shown.toLocaleString('en-IN')} of ${Number(total).toLocaleString('en-IN')} ${noun}` : `Showing ${shown.toLocaleString('en-IN')} ${noun}`;
  return (
    <div ref={ref} style={{ padding: '12px 14px', display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap', borderTop: `1px solid ${T.DIVIDER}`, fontSize: 13, color: T.TEXT_SECONDARY }}>
      <span aria-live="polite">{loading ? 'Loading…' : count}{!hasMore && !loading && shown > 0 ? ' · that is everything' : ''}</span>
      {error && <span role="alert" style={{ color: T.RED }}>Could not load more.</span>}
      {(hasMore || error) && !loading && <Btn small loading={loadingMore} onClick={onMore}>{error ? 'Try again' : 'Load more'}</Btn>}
    </div>
  );
}

export function Btn({ children, onClick, primary, danger, disabled, loading, small, type = 'button', style }) {
  const off = disabled || loading;
  return <button type={type} disabled={off} aria-busy={loading || undefined} onClick={onClick} style={{ height: small ? 32 : 38, padding: `0 ${small ? 11 : 16}px`, borderRadius: 8, border: `1px solid ${primary ? BLUE : danger ? T.RED : T.BORDER}`, background: primary ? BLUE : danger ? T.RED : T.SURFACE, color: primary || danger ? '#fff' : T.TEXT, fontWeight: 700, fontSize: small ? 12.5 : 13.5, cursor: loading ? 'progress' : disabled ? 'not-allowed' : 'pointer', opacity: off ? 0.65 : 1, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, ...style }}>{loading && <Spinner size={14} />}{children}</button>;
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
  const [format, setFormat] = useState('csv');
  const [busy, setBusy] = useState(false);
  const [extra, setExtra] = useState({}); // whatever else the first answer carries (balance, totals) for the cards above the table

  const buildQuery = useCallback((page, size) => {
    const p = new URLSearchParams({ page: String(page), pageSize: String(size) });
    if (applied.from) p.set('from', applied.from); if (applied.to) p.set('to', applied.to);
    if (filters.includes('type') && applied.type !== 'all') p.set('type', applied.type);
    if (filters.includes('q') && applied.q.trim()) p.set('q', applied.q.trim());
    if (filters.includes('status') && applied.status) p.set('status', applied.status);
    return p;
  }, [applied, filters]);
  // Rows load a screenful at a time and more as the user scrolls (the filters start the list again from the top).
  const list = useInfiniteList({
    pageSize,
    deps: [path, applied, filters.join(',')],
    fetchPage: (cursor, size) => apiFetch(`${path}?${buildQuery(cursor || 1, size)}`).then((x) => { if (!cursor) { const { items: _items, ...rest } = x; setExtra(rest); } return x; }),
  });
  const rows = list.items;
  const error = list.error ? (list.error.status === 401 ? 'Sign in to view this data.' : list.error.message || 'Could not load this data.') : '';
  const data = { ...extra, items: rows, total: list.total ?? 0, error };
  const apply = () => { if (draft.from && draft.to && draft.to < draft.from) return showToast('The end date must be on or after the start date.', 'error'); setApplied(draft); };
  const clear = () => { setDraft(blank); setApplied(blank); };

  const exportAll = async () => {
    setBusy(true);
    try {
      const all = [];
      for (let pg = 1; pg <= 50; pg++) { const x = await apiFetch(`${path}?${buildQuery(pg, 100)}`); all.push(...(x.items || [])); if (pg >= (x.pages || 1)) break; }
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
        {filters.includes('type') && <select aria-label="Type" style={FIELD} value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value })}><option value="all">Show all</option><option value="shipping">Shipping</option><option value="recharge">Recharge</option><option value="dispute">Weight dispute</option><option value="refund">Cancellation refund</option><option value="credit">Credits only</option><option value="debit">Debits only</option></select>}
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
        <Table columns={columns} rows={rows} loading={list.loading} error={error} empty={empty} minWidth={minWidth} />
        {(rows.length > 0 || list.hasMore) && <LoadMore shown={rows.length} total={list.total} hasMore={list.hasMore} loading={list.loading} loadingMore={list.loadingMore} error={!!list.error && rows.length > 0} onMore={list.loadMore} />}
      </section>
    </div>
  );
}
