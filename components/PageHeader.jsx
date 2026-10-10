'use client';

import { motion } from 'motion/react';
import { ACTIONS } from '@/lib/data';
import { useAppState } from '@/lib/AppStateContext';
import * as T from '@/lib/theme';
import KpiDropdown from './KpiDropdown';
import FilterDropdown from './FilterDropdown';

const DASH_RANGES = [[1, 'Today'], [7, 'Last 7 days'], [30, 'Last 30 days'], [90, 'Last 90 days']];
const TAP = { scale: 0.96 };
const TAP_FAST = { duration: 0.08 };

export default function PageHeader({ activeId, isDashboard, mobile, phone }) {
  const { nav, dashDays, setDashDays } = useAppState();
  const actions = (ACTIONS[activeId] || []).filter(([, , dest]) => dest); // buttons without a destination had no handler
  // The page name is already in the top bar, so a page with nothing to act on needs no header at all.
  if (!isDashboard && !actions.length) return null;

  return (
    <div style={{ background: 'var(--nx-chrome-bg)', borderBottom: `1px solid ${T.BORDER}`, boxShadow: '0 4px 18px rgba(15,31,61,.045)', padding: isDashboard ? (phone ? '15px 12px 12px' : mobile ? '20px 16px 14px' : '22px 28px 16px') : (phone ? '9px 12px' : '10px 28px'), position: 'sticky', top: 68, zIndex: 30 }}>
      <div style={{ height: 2, position: 'absolute', top: 0, left: 0, right: 0, background: '#1b9fd6' }} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 28, flexWrap: 'wrap', width: '100%', maxWidth: 1320, margin: '0 auto' }}>
        <div aria-hidden="true" />
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
                value={DASH_RANGES.find(([d]) => d === dashDays)?.[1]}
                onSelect={(l) => setDashDays(DASH_RANGES.find(([, name]) => name === l)[0])}
                options={DASH_RANGES.map(([, l]) => l)}
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
