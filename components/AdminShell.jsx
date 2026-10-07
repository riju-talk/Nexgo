'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { usePathname, useRouter } from 'next/navigation';
import { useAppState } from '@/lib/AppStateContext';
import { pathFor } from '@/lib/routes';
import * as T from '@/lib/theme';
import { adminApi } from '@/lib/api';

const GROUPS = [
  ['Overview', [['Dashboard', 'a-overview', '▦']]],
  ['Users', [['All sellers', 'a-sellers', '◎'], ['KYC verification', 'a-kyc', '◈'], ['Wallets', 'a-wallets', '₹'], ['Credit limits', 'a-credit', '⊞']]],
  ['Couriers', [['Partners', 'a-couriers', '◌'], ['Zone mapping', 'a-zones', '⌘'], ['SLA settings', 'a-sla', '◫'], ['Performance', 'a-performance', '▥']]],
  ['Shipments', [['All orders', 'a-orders', '▤'], ['All shipments', 'a-shipments', '□'], ['NDR centre', 'a-ndr', '!'], ['RTO centre', 'a-rto', '↩'], ['Pickups', 'a-pickups', '⌁']]],
  ['Finance', [['COD settlements', 'a-cod', '₹'], ['Invoices', 'a-invoices', '▤'], ['GST reports', 'a-gst', '▧']]],
  ['Reports', [['Revenue', 'a-revenue', '↗'], ['SLA', 'a-sla-report', '◷'], ['Courier analytics', 'a-analytics', '◉']]],
  ['Support centre', [['Tickets', 'a-tickets', '◌'], ['Live chat', 'a-live-chat', '◍'], ['Escalations', 'a-escalations', '↑'], ['Courier disputes', 'a-disputes', '◇']]],
  ['Settings', [['System settings', 'a-system', '⚙'], ['API management', 'a-api', '⌁'], ['Audit logs', 'a-audit', '◫'], ['Role permissions', 'a-roles', '♙']]],
];

const DEMO_ADMIN = {
  fullName: 'Demo Admin',
  email: 'admin@nexgo.in',
  role: 'super_admin',
};

function hasDemoAdminSession() {
  return typeof window !== 'undefined' && window.sessionStorage.getItem('nx-demo-admin') === 'true';
}

