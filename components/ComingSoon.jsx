'use client';

import { useAppState } from '@/lib/AppStateContext';
import * as T from '@/lib/theme';

// Phase-2 placeholder: a blurred skeleton of the eventual screen under a clear label,
// so the menu item is visible without any half-working behaviour behind it.
const CARD = { background: 'var(--nx-surface)', border: '1px solid var(--nx-border)', borderRadius: 10, boxShadow: '0 1px 2px rgba(20,44,66,.04), 0 8px 24px rgba(20,44,66,.045)' };

export default function ComingSoon({ name, blurb, mobile }) {
  const { nav } = useAppState();
  return (
    <div style={{ padding: mobile ? '14px 12px 42px' : '18px 22px 48px', position: 'relative', maxWidth: 1100 }}>
      <div aria-hidden="true" style={{ filter: 'blur(5px)', opacity: 0.55, pointerEvents: 'none', userSelect: 'none', display: 'grid', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : 'repeat(4,1fr)', gap: 12 }}>
          {[0, 1, 2, 3].map((i) => <div key={i} style={{ ...CARD, height: 84 }} />)}
        </div>
        <div style={{ ...CARD, padding: 16, display: 'grid', gap: 12 }}>
          {[0, 1, 2, 3, 4].map((i) => <div key={i} style={{ height: 30, borderRadius: 8, background: T.SURFACE_SOFT }} />)}
        </div>
      </div>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'start center', paddingTop: mobile ? 70 : 90 }}>
        <div style={{ ...CARD, padding: '26px 30px', textAlign: 'center', maxWidth: 400, boxShadow: '0 18px 44px rgba(15,31,61,.14)' }}>
          <div style={{ display: 'inline-flex', padding: '4px 10px', borderRadius: 99, fontSize: 11, fontWeight: 800, letterSpacing: '.07em', textTransform: 'uppercase', color: T.ACCENT, background: 'rgba(0,215,195,.12)' }}>Phase 2</div>
          <div style={{ marginTop: 12, color: T.TEXT, fontSize: 18, fontWeight: 760 }}>{name} is coming soon</div>
          <p style={{ margin: '8px 0 18px', color: T.TEXT_SECONDARY, fontSize: 13.5, lineHeight: 1.55 }}>{blurb}</p>
          <button onClick={() => nav('orders')} style={{ height: 34, padding: '0 14px', borderRadius: 8, border: `1px solid ${T.NAVY}`, background: T.NAVY, color: '#fff', fontWeight: 720, fontSize: 12.5, cursor: 'pointer' }}>Back to all orders</button>
        </div>
      </div>
    </div>
  );
}
