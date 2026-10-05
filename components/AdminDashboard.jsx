'use client';

import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { useAppState } from '@/lib/AppStateContext';
import { adminApi } from '@/lib/api';
import * as T from '@/lib/theme';

const SPRING = { type: 'spring', bounce: 0, duration: 0.28 };
const METRICS = [
  ['▦', 'Total shipments', '24,568', '+18.45%', '#E8EEF7', '#1C5476'],
  ['₹', 'Revenue today', '₹8.75L', '+12.32%', '#E8F8F1', '#0F9C61'],
  ['◌', 'COD pending', '₹12.45L', '+8.14%', '#FFF0E4', '#D87620'],
  ['◎', 'Active sellers', '4,892', '+16.25%', '#E7F8F5', '#008F84'],
  ['▣', 'Active couriers', '26', 'No change', '#E8EEF7', '#3C6094'],
  ['!', 'NDR rate', '2.46%', '−0.35%', '#FFF0F2', '#E3435B'],
  ['↩', 'RTO rate', '1.78%', '−0.25%', '#FFF4E9', '#D9781E'],
  ['✓', 'System health', '99.95%', 'All systems operational', '#E9F8EF', '#169C60'],
];
const COURIERS = [['Delhivery', '8,740', '#0F1F3D'], ['Blue Dart', '6,256', '#3C6094'], ['XpressBees', '3,987', '#14724F'], ['Ecom Express', '2,456', '#8A5A00'], ['Shadowfax', '1,145', '#00D7C3']];
const ALERTS = [['!', 'High NDR alert: Maharashtra has crossed the 2% watch threshold.', '10m ago', '#B23A2B'], ['△', 'Pickup SLA breach: 23 pickups are waiting past cutoff.', '25m ago', '#8A5A00'], ['i', 'COD reconciliation pending for Blue Dart · 16 May cycle.', '1h ago', '#3C6094'], ['✓', 'System backup completed successfully.', '2h ago', '#14724F']];
const SIGNUPS = [['RT', 'Rohit Textiles', 'rohit@rohittextiles.com', '10m ago', '#F5EAFE'], ['MG', 'Metro Gadgets Pvt. Ltd.', 'info@metrogadgets.com', '35m ago', '#EAF5FF'], ['ST', 'Shree Traders', 'contact@shreetraders.in', '1h ago', '#E8F8F1'], ['AB', 'A1 Books Store', 'owner@a1books.com', '2h ago', '#FFF0E4'], ['PK', 'Pooja Kitchenware', 'pooja@pooja.in', '3h ago', '#FFF4E9']];
const COMMANDS = [
  ['NDR action queue', '4,218 cases need a decision', 'a-ndr', '#B23A2B', '!'],
  ['COD approvals', '₹64.2L awaiting release', 'a-cod', '#315F93', '₹'],
  ['Courier SLA watch', '2 partners below guardrail', 'a-couriers', '#8A5A00', '◌'],
  ['Seller onboarding', '218 KYC reviews waiting', 'a-sellers', '#00A99C', '◎'],
];

function Card({ children, style = {} }) {
  return <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={SPRING} style={{ overflow: 'hidden', background: 'var(--ops-surface)', border: '1px solid var(--ops-border)', borderRadius: 12, boxShadow: 'var(--ops-shadow)', ...style }}>{children}</motion.div>;
}

function CardTitle({ children, right }) {
  return <div style={{ height: 56, padding: '0 19px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--ops-divider)' }}><div style={{ fontSize: 14, fontWeight: 750, letterSpacing: '-.01em', color: 'var(--ops-heading)' }}>{children}</div>{right && <div style={{ height: 30, padding: '0 10px', display: 'flex', alignItems: 'center', border: '1px solid var(--ops-border)', borderRadius: 8, color: 'var(--ops-muted)', fontSize: 12, background: 'var(--nx-surface)' }}>{right}</div>}</div>;
}

