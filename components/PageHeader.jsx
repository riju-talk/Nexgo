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
  const { nav } = useAppState();
  const meta = PAGES[activeId] || ['', '', ''];
  const [crumb, pageTitle, pageSub] = meta;
  const isAdmin = activeId.indexOf('a-') === 0;
  const actions = (ACTIONS[activeId] || []).filter(([, , dest]) => dest); // buttons without a destination had no handler

  return (
    <div style={{ background: 'var(--nx-chrome-bg)', borderBottom: `1px solid ${T.BORDER}`, boxShadow: '0 4px 18px rgba(15,31,61,.045)', padding: phone ? '15px 12px 12px' : mobile ? '20px 16px 14px' : '22px 28px 16px', position: 'sticky', top: 68, zIndex: 30 }}>
      <div style={{ height: 2, position: 'absolute', top: 0, left: 0, right: 0, background: 'linear-gradient(90deg, var(--nx-side-bg) 0%, var(--nx-side-bg) 34%, var(--nx-accent, #00D7C3) 100%)' }} />
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 28, flexWrap: 'wrap', width: '100%', maxWidth: 1320, margin: '0 auto' }}>
        {isDashboard ? <div aria-hidden="true" /> : (
          <div style={{ maxWidth: 660 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '4px 8px', borderRadius: 6, background: 'var(--nx-surface-soft)', border: `1px solid ${T.DIVIDER}`, fontSize: 10.5, fontWeight: 800, letterSpacing: '.11em', textTransform: 'uppercase', color: T.TEXT_MUTED }}>
              <span style={{ width: 5, height: 5, borderRadius: 99, background: T.ACCENT }} />
              {crumb}
            </div>
            <div style={{ fontSize: mobile ? 24 : 29, fontWeight: 760, letterSpacing: '-.035em', marginTop: 10, lineHeight: 1.08, color: T.TEXT }}>{pageTitle}</div>
            <div style={{ fontSize: 14, color: T.TEXT_SECONDARY, marginTop: 8, lineHeight: 1.5 }}>{pageSub}</div>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'stretch', gap: 8, paddingBottom: phone ? 4 : 2, marginLeft: isDashboard ? 'auto' : undefined, maxWidth: '100%', overflowX: phone ? 'auto' : undefined }}>
          {actions.map(([label, primary, dest], i) => (
            <motion.div
              key={i}
              whileTap={TAP}
              transition={TAP_FAST}
              onClick={() => { if (dest) nav(dest); }}
              className={primary ? '' : 'nxc-btn'}
              style={{ height: 38, padding: '0 14px', borderRadius: 8, border: `1px solid ${primary ? T.NAVY : T.INPUT_BORDER}`, background: primary ? T.NAVY : T.SURFACE, color: primary ? '#fff' : T.TEXT, display: 'flex', alignItems: 'center', fontSize: 13, fontWeight: 700, cursor: 'pointer', boxShadow: primary ? '0 5px 14px rgba(15,31,61,.16)' : '0 1px 2px rgba(15,31,61,.04)' }}
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
        </div>
      </div>
      <style jsx>{`
        .nxc-btn { transition: background 100ms ease-out, border-color 100ms ease-out; }
        .nxc-btn:hover { background: var(--nx-surface-soft); border-color: var(--nx-menu-border); }
      `}</style>
    </div>
  );
}
