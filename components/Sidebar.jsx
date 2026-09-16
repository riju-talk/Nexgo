'use client';

import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { useAppState } from '@/lib/AppStateContext';
import * as T from '@/lib/theme';

const SB_WIDTH = 272;
const OPEN_SPRING = { type: 'spring', bounce: 0, duration: 0.32 };

const ICONS = {
  dashboard: 'M4 11.5 12 4l8 7.5v8a.5.5 0 0 1-.5.5h-15a.5.5 0 0 1-.5-.5v-7.5ZM9 19.5v-5h6v5',
  intake: 'M4 6.5h16M4 12h16M4 17.5h11M6 4v4M17 9.5v4M13 15v4',
  book: 'M5 5.5h14v13H5zM8 9h8M8 13h5M16.5 17.5l2 2 3-4',
  flight: 'M4 12h16M12 4v16M6.5 6.5l11 11M17.5 6.5l-11 11',
  exceptions: 'M12 4.5 20 19H4L12 4.5ZM12 9v4.5M12 16.3v.2',
  money: 'M5 7h14v10H5zM8 12h8M12 9.5v5',
  returns: 'M8 7 4 11l4 4M4 11h10a5 5 0 0 1 5 5v1',
  addons: 'M12 4v16M4 12h16',
  settings: 'M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7ZM4.8 15l1.5.9-.1 1.8 2.2 1.3 1.4-1.1 1.6.7.5 1.7h2.5l.5-1.7 1.6-.7 1.4 1.1 2.2-1.3-.1-1.8 1.5-.9v-2.5l-1.5-.9.1-1.8-2.2-1.3-1.4 1.1-1.6-.7-.5-1.7h-2.5l-.5 1.7-1.6.7-1.4-1.1-2.2 1.3.1 1.8-1.5.9V15Z',
  reports: 'M5 20V10M12 20V4M19 20v-7',
};

// Shipway-inspired operational hierarchy: plain labels, one job per section,
// and deeper screens revealed only when that job is in focus.
const MENU = [
  ['dashboard', 'Dashboard', 'dashboard', []],
  ['intake', 'Orders Management', 'orders', [['All orders', 'orders'], ['Create forward order', 'b2c'], ['Bulk order upload', 'bulk-orders'], ['Reverse order', 'reverse']]],
  ['flight', 'Track', 'shipments', [['Shipments', 'shipments']]],
  ['reports', 'Reports', 'mis', [['MIS report', 'mis'], ['Weight discrepancies', 'weight'], ['NDR report', 'ndr']]],
  ['book', 'Tools', 'ratecalc', [['Rate calculator', 'ratecalc'], ['Rate card', 'ratecard'], ['Pincode serviceability', 'pincode']]],
  ['addons', 'Marketplace', 'shopify', [['Shopify', 'shopify'], ['WooCommerce', 'woo'], ['Magento', 'magento'], ['Amazon', 'amazon']]],
  ['settings', 'Control Tower', 'account-config', [['Account configuration', 'account-config'], ['Printer settings', 'printer'], ['Invoice settings', 'inv-settings'], ['SMS notifications', 'sms-api'], ['WhatsApp notifications', 'wa-api'], ['Order confirmation', 'notifications'], ['Webhook', 'webhook'], ['Scheduled email reports', 'email']]],
  ['returns', 'Team', 'profile', [['Team and roles', 'profile']]],
  ['exceptions', 'Settings', 'profile', [['Profile settings', 'profile'], ['Warehouse settings', 'warehouse'], ['Courier rules', 'courier-rules'], ['Label settings', 'label'], ['KYC', 'kyc'], ['Change password', 'password']]],
];

const isMenuActive = ([, , destination, children], activeId) => destination === activeId || children.some(([, id]) => id === activeId);

