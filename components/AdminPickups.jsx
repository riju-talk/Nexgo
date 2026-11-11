'use client';

import { useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { useAppState } from '@/lib/AppStateContext';
import { useLiveQuery } from '@/lib/queryCache';
import { saveRows } from '@/lib/exportFile';
import * as T from '@/lib/theme';
import { BLUE, Btn, CARD, FIELD, Pager, Pill, Stat, Table, dateTime } from './Kit';

const PAGE_SIZE = 25;
const AGE_TABS = [['all', 'All pending', 'total'], ['missed', 'Missed (over 24 h)', 'missed'], ['today', 'Booked today', 'today'], ['yesterday', 'Booked yesterday', 'yesterday'], ['older', 'Older', 'older']];
const waiting = (hours) => (hours === null || hours === undefined ? '—' : hours < 48 ? `${hours} h` : `${Math.floor(hours / 24)} d ${hours % 24} h`);

// Admin > Pickups: every parcel booked and not yet collected, across all sellers. Same definition as every other pickup figure in the product.
export default function AdminPickups({ mobile }) {
  const { showToast } = useAppState();
  const [age, setAge] = useState('all'); const [sellerId, setSellerId] = useState(''); const [courier, setCourier] = useState(''); const [warehouse, setWarehouse] = useState('');
  const [q, setQ] = useState(''); const [search, setSearch] = useState(''); const [page, setPage] = useState(1); const [exporting, setExporting] = useState(false);

  const qs = useMemo(() => {
    const p = new URLSearchParams({ age, page: String(page), pageSize: String(PAGE_SIZE) });
    if (sellerId) p.set('sellerId', sellerId); if (courier) p.set('courier', courier); if (warehouse) p.set('warehouse', warehouse); if (search) p.set('q', search);
    return p;
  }, [age, sellerId, courier, warehouse, search, page]);
  const { data, error, loading, refresh } = useLiveQuery(`/v1/admin/pickups?${qs.toString()}`, { every: 30000 });
  const sum = data?.summary; const filters = data?.filters || { sellers: [], couriers: [], warehouses: [] };
  const change = (setter) => (e) => { setter(e.target.value); setPage(1); };

  const exportRows = async (format) => {
    setExporting(true);
    try {
      const all = new URLSearchParams(qs); all.set('page', '1'); all.set('pageSize', '1000');
      const r = await apiFetch(`/v1/admin/pickups?${all.toString()}`);
      const rows = r.items.map((x) => ({ AWB: x.awb, Order: x.order_number, Seller: x.seller_name, Warehouse: x.warehouse_name || '', Courier: x.courier_name, 'Booked on': x.booked_at, 'Waiting (hours)': x.age_hours, Status: x.overdue ? 'Missed' : 'Pending', 'Pickup deadline': x.pickup_deadline_at || '', 'Last courier update': x.last_status || '' }));
      if (!rows.length) { showToast('There is nothing to export for these filters.', 'error'); return; }
      await saveRows(rows, 'pickups-pending', format, 'Pickups');
      showToast(`${rows.length} pickup${rows.length === 1 ? '' : 's'} exported${r.total > rows.length ? ` (first ${rows.length} of ${r.total})` : ''}`);
    } catch (e) { showToast(e.message || 'Could not export', 'error'); } finally { setExporting(false); }
  };

  const columns = [
    { h: 'AWB', cell: (r) => <b>{r.awb}</b> }, { h: 'Order', cell: (r) => r.order_number }, { h: 'Seller', cell: (r) => r.seller_name },
    { h: 'Warehouse', cell: (r) => r.warehouse_name || '—' }, { h: 'Courier', cell: (r) => r.courier_name },
    { h: 'Booked on', cell: (r) => dateTime(r.booked_at) }, { h: 'Waiting', cell: (r) => waiting(r.age_hours) },
    { h: 'Status', cell: (r) => <Pill color={r.overdue ? T.RED : '#8A5A00'}>{r.overdue ? 'Missed' : 'Pending'}</Pill> },
    { h: 'Last courier update', cell: (r) => <span style={{ color: T.TEXT_MUTED }}>{r.last_status || 'No scan yet'}</span> },
  ];

  return (
    <div style={{ padding: mobile ? '14px 12px 42px' : '18px 28px 48px', display: 'grid', gap: 14 }}>
      <div>
        <div style={{ color: T.TEXT, fontWeight: 760, fontSize: 19 }}>Pickups pending</div>
        <div style={{ color: T.TEXT_SECONDARY, marginTop: 4, fontSize: 13 }}>Parcels booked and not yet collected by the courier, across all sellers. A parcel is missed when 24 hours have passed since booking (or since its re-pickup window) with no pickup scan.</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: mobile ? 'repeat(2,minmax(0,1fr))' : 'repeat(5,minmax(0,1fr))', gap: 12 }}>
        <Stat label="Pending" value={sum ? sum.total.toLocaleString('en-IN') : '—'} note="Right now" color={BLUE} />
        <Stat label="Missed" value={sum ? sum.missed.toLocaleString('en-IN') : '—'} note="Over 24 hours" color={T.RED} />
        <Stat label="Booked today" value={sum ? sum.today.toLocaleString('en-IN') : '—'} note="India date" color={T.GREEN} />
        <Stat label="Booked yesterday" value={sum ? sum.yesterday.toLocaleString('en-IN') : '—'} note="India date" color="#8A5A00" />
        <Stat label="Older" value={sum ? sum.older.toLocaleString('en-IN') : '—'} note="Before yesterday" color="#6D28D9" />
      </div>
      <section style={{ ...CARD, overflow: 'hidden' }}>
        <div role="tablist" style={{ display: 'flex', gap: 4, padding: '8px 10px 0', borderBottom: `1px solid ${T.DIVIDER}`, overflowX: 'auto' }}>
          {AGE_TABS.map(([id, label, key]) => (
            <button key={id} role="tab" aria-selected={age === id} type="button" onClick={() => { setAge(id); setPage(1); }} style={{ border: 0, background: 'transparent', padding: '9px 12px', cursor: 'pointer', fontSize: 13, fontWeight: age === id ? 750 : 600, color: age === id ? BLUE : T.TEXT_SECONDARY, borderBottom: `2px solid ${age === id ? BLUE : 'transparent'}`, whiteSpace: 'nowrap' }}>
              {label} <span style={{ color: T.TEXT_MUTED, fontWeight: 600 }}>{sum ? sum[key] : '—'}</span>
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: 12, alignItems: 'center' }}>
          <form onSubmit={(e) => { e.preventDefault(); setSearch(q.trim()); setPage(1); }} style={{ display: 'flex', gap: 6 }}>
            <input aria-label="Search AWB or order" value={q} onChange={(e) => setQ(e.target.value)} placeholder="AWB or order number" style={{ ...FIELD, width: 200 }} />
            <Btn small type="submit">Search</Btn>
          </form>
          <select aria-label="Seller" value={sellerId} onChange={change(setSellerId)} style={{ ...FIELD, width: 180 }}><option value="">All sellers</option>{filters.sellers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          <select aria-label="Courier" value={courier} onChange={change(setCourier)} style={{ ...FIELD, width: 160 }}><option value="">All couriers</option>{filters.couriers.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}</select>
          <select aria-label="Warehouse" value={warehouse} onChange={change(setWarehouse)} style={{ ...FIELD, width: 170 }}><option value="">All warehouses</option>{filters.warehouses.map((w) => <option key={w} value={w}>{w}</option>)}</select>
          <span style={{ flex: 1 }} />
          <Btn small loading={exporting} onClick={() => exportRows('xlsx')}>Excel</Btn><Btn small disabled={exporting} onClick={() => exportRows('csv')}>CSV</Btn>
          <Btn small onClick={refresh}>Refresh</Btn>
        </div>
        <Table columns={columns} rows={data?.items || []} loading={loading} error={error && !data ? (error.message || 'Pickups could not be loaded.') : ''} empty="No pickups are pending for these filters." minWidth={980} />
        <Pager page={page} pages={Math.max(1, Math.ceil((data?.total || 0) / PAGE_SIZE))} total={data?.total || 0} pageSize={PAGE_SIZE} onPage={setPage} loading={loading} />
      </section>
    </div>
  );
}
