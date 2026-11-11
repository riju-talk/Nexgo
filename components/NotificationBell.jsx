'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { apiFetch } from '@/lib/api';
import { clearCached, useLiveQuery } from '@/lib/queryCache';
import { KINDS, NOTIFICATIONS_CHANGED, notificationsChanged, timeAgo } from '@/lib/notificationKinds';
import { useAppState } from '@/lib/AppStateContext';
import * as T from '@/lib/theme';

const plural = (n, one, many) => `${n.toLocaleString('en-IN')} ${n === 1 ? one : many}`;
const rupees = (paise) => `₹${Math.round(paise / 100).toLocaleString('en-IN')}`;

// Everything that needs attention right now, built from live dashboard figures (nothing is stored or invented).
function sellerItems(d) {
  const q = d?.queue || {};
  const items = [];
  if (q.ndr?.open > 0) items.push({ id: 'ndr', title: plural(q.ndr.open, 'open NDR case', 'open NDR cases'), text: 'Customers could not be reached. Choose reattempt or return.', go: 'ndr' });
  if (q.weight?.open > 0) items.push({ id: 'weight', title: plural(q.weight.open, 'weight dispute', 'weight disputes'), text: `${rupees(q.weight.heldPaise || 0)} is held until you respond.`, go: 'weight' });
  if (q.pickup?.missed > 0) items.push({ id: 'pickup', title: plural(q.pickup.missed, 'missed pickup', 'missed pickups'), text: 'These parcels were not collected on time.', go: 'dashboard' });
  return items;
}

function adminItems(d) {
  const items = [];
  if (d?.kycPending > 0) items.push({ id: 'kyc', title: `${plural(d.kycPending, 'KYC submission', 'KYC submissions')} waiting`, text: 'Sellers are waiting for verification.', go: 'a-kyc' });
  if (d?.ndrOpen > 0) items.push({ id: 'ndr', title: plural(d.ndrOpen, 'open NDR case', 'open NDR cases'), text: 'Across all sellers.', go: 'a-ndr' });
  if (d?.pickupPending?.total > 0) items.push({ id: 'pickup', title: `${plural(d.pickupPending.total, 'pickup', 'pickups')} pending`, text: 'Booked parcels not yet collected.', go: 'a-pickups' });
  if (d?.codPendingPaise > 0) items.push({ id: 'cod', title: `${rupees(d.codPendingPaise)} COD to settle`, text: 'Remittances waiting for approval.', go: 'a-cod' });
  return items;
}

