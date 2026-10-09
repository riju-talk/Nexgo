'use client';

import { useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import * as T from '@/lib/theme';

const TAP = { scale: 0.97 };

export default function FilterDropdown({ label, options, className, style, align = 'left' }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(label || options[0]);
  const reduced = useReducedMotion();

  return (
    <div style={{ position: 'relative' }}>
      <motion.div
        whileTap={TAP}
        transition={{ duration: 0.08 }}
        onClick={() => setOpen((o) => !o)}
        className={className}
        style={style}
      >
        {selected} <span style={{ fontSize: 10, color: T.TEXT_FAINT, marginLeft: 2 }}>▾</span>
      </motion.div>
      <AnimatePresence>
        {open && (
          <>
            <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 59 }} />
            <motion.div
              initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: -6 }}
              animate={reduced ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: -4 }}
              transition={reduced ? { duration: 0.1 } : { type: 'spring', bounce: 0, duration: 0.22 }}
              style={{
                position: 'absolute', top: '110%', [align]: 0, minWidth: 190,
                background: T.SURFACE, border: `1px solid ${T.MENU_BORDER}`, borderRadius: 10,
                boxShadow: '0 16px 40px rgba(23,22,19,.18)', zIndex: 60, overflow: 'hidden',
                transformOrigin: align === 'right' ? 'top right' : 'top left',
              }}
            >
              {options.map((opt) => {
                const on = opt === selected;
                return (
                  <div
                    key={opt}
                    onClick={() => { setSelected(opt); setOpen(false); }}
                    className="nxc-filter-opt"
                    style={{ padding: '9px 13px', fontSize: 13, cursor: 'pointer', color: on ? '#0b5566' : T.TEXT, fontWeight: on ? 600 : 500, background: on ? 'rgba(6,182,212,.08)' : 'transparent', whiteSpace: 'nowrap' }}
                  >
                    {opt}
                  </div>
                );
              })}
            </motion.div>
          </>
        )}
      </AnimatePresence>
      <style jsx>{`
        .nxc-filter-opt:hover { background: var(--nx-surface-soft); }
      `}</style>
    </div>
  );
}
