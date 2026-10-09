'use client';

import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { PALETTE_GROUPS } from '@/lib/data';
import { useAppState } from '@/lib/AppStateContext';
import { useReducedTransparency } from '@/lib/useReducedTransparency';
import * as T from '@/lib/theme';

const PANEL_SPRING = { type: 'spring', bounce: 0, duration: 0.28 };
const TAP = { scale: 0.985 };

export default function CommandPalette() {
  const { paletteOpen, setPaletteOpen } = useAppState();
  const reduced = useReducedMotion();
  const reducedTransparency = useReducedTransparency();

  return (
    <AnimatePresence>
      {paletteOpen && (
        <motion.div
          onClick={() => setPaletteOpen(false)}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduced ? 0.12 : 0.16 }}
          style={{
            position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 96,
            background: reducedTransparency ? 'rgba(20,19,16,.82)' : 'rgba(23,22,19,.46)',
            backdropFilter: reducedTransparency ? 'none' : 'blur(8px)',
          }}
        >
          <motion.div
            onClick={(e) => e.stopPropagation()}
            initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: -10 }}
            animate={reduced ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: -6 }}
            transition={reduced ? { duration: 0.12 } : PANEL_SPRING}
            style={{ width: 'min(680px,92vw)', background: T.SURFACE, border: `1px solid ${T.MENU_BORDER}`, boxShadow: '0 30px 80px rgba(23,22,19,.34)', transformOrigin: 'top center' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderBottom: `1px solid ${T.DIVIDER}` }}>
              <div style={{ fontFamily: T.MONO, fontSize: 11, fontWeight: 600, color: '#0b5566' }}>&gt;</div>
              <div style={{ flex: 1, fontSize: 15 }}>ship<span style={{ opacity: .35 }}>|</span></div>
              <div style={{ fontFamily: T.MONO, fontSize: 10, color: T.TEXT_MUTED, border: `1px solid ${T.INPUT_BORDER}`, padding: '2px 5px' }}>ESC</div>
            </div>
            <div style={{ maxHeight: 400, overflowY: 'auto' }}>
              {PALETTE_GROUPS.map((g) => (
                <div key={g.label}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: T.TEXT_MUTED, padding: '8px 16px 6px', background: T.SURFACE_SOFT, borderBottom: `1px solid ${T.DIVIDER}` }}>{g.label}</div>
                  {g.items.map((it, i) => (
                    <motion.div
                      key={i}
                      whileTap={TAP}
                      transition={{ duration: 0.08 }}
                      className="nxc-palette-row"
                      style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '0 16px', height: 46, borderBottom: `1px solid ${T.ROW_DIVIDER}`, cursor: 'pointer' }}
                    >
                      <div style={{ width: 22, height: 22, flex: '0 0 22px', border: '1.5px solid #5C5849', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: T.MONO, fontSize: 10, fontWeight: 600, color: '#5C5849' }}>{it.glyph}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>{it.label}</div>
                        <div style={{ fontSize: 12, color: T.TEXT_MUTED, marginTop: 1 }}>{it.sub}</div>
                      </div>
                      <div style={{ fontFamily: T.MONO, fontSize: 10, color: T.TEXT_SECONDARY, border: `1px solid ${T.INPUT_BORDER}`, padding: '2px 5px' }}>{it.key}</div>
                    </motion.div>
                  ))}
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '9px 16px', background: T.SURFACE_SOFT, borderTop: `1px solid ${T.DIVIDER}`, fontFamily: T.MONO, fontSize: 10, color: T.TEXT_MUTED }}>
              <div>UP/DOWN NAVIGATE</div><div>ENTER RUN</div><div>TAB FILTER</div><div style={{ marginLeft: 'auto' }}>7 OF 41 RESULTS</div>
            </div>
          </motion.div>
          <style jsx>{`
            .nxc-palette-row { background: var(--nx-surface); transition: background 100ms ease-out; }
            .nxc-palette-row:hover { background: var(--nx-surface-soft); }
          `}</style>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
