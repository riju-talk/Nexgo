'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { useAppState } from '@/lib/AppStateContext';
import { FORMATS, saveRows } from '@/lib/exportFile';
import * as T from '@/lib/theme';
import { BLUE, Btn, CARD, FIELD, Pager, Pill, Stat, Table, dateTime, inr, inr0, isoDay, titleCase } from './Kit';
import ShipmentFilters, { EMPTY_FILTERS, filterParams } from './ShipmentFilters';

const REASONS = { customer_unavailable: 'Customer not available', address_incomplete: 'Incomplete address', address_incorrect: 'Wrong address', refused_delivery: 'Customer refused', payment_not_ready: 'Payment not ready', customer_requested_reschedule: 'Rescheduled by customer', other: 'Other' };
const STAGES = [['all', 'All RTO'], ['rto_in_transit', 'RTO in transit'], ['rto_out_for_delivery', 'RTO OFD'], ['rto_delivered', 'RTO delivered'], ['rto_lost', 'RTO lost'], ['rto_damaged', 'RTO damaged'], ['rto_undelivered', 'RTO undelivered']];
const STAGE_PILL = { rto_in_transit: ['In transit', '#C2410C'], rto_out_for_delivery: ['Out for delivery', '#B45309'], rto_delivered: ['Delivered', T.GREEN], rto_lost: ['Lost', T.RED], rto_damaged: ['Damaged', T.RED], rto_undelivered: ['Undelivered', '#9A3412'] };
const CHANNEL = { single: 'Single created', bulk_upload: 'Bulk upload' };
const PAGE_SIZE = 10;

