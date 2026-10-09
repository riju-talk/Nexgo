'use client';

import { useRef, useState } from 'react';
import { motion } from 'motion/react';
import { line } from '@/lib/charts';
import * as T from '@/lib/theme';

const W = 720, H = 200;

function dateAt(i) {
  const d = new Date(2026, 7, 5);
  d.setDate(d.getDate() + i);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }).toUpperCase();
}

export default function TrendChart({ seriesA, seriesB, labelA = 'ORDERS', labelB = 'DELIVERED' }) {
  const hostRef = useRef(null);
  const [hover, setHover] = useState(null); // { i, x }

  const n = seriesA.length;
  const MAX = Math.max(1, ...seriesA, ...seriesB) * 1.15;
  const xAt = (i) => (i / (n - 1)) * W;
  const yAt = (v) => H - 2 - (v / MAX) * (H - 6);

  const onMove = (e) => {
    const rect = hostRef.current.getBoundingClientRect();
    const relX = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    const i = Math.round(relX * (n - 1));
    setHover({ i, x: xAt(i) });
  };

  const tipLeftPct = hover ? (hover.x / W) * 100 : 0;
  const tipSide = hover && tipLeftPct > 62 ? 'right' : 'left';

  return (
    <div
      ref={hostRef}
      onMouseMove={onMove}
      onMouseLeave={() => setHover(null)}
      style={{ position: 'relative' }}
    >
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: 196, display: 'block', overflow: 'visible' }}>
        <line x1="0" y1="2" x2={W} y2="2" stroke={T.DIVIDER} strokeWidth="1" />
        <line x1="0" y1="67" x2={W} y2="67" stroke={T.DIVIDER} strokeWidth="1" />
        <line x1="0" y1="132" x2={W} y2="132" stroke={T.DIVIDER} strokeWidth="1" />
        <line x1="0" y1={H - 2} x2={W} y2={H - 2} stroke={T.INPUT_BORDER} strokeWidth="1" />
        <path d={line(seriesB, true)} fill="rgba(6,182,212,.10)" />
        <motion.path
          d={line(seriesA, false)} fill="none" stroke={T.NAVY} strokeWidth="1.75"
          initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.9, ease: 'easeOut' }}
        />
        <motion.path
          d={line(seriesB, false)} fill="none" stroke={T.ACCENT} strokeWidth="1.75"
          initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.9, ease: 'easeOut', delay: 0.08 }}
        />
        {hover && (
          <g style={{ pointerEvents: 'none' }}>
            <line x1={hover.x} y1="0" x2={hover.x} y2={H - 2} stroke="#A8A395" strokeWidth="1" strokeDasharray="3 3" />
            <circle cx={hover.x} cy={yAt(seriesA[hover.i])} r="4" fill={T.NAVY} stroke="#fff" strokeWidth="1.5" />
            <circle cx={hover.x} cy={yAt(seriesB[hover.i])} r="4" fill={T.ACCENT} stroke="#fff" strokeWidth="1.5" />
          </g>
        )}
      </svg>
      {hover && (
        <div
          style={{
            position: 'absolute', top: 4, [tipSide]: tipSide === 'right' ? `${100 - tipLeftPct}%` : `${tipLeftPct}%`,
            transform: tipSide === 'right' ? 'translateX(10px)' : 'translateX(-10px) translateX(-100%)',
            background: '#171613', color: '#fff', borderRadius: 8, padding: '8px 11px',
            fontSize: 11.5, whiteSpace: 'nowrap', boxShadow: '0 10px 24px rgba(23,22,19,.28)', zIndex: 5,
          }}
        >
          <div style={{ fontFamily: T.MONO, fontSize: 10, color: '#C9C3B6', marginBottom: 4 }}>{dateAt(hover.i)}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><div style={{ width: 7, height: 7, borderRadius: 4, background: '#C6D2E6' }} />{labelA} <b style={{ marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>{Math.round(seriesA[hover.i])}</b></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}><div style={{ width: 7, height: 7, borderRadius: 4, background: T.ACCENT }} />{labelB} <b style={{ marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>{Math.round(seriesB[hover.i])}</b></div>
        </div>
      )}
    </div>
  );
}

function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
