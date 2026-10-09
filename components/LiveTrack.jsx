'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import { useAppState } from '@/lib/AppStateContext';
import * as T from '@/lib/theme';
import { FORMATS, saveRows } from '@/lib/exportFile';
import { Pager } from './Kit';

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
const CLOSED = ['delivered', 'cancelled', 'rto'];
const stageIndex = (state) => (PICKUP.includes(state) ? 0 : STAGES.indexOf(state));
const isDelayed = (r) => !!r.promised_delivery_at && !CLOSED.includes(r.state) && new Date(r.promised_delivery_at) < new Date();

const TABS = [
  ['all', 'All', (r) => r.state !== 'failed'],
  ['pickup', 'Pickup Pending', (r) => PICKUP.includes(r.state)],
  ['in_transit', 'In Transit', (r) => r.state === 'in_transit'],
  ['out_for_delivery', 'OFD', (r) => r.state === 'out_for_delivery'],
  ['ndr', 'NDR', (r) => r.state === 'ndr'],
  ['delivered', 'Delivered', (r) => r.state === 'delivered'],
  ['rto', 'RTO', (r) => RTO.includes(r.state)],
  ['cancelled', 'Cancelled', (r) => r.state === 'cancelled'],
  ['failed', 'Failed', (r) => r.state === 'failed'],
];
const CHANNELS = [['single', 'Single created'], ['bulk_upload', 'Bulk upload'], ['shopify', 'Shopify'], ['amazon', 'Amazon'], ['woocommerce', 'WooCommerce'], ['opencart', 'OpenCart'], ['magento', 'Magento']];
const channelName = (c) => (CHANNELS.find(([k]) => k === c) || [null, title(c || 'single')])[1];
const modeOf = (r) => (/air|express/i.test(r.service_type || '') ? 'Air' : 'Surface');
const WHATSAPP = { not_sent: 'Not sent', sent: 'Sent', delivered: 'Delivered', read: 'Read', failed: 'Failed' };
const waTone = (w) => (w === 'read' || w === 'delivered' ? T.GREEN : w === 'failed' ? T.RED : w === 'sent' ? T.ACCENT : T.TEXT_MUTED);
const PAGE_SIZES = [10, 25, 50, 100, 500];

const tone = (state) => (state === 'delivered' ? T.GREEN : state === 'ndr' || RTO.includes(state) ? T.AMBER : state === 'cancelled' || state === 'failed' ? T.RED : T.ACCENT);
const label = (state) => (state === 'failed' ? 'Not assigned' : state === 'rto_in_transit' ? 'RTO in transit' : state === 'rto' ? 'RTO' : state === 'ndr' ? 'NDR' : title(state));

function Pill({ state }) {
  const c = tone(state);
  return <span style={{ display: 'inline-flex', padding: '3px 8px', borderRadius: 99, color: c, background: `${c}14`, fontWeight: 740, fontSize: 11.5, whiteSpace: 'nowrap' }}>{label(state)}</span>;
}

