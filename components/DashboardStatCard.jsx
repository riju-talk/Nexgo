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

      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10, marginTop: 13 }}>
        <div style={{ fontVariantNumeric: 'tabular-nums', fontSize: 28, fontWeight: 650, letterSpacing: '-.025em', lineHeight: .9, color: T.TEXT }}>{card.value}</div>
        <div style={{ position: 'relative', width: 68, height: 26, flex: '0 0 68px' }}>
          <div style={{ position: 'absolute', inset: '-4px -2px', background: `${card.sparkColor}14`, borderRadius: 8 }} />
          <svg viewBox="0 0 72 26" preserveAspectRatio="none" style={{ position: 'relative', width: '100%', height: '100%', display: 'block' }}>
            <path d={card.sparkPath} fill="none" stroke={card.sparkColor} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
        <div style={{
          fontVariantNumeric: 'tabular-nums', fontSize: 12, fontWeight: 700, color: card.deltaColor,
          background: `${card.deltaColor}17`, padding: '2px 7px', borderRadius: 20,
        }}>{card.delta}</div>
        <div style={{ fontSize: 12, color: T.TEXT_MUTED }}>{card.sub}</div>
      </div>
    </motion.div>
  );
}
