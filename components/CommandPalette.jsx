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
const rupees = (paise) => `₹${(Number(paise || 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const when = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');

// What the seller can type. A prefix (word + colon) picks the kind; without one the shape of the text decides (the server does that).
const KINDS = [
  ['awb:', 'AWB', 'awb:LS2627S0001111', 'Track a shipment by its AWB'],
  ['order:', 'Order number', 'order:#1042', 'Order number, or the store order id'],
  ['nx:', 'NEXGO order ID', 'nx:NX26100100003', 'Our own order ID'],
  ['phone:', 'Phone number', 'phone:9876543210', "A customer's mobile, any format"],
  ['pin:', 'Pincode', 'pin:411001', 'City, state and your parcels going there'],
  ['name:', 'Customer name', 'name:asha', 'Orders and shipments for a customer'],
  ['email:', 'Email', 'email:asha@example.com', 'A customer email'],
  ['status:', 'Shipment status', 'status:ndr', 'ndr · rto · ofd · transit · delivered · lost · pickup'],
  ['tag:', 'Tag', 'tag:priority', 'Shipments with a tag'],
  ['courier:', 'Courier', 'courier:delhivery', 'Shipments by courier'],
  ['wh:', 'Warehouse', 'wh:pune', 'A pickup warehouse'],
  ['inv:', 'Invoice', 'inv:NX/26-27/00418', 'A tax invoice'],
  ['pay:', 'Recharge / payment', 'pay:order_ABC123', 'A wallet recharge reference'],
  ['utr:', 'COD remittance', 'utr:778899', 'A COD payout bank reference'],
  ['ticket:', 'Support ticket', 'ticket:parcel', 'Your support tickets'],
];
const INTENT_LABEL = Object.fromEntries([...KINDS.map(([p, l]) => [p.replace(':', ''), l]), ['invoice', 'Invoice'], ['payment', 'Recharge / payment'], ['cod', 'COD remittance'], ['ticket', 'Support ticket'], ['warehouse', 'Warehouse'], ['any', 'Everything']]);

const TAB_OF = { booked: 'pickup', pickup_pending: 'pickup', pickup_scheduled: 'pickup', in_transit: 'in_transit', out_for_delivery: 'out_for_delivery', ndr: 'ndr', delivered: 'delivered', rto: 'rto', rto_in_transit: 'rto', lost: 'lost', cancelled: 'cancelled' };
const toneOf = (state) => (state === 'delivered' ? T.GREEN : ['ndr', 'rto', 'rto_in_transit', 'lost', 'cancelled'].includes(state) ? T.RED : state === 'out_for_delivery' || state === 'in_transit' ? T.ACCENT : '#B45309');

// Admin search understands a few prefixes too: seller:, awb:, order: (and a bare NXS code is a seller).
function adminIntent(raw) {
  const m = /^([a-z]{1,8})\s*[:=]\s*(.*)$/i.exec(raw.trim());
  const only = m ? { awb: 'shipments', waybill: 'shipments', order: 'orders', ord: 'orders', seller: 'sellers', s: 'sellers', code: 'sellers' }[m[1].toLowerCase()] : /^nxs\d+/i.test(raw.trim()) ? 'sellers' : null;
  return { only: only || null, text: only && m ? m[2].trim() : raw.trim() };
}

function Pill({ text, tone }) {
  return <span style={{ flex: '0 0 auto', fontSize: 10.5, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: tone, border: `1px solid ${tone}`, borderRadius: 99, padding: '2px 8px', opacity: 0.95, whiteSpace: 'nowrap' }}>{text}</span>;
}

// The big card shown beside the list for the highlighted shipment: what is going on with it, and what can be done, without leaving the page.
function Preview({ s, actions }) {
  const row = (k, v) => v ? <div style={{ display: 'flex', gap: 10, fontSize: 12.5, padding: '5px 0', borderBottom: `1px solid ${T.ROW_DIVIDER}` }}><span style={{ flex: '0 0 84px', color: T.TEXT_MUTED }}>{k}</span><span style={{ color: T.TEXT, minWidth: 0, overflowWrap: 'anywhere' }}>{v}</span></div> : null;
  return (
    <div style={{ padding: 16, borderLeft: `1px solid ${T.DIVIDER}`, background: T.SURFACE_SOFT, overflowY: 'auto', maxHeight: 400 }}>
      <div style={{ fontFamily: T.MONO, fontSize: 13, fontWeight: 700, color: T.TEXT, overflowWrap: 'anywhere' }}>{s.awb}</div>
      <div style={{ margin: '8px 0 10px' }}><Pill text={nice(s.rto_status && s.state === 'rto' ? `rto ${s.rto_status}` : s.state)} tone={toneOf(s.state)} /></div>
      {s.last_description && (
        <div style={{ padding: '8px 10px', borderRadius: 8, background: T.SURFACE, border: `1px solid ${T.DIVIDER}`, marginBottom: 8 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: T.TEXT_MUTED }}>Latest scan</div>
          <div style={{ fontSize: 12.5, color: T.TEXT, marginTop: 3 }}>{s.last_description}</div>
          <div style={{ fontSize: 11.5, color: T.TEXT_MUTED, marginTop: 2 }}>{[s.last_location, when(s.last_event_at)].filter(Boolean).join(' · ')}</div>
        </div>
      )}
      {row('Courier', s.courier_name)}
      {row('Order', [s.order_number, s.channel && nice(s.channel)].filter(Boolean).join(' · '))}
      {row('Customer', [s.customer_name, s.customer_phone].filter(Boolean).join(' · '))}
      {row('To', [s.customer_city, s.customer_pincode].filter(Boolean).join(' '))}
      {row('From', s.warehouse_city)}
      {row('Payment', s.payment_mode === 'cod' ? `COD ${rupees(s.cod_amount_paise)}` : 'Prepaid')}
      {row('Charge', s.shipping_charge_paise ? rupees(s.shipping_charge_paise) : '')}
      {row('Routing', s.routing_code)}
      {row('Tags', (s.tags || []).join(', '))}
      {row('Booked', when(s.booked_at))}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
        {actions.map(([label, fn, primary]) => <button key={label} type="button" onClick={fn} style={{ height: 28, padding: '0 10px', borderRadius: 7, border: `1px solid ${primary ? T.ACCENT : T.INPUT_BORDER}`, background: primary ? T.ACCENT : T.SURFACE, color: primary ? '#fff' : T.TEXT, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{label}</button>)}
      </div>
    </div>
  );
}

// Results dropdown under the top-bar search box (see SearchBox). Seller mode asks /v1/search, which understands prefixes (awb:, phone:, status: ...)
// and number shapes; admin mode asks the platform search for sellers, AWBs and orders.
export default function CommandPalette({ admin = false }) {
  const { paletteOpen, setPaletteOpen, paletteQuery: query, setPaletteQuery, nav, setTrackFocus, setTrackHandoff, showToast, vw } = useAppState();
  const router = useRouter();
  const [active, setActive] = useState(0);
  const [remote, setRemote] = useState({ q: '', data: null });
  const panelRef = useRef(null);
  const [anchor, setAnchor] = useState(null); // where the search box is on screen, so the panel opens under it and not under the window centre
  const q = norm(query).trim();
  const help = !q || q === '?' || q === 'help';
  const ai = useMemo(() => adminIntent(query), [query]);

  const finish = () => { setPaletteOpen(false); setPaletteQuery(''); setActive(0); document.getElementById('nx-search')?.blur(); };

  // Debounced server search (seller: /v1/search, admin: platform search).
  useEffect(() => {
    if (!paletteOpen || help) return undefined;
    let live = true;
    const text = query.trim();
    const t = window.setTimeout(() => {
      const done = (data) => { if (live) setRemote({ q: text, data }); };
      if (admin) adminApi.search(ai.text).then(done).catch(() => done({ sellers: [], shipments: [], orders: [] }));
      else apiFetch(`/v1/search?q=${encodeURIComponent(text)}`).then(done).catch(() => done({ error: true }));
    }, 200);
    return () => { live = false; window.clearTimeout(t); };
  }, [admin, paletteOpen, help, query, ai.text]);

  // Measure the search box whenever the panel is open (and when the window or layout moves).
  useEffect(() => {
    if (!paletteOpen) return undefined;
    const measure = () => {
      const box = document.getElementById('nx-search')?.closest('label')?.getBoundingClientRect();
      if (box) setAnchor({ left: box.left, width: box.width, bottom: box.bottom, vw: window.innerWidth });
    };
    measure();
    window.addEventListener('resize', measure);
    const t = window.setInterval(measure, 400); // the sidebar can collapse while the panel is open
    return () => { window.removeEventListener('resize', measure); window.clearInterval(t); };
  }, [paletteOpen]);

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

  const copy = (text, done) => { navigator.clipboard?.writeText(text).then(() => showToast(done)).catch(() => showToast('Copy failed', 'error')); };
  const openTrack = (h) => { setTrackHandoff(h); nav('shipments'); };

  const groups = useMemo(() => {
    const out = [];
    const screens = admin ? ADMIN_SCREENS : SELLER_SCREENS;
    const d = remote.q === query.trim() ? remote.data : null;
    let intent = null;

    if (admin && !help) {
      if (d) {
        const want = (k) => !ai.only || ai.only === k;
        if (want('sellers') && d.sellers?.length) out.push({ label: 'Sellers', items: d.sellers.map((s) => ({ glyph: '◎', label: s.legal_name, sub: s.nexgo_code || 'Seller', key: '⏎', run: () => router.push(`/admin/sellers/${s.id}`) })) });
        if (want('shipments') && d.shipments?.length) out.push({ label: 'Shipments', items: d.shipments.map((s) => ({ glyph: '#', label: `AWB ${s.awb}`, sub: `${s.seller_name} · ${s.courier_name}`, pill: { text: nice(s.state), tone: toneOf(s.state) }, key: '⏎', run: () => { setTrackFocus(s.awb); nav('a-shipments'); } })) });
        if (want('orders') && d.orders?.length) out.push({ label: 'Orders', items: d.orders.map((o) => ({ glyph: '▤', label: `Order ${o.order_number}`, sub: `${o.seller_name} · ${o.customer_name}`, pill: { text: nice(o.state), tone: T.TEXT_MUTED }, key: '⏎', run: () => { setTrackFocus(o.order_number); nav('a-orders'); } })) });
      }
    } else if (!admin && !help && d && !d.error) {
      intent = d.intent;
      const ship = d.shipments || [];
      if (d.statusCounts?.states) {
        const tab = TAB_OF[d.statusCounts.states[0]];
        out.push({ label: 'Status', items: [{ glyph: '◔', label: `${d.statusCounts.total} shipment${d.statusCounts.total === 1 ? ' is' : 's are'} ${nice(intent.value)}`, sub: 'Open Track on that tab', key: '⏎', run: () => openTrack({ tab, q: '', tag: '' }) }] });
      }
      if (d.pincode) {
        const p = d.pincode;
        const items = [{ glyph: '⌖', label: p.known ? `${p.pincode} · ${p.city}, ${p.state}` : `${p.pincode} is not in the pincode directory`, sub: p.blocked ? 'Blocked by the platform: no courier delivers here' : 'Check which couriers deliver here', pill: p.blocked ? { text: 'blocked', tone: T.RED } : null, key: '⏎', run: () => nav('pincode') }];
        if (p.shipments) items.push({ glyph: '#', label: `${p.shipments} of your shipment${p.shipments === 1 ? '' : 's'} went to ${p.pincode}`, sub: 'Open them in Track', key: '', run: () => openTrack({ q: p.pincode, tab: 'all', tag: '' }) });
        out.push({ label: 'Pincode', items });
      }
      if (ship.length) {
        const items = ship.map((s) => ({
          glyph: '#', label: `${s.awb} · ${s.customer_name}`, sub: `${s.courier_name} · ${s.order_number}${s.customer_city ? ` · ${s.customer_city}` : ''}${s.payment_mode === 'cod' ? ` · COD ${rupees(s.cod_amount_paise)}` : ''}`,
          pill: { text: nice(s.state), tone: toneOf(s.state) }, key: '⏎', preview: s, run: () => { setTrackFocus(s.awb); nav('shipments'); },
        }));
        if (ship.length > 1 && !['status'].includes(intent.kind)) items.push({ glyph: '≡', label: `Open all ${ship.length === 8 ? '' : ship.length + ' '}matches in Track`, sub: 'See them together with filters', key: '', run: () => openTrack(intent.kind === 'tag' ? { tab: 'all', tag: intent.value, q: '' } : { tab: 'all', q: intent.kind === 'courier' || intent.kind === 'warehouse' ? '' : intent.value, tag: '' }) });
        out.push({ label: `Shipments · ${INTENT_LABEL[intent.kind] || ''}`, items });
      }
      if (d.orders?.length) out.push({ label: 'Orders without a courier yet', items: d.orders.map((o) => ({ glyph: '▤', label: `Order ${o.order_number} · ${o.customer_name}`, sub: `${nice(o.state)} · ${o.payment_mode === 'cod' ? `COD ${rupees(o.cod_amount_paise)}` : 'Prepaid'}${o.customer_city ? ` · ${o.customer_city}` : ''}`, pill: { text: 'not shipped', tone: '#B45309' }, key: '⏎', run: () => openTrack({ tab: 'failed', q: o.order_number, tag: '' }) })) });
      if (d.invoices?.length) out.push({ label: 'Invoices', items: d.invoices.map((i) => ({ glyph: '₹', label: i.invoice_number, sub: `${rupees(i.total_paise)} · ${String(i.period_start).slice(0, 10)} to ${String(i.period_end).slice(0, 10)}`, pill: { text: nice(i.status), tone: T.TEXT_MUTED }, key: '⏎', run: () => nav('invoice') })) });
      if (d.tickets?.length) out.push({ label: 'Support tickets', items: d.tickets.map((t) => ({ glyph: '?', label: t.subject, sub: `${t.category} · ${t.priority} · ${when(t.created_at)}`, pill: { text: nice(t.state), tone: T.TEXT_MUTED }, key: '⏎', run: () => nav('support') })) });
      if (d.payments?.length) out.push({ label: 'Wallet recharges', items: d.payments.map((r) => ({ glyph: '₹', label: `${rupees(r.amount_paise)} · ${r.provider_order_id}`, sub: `${r.provider_payment_id || 'no payment id yet'} · ${when(r.created_at)}`, pill: { text: nice(r.status), tone: r.status === 'paid' ? T.GREEN : T.TEXT_MUTED }, key: '⏎', run: () => nav('recharges') })) });
      if (d.cod?.length) out.push({ label: 'COD remittances', items: d.cod.map((c) => ({ glyph: '₹', label: `${c.bank_reference} · ${rupees(c.net_remitted_paise)}`, sub: `${String(c.cycle_start).slice(0, 10)} to ${String(c.cycle_end).slice(0, 10)}`, pill: { text: nice(c.status), tone: c.status === 'remitted' ? T.GREEN : T.TEXT_MUTED }, key: '⏎', run: () => nav('cod') })) });
      if (d.warehouses?.length) out.push({ label: 'Warehouses', items: d.warehouses.map((w) => ({ glyph: '⌂', label: w.name, sub: `${w.city} · ${w.pincode}`, key: '⏎', run: () => nav('warehouse') })) });
    }

    if (!admin && help) {
      out.push({ label: 'Search by (type the prefix, or just paste a number)', items: KINDS.map(([prefix, label, example, hint]) => ({ glyph: '›', label: label, sub: `${hint}  ·  e.g. ${example}`, key: prefix, insert: prefix })) });
    }
    const pages = screens.filter((s) => help || [s.title, s.group, s.sub].some((v) => norm(v).includes(q)))
      .slice(0, q && !help ? 6 : 10).map((s) => ({ glyph: '▸', label: s.title, sub: `${s.group} · ${s.sub || ''}`, key: '', run: () => nav(s.id) }));
    if (pages.length) out.push({ label: help ? 'Navigate' : 'Go to', items: pages });
    return { out, intent };
  }, [admin, help, q, query, remote, ai, nav, router, setTrackFocus, setTrackHandoff]); // eslint-disable-line react-hooks/exhaustive-deps -- openTrack is a stable wrapper over setTrackHandoff + nav

  const flat = groups.out.flatMap((g) => g.items);
  const run = (item) => {
    if (!item) return;
    if (item.insert) { setPaletteQuery(item.insert); document.getElementById('nx-search')?.focus(); return; } // keep the box open: the prefix is only a starting point
    finish(); item.run();
  };

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

  const fresh = remote.q === query.trim();
  const waiting = !help && !fresh;
  const failed = !admin && fresh && remote.data?.error;
  const current = flat[active];
  const preview = !admin && vw >= 820 ? current?.preview : null;
  const detected = !admin && !help && fresh && groups.intent && groups.intent.kind !== 'any' ? groups.intent : null;
  const actions = preview ? [
    ['Open in Track', () => run(current), true],
    ['Copy AWB', () => copy(preview.awb, 'AWB copied')],
    ['Print label', () => { window.open(`/documents/label?ids=${preview.id}`, '_blank', 'noopener'); }],
    ...(preview.state === 'ndr' ? [['Go to NDR', () => { finish(); nav('ndr'); }]] : []),
    ['Bulk track', () => { finish(); nav('bulk-track'); }],
  ] : [];
  // Centre the panel under the search box, then keep it fully on screen.
  const wanted = preview ? 920 : 640;
  const place = anchor
    ? (() => { const width = Math.min(wanted, anchor.vw - 16); const centred = anchor.left + anchor.width / 2 - width / 2; return { width, left: Math.max(8, Math.min(centred, anchor.vw - width - 8)) }; })()
    : { width: `min(${wanted}px,92vw)`, left: '50%' };
  const starts = groups.out.map((g, gi) => groups.out.slice(0, gi).reduce((n, x) => n + x.items.length, 0)); // row number of each group's first item
  return (
    <div ref={panelRef} role="listbox" style={{ position: 'fixed', top: anchor ? anchor.bottom + 8 : admin ? 56 : 64, left: place.left, transform: place.left === '50%' ? 'translateX(-50%)' : undefined, zIndex: 100, width: place.width, background: T.SURFACE, border: `1px solid ${T.MENU_BORDER}`, borderRadius: 12, boxShadow: '0 24px 60px rgba(11,31,68,.22)', overflow: 'hidden' }}>
      {detected && (
        <div style={{ padding: '7px 16px', fontSize: 12, color: T.TEXT_SECONDARY, background: 'rgba(56,119,252,.08)', borderBottom: `1px solid ${T.DIVIDER}` }}>
          {detected.explicit ? 'Searching' : 'Looks like'} <b style={{ color: T.TEXT }}>{INTENT_LABEL[detected.kind]}</b>{detected.value ? <> · <span style={{ fontFamily: T.MONO }}>{detected.value}</span></> : null}
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: preview ? 'minmax(0,1fr) 320px' : '1fr' }}>
        <div style={{ maxHeight: 400, overflowY: 'auto' }}>
          {!flat.length && <div style={{ padding: '20px 16px', fontSize: 13, color: T.TEXT_MUTED }}>{waiting ? 'Searching…' : failed ? 'Search is unavailable right now. Try again in a moment.' : `Nothing matches "${query.trim()}". Try ${admin ? 'a seller, AWB or order number' : 'an AWB, order ID, phone, pincode or "?" to see every search type'}.`}</div>}
          {groups.out.map((g, gi) => (
            <div key={g.label}>
              <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: T.TEXT_MUTED, padding: '8px 16px 6px', background: T.SURFACE_SOFT, borderBottom: `1px solid ${T.DIVIDER}` }}>{g.label}</div>
              {g.items.map((it, ii) => {
                const i = starts[gi] + ii;
                return (
                  <div key={`${g.label}-${i}`} role="option" aria-selected={i === active} onMouseEnter={() => setActive(i)} onClick={() => run(it)}
                    style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '0 16px', height: 46, borderBottom: `1px solid ${T.ROW_DIVIDER}`, cursor: 'pointer', background: i === active ? 'var(--nx-surface-soft)' : 'var(--nx-surface)' }}>
                    <div style={{ width: 22, height: 22, flex: '0 0 22px', border: '1.5px solid #5C5849', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: T.MONO, fontSize: 10, fontWeight: 600, color: '#5C5849' }}>{it.glyph}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: T.TEXT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.label}</div>
                      <div style={{ fontSize: 12, color: T.TEXT_MUTED, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.sub}</div>
                    </div>
                    {it.pill && <Pill text={it.pill.text} tone={it.pill.tone} />}
                    {it.key && <div style={{ fontFamily: T.MONO, fontSize: 10, color: T.TEXT_SECONDARY, border: `1px solid ${T.INPUT_BORDER}`, padding: '2px 5px' }}>{it.key}</div>}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        {preview && <Preview s={preview} actions={actions} />}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '9px 16px', background: T.SURFACE_SOFT, borderTop: `1px solid ${T.DIVIDER}`, fontFamily: T.MONO, fontSize: 10, color: T.TEXT_MUTED }}>
        <div>UP/DOWN NAVIGATE</div><div>ENTER OPEN</div><div>ESC CLOSE</div>{!admin && <div>? ALL SEARCH TYPES</div>}<div style={{ marginLeft: 'auto' }}>{flat.length} RESULT{flat.length === 1 ? '' : 'S'}</div>
      </div>
    </div>
  );
}