export default function LiveRto({ mobile }) {
  const { showToast, nav } = useAppState();
  const [stage, setStage] = useState('all'); const [page, setPage] = useState(1);
  const [filters, setFilters] = useState(EMPTY_FILTERS); const [panel, setPanel] = useState(true);
  const [format, setFormat] = useState('csv'); const [busy, setBusy] = useState(false);
  const [stats, setStats] = useState(null); const [data, setData] = useState({ key: '', items: [], total: 0, pages: 1, error: '' });

  const params = useMemo(() => { const p = filterParams(filters, new URLSearchParams({ stage, page: String(page), pageSize: String(PAGE_SIZE) })); return p; }, [stage, page, filters]);
  const key = params.toString();
  useEffect(() => {
    let live = true;
    apiFetch(`/v1/rto/shipments?${key}`).then((x) => { if (live) setData({ key, items: x.items, total: x.total, pages: x.pages, error: '' }); })
      .catch((e) => { if (live) setData({ key, items: [], total: 0, pages: 1, error: e.status === 401 ? 'Sign in to view RTO shipments.' : e.message || 'RTO shipments could not be loaded.' }); });
    return () => { live = false; };
  }, [key]);
  useEffect(() => { let live = true; apiFetch('/v1/rto/stats').then((x) => { if (live) setStats(x); }).catch(() => { if (live) setStats({ error: true }); }); return () => { live = false; }; }, []);

  const loading = data.key !== key;
  const ok = stats && !stats.error;
  const anyFilter = Object.values(filters).some(Boolean);
  const apply = (next) => { setFilters(next); setPage(1); };

  const fetchAll = async () => {
    const p = new URLSearchParams(params); p.set('pageSize', '500'); const all = [];
    for (let pg = 1; pg <= 20; pg++) { p.set('page', String(pg)); const x = await apiFetch(`/v1/rto/shipments?${p}`); all.push(...x.items); if (pg >= x.pages) break; }
    return all;
  };
  const exportAll = async () => {
    setBusy(true);
    try {
      const all = await fetchAll();
      if (!all.length) return showToast('Nothing to export for these filters.', 'error');
      await saveRows([['AWB', 'Order', 'NEXGO order ID', 'Channel', 'Customer', 'Phone', 'City', 'Pincode', 'Courier', 'Service', 'Warehouse', 'Reason', 'Attempts', 'Payment', 'COD INR', 'Freight INR', 'WhatsApp', 'RTO started', 'Delivered back', 'Stage'],
        ...all.map((r) => [r.awb, r.order_number, r.nexgo_order_id, CHANNEL[r.channel] || titleCase(r.channel), r.customer_name, r.customer_phone, r.customer_city, r.customer_pincode, r.courier_name, r.service_name, r.warehouse_name, REASONS[r.ndr_reason] || r.ndr_reason || 'Courier initiated', r.attempt_number || '', r.payment_mode, r.payment_mode === 'cod' ? r.cod_amount_paise / 100 : 0, r.shipping_charge_paise / 100, r.whatsapp_status, dateTime(r.rto_started_at), r.rto_delivered_at ? dateTime(r.rto_delivered_at) : '', (STAGE_PILL[r.stage] || [r.stage])[0]])], `rto-${isoDay()}`, format, 'RTO');
      showToast(`Exported ${all.length} RTO shipments (${format === 'xlsx' ? 'Excel' : 'CSV'})`);
    } catch (e) { showToast(e.message || 'Export failed', 'error'); } finally { setBusy(false); }
  };
  // A pickup-style manifest of the returning parcels: what the warehouse should expect, grouped by courier.
  const manifest = async () => {
    setBusy(true);
    try {
      const all = (await fetchAll()).filter((r) => r.stage !== 'rto_delivered').sort((a, b) => String(a.courier_name).localeCompare(String(b.courier_name)));
      if (!all.length) return showToast('No returning parcels to list for these filters.', 'error');
      await saveRows([['#', 'Courier', 'AWB', 'Order', 'Customer', 'Phone', 'City', 'Pincode', 'Return to warehouse', 'Stage', 'Received (tick)'], ...all.map((r, i) => [i + 1, r.courier_name, r.awb, r.order_number, r.customer_name, r.customer_phone, r.customer_city, r.customer_pincode, r.warehouse_name, (STAGE_PILL[r.stage] || [r.stage])[0], ''])], `rto-manifest-${isoDay()}`, format, 'Manifest');
      showToast(`Manifest created for ${all.length} returning parcels (${format === 'xlsx' ? 'Excel' : 'CSV'})`);
    } catch (e) { showToast(e.message || 'Manifest failed', 'error'); } finally { setBusy(false); }
  };

  const maxWeek = ok ? Math.max(1, ...stats.weekly.map((w) => w.n)) : 1;
  const pad = mobile ? '14px 12px 42px' : '18px 22px 48px';
  const count = (id) => (!ok ? null : id === 'all' ? stats.total : stats.stages?.[id] || 0);
  return (
    <div style={{ padding: pad }}>
      <div style={{ display: 'grid', gridTemplateColumns: mobile ? 'repeat(2,1fr)' : 'repeat(6,1fr)', gap: 12, marginBottom: 14 }}>
        <Stat label="Total RTO" value={ok ? stats.total : '—'} note="All time" color="#6D28D9" />
        <Stat label="RTO rate" value={ok ? `${stats.rtoRatePct}%` : '—'} note="Of shipped parcels" color={T.RED} />
        <Stat label="In transit back" value={ok ? stats.inTransitBack : '—'} note="On the way to you" color="#F58220" />
        <Stat label="Delivered back" value={ok ? stats.deliveredBack : '—'} note="Received at warehouse" color={T.GREEN} />
        <Stat label="COD value returned" value={ok ? inr0(stats.codReturnedPaise) : '—'} note="Not collected" color="#B45309" />
        <Stat label="Freight on RTO" value={ok ? inr0(stats.freightOnRtoPaise) : '—'} note="Forward freight paid" color={BLUE} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : 'minmax(0,1fr) 300px', gap: 16, alignItems: 'start' }}>
        <section style={{ ...CARD, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '12px 14px 0' }}>
            <b style={{ color: T.TEXT, fontSize: 15 }}>Shipments</b>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Btn small onClick={() => setPanel((o) => !o)}>{panel ? 'Hide filters' : `Filters${anyFilter ? ' •' : ''}`}</Btn>
              <select aria-label="Export format" style={{ ...FIELD, height: 32 }} value={format} onChange={(e) => setFormat(e.target.value)}>{FORMATS.map(([id, l]) => <option key={id} value={id}>{l}</option>)}</select>
              <Btn small disabled={busy} onClick={exportAll}>Export</Btn>
              <Btn small disabled={busy} onClick={manifest}>Manifest</Btn>
            </div>
          </div>
          {panel && <div style={{ marginTop: 10 }}><ShipmentFilters key={JSON.stringify(filters)} value={filters} onApply={apply} couriers={ok ? stats.couriers : []} mobile={mobile} /></div>}
          <div role="tablist" style={{ display: 'flex', gap: 4, padding: '4px 14px 0', borderBottom: `1px solid ${T.DIVIDER}`, overflowX: 'auto' }}>
            {STAGES.map(([id, label]) => {
              const on = stage === id; const n = count(id);
              return <button key={id} role="tab" aria-selected={on} type="button" onClick={() => { setStage(id); setPage(1); }} style={{ padding: '10px 12px', border: 0, borderBottom: `2px solid ${on ? BLUE : 'transparent'}`, background: 'transparent', color: on ? BLUE : T.TEXT_SECONDARY, fontWeight: on ? 750 : 600, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}>{label}{n !== null && <span style={{ marginLeft: 6, padding: '1px 7px', borderRadius: 99, background: on ? `${BLUE}1c` : T.SURFACE_SOFT, fontSize: 11 }}>{n}</span>}</button>;
            })}
          </div>
          <Table loading={loading} error={data.error} rows={data.items} minWidth={1000} empty={anyFilter || stage !== 'all' ? 'No RTO shipments match these filters.' : 'No RTO shipments — every parcel is on its way to the customer.'}
            columns={[
              { h: 'Order / AWB', cell: (r) => <span><b style={{ color: BLUE }}>{r.order_number}</b><small style={{ display: 'block', fontFamily: T.MONO, color: T.TEXT_MUTED }}>{r.awb}</small><small style={{ display: 'block', fontFamily: T.MONO, color: T.TEXT_MUTED }}>{r.nexgo_order_id}</small></span> },
              { h: 'Customer', cell: (r) => <span><b>{r.customer_name}</b><small style={{ display: 'block', color: T.TEXT_MUTED }}>{r.customer_phone}</small><small style={{ display: 'block', color: T.TEXT_MUTED }}>{r.customer_city}, {r.customer_pincode}</small></span> },
              { h: 'Courier', cell: (r) => <span><b>{r.courier_name}</b><small style={{ display: 'block', color: T.TEXT_MUTED }}>{r.service_name}</small><small style={{ display: 'block', color: T.TEXT_MUTED }}>To {r.warehouse_name}</small></span> },
              { h: 'RTO reason', cell: (r) => <span><Pill color="#9A3412" bg="#F5822018">{REASONS[r.ndr_reason] || (r.ndr_reason ? titleCase(r.ndr_reason) : 'Courier initiated')}</Pill>{r.attempt_number && <small style={{ display: 'block', marginTop: 3, color: T.TEXT_MUTED }}>After attempt {r.attempt_number}</small>}</span> },
              { h: 'Value', cell: (r) => <span><b>{r.payment_mode === 'cod' ? inr(r.cod_amount_paise) : 'Prepaid'}</b><small style={{ display: 'block', color: T.TEXT_MUTED }}>Freight {inr(r.shipping_charge_paise)}</small></span> },
              { h: 'RTO started', cell: (r) => dateTime(r.rto_started_at) },
              { h: 'Status', cell: (r) => { const [name, color] = STAGE_PILL[r.stage] || [titleCase(r.stage), T.TEXT_MUTED]; return <Pill color={color}>{name}</Pill>; } },
              { h: 'Action', cell: () => <Btn small onClick={() => nav('shipments')}>Track</Btn> },
            ]} />
          <Pager page={page} pages={data.pages} total={data.total} pageSize={PAGE_SIZE} onPage={setPage} loading={loading} />
        </section>

        <aside style={{ display: 'grid', gap: 14 }}>
          <section style={{ ...CARD, padding: 16 }}>
            <b style={{ color: T.TEXT, fontSize: 14 }}>RTO by courier</b>
            <div style={{ marginTop: 10, display: 'grid', gap: 10 }}>
              {ok && stats.couriers.filter((c) => c.shipments > 0).sort((a, b) => b.ratePct - a.ratePct).map((c) => (
                <div key={c.code}><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: T.TEXT_SECONDARY }}><span>{c.name}</span><b style={{ color: T.TEXT }}>{c.rto}/{c.shipments} · {c.ratePct}%</b></div><div style={{ height: 6, borderRadius: 4, background: T.BORDER, marginTop: 4 }}><div style={{ width: `${Math.min(100, c.ratePct * 3)}%`, height: '100%', borderRadius: 4, background: c.ratePct > 10 ? T.RED : BLUE }} /></div></div>
              ))}
              {!ok && <span style={{ fontSize: 12.5, color: T.TEXT_MUTED }}>{stats ? 'Could not load.' : 'Loading…'}</span>}
            </div>
          </section>
          <section style={{ ...CARD, padding: 16 }}>
            <b style={{ color: T.TEXT, fontSize: 14 }}>Why parcels return</b>
            <div style={{ marginTop: 10, display: 'grid', gap: 9 }}>
              {ok && stats.reasons.map((r) => <div key={r.reason}><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: T.TEXT_SECONDARY }}><span>{REASONS[r.reason] || titleCase(r.reason)}</span><b style={{ color: T.TEXT }}>{r.count} · {r.pct}%</b></div></div>)}
              {ok && !stats.reasons.length && <span style={{ fontSize: 12.5, color: T.TEXT_MUTED }}>No RTO yet.</span>}
            </div>
          </section>
          <section style={{ ...CARD, padding: 16 }}>
            <b style={{ color: T.TEXT, fontSize: 14 }}>RTO started, last 8 weeks</b>
            <div style={{ marginTop: 12, display: 'flex', alignItems: 'flex-end', gap: 6, height: 90 }}>
              {ok && stats.weekly.map((w) => <div key={w.label} title={`${w.label}: ${w.n}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}><div style={{ width: '100%', height: `${Math.max(4, (w.n / maxWeek) * 70)}px`, borderRadius: 3, background: '#6D28D9' }} /><small style={{ fontSize: 9.5, color: T.TEXT_MUTED }}>{w.label.split(' ')[0]}</small></div>)}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
