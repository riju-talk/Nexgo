'use client';

import { assignInBatches } from '@/lib/assignBatches';
import { askConfirm } from '@/lib/dialog';
import { useSellerSession } from '@/lib/useSellerSession';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import { useAppState } from '@/lib/AppStateContext';
import * as T from '@/lib/theme';
import { FORMATS, saveRows } from '@/lib/exportFile';
import { diagnose, failedSheet, readCorrections, toPatch } from '@/lib/failedOrders';
import { LoadMore, Spinner, TableSkeleton } from './Kit';
import { useInfiniteList } from '@/lib/useInfiniteList';
import { cancelInBackground } from '@/lib/cancelBatches';
import { ActiveCancelBanner, BatchProgressDialog } from './BatchProgress';
import { setJobModal } from '@/lib/jobProgress';
import CourierChooser, { ActiveAssignBanner } from './CourierChooser';

const CARD = { background: 'var(--nx-surface)', border: '1px solid var(--nx-border)', borderRadius: 12, boxShadow: '0 1px 2px rgba(20,44,66,.04), 0 10px 28px rgba(20,44,66,.055)' };
const FIELD = { height: 36, boxSizing: 'border-box', border: `1px solid ${T.INPUT_BORDER}`, borderRadius: 8, background: T.SURFACE, color: T.TEXT, padding: '0 10px', fontSize: 13, outline: 'none' };
const inr = (paise) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Number(paise || 0) / 100);
const inr0 = (paise) => `₹${(Number(paise || 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const kg = (g) => `${(Number(g || 0) / 1000).toFixed(2)} kg`;
const title = (v = '') => String(v).replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const stamp = (v) => (v ? new Date(v).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—');
const day = (v) => (v ? new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const isoDay = (v) => new Date(new Date(v).getTime() - new Date(v).getTimezoneOffset() * 60000).toISOString().slice(0, 10);

// Happy-path rail. Pickup-side states all sit on the first step; NDR/RTO/cancelled show as a flagged state instead.
const STAGES = ['booked', 'in_transit', 'out_for_delivery', 'delivered'];
const PICKUP = ['booked', 'pickup_pending', 'pickup_scheduled'];
const RTO = ['rto', 'rto_in_transit'];
const CLOSED = ['delivered', 'cancelled', 'rto', 'lost'];
const stageIndex = (state) => (PICKUP.includes(state) ? 0 : STAGES.indexOf(state));
const isDelayed = (r) => !!r.promised_delivery_at && !CLOSED.includes(r.state) && new Date(r.promised_delivery_at) < new Date();

// Orders with no courier yet: 'ready' = the order is complete and only needs a courier assigned, 'failed' = something in the order must be fixed first.
const isUnassigned = (r) => r.state === 'failed' || r.state === 'ready';

const TABS = [
  ['all', 'All', (r) => r.state !== 'failed'],
  ['ready', 'Ready to ship', (r) => r.state === 'ready'],
  ['pickup', 'Pickup Pending', (r) => PICKUP.includes(r.state) && !r.courier_cancelled_at],
  ['in_transit', 'In Transit', (r) => r.state === 'in_transit'],
  ['out_for_delivery', 'OFD', (r) => r.state === 'out_for_delivery'],
  ['ndr', 'NDR', (r) => r.state === 'ndr'],
  ['delivered', 'Delivered', (r) => r.state === 'delivered'],
  ['rto', 'RTO', (r) => RTO.includes(r.state)],
  ['lost', 'Lost', (r) => r.state === 'lost' || r.rto_status === 'lost'],
  ['cancelled', 'Cancelled', (r) => r.state === 'cancelled'],
  // Orders that could not be booked (fix and re-assign) and parcels the courier cancelled on its side (re-book).
  ['failed', 'Exception & Error', (r) => r.state === 'failed' || (!!r.courier_cancelled_at && r.state !== 'cancelled')],
];
const CHANNELS = [['single', 'Single created'], ['bulk_upload', 'Bulk upload'], ['shopify', 'Shopify'], ['amazon', 'Amazon'], ['woocommerce', 'WooCommerce'], ['opencart', 'OpenCart'], ['magento', 'Magento']];
const channelName = (c) => (CHANNELS.find(([k]) => k === c) || [null, title(c || 'single')])[1];
const modeOf = (r) => (/air|express/i.test(r.service_type || '') ? 'Air' : 'Surface');
const WHATSAPP = { not_sent: 'Not sent', sent: 'Sent', delivered: 'Delivered', read: 'Read', failed: 'Failed' };
const waTone = (w) => (w === 'read' || w === 'delivered' ? T.GREEN : w === 'failed' ? T.RED : w === 'sent' ? T.ACCENT : T.TEXT_MUTED);

const tone = (state) => (state === 'delivered' || state === 'ready' ? T.GREEN : state === 'ndr' || RTO.includes(state) ? T.AMBER : state === 'cancelled' || state === 'failed' || state === 'lost' ? T.RED : T.ACCENT);
const label = (state) => (state === 'failed' ? 'Needs fixing' : state === 'ready' ? 'Ready to ship' : state === 'rto_in_transit' ? 'RTO in transit' : state === 'rto' ? 'RTO' : state === 'ndr' ? 'NDR' : title(state));

function Pill({ state }) {
  const c = tone(state);
  return <span style={{ display: 'inline-flex', padding: '3px 8px', borderRadius: 99, color: c, background: `${c}14`, fontWeight: 740, fontSize: 11.5, whiteSpace: 'nowrap' }}>{label(state)}</span>;
}

function Btn({ children, onClick, primary, danger, loading, disabled, small }) {
  const off = disabled || loading;
  return <button type="button" disabled={off} aria-busy={loading || undefined} onClick={onClick} style={{ height: small ? 28 : 32, padding: `0 ${small ? 9 : 11}px`, borderRadius: 8, border: `1px solid ${primary ? T.NAVY : danger ? T.RED : T.INPUT_BORDER}`, background: primary ? T.NAVY : T.SURFACE, color: primary ? '#fff' : danger ? T.RED : T.TEXT, fontSize: small ? 11.5 : 12, fontWeight: 720, cursor: loading ? 'progress' : disabled ? 'not-allowed' : 'pointer', opacity: off ? 0.65 : 1, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 6 }}>{loading && <Spinner size={12} />}{children}</button>;
}

// Four-step progress rail for the happy path; NDR/RTO/cancelled show as a flagged state instead.
function Progress({ state }) {
  const idx = stageIndex(state);
  const off = idx < 0;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 4, margin: '14px 0 4px' }}>
      {STAGES.map((s, i) => (
        <div key={s}>
          <div style={{ height: 5, borderRadius: 4, background: !off && i <= idx ? tone(state) : T.BORDER }} />
          <div style={{ marginTop: 6, fontSize: 10.5, fontWeight: !off && i === idx ? 750 : 560, color: !off && i <= idx ? T.TEXT_LABEL : T.TEXT_MUTED }}>{s === 'booked' ? 'Booked' : title(s)}</div>
        </div>
      ))}
    </div>
  );
}

const openDocs = (kind, ids) => window.open(`/documents/${kind}?ids=${ids.join(',')}`, '_blank', 'noopener');
const copyText = (text, showToast, done) => { navigator.clipboard?.writeText(text).then(() => showToast(done)).catch(() => showToast('Copy is not available in this browser', 'error')); };

// Auto-assign couriers to not-yet-shipped orders using the seller's courier priority list (Settings > Courier rules).

function Detail({ shipment, mobile, onClose, reload, onChoose }) {
  const { showToast, nav } = useAppState();
  const [events, setEvents] = useState(null);
  const cancellable = ['booked', 'pickup_pending', 'pickup_scheduled'].includes(shipment.state);
  const [cancelling, setCancelling] = useState(false);
  const cancelShipment = async () => {
    if (cancelling) return;
    if (!(await askConfirm({ title: 'Are you sure?', message: `Cancel shipment ${shipment.awb}? The shipping charge is credited back to your wallet.`, confirmLabel: 'Yes, continue', danger: true }))) return;
    setCancelling(true);
    try { const r = await apiFetch(`/v1/shipments/${shipment.id}/cancel`, { method: 'POST' }); showToast(`Shipment cancelled. ${inr(r.refundedPaise)} credited to your wallet.`); await reload(); onClose(); }
    catch (e) { showToast(e.message || 'Shipment could not be cancelled', 'error'); setCancelling(false); }
  };

  useEffect(() => {
    let live = true;
    if (shipment.state === 'failed' || shipment.state === 'ready') return undefined; // no courier yet, nothing to track
    apiFetch(`/v1/shipments/${shipment.id}/tracking`).then((x) => live && setEvents(x.items || [])).catch(() => live && setEvents([]));
    return () => { live = false; };
  }, [shipment.id, shipment.state]);

  const delayed = isDelayed(shipment);
  const failedOrder = isUnassigned(shipment);
  const facts = [
    ['Order', shipment.order_number],
    ['NEXGO order ID', shipment.nexgo_order_id],
    ['Channel', channelName(shipment.channel)],
    ['Tags', (shipment.tags || []).length ? shipment.tags.map((t) => `#${t}`).join(' ') : '—'],
    ['Courier', shipment.courier_name ? `${shipment.courier_name} · ${shipment.service_name} (${modeOf(shipment)})` : 'Not assigned'],
    ['Deliver to', `${shipment.customer_name}, ${shipment.customer_city} ${shipment.customer_pincode}`],
    ['Customer phone', shipment.customer_phone || '—'],
    ['Pickup from', `${shipment.warehouse_name} · ${shipment.warehouse_city} ${shipment.warehouse_pincode}`],
    ['Payment', shipment.payment_mode === 'cod' ? `COD ${inr(shipment.cod_amount_paise)}` : 'Prepaid'],
    ['Products', `${shipment.product_names || '—'} (qty ${shipment.quantity ?? 0})`],
    ['Weight', `${kg(shipment.total_weight_g)} dead · ${kg(shipment.chargeable_weight_g)} billed`],
    ['Freight charge', isUnassigned(shipment) ? '—' : inr(shipment.shipping_charge_paise)],
    ['WhatsApp', WHATSAPP[shipment.whatsapp_status] || 'Not sent'],
    ['Order value', inr(shipment.subtotal_paise)],
    ['Booked', stamp(shipment.booked_at)],
    [CLOSED.includes(shipment.state) && shipment.state === 'delivered' ? 'Delivered' : 'Expected delivery', shipment.state === 'delivered' ? stamp(shipment.delivered_at) : day(shipment.promised_delivery_at)],
  ];

  return (
    <aside style={{ ...CARD, padding: 18, position: mobile ? 'static' : 'sticky', top: 120, alignSelf: 'start', maxHeight: mobile ? 'none' : 'calc(100vh - 150px)', overflowY: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <span style={{ color: T.TEXT_MUTED, fontSize: 11, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase' }}>AWB</span>
          <b style={{ display: 'block', marginTop: 5, fontFamily: T.MONO, fontSize: 16, color: T.TEXT, wordBreak: 'break-all' }}>{shipment.awb || 'Not generated'}</b>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}><Pill state={shipment.state} /><button aria-label="Close tracking panel" onClick={onClose} style={{ border: 0, background: 'transparent', color: T.TEXT_MUTED, fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>×</button></div>
      </div>
      {delayed && <div style={{ marginTop: 12, padding: '8px 10px', borderRadius: 8, background: `${T.RED}12`, color: T.RED, fontSize: 12.5, fontWeight: 650 }}>Past its promised delivery date ({day(shipment.promised_delivery_at)}).</div>}
      {failedOrder ? (shipment.state === 'ready' ? <div style={{ marginTop: 12, padding: '8px 10px', borderRadius: 8, background: `${T.GREEN}14`, color: T.TEXT, fontSize: 12.5, fontWeight: 650 }}>This order is ready. Click “Book now” in the list to choose a courier.</div> : <div style={{ marginTop: 12, padding: '8px 10px', borderRadius: 8, background: `${T.RED}12`, color: T.RED, fontSize: 12.5, fontWeight: 650 }}>This order needs fixing before a courier can be booked. Correct the order details (mobile number, address, pincode, weight and size), then book a courier.</div>) : <Progress state={shipment.state} />}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 14px', margin: '14px 0', paddingTop: 14, borderTop: `1px solid ${T.DIVIDER}` }}>
        {facts.map(([k, v]) => (
          <div key={k} style={{ minWidth: 0 }}><span style={{ color: T.TEXT_MUTED, fontSize: 10.5, fontWeight: 800, letterSpacing: '.07em', textTransform: 'uppercase' }}>{k}</span><div style={{ marginTop: 4, color: T.TEXT, fontSize: 13, fontWeight: 620, wordBreak: 'break-word' }}>{v}</div></div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 14 }}>
        {failedOrder ? <Btn primary onClick={() => onChoose([shipment])}>Choose courier</Btn> : <><Btn primary onClick={() => openDocs('label', [shipment.id])}>Print label</Btn><Btn onClick={() => openDocs('invoice', [shipment.id])}>Invoice</Btn><Btn onClick={() => copyText(shipment.awb, showToast, 'AWB copied')}>Copy AWB</Btn></>}
        {cancellable && <Btn danger loading={cancelling} onClick={cancelShipment}>Cancel shipment</Btn>}
        {shipment.state === 'ndr' && <Btn onClick={() => nav('ndr')}>Resolve NDR</Btn>}
        {RTO.includes(shipment.state) && <Btn onClick={() => nav('rto')}>View RTO</Btn>}
      </div>
      {!failedOrder && <b style={{ color: T.TEXT, fontSize: 13.5 }}>Tracking history</b>}
      {!failedOrder && <div style={{ marginTop: 10 }}>
        {!events ? <span style={{ color: T.TEXT_MUTED, fontSize: 13 }}>Loading scans…</span>
          : !events.length ? <span style={{ color: T.TEXT_MUTED, fontSize: 13 }}>The courier has not posted a scan yet.</span>
          : events.map((e, i) => (
            <div key={`${e.occurred_at}-${i}`} style={{ display: 'grid', gridTemplateColumns: '14px 1fr', gap: 10, paddingBottom: 14 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}><span style={{ width: 10, height: 10, marginTop: 3, borderRadius: 99, background: i === 0 ? tone(shipment.state) : T.BORDER }} />{i < events.length - 1 && <span style={{ flex: 1, width: 2, background: T.BORDER, marginTop: 3 }} />}</div>
              <div><b style={{ display: 'block', color: T.TEXT_LABEL, fontSize: 13 }}>{e.description || title(e.state)}</b><small style={{ display: 'block', marginTop: 3, color: T.TEXT_MUTED }}>{stamp(e.occurred_at)}{e.location ? ` · ${e.location}` : ''}</small></div>
            </div>
          ))}
      </div>}
    </aside>
  );
}

const HEAD = { padding: '10px 12px', textAlign: 'left', fontSize: 10.5, letterSpacing: '.07em', textTransform: 'uppercase', color: T.TEXT_MUTED, background: 'var(--nx-table-head-bg)', whiteSpace: 'nowrap' };
const CELL = { padding: '12px', borderTop: `1px solid ${T.DIVIDER}`, fontSize: 13, color: T.TEXT, verticalAlign: 'top' };
const SUB = { display: 'block', marginTop: 3, color: T.TEXT_MUTED, fontSize: 11.5 };

export default function LiveTrack({ mobile }) {
  const { me } = useSellerSession();
  const allowed = (key) => !me?.permissions || me.role === 'owner' || me.permissions.includes(key);
  const canExport = allowed('shipments.export');
  const canExportCustomer = allowed('shipments.export_customer');
  const { nav, showToast, trackFocus, setTrackFocus, trackHandoff, setTrackHandoff } = useAppState();
  const [cancelDlg, setCancelDlg] = useState(null); // the cancellation progress dialog (see runCancel)
  // While this page's own dialog is open the progress card stays out of the way; hide the dialog and the card takes over.
  useEffect(() => { setJobModal('cancel', !!(cancelDlg && !cancelDlg.hidden && cancelDlg.running)); }, [cancelDlg]);
  const [chooser, setChooser] = useState(null); // not-yet-shipped orders the seller is choosing a courier for
  const [tab, setTab] = useState('all');
  const EMPTY = { q: '', courier: '', pay: '', mode: '', channel: '', warehouse: '', tag: '', from: '', to: '' };
  const [f, setF] = useState(EMPTY);
  const [qf, setQf] = useState(EMPTY); // the filters the server is asked for: typing is applied after a short pause
  const [tagInput, setTagInput] = useState('');
  const [allTags, setAllTags] = useState([]);
  const [options, setOptions] = useState({ couriers: [], warehouses: [] });
  const [counts, setCounts] = useState({});
  const [stale, setStale] = useState(false);
  const [working, setWorking] = useState('');
  const [exportFormat, setExportFormat] = useState('csv');
  const [selectedId, setSelectedId] = useState(null);
  const fixInput = useRef(null);
  const [fixing, setFixing] = useState(false);
  const [fixReport, setFixReport] = useState(null);
  const focusAwb = useRef('');

  useEffect(() => {
    const t = setTimeout(() => setQf(f), 300);
    return () => clearTimeout(t);
  }, [f]);

  // The query string for the server: the status tab (when wanted) plus every active filter.
  const qs = useCallback((base, filters = qf) => {
    const p = new URLSearchParams();
    Object.entries({ ...filters, ...base }).forEach(([k, v]) => { if (v !== '' && v !== undefined && v !== null) p.set(k, v); });
    return p.toString();
  }, [qf]);
  // Order rows (no courier yet) are shaped like shipment rows so the table treats both the same.
  const norm = (r) => (r.kind === 'order' ? { ...r, awb: '', booked_at: r.created_at, shipping_charge_paise: 0, chargeable_weight_g: r.total_weight_g, whatsapp_status: 'not_sent' } : r);
  const list = useInfiniteList({
    pageSize: 50,
    deps: [tab, qf],
    fetchPage: (cursor, limit) => apiFetch(`/v1/shipments/list?${qs({ tab, limit, cursor })}`).then((x) => ({ items: (x.items || []).map(norm), nextCursor: x.nextCursor, total: x.total })),
  });
  const listRef = useRef(list);
  useEffect(() => { listRef.current = list; });
  const items = list.items;

  const loadSummary = useCallback(() => apiFetch(`/v1/shipments/summary?${qs({})}`).then((x) => { setCounts(x.counts || {}); return x.counts || {}; }).catch(() => null), [qs]);
  useEffect(() => { loadSummary(); }, [loadSummary]);  
  const loadTags = useCallback(() => apiFetch('/v1/shipments/tags').then((x) => setAllTags(x.items || [])).catch(() => {}), []);
  useEffect(() => { loadTags(); }, [loadTags]);
  useEffect(() => { apiFetch('/v1/shipments/filters').then((x) => setOptions({ couriers: x.couriers || [], warehouses: x.warehouses || [] })).catch(() => {}); }, []);

  // Reload what is on screen after something changed: replace the first batch quietly, or start over if the user had scrolled further.
  const load = useCallback(async () => {
    setStale(false);
    const did = await listRef.current.refreshFirst();
    if (!did) listRef.current.reload();
    await Promise.all([loadSummary(), loadTags()]);
  }, [loadSummary, loadTags]);
  const [refreshing, setRefreshing] = useState(false);
  const refresh = async () => { setRefreshing(true); try { await load(); showToast('Shipments refreshed'); } finally { setRefreshing(false); } };
  // Orders created or cancelled elsewhere (another tab, a bulk upload, a webhook) show up without a reload: only the small count request runs
  // every 30 s; the list is refreshed when a count moved (or at once when the tab is shown again). If the user has scrolled down, a notice offers the refresh.
  useEffect(() => {
    const poll = async () => {
      if (document.visibilityState !== 'visible') return;
      const c = await loadSummary();
      const l = listRef.current;
      if (c && l.started && !l.loading && c[tab] !== undefined && l.total !== undefined && c[tab] !== l.total) { const did = await l.refreshFirst(); if (!did) setStale(true); }
    };
    const shown = () => { if (document.visibilityState === 'visible') { loadSummary(); listRef.current.refreshFirst(); } };
    const timer = setInterval(poll, 30000);
    document.addEventListener('visibilitychange', shown); window.addEventListener('focus', shown);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', shown); window.removeEventListener('focus', shown); };
  }, [loadSummary, tab]);

  // Opened from the command palette: filter to that AWB and open its detail panel once it is loaded.
  useEffect(() => {
    if (!trackFocus) return;
    focusAwb.current = trackFocus;
    setTab('all'); // eslint-disable-line react-hooks/set-state-in-effect -- one-shot hand-off from the palette
    setF((x) => ({ ...x, q: trackFocus })); setQf((x) => ({ ...x, q: trackFocus }));
    setTrackFocus('');
  }, [trackFocus, setTrackFocus]);
  // Opened from the search box with more than an AWB: apply a tab, a tag and / or a text filter once.
  useEffect(() => {
    if (!trackHandoff) return;
    const { q = '', tab: wanted, tag = '' } = trackHandoff;
    if (wanted && TABS.some(([k]) => k === wanted)) setTab(wanted); // eslint-disable-line react-hooks/set-state-in-effect -- one-shot hand-off from the search box
    setF((x) => ({ ...x, q, tag })); setQf((x) => ({ ...x, q, tag }));
    if (q) focusAwb.current = q;
    setTrackHandoff(null);
  }, [trackHandoff, setTrackHandoff]);
  useEffect(() => {
    const awb = focusAwb.current;
    if (!awb) return;
    const hit = items.find((r) => r.awb === awb);
    if (hit) { setSelectedId(hit.id); focusAwb.current = ''; }  
  }, [items]);

  // Selection is kept by id across batches (a Map of id -> the row, or just { id, kind, state } when it came from "select all matching").
  const [picked, setPicked] = useState(() => new Map());
  const pickedList = useMemo(() => [...picked.values()], [picked]);
  useEffect(() => { setPicked(new Map()); }, [tab, qf]); // eslint-disable-line react-hooks/set-state-in-effect -- a selection belongs to one tab and filter set
  const set = (k) => (e) => { setF((x) => ({ ...x, [k]: e.target.value })); };

  // Walks the list endpoint (200 per request) to gather every row matching the tab and filters, for exports, manifests and fixing orders.
  const fetchAll = async ({ tab: wantedTab = tab, filters = qf, cap = 20000 } = {}) => {
    const out = []; let cursor = null;
    do {
      setWorking(`Collecting shipments… ${out.length.toLocaleString('en-IN')}`);
      const x = await apiFetch(`/v1/shipments/list?${qs({ tab: wantedTab, limit: 200, cursor }, filters)}`);
      out.push(...(x.items || []).map(norm)); cursor = x.nextCursor;
    } while (cursor && out.length < cap);
    setWorking('');
    if (cursor) showToast(`Only the newest ${cap.toLocaleString('en-IN')} are included. Narrow the filters to get the rest.`, 'error');
    return out;
  };
  // The full rows of the selection (rows picked through "select all matching" are fetched when an action needs their details).
  const fullPicked = async () => {
    if (pickedList.every((r) => r.order_number !== undefined)) return pickedList;
    const ids = new Set(pickedList.map((r) => r.id));
    return (await fetchAll()).filter((r) => ids.has(r.id));
  };
  const selectAllMatching = async () => {
    setWorking('Selecting everything that matches…');
    try {
      const x = await apiFetch(`/v1/shipments/ids?${qs({ tab, limit: 5000 })}`);
      setPicked((m) => { const n = new Map(m); (x.items || []).forEach((r) => { if (!n.has(r.id)) n.set(r.id, r); }); return n; });
      if (x.truncated) showToast('The first 5,000 matching rows were selected. Narrow the filters to select the rest.', 'error');
    } catch (e) { showToast(e.message || 'Could not select all rows', 'error'); }
    setWorking('');
  };

  const selected = items.find((r) => r.id === selectedId) || null;
  const pad = mobile ? '14px 12px 32px' : '22px 28px 40px';
  const activeFilters = Object.values(f).some(Boolean) || tab !== 'all';
  const clearAll = () => { setF(EMPTY); setQf(EMPTY); setTab('all'); };

  if (list.error && !items.length && !list.loading) {
    const unauth = list.error instanceof ApiError && list.error.status === 401;
    return <div style={{ padding: pad }}><div style={{ ...CARD, minHeight: 74, padding: '18px 26px', display: 'flex', alignItems: 'center', gap: 8, color: T.TEXT_SECONDARY, fontSize: 13.5 }}>{unauth ? 'Sign in to see your shipments.' : 'Shipments could not be loaded.'}{!unauth && <Btn onClick={list.reload}>Try again</Btn>}</div></div>;
  }

  const exportRows = async () => {
    if (!canExport) return showToast('Your account does not have permission to export shipments.', 'error');
    const source = picked.size ? await fullPicked() : await fetchAll();
    const head = ['Channel', 'Order ID', 'NEXGO order ID', 'Date', 'Payment method', 'COD amount INR', 'Order value INR', 'Customer', 'Phone', 'City', 'Pincode', 'Carrier', 'Service', 'Mode', 'AWB', 'WhatsApp status', 'Status', 'Pickup warehouse', 'Products', 'Qty', 'Dead weight kg', 'Billed weight kg', 'Freight INR', 'Last scan', 'Last scan location', 'Last scan time', 'Expected delivery', 'Delivered', 'Delayed', 'Tags'];
    const body = source.map((r) => [channelName(r.channel), r.order_number, r.nexgo_order_id, stamp(r.booked_at), r.payment_mode === 'cod' ? 'COD' : 'Prepaid', r.payment_mode === 'cod' ? r.cod_amount_paise / 100 : 0, r.subtotal_paise / 100, r.customer_name, r.customer_phone, r.customer_city, r.customer_pincode, r.courier_name || '', r.service_name || '', r.service_type ? modeOf(r) : '', r.awb || '', WHATSAPP[r.whatsapp_status] || 'Not sent', label(r.state), r.warehouse_name, r.product_names, r.quantity, r.total_weight_g / 1000, r.chargeable_weight_g / 1000, r.shipping_charge_paise / 100, r.last_description || '', r.last_location || '', r.last_event_at ? stamp(r.last_event_at) : '', day(r.promised_delivery_at), r.delivered_at ? stamp(r.delivered_at) : '', isDelayed(r) ? 'Yes' : 'No', (r.tags || []).join(', ')]);
    // Customer name and phone only leave the app for members with Export Customer Details.
    const safeBody = canExportCustomer ? body : body.map((row) => row.map((cell, i) => (i === 7 || i === 8 ? '' : cell)));
    await saveRows([head, ...safeBody], `shipments-${isoDay(new Date())}`, exportFormat, 'Shipments');
    showToast(`${source.length} shipments exported (${exportFormat === 'xlsx' ? 'Excel' : 'CSV'})`);
  };

  // Cancelling runs in the background queue (no limit on how many), with a progress dialog and a summary at the end.
  const runCancel = async ({ shipmentIds, orderIds }) => {
    const total = shipmentIds.length + orderIds.length;
    setCancelDlg({ running: true, hidden: false, title: `Cancelling ${total} item${total === 1 ? '' : 's'}`, done: 0, total });
    try {
      const r = await cancelInBackground({ shipmentIds, orderIds }, { onProgress: (p) => setCancelDlg((d) => (d ? { ...d, done: p.done, total: p.total || d.total } : d)) });
      const lines = [`${r.cancelled} cancelled`];
      if (r.refundedPaise) lines.push(`₹${(r.refundedPaise / 100).toLocaleString('en-IN')} credited back to your wallet`);
      if (r.failed) lines.push(`${r.failed} could not be cancelled`);
      if (r.skipped) lines.push(`${r.skipped} were already cancelled, picked up or waiting in another cancellation`);
      setCancelDlg((d) => {
        if (d?.hidden) { showToast(lines.join(' · '), r.failed ? 'error' : 'success'); return null; }
        return { running: false, hidden: false, title: r.failed ? 'Finished with some problems' : 'Cancellation finished', done: total, total, summary: { tone: r.failed ? 'error' : 'success', lines, errors: r.errors } };
      });
    } catch (e) {
      setCancelDlg({ running: false, hidden: false, title: 'Could not cancel', done: 0, total, summary: { tone: 'error', lines: [], errors: [e instanceof ApiError ? e.message : 'The cancellation could not be started. Try again.'] } });
    }
    setPicked(new Map()); await load();
  };
  // Orders that never got a courier: nothing was booked, so nothing is charged or refunded.
  const cancelOrders = async () => {
    const chosen = pickedList.filter(isUnassigned);
    if (!chosen.length) return;
    if (!(await askConfirm({ title: 'Are you sure?', message: `Cancel ${chosen.length} order${chosen.length === 1 ? '' : 's'}? Nothing has been booked, so nothing is charged.`, confirmLabel: 'Yes, continue', danger: true }))) return;
    await runCancel({ shipmentIds: [], orderIds: chosen.map((r) => r.id) });
  };

  // Pickup manifest: courier by courier, with a tick column for the pickup person.
  const downloadManifest = async (list, format) => {
    const rows = list.filter((r) => !isUnassigned(r) && r.awb).sort((a, b) => String(a.courier_name).localeCompare(String(b.courier_name)) || String(a.awb).localeCompare(String(b.awb)));
    if (!rows.length) return showToast('There are no shipments with an AWB to list.', 'error');
    await saveRows([['#', 'Courier', 'AWB', 'Order', 'Customer', 'City', 'Pincode', 'Weight (kg)', 'Payment', 'COD to collect (INR)', 'Pickup warehouse', 'Picked up (tick)'],
      ...rows.map((r, i) => [i + 1, r.courier_name, r.awb, r.order_number, r.customer_name, r.customer_city, r.customer_pincode, Math.max(r.chargeable_weight_g || 0, r.total_weight_g || 0) / 1000, r.payment_mode === 'cod' ? 'COD' : 'Prepaid', r.payment_mode === 'cod' ? (r.cod_amount_paise || 0) / 100 : 0, r.warehouse_name, ''])],
      `pickup-manifest-${isoDay(new Date())}`, format, 'Manifest');
    showToast(`Manifest for ${rows.length} shipment${rows.length === 1 ? '' : 's'} downloaded (${format === 'xlsx' ? 'Excel' : 'CSV'}).`);
  };

  // Failed orders: download them as Excel (with the reason), fix the cells, upload the file: orders are updated in place and couriers assigned.
  const downloadFailed = async (format = 'xlsx') => {
    const source = (await fetchAll({ tab: 'failed' })).filter((r) => r.state === 'failed');
    if (!source.length) return showToast('There are no failed orders to download.', 'error');
    await saveRows(failedSheet(source), `failed-orders-${isoDay(new Date())}`, format, 'Failed orders');
    showToast(`${source.length} failed order${source.length === 1 ? '' : 's'} downloaded. Correct them and upload the file.`);
  };
  const uploadCorrected = async (file) => {
    if (!file) return;
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) return showToast('Upload the .xlsx, .xls or .csv file you downloaded.', 'error');
    setFixing(true); setFixReport(null);
    try {
      const rows = await readCorrections(file);
      if (!rows) throw new Error('"NEXGO order ID" column not found. Upload the file downloaded from the Exception & Error tab.');
      if (!rows.length) throw new Error('The file has no order rows.');
      if (rows.length > 500) throw new Error('Upload up to 500 orders at a time.');
      const byId = new Map((await fetchAll({ tab: 'failed', filters: EMPTY })).filter((o) => o.state === 'failed').map((o) => [o.nexgo_order_id, o]));
      const report = []; const fixed = [];
      for (const row of rows) {
        const order = byId.get(row.nexgoId);
        if (!order) { report.push({ id: row.nexgoId, line: row.line, problem: 'Not a failed order of yours (already assigned or unknown ID)' }); continue; }
        const { errors, body } = toPatch(row);
        if (errors.length) { report.push({ id: row.nexgoId, ref: order.order_number, line: row.line, problem: errors.join(' | ') }); continue; }
        try { await apiFetch(`/v1/orders/${order.id}/details`, { method: 'PATCH', body }); fixed.push(order); }
        catch (e) { report.push({ id: row.nexgoId, ref: order.order_number, line: row.line, problem: e instanceof ApiError ? e.message : 'Could not save this order' }); }
      }
      let assigned = 0;
      if (fixed.length) {
        const results = await assignInBatches(fixed.map((o) => o.id));
        const r = { results };
        assigned = results.filter((x) => x.ok).length;
        const byOrder = new Map(fixed.map((o) => [o.id, o]));
        r.results.filter((x) => !x.ok).forEach((x) => report.push({ id: byOrder.get(x.orderId)?.nexgo_order_id, ref: byOrder.get(x.orderId)?.order_number, problem: `Saved, but no courier assigned: ${x.error}` }));
      }
      setFixReport({ total: rows.length, assigned, problems: report });
      showToast(`${assigned} of ${rows.length} order${rows.length === 1 ? '' : 's'} assigned to a courier${report.length ? `, ${report.length} still need attention` : ''}`, report.length ? 'error' : 'success');
      await load();
    } catch (e) { showToast(e instanceof ApiError ? e.message : e.message || 'The file could not be processed', 'error'); }
    finally { setFixing(false); }
  };

  // Tags go onto the selected shipments (never onto not-yet-shipped "failed" orders).
  const tagSelected = async (mode) => {
    const ids = pickedList.filter((r) => !isUnassigned(r) && r.kind !== 'order').map((r) => r.id);
    if (!ids.length) return showToast('Select shipments that have an AWB to tag.', 'error');
    try {
      const r = await apiFetch('/v1/shipments/tags', { method: 'POST', body: { shipmentIds: ids, [mode]: [tagInput.trim()] } });
      showToast(`${mode === 'add' ? 'Tag added to' : 'Tag removed from'} ${r.updated} shipment${r.updated === 1 ? '' : 's'}`);
      setTagInput(''); await load();
    } catch (e) { showToast(e instanceof ApiError ? e.message : 'Tags could not be saved', 'error'); }
  };
  const printSelected = (kind) => {
    const ids = pickedList.filter((r) => !isUnassigned(r) && r.kind !== 'order').map((r) => r.id);
    if (!ids.length) return showToast('Select shipments that have an AWB first.', 'error');
    if (ids.length > 100) return showToast('Print up to 100 shipments at a time.', 'error');
    openDocs(kind, ids);
  };
  // Only shipments the courier has not picked up can be cancelled; the rest are left alone and counted so nothing is silently skipped.
  const cancelSelected = async () => {
    const chosen = pickedList.filter((r) => !isUnassigned(r));
    const ids = chosen.filter((r) => ['booked', 'pickup_pending', 'pickup_scheduled'].includes(r.state)).map((r) => r.id);
    if (!ids.length) return showToast('None of the selected shipments can be cancelled. Only shipments that are not yet picked up can.', 'error');
    const skipped = chosen.length - ids.length;
    if (!(await askConfirm({ title: 'Are you sure?', message: `Cancel ${ids.length} shipment${ids.length === 1 ? '' : 's'}? The shipping charges are credited back to your wallet.${skipped ? ` ${skipped} selected shipment${skipped === 1 ? ' is' : 's are'} already picked up and will be left as they are.` : ''}`, confirmLabel: 'Yes, continue', danger: true }))) return;
    await runCancel({ shipmentIds: ids, orderIds: [] });
  };
  const allOnPage = items.length > 0 && items.every((r) => picked.has(r.id));
  const togglePage = () => setPicked((m) => { const n = new Map(m); items.forEach((r) => (allOnPage ? n.delete(r.id) : n.set(r.id, r))); return n; });
  const toggleOne = (r) => setPicked((m) => { const n = new Map(m); if (n.has(r.id)) n.delete(r.id); else n.set(r.id, r); return n; });
  // Everything ready for a courier (all matching rows, not only the loaded ones).
  const assignAllReady = async () => {
    setWorking('Collecting the orders…');
    try {
      const x = await apiFetch(`/v1/shipments/ids?${qs({ tab: 'ready', limit: 5000 })}`);
      const rows = x.items || [];
      if (rows.length === 1) { const one = items.find((r) => r.id === rows[0].id) || (await fetchAll({ tab: 'ready' }))[0]; setChooser(one ? [one] : []); } else setChooser(rows);
      if (x.truncated) showToast('The first 5,000 orders are included. Assign them, then repeat for the rest.', 'error');
    } catch (e) { showToast(e.message || 'Could not collect the orders', 'error'); }
    setWorking('');
  };
  const manifestAll = async (format) => downloadManifest(await fetchAll({ tab: 'pickup' }), format);

  return (
    <div style={{ padding: pad, position: 'relative' }}>
      <ActiveAssignBanner onFinished={load} />
      {working && <div role="status" style={{ marginBottom: 10, fontSize: 12.5, color: T.TEXT_SECONDARY, display: 'flex', gap: 8, alignItems: 'center' }}><Spinner />{working}</div>}
      {stale && <div style={{ marginBottom: 10, fontSize: 12.5, color: T.AMBER, display: 'flex', gap: 10, alignItems: 'center' }}>New activity since you opened this list.<Btn small onClick={load}>Refresh</Btn></div>}
      <ActiveCancelBanner onFinished={load} />
      <BatchProgressDialog state={cancelDlg && !cancelDlg.hidden ? cancelDlg : null} onClose={() => setCancelDlg((d) => (d?.running ? { ...d, hidden: true } : null))} />
      <div style={{ ...CARD, padding: 12, marginBottom: 12, boxShadow: 'none', background: 'var(--nx-surface-soft)' }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input aria-label="Search shipments" value={f.q} onChange={set('q')} placeholder="Search AWB, order, customer, phone, pincode or product" style={{ ...FIELD, flex: '1 1 280px', height: 38 }} />
          <Btn disabled={refreshing} onClick={refresh}>{refreshing ? 'Refreshing…' : 'Refresh'}</Btn>
          {canExport && <><select aria-label="Export format" value={exportFormat} onChange={(e) => setExportFormat(e.target.value)} style={{ ...FIELD, height: 32 }}>{FORMATS.map(([id, l]) => <option key={id} value={id}>{l}</option>)}</select>
          <Btn onClick={exportRows}>{picked.size ? `Export ${picked.size} selected` : 'Export'}</Btn></>}
          <Btn onClick={() => nav('bulk-track')}>Bulk AWB tracking</Btn>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 10 }}>
          <select aria-label="Courier" value={f.courier} onChange={set('courier')} style={FIELD}><option value="">All couriers</option>{options.couriers.map((c) => <option key={c}>{c}</option>)}</select>
          <select aria-label="Payment method" value={f.pay} onChange={set('pay')} style={FIELD}><option value="">Payment method</option><option value="cod">COD</option><option value="prepaid">Prepaid</option></select>
          <select aria-label="Mode" value={f.mode} onChange={set('mode')} style={FIELD}><option value="">Mode</option><option value="Air">Air</option><option value="Surface">Surface</option></select>
          <select aria-label="Channel" value={f.channel} onChange={set('channel')} style={FIELD}><option value="">Channel</option>{CHANNELS.slice(0, 3).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          <select aria-label="Pickup warehouse" value={f.warehouse} onChange={set('warehouse')} style={FIELD}><option value="">All warehouses</option>{options.warehouses.map((c) => <option key={c}>{c}</option>)}</select>
          <select aria-label="Shipment tag" value={f.tag} onChange={set('tag')} style={FIELD}><option value="">Shipment tag</option>{allTags.map((t) => <option key={t} value={t}>{t}</option>)}</select>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: T.TEXT_MUTED, fontSize: 12 }}>Booked<input aria-label="Booked from" type="date" value={f.from} onChange={set('from')} style={FIELD} />to<input aria-label="Booked to" type="date" value={f.to} onChange={set('to')} style={FIELD} /></label>
          {activeFilters && <Btn onClick={clearAll}>Clear filters</Btn>}
        </div>
      </div>

      <div role="tablist" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
        {TABS.map(([key, name]) => {
          const on = tab === key;
          return <button key={key} role="tab" aria-selected={on} onClick={() => setTab(key)} style={{ height: 32, padding: '0 12px', borderRadius: 99, border: `1px solid ${on ? T.NAVY : T.BORDER}`, background: on ? T.NAVY : T.SURFACE, color: on ? '#fff' : key === 'delayed' && counts.delayed ? T.RED : T.TEXT_LABEL, fontWeight: 720, fontSize: 12.5, cursor: 'pointer' }}>{name} <span style={{ opacity: 0.7, fontWeight: 600 }}>{counts[key] || 0}</span></button>;
        })}
      </div>

      {tab === 'ready' && (
        <div style={{ ...CARD, padding: '12px 14px', marginBottom: 12, boxShadow: 'none' }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ flex: '1 1 320px', fontSize: 12.5, color: T.TEXT_SECONDARY, lineHeight: 1.5 }}>These orders are complete and waiting for a courier. Assigning books the shipment, charges your wallet and moves it to Pickup Pending, where you can print labels and download the pickup manifest. Orders no courier can take stay here with the reason.</div>
            <Btn primary disabled={!(counts.ready || list.total)} onClick={assignAllReady}>Assign courier to all {counts.ready ?? list.total ?? ''}</Btn>
          </div>
        </div>
      )}
      {tab === 'pickup' && (list.total > 0 || items.length > 0) && (
        <div style={{ ...CARD, padding: '12px 14px', marginBottom: 12, boxShadow: 'none', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: '1 1 320px', fontSize: 12.5, color: T.TEXT_SECONDARY, lineHeight: 1.5 }}>Pickup manifest: the parcels the courier collects, listed courier by courier with a tick column for the pickup person.</div>
          <Btn onClick={() => manifestAll('xlsx')}>Manifest (Excel)</Btn><Btn onClick={() => manifestAll('csv')}>Manifest (CSV)</Btn>
        </div>
      )}
      {tab === 'failed' && (
        <div style={{ ...CARD, padding: '12px 14px', marginBottom: 12, boxShadow: 'none' }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ flex: '1 1 320px', fontSize: 12.5, color: T.TEXT_SECONDARY, lineHeight: 1.5 }}>These orders have no courier. Download the Excel file, correct what it flags (invalid mobile number, missing address, pincode, weight or size), then upload it to re-assign.</div>
            <Btn onClick={() => downloadFailed('xlsx')}>Download Excel file</Btn>
            <Btn onClick={() => downloadFailed('csv')}>Download CSV file</Btn>
            <Btn primary disabled={fixing} onClick={() => fixInput.current?.click()}>{fixing ? 'Re-assigning…' : 'Upload corrected file'}</Btn>
            <input ref={fixInput} type="file" accept=".xlsx,.xls,.csv" hidden onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ''; uploadCorrected(file); }} />
          </div>
          {items.some((r) => r.state === 'failed' && diagnose(r).length) && <div style={{ marginTop: 8, fontSize: 12, color: T.AMBER }}>{items.filter((r) => r.state === 'failed' && diagnose(r).length).length} of the orders shown have missing or invalid details; they are flagged in the Issue column.</div>}
          {fixReport && (
            <div style={{ marginTop: 10, fontSize: 12.5 }}>
              <b style={{ color: fixReport.problems.length ? T.TEXT : T.GREEN }}>{fixReport.assigned} of {fixReport.total} assigned to a courier.</b>
              {fixReport.problems.slice(0, 20).map((p, i) => <div key={i} style={{ marginTop: 4, color: T.RED }}>{p.ref || p.id}{p.line ? ` (row ${p.line})` : ''}: {p.problem}</div>)}
            </div>
          )}
        </div>
      )}

      {picked.size > 0 && (
        <div style={{ ...CARD, padding: '9px 12px', marginBottom: 12, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', background: 'rgba(56,119,252,.08)', boxShadow: 'none' }}>
          <b style={{ fontSize: 13, color: T.TEXT }}>{picked.size} selected</b>
          <Btn small onClick={() => fullPicked().then((rows) => copyText(rows.map((r) => r.awb).filter(Boolean).join('\n'), showToast, 'AWBs copied'))}>Copy AWBs</Btn>
          {pickedList.some(isUnassigned) && <><Btn small primary onClick={() => setChooser(pickedList.filter(isUnassigned))}>Choose courier</Btn><Btn small loading={!!cancelDlg?.running} onClick={cancelOrders}>Cancel orders</Btn></>}
          {pickedList.some((r) => !isUnassigned(r) && r.kind !== 'order') && <><Btn small onClick={async () => downloadManifest((await fullPicked()).filter((r) => !isUnassigned(r)), 'xlsx')}>Manifest (Excel)</Btn><Btn small onClick={async () => downloadManifest((await fullPicked()).filter((r) => !isUnassigned(r)), 'csv')}>Manifest (CSV)</Btn></>}
          <Btn small onClick={() => printSelected('label')}>Print labels</Btn>
          <Btn small onClick={() => printSelected('invoice')}>Print invoices</Btn>
          <Btn small loading={!!cancelDlg?.running} onClick={cancelSelected}>Cancel shipments</Btn>
          {canExport && <Btn small onClick={exportRows}>Export selected</Btn>}
          <input aria-label="Tag name" value={tagInput} onChange={(e) => setTagInput(e.target.value)} placeholder="Tag name" maxLength={30} style={{ ...FIELD, height: 28, width: 130 }} />
          <Btn small disabled={!tagInput.trim()} onClick={() => tagSelected('add')}>Add tag</Btn>
          <Btn small disabled={!tagInput.trim()} onClick={() => tagSelected('remove')}>Remove tag</Btn>
          {list.total > picked.size && list.hasMore && <Btn small onClick={selectAllMatching}>Select all {list.total.toLocaleString('en-IN')} matching</Btn>}
          <Btn small onClick={() => setPicked(new Map())}>Clear selection</Btn>
        </div>
      )}

      {counts.all === 0 && !activeFilters && !list.loading ? (
        <section style={{ ...CARD, minHeight: 220, padding: 42, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}><div style={{ width: 42, height: 42, borderRadius: 12, display: 'grid', placeItems: 'center', background: 'rgba(56,119,252,.12)', color: T.ACCENT, fontSize: 20 }}>✈</div><b style={{ marginTop: 14, color: T.TEXT, fontSize: 16 }}>No shipments yet</b><span style={{ marginTop: 5, color: T.TEXT_MUTED, fontSize: 13 }}>Book an order with a courier and its live tracking will appear here.</span></section>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: selected && !mobile ? 'minmax(0,1fr) 400px' : '1fr', gap: 14, alignItems: 'start' }}>
          <section style={{ ...CARD, overflow: 'hidden' }}>
            {!items.length && !list.loading ? <div style={{ padding: 26, color: T.TEXT_MUTED, fontSize: 13 }}>No shipments match these filters.{activeFilters && <> <button onClick={clearAll} style={{ border: 0, background: 'transparent', color: T.ACCENT, fontWeight: 700, cursor: 'pointer' }}>Clear filters</button></>}</div> : (
              <>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', minWidth: 1060, borderCollapse: 'collapse' }}>
                    <thead><tr>
                      <th style={{ ...HEAD, width: 34 }}><input type="checkbox" aria-label="Select all loaded rows" checked={allOnPage} onChange={togglePage} /></th>
                      {['Channel', 'Order ID', 'NEXGO order ID', 'Date', 'Payment / Method', 'Customer', 'Carrier', 'AWB', 'WhatsApp status', 'Status', ''].map((h) => <th key={h || 'act'} style={HEAD}>{h}</th>)}
                    </tr></thead>
                    {list.loading && !items.length ? <TableSkeleton cols={12} rows={8} /> : <tbody>
                      {items.map((r) => {
                        const late = isDelayed(r);
                        return (
                          <tr key={r.id} onClick={() => setSelectedId(r.id === selectedId ? null : r.id)} style={{ cursor: 'pointer', background: r.id === selectedId ? 'rgba(56,119,252,.09)' : undefined }}>
                            <td style={CELL} onClick={(e) => e.stopPropagation()}><input type="checkbox" aria-label={`Select ${r.order_number}`} checked={picked.has(r.id)} onChange={() => toggleOne(r)} /></td>
                            <td style={{ ...CELL, whiteSpace: 'nowrap' }}>{channelName(r.channel)}</td>
                            <td style={CELL}><b>{r.order_number}</b>{(r.tags || []).length > 0 && <small style={{ ...SUB, color: T.ACCENT }}>{r.tags.map((t) => `#${t}`).join(' ')}</small>}</td>
                            <td style={CELL}><span style={{ fontFamily: T.MONO, fontSize: 12 }}>{r.nexgo_order_id}</span></td>
                            <td style={{ ...CELL, whiteSpace: 'nowrap' }}>{day(r.booked_at)}<small style={SUB}>{new Date(r.booked_at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}</small></td>
                            <td style={{ ...CELL, whiteSpace: 'nowrap' }}>{r.payment_mode === 'cod' ? <><b style={{ color: '#6d28d9' }}>COD</b> {inr0(r.cod_amount_paise)}</> : <><b style={{ color: T.TEXT_SECONDARY }}>Prepaid</b> {inr0(r.subtotal_paise)}</>}</td>
                            <td style={CELL}><b>{r.customer_name}</b><small style={SUB}>{r.customer_city} · {r.customer_pincode}</small></td>
                            <td style={CELL}>{r.courier_name ? <><b>{r.courier_name}</b><small style={SUB}>{r.service_name}</small></> : <span style={{ color: T.TEXT_MUTED }}>Not assigned</span>}</td>
                            <td style={CELL}>{r.awb ? <b style={{ fontFamily: T.MONO }}>{r.awb}</b> : <span style={{ color: T.TEXT_MUTED }}>—</span>}</td>
                            <td style={CELL}><span style={{ color: waTone(r.whatsapp_status), fontWeight: 650 }}>{WHATSAPP[r.whatsapp_status] || 'Not sent'}</span></td>
                            <td style={CELL}><Pill state={r.state} />{late && <small style={{ ...SUB, color: T.RED }}>Delayed · due {day(r.promised_delivery_at)}</small>}</td>
                            <td style={CELL} onClick={(e) => e.stopPropagation()}><div style={{ display: 'flex', gap: 6 }}>{r.state === 'ready' && <Btn small primary onClick={() => setChooser([r])}>Book now</Btn>}<Btn small onClick={() => setSelectedId(r.id)}>{isUnassigned(r) ? 'Details' : 'Track'}</Btn>{r.awb && <Btn small onClick={() => openDocs('label', [r.id])}>Label</Btn>}</div></td>
                          </tr>
                        );
                      })}
                    </tbody>}
                  </table>
                </div>
                <LoadMore shown={items.length} total={list.total} hasMore={list.hasMore} loading={list.loading} loadingMore={list.loadingMore} error={!!list.error} onMore={list.loadMore} noun="shipments" />
              </>
            )}
          </section>
          {chooser && <CourierChooser orders={chooser} onClose={() => setChooser(null)} onDone={async () => { setChooser(null); setSelectedId(null); setPicked(new Map()); await load(); }} />}
          {selected && <Detail key={selected.id} shipment={selected} mobile={mobile} reload={load} onChoose={setChooser} onClose={() => setSelectedId(null)} />}
        </div>
      )}
    </div>
  );
}
