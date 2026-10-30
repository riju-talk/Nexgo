'use client';

import { useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useAppState } from '@/lib/AppStateContext';

export default function Toast() {
  const { toast, clearToast } = useAppState();

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(clearToast, 3600);
    return () => window.clearTimeout(timer);
  }, [toast, clearToast]);

  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          key={toast.id}
          initial={{ opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.98 }}
          transition={{ type: 'spring', bounce: 0, duration: 0.32 }}
          role="status"
          onClick={clearToast}
          style={{
            position: 'fixed', right: 22, bottom: 22, zIndex: 100,
            display: 'flex', alignItems: 'center', gap: 10, maxWidth: 360,
            padding: '12px 14px', borderRadius: 12, cursor: 'pointer',
            color: '#F5FFFC', background: toast.tone === 'error' ? '#7A1F1F' : '#123D38',
            border: toast.tone === 'error' ? '1px solid rgba(255,140,140,.45)' : '1px solid rgba(94,218,196,.36)',
            boxShadow: '0 14px 34px rgba(0,0,0,.28)',
            fontSize: 13, fontWeight: 600,
          }}
        >
          <span style={{ width: 8, height: 8, borderRadius: 8, background: toast.tone === 'error' ? '#FF8C8C' : '#55D4C1', boxShadow: '0 0 0 4px rgba(255,255,255,.1)' }} />
          <span style={{ lineHeight: 1.35 }}>{toast.message}</span>
          <span aria-hidden="true" style={{ color: 'rgba(245,255,252,.6)', marginLeft: 4 }}>×</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
