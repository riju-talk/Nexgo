'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { PAGES } from '@/lib/data';
import { PATHS } from '@/lib/routes';
import { apiFetch } from '@/lib/api';
import { useAppState } from '@/lib/AppStateContext';
import { useReducedTransparency } from '@/lib/useReducedTransparency';
import * as T from '@/lib/theme';

const PANEL_SPRING = { type: 'spring', bounce: 0, duration: 0.28 };

// Every seller-facing screen, searchable by name, section or description.
const SCREENS = Object.entries(PAGES)
  .filter(([id]) => PATHS[id] && !id.startsWith('a-'))
  .map(([id, [group, title, sub]]) => ({ id, group, title, sub }));

const norm = (v) => String(v || '').toLowerCase();

export default function CommandPalette() {
  const { paletteOpen, setPaletteOpen, nav, setTrackFocus, showToast } = useAppState();
  const reduced = useReducedMotion();
  const reducedTransparency = useReducedTransparency();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [shipments, setShipments] = useState(null);
  const inputRef = useRef(null);

  // Load the seller's shipments once per opening so AWB / order / customer search is instant.
  useEffect(() => {
    if (!paletteOpen) return undefined;
    let live = true;
    apiFetch('/v1/shipments').then((x) => { if (live) setShipments(x.items || []); }).catch(() => { if (live) setShipments([]); });
    const t = window.setTimeout(() => inputRef.current?.focus(), 40);
    return () => { live = false; window.clearTimeout(t); };
  }, [paletteOpen]);

  const close = () => { setPaletteOpen(false); setQuery(''); setActive(0); };

  const groups = useMemo(() => {
    const q = norm(query).trim();
    const out = [];
    if (q) {
      const hits = (shipments || []).filter((s) => [s.awb, s.order_number, s.nexgo_order_id, s.customer_name, s.customer_phone, s.customer_pincode].some((v) => norm(v).includes(q))).slice(0, 6);
      const items = hits.map((s) => ({
        glyph: '#', label: `AWB ${s.awb}: ${s.customer_name}`, sub: `${s.courier_name} · ${String(s.state).replaceAll('_', ' ')}${s.customer_city ? ` · ${s.customer_city}` : ''}`, key: '⏎',
        run: () => { setTrackFocus(s.awb); nav('shipments'); },
      }));
      // A pasted AWB we do not hold still opens Track filtered to it, so the user sees the empty result rather than nothing.
      if (!hits.length && /^[a-z0-9]{8,}$/i.test(q)) items.push({ glyph: '#', label: `Track AWB ${query.trim()}`, sub: 'Open Track filtered to this AWB', key: '⏎', run: () => { setTrackFocus(query.trim()); nav('shipments'); showToast('No shipment with this AWB in your account yet.', 'error'); } });
      if (items.length) out.push({ label: `Shipments matching "${query.trim()}"`, items });
    }
    const pages = SCREENS.filter((s) => !q || [s.title, s.group, s.sub].some((v) => norm(v).includes(q)))
      .slice(0, q ? 8 : 10).map((s) => ({ glyph: '▸', label: s.title, sub: `${s.group} · ${s.sub}`, key: '', run: () => nav(s.id) }));
    if (pages.length) out.push({ label: q ? 'Go to' : 'Navigate', items: pages });
    return out;
  }, [query, shipments, nav, setTrackFocus, showToast]);

  const flat = groups.flatMap((g) => g.items);
  const run = (item) => { if (!item) return; close(); item.run(); };

  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(flat.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); run(flat[active]); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
  };

  let index = -1;
  return (
    <AnimatePresence>
      {paletteOpen && (
        <motion.div
          onClick={close}
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
              <div style={{ fontFamily: T.MONO, fontSize: 11, fontWeight: 600, color: '#14527f' }}>&gt;</div>
              <input
                ref={inputRef} value={query} onChange={(e) => { setQuery(e.target.value); setActive(0); }} onKeyDown={onKey}
                placeholder="Paste an AWB, order ID or customer, or jump to a screen" aria-label="Command palette"
                style={{ flex: 1, border: 0, outline: 'none', background: 'transparent', fontSize: 15, color: T.TEXT }}
              />
              <button type="button" onClick={close} style={{ fontFamily: T.MONO, fontSize: 10, color: T.TEXT_MUTED, border: `1px solid ${T.INPUT_BORDER}`, padding: '2px 5px', background: 'transparent', cursor: 'pointer' }}>ESC</button>
            </div>
            <div style={{ maxHeight: 400, overflowY: 'auto' }}>
              {!flat.length && <div style={{ padding: '22px 16px', fontSize: 13, color: T.TEXT_MUTED }}>{shipments === null && query ? 'Searching…' : 'Nothing matches. Try an AWB, order ID, customer name or a screen name.'}</div>}
              {groups.map((g) => (
                <div key={g.label}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: T.TEXT_MUTED, padding: '8px 16px 6px', background: T.SURFACE_SOFT, borderBottom: `1px solid ${T.DIVIDER}` }}>{g.label}</div>
                  {g.items.map((it) => {
                    index += 1;
                    const i = index;
                    return (
                      <div
                        key={`${g.label}-${i}`} onMouseEnter={() => setActive(i)} onClick={() => run(it)} className="nxc-palette-row"
                        style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '0 16px', height: 46, borderBottom: `1px solid ${T.ROW_DIVIDER}`, cursor: 'pointer', background: i === active ? 'var(--nx-surface-soft)' : 'var(--nx-surface)' }}
                      >
                        <div style={{ width: 22, height: 22, flex: '0 0 22px', border: '1.5px solid #5C5849', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: T.MONO, fontSize: 10, fontWeight: 600, color: '#5C5849' }}>{it.glyph}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 500 }}>{it.label}</div>
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
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
