'use client';

// Drag-to-dismiss trailing sheet, built per apple-design's fluid-interface
// rules: 1:1 tracking via a drag handle, rubber-band resistance past the
// open position, velocity handed off to the exit spring so a fast flick
// keeps its momentum, and it dismisses the same edge it entered from.

import { useRef, useState } from 'react';
import { motion, AnimatePresence, useDragControls, useReducedMotion } from 'motion/react';
import { RESOLUTIONS, DRAWER_SCANS } from '@/lib/data';
import { useAppState } from '@/lib/AppStateContext';
import { useReducedTransparency } from '@/lib/useReducedTransparency';
import * as T from '@/lib/theme';

const OPEN_SPRING = { type: 'spring', bounce: 0, duration: 0.36 };
const TAP = { scale: 0.96 };
const TAP_TRANSITION = { duration: 0.1 };

export default function NdrDrawer() {
  const { drawerOpen, setDrawerOpen, resolution, setResolution } = useAppState();
  const reduced = useReducedMotion();
  const reducedTransparency = useReducedTransparency();
  const dragControls = useDragControls();
  const [closeVelocity, setCloseVelocity] = useState(0);
  const panelRef = useRef(null);

  const close = () => { setCloseVelocity(0); setDrawerOpen(false); };

  const handleDragEnd = (_e, info) => {
    const width = panelRef.current ? panelRef.current.offsetWidth : 520;
    const commit = info.offset.x > width * 0.28 || info.velocity.x > 650;
    if (commit) {
      setCloseVelocity(info.velocity.x);
      setDrawerOpen(false);
    }
    // otherwise: dragConstraints + dragElastic spring it back to open on their own
  };

  const exitTransition = reduced
    ? { duration: 0.15 }
    : { type: 'spring', velocity: closeVelocity, bounce: closeVelocity > 400 ? 0.16 : 0, duration: 0.36 };

  return (
    <AnimatePresence>
      {drawerOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 80, display: 'flex', justifyContent: 'flex-end' }}>
          <motion.div
            onClick={close}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={reduced ? { duration: 0.15 } : OPEN_SPRING}
            style={{
              position: 'absolute', inset: 0,
              background: reducedTransparency ? 'rgba(13,16,14,.86)' : 'rgba(15,23,20,.38)',
              backdropFilter: reducedTransparency ? 'none' : 'blur(6px)',
            }}
          />
          <motion.div
            ref={panelRef}
            drag={reduced ? false : 'x'}
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={{ left: 0, right: 0.55 }}
            onDragEnd={handleDragEnd}
            initial={reduced ? { opacity: 0 } : { x: '100%' }}
            animate={reduced ? { opacity: 1 } : { x: 0 }}
            exit={reduced ? { opacity: 0 } : { x: '100%' }}
            transition={exitTransition}
            style={{
              position: 'relative', width: 'min(520px,94vw)', background: T.PANEL,
              borderLeft: `1px solid ${T.MENU_BORDER}`, boxShadow: '-24px 0 60px rgba(23,22,19,.2)',
              display: 'flex', flexDirection: 'column', touchAction: 'pan-y',
            }}
          >
            <div
              onPointerDown={(e) => { if (!reduced) dragControls.start(e); }}
              style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 16, cursor: reduced ? 'default' : 'grab', display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'none' }}
            >
              <div style={{ width: 3, height: 44, borderRadius: 2, background: 'rgba(60,55,45,.18)' }} />
            </div>

            <div style={{ padding: '16px 20px 16px 30px', borderBottom: `1px solid ${T.BORDER}`, background: T.SURFACE, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
              <div>
                <div style={{ fontFamily: T.MONO, fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: T.TEXT_FAINT }}>NDR · attempt 2 of 3</div>
                <div style={{ fontFamily: T.MONO, fontSize: 19, fontWeight: 500, letterSpacing: '-.02em', marginTop: 7 }}>2839471056283</div>
                <div style={{ fontSize: 12, color: T.TEXT_MUTED, marginTop: 5 }}>Rohit Menon · Bengaluru 560102 · COD ₹2,480</div>
              </div>
              <motion.div whileHover={{ background: 'var(--nx-surface-soft)' }} whileTap={TAP} transition={TAP_TRANSITION} onClick={close} style={{ width: 28, height: 28, flex: '0 0 28px', borderRadius: 8, border: `1px solid ${T.INPUT_BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: T.TEXT_SECONDARY, cursor: 'pointer' }}>✕</motion.div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '18px 20px 22px 30px' }}>
              <div style={{ background: '#FDF6E6', border: '1px solid #E5D3A8', borderRadius: 10, padding: '13px 15px' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#6B5416' }}>Courier reason: customer unavailable</div>
                <div style={{ fontSize: 11.5, color: '#6B5416', marginTop: 6, lineHeight: 1.6 }}>Ecom Express attempted delivery at 13:22 today. Auto-reattempt stops after 24 hours, then the shipment converts to RTO.</div>
              </div>
              <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: T.TEXT_FAINT, marginTop: 20 }}>Choose a resolution</div>
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {RESOLUTIONS.map(([label, cost, sub], i) => {
                  const on = resolution === i;
                  return (
                    <motion.div
                      key={i}
                      whileHover={on ? {} : { y: -1, boxShadow: '0 1px 1px rgba(15,23,20,.05), 0 6px 14px rgba(15,23,20,.08)' }}
                      whileTap={TAP}
                      transition={TAP_TRANSITION}
                      onClick={() => setResolution(i)}
                      style={{ borderRadius: 10, border: `1px solid ${on ? T.ACCENT : T.BORDER}`, background: on ? 'rgba(6,182,212,.12)' : T.SURFACE, padding: '12px 14px', cursor: 'pointer' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 14, height: 14, borderRadius: '50%', border: `1.5px solid ${on ? T.ACCENT : T.MENU_BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <div style={{ width: 7, height: 7, borderRadius: '50%', background: on ? T.ACCENT : 'transparent' }} />
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{label}</div>
                        <div style={{ marginLeft: 'auto', fontFamily: T.MONO, fontSize: 11, color: T.TEXT_SECONDARY }}>{cost}</div>
                      </div>
                      <div style={{ fontSize: 12, color: T.TEXT_MUTED, marginTop: 7, paddingLeft: 24, lineHeight: 1.55 }}>{sub}</div>
                    </motion.div>
                  );
                })}
              </div>
              <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: T.TEXT_FAINT, marginTop: 20 }}>Last scans</div>
              <div style={{ marginTop: 8, borderRadius: 10, border: `1px solid ${T.BORDER}`, background: T.SURFACE, overflow: 'hidden' }}>
                {DRAWER_SCANS.map((t, i) => (
                  <div key={i} style={{ display: 'flex', gap: 14, padding: '10px 13px', borderBottom: i < DRAWER_SCANS.length - 1 ? `1px solid ${T.ROW_DIVIDER}` : 'none' }}>
                    <div style={{ fontFamily: T.MONO, fontSize: 10, color: T.TEXT_FAINT, flex: '0 0 90px' }}>{t.time}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 500 }}>{t.title}</div>
                      <div style={{ fontSize: 12, color: T.TEXT_MUTED, marginTop: 2 }}>{t.place}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ padding: '13px 20px 13px 30px', borderTop: `1px solid ${T.BORDER}`, background: T.SURFACE, display: 'flex', alignItems: 'center', gap: 9 }}>
              <motion.div whileHover={{ background: 'var(--nx-surface-soft)' }} whileTap={TAP} transition={TAP_TRANSITION} onClick={close} style={{ height: 36, padding: '0 14px', borderRadius: 8, border: `1px solid ${T.INPUT_BORDER}`, display: 'flex', alignItems: 'center', fontSize: 12.5, cursor: 'pointer' }}>Cancel</motion.div>
              <div style={{ fontFamily: T.MONO, fontSize: 10, color: T.TEXT_FAINT, marginLeft: 6 }}>ENTER TO SUBMIT</div>
              <div style={{ flex: 1 }} />
              <motion.div whileTap={TAP} transition={TAP_TRANSITION} onClick={close} style={{ height: 36, padding: '0 16px', borderRadius: 8, background: T.ACCENT, color: '#06272B', display: 'flex', alignItems: 'center', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', boxShadow: '0 6px 16px rgba(6,182,212,.32)' }}>Submit resolution</motion.div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
