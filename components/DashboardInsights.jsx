'use client';

import { useState } from 'react';
import * as T from '@/lib/theme';

const CARD = { background: 'var(--nx-surface)', border: `1px solid ${T.BORDER}`, borderRadius: 12 };
const show = (v) => (v === null || v === undefined ? '—' : `${v}%`);
const parcels = (n) => `${(n ?? 0).toLocaleString('en-IN')} parcel${n === 1 ? '' : 's'}`;
const day = (iso) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '');

// Change against the previous period of the same length. Nothing to compare with = no arrow, never a made-up percentage.
function Delta({ now, before, worseWhenUp }) {
  if (!before) return <span style={{ color: T.TEXT_MUTED, fontSize: 11.5 }}>{now ? 'Nothing before to compare' : 'No data in either period'}</span>;
  const change = Math.round(((now - before) / before) * 100);
  if (change === 0) return <span style={{ color: T.TEXT_MUTED, fontSize: 11.5 }}>Same as before ({before.toLocaleString('en-IN')})</span>;
  const bad = worseWhenUp ? change > 0 : change < 0;
  return <span style={{ color: bad ? T.RED : T.GREEN, fontSize: 11.5, fontWeight: 650 }}>{change > 0 ? '▲' : '▼'} {Math.abs(change)}% <span style={{ color: T.TEXT_MUTED, fontWeight: 500 }}>vs {before.toLocaleString('en-IN')} before</span></span>;
}

const Tile = ({ label, value, note, color = T.TEXT, children }) => (
  <div style={{ border: `1px solid ${T.DIVIDER}`, borderRadius: 10, padding: '12px 14px', minWidth: 0 }}>
    <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: T.TEXT_MUTED }}>{label}</div>
    <div style={{ marginTop: 6, fontSize: 22, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    <div style={{ marginTop: 3, fontSize: 11.5, color: T.TEXT_MUTED }}>{note}</div>
    {children}
  </div>
);

const Section = ({ title, hint, right, children, phone }) => (
  <div style={{ ...CARD, marginTop: 20, overflow: 'hidden' }}>
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', padding: phone ? '12px 14px' : '13px 18px', borderBottom: `1px solid ${T.DIVIDER}` }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: T.SECTION_HEAD }}>{title}</div>
        <div style={{ fontSize: 12, color: T.TEXT_MUTED }}>{hint}</div>
      </div>
      {right}
    </div>
    <div style={{ padding: phone ? 10 : 14 }}>{children}</div>
  </div>
);

// Pickup speed, delivery quality, promised-date adherence per zone and the previous-period comparison, from the same window as every other card.
export default function DashboardInsights({ live, rangeLabel, phone }) {
  const [compare, setCompare] = useState(true);
  if (!live) return null;
  const m = live.metrics || {}; const pipe = live.pipeline || {}; const prev = live.previous;
  const ps = live.pickupSpeed; const dq = live.deliveryQuality; const zones = live.zoneSla || [];
  const cols = (n) => ({ display: 'grid', gridTemplateColumns: phone ? 'repeat(2,minmax(0,1fr))' : `repeat(${n},minmax(0,1fr))`, gap: 10 });
  return (
    <>
      <Section
        phone={phone}
        title="This period vs the one before"
        hint={prev ? `${rangeLabel.toLowerCase()} compared with ${day(prev.from)} to ${day(prev.to)}` : ''}
        right={<label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: T.TEXT_SECONDARY, cursor: 'pointer' }}><input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} /> Compare</label>}
      >
        <div style={cols(4)}>
          <Tile label="Orders" value={(m.orderVolume ?? 0).toLocaleString('en-IN')} note="placed, not cancelled">{compare && prev && <Delta now={m.orderVolume ?? 0} before={prev.orderVolume} />}</Tile>
          <Tile label="Shipped" value={(m.shipped ?? 0).toLocaleString('en-IN')} note="booked with a courier">{compare && prev && <Delta now={m.shipped ?? 0} before={prev.shipped} />}</Tile>
          <Tile label="Delivered" value={(pipe.delivered ?? 0).toLocaleString('en-IN')} note={`delivery rate ${show(m.deliveryRate)}`}>{compare && prev && <Delta now={pipe.delivered ?? 0} before={prev.delivered} />}</Tile>
          <Tile label="Returned (RTO)" value={(pipe.rto ?? 0).toLocaleString('en-IN')} note={`RTO rate ${show(m.rtoRate)}`}>{compare && prev && <Delta now={pipe.rto ?? 0} before={prev.rto} worseWhenUp />}</Tile>
        </div>
      </Section>

      <Section phone={phone} title="Pickup speed" hint="how long the courier took to collect parcels booked in this period">
        <div style={cols(4)}>
          <Tile label="Within 24 hours" value={show(ps?.within24hPct)} note={parcels(ps?.within24h)} color={T.GREEN} />
          <Tile label="24 to 48 hours" value={show(ps?.between24and48hPct)} note={parcels(ps?.between24and48h)} color={T.AMBER} />
          <Tile label="Beyond 48 hours" value={show(ps?.beyond48hPct)} note={parcels(ps?.beyond48h)} color={T.RED} />
          <Tile label="Booked" value={(ps?.booked ?? 0).toLocaleString('en-IN')} note="parcels not yet collected are in none of the three" />
        </div>
      </Section>

      <Section phone={phone} title="Delivery performance" hint="delivered parcels booked in this period">
        <div style={cols(3)}>
          <Tile label="Delivered" value={(dq?.delivered ?? 0).toLocaleString('en-IN')} note="parcels" />
          <Tile label="First attempt delivery" value={show(dq?.firstAttemptPct)} note="delivered with no NDR" color={T.GREEN} />
          <Tile label="Delivered by promised date" value={show(dq?.withinPromisedDatePct)} note="by the delivery date shown when you booked" color={T.ACCENT} />
        </div>
        <div style={{ marginTop: 12, fontSize: 12, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: T.TEXT_MUTED }}>On time by zone</div>
        <div style={{ ...cols(5), marginTop: 8 }}>
          {zones.map((z) => <Tile key={z.zone} label={z.zone} value={show(z.withinPromisedDatePct)} note={`${z.delivered.toLocaleString('en-IN')} delivered`} />)}
        </div>
      </Section>
    </>
  );
}
