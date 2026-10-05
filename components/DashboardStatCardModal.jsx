'use client';

import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { spark } from '@/lib/charts';
import { useReducedTransparency } from '@/lib/useReducedTransparency';
import * as T from '@/lib/theme';

export default function DashboardStatCardModal({ card, onClose }) {
  const reduced = useReducedMotion();
  const reducedTransparency = useReducedTransparency();
  const bigPath = card ? spark(card.seed) : '';

  return (
    <AnimatePresence>
      {card && (
        <>
          <motion.div
            key="scrim"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduced ? 0.12 : 0.2 }}
            style={{
              position: 'fixed', inset: 0, zIndex: 120,
              background: reducedTransparency ? 'rgba(13,16,14,.86)' : 'rgba(15,23,20,.42)',
              backdropFilter: reducedTransparency ? 'none' : 'blur(6px)',
            }}
          />
          <div style={{ position: 'fixed', inset: 0, zIndex: 121, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, pointerEvents: 'none' }}>
            <motion.div
              layoutId={`kpi-card-${card.id}`}
              transition={{ type: 'spring', bounce: 0, duration: reduced ? 0.15 : 0.38 }}
              style={{
                position: 'relative', pointerEvents: 'auto', overflow: 'hidden',
                width: 'min(560px,90vw)',
                background: 'var(--nx-surface)',
                border: `1px solid ${T.BORDER}`,
                borderRadius: 12,
                padding: '32px 34px 34px',
                boxShadow: `0 1px 1px rgba(15,23,20,.05), 0 30px 70px rgba(15,23,20,.28), 0 8px 20px ${card.sparkColor}22`,
              }}
            >
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: card.sparkColor, opacity: 0.85 }} />

              <motion.div
                whileTap={{ scale: 0.94 }}
                transition={{ duration: 0.1 }}
                onClick={onClose}
                style={{ position: 'absolute', top: 20, right: 20, width: 28, height: 28, border: `1px solid ${T.INPUT_BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: T.TEXT_SECONDARY, cursor: 'pointer', borderRadius: 8, background: T.SURFACE }}
              >✕</motion.div>

              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: T.TEXT_MUTED }}>{card.label}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginTop: 10 }}>
                <div style={{ fontVariantNumeric: 'tabular-nums', fontSize: 46, fontWeight: 650, letterSpacing: '-.025em', color: T.TEXT }}>{card.value}</div>
                <div style={{
                  fontVariantNumeric: 'tabular-nums', fontSize: 13, fontWeight: 700, color: card.deltaColor,
                  background: `${card.deltaColor}17`, padding: '3px 9px', borderRadius: 20,
                }}>{card.delta}</div>
              </div>
              <div style={{ fontSize: 13, color: T.TEXT_MUTED, marginTop: 6 }}>{card.sub}</div>

              <svg viewBox="0 0 72 26" preserveAspectRatio="none" style={{ width: '100%', height: 140, display: 'block', marginTop: 24, borderRadius: 10, overflow: 'hidden' }}>
                <path d={`${bigPath} L72 26 L0 26 Z`} fill={card.sparkColor} opacity="0.12" />
                <path d={bigPath} fill="none" stroke={card.sparkColor} strokeWidth="0.6" vectorEffect="non-scaling-stroke" />
              </svg>

              <div style={{ display: 'flex', gap: 8, marginTop: 26 }}>
                <div style={{ height: 38, padding: '0 18px', background: T.NAVY, color: '#fff', display: 'flex', alignItems: 'center', fontSize: 13, fontWeight: 600, cursor: 'pointer', borderRadius: 8, boxShadow: '0 6px 16px rgba(15,31,61,.28)' }}>Export</div>
                <div onClick={onClose} style={{ height: 38, padding: '0 18px', border: `1px solid ${T.INPUT_BORDER}`, background: T.SURFACE, display: 'flex', alignItems: 'center', fontSize: 13, cursor: 'pointer', borderRadius: 8 }}>Close</div>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