function AdminNav({ mobile }) {
  const pathname = usePathname();
  const { navOpen, setNavOpen } = useAppState();
  const visible = !mobile || navOpen;
  return (
    <motion.aside
      initial={false}
      animate={mobile ? { x: visible ? 0 : -272 } : { x: 0 }}
      transition={{ type: 'spring', bounce: 0, duration: 0.32 }}
      style={{ width: 272, flex: '0 0 272px', position: mobile ? 'fixed' : 'sticky', left: 0, top: 0, height: '100vh', zIndex: 70, overflowY: 'auto', background: 'var(--nx-side-bg)', color: 'var(--nx-side-text)', borderRight: mobile ? 'none' : '1px solid var(--nx-side-edge)', boxShadow: mobile && visible ? '0 20px 54px rgba(8,20,40,.35)' : 'none' }}
    >
      <Link href={pathFor('a-overview')} onClick={() => mobile && setNavOpen(false)} style={{ height: 68, padding: '0 16px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--nx-side-edge)', textDecoration: 'none', color: 'var(--nx-side-text)' }}>
        <div style={{ width: 31, height: 31, borderRadius: 9, display: 'grid', placeItems: 'center', background: T.ACCENT, color: '#06212C', fontWeight: 850, fontSize: 13, clipPath: 'polygon(0 0,100% 0,100% 72%,72% 100%,0 100%)' }}>N</div>
        <div><div style={{ fontSize: 14, fontWeight: 800, letterSpacing: '.13em', lineHeight: 1 }}>NEXGO</div><div style={{ marginTop: 4, fontSize: 10.5, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--nx-side-label)' }}>Operations</div></div>
      </Link>
      <nav style={{ padding: '14px 8px 12px' }}>
        {GROUPS.map(([group, items]) => <div key={group} style={{ marginTop: group === 'Overview' ? 0 : 15 }}>
          <div style={{ padding: '0 10px 7px', fontSize: 10.5, fontWeight: 800, letterSpacing: '.11em', textTransform: 'uppercase', color: 'var(--nx-side-label)' }}>{group}</div>
          {items.map(([label, id, icon]) => {
            const active = pathname === pathFor(id);
            return <Link className="admin-nav-link" key={label} href={pathFor(id)} onClick={() => mobile && setNavOpen(false)} style={{ position: 'relative', height: 38, padding: '0 10px', margin: '2px 0', borderRadius: 9, display: 'flex', alignItems: 'center', gap: 9, textDecoration: 'none', color: active ? 'var(--nx-side-active-text)' : 'var(--nx-side-text)', background: active ? 'var(--nx-side-active)' : 'transparent', border: active ? '1px solid rgba(0,215,195,.22)' : '1px solid transparent', fontSize: 13.5, fontWeight: active ? 700 : 600 }}>
              {active && <motion.span layoutId="admin-active-rail" transition={{ type: 'spring', bounce: .12, duration: .34 }} style={{ position: 'absolute', left: -3, width: 3, height: 18, borderRadius: 99, background: T.ACCENT }} />}
              <span style={{ width: 15, textAlign: 'center', color: active ? T.ACCENT : 'var(--nx-side-sub)', fontSize: 13 }}>{icon}</span>{label}
            </Link>;
          })}
        </div>)}
      </nav>
      <Link href={pathFor('a-system')} className="admin-system-health" style={{ margin: '0 8px 12px', padding: '11px 10px', display: 'flex', alignItems: 'center', gap: 9, border: '1px solid var(--nx-side-edge)', borderRadius: 10, textDecoration: 'none', background: 'var(--nx-side-soft)' }}>
        <span style={{ position: 'relative', width: 8, height: 8, borderRadius: '50%', background: T.ACCENT, boxShadow: '0 0 0 4px rgba(0,215,195,.12)' }} />
        <span><b style={{ display: 'block', color: 'var(--nx-side-text)', fontSize: 11.5, lineHeight: 1.2 }}>Platform healthy</b><span style={{ display: 'block', marginTop: 3, color: 'var(--nx-side-sub)', fontSize: 10.5 }}>99.4% API availability</span></span>
      </Link>
      <div style={{ margin: '0 8px 16px', paddingTop: 12, borderTop: '1px solid var(--nx-side-edge)' }}>
        <Link href="/admin/login" onClick={(e) => { e.preventDefault(); if (typeof window !== 'undefined') window.sessionStorage.removeItem('nx-demo-admin'); adminApi.logout().finally(() => { window.location.assign('/admin/login') /* eslint-disable-line @next/next/no-location-assign-relative-destination -- full reload on logout drops all in-memory client state */; }); }} style={{ height: 38, padding: '0 10px', borderRadius: 9, display: 'flex', alignItems: 'center', gap: 9, textDecoration: 'none', color: 'var(--nx-side-sub)', fontSize: 13, fontWeight: 650, cursor: 'pointer' }}>
          <span style={{ width: 15, textAlign: 'center', color: T.ACCENT, fontSize: 14 }}>↗</span> Exit operations
        </Link>
      </div>
      <style jsx>{`
        .admin-nav-link { transition: background .16s ease, border-color .16s ease, transform .16s ease; }
        .admin-nav-link:hover { background: var(--nx-side-soft) !important; border-color: var(--nx-side-edge) !important; transform: translateX(1px); }
        .admin-system-health { transition: transform .16s ease, border-color .16s ease; }
        .admin-system-health:hover { transform: translateY(-1px); border-color: rgba(0,215,195,.32) !important; }
      `}</style>
    </motion.aside>
  );
}

export default function AdminShell({ children }) {
  const router = useRouter();
  const { vw, navOpen, setNavOpen, setPaletteOpen, theme, toggleTheme, showToast } = useAppState();
  const [sessionReady, setSessionReady] = useState(() => hasDemoAdminSession());
  const [profileOpen, setProfileOpen] = useState(false);
  const [admin, setAdmin] = useState(() => (hasDemoAdminSession() ? DEMO_ADMIN : null));
  const mobile = vw <= T.MOBILE_BREAK;
  const dark = theme === 'dark';
  useEffect(() => {
    if (hasDemoAdminSession()) {
      return;
    }

    let cancelled = false;
    adminApi.me()
      .then((me) => { if (!cancelled) { setAdmin(me); setSessionReady(true); } })
      .catch(() => { if (!cancelled) router.replace('/admin/login'); });
    return () => { cancelled = true; };
  }, [router]);
  const opsTheme = {
    '--ops-bg': 'var(--nx-paper)', '--ops-surface': 'var(--nx-card-sheen-1)', '--ops-surface-soft': 'var(--nx-surface-soft)',
    '--ops-border': 'var(--nx-border)', '--ops-divider': 'var(--nx-divider)', '--ops-text': 'var(--nx-text)',
    '--ops-heading': 'var(--nx-chrome-text)', '--ops-muted': 'var(--nx-text-secondary)', '--ops-subtle': 'var(--nx-text-muted)',
    '--ops-chart-grid': 'var(--nx-divider)', '--ops-shadow': dark ? '0 12px 30px rgba(0,0,0,.16)' : '0 10px 28px rgba(38,63,83,.07)',
  };
  if (!sessionReady) return <div style={{ minHeight: '100vh', background: 'var(--nx-paper)' }} />;
  return (
    <div style={{ ...opsTheme, height: '100vh', minHeight: 0, overflow: 'hidden', display: 'flex', background: 'var(--ops-bg)', color: 'var(--ops-text)', fontFamily: T.SANS, transition: 'background-color .2s ease, color .2s ease' }}>
      {mobile && navOpen && <div onClick={() => setNavOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(4,14,30,.36)' }} />}
      <AdminNav mobile={mobile} />
      <main style={{ flex: 1, minWidth: 0, minHeight: 0, overflowY: 'auto', overflowX: 'hidden' }}>
        <header style={{ height: 58, padding: mobile ? '0 14px' : '0 20px', display: 'flex', alignItems: 'center', gap: 16, position: 'sticky', top: 0, zIndex: 40, background: 'var(--nx-chrome-bg)', borderBottom: '1px solid var(--nx-chrome-border)' }}>
          {mobile && <motion.button onClick={() => setNavOpen(!navOpen)} whileTap={{ scale: .93 }} style={{ width: 34, height: 34, border: '1px solid var(--ops-border)', borderRadius: 9, background: 'var(--ops-surface)', color: 'var(--ops-text)', fontSize: 18, cursor: 'pointer' }}>☰</motion.button>}
          <motion.div onClick={() => setPaletteOpen(true)} whileTap={{ scale: .985 }} style={{ height: 32, width: mobile ? 'auto' : 520, flex: mobile ? 1 : '0 1 520px', margin: mobile ? 0 : '0 auto', padding: '0 11px', display: 'flex', alignItems: 'center', gap: 10, background: 'var(--nx-chrome-search)', border: '1px solid var(--nx-chrome-border)', borderRadius: 8, color: 'var(--nx-chrome-muted)', fontSize: 13, cursor: 'pointer' }}><span style={{ color: T.ACCENT, fontSize: 17 }}>⌕</span><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Search order, AWB, seller, courier…</span><span style={{ marginLeft: 'auto', color: 'var(--nx-chrome-muted)', fontFamily: T.MONO, fontSize: 11 }}>⌘K</span></motion.div>
          {mobile && <motion.button onClick={toggleTheme} whileTap={{ scale: .93 }} title="Toggle colour mode" style={{ width: 34, height: 34, border: '1px solid var(--ops-border)', borderRadius: 9, background: 'var(--ops-surface)', color: T.ACCENT, cursor: 'pointer', fontSize: 16 }}>{dark ? '☾' : '☀'}</motion.button>}
          {!mobile && <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ display: 'flex', padding: 3, gap: 2, background: 'var(--ops-surface-soft)', border: '1px solid var(--ops-border)', borderRadius: 8 }}>
              {['light', 'dark'].map(mode => <motion.button key={mode} onClick={() => theme !== mode && toggleTheme()} whileTap={{ scale: .96 }} style={{ height: 26, padding: '0 8px', border: 0, borderRadius: 6, background: theme === mode ? 'var(--ops-surface)' : 'transparent', color: theme === mode ? T.ACCENT : 'var(--ops-muted)', boxShadow: theme === mode ? '0 1px 4px rgba(0,0,0,.10)' : 'none', cursor: 'pointer', fontSize: 11.5, fontWeight: 700 }}>{mode === 'light' ? '☀ Light' : '☾ Dark'}</motion.button>)}
            </div>
            <div style={{ padding: '5px 10px', border: '1px solid var(--ops-border)', borderRadius: 8, background: 'var(--ops-surface)', fontSize: 12.5, color: 'var(--ops-muted)' }}>Tue, 09 Sep 2026</div>
            <motion.button whileTap={{ scale: .92 }} onClick={() => showToast('3 operational alerts are ready for review')} aria-label="Open notifications" style={{ position: 'relative', width: 31, height: 31, display: 'grid', placeItems: 'center', border: 0, borderRadius: 8, background: 'transparent', color: T.ACCENT, fontSize: 17, cursor: 'pointer' }}>♧<span className="nxc-live-ping" style={{ position: 'absolute', top: 5, right: 3, width: 7, height: 7, borderRadius: '50%', background: '#E83D57' }} /><span style={{ position: 'absolute', top: 5, right: 3, width: 7, height: 7, borderRadius: '50%', background: '#E83D57', border: '2px solid var(--ops-surface)' }} /></motion.button>
            <div style={{ position: 'relative' }}>
              <button onClick={() => setProfileOpen(!profileOpen)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 0, border: 0, background: 'transparent', cursor: 'pointer', textAlign: 'left' }}><div style={{ width: 33, height: 33, borderRadius: '50%', display: 'grid', placeItems: 'center', background: T.NAVY, color: '#fff', fontSize: 11, fontWeight: 800 }}>{(admin?.fullName || '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()}</div><div><div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ops-text)' }}>{admin?.fullName || 'Loading…'}</div><div style={{ fontSize: 11, color: 'var(--ops-muted)', marginTop: 2 }}>{admin?.role?.replace(/_/g, ' ') || ''}</div></div></button>
              {profileOpen && <motion.div initial={{ opacity: 0, y: -5, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: 'spring', bounce: 0, duration: .22 }} style={{ position: 'absolute', top: 42, right: 0, width: 210, padding: 8, border: '1px solid var(--ops-border)', borderRadius: 11, background: 'var(--ops-surface)', boxShadow: '0 15px 35px rgba(9,28,48,.18)' }}><div style={{ padding: '8px 9px 10px', borderBottom: '1px solid var(--ops-divider)' }}><b style={{ display: 'block', color: 'var(--ops-heading)', fontSize: 12.5 }}>{admin?.email}</b><span style={{ display: 'block', marginTop: 3, color: 'var(--ops-muted)', fontSize: 11 }}>{admin?.role?.replace(/_/g, ' ')}</span></div><button onClick={() => { if (typeof window !== 'undefined') window.sessionStorage.removeItem('nx-demo-admin'); adminApi.logout().finally(() => { window.location.assign('/admin/login') /* eslint-disable-line @next/next/no-location-assign-relative-destination -- full reload on logout drops all in-memory client state */; }); }} style={{ width: '100%', marginTop: 5, padding: '9px', border: 0, borderRadius: 7, background: 'transparent', color: T.RED, textAlign: 'left', cursor: 'pointer', fontSize: 12.5, fontWeight: 700 }}>Exit operations</button></motion.div>}
            </div>
          </div>}
        </header>
        {children}
      </main>
    </div>
  );
}