function ControlDeck({ mobile }) {
  const { nav } = useAppState();
  return <section aria-label="Priority operations" style={{ display: 'grid', gridTemplateColumns: mobile ? 'repeat(2,minmax(0,1fr))' : 'repeat(4,minmax(0,1fr))', gap: 12, marginTop: 14 }}>
    {COMMANDS.map(([title, detail, destination, color, icon]) => <motion.button key={title} onClick={() => nav(destination)} whileTap={{ scale: .975 }} whileHover={{ transform: 'translateY(-2px)' }} transition={SPRING} style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 11, padding: '13px 14px', textAlign: 'left', cursor: 'pointer', border: '1px solid var(--ops-border)', borderRadius: 13, background: 'var(--ops-surface)', boxShadow: 'var(--ops-shadow)' }}>
      <span style={{ width: 31, height: 31, flex: '0 0 31px', display: 'grid', placeItems: 'center', borderRadius: 9, color, background: `${color}16`, fontSize: 14, fontWeight: 800 }}>{icon}</span>
      <span style={{ minWidth: 0 }}><b style={{ display: 'block', color: 'var(--ops-heading)', fontSize: 12.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</b><span style={{ display: 'block', marginTop: 3, color: 'var(--ops-muted)', fontSize: 11.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{detail}</span></span>
    </motion.button>)}
  </section>;
}

function LineChart({ type = 'shipments' }) {
  const a = type === 'ndr' ? [55,49,53,58,50,55,48] : [38,54,48,75,90,77,101,92,69,76,56];
  const b = type === 'ndr' ? [22,22,21,22,19,21,16] : [23,33,34,53,69,61,78,70,42,51,33];
  const W = 620, H = 178, max = type === 'ndr' ? 70 : 110;
  const points = (arr) => arr.map((v, i) => `${(i / (arr.length - 1)) * W},${H - (v / max) * (H - 18) - 9}`).join(' ');
  return <div style={{ padding: '12px 16px 14px' }}>
    <div style={{ display: 'flex', gap: 14, fontSize: 11.5, color: 'var(--ops-muted)', marginBottom: 8 }}><span><b style={{ color: type === 'ndr' ? '#B23A2B' : T.NAVY }}>━</b> {type === 'ndr' ? 'NDR %' : 'Total shipments'}</span><span><b style={{ color: type === 'ndr' ? '#8A5A00' : T.ACCENT }}>┄</b> {type === 'ndr' ? 'RTO %' : 'Delivered'}</span></div>
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: 182, display: 'block' }}>
      {[18, 59, 100, 141].map(y => <line key={y} x1="0" x2={W} y1={y} y2={y} stroke="var(--ops-chart-grid)" strokeWidth="1" strokeDasharray="3 4" />)}
      {type === 'shipments' && <polygon points={`0,${H} ${points(a)} ${W},${H}`} fill="url(#adminArea)" opacity=".32" />}
      <defs><linearGradient id="adminArea" x1="0" x2="0" y1="0" y2="1"><stop stopColor="#0F1F3D" stopOpacity=".28"/><stop offset="1" stopColor="#0F1F3D" stopOpacity="0"/></linearGradient></defs>
      <polyline points={points(a)} fill="none" stroke={type === 'ndr' ? '#B23A2B' : T.NAVY} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
      <polyline points={points(b)} fill="none" stroke={type === 'ndr' ? '#8A5A00' : T.ACCENT} strokeWidth="2" strokeDasharray={type === 'ndr' ? '0' : '5 4'} strokeLinejoin="round" strokeLinecap="round" />
      {a.map((v, i) => <circle key={i} cx={(i / (a.length - 1)) * W} cy={H - (v / max) * (H - 18) - 9} r="3.2" fill={type === 'ndr' ? '#B23A2B' : T.NAVY} />)}
    </svg>
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 2px', color: 'var(--ops-subtle)', fontSize: 10.5 }}>{(type === 'shipments' ? ['03 Sep','04 Sep','05 Sep','06 Sep','07 Sep'] : ['03 Sep','04 Sep','05 Sep','06 Sep','07 Sep','08 Sep','09 Sep']).map(x => <span key={x}>{x}</span>)}</div>
  </div>;
}

