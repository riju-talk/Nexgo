'use client';

import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { apiFetch } from '@/lib/api';
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
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  useEffect(() => {
    if (!menuOpen) return undefined;
    const away = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('mousedown', away); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [menuOpen]);
  const signOut = async () => { setMenuOpen(false); try { await apiFetch('/v1/auth/logout', { method: 'POST' }); } catch { /* session already gone: still leave */ } nav('login'); };
  const MENU_ITEM = { display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '10px 12px', border: 0, background: 'transparent', color: 'var(--nx-chrome-text)', fontSize: 13, fontWeight: 650, textAlign: 'left', cursor: 'pointer', borderRadius: 8 };
  const searchStyle = { background: 'var(--nx-chrome-search)', border: '1px solid var(--nx-chrome-border)', color: 'var(--nx-chrome-muted)', boxShadow: light ? '0 1px 2px rgba(15,31,61,.03)' : 'none' };

  return (
    <div style={{ height: 68, flex: '0 0 68px', background: 'var(--nx-chrome-bg)', borderBottom: '1px solid var(--nx-chrome-border)', boxShadow: light ? '0 2px 10px rgba(15,31,61,.045)' : 'none', display: 'flex', alignItems: 'center', gap: 18, padding: '0 24px', position: 'sticky', top: 0, zIndex: 40 }}>
      {mobile ? (
        <>
          <motion.div
            whileTap={TAP}
            transition={TAP_TRANSITION}
            onClick={() => setNavOpen(!navOpen)}
            style={{ width: 36, height: 36, flex: '0 0 36px', background: light ? '#EEF3F7' : 'var(--nx-side-soft)', border: '1px solid var(--nx-chrome-border)', borderRadius: 9, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3.5, cursor: 'pointer' }}
          >
            <div style={{ width: 14, height: 1.6, background: light ? '#32465E' : '#DCE4EF' }} />
            <div style={{ width: 14, height: 1.6, background: light ? '#32465E' : '#DCE4EF' }} />
            <div style={{ width: 14, height: 1.6, background: light ? '#32465E' : '#DCE4EF' }} />
          </motion.div>
          <motion.div
            whileTap={TAP}
            transition={TAP_TRANSITION}
            onClick={() => setPaletteOpen(true)}
            style={{ flex: 1, height: 36, ...searchStyle, display: 'flex', alignItems: 'center', gap: 9, padding: '0 11px', borderRadius: 9, cursor: 'pointer', fontSize: 13 }}
          >
            <div style={{ fontFamily: T.MONO, fontSize: 11, fontWeight: 600, color: light ? '#52657A' : '#B9C8DE', border: '1px solid var(--nx-chrome-border)', padding: '1px 4px' }}>⌘K</div>
            Search or run a command
          </motion.div>
          <motion.div onClick={() => nav('wallet')} whileTap={TAP} transition={TAP_TRANSITION} title={`Wallet ${balance}`} style={{ width: 36, height: 36, flex: '0 0 36px', display: 'grid', placeItems: 'center', cursor: 'pointer', color: 'var(--nx-side-wallet-text)', background: 'var(--nx-side-wallet)', border: '1px solid rgba(27,159,214,.26)', borderRadius: 9, fontSize: 15, fontWeight: 750 }}>₹</motion.div>
        </>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, flex: '0 0 250px', minWidth: 0 }}>
            <div style={{ width: 34, height: 34, display: 'grid', placeItems: 'center', borderRadius: 9, background: light ? '#E9F7F5' : 'rgba(27,159,214,.16)', border: '1px solid rgba(27,159,214,.26)', color: T.ACCENT, fontSize: 15, fontWeight: 800 }}>⌁</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, lineHeight: 1.15 }}>
                <span style={{ width: 6, height: 6, borderRadius: 99, background: T.ACCENT, boxShadow: `0 0 0 3px ${light ? 'rgba(27,159,214,.14)' : 'rgba(27,159,214,.20)'}` }} />
                <div style={{ fontSize: 10.5, fontWeight: 750, letterSpacing: '.11em', textTransform: 'uppercase', color: 'var(--nx-chrome-muted)' }}>{crumb}</div>
              </div>
              <div style={{ marginTop: 4, fontSize: 15, fontWeight: 700, color: 'var(--nx-chrome-text)', letterSpacing: '-.015em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{pageTitle}</div>
            </div>
          </div>
          <motion.div
            whileTap={TAP}
            transition={TAP_TRANSITION}
            onClick={() => setPaletteOpen(true)}
            style={{ flex: 1, maxWidth: 580, margin: '0 auto', height: 38, ...searchStyle, display: 'flex', alignItems: 'center', gap: 10, padding: '0 12px', borderRadius: 10, cursor: 'pointer', fontSize: 13 }}
          >
            <div style={{ width: 23, height: 23, display: 'grid', placeItems: 'center', color: 'var(--nx-chrome-muted)' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></svg>
            </div>
            Run a command, jump to a screen, or paste an AWB
            <div style={{ marginLeft: 'auto', fontFamily: T.MONO, fontSize: 10.5, fontWeight: 650, color: light ? '#52657A' : '#B9C8DE', border: '1px solid var(--nx-chrome-border)', borderRadius: 5, padding: '2px 5px', whiteSpace: 'nowrap' }}>⌘ K</div>
          </motion.div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: '0 0 auto' }}>
            <motion.div onClick={() => nav('wallet')} whileTap={TAP} transition={TAP_TRANSITION} title="Open wallet" style={{ height: 38, display: 'flex', alignItems: 'center', gap: 9, padding: '0 12px 0 6px', cursor: 'pointer', borderRadius: 10, background: 'var(--nx-chrome-search)', border: '1px solid var(--nx-chrome-border)' }}>
              <div style={{ width: 27, height: 27, display: 'grid', placeItems: 'center', borderRadius: 8, color: T.ACCENT, background: 'rgba(27,159,214,.12)', fontSize: 14, fontWeight: 750 }}>₹</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, whiteSpace: 'nowrap' }}>
                <span style={{ fontSize: 11.5, fontWeight: 650, color: 'var(--nx-chrome-muted)' }}>Balance</span>
                <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: 14, fontWeight: 750, letterSpacing: '-.01em', color: 'var(--nx-chrome-text)' }}>{balance}</span>
              </div>
            </motion.div>
            <div style={{ width: 1, height: 28, background: 'var(--nx-chrome-border)' }} />
            <div ref={menuRef} style={{ position: 'relative' }}>
              <button type="button" aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((o) => !o)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 0, border: 0, background: 'transparent', cursor: 'pointer', font: 'inherit', color: 'inherit' }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--nx-chrome-text)', lineHeight: 1.2 }}>{me?.full_name || 'Not signed in'}</div>
                <div style={{ marginTop: 3, fontSize: 11.5, color: 'var(--nx-chrome-muted)' }}>{me ? `${me.legal_name} · ${me.role.replaceAll('_', ' ')}` : 'Sign in to continue'}</div>
              </div>
              <div style={{ width: 34, height: 34, borderRadius: 10, background: T.ACCENT, color: '#06212C', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, boxShadow: '0 0 0 3px rgba(27,159,214,.14)' }}>{initialsOf(me?.full_name)}</div>
              </button>
              {menuOpen && (
                <div role="menu" style={{ position: 'absolute', right: 0, top: 'calc(100% + 10px)', minWidth: 200, padding: 6, background: 'var(--nx-surface)', border: '1px solid var(--nx-chrome-border)', borderRadius: 12, boxShadow: '0 14px 36px rgba(12,52,89,.18)', zIndex: 60 }}>
                  <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); nav('profile'); }} style={MENU_ITEM}>Profile settings</button>
                  <button type="button" role="menuitem" onClick={signOut} style={{ ...MENU_ITEM, color: T.RED }}>Log out</button>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
