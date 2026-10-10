'use client';

import * as T from '@/lib/theme';

// Vertical bar chart (columns). `items` = [{ label, value, hint? }]. Solid colour only.
export default function BarChartV({ items, color = T.ACCENT, height = 170, format = (v) => String(v), empty = 'No data for this period.' }) {
  if (!items.length) return <div style={{ padding: '26px 18px', fontSize: 12.5, color: T.TEXT_MUTED }}>{empty}</div>;
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div style={{ padding: '16px 18px 14px', overflowX: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, height, minWidth: items.length * 54, borderBottom: `1px solid ${T.DIVIDER}` }}>
        {items.map((i) => (
          <div key={i.label} title={i.hint || `${i.label}: ${format(i.value)}`} style={{ flex: 1, minWidth: 40, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center' }}>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: T.TEXT, marginBottom: 4 }}>{format(i.value)}</span>
            <div style={{ width: '62%', maxWidth: 34, height: `${Math.max(3, (i.value / max) * 100 * 0.82)}%`, background: color, borderRadius: '5px 5px 0 0' }} />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 12, minWidth: items.length * 54, marginTop: 7 }}>
        {items.map((i) => <div key={i.label} style={{ flex: 1, minWidth: 40, textAlign: 'center', fontSize: 11, lineHeight: 1.25, color: T.TEXT_SECONDARY, wordBreak: 'break-word' }}>{i.label}</div>)}
      </div>
    </div>
  );
}
