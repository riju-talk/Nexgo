'use client';

import { useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { useAppState } from '@/lib/AppStateContext';
import { useLiveQuery, clearCached } from '@/lib/queryCache';
import { saveRows } from '@/lib/exportFile';
import * as T from '@/lib/theme';
import { BLUE, Btn, CARD, FIELD, Pager, Pill, ProgressBar, Table, dateTime } from './Kit';

const PAGE_SIZE = 15;
const STATUS = [['', 'All'], ['pending', 'Pending'], ['in_progress', 'In progress'], ['completed', 'Completed']];
const TONE = { pending: '#8A5A00', in_progress: BLUE, completed: T.GREEN };
const LABEL = { pending: 'Pending pickup', in_progress: 'In progress', completed: 'Completed' };

// Pickup & Manifests: the list a courier signs when collecting parcels. One manifest per courier and pickup address per day.
export default function LiveManifests({ mobile }) {
  const { showToast } = useAppState();
  const [status, setStatus] = useState(''); const [page, setPage] = useState(1);
  const [qInput, setQInput] = useState(''); const [q, setQ] = useState('');
  const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false); const [downloading, setDownloading] = useState('');
  const [format, setFormat] = useState('xlsx');

  const qs = useMemo(() => {
    const p = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (status) p.set('status', status); if (q) p.set('q', q); if (from) p.set('from', from); if (to) p.set('to', to);
    return p.toString();
  }, [status, page, q, from, to]);
  const url = `/v1/manifests?${qs}`;
  const { data, error, loading, refresh } = useLiveQuery(url, { every: 30000 });
  const items = data?.items || [];
  const dateBad = from && to && from > to;

  const generate = async () => {
    setBusy(true);
    try {
      const r = await apiFetch('/v1/manifests/generate', { method: 'POST', body: {} });
      showToast(r.message, r.created ? 'success' : 'info');
      clearCached('/v1/manifests'); refresh();
    } catch (e) { showToast(e.message || 'Could not generate manifests', 'error'); } finally { setBusy(false); }
  };

  const download = async (m) => {
    setDownloading(m.id);
    try {
      const r = await apiFetch(`/v1/manifests/${m.id}/items`);
      const rows = r.items.map((x, i) => ({
        '#': i + 1, AWB: x.awb, 'Order ID': x.order_number, 'Weight (kg)': (Number(x.chargeable_weight_g) / 1000).toFixed(2),
        Payment: x.payment_mode === 'cod' ? 'COD' : 'Prepaid', 'COD amount (INR)': x.payment_mode === 'cod' ? Number(x.cod_amount_paise) / 100 : 0,
        Destination: [x.destination_city, x.destination_pincode].filter(Boolean).join(' '), 'Collected by courier': x.collected ? 'Yes' : 'No',
      }));
      if (!rows.length) { showToast('There are no parcels on this manifest.', 'error'); return; }
      await saveRows(rows, `manifest-${m.manifest_no}`, format, 'Manifest');
      showToast(`${m.manifest_no} downloaded`);
    } catch (e) { showToast(e.message || 'Could not download the manifest', 'error'); } finally { setDownloading(''); }
  };

  const columns = [
    { h: 'Manifest', cell: (m) => <><b>{m.manifest_no}</b><div style={{ color: T.TEXT_MUTED, fontSize: 12 }}>{dateTime(m.created_at)}</div></> },
    { h: 'Courier', cell: (m) => m.courier },
    { h: 'Pickup address', cell: (m) => <><div>{m.warehouse || '—'}</div><div style={{ color: T.TEXT_MUTED, fontSize: 12 }}>{[m.address, m.city].filter(Boolean).join(', ')}</div></> },
    { h: 'Orders', right: true, cell: (m) => m.parcels },
    { h: 'Progress', cell: (m) => <div style={{ minWidth: 130 }}><ProgressBar value={m.collected} total={m.parcels} color={TONE[m.status]} /><div style={{ fontSize: 11.5, color: T.TEXT_MUTED, marginTop: 4 }}>{m.collected} of {m.parcels} collected</div></div> },
    { h: 'Status', cell: (m) => <Pill color={TONE[m.status]}>{LABEL[m.status]}</Pill> },
    { h: 'Actions', cell: (m) => <Btn small loading={downloading === m.id} onClick={() => download(m)}>Download</Btn> },
  ];

  return (
    <div style={{ padding: mobile ? '14px 12px 42px' : '18px 28px 48px', display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div>
          <div style={{ color: T.TEXT, fontWeight: 760, fontSize: 19 }}>Pickup &amp; Manifests</div>
          <div style={{ color: T.TEXT_SECONDARY, marginTop: 4, fontSize: 13, maxWidth: 640 }}>A manifest is the list the courier signs when collecting your parcels. Generating makes one per courier and pickup address from every parcel still waiting for pickup.</div>
        </div>
        <Btn primary loading={busy} onClick={generate}>Generate today&apos;s manifests</Btn>
      </div>

      <section style={CARD}>
        <div role="tablist" style={{ display: 'flex', gap: 4, padding: '4px 14px 0', borderBottom: `1px solid ${T.DIVIDER}`, overflowX: 'auto' }}>
          {STATUS.map(([id, name]) => { const on = status === id; return <button key={id || 'all'} role="tab" aria-selected={on} type="button" onClick={() => { setStatus(id); setPage(1); }} style={{ padding: '12px 14px', border: 0, borderBottom: `3px solid ${on ? BLUE : 'transparent'}`, background: 'transparent', color: on ? BLUE : T.TEXT_SECONDARY, fontWeight: on ? 800 : 600, fontSize: 13.5, cursor: 'pointer', whiteSpace: 'nowrap' }}>{name}</button>; })}
        </div>
        <div style={{ padding: 14, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input aria-label="Search manifests" style={{ ...FIELD, flex: '1 1 220px', minWidth: 160 }} placeholder="Search manifest ID, courier or pickup address" value={qInput} onChange={(e) => setQInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { setQ(qInput.trim()); setPage(1); } }} onBlur={() => { if (qInput.trim() !== q) { setQ(qInput.trim()); setPage(1); } }} />
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: T.TEXT_SECONDARY }}>From <input type="date" aria-label="From date" style={FIELD} value={from} max={to || undefined} onChange={(e) => { setFrom(e.target.value); setPage(1); }} /></label>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: T.TEXT_SECONDARY }}>To <input type="date" aria-label="To date" style={FIELD} value={to} min={from || undefined} onChange={(e) => { setTo(e.target.value); setPage(1); }} /></label>
          <select aria-label="Download format" style={FIELD} value={format} onChange={(e) => setFormat(e.target.value)}><option value="xlsx">Excel (.xlsx)</option><option value="csv">CSV</option></select>
          {(from || to || q) && <Btn small onClick={() => { setFrom(''); setTo(''); setQ(''); setQInput(''); setPage(1); }}>Clear</Btn>}
        </div>
        {dateBad && <div role="alert" style={{ padding: '0 14px 10px', color: T.RED, fontSize: 12.5 }}>The From date must be on or before the To date.</div>}
        <Table columns={columns} rows={dateBad ? [] : items} loading={loading && !data} error={error ? (error.message || 'Manifests could not be loaded.') : ''} empty={status || q || from || to ? 'No manifests match these filters.' : 'No manifests yet. Book shipments, then generate today’s manifests.'} minWidth={900} />
        <Pager page={page} pages={data?.pages || 1} total={data?.total || 0} pageSize={PAGE_SIZE} onPage={setPage} loading={loading} />
      </section>
    </div>
  );
}
