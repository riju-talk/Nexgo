'use client';

import { motion } from 'motion/react';
import { PAGES } from '@/lib/data';
import { useSellerSession, initialsOf } from '@/lib/useSellerSession';
import { useAppState } from '@/lib/AppStateContext';
import * as T from '@/lib/theme';

const TAP = { scale: 0.94 };
const TAP_TRANSITION = { duration: 0.1 };

export default function TopBar({ activeId, mobile }) {
  const { navOpen, setNavOpen, setPaletteOpen, theme, nav } = useAppState();
  const { me, balance } = useSellerSession({ wallet: true, refreshKey: activeId });
  const meta = PAGES[activeId] || ['', ''];
  const crumb = meta[0], pageTitle = meta[1];
  const light = theme === 'light';
  const searchStyle = { background: 'var(--nx-chrome-search)', border: '1px solid var(--nx-chrome-border)', color: 'var(--nx-chrome-muted)' };

  return (
    <div style={{ height: 58, flex: '0 0 58px', background: 'var(--nx-chrome-bg)', borderBottom: '1px solid var(--nx-chrome-border)', boxShadow: light ? '0 1px 0 rgba(15,31,61,.03)' : 'none', display: 'flex', alignItems: 'center', gap: 16, padding: '0 20px', position: 'sticky', top: 0, zIndex: 40 }}>
      {mobile ? (
        <>
          <motion.div
            whileTap={TAP}
            transition={TAP_TRANSITION}
            onClick={() => setNavOpen(!navOpen)}
            style={{ width: 32, height: 32, flex: '0 0 32px', background: light ? '#EEF3F7' : 'var(--nx-side-soft)', borderRadius: 7, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3.5, cursor: 'pointer' }}
          >
            <div style={{ width: 14, height: 1.6, background: light ? '#32465E' : '#DCE4EF' }} />
            <div style={{ width: 14, height: 1.6, background: light ? '#32465E' : '#DCE4EF' }} />
            <div style={{ width: 14, height: 1.6, background: light ? '#32465E' : '#DCE4EF' }} />
          </motion.div>
          <motion.div
            whileTap={TAP}
            transition={TAP_TRANSITION}
            onClick={() => setPaletteOpen(true)}
            style={{ flex: 1, height: 32, ...searchStyle, display: 'flex', alignItems: 'center', gap: 9, padding: '0 10px', cursor: 'pointer', fontSize: 13 }}
          >
            <div style={{ fontFamily: T.MONO, fontSize: 11, fontWeight: 600, color: light ? '#52657A' : '#B9C8DE', border: '1px solid var(--nx-chrome-border)', padding: '1px 4px' }}>⌘K</div>
            Search or run a command
          </motion.div>
          <motion.div onClick={() => nav('wallet')} whileTap={TAP} transition={TAP_TRANSITION} title={`Wallet ${balance}`} style={{ width: 32, height: 30, flex: '0 0 32px', display: 'grid', placeItems: 'center', cursor: 'pointer', color: 'var(--nx-side-wallet-text)', background: 'var(--nx-side-wallet)', border: '1px solid rgba(0,179,164,.22)', borderRadius: 7, fontSize: 15, fontWeight: 750 }}>₹</motion.div>
        </>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, flex: '0 0 auto' }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--nx-chrome-muted)' }}>{crumb}</div>
            <div style={{ color: light ? '#A0ACB9' : '#3A5178' }}>/</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--nx-chrome-text)', letterSpacing: '-.01em' }}>{pageTitle}</div>
          </div>
          <motion.div
            whileTap={TAP}
            transition={TAP_TRANSITION}
            onClick={() => setPaletteOpen(true)}
            style={{ flex: 1, maxWidth: 520, margin: '0 auto', height: 32, ...searchStyle, display: 'flex', alignItems: 'center', gap: 10, padding: '0 11px', cursor: 'pointer', fontSize: 13 }}
          >
            <div style={{ fontFamily: T.MONO, fontSize: 11, fontWeight: 600, color: light ? '#52657A' : '#B9C8DE', border: '1px solid var(--nx-chrome-border)', padding: '1px 4px' }}>⌘K</div>
            Run a command, jump to a screen, or paste an AWB
          </motion.div>
          <div style={{ display: 'flex', alignItems: 'center', flex: '0 0 auto' }}>
            <motion.div onClick={() => nav('wallet')} whileTap={TAP} transition={TAP_TRANSITION} title="Open wallet" style={{ height: 34, display: 'flex', alignItems: 'center', gap: 8, padding: '0 11px 0 5px', cursor: 'pointer', borderRadius: 9, background: 'var(--nx-chrome-search)', border: '1px solid var(--nx-chrome-border)' }}>
              <div style={{ width: 25, height: 25, display: 'grid', placeItems: 'center', borderRadius: 7, color: T.ACCENT, background: 'rgba(0,179,164,.10)', fontSize: 14, fontWeight: 750 }}>₹</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, whiteSpace: 'nowrap' }}>
                <span style={{ fontSize: 12.5, fontWeight: 650, color: 'var(--nx-chrome-muted)' }}>Wallet</span>
                <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: 14, fontWeight: 750, letterSpacing: '-.01em', color: 'var(--nx-chrome-text)' }}>{balance}</span>
              </div>
            </motion.div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingLeft: 14 }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--nx-chrome-text)', lineHeight: 1.2 }}>{me?.full_name || 'Not signed in'}</div>
                <div style={{ fontSize: 12, color: 'var(--nx-chrome-muted)' }}>{me ? `${me.legal_name} · ${me.role.replaceAll('_', ' ')}` : 'Sign in to continue'}</div>
              </div>
              <div style={{ width: 27, height: 27, background: T.ACCENT, color: '#06212C', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 }}>{initialsOf(me?.full_name)}</div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
