'use client';

import { useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { apiFetch, ApiError } from '@/lib/api';
import { useAppState } from '@/lib/AppStateContext';
import { saveRows } from '@/lib/exportFile';
import * as T from '@/lib/theme';
import { AwbLink, BLUE, Btn, CARD, FIELD, Pill, Stat, dateTime, dayText, inr, titleCase } from './Kit';

const MAX_AWBS = 500;
const PAGE = 50;
// AWBs pasted or read from a sheet: split on new lines, commas, semicolons, tabs and spaces; blanks and repeats dropped (first occurrence wins).
const parseAwbs = (text) => [...new Set(String(text || '').split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean))];
const tone = (state) => (state === 'delivered' ? T.GREEN : state === 'ndr' || state === 'rto' ? T.AMBER : state === 'cancelled' || state === 'lost' ? T.RED : T.ACCENT);
const label = (state) => ({ booked: 'Booked', pickup_pending: 'Pickup pending', pickup_scheduled: 'Pickup scheduled', in_transit: 'In transit', out_for_delivery: 'Out for delivery', ndr: 'NDR', rto: 'RTO', delivered: 'Delivered', cancelled: 'Cancelled', lost: 'Lost' }[state] || titleCase(state));

// Reads AWBs from an uploaded sheet: the column headed AWB / tracking number if there is one, otherwise the first column.
async function readSheet(file) {
  const book = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const grid = XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]], { header: 1, defval: '', blankrows: false });
  if (!grid.length) return [];
  const head = grid[0].map((c) => String(c).toLowerCase().replace(/[^a-z0-9]/g, ''));
  const col = Math.max(0, head.findIndex((h) => /^(awb|awbno|awbnumber|trackingnumber|trackingno|waybill)/.test(h)));
  const hasHeader = head.some((h) => /^(awb|awbno|awbnumber|trackingnumber|trackingno|waybill)/.test(h));
  return grid.slice(hasHeader ? 1 : 0).map((r) => String(r[col] ?? '').trim()).filter(Boolean);
}

