'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { useAppState } from '@/lib/AppStateContext';
import { FORMATS, saveRows } from '@/lib/exportFile';
import * as T from '@/lib/theme';
import { BLUE, Btn, CARD, FIELD, Table, isoDay } from './Kit';

const METRICS = [
  { key: 'totalShipments', label: 'Total Shipments' },
  { key: 'deliveryRate', label: 'Delivery Rate %', format: v => v.toFixed(2) },
  { key: 'ndrRate', label: 'NDR Rate %', format: v => v.toFixed(2) },
  { key: 'rtoRate', label: 'RTO Rate %', format: v => v.toFixed(2) },
  { key: 'avgDeliveryDays', label: 'Avg Days', format: v => v.toFixed(1) },
  { key: 'onTimeDeliveryRate', label: 'On-Time %', format: v => v.toFixed(2) }
];

export default function LiveCourierPerformance({ mobile }) {
  const { showToast } = useAppState();
  const [tab, setTab] = useState('comparison'); // comparison, zones, timeseries
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return isoDay(d);
  });
  const [dateTo, setDateTo] = useState(isoDay(new Date()));
  const [data, setData] = useState({ couriers: [], summary: null, zones: null, timeseries: null, error: '' });
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [format, setFormat] = useState('csv');

  const key = `${tab}#${dateFrom}#${dateTo}#${tick}`;

  useEffect(() => {
    let live = true;
    setBusy(true);

    (async () => {
      try {
        let result;
        if (tab === 'comparison') {
          result = await apiFetch(`/v1/admin/couriers/performance/all?from=${dateFrom}&to=${dateTo}`);
        } else if (tab === 'zones') {
          if (!data.couriers?.[0]) {
            setData(d => ({ ...d, error: 'Select a courier first' }));
            setBusy(false);
            return;
          }
          result = await apiFetch(`/v1/admin/couriers/${data.couriers[0].courierId}/performance/zones?from=${dateFrom}&to=${dateTo}`);
        } else {
          if (!data.couriers?.[0]) {
            setData(d => ({ ...d, error: 'Select a courier first' }));
            setBusy(false);
            return;
          }
          result = await apiFetch(`/v1/admin/couriers/${data.couriers[0].courierId}/performance/timeseries?from=${dateFrom}&to=${dateTo}&interval=day`);
        }

        if (live) {
          if (tab === 'comparison') {
            setData({ couriers: result.couriers || [], summary: result.summary, zones: null, timeseries: null, error: '' });
          } else if (tab === 'zones') {
            setData(d => ({ ...d, zones: result.zones, error: '' }));
          } else {
            setData(d => ({ ...d, timeseries: result.data, error: '' }));
          }
        }
      } catch (e) {
        if (live) setData(d => ({ ...d, error: e.message || 'Failed to load data' }));
      } finally {
        if (live) setBusy(false);
      }
    })();

    return () => { live = false; };
  }, [key]);

  const exportData = async () => {
    setBusy(true);
    try {
      const rows = data.couriers.map(c => [
        c.courierName,
        c.totalShipments,
        c.deliveryRate.toFixed(2),
        c.ndrRate.toFixed(2),
        c.rtoRate.toFixed(2),
        c.avgDeliveryDays.toFixed(1),
        c.onTimeDeliveryRate.toFixed(2),
        c.pickupSuccessRate.toFixed(2)
      ]);

      await saveRows(
        [['Courier', 'Total Shipments', 'Delivery %', 'NDR %', 'RTO %', 'Avg Days', 'On-Time %', 'Pickup %'], ...rows],
        `courier-performance-${isoDay()}`,
        format,
        'Performance'
      );
      showToast(`Exported ${data.couriers.length} couriers`);
    } catch (e) {
      showToast(e.message || 'Export failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ padding: mobile ? '14px 12px 42px' : '18px 28px 48px', maxWidth: 1680, margin: '0 auto' }}>
      {/* Stats */}
      {data.summary && (
        <div style={{ display: 'grid', gridTemplateColumns: mobile ? 'repeat(2,1fr)' : 'repeat(3,1fr)', gap: 12, marginBottom: 14 }}>
          {[
            ['Total Couriers', data.summary.totalCouriers, BLUE],
            ['Avg Delivery %', data.summary.avgDeliveryRate, T.GREEN],
            ['Avg NDR %', data.summary.avgNDRRate, T.RED]
          ].map(([l, v, col]) => (
            <div key={l} style={{ ...CARD, padding: 14, borderTop: `3px solid ${col}`, background: 'var(--ops-surface)' }}>
              <span style={{ fontSize: 11.5, color: T.TEXT_MUTED }}>{l}</span>
              <b style={{ display: 'block', fontSize: 22, color: T.TEXT, marginTop: 3 }}>{typeof v === 'number' ? v.toFixed(1) : v}</b>
            </div>
          ))}
        </div>
      )}

      <section style={{ ...CARD, background: 'var(--ops-surface)' }}>
        {/* Tabs */}
        <div role="tablist" style={{ display: 'flex', gap: 4, padding: '4px 14px 0', borderBottom: `1px solid ${T.DIVIDER}` }}>
          {['comparison', 'zones', 'timeseries'].map(t => (
            <button key={t} role="tab" aria-selected={tab === t} type="button" onClick={() => setTab(t)} style={{ padding: '12px 14px', border: 0, borderBottom: `3px solid ${tab === t ? BLUE : 'transparent'}`, background: 'transparent', color: tab === t ? BLUE : T.TEXT_SECONDARY, fontWeight: tab === t ? 800 : 600, fontSize: 13.5, cursor: 'pointer' }}>
              {t === 'comparison' ? 'Comparison' : t === 'zones' ? 'By Zone' : 'Trends'}
            </button>
          ))}
        </div>

        {/* Controls */}
        <div style={{ padding: 14, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input type="date" style={FIELD} value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setTick(t => t + 1); }} />
          <input type="date" style={FIELD} value={dateTo} onChange={(e) => { setDateTo(e.target.value); setTick(t => t + 1); }} />
          <select style={FIELD} value={format} onChange={(e) => setFormat(e.target.value)}>{FORMATS.map(([id, l]) => <option key={id} value={id}>{l}</option>)}</select>
          <Btn onClick={exportData} disabled={busy || data.couriers.length === 0}>⤓ Export</Btn>
        </div>

        {data.error && (
          <div style={{ padding: 14, color: T.RED, fontSize: 13 }}>{data.error}</div>
        )}

        {/* Comparison Table */}
        {tab === 'comparison' && (
          <Table
            loading={busy}
            error={data.error}
            rows={data.couriers}
            minWidth={1100}
            empty="No couriers with data in this period."
            columns={[
              { h: 'Courier', cell: (r) => <b>{r.courierName}</b> },
              ...METRICS.map(m => ({
                h: m.label,
                cell: (r) => <span>{m.format ? m.format(r[m.key]) : r[m.key]}</span>
              }))
            ]}
          />
        )}

        {/* Zone Performance */}
        {tab === 'zones' && data.zones && (
          <Table
            loading={busy}
            error={data.error}
            rows={data.zones}
            minWidth={600}
            empty="No zone data available."
            columns={[
              { h: 'Zone', cell: (r) => <b>{r.zone}</b> },
              { h: 'Shipments', cell: (r) => r.totalShipments },
              { h: 'Delivery %', cell: (r) => r.deliveryRate.toFixed(2) },
              { h: 'Avg Days', cell: (r) => r.avgDeliveryDays.toFixed(1) }
            ]}
          />
        )}

        {/* Timeseries */}
        {tab === 'timeseries' && data.timeseries && (
          <Table
            loading={busy}
            error={data.error}
            rows={data.timeseries}
            minWidth={600}
            empty="No timeseries data available."
            columns={[
              { h: 'Date', cell: (r) => new Date(r.date).toLocaleDateString() },
              { h: 'Shipments', cell: (r) => r.totalShipments },
              { h: 'Delivery %', cell: (r) => r.deliveryRate.toFixed(2) },
              { h: 'NDR %', cell: (r) => r.ndrRate.toFixed(2) }
            ]}
          />
        )}
      </section>
    </div>
  );
}
