'use client';

import { useSellerSession } from '@/lib/useSellerSession';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { CARDS, cardView } from '@/lib/dashboardCards';
import { useLiveQuery } from '@/lib/queryCache';
import { useAppState } from '@/lib/AppStateContext';
import * as T from '@/lib/theme';
import ScenicBackdrop from './ScenicBackdrop';
import DashboardStatCard from './DashboardStatCard';
import DashboardStatCardModal from './DashboardStatCardModal';
import DashboardInsights from './DashboardInsights';
import TrendChart from './TrendChart';
import BarChartV from './BarChartV';
import { Btn } from './Kit';
import { apiFetch } from '@/lib/api';

function GlassSheen() {
  return <div style={{ position: 'absolute', top: 0, left: 14, right: 14, height: 1, background: 'var(--nx-glass-border)' }} />;
}

const RANGES = [[1, 'Today'], [7, 'Last 7 days'], [30, 'Last 30 days'], [90, 'Last 90 days'], [0, 'Custom range']];
// Share of COD orders in the selected period (live dashboard data), 0 when there are no orders.
const codShare = (mix) => { const c = mix?.cod.orders ?? 0; const p = mix?.prepaid.orders ?? 0; return c + p ? Math.round((c / (c + p)) * 100) : 0; };
const money = (paise) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format((paise || 0) / 100);
const shortDate = (iso) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '—');

const NDR_REASONS = { customer_unavailable: 'Customer Not Available', address_incomplete: 'Incomplete Address', address_incorrect: 'Wrong Address', refused_delivery: 'Customer Refused', payment_not_ready: 'Payment Not Ready', customer_requested_reschedule: 'Reschedule Requested', premises_closed: 'Premises Closed', customer_not_contactable: 'Not Contactable', incorrect_product: 'Incorrect Product', damaged_product: 'Damaged Product', other: 'Other' };

// Order pipeline cards. "Right now" cards are live snapshots; "Period" cards cover the chosen dates. Each opens the matching Track tab.
const PIPE = [
  ['ready_to_ship', 'Ready to ship', '#3C6094', 'now', 'ready'], ['pickup_pending', 'Pickup pending', '#5A82B8', 'now', 'pickup'],
  ['in_transit', 'In transit', '#3877fc', 'now', 'in_transit'], ['out_for_delivery', 'Out for delivery', '#37C7B9', 'now', 'out_for_delivery'],
  ['ndr', 'NDR', '#8A5A00', 'now', 'ndr'], ['delivered', 'Delivered', '#14724F', 'period', 'delivered'],
  ['rto', 'RTO', '#B23A2B', 'period', 'rto'], ['lost', 'Lost', '#6B5B95', 'period', 'lost'], ['cancelled', 'Cancelled', '#A8A395', 'period', 'cancelled'],
];

