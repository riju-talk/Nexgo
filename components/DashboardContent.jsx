'use client';

import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { METRICS, PIPELINE, TREND_A, TREND_B, COURIER_PERF } from '@/lib/data';
import { spark } from '@/lib/charts';
import { useAppState } from '@/lib/AppStateContext';
import * as T from '@/lib/theme';
import ScenicBackdrop from './ScenicBackdrop';
import DashboardStatCard from './DashboardStatCard';
import DashboardStatCardModal from './DashboardStatCardModal';
import TrendChart from './TrendChart';
import BarChartV from './BarChartV';
import { apiFetch } from '@/lib/api';

function GlassSheen() {
  return <div style={{ position: 'absolute', top: 0, left: 14, right: 14, height: 1, background: 'var(--nx-glass-border)' }} />;
}

const RANGES = [[1, 'Today'], [7, 'Last 7 days'], [30, 'Last 30 days'], [90, 'Last 90 days']];
const money = (paise) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format((paise || 0) / 100);
const shortDate = (iso) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '—');

const NDR_REASONS = { customer_unavailable: 'Customer Not Available', address_incomplete: 'Incomplete Address', address_incorrect: 'Wrong Address', refused_delivery: 'Customer Refused', payment_not_ready: 'Payment Not Ready', customer_requested_reschedule: 'Reschedule Requested', premises_closed: 'Premises Closed', customer_not_contactable: 'Not Contactable', incorrect_product: 'Incorrect Product', damaged_product: 'Damaged Product', other: 'Other' };