export default function LiveBulkTrack({ mobile }) {
  const { showToast } = useAppState();
  const fileRef = useRef(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState(null); // API response
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const awbs = useMemo(() => parseAwbs(text), [text]);
  const rawCount = useMemo(() => String(text || '').split(/[\s,;]+/).filter(Boolean).length, [text]);
  const over = awbs.length > MAX_AWBS;

  const loadFile = async (file) => {
    if (!file) return;
    if (!/\.(xlsx|xls|csv|txt)$/i.test(file.name)) return showToast('Upload an .xlsx, .xls, .csv or .txt file.', 'error');
    if (file.size > 2 * 1024 * 1024) return showToast('Use a file smaller than 2 MB.', 'error');
    try {
      const found = /\.txt$/i.test(file.name) ? parseAwbs(await file.text()) : await readSheet(file);
      if (!found.length) return showToast('No AWB numbers found in that file. Put them in a column headed "AWB" (or in the first column).', 'error');
      setText((t) => [...parseAwbs(t), ...found].join('\n'));
      showToast(`${found.length} AWB${found.length === 1 ? '' : 's'} read from ${file.name}.`);
    } catch { showToast('That file could not be read. Use the sample sheet as a guide.', 'error'); }
  };

  const track = async () => {
    if (!awbs.length || over || busy) return;
    setBusy(true); setError(''); setPage(1); setFilter('all');
    try { setData(await apiFetch('/v1/shipments/track-bulk', { method: 'POST', body: { awbs } })); }
    catch (e) { setData(null); setError(e instanceof ApiError ? (e.status === 401 ? 'Your session has ended. Sign in again to track shipments.' : e.message) : 'Could not reach the server. Check your connection and try again.'); }
    finally { setBusy(false); }
  };

  const results = useMemo(() => data?.results || [], [data]);
  const counts = useMemo(() => { const m = {}; results.forEach((r) => { const k = r.found ? r.state : 'not_found'; m[k] = (m[k] || 0) + 1; }); return m; }, [results]);
  const shown = useMemo(() => results.filter((r) => filter === 'all' || (filter === 'not_found' ? !r.found : r.found && r.state === filter)), [results, filter]);
  const pages = Math.max(1, Math.ceil(shown.length / PAGE));
  const rows = shown.slice((page - 1) * PAGE, page * PAGE);

  const exportRows = () => [
    ['AWB', 'Status', 'Courier', 'Service', 'Order ID', 'NEXGO order ID', 'Customer', 'Phone', 'City', 'Pincode', 'Payment', 'COD amount INR', 'Booked on', 'Expected delivery', 'Delivered on', 'Last update', 'Last location', 'Last update time'],
    ...shown.map((r) => (r.found
      ? [r.awb, label(r.state), r.courier_name, r.service_name, r.order_number, r.nexgo_order_id, r.customer_name, r.customer_phone, r.customer_city, r.destination_pincode, r.payment_mode === 'cod' ? 'COD' : 'Prepaid', r.payment_mode === 'cod' ? Number(r.cod_amount_paise || 0) / 100 : 0, dayText(r.booked_at), dayText(r.promised_delivery_at), dayText(r.delivered_at), r.last_description || '', r.last_location || '', dateTime(r.last_event_at)]
      : [r.awb, 'Not found', '', '', '', '', '', '', '', '', '', '', '', '', '', 'This AWB is not on your account', '', ''])),
  ];
  const sample = (format) => saveRows([['AWB'], ['1234567890123'], ['1234567890124']], 'bulk-tracking-sample', format, 'AWBs');

  const pill = (active, onClick, children) => <button key={String(children)} type="button" onClick={onClick} style={{ height: 32, padding: '0 12px', borderRadius: 16, border: `1px solid ${active ? BLUE : T.INPUT_BORDER}`, background: active ? BLUE : T.SURFACE, color: active ? '#fff' : T.TEXT, fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>{children}</button>;

  return (
    <main style={{ padding: mobile ? '14px 12px 42px' : '18px 28px 48px', maxWidth: '100%' }}>
      <section style={{ ...CARD, padding: mobile ? 16 : 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div><b style={{ color: T.TEXT, fontSize: 17 }}>Bulk AWB tracking</b><p style={{ margin: '5px 0 0', color: T.TEXT_SECONDARY, fontSize: 13.5, lineHeight: 1.5, maxWidth: 660 }}>Check the status of up to {MAX_AWBS} shipments at once. Paste AWB numbers below, or upload an Excel / CSV sheet with an AWB column.</p></div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><Btn small onClick={() => sample('xlsx')}>Sample sheet (Excel)</Btn><Btn small onClick={() => sample('csv')}>Sample sheet (CSV)</Btn></div>
        </div>
        <textarea aria-label="AWB numbers" value={text} onChange={(e) => setText(e.target.value)} placeholder={'Paste AWB numbers here: one per line, or separated by commas or spaces'} rows={7} style={{ ...FIELD, width: '100%', height: 'auto', padding: 12, marginTop: 14, fontFamily: T.MONO, fontSize: 13, resize: 'vertical' }} />
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 10 }}>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.txt" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; loadFile(f); }} />
          <Btn onClick={() => fileRef.current?.click()}>Upload Excel / CSV</Btn>
          <Btn primary disabled={!awbs.length || over || busy} onClick={track}>{busy ? 'Tracking…' : `Track ${awbs.length || ''} AWB${awbs.length === 1 ? '' : 's'}`.replace('  ', ' ')}</Btn>
          {text && <Btn onClick={() => { setText(''); setData(null); setError(''); }}>Clear</Btn>}
          <span style={{ color: over ? T.RED : T.TEXT_MUTED, fontSize: 12.5, fontWeight: over ? 700 : 500 }}>
            {awbs.length} unique AWB{awbs.length === 1 ? '' : 's'} of {MAX_AWBS}{rawCount > awbs.length ? ` (${rawCount - awbs.length} repeated ignored)` : ''}{over ? `: remove ${awbs.length - MAX_AWBS} to continue` : ''}
          </span>
        </div>
        {error && <p role="alert" style={{ margin: '12px 0 0', color: T.RED, fontSize: 13 }}>{error}</p>}
      </section>

      {data && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: mobile ? 'repeat(2,1fr)' : 'repeat(5,1fr)', gap: 12, margin: '14px 0' }}>
            <Stat label="Requested" value={data.requested} />
            <Stat label="Found" value={data.found} color={T.GREEN} />
            <Stat label="Not found" value={data.notFound} color={data.notFound ? T.RED : T.TEXT_MUTED} />
            <Stat label="Delivered" value={counts.delivered || 0} color={T.GREEN} />
            <Stat label="Needs attention (NDR / RTO)" value={(counts.ndr || 0) + (counts.rto || 0)} color={T.AMBER} />
          </div>
          <section style={{ ...CARD, overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center', borderBottom: `1px solid ${T.DIVIDER}` }}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {pill(filter === 'all', () => { setFilter('all'); setPage(1); }, `All (${results.length})`)}
                {Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, n]) => pill(filter === k, () => { setFilter(k); setPage(1); }, `${k === 'not_found' ? 'Not found' : label(k)} (${n})`))}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Btn small onClick={() => saveRows(exportRows(), 'bulk-tracking', 'xlsx', 'Tracking')}>Download Excel</Btn>
                <Btn small onClick={() => saveRows(exportRows(), 'bulk-tracking', 'csv')}>Download CSV</Btn>
              </div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', minWidth: 900, borderCollapse: 'collapse', fontSize: 13 }}>
                <thead><tr style={{ background: '#f6f8fc', color: T.TEXT_MUTED, fontSize: 11.5, textAlign: 'left' }}>{['AWB', 'Status', 'Courier', 'Order', 'Customer', 'Payment', 'Last update', 'Expected delivery'].map((h) => <th key={h} style={{ padding: '10px 12px', fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase' }}>{h}</th>)}</tr></thead>
                <tbody>
                  {rows.map((r) => (r.found ? (
                    <tr key={r.awb} style={{ borderTop: `1px solid ${T.DIVIDER}` }}>
                      <td style={{ padding: '10px 12px' }}><AwbLink awb={r.awb} /></td>
                      <td style={{ padding: '10px 12px' }}><Pill color={tone(r.state)}>{label(r.state)}</Pill>{r.rto_status && <small style={{ display: 'block', color: T.TEXT_MUTED, marginTop: 3 }}>RTO: {titleCase(r.rto_status)}</small>}</td>
                      <td style={{ padding: '10px 12px' }}><b style={{ color: T.TEXT }}>{r.courier_name}</b><small style={{ display: 'block', color: T.TEXT_MUTED }}>{r.service_name}</small></td>
                      <td style={{ padding: '10px 12px' }}>{r.order_number}<small style={{ display: 'block', fontFamily: T.MONO, color: T.TEXT_MUTED }}>{r.nexgo_order_id}</small></td>
                      <td style={{ padding: '10px 12px' }}>{r.customer_name}<small style={{ display: 'block', color: T.TEXT_MUTED }}>{r.customer_city} {r.destination_pincode}</small></td>
                      <td style={{ padding: '10px 12px' }}>{r.payment_mode === 'cod' ? <>COD<small style={{ display: 'block', color: T.TEXT_MUTED }}>{inr(r.cod_amount_paise)}</small></> : 'Prepaid'}</td>
                      <td style={{ padding: '10px 12px', maxWidth: 260 }}>{r.last_description || '-'}<small style={{ display: 'block', color: T.TEXT_MUTED }}>{[r.last_location, r.last_event_at && dateTime(r.last_event_at)].filter(Boolean).join(' · ')}</small></td>
                      <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>{r.state === 'delivered' ? `Delivered ${dayText(r.delivered_at)}` : dayText(r.promised_delivery_at)}</td>
                    </tr>
                  ) : (
                    <tr key={r.awb} style={{ borderTop: `1px solid ${T.DIVIDER}`, background: '#fff5f5' }}>
                      <td style={{ padding: '10px 12px', fontFamily: T.MONO }}>{r.awb}</td>
                      <td style={{ padding: '10px 12px' }}><Pill color={T.RED}>Not found</Pill></td>
                      <td colSpan={6} style={{ padding: '10px 12px', color: T.TEXT_SECONDARY }}>This AWB is not on your account. Check for a typo, or whether it belongs to another seller.</td>
                    </tr>
                  )))}
                  {!rows.length && <tr><td colSpan={8} style={{ padding: 24, textAlign: 'center', color: T.TEXT_MUTED }}>Nothing in this view.</td></tr>}
                </tbody>
              </table>
            </div>
            {pages > 1 && <div style={{ padding: '10px 14px', display: 'flex', gap: 10, justifyContent: 'flex-end', alignItems: 'center', borderTop: `1px solid ${T.DIVIDER}`, fontSize: 12.5, color: T.TEXT_SECONDARY }}><Btn small disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Btn>Page {page} of {pages}<Btn small disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</Btn></div>}
          </section>
        </>
      )}
    </main>
  );
}