function ItemsBell({ admin = false }) {
  const { nav } = useAppState();
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [state, setState] = useState('loading');
  const box = useRef(null);

  const load = useCallback(async () => {
    try {
      const d = await apiFetch(admin ? '/v1/admin/analytics/dashboard' : '/v1/analytics/dashboard');
      setItems(admin ? adminItems(d) : sellerItems(d));
      setState('ready');
    } catch { setState('error'); }
  }, [admin]);

  useEffect(() => {
    // Load on mount, when the tab becomes visible again, and every minute while visible.
    const first = setTimeout(load, 0);
    const tick = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 60000);
    const focus = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', focus);
    return () => { clearTimeout(first); clearInterval(tick); document.removeEventListener('visibilitychange', focus); };
  }, [load]);

  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]);

  const count = items.length;
  const badge = count > 9 ? '9+' : String(count);
  const toggle = () => { setOpen((o) => !o); if (!open) load(); };
  const line = 'var(--nx-chrome-border, #dfe6f2)';

  return (
    <div ref={box} style={{ position: 'relative', flex: '0 0 auto' }}>
      <motion.button
        type="button"
        whileTap={{ scale: 0.92 }}
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={count ? `Notifications, ${count} new` : 'Notifications, none new'}
        style={{ position: 'relative', width: 36, height: 36, display: 'grid', placeItems: 'center', border: `1px solid ${line}`, borderRadius: 10, background: 'var(--nx-chrome-search, #fff)', color: T.ACCENT, cursor: 'pointer' }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
        {count > 0 && (
          <span style={{ position: 'absolute', top: -6, right: -6, minWidth: 18, height: 18, padding: '0 5px', borderRadius: 9, background: '#E83D57', color: '#fff', fontSize: 10.5, fontWeight: 800, lineHeight: '18px', textAlign: 'center', boxShadow: '0 0 0 2px var(--nx-chrome-bg, #fff)' }}>{badge}</span>
        )}
      </motion.button>
      {open && (
        <div role="menu" style={{ position: 'absolute', right: 0, top: 'calc(100% + 10px)', width: 320, maxWidth: 'calc(100vw - 24px)', background: 'var(--nx-surface, #fff)', border: `1px solid ${line}`, borderRadius: 12, boxShadow: '0 14px 36px rgba(11,31,68,.18)', zIndex: 80, overflow: 'hidden' }}>
          <div style={{ padding: '12px 14px', borderBottom: `1px solid ${line}`, fontSize: 13, fontWeight: 750, color: 'var(--nx-chrome-text, #0b1f44)' }}>Notifications{count > 0 ? ` (${count})` : ''}</div>
          {state === 'error' ? (
            <div style={{ padding: '22px 14px', fontSize: 13, color: 'var(--nx-chrome-muted, #51628a)', textAlign: 'center' }}>Could not load notifications. Try again in a moment.</div>
          ) : count === 0 ? (
            <div style={{ padding: '26px 14px', fontSize: 13.5, color: 'var(--nx-chrome-muted, #51628a)', textAlign: 'center' }}>{state === 'loading' ? 'Checking…' : 'No new notifications'}</div>
          ) : (
            items.map((n) => (
              <button key={n.id} type="button" role="menuitem" onClick={() => { setOpen(false); nav(n.go); }} style={{ display: 'block', width: '100%', padding: '11px 14px', border: 0, borderBottom: `1px solid ${line}`, background: 'transparent', textAlign: 'left', cursor: 'pointer', font: 'inherit' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--nx-chrome-text, #0b1f44)' }}>{n.title}</div>
                <div style={{ marginTop: 3, fontSize: 12, color: 'var(--nx-chrome-muted, #51628a)', lineHeight: 1.45 }}>{n.text}</div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// Sellers: the unread count and the latest notifications from their inbox (stored events: deliveries, returns, NDRs, missed pickups, wallet, COD, ...).
function SellerBell() {
  const { nav } = useAppState();
  const { data, error, refresh } = useLiveQuery('/v1/notifications/summary', { every: 30000 });
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  useEffect(() => { window.addEventListener(NOTIFICATIONS_CHANGED, refresh); return () => window.removeEventListener(NOTIFICATIONS_CHANGED, refresh); }, [refresh]);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]);
  const count = data?.unread ?? 0;
  const badge = count > 9 ? '9+' : String(count);
  const line = 'var(--nx-chrome-border, #dfe6f2)';
  const go = async (n) => {
    setOpen(false);
    if (!n.read_at) { try { await apiFetch('/v1/notifications/read', { method: 'POST', body: { ids: [n.id] } }); clearCached('/v1/notifications'); refresh(); notificationsChanged(); } catch { /* opening still works */ } }
    nav(n.screen || 'notif-center');
  };
  return (
    <div ref={box} style={{ position: 'relative', flex: '0 0 auto' }}>
      <motion.button type="button" whileTap={{ scale: 0.92 }} onClick={() => { setOpen((o) => !o); if (!open) refresh(); }} aria-haspopup="menu" aria-expanded={open} aria-label={count ? `Notifications, ${count} unread` : 'Notifications, none unread'}
        style={{ position: 'relative', width: 36, height: 36, display: 'grid', placeItems: 'center', border: `1px solid ${line}`, borderRadius: 10, background: 'var(--nx-chrome-search, #fff)', color: T.ACCENT, cursor: 'pointer' }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0" /></svg>
        {count > 0 && <span style={{ position: 'absolute', top: -6, right: -6, minWidth: 18, height: 18, padding: '0 5px', borderRadius: 9, background: '#E83D57', color: '#fff', fontSize: 10.5, fontWeight: 800, lineHeight: '18px', textAlign: 'center' }}>{badge}</span>}
      </motion.button>
      {open && (
        <div role="menu" style={{ position: 'absolute', right: 0, top: 'calc(100% + 10px)', width: 360, maxWidth: 'calc(100vw - 24px)', background: 'var(--nx-surface, #fff)', border: `1px solid ${line}`, borderRadius: 12, boxShadow: '0 18px 44px rgba(11,31,68,.18)', zIndex: 90, overflow: 'hidden' }}>
          <div style={{ padding: '12px 14px', borderBottom: `1px solid ${line}`, fontSize: 13, fontWeight: 750, color: 'var(--nx-chrome-text, #0b1f44)' }}>Notifications{count > 0 ? ` (${count} unread)` : ''}</div>
          {error && !data ? <div style={{ padding: '22px 14px', fontSize: 13, color: 'var(--nx-chrome-muted, #51628a)', textAlign: 'center' }}>Could not load notifications. Try again in a moment.</div>
            : !data ? <div style={{ padding: '26px 14px', fontSize: 13.5, color: 'var(--nx-chrome-muted, #51628a)', textAlign: 'center' }}>Checking…</div>
            : !data.items.length ? <div style={{ padding: '26px 14px', fontSize: 13.5, color: 'var(--nx-chrome-muted, #51628a)', textAlign: 'center' }}>Nothing yet. Updates about your parcels and wallet will show here.</div>
            : data.items.map((n) => (
              <button key={n.id} type="button" role="menuitem" onClick={() => go(n)} style={{ display: 'flex', gap: 10, width: '100%', padding: '11px 14px', border: 0, borderBottom: `1px solid ${line}`, background: n.read_at ? 'transparent' : 'rgba(56,119,252,.06)', textAlign: 'left', cursor: 'pointer', font: 'inherit' }}>
                <span aria-hidden style={{ width: 8, height: 8, borderRadius: '50%', background: n.read_at ? 'transparent' : '#E83D57', flex: '0 0 8px', marginTop: 5 }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: n.read_at ? 600 : 750, color: 'var(--nx-chrome-text, #0b1f44)' }}>{n.title}</span>
                  {n.body && <span style={{ display: 'block', marginTop: 3, fontSize: 12, color: 'var(--nx-chrome-muted, #51628a)', lineHeight: 1.45 }}>{n.body}</span>}
                  <span style={{ display: 'block', marginTop: 4, fontSize: 11, color: (KINDS[n.kind] || KINDS.system).color, fontWeight: 700 }}>{(KINDS[n.kind] || KINDS.system).label} · {timeAgo(n.created_at)}</span>
                </span>
              </button>
            ))}
          <button type="button" onClick={() => { setOpen(false); nav('notif-center'); }} style={{ display: 'block', width: '100%', padding: '11px 14px', border: 0, background: 'transparent', color: T.ACCENT, fontSize: 13, fontWeight: 750, cursor: 'pointer' }}>View all notifications →</button>
        </div>
      )}
    </div>
  );
}

export default function NotificationBell({ admin = false }) {
  return admin ? <ItemsBell admin /> : <SellerBell />;
}
