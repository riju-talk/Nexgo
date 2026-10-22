'use client';
/* eslint-disable react/jsx-key -- cell arrays are positional; each cell is keyed by its <td> when rendered */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { useRouter } from 'next/navigation';
import { adminApi, ApiError } from '@/lib/api';
import { useAppState } from '@/lib/AppStateContext';
import * as T from '@/lib/theme';

const CARD = { background: 'var(--ops-surface)', border: '1px solid var(--ops-border)', borderRadius: 10, boxShadow: 'var(--ops-shadow)' };
const FIELD = { height: 33, padding: '0 10px', border: '1px solid var(--ops-border)', borderRadius: 8, background: 'var(--ops-surface)', color: 'var(--ops-text)', fontSize: 12.5 };
const title = (value = '') => value.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const money = (paise = 0) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(paise) / 100);

function Badge({ children, tone = 'neutral' }) { const map = tone === 'ok' ? ['#137D50', '#E8F7EF'] : tone === 'warn' ? ['#9B6500', '#FFF5DF'] : tone === 'bad' ? ['#B23A2B', '#FFF0EE'] : ['var(--ops-muted)', 'var(--ops-surface-soft)']; return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 8px', borderRadius: 99, color: map[0], background: map[1], fontSize: 11.5, fontWeight: 750, whiteSpace: 'nowrap' }}><span style={{ width: 5, height: 5, borderRadius: 9, background: map[0] }} />{children}</span>; }
function Button({ children, onClick, disabled, primary = false }) { return <motion.button whileTap={disabled ? undefined : { scale: .97 }} disabled={disabled} onClick={onClick} style={{ minHeight: 31, padding: '0 10px', border: `1px solid ${primary ? T.NAVY : 'var(--ops-border)'}`, borderRadius: 8, background: primary ? T.NAVY : 'var(--ops-surface)', color: primary ? '#fff' : 'var(--ops-heading)', fontSize: 12, fontWeight: 720, cursor: disabled ? 'wait' : 'pointer', opacity: disabled ? .55 : 1 }}>{children}</motion.button>; }

// Admin "Manage pincode": a pincode blocked here is blocked for every seller; opening it opens it for all sellers.
function ManagePincode() {
  const { showToast } = useAppState();
  const [text, setText] = useState(''); const [note, setNote] = useState(''); const [blocked, setBlocked] = useState(null); const [busy, setBusy] = useState(false);
  const load = useCallback(() => adminApi.pincodeBlocks().then((x) => setBlocked(x.items || [])).catch(() => setBlocked([])), []);
  useEffect(() => { load(); }, [load]);
  const parse = () => {
    const tokens = text.split(/[\s,;]+/).filter(Boolean);
    const bad = tokens.filter((t) => !/^\d{6}$/.test(t));
    if (!tokens.length) { showToast('Enter one or more 6-digit pincodes.', 'error'); return null; }
    if (bad.length) { showToast(`Not a valid pincode: ${bad.slice(0, 3).join(', ')}${bad.length > 3 ? '…' : ''}`, 'error'); return null; }
    if (tokens.length > 5000) { showToast('At most 5,000 pincodes at a time.', 'error'); return null; }
    return [...new Set(tokens)];
  };
  const act = async (mode) => {
    const pins = parse(); if (!pins) return;
    setBusy(true);
    try {
      if (mode === 'block') { const r = await adminApi.blockPincodes(pins, note.trim() || undefined); showToast(`${r.added} pincode(s) blocked for all sellers${r.added < r.requested ? ` (${r.requested - r.added} already blocked)` : ''}`); }
      else { const r = await adminApi.openPincodes(pins); showToast(`${r.removed} pincode(s) opened for all sellers${r.removed < r.requested ? ` (${r.requested - r.removed} were not blocked)` : ''}`); }
      setText(''); await load();
    } catch (e) { showToast(e instanceof ApiError ? e.message : 'Could not update pincodes', 'error'); } finally { setBusy(false); }
  };
  const openOne = async (pin) => { setBusy(true); try { await adminApi.openPincodes([pin]); showToast(`${pin} is open for all sellers`); await load(); } catch (e) { showToast(e instanceof ApiError ? e.message : 'Could not open pincode', 'error'); } finally { setBusy(false); } };
  return (
    <section style={{ ...CARD, padding: 16, marginBottom: 14 }}>
      <div style={{ fontSize: 14, fontWeight: 760, color: 'var(--ops-heading)' }}>Manage pincode</div>
      <p style={{ margin: '5px 0 12px', fontSize: 12.5, color: 'var(--ops-muted)' }}>Blocked pincodes are blocked for all sellers and every courier. Opening a pincode opens it for all sellers again.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px,2fr) minmax(160px,1fr)', gap: 10 }}>
        <textarea aria-label="Pincodes" value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste pincodes separated by comma, space or new line" rows={3} style={{ ...FIELD, height: 'auto', padding: 10, resize: 'vertical', fontFamily: T.MONO }} />
        <input aria-label="Reason" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason (optional)" maxLength={200} style={{ ...FIELD, alignSelf: 'start' }} />
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}><Button primary disabled={busy} onClick={() => act('block')}>Block for all sellers</Button><Button disabled={busy} onClick={() => act('open')}>Open for all sellers</Button></div>
      <div style={{ marginTop: 14, fontSize: 11.5, fontWeight: 750, letterSpacing: '.07em', textTransform: 'uppercase', color: 'var(--ops-muted)' }}>Blocked now{blocked ? ` · ${blocked.length}` : ''}</div>
      <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 7 }}>
        {blocked === null ? <span style={{ fontSize: 12.5, color: 'var(--ops-muted)' }}>Loading…</span> : !blocked.length ? <span style={{ fontSize: 12.5, color: 'var(--ops-muted)' }}>No pincode is blocked platform-wide.</span> : blocked.slice(0, 300).map((b) => <span key={b.pincode} title={[b.city, b.state, b.note].filter(Boolean).join(' · ')} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '4px 6px 4px 9px', borderRadius: 99, background: 'var(--ops-surface-soft)', border: '1px solid var(--ops-border)', fontFamily: T.MONO, fontSize: 12 }}>{b.pincode}<button type="button" aria-label={`Open ${b.pincode}`} disabled={busy} onClick={() => openOne(b.pincode)} style={{ border: 0, background: 'transparent', cursor: 'pointer', color: 'var(--ops-muted)', fontSize: 14, lineHeight: 1, padding: 0 }}>×</button></span>)}
        {blocked && blocked.length > 300 && <span style={{ fontSize: 12, color: 'var(--ops-muted)' }}>and {blocked.length - 300} more</span>}
      </div>
    </section>
  );
}

