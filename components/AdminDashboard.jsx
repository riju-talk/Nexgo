'use client';

import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { useAppState } from '@/lib/AppStateContext';
import { adminApi } from '@/lib/api';
import * as T from '@/lib/theme';

const SPRING = { type: 'spring', bounce: 0, duration: 0.28 };
const n = (v) => Number(v || 0).toLocaleString('en-IN');
const rupees = (paise) => `₹${(Number(paise || 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const STATUS_COLORS = { delivered: '#14724F', in_transit: '#3C6094', out_for_delivery: '#1b9fd6', pickup_scheduled: '#8A5A00', ndr: '#B23A2B', rto: '#7A4B9C', cancelled: '#8C8778' };
const statusName = (k) => k.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());

function Card({ children, style = {} }) {
  return <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={SPRING} style={{ overflow: 'hidden', background: 'var(--ops-surface)', border: '1px solid var(--ops-border)', borderRadius: 14, boxShadow: 'var(--ops-shadow)', ...style }}>{children}</motion.div>;
}
function CardTitle({ children }) {
  return <div style={{ height: 52, padding: '0 19px', display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--ops-divider)', fontSize: 14, fontWeight: 750, color: 'var(--ops-heading)' }}>{children}</div>;
}
const Empty = ({ children = 'No data for this period.' }) => <div style={{ padding: '30px 19px', color: 'var(--ops-subtle)', fontSize: 12.5 }}>{children}</div>;

// Solid-colour daily bars. Each series draws side by side; hover shows the exact day figure.
function DailyBars({ rows, series, format = n }) {
  const max = Math.max(1, ...rows.flatMap((r) => series.map((s) => r[s.key] || 0)));
  if (!rows.length || max <= 1 && rows.every((r) => series.every((s) => !r[s.key]))) return <Empty />;
  return (
    <div style={{ padding: '14px 18px 12px' }}>
      <div style={{ display: 'flex', gap: 14, fontSize: 11.5, color: 'var(--ops-muted)', marginBottom: 8 }}>{series.map((s) => <span key={s.key}><b style={{ color: s.color }}>■</b> {s.label}</span>)}</div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: rows.length > 40 ? 1 : 3, height: 150, borderBottom: '1px solid var(--ops-divider)' }}>
        {rows.map((r) => (
          <div key={r.day} title={`${r.day} — ${series.map((s) => `${s.label}: ${format(r[s.key] || 0)}`).join(' · ')}`} style={{ flex: 1, minWidth: 0, height: '100%', display: 'flex', alignItems: 'flex-end', gap: 1 }}>
            {series.map((s) => <div key={s.key} style={{ flex: 1, height: `${Math.max(r[s.key] ? 3 : 0, ((r[s.key] || 0) / max) * 100)}%`, background: s.color, borderRadius: '2px 2px 0 0' }} />)}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, color: 'var(--ops-subtle)', fontSize: 10.5 }}><span>{rows[0].day}</span><span>{rows[rows.length - 1].day}</span></div>
    </div>
  );
}

function Stat({ icon, label, value, sub, bg, color, dark, index }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING, delay: index * .035 }} style={{ minWidth: 0, padding: '17px 16px 15px', border: '1px solid var(--ops-border)', borderRadius: 12, background: 'var(--ops-surface)', boxShadow: 'var(--ops-shadow)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span style={{ width: 31, height: 31, display: 'grid', placeItems: 'center', borderRadius: 9, background: dark ? `${color}24` : bg, color, fontWeight: 800 }}>{icon}</span><span style={{ fontSize: 12, color: 'var(--ops-muted)', fontWeight: 650 }}>{label}</span></div>
      <div style={{ marginTop: 16, fontSize: 23, fontWeight: 780, letterSpacing: '-.04em', color: 'var(--ops-heading)' }}>{value}</div>
      <div style={{ marginTop: 9, fontSize: 11, color: 'var(--ops-subtle)' }}>{sub}</div>
    </motion.div>
  );
}

export default function AdminDashboard({ mobile, phone }) {
  const { nav, theme } = useAppState();
  const dark = theme === 'dark';
  const [days, setDays] = useState(30);
  const [live, setLive] = useState(null); const [failed, setFailed] = useState(false); const [sellers, setSellers] = useState(null);
  useEffect(() => {
    let on = true;
    adminApi.dashboardAnalytics(days).then((x) => { if (on) { setLive(x); setFailed(false); } }).catch(() => { if (on) setFailed(true); });
    return () => { on = false; };
  }, [days]);
  useEffect(() => { let on = true; adminApi.sellers({ limit: 5 }).then((d) => on && setSellers(d.items)).catch(() => on && setSellers([])); return () => { on = false; }; }, []);

  const m = live?.metrics || {};
  const stats = live ? [
    ['▦', 'Total orders', n(m.orderVolume), `${n(m.todayVolume)} today`, '#E8EEF7', '#1C5476'],
    ['₹', 'Shipping revenue', rupees(m.shippingSpendPaise), 'Freight booked in period', '#E8F8F1', '#0F9C61'],
    ['◌', 'COD pending', rupees(live.codPendingPaise), 'Awaiting remittance', '#FFF0E4', '#D87620'],
    ['◎', 'Active sellers', n(live.activeSellers), 'Platform accounts', '#E7F8F5', '#008F84'],
    ['▣', 'In transit', n(m.inTransit), 'Shipments on the road', '#E8EEF7', '#3C6094'],
    ['!', 'NDR rate', `${Number(m.ndrRate || 0).toFixed(1)}%`, 'Of booked shipments', '#FFF0F2', '#E3435B'],
    ['↩', 'RTO rate', `${Number(m.rtoRate || 0).toFixed(1)}%`, 'Of booked shipments', '#FFF4E9', '#D9781E'],
  ] : [];
  const commands = live ? [
    ['NDR action queue', `${n(live.ndrOpen)} open case${live.ndrOpen === 1 ? '' : 's'}`, 'a-ndr', '#B23A2B', '!'],
    ['COD approvals', `${rupees(live.codPendingPaise)} awaiting release`, 'a-cod', '#315F93', '₹'],
    ['Seller onboarding', `${n(live.kycPending)} KYC review${live.kycPending === 1 ? '' : 's'} waiting`, 'a-kyc', '#1581bd', '◎'],
    ['Weight disputes', 'Review courier claims', 'a-disputes', '#8A5A00', '◇'],
  ] : [];
  const statusRows = live ? Object.entries(live.pipeline || {}).filter(([k, v]) => STATUS_COLORS[k] && v > 0) : [];
  const statusTotal = statusRows.reduce((a, [, v]) => a + v, 0);
  const couriers = live?.courierMix || [];
  const pad = phone ? 13 : mobile ? 18 : 28;
  const cols = (count) => (mobile ? '1fr' : `repeat(${count},minmax(0,1fr))`);
  const select = <select aria-label="Date range" value={days} onChange={(e) => setDays(Number(e.target.value))} style={{ height: 36, padding: '0 11px', border: '1px solid var(--ops-border)', borderRadius: 9, background: 'var(--ops-surface)', color: 'var(--ops-text)', fontSize: 12.5, fontWeight: 650, cursor: 'pointer' }}>{[[1, 'Today'], [7, 'Last 7 days'], [30, 'Last 30 days'], [90, 'Last 90 days']].map(([d, l]) => <option key={d} value={d}>{l}</option>)}</select>;

  return (
    <div style={{ padding: `${phone ? 22 : 34}px ${pad}px 46px`, maxWidth: '100%', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'end', justifyContent: 'space-between', gap: 18, marginBottom: 26, flexWrap: 'wrap' }}>
        <div><div style={{ fontSize: 29, lineHeight: 1.05, fontWeight: 780, letterSpacing: '-.035em', color: 'var(--ops-heading)' }}>Platform dashboard</div><div style={{ marginTop: 8, fontSize: 14, color: 'var(--ops-muted)' }}>Live view of sellers, couriers and finance across the platform.</div></div>
        {select}
      </div>

      {failed && <Card style={{ padding: 22, marginBottom: 14, color: '#B23A2B', fontSize: 13 }}>The dashboard could not be loaded. Check that you are signed in as a platform administrator.</Card>}
      {!live && !failed && <Card style={{ padding: 40, textAlign: 'center', color: 'var(--ops-muted)' }}>Loading live platform data…</Card>}

      {live && <>
        <section style={{ display: 'grid', gridTemplateColumns: phone ? 'repeat(2,minmax(0,1fr))' : 'repeat(auto-fit,minmax(150px,1fr))', gap: 14 }}>
          {stats.map(([icon, label, value, sub, bg, color], i) => <Stat key={label} icon={icon} label={label} value={value} sub={sub} bg={bg} color={color} dark={dark} index={i} />)}
        </section>

        <section aria-label="Priority operations" style={{ display: 'grid', gridTemplateColumns: mobile ? 'repeat(2,minmax(0,1fr))' : 'repeat(4,minmax(0,1fr))', gap: 12, marginTop: 14 }}>
          {commands.map(([title, detail, destination, color, icon]) => (
            <motion.button key={title} onClick={() => nav(destination)} whileTap={{ scale: .975 }} style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 11, padding: '13px 14px', textAlign: 'left', cursor: 'pointer', border: '1px solid var(--ops-border)', borderRadius: 13, background: 'var(--ops-surface)', boxShadow: 'var(--ops-shadow)' }}>
              <span style={{ width: 31, height: 31, flex: '0 0 31px', display: 'grid', placeItems: 'center', borderRadius: 9, color, background: `${color}16`, fontSize: 14, fontWeight: 800 }}>{icon}</span>
              <span style={{ minWidth: 0 }}><b style={{ display: 'block', color: 'var(--ops-heading)', fontSize: 12.5 }}>{title}</b><span style={{ display: 'block', marginTop: 3, color: 'var(--ops-muted)', fontSize: 11.5 }}>{detail}</span></span>
            </motion.button>
          ))}
        </section>

        <section style={{ display: 'grid', gridTemplateColumns: cols(3), gap: 12, marginTop: 14 }}>
          <Card><CardTitle>Shipment overview</CardTitle><DailyBars rows={live.trend || []} series={[{ key: 'orders', label: 'Orders', color: T.NAVY }, { key: 'delivered', label: 'Delivered', color: T.ACCENT }]} /></Card>
          <Card>
            <CardTitle>Shipments by status</CardTitle>
            {!statusRows.length ? <Empty /> : <div style={{ padding: '14px 18px', display: 'grid', gap: 9 }}>
              <div style={{ display: 'flex', height: 12, borderRadius: 6, overflow: 'hidden' }}>{statusRows.map(([k, v]) => <div key={k} title={`${statusName(k)}: ${n(v)}`} style={{ width: `${(v / statusTotal) * 100}%`, background: STATUS_COLORS[k] }} />)}</div>
              {statusRows.map(([k, v]) => <div key={k} style={{ display: 'grid', gridTemplateColumns: '10px 1fr auto', gap: 8, alignItems: 'center', fontSize: 12 }}><span style={{ width: 8, height: 8, borderRadius: 4, background: STATUS_COLORS[k] }} /><span style={{ color: 'var(--ops-muted)' }}>{statusName(k)}</span><b style={{ color: 'var(--ops-text)' }}>{n(v)} <em style={{ color: 'var(--ops-subtle)', fontStyle: 'normal', fontWeight: 500 }}>({((v / statusTotal) * 100).toFixed(1)}%)</em></b></div>)}
            </div>}
          </Card>
          <Card>
            <CardTitle>Top couriers by volume</CardTitle>
            {!couriers.length ? <Empty /> : <div style={{ padding: '10px 18px 14px', display: 'grid', gap: 10 }}>{couriers.map((c) => <div key={c.name} style={{ fontSize: 12.5 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><b style={{ color: 'var(--ops-text)' }}>{c.name}</b><span style={{ color: 'var(--ops-muted)' }}>{n(c.total)} · {c.total ? Math.round((c.delivered / c.total) * 100) : 0}% delivered</span></div>
              <div style={{ height: 6, marginTop: 5, borderRadius: 3, background: 'var(--ops-divider)' }}><div style={{ height: '100%', width: `${(c.total / Math.max(1, couriers[0].total)) * 100}%`, borderRadius: 3, background: T.ACCENT }} /></div>
            </div>)}</div>}
          </Card>
        </section>

        <section style={{ display: 'grid', gridTemplateColumns: cols(3), gap: 12, marginTop: 14 }}>
          <Card><CardTitle>Revenue overview</CardTitle><DailyBars rows={live.daily || []} series={[{ key: 'revenuePaise', label: 'Freight booked', color: T.ACCENT }]} format={rupees} /></Card>
          <Card><CardTitle>COD collection overview</CardTitle><DailyBars rows={live.daily || []} series={[{ key: 'codPaise', label: 'COD delivered', color: '#315F93' }]} format={rupees} /></Card>
          <Card><CardTitle>NDR & RTO overview</CardTitle><DailyBars rows={live.daily || []} series={[{ key: 'ndr', label: 'NDR', color: '#B23A2B' }, { key: 'rto', label: 'RTO', color: '#8A5A00' }]} /></Card>
        </section>

        <section style={{ marginTop: 14 }}>
          <Card>
            <CardTitle>Recent sellers</CardTitle>
            {!sellers ? <Empty>Loading…</Empty> : !sellers.length ? <Empty>No sellers yet.</Empty> : <div style={{ padding: '4px 18px 8px' }}>{sellers.map((s) => (
              <button key={s.id} type="button" onClick={() => nav('a-sellers')} style={{ width: '100%', display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center', padding: '10px 0', border: 0, borderBottom: '1px solid var(--ops-divider)', background: 'transparent', cursor: 'pointer', textAlign: 'left', color: 'var(--ops-text)' }}>
                <span><b style={{ fontSize: 13 }}>{s.legal_name}</b><small style={{ display: 'block', color: 'var(--ops-muted)', marginTop: 2 }}>{s.email || '—'} · {s.nexgo_code}</small></span>
                <small style={{ color: 'var(--ops-subtle)' }}>{new Date(s.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</small>
              </button>))}</div>}
          </Card>
        </section>
      </>}
    </div>
  );
}
