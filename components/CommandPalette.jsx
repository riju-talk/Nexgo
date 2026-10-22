'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PAGES } from '@/lib/data';
import { PATHS } from '@/lib/routes';
import { adminApi, apiFetch } from '@/lib/api';
import { useAppState } from '@/lib/AppStateContext';
import * as T from '@/lib/theme';

const screensFor = (admin) => Object.entries(PAGES)
  .filter(([id]) => PATHS[id] && (admin ? id.startsWith('a-') : !id.startsWith('a-')))
  .map(([id, [group, title, sub]]) => ({ id, group, title, sub }));
const SELLER_SCREENS = screensFor(false);
const ADMIN_SCREENS = screensFor(true);

const norm = (v) => String(v || '').toLowerCase();
const nice = (v) => String(v || '').replaceAll('_', ' ');

// Results dropdown under the top-bar search box (see SearchBox). Seller mode searches the seller's own
// shipments, admin mode asks the platform search endpoint for sellers, AWBs and orders.
export default function CommandPalette({ admin = false }) {
  const { paletteOpen, setPaletteOpen, paletteQuery: query, setPaletteQuery, nav, setTrackFocus, showToast } = useAppState();
  const router = useRouter();
  const [active, setActive] = useState(0);
  const [shipments, setShipments] = useState(null);
  const [remote, setRemote] = useState({ q: '', data: null });
  const panelRef = useRef(null);
  const q = norm(query).trim();

  const finish = () => { setPaletteOpen(false); setPaletteQuery(''); setActive(0); document.getElementById('nx-search')?.blur(); };

  // Seller mode: load the seller's shipments once per opening so AWB / order / customer search is instant.
  useEffect(() => {
    if (!paletteOpen || admin) return undefined;
    let live = true;
    apiFetch('/v1/shipments').then((x) => { if (live) setShipments(x.items || []); }).catch(() => { if (live) setShipments([]); });
    return () => { live = false; };
  }, [paletteOpen, admin]);

  // Admin mode: debounced platform search.
  useEffect(() => {
    if (!admin || !paletteOpen || !q) return undefined;
    let live = true;
    const text = query.trim();
    const t = window.setTimeout(() => {
      adminApi.search(text).then((data) => { if (live) setRemote({ q: text, data }); }).catch(() => { if (live) setRemote({ q: text, data: { sellers: [], shipments: [], orders: [] } }); });
    }, 220);
    return () => { live = false; window.clearTimeout(t); };
  }, [admin, paletteOpen, q, query]);

  // A click outside the search box and the panel closes it.
  useEffect(() => {
    if (!paletteOpen) return undefined;
    const away = (e) => {
      if (panelRef.current?.contains(e.target)) return;
      if (e.target.closest?.('label')?.contains(document.getElementById('nx-search'))) return;
      setPaletteOpen(false);
    };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [paletteOpen, setPaletteOpen]);

  const groups = useMemo(() => {
    const out = [];
    const screens = admin ? ADMIN_SCREENS : SELLER_SCREENS;
    if (q && admin) {
      const d = remote.q === query.trim() ? remote.data : null;
      if (d?.sellers?.length) out.push({ label: 'Sellers', items: d.sellers.map((s) => ({ glyph: '◎', label: s.legal_name, sub: s.nexgo_code || 'Seller', key: '⏎', run: () => router.push(`/admin/sellers/${s.id}`) })) });
      if (d?.shipments?.length) out.push({ label: 'Shipments', items: d.shipments.map((s) => ({ glyph: '#', label: `AWB ${s.awb}`, sub: `${s.seller_name} · ${s.courier_name} · ${nice(s.state)}`, key: '⏎', run: () => { setTrackFocus(s.awb); nav('a-shipments'); } })) });
      if (d?.orders?.length) out.push({ label: 'Orders', items: d.orders.map((o) => ({ glyph: '▤', label: `Order ${o.order_number}`, sub: `${o.seller_name} · ${o.customer_name} · ${nice(o.state)}`, key: '⏎', run: () => { setTrackFocus(o.order_number); nav('a-orders'); } })) });
    } else if (q) {
      const hits = (shipments || []).filter((s) => [s.awb, s.order_number, s.nexgo_order_id, s.customer_name, s.customer_phone, s.customer_pincode].some((v) => norm(v).includes(q))).slice(0, 6);
      const items = hits.map((s) => ({
        glyph: '#', label: `AWB ${s.awb}: ${s.customer_name}`, sub: `${s.courier_name} · ${nice(s.state)}${s.customer_city ? ` · ${s.customer_city}` : ''}`, key: '⏎',
        run: () => { setTrackFocus(s.awb); nav('shipments'); },
      }));
      // A pasted AWB we do not hold still opens Track filtered to it, so the user sees the empty result rather than nothing.
      if (!hits.length && /^[a-z0-9]{8,}$/i.test(q)) items.push({ glyph: '#', label: `Track AWB ${query.trim()}`, sub: 'Open Track filtered to this AWB', key: '⏎', run: () => { setTrackFocus(query.trim()); nav('shipments'); showToast('No shipment with this AWB in your account yet.', 'error'); } });
      if (items.length) out.push({ label: `Shipments matching "${query.trim()}"`, items });
    }
    const pages = screens.filter((s) => !q || [s.title, s.group, s.sub].some((v) => norm(v).includes(q)))
      .slice(0, q ? 8 : 10).map((s) => ({ glyph: '▸', label: s.title, sub: `${s.group} · ${s.sub || ''}`, key: '', run: () => nav(s.id) }));
    if (pages.length) out.push({ label: q ? 'Go to' : 'Navigate', items: pages });
    return out;
  }, [admin, q, query, shipments, remote, nav, router, setTrackFocus, showToast]);

  const flat = groups.flatMap((g) => g.items);
  const run = (item) => { if (!item) return; finish(); item.run(); };

  // Arrow keys / Enter / Esc arrive from the search input as an event; read the latest list through a ref.
  const latest = useRef({});
  useEffect(() => { latest.current = { flat, active, paletteOpen, run }; });
  useEffect(() => {
    const onKey = (e) => {
      const { flat: list, active: i, paletteOpen: open, run: go } = latest.current;
      if (!open) return;
      if (e.detail === 'ArrowDown') setActive(Math.min(list.length - 1, i + 1));
      else if (e.detail === 'ArrowUp') setActive(Math.max(0, i - 1));
      else if (e.detail === 'Enter') go(list[i]);
      else if (e.detail === 'Escape') setPaletteOpen(false);
    };
    window.addEventListener('nx-search-key', onKey);
    return () => window.removeEventListener('nx-search-key', onKey);
  }, [setPaletteOpen]);

  useEffect(() => { setActive(0); }, [query]); // eslint-disable-line react-hooks/set-state-in-effect -- new text restarts the highlighted row
  if (!paletteOpen) return null;

  const waiting = q && (admin ? remote.q !== query.trim() : shipments === null);
  let index = -1;
  return (
    <div ref={panelRef} role="listbox" style={{ position: 'fixed', top: admin ? 56 : 64, left: '50%', transform: 'translateX(-50%)', zIndex: 100, width: 'min(640px,92vw)', background: T.SURFACE, border: `1px solid ${T.MENU_BORDER}`, borderRadius: 12, boxShadow: '0 24px 60px rgba(11,31,68,.22)', overflow: 'hidden' }}>
      <div style={{ maxHeight: 400, overflowY: 'auto' }}>
        {!flat.length && <div style={{ padding: '20px 16px', fontSize: 13, color: T.TEXT_MUTED }}>{waiting ? 'Searching…' : `Nothing matches "${query.trim()}". Try ${admin ? 'a seller, AWB or order number' : 'an AWB, order ID, customer name or a screen name'}.`}</div>}
        {groups.map((g) => (
          <div key={g.label}>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: T.TEXT_MUTED, padding: '8px 16px 6px', background: T.SURFACE_SOFT, borderBottom: `1px solid ${T.DIVIDER}` }}>{g.label}</div>
            {g.items.map((it) => {
              index += 1;
              const i = index;
              return (
                <div key={`${g.label}-${i}`} role="option" aria-selected={i === active} onMouseEnter={() => setActive(i)} onClick={() => run(it)}
                  style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '0 16px', height: 46, borderBottom: `1px solid ${T.ROW_DIVIDER}`, cursor: 'pointer', background: i === active ? 'var(--nx-surface-soft)' : 'var(--nx-surface)' }}>
                  <div style={{ width: 22, height: 22, flex: '0 0 22px', border: '1.5px solid #5C5849', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: T.MONO, fontSize: 10, fontWeight: 600, color: '#5C5849' }}>{it.glyph}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: T.TEXT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.label}</div>
                    <div style={{ fontSize: 12, color: T.TEXT_MUTED, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.sub}</div>
                  </div>
                  {it.key && <div style={{ fontFamily: T.MONO, fontSize: 10, color: T.TEXT_SECONDARY, border: `1px solid ${T.INPUT_BORDER}`, padding: '2px 5px' }}>{it.key}</div>}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '9px 16px', background: T.SURFACE_SOFT, borderTop: `1px solid ${T.DIVIDER}`, fontFamily: T.MONO, fontSize: 10, color: T.TEXT_MUTED }}>
        <div>UP/DOWN NAVIGATE</div><div>ENTER OPEN</div><div>ESC CLOSE</div><div style={{ marginLeft: 'auto' }}>{flat.length} RESULT{flat.length === 1 ? '' : 'S'}</div>
      </div>
    </div>
  );
}