function RangeSelect({ days, onChange, label }) {
  return <select aria-label={label} value={days} onChange={(e) => onChange(Number(e.target.value))} style={{ height: 30, padding: '0 10px', borderRadius: 8, border: `1px solid ${T.INPUT_BORDER}`, background: T.SURFACE, color: T.TEXT, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>{RANGES.map(([d, l]) => <option key={d} value={d}>{l}</option>)}</select>;
}

export default function DashboardContent({ mobile, narrow, phone }) {
  const { kpis, stage, setStage, expanded, toggleExpanded, nav, showToast, dashDays: days, setDashDays: setDays } = useAppState();
  const [expandedCardId, setExpandedCardId] = useState(null);
  const [live, setLive] = useState(null);
  const [tick, setTick] = useState(0);
  useEffect(() => { let on = true; apiFetch(`/v1/analytics/dashboard?days=${days}`).then((x) => { if (on) setLive(x); }).catch(() => {}); return () => { on = false; }; }, [days, tick]);
  const rangeLabel = (RANGES.find((r) => r[0] === days) || RANGES[2])[1];
  const shortRange = days === 1 ? 'Today' : `${days}d`;
  const [rescheduling, setRescheduling] = useState(false);
  const reschedule = async () => {
    if (rescheduling) return;
    setRescheduling(true);
    try { const r = await apiFetch('/v1/analytics/dashboard/reschedule-pickups', { method: 'POST' }); showToast(r.message || 'Re-scheduled for tomorrow'); setTick((t) => t + 1); }
    catch (e) { showToast(e.message || 'Pickup could not be rescheduled', 'error'); }
    finally { setRescheduling(false); }
  };
  const [ndr, setNdr] = useState(null);
  useEffect(() => { apiFetch('/v1/ndr/stats').then(setNdr).catch(() => setNdr({ reasons: [] })); }, []);
  const formatMoney = (value) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format((value || 0) / 100);
  const liveValues = live ? { order_volume: String(live.metrics.todayVolume), in_transit: String(live.metrics.inTransit), delivery_rate: `${live.metrics.deliveryRate}%`, ndr_rate: `${live.metrics.ndrRate}%`, rto_rate: `${live.metrics.rtoRate}%`, revenue: formatMoney(live.metrics.shippingSpendPaise) } : {};

  const statCards = METRICS.filter((m) => kpis.indexOf(m[0]) >= 0 && m[2] === 'Card').map((m, i) => ({
    id: m[0], label: m[0] === 'order_volume' && live ? "Order volume · today" : m[1], value: liveValues[m[0]] ?? m[4],
    delta: live ? (m[0] === 'order_volume' ? `${shortRange}: ${live.metrics.orderVolume}` : shortRange) : m[5], sub: live ? (m[0] === 'order_volume' ? 'by order date' : 'selected period') : m[7], seed: i * 2 + 1,
    deltaColor: m[6] === 'up' ? T.GREEN : m[6] === 'down' ? T.RED : T.MUTE,
    sparkPath: spark(i * 2 + 1),
    sparkColor: m[6] === 'up' ? T.ACCENT : m[6] === 'down' ? '#D9A79E' : '#BDB8AC',
  }));
  const expandedCard = statCards.find((c) => c.id === expandedCardId) || null;

  const showTrend = kpis.indexOf('order_volume') >= 0;
  const showCourier = kpis.indexOf('courier_perf') >= 0;
  const showCod = kpis.indexOf('cod_split') >= 0;
  const chartColCount = [showTrend, showCourier, showCod].filter(Boolean).length;
  const chartCols = mobile ? '1fr' : chartColCount ? [showTrend ? '1.7fr' : null, showCourier ? '1fr' : null, showCod ? '1fr' : null].filter(Boolean).join(' ') : '1fr';

  const dashboardPipeline = live ? PIPELINE.map(([label, count, color]) => [label, live.pipeline[label.toLowerCase().replaceAll(' ', '_')] ?? 0, color]) : PIPELINE;
  const total = dashboardPipeline.reduce((a, p) => a + p[1], 0);
  const queue = live?.queue;
  const trend = live?.trend || [];
  const trendMax = Math.max(1, ...trend.flatMap((x) => [x.orders, x.delivered]));
  const axis = [1, 2 / 3, 1 / 3, 0].map((f) => Math.round(trendMax * 1.15 * f));
  const trendTicks = trend.length > 1 ? [0, 0.25, 0.5, 0.75, 1].map((f) => trend[Math.round((trend.length - 1) * f)].day.toUpperCase()) : [];
  const courierRows = live?.courierMix?.length ? live.courierMix.map((c) => { const r = c.total ? (c.delivered / c.total) * 100 : 0; return { name: c.name, rate: `${r.toFixed(1)}%`, w: `${r}%`, vol: String(c.total), color: r >= 90 ? T.GREEN : r >= 75 ? T.AMBER : T.RED }; }) : live ? [] : COURIER_PERF;
  const statCols = mobile ? 'repeat(2,minmax(0,1fr))' : narrow ? 'repeat(3,minmax(0,1fr))' : 'repeat(5,minmax(0,1fr))';
  const pipeCols = phone ? 'repeat(2,minmax(0,1fr))' : mobile ? 'repeat(3,minmax(0,1fr))' : narrow ? 'repeat(5,minmax(0,1fr))' : 'repeat(9,minmax(0,1fr))';
  const pagePad = phone ? 12 : mobile ? 16 : 28;

  // Decisions waiting on you: live counts, every action lands on the page that resolves it.
  const QUEUE = !queue ? [] : [
    { id: 'ndr', n: String(queue.ndr.open), title: 'NDR shipments awaiting action', sub: 'Open non-delivery cases that need your decision', sla: 'ACTION', cta: 'Action', rows: queue.ndr.reasons.map((r) => [NDR_REASONS[r.reason] || r.reason, String(r.n)]), rec: queue.ndr.open ? `Reattempt or update the address for the ${queue.ndr.open} open NDR shipment${queue.ndr.open === 1 ? '' : 's'} before the courier returns them.` : 'No open NDR shipments. Nothing needs your attention.', primary: `Resolve ${queue.ndr.open} NDR${queue.ndr.open === 1 ? '' : 's'}`, go: () => nav('ndr') },
    { id: 'weight', n: String(queue.weight.open), title: 'Weight discrepancies raised by couriers', sub: `${money(queue.weight.heldPaise)} held against wallet`, sla: 'REVIEW', cta: 'Review', rows: queue.weight.couriers.map((c) => [c.name, `${c.count} · ${money(c.amountPaise)}`]), rec: queue.weight.open ? 'Dispute with packing photos as evidence, or accept the revised charge. Undisputed charges are debited from your wallet.' : 'No open weight discrepancies.', primary: `Dispute ${queue.weight.open} case${queue.weight.open === 1 ? '' : 's'}`, go: () => nav('weight') },
    { id: 'pickup', n: String(queue.pickup.missed), title: 'Pickups missed', sub: 'Booked shipments the courier has not picked up in time', sla: 'TODAY', cta: 'Reschedule', rows: queue.pickup.couriers.map((c) => [c.name, `${c.n} shipments`]), rec: queue.pickup.missed ? 'Rebook these pickups for the next available slot. The courier will be asked to collect them tomorrow.' : 'No missed pickups.', primary: 'Reschedule pickup', go: reschedule, disabled: !queue.pickup.missed },
    { id: 'cod', n: money(queue.cod.totalDuePaise), title: 'COD remittance', sub: queue.cod.nextExpectedDate ? `Next payout due ${shortDate(queue.cod.nextExpectedDate)}` : 'No payout cycle scheduled yet', sla: 'COD', cta: 'View', rows: [['Delivered COD value (today)', money(queue.cod.deliveredTodayPaise)], ['Next expected COD', money(queue.cod.nextExpectedPaise)], ['Total remittance due', money(queue.cod.totalDuePaise)]], rec: 'COD is paid out after the configured days from delivery (D+N). A negative wallet balance is adjusted against the payout first.', go: () => nav('cod') },
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
      <div style={{ padding: `${phone ? 14 : 22}px ${pagePad}px 6px`, display: 'grid', gridTemplateColumns: statCols, gap: phone ? 10 : 14 }}>
        {statCards.map((c) => (
          <DashboardStatCard key={c.id} card={c} hidden={expandedCardId === c.id} onOpen={setExpandedCardId} />
        ))}
      </div>

      <DashboardStatCardModal card={expandedCard} onClose={() => setExpandedCardId(null)} />

      <div style={{ padding: `6px ${pagePad}px 0`, display: 'flex', flexDirection: 'column' }}>
        <div style={{ ...GLASS, overflow: 'hidden', marginTop: 20 }}>
          <GlassSheen />
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', padding: phone ? '12px 14px' : '13px 18px', borderBottom: `1px solid ${T.DIVIDER}` }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: T.SECTION_HEAD }}>Order pipeline</div>
              <div style={{ fontFamily: T.MONO, fontSize: 13, color: T.TEXT_MUTED }}>{total.toLocaleString('en-IN')} {live ? 'in' : 'orders ·'} {live ? rangeLabel.toLowerCase() : 'click a stage to filter the queue'}</div>
            </div>
            <RangeSelect days={days} onChange={setDays} label="Order pipeline date range" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: pipeCols, gap: phone ? 8 : 10, padding: phone ? 10 : 14 }}>
            {dashboardPipeline.map(([label, count, color]) => {
              const on = stage === label;
              const pct = total ? (count / total) * 100 : 0;
              return (
                <motion.div
                  key={label}
                  onClick={() => setStage(label)}
                  whileHover={{ y: -3, boxShadow: `0 1px 1px rgba(15,23,20,.06), 0 10px 22px rgba(15,23,20,.12), 0 2px 8px ${color}2E` }}
                  whileTap={{ scale: 0.972 }}
                  transition={{ type: 'spring', bounce: 0, duration: 0.28 }}
                  style={{
                    position: 'relative',
                    overflow: 'hidden',
                    cursor: 'pointer',
                    borderRadius: 11,
                    padding: phone ? '11px 10px 12px' : '13px 14px 14px',
                    background: on ? `${color}14` : 'var(--nx-surface)',
                    border: `1px solid ${on ? color : 'var(--nx-border)'}`,
                    boxShadow: on ? `0 1px 1px rgba(15,23,20,.05), 0 6px 16px ${color}22` : '0 1px 1px rgba(15,23,20,.03)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <div style={{ width: 7, height: 7, borderRadius: 4, background: color, flex: '0 0 7px' }} />
                    <div style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: on ? color : T.TEXT_SECONDARY, lineHeight: 1.3 }}>{label}</div>
                  </div>
                  <div style={{ fontVariantNumeric: 'tabular-nums', fontSize: phone ? 19 : 22, fontWeight: 650, letterSpacing: '-.02em', marginTop: 10, color: T.TEXT }}>{count.toLocaleString('en-IN')}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 10 }}>
                    <div style={{ flex: 1, height: 4, background: 'var(--nx-divider)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', background: color, width: `${pct}%`, borderRadius: 3 }} />
                    </div>
                    <div style={{ fontFamily: T.MONO, fontSize: 12, color: T.TEXT_MUTED, flex: '0 0 auto' }}>{pct.toFixed(1)}%</div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>

        <div style={{ ...GLASS, marginTop: 20, overflow: 'hidden' }}>
          <GlassSheen />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 18px', borderBottom: `1px solid ${T.DIVIDER}`, gap: 16, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: T.SECTION_HEAD }}>Decisions waiting on you</div>
              <div style={{ fontFamily: T.MONO, fontSize: 12, color: T.TEXT_MUTED }}>expand a row to act without leaving this screen</div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 14 }}>
            {!queue && <span style={{ fontSize: 12.5, color: T.TEXT_MUTED }}>Loading…</span>}
            {QUEUE.map(({ id, n, title, sub, sla, cta, rows, rec, primary, go, disabled }) => {
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
                    style={{ display: 'flex', alignItems: 'center', gap: 15, padding: '0 16px', height: 58, cursor: 'pointer' }}
                  >
                    <div style={{ fontSize: 12, color: T.TEXT_FAINT, width: 8, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .18s ease' }}>▸</div>
                    <div style={{ width: 3, height: 28, borderRadius: 2, background: color }} />
                    <div style={{ fontVariantNumeric: 'tabular-nums', fontSize: 18, fontWeight: 600, width: 58 }}>{n}</div>
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
                    <div style={{ borderTop: `1px solid ${open ? `${color}33` : T.DIVIDER}`, padding: '18px 18px 20px 62px', animation: 'nxc-expand .14s ease-out' }}>
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
                            {primary && <button type="button" disabled={disabled} onClick={go} style={{ height: 32, padding: '0 13px', borderRadius: 7, border: 0, background: T.NAVY, color: '#fff', display: 'flex', alignItems: 'center', fontSize: 12.5, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1 }}>{primary}</button>}
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
                <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: T.SECTION_HEAD }}>Volume vs. delivered</div>
                <div style={{ display: 'flex', gap: 14, fontFamily: T.MONO, fontSize: 11, color: T.TEXT_SECONDARY }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><div style={{ width: 9, height: 2, background: T.NAVY }} />ORDERS</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><div style={{ width: 9, height: 2, background: T.ACCENT }} />DELIVERED</div>
                </div>
              </div>
              <div style={{ padding: '16px 18px 12px', display: 'flex', gap: 12 }}>
                <div style={{ flex: '0 0 30px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', fontFamily: T.MONO, fontSize: 11, color: T.TEXT_FAINT, textAlign: 'right', height: 196 }}>
                  {axis.map((v, i) => <div key={i}>{v}</div>)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <TrendChart seriesA={live ? trend.map((x) => x.orders) : TREND_A} seriesB={live ? trend.map((x) => x.delivered) : TREND_B} labels={live ? trend.map((x) => x.day.toUpperCase()) : undefined} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: T.MONO, fontSize: 11, color: T.TEXT_FAINT, marginTop: 7 }}>
                    {live ? trendTicks.map((d, i) => <div key={i}>{d}</div>) : <><div>05 AUG</div><div>12 AUG</div><div>19 AUG</div><div>26 AUG</div><div>03 SEP</div></>}
                  </div>
                </div>
              </div>
            </div>
          )}
          {showCourier && (
            <div style={{ ...GLASS, overflow: 'hidden' }}>
              <GlassSheen />
              <div style={{ padding: '13px 18px', borderBottom: `1px solid ${T.DIVIDER}`, fontSize: 12, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: T.SECTION_HEAD }}>Courier performance</div>
              {courierRows.map((c) => (
                <div key={c.name} style={{ padding: '11px 18px', borderBottom: `1px solid ${T.PAPER}` }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{c.name}</div>
                    <div style={{ fontVariantNumeric: 'tabular-nums', fontSize: 13, fontWeight: 600, color: c.color === 'accent' ? T.ACCENT : c.color }}>{c.rate}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 7 }}>
                    <div style={{ flex: 1, height: 4, background: T.DIVIDER }}><div style={{ height: 4, background: c.color === 'accent' ? T.ACCENT : c.color, width: c.w }} /></div>
                    <div style={{ fontFamily: T.MONO, fontSize: 11, color: T.TEXT_FAINT, width: 48, textAlign: 'right' }}>{c.vol}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {showCod && (
            <div style={{ ...GLASS, overflow: 'hidden' }}>
              <GlassSheen />
              <div style={{ padding: '13px 18px', borderBottom: `1px solid ${T.DIVIDER}`, fontSize: 12, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: T.SECTION_HEAD }}>COD vs. prepaid</div>
              <div style={{ padding: 18 }}>
                <div style={{ display: 'flex', height: 34, border: `1px solid ${T.BORDER}` }}>
                  <div style={{ width: '62%', background: T.NAVY, color: '#fff', display: 'flex', alignItems: 'center', padding: '0 10px', fontVariantNumeric: 'tabular-nums', fontSize: 12.5, fontWeight: 600 }}>62% COD</div>
                  <div style={{ width: '38%', background: T.ACCENT, color: '#06212C', display: 'flex', alignItems: 'center', padding: '0 10px', fontVariantNumeric: 'tabular-nums', fontSize: 12.5, fontWeight: 600 }}>38%</div>
                </div>
                <div style={{ marginTop: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${T.PAPER}`, fontSize: 12 }}><div style={{ color: T.TEXT_SECONDARY }}>COD orders</div><div style={{ fontFamily: T.MONO }}>7,738</div></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${T.PAPER}`, fontSize: 12 }}><div style={{ color: T.TEXT_SECONDARY }}>COD collected</div><div style={{ fontFamily: T.MONO }}>₹41.2L</div></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: 12 }}><div style={{ color: T.TEXT_SECONDARY }}>Prepaid value</div><div style={{ fontFamily: T.MONO }}>₹26.8L</div></div>
                </div>
              </div>
            </div>
          )}
          <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: mobile ? '1fr' : '1fr 1fr', gap: 20 }}>
          <div style={{ ...GLASS, overflow: 'hidden', minWidth: 0 }}>
            <GlassSheen />
            <div style={{ padding: '13px 18px', borderBottom: `1px solid ${T.DIVIDER}`, fontSize: 12, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: T.SECTION_HEAD }}>Top NDR reasons</div>
            {!ndr ? <span style={{ display: 'block', padding: '14px 18px', fontSize: 12.5, color: T.TEXT_MUTED }}>Loading…</span>
              : <BarChartV items={(ndr.reasons || []).slice(0, 6).map((r) => ({ label: NDR_REASONS[r.reason] || r.reason, value: r.count, hint: `${NDR_REASONS[r.reason] || r.reason}: ${r.count} (${r.pct}%)` }))} empty="No NDR reasons recorded yet." />}
          </div>
          <div style={{ ...GLASS, overflow: 'hidden', minWidth: 0 }}>
            <GlassSheen />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '13px 18px', borderBottom: `1px solid ${T.DIVIDER}` }}>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: T.SECTION_HEAD }}>State wise delivery</div>
              <RangeSelect days={days} onChange={setDays} label="State wise delivery date range" />
            </div>
            {!live ? <span style={{ display: 'block', padding: '14px 18px', fontSize: 12.5, color: T.TEXT_MUTED }}>Loading…</span>
              : <BarChartV color={T.NAVY} items={(live.stateDelivery || []).map((x) => ({ label: x.state, value: x.delivered, hint: `${x.state}: ${x.delivered} delivered of ${x.total} shipped` }))} empty="No delivered shipments in this period." />}
          </div>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