function FlowChart({ color, values, label }) {
  const [active, setActive] = useState(null);
  const reduced = useReducedMotion();
  const W = 520, H = 174, inset = 17, max = Math.max(...values) * 1.12;
  const points = values.map((v, i) => ({ x: inset + (i / (values.length - 1)) * (W - inset * 2), y: H - inset - (v / max) * (H - inset * 2) }));
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const area = `${line} L${points.at(-1).x},${H - inset} L${points[0].x},${H - inset} Z`;
  const grad = `flow-${label.replace(/\s/g, '')}`;
  return <div style={{ height: 230, padding: '14px 18px 13px', position: 'relative' }}>
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: 180, display: 'block', overflow: 'visible' }}>
      <defs><linearGradient id={grad} x1="0" y1="0" x2="0" y2="1"><stop stopColor={color} stopOpacity=".22" /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      {[.25, .5, .75].map(level => <line key={level} x1={inset} x2={W - inset} y1={inset + (H - inset * 2) * level} y2={inset + (H - inset * 2) * level} stroke="var(--ops-chart-grid)" strokeWidth="1" strokeDasharray="3 5" />)}
      <motion.path d={area} fill={`url(#${grad})`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: .24, ease: 'easeOut' }} />
      <motion.path d={line} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" initial={reduced ? { opacity: 0 } : { pathLength: 0, opacity: 0 }} animate={reduced ? { opacity: 1 } : { pathLength: 1, opacity: 1 }} transition={{ duration: .48, ease: 'easeOut' }} />
      {points.map((p, i) => { const isActive = active === i; const amount = `₹${(values[i] * .094).toFixed(1)}L`; return <g key={i} onPointerEnter={() => setActive(i)} onPointerLeave={() => setActive(null)}>
        {isActive && <><line x1={p.x} x2={p.x} y1={inset} y2={H - inset} stroke={color} strokeOpacity=".28" strokeWidth="1" strokeDasharray="3 4" /><rect x={p.x - 24} y={Math.max(2, p.y - 32)} width="48" height="20" rx="6" fill={color} /><text x={p.x} y={Math.max(15, p.y - 18)} textAnchor="middle" fill="#fff" fontSize="9" fontWeight="700">{amount}</text></>}
        <circle cx={p.x} cy={p.y} r={isActive ? 5.5 : 3.8} fill="var(--ops-surface)" stroke={color} strokeWidth={isActive ? 3 : 2} style={{ cursor: 'crosshair', transition: 'r .16s ease' }} />
      </g>; })}
    </svg>
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 2px', color: 'var(--ops-subtle)', fontSize: 10.5, fontWeight: 550 }}>{values.map((_, i) => <span key={i}>{i + 3} Sep</span>)}</div>
  </div>;
}

function Donut() {
  const rows = [['Delivered','18,765','76.42%','#14724F'], ['In transit','3,124','12.72%','#3C6094'], ['Pending','1,356','5.52%','#8A5A00'], ['Cancelled','987','4.02%','#B23A2B'], ['RTO','336','1.32%','#00D7C3']];
  return <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', alignItems: 'center', gap: 12, padding: '18px 16px' }}>
    <div style={{ width: 150, height: 150, borderRadius: '50%', background: 'conic-gradient(#14724F 0 76.42%,#3C6094 76.42% 89.14%,#8A5A00 89.14% 94.66%,#B23A2B 94.66% 98.68%,#00D7C3 98.68% 100%)', position: 'relative' }}><div style={{ position: 'absolute', inset: 27, borderRadius: '50%', background: 'var(--ops-surface)', display: 'grid', placeItems: 'center', textAlign: 'center' }}><b style={{ fontSize: 22, letterSpacing: '-.04em' }}>24,568</b><span style={{ fontSize: 10.5, color: 'var(--ops-subtle)' }}>Total shipments</span></div></div>
    <div>{rows.map(([name, value, pct, color]) => <div key={name} style={{ display: 'grid', gridTemplateColumns: '8px 1fr auto', gap: 7, alignItems: 'center', padding: '5px 0', fontSize: 11.5 }}><span style={{ width: 7, height: 7, borderRadius: 5, background: color }} /><span style={{ color: 'var(--ops-muted)' }}>{name}</span><span style={{ color: 'var(--ops-text)', fontWeight: 650 }}>{value} <em style={{ color: 'var(--ops-subtle)', fontStyle: 'normal' }}>({pct})</em></span></div>)}</div>
  </div>;
}