function NavIcon({ name, active }) {
  return (
    <div style={{ width: 29, height: 29, flex: '0 0 29px', borderRadius: 8, display: 'grid', placeItems: 'center', color: active ? 'var(--nx-side-active-text)' : 'var(--nx-side-sub)', background: active ? 'var(--nx-side-active)' : 'var(--nx-side-soft)', border: `1px solid ${active ? 'rgba(0,179,164,.22)' : 'var(--nx-side-edge)'}` }}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICONS[name] || ICONS.dashboard} /></svg>
    </div>
  );
}

function CollapseControl({ collapsed, onClick }) {
  return (
    <motion.button
      aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
      title={collapsed ? 'Expand navigation' : 'Collapse navigation'}
      onClick={onClick}
      whileTap={{ scale: 0.9 }}
      style={{ width: 25, height: 25, padding: 0, display: 'grid', placeItems: 'center', color: 'var(--nx-side-text)', background: 'var(--nx-side-soft)', border: '1px solid var(--nx-side-edge)', borderRadius: 7, cursor: 'pointer', fontSize: 16, lineHeight: 1 }}
    >
      {collapsed ? '›' : '‹'}
    </motion.button>
  );
}

export default function Sidebar({ activeId, mobile }) {
  const { navOpen, nav, openGroups, toggleGroup, setNavOpen, sidebarCollapsed, toggleSidebar, theme, toggleTheme } = useAppState();
  const reduced = useReducedMotion();
  const [dragVelocity, setDragVelocity] = useState(0);
  const collapsed = !mobile && sidebarCollapsed;

  useEffect(() => {
    const t = setTimeout(() => setDragVelocity(0), 400);
    return () => clearTimeout(t);
  }, [navOpen]);

  const handleDragEnd = (_e, info) => {
    const shouldClose = info.offset.x < -SB_WIDTH * 0.3 || info.velocity.x < -650;
    setDragVelocity(info.velocity.x);
    setNavOpen(!shouldClose);
  };

  const mobileMotionProps = mobile
    ? {
        drag: reduced || !navOpen ? false : 'x',
        dragConstraints: { left: -SB_WIDTH, right: 0 },
        dragElastic: 0.12,
        onDragEnd: handleDragEnd,
        animate: reduced ? { opacity: navOpen ? 1 : 0 } : { x: navOpen ? 0 : -SB_WIDTH },
        transition: dragVelocity ? { type: 'spring', velocity: dragVelocity, bounce: 0.14, duration: 0.32 } : OPEN_SPRING,
      }
    : {};

  const sbStyle = mobile
    ? {
        width: 272, flex: '0 0 0px', background: 'var(--nx-side-bg)', position: 'fixed', left: 0, top: 0,
        height: '100vh', zIndex: 90, boxShadow: navOpen ? '0 0 60px rgba(8,20,40,.45)' : 'none',
        display: 'flex', flexDirection: 'column', touchAction: 'pan-y',
        pointerEvents: navOpen ? 'auto' : 'none',
      }
    : {
        width: 272, flex: '0 0 272px', background: 'var(--nx-side-bg)', position: 'sticky', left: 'auto', top: 0,
        height: '100vh', zIndex: 30,
        display: 'flex', flexDirection: 'column',
      };

  const onDashboard = activeId === 'dashboard';
  const outerStyle = mobile ? sbStyle : { ...sbStyle, width: undefined, flex: '0 0 auto', overflow: 'hidden' };
  const outerMotion = mobile ? mobileMotionProps : { animate: { width: collapsed ? 76 : 272 }, transition: reduced ? { duration: 0.16 } : OPEN_SPRING };

  if (collapsed) {
    return (
      <motion.div style={outerStyle} {...outerMotion}>
        <div style={{ height: 68, display: 'grid', placeItems: 'center', borderBottom: '1px solid var(--nx-side-edge)', position: 'relative', background: 'var(--nx-side-bg)' }}>
          <div onClick={() => nav('dashboard')} title="Dashboard" style={{ width: 32, height: 32, borderRadius: 9, cursor: 'pointer', display: 'grid', placeItems: 'center', background: 'linear-gradient(145deg, #35D5C5, #00A99C)', color: '#06212C', fontWeight: 800, fontSize: 13, boxShadow: '0 8px 18px rgba(0,179,164,.24)' }}>N</div>
          <div style={{ position: 'absolute', right: 7, bottom: 7 }}><CollapseControl collapsed onClick={toggleSidebar} /></div>
        </div>
        <div style={{ flex: 1, padding: '14px 14px', display: 'grid', alignContent: 'start', gap: 8 }}>
          <motion.div onClick={() => nav('dashboard')} title="Dashboard" whileTap={{ scale: 0.94 }} style={{ height: 46, display: 'grid', placeItems: 'center', borderRadius: 11, cursor: 'pointer', background: onDashboard ? 'var(--nx-side-active)' : 'var(--nx-side-soft)', border: `1px solid ${onDashboard ? 'rgba(0,179,164,.2)' : 'var(--nx-side-edge)'}` }}><NavIcon name="dashboard" active={onDashboard} /></motion.div>
          <div style={{ height: 1, margin: '4px 3px', background: 'var(--nx-side-edge)' }} />
          {MENU.filter(([id]) => id !== 'dashboard').map((item) => {
            const [id, label, destination] = item;
            const on = isMenuActive(item, activeId);
            return <motion.div key={id} onClick={() => nav(destination)} title={label} whileTap={{ scale: 0.94 }} style={{ height: 46, display: 'grid', placeItems: 'center', borderRadius: 11, cursor: 'pointer', background: on ? 'var(--nx-side-active)' : 'var(--nx-side-soft)', border: `1px solid ${on ? 'rgba(0,179,164,.2)' : 'var(--nx-side-edge)'}` }}><NavIcon name={id} active={on} /></motion.div>;
          })}
        </div>
        <div style={{ padding: '12px 14px', display: 'grid', justifyItems: 'center', gap: 11, borderTop: '1px solid var(--nx-side-edge)' }}>
          <div onClick={() => nav('profile')} title="Anita Rao" style={{ width: 30, height: 30, borderRadius: 9, background: 'linear-gradient(145deg, #2B8EAA, #7B5FB8)', display: 'grid', placeItems: 'center', cursor: 'pointer', fontSize: 10, fontWeight: 800, color: '#fff' }}>AR</div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div style={outerStyle} {...outerMotion}>
      <motion.div
        whileTap={{ scale: 0.98 }}
        transition={{ duration: 0.1 }}
        onClick={() => nav('dashboard')}
        style={{ height: 68, flex: '0 0 68px', display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px', borderBottom: '1px solid var(--nx-side-edge)', cursor: 'pointer', background: 'var(--nx-side-bg)' }}
      >
        <div style={{ width: 31, height: 31, background: 'linear-gradient(145deg, #35D5C5, #00A99C)', boxShadow: '0 8px 18px rgba(0,179,164,.24)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13, color: '#06212C', borderRadius: 9, clipPath: 'polygon(0 0,100% 0,100% 72%,72% 100%,0 100%)' }}>N</div>
        <div style={{ minWidth: 0 }}><div style={{ fontSize: 14, fontWeight: 750, letterSpacing: '.13em', color: 'var(--nx-side-text)', lineHeight: 1 }}>NEXGO</div></div>
        {!mobile && <CollapseControl collapsed={false} onClick={(event) => { event.stopPropagation(); toggleSidebar(); }} />}
      </motion.div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 8px 18px' }}>
        <div style={{ padding: '0 10px 9px', fontSize: 12, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--nx-side-label)' }}>Main menu</div>
        {MENU.map((item) => {
          const [id, label, destination, children] = item;
          const on = isMenuActive(item, activeId);
          const open = openGroups[label] === undefined ? on : !!openGroups[label];
          const hasChildren = children.length > 0;
          return (
            <div key={id} style={{ padding: '1px 0' }}>
              <motion.div
                whileTap={{ scale: 0.985 }}
                transition={{ duration: 0.1 }}
                onClick={() => hasChildren ? toggleGroup(label, !open) : nav(destination)}
                className="nxc-nav-row"
                style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 9, cursor: 'pointer', background: on ? 'var(--nx-side-active)' : undefined, border: `1px solid ${on ? 'rgba(0,179,164,.2)' : 'transparent'}` }}
              >
                {on && <div style={{ position: 'absolute', left: -1, top: 8, bottom: 8, width: 3, borderRadius: 3, background: T.ACCENT }} />}
                <NavIcon name={id} active={on} />
                <div style={{ flex: 1, fontSize: 14, fontWeight: on ? 700 : 600, color: on ? 'var(--nx-side-active-text)' : 'var(--nx-side-text)' }}>{label}</div>
                {hasChildren && <div style={{ color: 'var(--nx-side-label)', fontSize: 12, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .18s ease' }}>›</div>}
              </motion.div>
              {hasChildren && open && (
                <div style={{ margin: '2px 0 5px 24px', padding: '2px 0 2px 13px', borderLeft: '1px solid var(--nx-side-edge)', animation: 'nxc-expand .12s ease-out' }}>
                  {children.map(([childLabel, childId]) => (
                    <div key={`${childId}-${childLabel}`} onClick={() => nav(childId)} className="nxc-nav-row" style={{ padding: '7px 9px', borderRadius: 7, margin: '1px 0', cursor: 'pointer', fontSize: 13, fontWeight: childId === activeId ? 650 : 500, color: childId === activeId ? 'var(--nx-side-active-text)' : 'var(--nx-side-sub)', background: childId === activeId ? 'var(--nx-side-active)' : undefined }}>{childLabel}</div>
                  ))}
                  {id === 'exceptions' && (
                    <div style={{ marginTop: 7, paddingTop: 8, borderTop: '1px solid var(--nx-side-edge)' }}>
                      <div style={{ padding: '0 9px 5px', fontSize: 11.5, fontWeight: 750, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--nx-side-label)' }}>Appearance</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
                        {['light', 'dark'].map((mode) => {
                          const selected = theme === mode;
                          return <motion.div key={mode} whileTap={{ scale: 0.96 }} onClick={() => { if (!selected) toggleTheme(); }} style={{ height: 31, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: 7, cursor: 'pointer', fontSize: 12.5, fontWeight: selected ? 700 : 550, color: selected ? 'var(--nx-side-active-text)' : 'var(--nx-side-sub)', background: selected ? 'var(--nx-side-active)' : 'var(--nx-side-soft)', border: `1px solid ${selected ? 'rgba(0,179,164,.24)' : 'var(--nx-side-edge)'}` }}>{mode === 'light' ? '☀' : '◐'} {mode === 'light' ? 'Light mode' : 'Dark mode'}</motion.div>;
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ padding: '10px 10px 11px', borderTop: '1px solid var(--nx-side-edge)', background: 'var(--nx-side-bg)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 7px 0', borderTop: '1px solid var(--nx-side-edge)' }}>
          <div style={{ width: 28, height: 28, borderRadius: 9, background: 'linear-gradient(145deg, #2B8EAA, #7B5FB8)', display: 'grid', placeItems: 'center', fontSize: 10, fontWeight: 800, color: '#fff' }}>AR</div>
          <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--nx-side-text)' }}>Anita Rao</div><div style={{ marginTop: 2, fontSize: 12, color: 'var(--nx-side-label)' }}>Karma Living · Owner</div></div>
          <div onClick={() => nav('login')} title="Sign out" style={{ padding: '6px 7px', borderRadius: 6, fontSize: 12, color: 'var(--nx-side-text)', cursor: 'pointer', background: 'var(--nx-side-soft)' }}>↪</div>
        </div>
      </div>
      <style jsx>{`
        .nxc-nav-row { transition: background 100ms ease-out; }
        .nxc-nav-row:hover { background: var(--nx-side-soft); }
      `}</style>
    </motion.div>
  );
}