function Btn({ children, onClick, primary, disabled, small }) {
  return <button type="button" disabled={disabled} onClick={onClick} style={{ height: small ? 28 : 32, padding: `0 ${small ? 9 : 11}px`, borderRadius: 8, border: `1px solid ${primary ? T.NAVY : T.INPUT_BORDER}`, background: primary ? T.NAVY : T.SURFACE, color: primary ? '#fff' : T.TEXT, fontSize: small ? 11.5 : 12, fontWeight: 720, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1, whiteSpace: 'nowrap' }}>{children}</button>;
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

const copyText = (text, showToast, done) => { navigator.clipboard?.writeText(text).then(() => showToast(done)).catch(() => showToast('Copy is not available in this browser', 'error')); };

function Detail({ shipment, mobile, onClose }) {
  const { showToast, nav } = useAppState();
  const [events, setEvents] = useState(null);

  useEffect(() => {
    let live = true;
    if (shipment.state === 'failed') return undefined;
    apiFetch(`/v1/shipments/${shipment.id}/tracking`).then((x) => live && setEvents(x.items || [])).catch(() => live && setEvents([]));
    return () => { live = false; };
  }, [shipment.id, shipment.state]);

  // Label PDFs need object storage, which is not connected yet.
  const getLabel = () => showToast('Label download is coming soon. It needs file storage, which is not connected yet.');
  const delayed = isDelayed(shipment);
  const failedOrder = shipment.state === 'failed';
  const facts = [
    ['Order', shipment.order_number],
    ['NEXGO order ID', shipment.nexgo_order_id],
    ['Channel', channelName(shipment.channel)],
    ['Courier', shipment.courier_name ? `${shipment.courier_name} · ${shipment.service_name} (${modeOf(shipment)})` : 'Not assigned'],
    ['Deliver to', `${shipment.customer_name}, ${shipment.customer_city} ${shipment.customer_pincode}`],
    ['Customer phone', shipment.customer_phone || '—'],
    ['Pickup from', `${shipment.warehouse_name} · ${shipment.warehouse_city} ${shipment.warehouse_pincode}`],
    ['Payment', shipment.payment_mode === 'cod' ? `COD ${inr(shipment.cod_amount_paise)}` : 'Prepaid'],
    ['Products', `${shipment.product_names || '—'} (qty ${shipment.quantity ?? 0})`],
    ['Weight', `${kg(shipment.total_weight_g)} dead · ${kg(shipment.chargeable_weight_g)} billed`],
    ['Freight charge', shipment.state === 'failed' ? '—' : inr(shipment.shipping_charge_paise)],
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
      {failedOrder ? <div style={{ marginTop: 12, padding: '8px 10px', borderRadius: 8, background: `${T.RED}12`, color: T.RED, fontSize: 12.5, fontWeight: 650 }}>No courier is assigned to this order. Correct the order details (mobile number, address, pincode, weight and size) and assign a courier from All orders.</div> : <Progress state={shipment.state} />}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 14px', margin: '14px 0', paddingTop: 14, borderTop: `1px solid ${T.DIVIDER}` }}>
        {facts.map(([k, v]) => (
          <div key={k} style={{ minWidth: 0 }}><span style={{ color: T.TEXT_MUTED, fontSize: 10.5, fontWeight: 800, letterSpacing: '.07em', textTransform: 'uppercase' }}>{k}</span><div style={{ marginTop: 4, color: T.TEXT, fontSize: 13, fontWeight: 620, wordBreak: 'break-word' }}>{v}</div></div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 14 }}>
        {failedOrder ? <Btn primary onClick={() => nav('orders')}>Fix and assign courier</Btn> : <><Btn primary onClick={getLabel}>Get label</Btn><Btn onClick={() => copyText(shipment.awb, showToast, 'AWB copied')}>Copy AWB</Btn></>}
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
  const { nav, showToast } = useAppState();
  const [rows, setRows] = useState(null);
  const [failed, setFailed] = useState([]);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('all');
  const [f, setF] = useState({ q: '', courier: '', pay: '', mode: '', channel: '', warehouse: '', from: '', to: '' });
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);
  const [exportFormat, setExportFormat] = useState('csv');
  const [selectedId, setSelectedId] = useState(null);
  const [picked, setPicked] = useState(() => new Set());
  const set = (k) => (e) => { setF((x) => ({ ...x, [k]: e.target.value })); setPage(1); };

  const load = useCallback(() => apiFetch('/v1/shipments').then((x) => { setRows(x.items || []); setFailed((x.failed || []).map((o) => ({ ...o, state: 'failed', awb: '', booked_at: o.created_at, shipping_charge_paise: 0, chargeable_weight_g: o.total_weight_g, whatsapp_status: 'not_sent' }))); setError(null); }).catch(setError), []);
  useEffect(() => { load(); }, [load]);

  const all = useMemo(() => [...(rows || []), ...failed], [rows, failed]);
  const options = useMemo(() => {
    const uniq = (get) => [...new Set(all.map(get).filter(Boolean))].sort();
    return { couriers: uniq((r) => r.courier_name), warehouses: uniq((r) => r.warehouse_name) };
  }, [all]);

  // Everything except the status tab, so tab counts reflect the other active filters.
  const filtered = useMemo(() => {
    const q = f.q.trim().toLowerCase();
    const from = f.from ? new Date(`${f.from}T00:00:00`) : null;
    const to = f.to ? new Date(`${f.to}T23:59:59`) : null;
    return all.filter((r) => (
      (!q || [r.awb, r.order_number, r.nexgo_order_id, r.customer_name, r.customer_phone, r.customer_pincode, r.customer_city, r.courier_name, r.product_names].some((v) => String(v || '').toLowerCase().includes(q)))
      && (!f.courier || r.courier_name === f.courier)
      && (!f.pay || r.payment_mode === f.pay)
      && (!f.mode || (r.service_type && modeOf(r) === f.mode))
      && (!f.channel || r.channel === f.channel)
      && (!f.warehouse || r.warehouse_name === f.warehouse)
      && (!from || new Date(r.booked_at) >= from)
      && (!to || new Date(r.booked_at) <= to)
    ));
  }, [all, f]);

  const counts = useMemo(() => Object.fromEntries(TABS.map(([key, , test]) => [key, filtered.filter(test).length])), [filtered]);

  const visible = useMemo(() => {
    const test = TABS.find(([key]) => key === tab)[2];
    return filtered.filter(test).sort((a, b) => new Date(b.booked_at) - new Date(a.booked_at));
  }, [filtered, tab]);

  const pages = Math.max(1, Math.ceil(visible.length / pageSize));
  const safePage = Math.min(page, pages);
  const pageRows = visible.slice((safePage - 1) * pageSize, safePage * pageSize);
  const selected = all.find((r) => r.id === selectedId) || null;
  const pad = mobile ? '14px 12px 32px' : '22px 28px 40px';
  const activeFilters = Object.values(f).some(Boolean) || tab !== 'all';
  const clearAll = () => { setF({ q: '', courier: '', pay: '', mode: '', channel: '', warehouse: '', from: '', to: '' }); setTab('all'); setPage(1); };

  if (error) {
    const unauth = error instanceof ApiError && error.status === 401;
    return <div style={{ padding: pad }}><div style={{ ...CARD, minHeight: 74, padding: '18px 26px', display: 'flex', alignItems: 'center', gap: 8, color: T.TEXT_SECONDARY, fontSize: 13.5 }}>{unauth ? 'Sign in to see your shipments.' : 'Shipments could not be loaded.'}{!unauth && <Btn onClick={load}>Retry</Btn>}</div></div>;
  }
  if (!rows) return <div style={{ padding: pad }}><div style={{ ...CARD, padding: 26, color: T.TEXT_MUTED, fontSize: 13 }}>Loading shipments…</div></div>;

  const exportRows = async () => {
    const source = picked.size ? visible.filter((r) => picked.has(r.id)) : visible;
    const head = ['Channel', 'Order ID', 'NEXGO order ID', 'Date', 'Payment method', 'COD amount INR', 'Order value INR', 'Customer', 'Phone', 'City', 'Pincode', 'Carrier', 'Service', 'Mode', 'AWB', 'WhatsApp status', 'Status', 'Pickup warehouse', 'Products', 'Qty', 'Dead weight kg', 'Billed weight kg', 'Freight INR', 'Last scan', 'Last scan location', 'Last scan time', 'Expected delivery', 'Delivered', 'Delayed'];
    const body = source.map((r) => [channelName(r.channel), r.order_number, r.nexgo_order_id, stamp(r.booked_at), r.payment_mode === 'cod' ? 'COD' : 'Prepaid', r.payment_mode === 'cod' ? r.cod_amount_paise / 100 : 0, r.subtotal_paise / 100, r.customer_name, r.customer_phone, r.customer_city, r.customer_pincode, r.courier_name || '', r.service_name || '', r.service_type ? modeOf(r) : '', r.awb || '', WHATSAPP[r.whatsapp_status] || 'Not sent', label(r.state), r.warehouse_name, r.product_names, r.quantity, r.total_weight_g / 1000, r.chargeable_weight_g / 1000, r.shipping_charge_paise / 100, r.last_description || '', r.last_location || '', r.last_event_at ? stamp(r.last_event_at) : '', day(r.promised_delivery_at), r.delivered_at ? stamp(r.delivered_at) : '', isDelayed(r) ? 'Yes' : 'No']);
    await saveRows([head, ...body], `shipments-${isoDay(Date.now())}`, exportFormat, 'Shipments');
    showToast(`${source.length} shipments exported (${exportFormat === 'xlsx' ? 'Excel' : 'CSV'})`);
  };

  const allOnPage = pageRows.length > 0 && pageRows.every((r) => picked.has(r.id));
  const togglePage = () => setPicked((s) => { const n = new Set(s); pageRows.forEach((r) => (allOnPage ? n.delete(r.id) : n.add(r.id))); return n; });
  const toggleOne = (id) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <div style={{ padding: pad, position: 'relative' }}>
      <div style={{ ...CARD, padding: 12, marginBottom: 12, boxShadow: 'none', background: 'var(--nx-surface-soft)' }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input aria-label="Search shipments" value={f.q} onChange={set('q')} placeholder="Search AWB, order, customer, phone, pincode or product" style={{ ...FIELD, flex: '1 1 280px', height: 38 }} />
          <Btn onClick={load}>Refresh</Btn>
          <select aria-label="Export format" value={exportFormat} onChange={(e) => setExportFormat(e.target.value)} style={{ ...FIELD, height: 32 }}>{FORMATS.map(([id, l]) => <option key={id} value={id}>{l}</option>)}</select>
          <Btn onClick={exportRows}>{picked.size ? `Export ${picked.size} selected` : 'Export'}</Btn>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 10 }}>
          <select aria-label="Courier" value={f.courier} onChange={set('courier')} style={FIELD}><option value="">All couriers</option>{options.couriers.map((c) => <option key={c}>{c}</option>)}</select>
          <select aria-label="Payment method" value={f.pay} onChange={set('pay')} style={FIELD}><option value="">Payment method</option><option value="cod">COD</option><option value="prepaid">Prepaid</option></select>
          <select aria-label="Mode" value={f.mode} onChange={set('mode')} style={FIELD}><option value="">Mode</option><option value="Air">Air</option><option value="Surface">Surface</option></select>
          <select aria-label="Channel" value={f.channel} onChange={set('channel')} style={FIELD}><option value="">Channel</option>{CHANNELS.slice(0, 3).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          <select aria-label="Pickup warehouse" value={f.warehouse} onChange={set('warehouse')} style={FIELD}><option value="">All warehouses</option>{options.warehouses.map((c) => <option key={c}>{c}</option>)}</select>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: T.TEXT_MUTED, fontSize: 12 }}>Booked<input aria-label="Booked from" type="date" value={f.from} onChange={set('from')} style={FIELD} />to<input aria-label="Booked to" type="date" value={f.to} onChange={set('to')} style={FIELD} /></label>
          {activeFilters && <Btn onClick={clearAll}>Clear filters</Btn>}
        </div>
      </div>

      <div role="tablist" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
        {TABS.map(([key, name]) => {
          const on = tab === key;
          return <button key={key} role="tab" aria-selected={on} onClick={() => { setTab(key); setPage(1); }} style={{ height: 32, padding: '0 12px', borderRadius: 99, border: `1px solid ${on ? T.NAVY : T.BORDER}`, background: on ? T.NAVY : T.SURFACE, color: on ? '#fff' : key === 'delayed' && counts.delayed ? T.RED : T.TEXT_LABEL, fontWeight: 720, fontSize: 12.5, cursor: 'pointer' }}>{name} <span style={{ opacity: 0.7, fontWeight: 600 }}>{counts[key] || 0}</span></button>;
        })}
      </div>

      {picked.size > 0 && (
        <div style={{ ...CARD, padding: '9px 12px', marginBottom: 12, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', background: 'rgba(27,159,214,.08)', boxShadow: 'none' }}>
          <b style={{ fontSize: 13, color: T.TEXT }}>{picked.size} selected</b>
          <Btn small onClick={() => copyText(visible.filter((r) => picked.has(r.id)).map((r) => r.awb).join('\n'), showToast, 'AWBs copied')}>Copy AWBs</Btn>
          <Btn small onClick={() => showToast('Bulk labels and manifests are coming soon. They need file storage, which is not connected yet.')}>Print labels</Btn>
          <Btn small onClick={exportRows}>Export selected</Btn>
          <Btn small onClick={() => setPicked(new Set())}>Clear selection</Btn>
        </div>
      )}

      {!all.length ? (
        <section style={{ ...CARD, minHeight: 220, padding: 42, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}><div style={{ width: 42, height: 42, borderRadius: 12, display: 'grid', placeItems: 'center', background: 'rgba(27,159,214,.12)', color: T.ACCENT, fontSize: 20 }}>✈</div><b style={{ marginTop: 14, color: T.TEXT, fontSize: 16 }}>No shipments yet</b><span style={{ marginTop: 5, color: T.TEXT_MUTED, fontSize: 13 }}>Book an order with a courier and its live tracking will appear here.</span></section>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: selected && !mobile ? 'minmax(0,1fr) 400px' : '1fr', gap: 14, alignItems: 'start' }}>
          <section style={{ ...CARD, overflow: 'hidden' }}>
            {!visible.length ? <div style={{ padding: 26, color: T.TEXT_MUTED, fontSize: 13 }}>No shipments match these filters.{activeFilters && <> <button onClick={clearAll} style={{ border: 0, background: 'transparent', color: T.ACCENT, fontWeight: 700, cursor: 'pointer' }}>Clear filters</button></>}</div> : (
              <>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', minWidth: 1060, borderCollapse: 'collapse' }}>
                    <thead><tr>
                      <th style={{ ...HEAD, width: 34 }}><input type="checkbox" aria-label="Select all on this page" checked={allOnPage} onChange={togglePage} /></th>
                      {['Channel', 'Order ID', 'NEXGO order ID', 'Date', 'Payment / Method', 'Customer', 'Carrier', 'AWB', 'WhatsApp status', 'Status', ''].map((h) => <th key={h || 'act'} style={HEAD}>{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {pageRows.map((r) => {
                        const late = isDelayed(r);
                        return (
                          <tr key={r.id} onClick={() => setSelectedId(r.id === selectedId ? null : r.id)} style={{ cursor: 'pointer', background: r.id === selectedId ? 'rgba(27,159,214,.09)' : undefined }}>
                            <td style={CELL} onClick={(e) => e.stopPropagation()}><input type="checkbox" aria-label={`Select ${r.order_number}`} checked={picked.has(r.id)} onChange={() => toggleOne(r.id)} /></td>
                            <td style={{ ...CELL, whiteSpace: 'nowrap' }}>{channelName(r.channel)}</td>
                            <td style={CELL}><b>{r.order_number}</b></td>
                            <td style={CELL}><span style={{ fontFamily: T.MONO, fontSize: 12 }}>{r.nexgo_order_id}</span></td>
                            <td style={{ ...CELL, whiteSpace: 'nowrap' }}>{day(r.booked_at)}<small style={SUB}>{new Date(r.booked_at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}</small></td>
                            <td style={{ ...CELL, whiteSpace: 'nowrap' }}>{r.payment_mode === 'cod' ? <><b style={{ color: '#6d28d9' }}>COD</b> {inr0(r.cod_amount_paise)}</> : <><b style={{ color: T.TEXT_SECONDARY }}>Prepaid</b> {inr0(r.subtotal_paise)}</>}</td>
                            <td style={CELL}><b>{r.customer_name}</b><small style={SUB}>{r.customer_city} · {r.customer_pincode}</small></td>
                            <td style={CELL}>{r.courier_name ? <><b>{r.courier_name}</b><small style={SUB}>{r.service_name}</small></> : <span style={{ color: T.TEXT_MUTED }}>Not assigned</span>}</td>
                            <td style={CELL}>{r.awb ? <b style={{ fontFamily: T.MONO }}>{r.awb}</b> : <span style={{ color: T.TEXT_MUTED }}>—</span>}</td>
                            <td style={CELL}><span style={{ color: waTone(r.whatsapp_status), fontWeight: 650 }}>{WHATSAPP[r.whatsapp_status] || 'Not sent'}</span></td>
                            <td style={CELL}><Pill state={r.state} />{late && <small style={{ ...SUB, color: T.RED }}>Delayed · due {day(r.promised_delivery_at)}</small>}</td>
                            <td style={CELL} onClick={(e) => e.stopPropagation()}><div style={{ display: 'flex', gap: 6 }}><Btn small onClick={() => setSelectedId(r.id)}>{r.state === 'failed' ? 'Details' : 'Track'}</Btn></div></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, alignItems: 'center', padding: '8px 14px 0', fontSize: 12.5, color: T.TEXT_SECONDARY }}>
                  Rows per page <select aria-label="Rows per page" value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }} style={{ ...FIELD, height: 30 }}>{PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}</select>
                </div>
                <Pager page={safePage} pages={pages} total={visible.length} pageSize={pageSize} onPage={setPage} />
              </>
            )}
          </section>
          {selected && <Detail key={selected.id} shipment={selected} mobile={mobile} onClose={() => setSelectedId(null)} />}
        </div>
      )}
    </div>
  );
}