export default function AdminDashboard({ mobile, phone }) {
  const [range, setRange] = useState('This week');
  const [live, setLive] = useState(null);
  const { theme } = useAppState();
  const dark = theme === 'dark';
  useEffect(() => { adminApi.dashboardAnalytics().then(setLive).catch(() => {}); }, []);
  const metrics = live ? [
    ['▦', 'Total orders', Number(live.metrics?.orderVolume || 0).toLocaleString('en-IN'), 'Live platform intake', '#E8EEF7', '#1C5476'],
    ['₹', 'Shipping spend', `₹${(Number(live.metrics?.shippingSpendPaise || 0) / 100).toLocaleString('en-IN')}`, 'Booked shipment charges', '#E8F8F1', '#0F9C61'],
    ['◌', 'Orders in transit', Number(live.metrics?.inTransit || 0).toLocaleString('en-IN'), 'Live shipment states', '#FFF0E4', '#D87620'],
    ['◎', 'Active sellers', Number(live.activeSellers || 0).toLocaleString('en-IN'), 'Live platform accounts', '#E7F8F5', '#008F84'],
    ['▣', 'Open NDR cases', Number(live.ndrOpen || 0).toLocaleString('en-IN'), 'Needs operational action', '#E8EEF7', '#3C6094'],
    ['!', 'NDR rate', `${Number(live.metrics?.ndrRate || 0).toFixed(1)}%`, 'Across booked shipments', '#FFF0F2', '#E3435B'],
    ['↩', 'RTO rate', `${Number(live.metrics?.rtoRate || 0).toFixed(1)}%`, 'Across booked shipments', '#FFF4E9', '#D9781E'],
    ['✓', 'System health', '99.95%', 'All systems operational', '#E9F8EF', '#169C60'],
  ] : METRICS;
  const pad = phone ? 13 : mobile ? 18 : 26;
  const metricCols = phone ? 'repeat(2,minmax(0,1fr))' : mobile ? 'repeat(4,minmax(150px,1fr))' : 'repeat(auto-fit,minmax(145px,1fr))';
  const selectRange = <motion.button whileTap={{ scale: .96 }} onClick={() => setRange(range === 'This week' ? 'Last 30 days' : 'This week')} style={{ height: 29, padding: '0 9px', border: '1px solid var(--ops-border)', borderRadius: 7, background: 'var(--ops-surface)', color: 'var(--ops-muted)', fontSize: 11.5, cursor: 'pointer' }}>{range}⌄</motion.button>;
  return <div style={{ padding: `${phone ? 22 : 34}px ${pad}px 46px`, maxWidth: 1760, margin: '0 auto' }}>
    <div style={{ display: 'flex', alignItems: 'end', justifyContent: 'space-between', gap: 18, marginBottom: 26, flexWrap: 'wrap' }}><div><div style={{ fontSize: 29, lineHeight: 1.05, fontWeight: 780, letterSpacing: '-.035em', color: 'var(--ops-heading)' }}>Platform dashboard</div><div style={{ marginTop: 8, fontSize: 14, color: 'var(--ops-muted)' }}>A calm view of sellers, couriers, finance, and customer support.</div></div><motion.button whileTap={{ scale: .97 }} style={{ height: 36, padding: '0 13px', border: '1px solid rgba(0,215,195,.32)', borderRadius: 9, background: 'rgba(0,215,195,.08)', color: T.ACCENT, fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>⚙ Customise dashboard</motion.button></div>

    <section style={{ display: 'grid', gridTemplateColumns: metricCols, gap: 14, overflowX: mobile && !phone ? 'auto' : 'visible' }}>{metrics.map(([icon, label, value, delta, bg, color], i) => <motion.div key={label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING, delay: i * .035 }} whileHover={{ y: -2, boxShadow: '0 10px 20px rgba(28,49,69,.10)' }} style={{ minWidth: mobile && !phone ? 170 : 0, padding: '17px 16px 15px', border: '1px solid var(--ops-border)', borderRadius: 12, background: 'var(--ops-surface)', boxShadow: 'var(--ops-shadow)', cursor: 'default' }}><div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span style={{ width: 31, height: 31, display: 'grid', placeItems: 'center', borderRadius: 9, background: dark ? `${color}24` : bg, color, fontWeight: 800 }}>{icon}</span><span style={{ fontSize: 12, color: 'var(--ops-muted)', fontWeight: 650 }}>{label}</span></div><div style={{ marginTop: 16, fontSize: 23, fontWeight: 780, letterSpacing: '-.04em', color: 'var(--ops-heading)' }}>{value}</div><div style={{ marginTop: 9, fontSize: 11, color: delta.includes('−') ? '#B23A2B' : color === '#3C6094' ? 'var(--ops-subtle)' : '#14724F', fontWeight: 650 }}>{delta} <span style={{ color: 'var(--ops-subtle)', fontWeight: 500 }}>{delta.includes('change') || delta.includes('operational') ? '' : 'vs previous day'}</span></div></motion.div>)}</section>
    <ControlDeck mobile={mobile} />

    <section style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : '1.5fr 1.02fr .95fr', gap: 12, marginTop: 14 }}>
      <Card><CardTitle right={selectRange}>Shipment overview</CardTitle><LineChart /></Card>
      <Card><CardTitle>Shipments by status</CardTitle><Donut /></Card>
      <Card><CardTitle>Top couriers by volume</CardTitle><div style={{ padding: '9px 16px 14px' }}>{COURIERS.map(([name, count, color]) => <div key={name} style={{ display: 'grid', gridTemplateColumns: '25px 1fr auto', gap: 8, alignItems: 'center', padding: '9px 0', borderBottom: '1px solid var(--ops-divider)' }}><div style={{ width: 23, height: 23, display: 'grid', placeItems: 'center', borderRadius: 6, background: `${color}14`, color, fontSize: 11, fontWeight: 800 }}>{name[0]}</div><span style={{ fontSize: 12, fontWeight: 650, color: 'var(--ops-text)' }}>{name}</span><span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ops-muted)' }}>{count}</span></div>)}</div></Card>
    </section>

    <section style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : 'repeat(3,minmax(0,1fr))', gap: 12, marginTop: 14 }}>
      <Card><CardTitle right={selectRange}>Revenue overview</CardTitle><FlowChart label="Revenue" color={T.ACCENT} values={[62,92,77,75,82,56,88]} /></Card>
      <Card><CardTitle right={selectRange}>COD collection overview</CardTitle><FlowChart label="COD collection" color="#315F93" values={[62,96,79,80,70,66,78]} /></Card>
      <Card><CardTitle right={selectRange}>NDR & RTO overview</CardTitle><LineChart type="ndr" /></Card>
    </section>

    <section style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : '1.4fr .78fr 1.1fr', gap: 12, marginTop: 14 }}>
      <Card><CardTitle>Recent alerts</CardTitle><div style={{ padding: '5px 15px 7px' }}>{ALERTS.map(([icon, text, time, color]) => <div key={text} style={{ display: 'grid', gridTemplateColumns: '25px 1fr auto', alignItems: 'center', gap: 8, padding: '10px 0', borderBottom: '1px solid var(--ops-divider)' }}><span style={{ width: 22, height: 22, display: 'grid', placeItems: 'center', background: `${color}14`, borderRadius: 6, color, fontSize: 12, fontWeight: 800 }}>{icon}</span><span style={{ color: 'var(--ops-text)', fontSize: 11.5, fontWeight: 550 }}>{text}</span><span style={{ color: 'var(--ops-subtle)', fontSize: 10.5, whiteSpace: 'nowrap' }}>{time}</span></div>)}</div></Card>
      <Card><CardTitle>API usage today</CardTitle><div style={{ padding: '23px 20px 18px', textAlign: 'center' }}><div style={{ width: 160, height: 80, margin: '0 auto', borderRadius: '160px 160px 0 0', background: 'conic-gradient(from 270deg at 50% 100%,#00D7C3 0 56%,var(--ops-divider) 56% 100%)', position: 'relative', overflow: 'hidden' }}><div style={{ position: 'absolute', inset: '10px 10px 0', borderRadius: '150px 150px 0 0', background: 'var(--ops-surface)' }} /></div><div style={{ marginTop: -3, fontSize: 21, fontWeight: 780, letterSpacing: '-.04em' }}>8,45,231</div><div style={{ marginTop: 3, fontSize: 11, color: 'var(--ops-muted)' }}>of 15,00,000 calls · <b style={{ color: 'var(--ops-text)' }}>56.35% used</b></div></div></Card>
      <Card><CardTitle right={<span style={{ color: T.ACCENT, fontWeight: 700 }}>View all</span>}>Recent signups</CardTitle><div style={{ padding: '4px 15px 7px' }}>{SIGNUPS.map(([ini, name, email, time, bg]) => <div key={email} style={{ display: 'grid', gridTemplateColumns: '25px 1fr auto', gap: 8, alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--ops-divider)' }}><span style={{ width: 23, height: 23, display: 'grid', placeItems: 'center', borderRadius: '50%', background: dark ? 'rgba(0,215,195,.12)' : bg, color: 'var(--ops-muted)', fontSize: 9, fontWeight: 800 }}>{ini}</span><span><b style={{ display: 'block', color: 'var(--ops-text)', fontSize: 11.5 }}>{name}</b><small style={{ color: 'var(--ops-subtle)', fontSize: 10 }}>{email}</small></span><span style={{ color: 'var(--ops-subtle)', fontSize: 10, whiteSpace: 'nowrap' }}>{time}</span></div>)}</div></Card>
    </section>
    <footer style={{ display: 'flex', justifyContent: 'space-between', marginTop: 22, color: 'var(--ops-subtle)', fontSize: 10.5 }}><span>© 2026 NEXGO Operations</span><span>v0.2.0 · Internal workspace</span></footer>
  </div>;
}