const FILTERED = ['orders', 'shipments', 'rto', 'ndr', 'pickups'];

export default function LiveAdminQueues({ activeId, mobile }) {
  const { nav, showToast, trackFocus, setTrackFocus } = useAppState();
  const router = useRouter();
  const [items, setItems] = useState(null); const [error, setError] = useState(null); const [busy, setBusy] = useState('');
  const kind = activeId.replace('a-', '');
  const filtered = FILTERED.includes(kind);
  const [sellers, setSellers] = useState([]); const [couriers, setCouriers] = useState([]);
  const [sellerId, setSellerId] = useState(''); const [providerId, setProviderId] = useState('');
  const [q, setQ] = useState(''); const [qLive, setQLive] = useState('');

  // Filter lists (sellers + couriers) load once per filtered screen.
  useEffect(() => {
    if (!filtered && kind !== 'couriers') return undefined;
    let live = true;
    if (filtered) adminApi.sellers({ limit: 100 }).then((x) => { if (live) setSellers(x.items || []); }).catch(() => {});
    adminApi.couriers().then((x) => { if (live) setCouriers(x.items || []); }).catch(() => {});
    return () => { live = false; };
  }, [filtered, kind]);

  // Reset filters when the screen changes; a search hand-off from the top bar pre-fills the box.
  useEffect(() => { setSellerId(''); setProviderId(''); setQ(''); setQLive(''); setItems(null); }, [kind]); // eslint-disable-line react-hooks/set-state-in-effect -- screen switch resets the filters
  useEffect(() => {
    if (!trackFocus || !['orders', 'shipments'].includes(kind)) return;
    setQ(trackFocus); setQLive(trackFocus); setTrackFocus(''); // eslint-disable-line react-hooks/set-state-in-effect -- one-shot hand-off from the top-bar search
  }, [trackFocus, kind, setTrackFocus]);
  useEffect(() => { const t = window.setTimeout(() => setQLive(q.trim()), 300); return () => window.clearTimeout(t); }, [q]);

  const load = useCallback(async () => {
    setError(null);
    const common = { limit: 200, ...(sellerId ? { sellerId } : {}) };
    try {
      let data;
      if (kind === 'sellers') data = await adminApi.sellers();
      else if (kind === 'orders') data = await adminApi.orders({ ...common, ...(qLive ? { q: qLive } : {}) });
      else if (kind === 'shipments') data = await adminApi.shipments({ ...common, ...(providerId ? { providerId } : {}), ...(qLive ? { q: qLive } : {}) });
      else if (kind === 'rto') data = await adminApi.shipments({ ...common, state: 'rto', ...(providerId ? { providerId } : {}), ...(qLive ? { q: qLive } : {}) });
      else if (kind === 'ndr') data = await adminApi.ndr({ ...(sellerId ? { sellerId } : {}), limit: 200 });
      else if (kind === 'pickups') data = await adminApi.pickups();
      else if (kind === 'couriers') data = await adminApi.couriers();
      setItems(data?.items || []);
    } catch (e) { setError(e); }
  }, [kind, sellerId, providerId, qLive]);
  useEffect(() => { load(); }, [load]); // eslint-disable-line react-hooks/set-state-in-effect -- async fetch on mount; state is set after the await

  const sellerName = useMemo(() => sellers.find((s) => s.id === sellerId)?.legal_name, [sellers, sellerId]);
  const rows = useMemo(() => {
    if (!items) return items;
    if (kind === 'pickups' && sellerName) return items.filter((r) => r.seller_name === sellerName);
    // One row per courier service: Courier / Service Provider / Integration / Mode Type.
    if (kind === 'couriers') return items.flatMap((c) => (c.services?.length ? c.services : [null]).map((s, i) => ({ id: `${c.id}-${s?.id || i}`, courier: c, service: s })));
    return items;
  }, [items, kind, sellerName]);

  const columns = { sellers: ['Seller Name', 'Email ID', 'KYC Status', 'Nexgo Code', 'Created on', 'POC', 'Status', 'View Details'], orders: ['Order', 'Seller', 'Customer', 'Flow', 'Value', 'State'], shipments: ['AWB', 'Courier', 'Seller', 'Order', 'Charge', 'Status'], rto: ['AWB', 'Courier', 'Seller', 'Order', 'Charge', 'Status'], pickups: ['Seller', 'Warehouse', 'Courier', 'Requested for', 'Status'], ndr: ['AWB', 'Seller', 'Reason', 'State'], couriers: ['Courier', 'Service Provider', 'Integration', 'Mode Type', 'COD'] }[kind];
  const cells = (r) => {
    if (kind === 'sellers') return [<b>{r.legal_name}</b>, r.email || '—', <Badge tone={r.kyc_status === 'verified' ? 'ok' : 'warn'}>{title(r.kyc_status)}</Badge>, <b style={{ fontFamily: T.MONO }}>{r.nexgo_code}</b>, new Date(r.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }), r.poc_name || '—', <Badge tone={r.state === 'active' ? 'ok' : r.state === 'suspended' ? 'bad' : 'warn'}>{title(r.state)}</Badge>, <Button onClick={() => router.push(`/admin/sellers/${r.id}`)}>View Details</Button>];
    if (kind === 'orders') { const flow = r.notes === 'Created from bulk order upload' ? 'bulk import' : r.order_flow; return [<b style={{ fontFamily: T.MONO }}>{r.order_number}</b>, r.seller_name, <><b>{r.customer_name}</b><small>{r.customer_city} · {r.customer_pincode}</small></>, <Badge tone={r.order_flow === 'reverse' ? 'warn' : r.order_flow === 'ship_now' ? 'ok' : 'neutral'}>{title(flow)}</Badge>, money(r.subtotal_paise), <Badge tone={r.state === 'booked' ? 'ok' : r.state === 'cancelled' ? 'bad' : 'neutral'}>{title(r.state)}</Badge>]; }
    if (kind === 'shipments' || kind === 'rto') return [<b style={{ fontFamily: T.MONO }}>{r.awb}</b>, <><b>{r.courier_name}</b><small>{r.service_name}</small></>, r.seller_name, r.order_number, money(r.shipping_charge_paise), <Badge tone={r.state === 'delivered' ? 'ok' : r.state === 'ndr' || r.state === 'rto' ? 'warn' : 'neutral'}>{title(r.state)}</Badge>];
    if (kind === 'pickups') return [r.seller_name, <b>{r.warehouse_name}</b>, r.courier_name || 'Courier to be assigned', new Date(r.requested_for).toLocaleDateString('en-IN'), <Badge tone={r.state === 'completed' ? 'ok' : r.state === 'cancelled' ? 'bad' : 'warn'}>{title(r.state)}</Badge>];
    if (kind === 'ndr') return [<b style={{ fontFamily: T.MONO }}>{r.awb}</b>, r.seller_name, <><b>{title(r.reason_code || 'Exception')}</b><small>{r.order_number}</small></>, <Badge tone={r.state === 'open' ? 'warn' : 'ok'}>{title(r.state)}</Badge>];
    const { courier: c, service: s } = r;
    return [<><b>{c.name}</b><small>{c.code}</small></>, s?.serviceProvider || 'Direct (3PL)', <Badge tone={c.integration_state === 'live' ? 'ok' : 'warn'}>{title(c.integration_state)}</Badge>, s ? title(s.type) : '—', c.supports_cod ? <Badge tone="ok">Enabled</Badge> : <Badge>Off</Badge>];
  };
  const empty = <div style={{ ...CARD, padding: 48, textAlign: 'center', color: 'var(--ops-muted)', fontSize: 13.5 }}>{error instanceof ApiError && error.status === 401 ? <><div>Sign in as a platform administrator to load this live queue.</div><div style={{ marginTop: 15 }}><Button onClick={() => nav('admin-login')}>Admin sign in</Button></div></> : error ? 'This list could not be loaded. Try Refresh.' : (qLive || sellerId || providerId) ? 'Nothing matches these filters.' : `No live ${kind} to show yet.`}</div>;
  const courierTabs = (kind === 'shipments' || kind === 'rto') && couriers.length > 0;
  const tab = (id, label) => <button key={id || 'all'} type="button" onClick={() => setProviderId(id)} style={{ height: 31, padding: '0 12px', border: `1px solid ${providerId === id ? T.NAVY : 'var(--ops-border)'}`, borderRadius: 99, background: providerId === id ? T.NAVY : 'var(--ops-surface)', color: providerId === id ? '#fff' : 'var(--ops-heading)', fontSize: 12, fontWeight: 720, cursor: 'pointer' }}>{label}</button>;
  return <div style={{ padding: mobile ? '14px 12px 42px' : '18px 28px 48px', maxWidth: '100%', margin: '0 auto' }}>
    {kind === 'couriers' && <ManagePincode />}
    {courierTabs && <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 10 }}>{tab('', 'All couriers')}{couriers.map((c) => tab(c.id, c.name))}</div>}
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 13, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {['orders', 'shipments', 'rto'].includes(kind) && <input aria-label="Search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={kind === 'orders' ? 'Search order, customer or phone' : 'Search AWB or order number'} style={{ ...FIELD, width: mobile ? '100%' : 260 }} />}
        {filtered && <select aria-label="Seller" value={sellerId} onChange={(e) => setSellerId(e.target.value)} style={{ ...FIELD, maxWidth: 220 }}><option value="">All sellers</option>{sellers.map((s) => <option key={s.id} value={s.id}>{s.legal_name}</option>)}</select>}
        <span style={{ color: 'var(--ops-muted)', fontSize: 13 }}>{rows ? `${rows.length} live records` : 'Connecting to platform operations'}</span>
      </div>
      <Button onClick={load}>Refresh</Button>
    </div>
    {!rows && !error ? <div style={{ ...CARD, minHeight: 220, display: 'grid', placeItems: 'center', color: 'var(--ops-muted)' }}>Loading live queue</div> : error || !rows?.length ? empty : <div style={{ ...CARD, overflow: 'hidden' }}><div style={{ overflowX: 'auto' }}><table style={{ width: '100%', minWidth: 680, borderCollapse: 'collapse' }}><thead><tr>{columns.map((x) => <th key={x} style={{ padding: '11px 15px', background: 'var(--ops-surface-soft)', textAlign: 'left', color: 'var(--ops-muted)', fontSize: 10.5, letterSpacing: '.075em', textTransform: 'uppercase' }}>{x}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.id}>{cells(row).map((cell, index) => <td key={index} style={{ padding: '13px 15px', borderTop: '1px solid var(--ops-divider)', color: 'var(--ops-text)', fontSize: 13, fontWeight: typeof cell === 'string' || typeof cell === 'number' ? 560 : 400 }}>{cell}</td>)}</tr>)}</tbody></table></div></div>}
  </div>;
}
