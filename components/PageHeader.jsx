'use client';

import { motion } from 'motion/react';
import { PAGES, ACTIONS } from '@/lib/data';
import { useAppState } from '@/lib/AppStateContext';
import * as T from '@/lib/theme';
import KpiDropdown from './KpiDropdown';
import FilterDropdown from './FilterDropdown';

const TAP = { scale: 0.96 };
const TAP_FAST = { duration: 0.08 };

export default function PageHeader({ activeId, isDashboard, mobile, phone }) {
  const { nav, setPaletteOpen } = useAppState();
  const meta = PAGES[activeId] || ['', '', ''];
  const [crumb, pageTitle, pageSub] = meta;
  const isAdmin = activeId.indexOf('a-') === 0;
  const actions = (ACTIONS[activeId] || []).filter(([, , dest]) => dest); // buttons without a destination had no handler

  return (
    <div style={{ background: T.PANEL, borderBottom: `1px solid ${T.BORDER}`, padding: phone ? '12px 12px 0' : mobile ? '16px 16px 0' : '18px 22px 0', position: 'sticky', top: 52, zIndex: 30 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
        {isDashboard ? <div aria-hidden="true" /> : (
          <div style={{ maxWidth: 660 }}>
            <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: T.TEXT_MUTED }}>{crumb}</div>
            <div style={{ fontSize: 23, fontWeight: 600, letterSpacing: '-.02em', marginTop: 8, lineHeight: 1.2 }}>{pageTitle}</div>
            <div style={{ fontSize: 14.5, color: T.TEXT_SECONDARY, marginTop: 7, lineHeight: 1.5 }}>{pageSub}</div>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'stretch', gap: 8, paddingBottom: phone ? 12 : 16, marginLeft: isDashboard ? 'auto' : undefined, maxWidth: '100%', overflowX: phone ? 'auto' : undefined }}>
          {actions.map(([label, primary, dest], i) => (
            <motion.div
              key={i}
              whileTap={TAP}
              transition={TAP_FAST}
              onClick={() => { if (dest) nav(dest); }}
              className={primary ? '' : 'nxc-btn'}
              style={{ height: 34, padding: '0 13px', borderRadius: 7, border: `1px solid ${primary ? T.NAVY : T.INPUT_BORDER}`, background: primary ? T.NAVY : T.SURFACE, color: primary ? '#fff' : T.TEXT, display: 'flex', alignItems: 'center', fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}
            >
              {label}
            </motion.div>
          ))}
          {isDashboard && (
            <>
              <KpiDropdown mobile={mobile} />
              <FilterDropdown
                label="Last 30 days"
                options={['Today', 'Last 7 days', 'Last 30 days', 'Last 90 days', 'Custom range']}
                className="nxc-btn"
                align="right"
                style={{ height: 32, padding: '0 12px', borderRadius: 7, border: `1px solid ${T.INPUT_BORDER}`, background: T.SURFACE, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12.5, color: T.TEXT_LABEL }}
              />
            </>
          )}
          <motion.div
            whileTap={TAP}
            transition={TAP_FAST}
            onClick={() => setPaletteOpen(true)}
            style={{ height: 32, padding: '0 13px', borderRadius: 7, background: T.NAVY, color: '#fff', display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer', fontSize: 13, fontWeight: 600, boxShadow: '0 6px 16px rgba(15,31,61,.22)' }}
          >
            Ship now
            <div style={{ fontFamily: T.MONO, fontSize: 10, border: '1px solid rgba(255,255,255,.28)', borderRadius: 4, padding: '1px 4px' }}>S</div>
          </motion.div>
        </div>
      </div>
      <style jsx>{`
        .nxc-btn { transition: background 100ms ease-out, border-color 100ms ease-out; }
        .nxc-btn:hover { background: var(--nx-surface-soft); border-color: var(--nx-menu-border); }
      `}</style>
    </div>
  );
}
