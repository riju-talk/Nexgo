'use client';

import { motion } from 'motion/react';
import * as T from '@/lib/theme';

export default function DashboardStatCard({ card, hidden, onOpen }) {
  return (
    <motion.div
      layoutId={`kpi-card-${card.id}`}
      onClick={() => onOpen(card.id)}
      whileHover={{
        y: -4,
        boxShadow: `0 1px 1px rgba(15,23,20,.06), 0 12px 24px rgba(15,23,20,.14), 0 3px 10px ${card.sparkColor}33`,
      }}
      whileTap={{ scale: 0.972 }}
      transition={{ type: 'spring', bounce: 0, duration: 0.32 }}
      style={{
        position: 'relative',
        opacity: hidden ? 0 : 1,
        overflow: 'hidden',
        background: 'var(--nx-surface)',
        border: '1px solid var(--nx-glass-border)',
        borderRadius: 10,
        padding: '17px 19px 18px',
        cursor: 'pointer',
        boxShadow: '0 2px 8px rgba(15,31,61,.05)',
      }}
    >
      <div style={{ position: 'absolute', top: 0, left: 14, right: 14, height: 1, background: 'var(--nx-glass-border)' }} />
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: card.sparkColor, opacity: 0.85 }} />

      <div style={{ fontSize: 11.5, fontWeight: 750, letterSpacing: '.1em', textTransform: 'uppercase', color: T.TEXT_MUTED }}>{card.label}</div>

      <div style={{ marginTop: 13 }}>
        <div style={{ fontVariantNumeric: 'tabular-nums', fontSize: 28, fontWeight: 650, letterSpacing: '-.025em', lineHeight: 1, color: T.TEXT }}>{card.value}</div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        <div style={{
          fontVariantNumeric: 'tabular-nums', fontSize: 12, fontWeight: 700, color: card.deltaColor,
          background: `${card.deltaColor}17`, padding: '2px 7px', borderRadius: 20, whiteSpace: 'nowrap', flex: '0 0 auto',
        }}>{card.delta}</div>
        <div style={{ fontSize: 12, color: T.TEXT_MUTED }}>{card.sub}</div>
      </div>
    </motion.div>
  );
}
