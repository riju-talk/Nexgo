'use client';

import { useAppState } from '@/lib/AppStateContext';
import * as T from '@/lib/theme';
import LiveCreateOrder from './LiveCreateOrder';
import LiveBulkOrderImport from './LiveBulkOrderImport';

// One "Create order" screen with Single order / Bulk upload tabs. Each tab is
// its own route (b2c, bulk-orders) so links and the back button keep working.
const TABS = [['single', 'Single order', 'b2c'], ['bulk', 'Bulk upload', 'bulk-orders']];

export default function CreateOrder({ tab, mobile }) {
  const { nav } = useAppState();
  return (
    <div style={{ padding: mobile ? '14px 12px 42px' : '18px 22px 48px' }}>
      <div role="tablist" style={{ display: 'inline-flex', gap: 4, padding: 4, marginBottom: 16, borderRadius: 11, border: `1px solid ${T.BORDER}`, background: T.SURFACE_SOFT }}>
        {TABS.map(([key, label, screen]) => {
          const on = key === tab;
          return (
            <button key={key} role="tab" aria-selected={on} onClick={() => !on && nav(screen)} style={{ height: 34, padding: '0 16px', border: 0, borderRadius: 8, fontSize: 13, fontWeight: on ? 750 : 600, cursor: on ? 'default' : 'pointer', color: on ? '#fff' : T.TEXT_SECONDARY, background: on ? T.NAVY : 'transparent' }}>
              {label}
            </button>
          );
        })}
      </div>
      {tab === 'bulk' ? <LiveBulkOrderImport mobile={mobile} embedded /> : <LiveCreateOrder mobile={mobile} flow="forward" embedded />}
    </div>
  );
}
