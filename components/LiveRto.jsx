'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { useAppState } from '@/lib/AppStateContext';
import { FORMATS, saveRows } from '@/lib/exportFile';
import * as T from '@/lib/theme';
import { BLUE, Btn, CARD, FIELD, Pager, Pill, Stat, Table, dateTime, inr, inr0, isoDay, titleCase } from './Kit';

const REASONS = { customer_unavailable: 'Customer not available', address_incomplete: 'Incomplete address', address_incorrect: 'Wrong address', refused_delivery: 'Customer refused', payment_not_ready: 'Payment not ready', customer_requested_reschedule: 'Reschedule requested', premises_closed: 'Premises closed', customer_not_contactable: 'Not contactable', incorrect_product: 'Incorrect product', damaged_product: 'Damaged product', other: 'Other / courier initiated' };
const STAGES = [['all', 'All RTO'], ['in_transit_back', 'In transit back'], ['delivered_back', 'Delivered back']];

export default function LiveRto({ mobile }) {
  const { showToast, nav } = useAppState();
  const [stage, setStage] = useState('all'); const [page, setPage] = useState(1);
  const [qInput, setQInput] = useState(''); const [q, setQ] = useState('');
  const [courier, setCourier] = useState(''); const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const [format, setFormat] = useState('csv'); const [busy, setBusy] = useState(false);
  const [stats, setStats] = useState(null); const [data, setData] = useState({ key: '', items: [], total: 0, pages: 1, error: '' });

  useEffect(() => { const t = window.setTimeout(() => { setQ(qInput.trim()); setPage(1); }, 300); return () => window.clearTimeout(t); }, [qInput]);
  const params = useMemo(() => { const p = new URLSearchParams({ stage, page: String(page), pageSize: '8' }); if (q) p.set('q', q); if (courier) p.set('courier', courier); if (from) p.set('from', from); if (to) p.set('to', to); return p; }, [stage, page, q, courier, from, to]);
  const key = params.toString();
  useEffect(() => {
    let live = true;
    apiFetch(`/v1/rto/shipments?${key}`).then((x) => { if (live) setData({ key, items: x.items, total: x.total, pages: x.pages, error: '' }); })
      .catch((e) => { if (live) setData({ key, items: [], total: 0, pages: 1, error: e.status === 401 ? 'Sign in to view RTO shipments.' : e.message || 'RTO shipments could not be loaded.' }); });
    return () => { live = false; };
  }, [key]);
  useEffect(() => { let live = true; apiFetch('/v1/rto/stats').then((x) => { if (live) setStats(x); }).catch(() => { if (live) setStats({ error: true }); }); return () => { live = false; }; }, []);

  const loading = data.key !== key;
  const filter = (setter) => (e) => { setter(e.target.value); setPage(1); };
  const anyFilter = q || courier || from || to;

  const exportAll = async () => {
    setBusy(true);
    try {
      const p = new URLSearchParams(params); p.set('pageSize', '100'); const all = [];
      for (let pg = 1; pg <= 50; pg++) { p.set('page', String(pg)); const x = await apiFetch(`/v1/rto/shipments?${p}`); all.push(...x.items); if (pg >= x.pages) break; }
      if (!all.length) return showToast('Nothing to export for these filters.', 'error');
      await saveRows([['AWB', 'Order', 'Customer', 'City', 'Pincode', 'Courier', 'Service', 'Reason', 'Attempts', 'Payment', 'COD INR', 'Freight INR', 'RTO started', 'Delivered back', 'Stage'], ...all.map((r) => [r.awb, r.order_number, r.customer_name, r.customer_city, r.customer_pincode, r.courier_name, r.service_name, REASONS[r.ndr_reason] || (r.ndr_reason ? titleCase(r.ndr_reason) : 'Courier initiated'), r.attempt_number ?? '', r.payment_mode, r.cod_amount_paise / 100, r.shipping_charge_paise / 100, r.rto_started_at?.slice(0, 19).replace('T', ' '), r.rto_delivered_at?.slice(0, 19).replace('T', ' ') || '', r.stage === 'delivered_back' ? 'Delivered back' : 'In transit back'])], `rto-shipments-${isoDay()}`, format, 'RTO');
      showToast(`Exported ${all.length} RTO shipments (${format === 'xlsx' ? 'Excel' : 'CSV'})`);
    } catch (e) { showToast(e.message || 'Export failed', 'error'); } finally { setBusy(false); }
  };

  const ok = stats && !stats.error; const maxWeek = ok ? Math.max(1, ...stats.weekly.map((w) => w.n)) : 1;
  const pad = mobile ? '14px 12px 42px' : '18px 22px 48px';
  return (
    <div style={{ padding: pad }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
        <p style={{ margin: 0, color: T.TEXT_SECONDARY, fontSize: 13.5 }}>Parcels that are being returned to your warehouse: why they came back, which couriers they come from, and what they cost.</p>
        <div style={{ display: 'flex', gap: 8 }}><select aria-label="Export format" style={FIELD} value={format} onChange={(e) => setFormat(e.target.value)}>{FORMATS.map(([id, l]) => <option key={id} value={id}>{l}</option>)}</select><Btn onClick={exportAll} disabled={busy}>⤓ Download report</Btn></div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: mobile ? 'repeat(2,1fr)' : 'repeat(6,1fr)', gap: 12, marginBottom: 14 }}>
        <Stat label="Total RTO" value={ok ? stats.total : '—'} note="All time" color="#6D28D9" />
        <Stat label="RTO rate" value={ok ? `${stats.rtoRatePct}%` : '—'} note="Of shipped parcels" color={T.RED} />
        <Stat label="In transit back" value={ok ? stats.inTransitBack : '—'} note="On the way to you" color="#F58220" />
        <Stat label="Delivered back" value={ok ? stats.deliveredBack : '—'} note="Received at warehouse" color={T.GREEN} />
        <Stat label="COD value returned" value={ok ? inr0(stats.codReturnedPaise) : '—'} note="Not collected" color="#B45309" />
        <Stat label="Freight on RTO" value={ok ? inr0(stats.freightOnRtoPaise) : '—'} note="Forward freight paid" color={BLUE} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : 'minmax(0,1fr) 320px', gap: 16, alignItems: 'start' }}>
        <section style={{ ...CARD, minWidth: 0 }}>
          <div role="tablist" style={{ display: 'flex', gap: 4, padding: '4px 14px 0', borderBottom: `1px solid ${T.DIVIDER}`, overflowX: 'auto' }}>
            {STAGES.map(([id, label]) => { const on = stage === id; const n = !ok ? null : id === 'all' ? stats.total : id === 'in_transit_back' ? stats.inTransitBack : stats.deliveredBack; return <button key={id} role="tab" aria-selected={on} type="button" onClick={() => { setStage(id); setPage(1); }} style={{ padding: '12px 14px', border: 0, borderBottom: `3px solid ${on ? BLUE : 'transparent'}`, background: 'transparent', color: on ? BLUE : T.TEXT_SECONDARY, fontWeight: on ? 800 : 600, fontSize: 13.5, cursor: 'pointer', whiteSpace: 'nowrap' }}>{label}{n > 0 && <span style={{ marginLeft: 6, padding: '1px 7px', borderRadius: 99, background: BLUE, color: '#fff', fontSize: 11 }}>{n}</span>}</button>; })}
          </div>
          <div style={{ padding: 14, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <input aria-label="Search" style={{ ...FIELD, flex: '1 1 200px', minWidth: 160 }} placeholder="Search by AWB, Order ID or customer…" value={qInput} onChange={(e) => setQInput(e.target.value)} />
            <select aria-label="Courier" style={FIELD} value={courier} onChange={filter(setCourier)}><option value="">All couriers</option>{(ok ? stats.couriers : []).map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}</select>
            <input aria-label="From date" type="date" style={FIELD} value={from} max={to || undefined} onChange={filter(setFrom)} /><span style={{ color: T.TEXT_MUTED }}>–</span><input aria-label="To date" type="date" style={FIELD} value={to} min={from || undefined} onChange={filter(setTo)} />
            {anyFilter && <Btn small onClick={() => { setQInput(''); setQ(''); setCourier(''); setFrom(''); setTo(''); setPage(1); }}>Clear</Btn>}
          </div>
          <Table loading={loading} error={data.error} rows={data.items} minWidth={900} empty={anyFilter || stage !== 'all' ? 'No RTO shipments match these filters.' : 'No RTO shipments — every parcel is on its way to the customer.'}
            columns={[
              { h: 'Order / AWB', cell: (r) => <span><b style={{ color: BLUE }}>{r.order_number}</b><small style={{ display: 'block', fontFamily: T.MONO, color: T.TEXT_MUTED }}>{r.awb}</small></span> },
              { h: 'Customer', cell: (r) => <span><b>{r.customer_name}</b><small style={{ display: 'block', color: T.TEXT_MUTED }}>{r.customer_city}, {r.customer_pincode}</small></span> },
              { h: 'Courier', cell: (r) => <span><b>{r.courier_name}</b><small style={{ display: 'block', color: T.TEXT_MUTED }}>{r.service_name}</small></span> },
              { h: 'RTO reason', cell: (r) => <span><Pill color="#9A3412" bg="#F5822018">{REASONS[r.ndr_reason] || (r.ndr_reason ? titleCase(r.ndr_reason) : 'Courier initiated')}</Pill>{r.attempt_number && <small style={{ display: 'block', marginTop: 3, color: T.TEXT_MUTED }}>After {r.attempt_number} attempt{r.attempt_number === 1 ? '' : 's'}</small>}</span> },
              { h: 'Value', cell: (r) => <span><b>{r.payment_mode === 'cod' ? inr(r.cod_amount_paise) : 'Prepaid'}</b><small style={{ display: 'block', color: T.TEXT_MUTED }}>Freight {inr(r.shipping_charge_paise)}</small></span> },
              { h: 'RTO started', cell: (r) => dateTime(r.rto_started_at) },
              { h: 'Status', cell: (r) => (r.stage === 'delivered_back' ? <Pill color={T.GREEN}>Delivered back</Pill> : <Pill color="#C2410C">In transit back</Pill>) },
              { h: 'Action', cell: () => <Btn small onClick={() => nav('shipments')}>Track</Btn> },
            ]} />
          <Pager page={page} pages={data.pages} total={data.total} pageSize={8} onPage={setPage} loading={loading} />
        </section>

        <aside style={{ display: 'grid', gap: 14 }}>
          <section style={{ ...CARD, padding: 16 }}>
            <b style={{ color: T.TEXT, fontSize: 14 }}>RTO by courier</b>
            <div style={{ marginTop: 10, display: 'grid', gap: 10 }}>
              {ok && stats.couriers.filter((c) => c.shipments > 0).sort((a, b) => b.ratePct - a.ratePct).map((c) => (
                <div key={c.code}><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: T.TEXT_SECONDARY }}><span>{c.name}</span><b style={{ color: T.TEXT }}>{c.rto}/{c.shipments} · {c.ratePct}%</b></div><div style={{ height: 5, marginTop: 4, borderRadius: 3, background: T.DIVIDER }}><div style={{ height: 5, borderRadius: 3, width: `${Math.min(100, c.ratePct * 3)}%`, background: c.ratePct > 15 ? T.RED : c.ratePct > 8 ? '#F58220' : T.GREEN }} /></div></div>
              ))}
              {!ok && <span style={{ fontSize: 12.5, color: T.TEXT_MUTED }}>{stats ? 'Could not load.' : 'Loading…'}</span>}
            </div>
          </section>
          <section style={{ ...CARD, padding: 16 }}>
            <b style={{ color: T.TEXT, fontSize: 14 }}>Why parcels return</b>
            <div style={{ marginTop: 10, display: 'grid', gap: 9 }}>
              {ok && stats.reasons.map((r) => <div key={r.reason}><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: T.TEXT_SECONDARY }}><span>{REASONS[r.reason] || titleCase(r.reason)}</span><b style={{ color: T.TEXT }}>{r.count} ({r.pct}%)</b></div><div style={{ height: 5, marginTop: 4, borderRadius: 3, background: T.DIVIDER }}><div style={{ height: 5, borderRadius: 3, width: `${r.pct}%`, background: BLUE }} /></div></div>)}
              {ok && !stats.reasons.length && <span style={{ fontSize: 12.5, color: T.TEXT_MUTED }}>No RTO yet.</span>}
            </div>
          </section>
          <section style={{ ...CARD, padding: 16 }}>
            <b style={{ color: T.TEXT, fontSize: 14 }}>RTO started, last 8 weeks</b>
            <div style={{ marginTop: 12, display: 'flex', alignItems: 'flex-end', gap: 6, height: 90 }}>
              {ok && stats.weekly.map((w) => <div key={w.label} title={`${w.label}: ${w.n}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}><div style={{ width: '100%', height: `${Math.max(4, (w.n / maxWeek) * 70)}px`, borderRadius: 4, background: w.n ? BLUE : T.DIVIDER }} /><small style={{ fontSize: 9, color: T.TEXT_MUTED }}>{w.label.split(' ')[0]}</small></div>)}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