function RangeSelect({ days, onChange, label }) {
  return <select aria-label={label} value={days} onChange={(e) => onChange(Number(e.target.value))} style={{ height: 30, padding: '0 10px', borderRadius: 8, border: `1px solid ${T.INPUT_BORDER}`, background: T.SURFACE, color: T.TEXT, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>{RANGES.map(([d, l]) => <option key={d} value={d}>{l}</option>)}</select>;
}

const Skeleton = ({ h = 14, w = '100%', style }) => <div aria-hidden style={{ height: h, width: w, borderRadius: 6, background: 'var(--nx-divider)', opacity: 0.7, ...style }} />;

export default function DashboardContent({ mobile, narrow, phone }) {
  const { kpis, expanded, toggleExpanded, nav, showToast, dashDays: days, setDashDays: setDays, dashRange, setTrackHandoff } = useAppState();
  const { me } = useSellerSession();
  const firstName = (me?.full_name || '').trim().split(/\s+/)[0];
  const customReady = days === 0 && dashRange.from && dashRange.to && dashRange.from <= dashRange.to;
  const [expandedCardId, setExpandedCardId] = useState(null);
  // One shared, cached query: the figures show at once when you come back to the page and refresh quietly every 30 seconds.
  const url = days === 0 ? (customReady ? `/v1/analytics/dashboard?from=${dashRange.from}&to=${dashRange.to}` : null) : `/v1/analytics/dashboard?days=${days}`;
  const { data: live, error, loading, refresh } = useLiveQuery(url);
  const rangeLabel = (RANGES.find((r) => r[0] === days) || RANGES[2])[1];
  const tagFor = (t) => (t === 'now' ? 'Right now' : days === 1 ? 'Today' : days === 0 ? 'Custom' : `${days}d`);

  const [rescheduling, setRescheduling] = useState(false);
  const reschedule = async () => {
    if (rescheduling) return;
    setRescheduling(true);
    try { const r = await apiFetch('/v1/analytics/dashboard/reschedule-pickups', { method: 'POST' }); showToast(r.message || 'Marked for re-pickup'); refresh(); }
    catch (e) { showToast(e.message || 'Pickup could not be rescheduled', 'error'); }
    finally { setRescheduling(false); }
  };

  const statCards = CARDS.filter((c) => kpis.indexOf(c[0]) >= 0 && c[2] === 'Card').map((c) => {
    const v = cardView(c[0], live, money);
    return v ? { id: c[0], label: c[1], value: v.value, sub: v.sub, delta: v.tag === 'Right now' ? 'Right now' : tagFor('period'), how: v.how, deltaColor: v.tag === 'Right now' ? T.ACCENT : T.MUTE, sparkColor: v.tag === 'Right now' ? T.ACCENT : '#BDB8AC' } : null;
  }).filter(Boolean);
  const expandedCard = statCards.find((c) => c.id === expandedCardId) || null;
  const placeholders = CARDS.filter((c) => kpis.indexOf(c[0]) >= 0 && c[2] === 'Card');

  const showTrend = kpis.indexOf('order_volume') >= 0;
  const showCourier = kpis.indexOf('courier_perf') >= 0;
  const showCod = kpis.indexOf('cod_split') >= 0;
  const chartColCount = [showTrend, showCourier, showCod].filter(Boolean).length;
  const chartCols = mobile ? '1fr' : chartColCount ? [showTrend ? '1.7fr' : null, showCourier ? '1fr' : null, showCod ? '1fr' : null].filter(Boolean).join(' ') : '1fr';

  const pipeline = live?.pipeline || {};
  const queue = live?.queue;
  const trend = live?.trend || [];
  const trendMax = Math.max(1, ...trend.flatMap((x) => [x.orders, x.delivered]));
  const axis = [1, 2 / 3, 1 / 3, 0].map((f) => Math.round(trendMax * 1.15 * f));
  const trendTicks = trend.length > 1 ? [0, 0.25, 0.5, 0.75, 1].map((f) => trend[Math.round((trend.length - 1) * f)].day.toUpperCase()) : [];
  // Delivery rate per courier = delivered / finished parcels (the same definition as the Delivery rate card).
  const courierRows = (live?.courierMix || []).map((c) => { const r = c.finished ? (c.delivered / c.finished) * 100 : null; return { name: c.name, rate: r === null ? '—' : `${r.toFixed(1)}%`, w: `${r ?? 0}%`, vol: String(c.total), color: r === null ? T.MUTE : r >= 90 ? T.GREEN : r >= 75 ? T.AMBER : T.RED }; });
  const statCols = mobile ? 'repeat(2,minmax(0,1fr))' : narrow ? 'repeat(3,minmax(0,1fr))' : 'repeat(5,minmax(0,1fr))';
  const pipeCols = phone ? 'repeat(2,minmax(0,1fr))' : mobile ? 'repeat(3,minmax(0,1fr))' : narrow ? 'repeat(5,minmax(0,1fr))' : 'repeat(9,minmax(0,1fr))';
  const pagePad = phone ? 12 : mobile ? 16 : 28;
  const openTrack = (tab) => { setTrackHandoff({ tab }); nav('shipments'); };

  // Decisions waiting on you: live counts, every action lands on the page that resolves it.
  const QUEUE = !queue ? [] : [
    { id: 'ndr', n: String(queue.ndr.open), title: 'NDR shipments awaiting action', sub: queue.ndr.answered ? `Need your decision · ${queue.ndr.answered} more already answered, waiting for the courier` : 'Open non-delivery cases that need your decision', sla: 'ACTION', cta: 'Action', rows: queue.ndr.reasons.map((r) => [NDR_REASONS[r.reason] || r.reason, String(r.n)]), rec: queue.ndr.open ? `Reattempt or update the address for the ${queue.ndr.open} open NDR shipment${queue.ndr.open === 1 ? '' : 's'} before the courier returns them.` : 'No open NDR shipments. Nothing needs your attention.', primary: `Resolve ${queue.ndr.open} NDR${queue.ndr.open === 1 ? '' : 's'}`, go: () => nav('ndr') },
    { id: 'weight', n: String(queue.weight.open), title: 'Weight discrepancies raised by couriers', sub: `${money(queue.weight.heldPaise)} held against wallet`, sla: 'REVIEW', cta: 'Review', rows: queue.weight.couriers.map((c) => [c.name, `${c.count} · ${money(c.amountPaise)}`]), rec: queue.weight.open ? 'Dispute with packing photos as evidence, or accept the revised charge. Undisputed charges are debited from your wallet.' : 'No open weight discrepancies.', primary: `Dispute ${queue.weight.open} case${queue.weight.open === 1 ? '' : 's'}`, go: () => nav('weight') },
    { id: 'pickup', n: String(queue.pickup.pending), title: 'Pickups waiting for the courier', sub: queue.pickup.pending ? `${queue.pickup.missed} past the 24-hour deadline${queue.pickup.oldestHours !== null ? ` · oldest waiting ${queue.pickup.oldestHours} h` : ''}` : 'Every booked parcel has been collected', sla: queue.pickup.missed ? 'MISSED' : 'ON TRACK', cta: 'View', rows: queue.pickup.couriers.map((c) => [c.name, `${c.n} missed`]), rec: queue.pickup.missed ? 'These parcels were not collected within 24 hours of booking. Mark them for re-pickup tomorrow; the pickup window moves, and the courier is not contacted from here, so also follow up with your courier contact.' : queue.pickup.pending ? 'Parcels are waiting for their first pickup scan. None is past its deadline yet.' : 'No pickups pending.', primary: 'Mark for re-pickup', go: () => openTrack('pickup'), action: reschedule, disabled: !queue.pickup.missed || rescheduling },
    { id: 'cod', n: money(queue.cod.pendingPaise), title: 'COD still to be paid out', sub: queue.cod.nextExpectedDate ? `Next payout due ${shortDate(queue.cod.nextExpectedDate)}` : 'No payout cycle scheduled yet', sla: 'COD', cta: 'View', rows: [['Delivered COD today', money(queue.cod.deliveredTodayPaise)], ['Next payout', money(queue.cod.nextExpectedPaise)], ['Total still to be paid out', money(queue.cod.pendingPaise)]], rec: 'COD is paid out after the configured days from delivery (D+N), after shipping charges. A negative wallet balance is adjusted against the payout first.', go: () => nav('cod') },
  ];

  const GLASS = {
    position: 'relative',
    background: 'var(--nx-surface)',
    border: '1px solid var(--nx-border)',
    borderRadius: 10,
    boxShadow: '0 1px 2px rgba(20,44,66,.04), 0 8px 24px rgba(20,44,66,.045)',
  };

  return (
    <div style={{ flex: 1, padding: '0 0 48px', position: 'relative' }}>
      <ScenicBackdrop />

      <div style={{ position: 'relative', zIndex: 1, maxWidth: '100%', margin: '0 auto' }}>
      <div style={{ padding: `${phone ? 14 : 22}px ${pagePad}px 0`, fontSize: phone ? 18 : 22, fontWeight: 700, color: T.TEXT }}>Welcome{firstName ? ` ${me.full_name.trim()}` : ''}</div>

      {error && !live && (
        <div role="alert" style={{ margin: `14px ${pagePad}px 0`, padding: '14px 16px', borderRadius: 10, border: '1px solid #F1B8B8', background: '#FDF2F2', color: '#9B1C1C', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', fontSize: 13 }}>
          <span style={{ flex: 1 }}>The dashboard figures could not be loaded. {error.message && error.message !== 'INTERNAL_ERROR' ? error.message : 'Check your connection and try again.'}</span>
          <Btn small onClick={refresh}>Retry</Btn>
        </div>
      )}
      {error && live && (
        <div role="status" style={{ margin: `10px ${pagePad}px 0`, fontSize: 12, color: T.TEXT_MUTED }}>Showing the last loaded figures. They could not be refreshed just now.</div>
      )}

      <div style={{ padding: `${phone ? 14 : 14}px ${pagePad}px 6px`, display: 'grid', gridTemplateColumns: statCols, gap: phone ? 10 : 14 }}>
        {live
          ? statCards.map((c) => <DashboardStatCard key={c.id} card={c} hidden={expandedCardId === c.id} onOpen={setExpandedCardId} />)
          : placeholders.map((c) => (
            <div key={c[0]} aria-busy="true" style={{ ...GLASS, padding: '17px 19px 18px' }}>
              <div style={{ fontSize: 11.5, fontWeight: 750, letterSpacing: '.1em', textTransform: 'uppercase', color: T.TEXT_MUTED }}>{c[1]}</div>
              <Skeleton h={26} w="55%" style={{ marginTop: 14 }} /><Skeleton h={12} w="80%" style={{ marginTop: 14 }} />
            </div>
          ))}
      </div>

      {/* Drawn on the page body, outside the dashboard's own stacking layer, so it always sits above the sticky page header. */}
      {typeof document !== 'undefined' && createPortal(<DashboardStatCardModal card={expandedCard} onClose={() => setExpandedCardId(null)} />, document.body)}

      <div style={{ padding: `6px ${pagePad}px 0`, display: 'flex', flexDirection: 'column' }}>
        <div style={{ ...GLASS, overflow: 'hidden', marginTop: 20 }}>
          <GlassSheen />
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', padding: phone ? '12px 14px' : '13px 18px', borderBottom: `1px solid ${T.DIVIDER}` }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: T.SECTION_HEAD }}>Order pipeline</div>
              <div style={{ fontFamily: T.MONO, fontSize: 12, color: T.TEXT_MUTED }}>live stages show what is happening now · delivered, RTO, lost and cancelled cover {rangeLabel.toLowerCase()} · click a stage to open it</div>
            </div>
            <RangeSelect days={days} onChange={setDays} label="Order pipeline date range" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: pipeCols, gap: phone ? 8 : 10, padding: phone ? 10 : 14 }}>
            {PIPE.map(([key, label, color, kind, tab]) => (
              <motion.button
                type="button"
                key={key}
                onClick={() => openTrack(tab)}
                whileHover={{ y: -3, boxShadow: `0 1px 1px rgba(15,23,20,.06), 0 10px 22px rgba(15,23,20,.12), 0 2px 8px ${color}2E` }}
                whileTap={{ scale: 0.972 }}
                transition={{ type: 'spring', bounce: 0, duration: 0.28 }}
                style={{ textAlign: 'left', font: 'inherit', position: 'relative', overflow: 'hidden', cursor: 'pointer', borderRadius: 11, padding: phone ? '11px 10px 12px' : '13px 14px 14px', background: 'var(--nx-surface)', border: '1px solid var(--nx-border)', boxShadow: '0 1px 1px rgba(15,23,20,.03)' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <div style={{ width: 7, height: 7, borderRadius: 4, background: color, flex: '0 0 7px' }} />
                  <div style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: T.TEXT_SECONDARY, lineHeight: 1.3 }}>{label}</div>
                </div>
                {live
                  ? <div style={{ fontVariantNumeric: 'tabular-nums', fontSize: phone ? 19 : 22, fontWeight: 650, letterSpacing: '-.02em', marginTop: 10, color: T.TEXT }}>{(pipeline[key] ?? 0).toLocaleString('en-IN')}</div>
                  : <Skeleton h={22} w="45%" style={{ marginTop: 10 }} />}
                <div style={{ marginTop: 8, fontFamily: T.MONO, fontSize: 11, color: kind === 'now' ? T.ACCENT : T.TEXT_MUTED, fontWeight: 600 }}>{tagFor(kind)}</div>
              </motion.button>
            ))}
          </div>
        </div>

        <DashboardInsights live={live} rangeLabel={rangeLabel} phone={phone} />

        <div style={{ ...GLASS, marginTop: 20, overflow: 'hidden' }}>
          <GlassSheen />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 18px', borderBottom: `1px solid ${T.DIVIDER}`, gap: 16, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: T.SECTION_HEAD }}>Decisions waiting on you</div>
              <div style={{ fontFamily: T.MONO, fontSize: 12, color: T.TEXT_MUTED }}>expand a row to act without leaving this screen</div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 14 }}>
            {!queue && [0, 1, 2, 3].map((i) => <Skeleton key={i} h={58} />)}
            {QUEUE.map(({ id, n, title, sub, sla, cta, rows, rec, primary, go, action, disabled }) => {
              const open = expanded === id;
              const color = id === 'ndr' ? T.AMBER : id === 'weight' ? T.RED : id === 'pickup' ? '#2A4570' : T.GREEN;
              const chipBd = id === 'ndr' ? '#E5D3A8' : id === 'weight' ? '#E8C4BD' : id === 'pickup' ? '#C6D2E6' : '#BDDCC9';
              return (
                <motion.div
                  key={id}
                  layout
                  transition={{ type: 'spring', bounce: 0, duration: 0.32 }}
                  style={{
                    borderRadius: 11,
                    border: `1px solid ${open ? color : 'var(--nx-border)'}`,
                    background: open ? `${color}0D` : 'var(--nx-surface)',
                    overflow: 'hidden',
                  }}
                >
                  <motion.div
                    onClick={() => toggleExpanded(id)}
                    whileHover={open ? {} : { y: -2, boxShadow: `0 1px 1px rgba(15,23,20,.05), 0 8px 18px rgba(15,23,20,.08)` }}
                    transition={{ type: 'spring', bounce: 0, duration: 0.24 }}
                    style={{ display: 'flex', alignItems: 'center', gap: 15, padding: '0 16px', minHeight: 58, cursor: 'pointer', flexWrap: phone ? 'wrap' : 'nowrap' }}
                  >
                    <div style={{ fontSize: 12, color: T.TEXT_FAINT, width: 8, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .18s ease' }}>▸</div>
                    <div style={{ width: 3, height: 28, borderRadius: 2, background: color }} />
                    <div style={{ fontVariantNumeric: 'tabular-nums', fontSize: 18, fontWeight: 600, minWidth: 58 }}>{n}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{title}</div>
                      <div style={{ fontSize: 12, color: T.TEXT_MUTED, marginTop: 2 }}>{sub}</div>
                    </div>
                    <div style={{ fontFamily: T.MONO, fontSize: 11.5, fontWeight: 600, letterSpacing: '.05em', textTransform: 'uppercase', color, border: `1px solid ${chipBd}`, borderRadius: 20, padding: '3px 8px' }}>{sla}</div>
                    <div
                      onClick={(e) => { e.stopPropagation(); go(); }}
                      style={{ fontSize: 12.5, fontWeight: 600, color: '#14527f' }}
                    >
                      {cta} →
                    </div>
                  </motion.div>
                  {open && (
                    <div style={{ borderTop: `1px solid ${open ? `${color}33` : T.DIVIDER}`, padding: mobile ? '16px 16px 18px' : '18px 18px 20px 62px', animation: 'nxc-expand .14s ease-out' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : '340px 1fr', gap: 22 }}>
                        <div>
                          <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: T.TEXT_FAINT }}>Breakdown</div>
                          <div style={{ marginTop: 10, background: T.SURFACE, border: `1px solid ${T.BORDER}`, borderRadius: 8, overflow: 'hidden' }}>
                            {!rows.length && <div style={{ padding: '9px 12px', fontSize: 12, color: T.TEXT_MUTED }}>Nothing to show.</div>}
                            {rows.map(([k, v], i) => (
                              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 12px', borderBottom: `1px solid ${T.ROW_DIVIDER}`, fontSize: 12 }}>
                                <div style={{ color: T.TEXT_LABEL }}>{k}</div>
                                <div style={{ fontFamily: T.MONO }}>{v}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: T.TEXT_FAINT }}>Recommended action</div>
                          <div style={{ fontSize: 12.5, color: T.TEXT_LABEL, marginTop: 10, lineHeight: 1.65, maxWidth: 520 }}>{rec}</div>
                          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                            {primary && <Btn primary loading={id === 'pickup' && rescheduling} disabled={disabled} onClick={action || go}>{primary}</Btn>}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: chartCols, gap: 20, marginTop: 20, order: -1 }}>
          {showTrend && (
            <div style={{ ...GLASS, overflow: 'hidden' }}>
              <GlassSheen />
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '13px 18px', borderBottom: `1px solid ${T.DIVIDER}` }}>
                <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: T.SECTION_HEAD }}>Orders vs. delivered</div>
                <div style={{ display: 'flex', gap: 14, fontFamily: T.MONO, fontSize: 11, color: T.TEXT_SECONDARY }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><div style={{ width: 9, height: 2, background: T.NAVY }} />ORDERS (by order date)</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><div style={{ width: 9, height: 2, background: T.ACCENT }} />DELIVERED (by delivery date)</div>
                </div>
              </div>
              <div style={{ padding: '16px 18px 12px', display: 'flex', gap: 12 }}>
                {!live ? <Skeleton h={196} /> : (
                  <>
                    <div style={{ flex: '0 0 30px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', fontFamily: T.MONO, fontSize: 11, color: T.TEXT_FAINT, textAlign: 'right', height: 196 }}>
                      {axis.map((v, i) => <div key={i}>{v}</div>)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <TrendChart seriesA={trend.map((x) => x.orders)} seriesB={trend.map((x) => x.delivered)} labels={trend.map((x) => x.day.toUpperCase())} />
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: T.MONO, fontSize: 11, color: T.TEXT_FAINT, marginTop: 7 }}>
                        {trendTicks.map((d, i) => <div key={i}>{d}</div>)}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
          {showCourier && (
            <div style={{ ...GLASS, overflow: 'hidden' }}>
              <GlassSheen />
              <div style={{ padding: '13px 18px', borderBottom: `1px solid ${T.DIVIDER}`, fontSize: 12, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: T.SECTION_HEAD }}>Courier performance</div>
              {!live && <div style={{ padding: 18 }}><Skeleton h={14} /><Skeleton h={14} style={{ marginTop: 14 }} /><Skeleton h={14} style={{ marginTop: 14 }} /></div>}
              {live && !courierRows.length && <div style={{ padding: '14px 18px', fontSize: 12.5, color: T.TEXT_MUTED }}>No shipments in this period.</div>}
              {courierRows.map((c) => (
                <div key={c.name} style={{ padding: '11px 18px', borderBottom: `1px solid ${T.PAPER}` }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{c.name}</div>
                    <div style={{ fontVariantNumeric: 'tabular-nums', fontSize: 13, fontWeight: 600, color: c.color }}>{c.rate}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 7 }}>
                    <div style={{ flex: 1, height: 4, background: T.DIVIDER }}><div style={{ height: 4, background: c.color, width: c.w }} /></div>
                    <div style={{ fontFamily: T.MONO, fontSize: 11, color: T.TEXT_FAINT, width: 48, textAlign: 'right' }}>{c.vol}</div>
                  </div>
                </div>
              ))}
              {live && !!courierRows.length && <div style={{ padding: '8px 18px 12px', fontSize: 11.5, color: T.TEXT_MUTED }}>Delivery rate = delivered / finished parcels, with the number of parcels booked on the right.</div>}
            </div>
          )}
          {showCod && (
            <div style={{ ...GLASS, overflow: 'hidden' }}>
              <GlassSheen />
              <div style={{ padding: '13px 18px', borderBottom: `1px solid ${T.DIVIDER}`, fontSize: 12, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: T.SECTION_HEAD }}>COD vs. prepaid</div>
              <div style={{ padding: 18 }}>
                <div style={{ display: 'flex', height: 34, border: `1px solid ${T.BORDER}` }}>
                  {!live ? <Skeleton h={32} />
                    : (live.paymentMix.cod.orders + live.paymentMix.prepaid.orders === 0)
                      ? <div style={{ flex: 1, display: 'flex', alignItems: 'center', padding: '0 10px', fontSize: 12.5, color: T.TEXT_MUTED }}>No orders in this period</div>
                      : <>
                        <div style={{ width: `${codShare(live.paymentMix)}%`, background: T.NAVY, color: '#fff', display: 'flex', alignItems: 'center', padding: '0 10px', fontVariantNumeric: 'tabular-nums', fontSize: 12.5, fontWeight: 600, overflow: 'hidden', whiteSpace: 'nowrap' }}>{codShare(live.paymentMix) >= 12 ? `${codShare(live.paymentMix)}% COD` : ''}</div>
                        <div style={{ width: `${100 - codShare(live.paymentMix)}%`, background: T.ACCENT, color: '#FFFFFF', display: 'flex', alignItems: 'center', padding: '0 10px', fontVariantNumeric: 'tabular-nums', fontSize: 12.5, fontWeight: 600, overflow: 'hidden', whiteSpace: 'nowrap' }}>{100 - codShare(live.paymentMix) >= 12 ? `${100 - codShare(live.paymentMix)}%` : ''}</div>
                      </>}
                </div>
                <div style={{ marginTop: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${T.PAPER}`, fontSize: 12 }}><div style={{ color: T.TEXT_SECONDARY }}>COD orders</div><div style={{ fontFamily: T.MONO }}>{live ? live.paymentMix.cod.orders.toLocaleString('en-IN') : '—'}</div></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${T.PAPER}`, fontSize: 12 }}><div style={{ color: T.TEXT_SECONDARY }}>COD to collect</div><div style={{ fontFamily: T.MONO }}>{live ? money(live.paymentMix.cod.valuePaise) : '—'}</div></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: 12 }}><div style={{ color: T.TEXT_SECONDARY }}>Prepaid value</div><div style={{ fontFamily: T.MONO }}>{live ? money(live.paymentMix.prepaid.valuePaise) : '—'}</div></div>
                </div>
              </div>
            </div>
          )}
          <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: mobile ? '1fr' : '1fr 1fr', gap: 20 }}>
          <div style={{ ...GLASS, overflow: 'hidden', minWidth: 0 }}>
            <GlassSheen />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '13px 18px', borderBottom: `1px solid ${T.DIVIDER}` }}>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: T.SECTION_HEAD }}>Top NDR reasons</div>
              <RangeSelect days={days} onChange={setDays} label="Top NDR reasons date range" />
            </div>
            {!live ? <div style={{ padding: 18 }}><Skeleton h={120} /></div>
              : <BarChartV items={(live.ndrReasons || []).slice(0, 6).map((r) => ({ label: NDR_REASONS[r.reason] || r.reason, value: r.count, hint: `${NDR_REASONS[r.reason] || r.reason}: ${r.count} (${r.pct}%)` }))} empty="No NDR cases in this period." />}
          </div>
          <div style={{ ...GLASS, overflow: 'hidden', minWidth: 0 }}>
            <GlassSheen />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '13px 18px', borderBottom: `1px solid ${T.DIVIDER}` }}>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: T.SECTION_HEAD }}>State wise delivery</div>
              <RangeSelect days={days} onChange={setDays} label="State wise delivery date range" />
            </div>
            {!live ? <div style={{ padding: 18 }}><Skeleton h={120} /></div>
              : <BarChartV color={T.NAVY} items={(live.stateDelivery || []).map((x) => ({ label: x.state, value: x.delivered, hint: `${x.state}: ${x.delivered} delivered of ${x.total} shipped` }))} empty="No delivered shipments in this period." />}
          </div>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
