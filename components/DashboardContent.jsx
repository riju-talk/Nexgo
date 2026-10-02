'use client';

import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { METRICS, PIPELINE, QUEUE, TREND_A, TREND_B, COURIER_PERF } from '@/lib/data';
import { spark } from '@/lib/charts';
import { useAppState } from '@/lib/AppStateContext';
import * as T from '@/lib/theme';
import ScenicBackdrop from './ScenicBackdrop';
import DashboardStatCard from './DashboardStatCard';
import DashboardStatCardModal from './DashboardStatCardModal';
import TrendChart from './TrendChart';
import { apiFetch } from '@/lib/api';

function GlassSheen() {
  return <div style={{ position: 'absolute', top: 0, left: 14, right: 14, height: 1, background: 'var(--nx-glass-border)' }} />;
}

export default function DashboardContent({ mobile, narrow, phone }) {
  const { kpis, stage, setStage, expanded, toggleExpanded, queueTab, setQueueTab, setDrawerOpen } = useAppState();
  const [expandedCardId, setExpandedCardId] = useState(null);
  const [live, setLive] = useState(null);
  useEffect(() => { apiFetch('/v1/analytics/dashboard').then(setLive).catch(() => {}); }, []);
  const formatMoney = (value) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format((value || 0) / 100);
  const liveValues = live ? { order_volume: String(live.metrics.orderVolume), in_transit: String(live.metrics.inTransit), delivery_rate: `${live.metrics.deliveryRate}%`, ndr_rate: `${live.metrics.ndrRate}%`, rto_rate: `${live.metrics.rtoRate}%`, revenue: formatMoney(live.metrics.shippingSpendPaise) } : {};

  const statCards = METRICS.filter((m) => kpis.indexOf(m[0]) >= 0 && m[2] === 'Card').map((m, i) => ({
    id: m[0], label: m[1], value: liveValues[m[0]] ?? m[4], delta: live ? 'Live data' : m[5], sub: live ? 'Current workspace' : m[7], seed: i * 2 + 1,
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

  const dashboardPipeline = live ? PIPELINE.map(([label, count, color]) => [label, live.pipeline[label.toLowerCase().replaceAll(' ', '_')] ?? count, color]) : PIPELINE;
  const total = dashboardPipeline.reduce((a, p) => a + p[1], 0);
  const statCols = mobile ? 'repeat(2,minmax(0,1fr))' : narrow ? 'repeat(3,minmax(0,1fr))' : 'repeat(5,minmax(0,1fr))';
  const pipeCols = phone ? 'repeat(2,minmax(0,1fr))' : mobile ? 'repeat(3,minmax(0,1fr))' : narrow ? 'repeat(5,minmax(0,1fr))' : 'repeat(9,minmax(0,1fr))';
  const pagePad = phone ? 12 : mobile ? 16 : 22;

  const queueTabs = ['All', 'Time critical', 'Money at risk'];

  const GLASS = {
    position: 'relative',
    background: 'linear-gradient(165deg, var(--nx-glass-1) 0%, var(--nx-glass-2) 100%)',
    backdropFilter: 'blur(18px) saturate(180%)',
    border: '1px solid var(--nx-glass-border)',
    borderRadius: 14,
    boxShadow: '0 1px 1px rgba(15,23,20,.05), 0 10px 28px rgba(15,23,20,.10)',
  };

  return (
    <div style={{ flex: 1, padding: '0 0 48px', position: 'relative' }}>
      <ScenicBackdrop />

      <div style={{ position: 'relative', zIndex: 1, padding: `${phone ? 14 : 22}px ${pagePad}px 6px`, display: 'grid', gridTemplateColumns: statCols, gap: phone ? 10 : 14 }}>
        {statCards.map((c) => (
          <DashboardStatCard key={c.id} card={c} hidden={expandedCardId === c.id} onOpen={setExpandedCardId} />
        ))}
      </div>

      <DashboardStatCardModal card={expandedCard} onClose={() => setExpandedCardId(null)} />

      <div style={{ position: 'relative', zIndex: 1, padding: `6px ${pagePad}px 0`, display: 'flex', flexDirection: 'column' }}>
        <div style={{ ...GLASS, overflow: 'hidden', marginTop: 20 }}>
          <GlassSheen />
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', padding: phone ? '12px 14px' : '13px 18px', borderBottom: `1px solid ${T.DIVIDER}` }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: T.SECTION_HEAD }}>Order pipeline</div>
              <div style={{ fontFamily: T.MONO, fontSize: 13, color: T.TEXT_MUTED }}>12,480 orders · click a stage to filter the queue</div>
            </div>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0E5049', cursor: 'pointer' }}>Export →</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: pipeCols, gap: phone ? 8 : 10, padding: phone ? 10 : 14 }}>
            {dashboardPipeline.map(([label, count, color]) => {
              const on = stage === label;
              const pct = (count / total) * 100;
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
            <div style={{ display: 'flex', gap: 7 }}>
              {queueTabs.map((label) => {
                const on = queueTab === label;
                return (
                  <div
                    key={label}
                    onClick={() => setQueueTab(label)}
                    style={{ height: 30, display: 'flex', alignItems: 'center', padding: '0 11px', border: `1px solid ${on ? T.NAVY : T.INPUT_BORDER}`, background: on ? T.NAVY : T.SURFACE, color: on ? '#fff' : T.TEXT_LABEL, fontSize: 12.5, fontWeight: on ? 600 : 500, cursor: 'pointer' }}
                  >
                    {label}
                  </div>
                );
              })}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 14 }}>
            {QUEUE.map(([n, title, sub, id, sla, key, cta, primary, secondaryLabel, rows, rec]) => {
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
                      onClick={(e) => { e.stopPropagation(); setDrawerOpen(true); }}
                      style={{ fontSize: 12.5, fontWeight: 600, color: '#0E5049' }}
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
                            <div onClick={() => setDrawerOpen(true)} style={{ height: 32, padding: '0 13px', borderRadius: 7, background: T.NAVY, color: '#fff', display: 'flex', alignItems: 'center', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>{primary}</div>
                            <div style={{ height: 32, padding: '0 13px', borderRadius: 7, border: `1px solid ${T.INPUT_BORDER}`, background: T.SURFACE, display: 'flex', alignItems: 'center', fontSize: 12.5, cursor: 'pointer' }}>{secondaryLabel}</div>
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
                  <div>150</div><div>100</div><div>50</div><div>0</div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <TrendChart seriesA={live ? live.trend.map((x) => x.orders) : TREND_A} seriesB={live ? live.trend.map((x) => x.delivered) : TREND_B} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: T.MONO, fontSize: 11, color: T.TEXT_FAINT, marginTop: 7 }}>
                    <div>05 AUG</div><div>12 AUG</div><div>19 AUG</div><div>26 AUG</div><div>03 SEP</div>
                  </div>
                </div>
              </div>
            </div>
          )}
          {showCourier && (
            <div style={{ ...GLASS, overflow: 'hidden' }}>
              <GlassSheen />
              <div style={{ padding: '13px 18px', borderBottom: `1px solid ${T.DIVIDER}`, fontSize: 12, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: T.SECTION_HEAD }}>Courier performance</div>
              {COURIER_PERF.map((c) => (
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
        </div>
      </div>
    </div>
  );
}
