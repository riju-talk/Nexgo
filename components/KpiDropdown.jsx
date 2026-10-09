'use client';

import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { METRICS } from '@/lib/data';
import { useAppState } from '@/lib/AppStateContext';
import * as T from '@/lib/theme';

const GROUPS = ['Volume & fulfilment', 'Exceptions & risk', 'Money', 'Charts'];
const PANEL_SPRING = { type: 'spring', bounce: 0, duration: 0.26 };
const TAP = { scale: 0.97 };

export default function KpiDropdown({ mobile }) {
  const { kpis, kpiOpen, setKpiOpen, toggleKpi, resetKpi } = useAppState();
  const reduced = useReducedMotion();

  const kpiSections = GROUPS.map((g) => ({
    label: g,
    items: METRICS.filter((m) => m[3] === g),
  }));

  return (
    <div style={{ position: 'relative' }}>
      <motion.div
        whileTap={TAP}
        transition={{ duration: 0.08 }}
        onClick={() => setKpiOpen(!kpiOpen)}
        style={{ height: 32, padding: '0 12px', border: `1px solid ${kpiOpen ? T.NAVY : T.INPUT_BORDER}`, background: kpiOpen ? T.NAVY : T.SURFACE, color: kpiOpen ? '#fff' : T.TEXT, display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
      >
        Customize KPIs
        <div style={{ fontFamily: T.MONO, fontSize: 10.5, opacity: .7 }}>{kpis.length}/11</div>
        <div style={{ fontSize: 10.5, opacity: .7 }}>▾</div>
      </motion.div>
      <AnimatePresence>
        {kpiOpen && (
          <motion.div
            initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: -6 }}
            animate={reduced ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: -4 }}
            transition={reduced ? { duration: 0.12 } : PANEL_SPRING}
            style={{
              position: mobile ? 'fixed' : 'absolute',
              top: mobile ? 52 : 36,
              right: mobile ? 12 : 0,
              left: mobile ? 12 : 'auto',
              width: mobile ? 'auto' : 560,
              background: T.SURFACE, border: `1px solid ${T.MENU_BORDER}`, boxShadow: '0 24px 60px rgba(35,30,20,.2)', zIndex: 60,
              transformOrigin: 'top right',
            }}
          >
            <div style={{ padding: '12px 14px', borderBottom: `1px solid ${T.DIVIDER}`, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: T.SECTION_HEAD }}>Metric set</div>
              <div style={{ fontFamily: T.MONO, fontSize: 12, color: T.TEXT_MUTED }}>{kpis.length} selected · max 10</div>
            </div>
            <div style={{ maxHeight: mobile ? '60vh' : 330, overflowY: 'auto' }}>
              {kpiSections.map((sec) => (
                <div key={sec.label}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: T.TEXT_MUTED, background: T.SURFACE_SOFT, padding: '6px 14px', borderBottom: `1px solid ${T.DIVIDER}` }}>{sec.label}</div>
                  {sec.items.map((m) => {
                    const on = kpis.indexOf(m[0]) >= 0;
                    return (
                      <motion.div
                        key={m[0]}
                        whileTap={TAP}
                        transition={{ duration: 0.08 }}
                        onClick={() => toggleKpi(m[0])}
                        className={`nxc-kpi-row${on ? ' is-on' : ''}`}
                        style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 14px', borderBottom: `1px solid ${T.PAPER}`, cursor: 'pointer' }}
                      >
                        <div style={{ width: 14, height: 14, flex: '0 0 14px', border: `1.5px solid ${on ? T.ACCENT : T.MENU_BORDER}`, background: on ? T.ACCENT : T.SURFACE, color: '#06212C', fontSize: 10.5, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{on ? '✓' : ''}</div>
                        <div style={{ fontSize: 12.5, fontWeight: 500, flex: 1 }}>{m[1]}</div>
                        <div style={{ fontFamily: T.MONO, fontSize: 10.5, color: T.TEXT_SECONDARY }}>{m[4]}</div>
                        <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', color: T.TEXT_FAINT, width: 42, textAlign: 'right' }}>{m[2]}</div>
                      </motion.div>
                    );
                  })}
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: T.SURFACE_SOFT, borderTop: `1px solid ${T.DIVIDER}` }}>
              <div style={{ fontFamily: T.MONO, fontSize: 10.5, color: T.TEXT_MUTED }}>UP/DOWN MOVE · SPACE TOGGLE · ENTER APPLY</div>
              <motion.div whileTap={TAP} transition={{ duration: 0.08 }} onClick={resetKpi} style={{ marginLeft: 'auto', fontSize: 12, color: T.TEXT_SECONDARY, cursor: 'pointer' }}>Reset</motion.div>
              <motion.div whileTap={TAP} transition={{ duration: 0.08 }} onClick={() => setKpiOpen(false)} style={{ fontSize: 12, fontWeight: 600, color: '#fff', background: T.NAVY, padding: '7px 14px', cursor: 'pointer' }}>Apply</motion.div>
            </div>
            <style jsx>{`
              .nxc-kpi-row { background: var(--nx-surface); transition: background 100ms ease-out; }
              .nxc-kpi-row:hover { background: var(--nx-surface-soft); }
              .nxc-kpi-row.is-on { background: rgba(6,182,212,.1); }
              .nxc-kpi-row.is-on:hover { background: rgba(6,182,212,.16); }
            `}</style>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
