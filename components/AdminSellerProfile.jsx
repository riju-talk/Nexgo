'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { adminApi, apiFetch, ApiError } from '@/lib/api';
import { useAppState } from '@/lib/AppStateContext';
import { openSellerFile } from '@/lib/uploadFile';
import * as T from '@/lib/theme';

const CARD = { background: 'var(--ops-surface)', border: '1px solid var(--ops-border)', borderRadius: 12, boxShadow: 'var(--ops-shadow)', padding: 18 };
const FIELD = { height: 38, width: '100%', boxSizing: 'border-box', border: '1px solid var(--ops-border)', borderRadius: 8, padding: '0 10px', background: 'var(--ops-surface)', color: 'var(--ops-text)', fontSize: 13 };
const title = (v = '') => v.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const money = (paise = 0) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(paise) / 100);
const dateTime = (v) => (v ? new Date(v).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) : '—');
const dateOnly = (v) => (v ? new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const errText = (e, fallback) => (e instanceof ApiError ? e.message : fallback);

function Btn({ children, onClick, disabled, tone, type = 'button' }) {
  const solid = tone === 'primary';
  return <button type={type} disabled={disabled} onClick={onClick} style={{ minHeight: 36, padding: '0 14px', borderRadius: 8, border: solid ? '1px solid var(--ac, #3877fc)' : '1px solid var(--ops-border)', background: solid ? 'var(--ac, #3877fc)' : 'var(--ops-surface)', color: solid ? '#fff' : tone === 'danger' ? '#B23A2B' : 'var(--ops-text)', fontSize: 13, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? .55 : 1, textAlign: 'left' }}>{children}</button>;
}
const Row = ({ k, v }) => <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, padding: '7px 0', fontSize: 13 }}><span style={{ color: 'var(--ops-muted)', flexShrink: 0 }}>{k}</span><b style={{ textAlign: 'right', wordBreak: 'break-word', fontWeight: 600 }}>{v ?? '—'}</b></div>;
const Section = ({ heading, children, full }) => <section style={{ ...CARD, gridColumn: full ? '1 / -1' : undefined, minWidth: 0 }}><h3 style={{ margin: '0 0 8px', fontSize: 13.5, fontWeight: 700, color: 'var(--ops-heading)' }}>{heading}</h3>{children}</section>;
const Label = ({ children, hint }) => <label style={{ display: 'grid', gap: 5, fontSize: 12, color: 'var(--ops-muted)' }}><span>{children}</span>{hint}</label>;

function Modal({ heading, onClose, children, wide, xl }) {
  return (
    <div role="dialog" aria-label={heading} onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 80, display: 'grid', placeItems: 'center', background: 'rgba(15,30,45,.45)', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...CARD, width: `min(${xl ? 1280 : wide ? 860 : 460}px, 100%)`, maxHeight: '90vh', overflowY: 'auto', color: 'var(--ops-text)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}><b style={{ fontSize: 15 }}>{heading}</b><Btn onClick={onClose}>Close</Btn></div>
        {children}
      </div>
    </div>
  );
}

function PasswordModal({ sellerId, owner, onClose }) {
  const { showToast } = useAppState();
  const [password, setPassword] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError('');
    try { await apiFetch(`/v1/admin/sellers/${sellerId}/password`, { method: 'POST', body: { password } }); showToast('Password updated. The seller is signed out everywhere.'); onClose(); }
    catch (err) { setError(errText(err, 'Password could not be updated')); } finally { setBusy(false); }
  };
  return <Modal heading="Update password" onClose={onClose}><form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
    <div style={{ fontSize: 13, color: 'var(--ops-muted)' }}>New password for {owner || 'the account owner'}. All their sessions are signed out.</div>
    <Label>New password (min 12 characters)<input type="password" autoComplete="new-password" style={FIELD} value={password} onChange={(e) => setPassword(e.target.value)} minLength={12} required /></Label>
    {error && <div role="alert" style={{ color: '#B23A2B', fontSize: 12.5 }}>{error}</div>}
    <Btn type="submit" tone="primary" disabled={busy || password.length < 12}>{busy ? 'Saving…' : 'Update password'}</Btn>
  </form></Modal>;
}

function WalletModal({ sellerId, balance, onClose, onDone }) {
  const { showToast } = useAppState();
  const [type, setType] = useState('credit'); const [amount, setAmount] = useState(''); const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [key] = useState(() => crypto.randomUUID());
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError('');
    try {
      const out = await apiFetch(`/v1/admin/sellers/${sellerId}/wallet-notes`, { method: 'POST', body: { type, amountPaise: Math.round(Number(amount) * 100), reason, idempotencyKey: key } });
      showToast(`${type === 'credit' ? 'Credit' : 'Debit'} note posted. Wallet is now ${money(out.walletBalancePaise)}`); onDone(); onClose();
    } catch (err) { setError(errText(err, 'Note could not be posted')); } finally { setBusy(false); }
  };
  return <Modal heading="Wallet management" onClose={onClose}><form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
    <div style={{ fontSize: 13, color: 'var(--ops-muted)' }}>Current balance <b style={{ color: 'var(--ops-text)' }}>{money(balance)}</b></div>
    <div style={{ display: 'flex', gap: 8 }}>
      <Btn tone={type === 'credit' ? 'primary' : undefined} onClick={() => setType('credit')}>Add money (credit note)</Btn>
      <Btn tone={type === 'debit' ? 'primary' : undefined} onClick={() => setType('debit')}>Deduct money (debit note)</Btn>
    </div>
    <Label>Amount (₹)<input style={FIELD} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} required /></Label>
    <Label>Reason (shown on the wallet ledger)<input style={FIELD} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} required /></Label>
    {error && <div role="alert" style={{ color: '#B23A2B', fontSize: 12.5 }}>{error}</div>}
    <Btn type="submit" tone="primary" disabled={busy || !(Number(amount) >= 1) || reason.trim().length < 3}>{busy ? 'Posting…' : type === 'credit' ? 'Post credit note' : 'Post debit note'}</Btn>
  </form></Modal>;
}

// Zones A–E in the order couriers publish them (`rate_card_rates.zone_code`); same layout as the seller's Rate Card page.
const ZONES = [['within_city', 'Zone A', 'Within city'], ['within_state', 'Zone B', 'Within state'], ['metro_to_metro', 'Zone C', 'Metro to metro'], ['rest_of_india', 'Zone D', 'Rest of India'], ['ne_jk', 'Zone E', 'Special zones']];
const grams = (g) => (g >= 1000 ? `${g / 1000} kg` : `${g} g`);
const rs = (paise) => (paise == null ? '—' : `₹${(Number(paise) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const isAir = (name = '') => /air|express/i.test(name);

const Pill = ({ children, tone }) => <span style={{ display: 'inline-block', border: tone ? 0 : '1px solid var(--ops-border)', background: tone ? '#E8EEFB' : 'var(--ops-surface)', color: tone ? '#1B3A8A' : 'var(--ops-heading)', borderRadius: 8, padding: tone ? '3px 8px' : '6px 12px', fontSize: tone ? 10.5 : 13, fontWeight: 700, letterSpacing: tone ? '.04em' : 0, textTransform: tone ? 'uppercase' : 'none' }}>{children}</span>;
const Seg = ({ on, onClick, children }) => <button type="button" aria-pressed={on} onClick={onClick} style={{ padding: '8px 22px', border: 0, borderRadius: 99, background: on ? '#1B3A8A' : 'transparent', color: on ? '#fff' : 'var(--ops-text)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>{children}</button>;

// Rate chart: one row per courier service and weight slab, one price per zone. Forward / RTO toggle and GST switch like the seller's rate chart.
function RateMatrix({ rates }) {
  const [weight, setWeight] = useState(''); const [mode, setMode] = useState(''); const [courier, setCourier] = useState('');
  const [dir, setDir] = useState('fwd'); const [gst, setGst] = useState(false); const [open, setOpen] = useState({});
  const rows = useMemo(() => {
    const map = new Map();
    for (const r of rates) {
      const key = `${r.provider_name}|${r.service_name}|${r.min_weight_g}`;
      if (!map.has(key)) map.set(key, { key, provider: r.provider_name, service: r.service_name, from: r.min_weight_g, rows: [] });
      map.get(key).rows.push(r);
    }
    return [...map.values()].sort((a, b) => a.from - b.from || a.provider.localeCompare(b.provider));
  }, [rates]);
  const weights = [...new Set(rows.map((r) => r.from))].sort((a, b) => a - b);
  const couriers = [...new Set(rows.map((r) => r.provider))].sort();
  const shown = rows.filter((r) => (!weight || r.from === Number(weight)) && (!mode || (isAir(r.service) ? 'Air' : 'Surface') === mode) && (!courier || r.provider === courier));
  const rateFor = (row, zone) => row.rows.find((r) => r.zone_code === zone) || row.rows.find((r) => r.zone_code === 'national') || null;
  const price = (paise) => (paise == null ? '—' : rs(gst ? Math.round(Number(paise) * 1.18) : paise));
  const base = (r) => (dir === 'fwd' ? r?.base_price_paise : r?.rto_base_price_paise);
  const extra = (r) => (dir === 'fwd' ? r?.additional_price_paise : r?.rto_additional_price_paise);
  const codOf = (row) => { const r = rateFor(row, 'within_city') || row.rows[0]; if (!r || (!r.cod_fee_paise && !r.cod_percent_bps)) return '—'; const pct = `${((r.cod_percent_bps || 0) / 100).toFixed((r.cod_percent_bps || 0) % 100 ? 1 : 0)}%`; return `${rs(r.cod_fee_paise)} or ${pct}`; };
  const sel = { ...FIELD, width: 'auto', minWidth: 150, height: 40, borderRadius: 10 };
  return <div>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <select aria-label="Weight" style={sel} value={weight} onChange={(e) => setWeight(e.target.value)}><option value="">All weights</option>{weights.map((g) => <option key={g} value={g}>From {grams(g)}</option>)}</select>
        <select aria-label="Mode" style={sel} value={mode} onChange={(e) => setMode(e.target.value)}><option value="">All modes</option><option value="Surface">Surface</option><option value="Air">Air</option></select>
        <select aria-label="Courier" style={sel} value={courier} onChange={(e) => setCourier(e.target.value)}><option value="">All couriers</option>{couriers.map((c) => <option key={c} value={c}>{c}</option>)}</select>
      </div>
      <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, cursor: 'pointer' }}><input type="checkbox" checked={gst} onChange={(e) => setGst(e.target.checked)} />Include GST (18%)</label>
        <div role="group" aria-label="Direction" style={{ display: 'flex', padding: 3, borderRadius: 99, background: 'var(--ops-surface-soft)', border: '1px solid var(--ops-border)' }}><Seg on={dir === 'fwd'} onClick={() => setDir('fwd')}>Forward</Seg><Seg on={dir === 'rto'} onClick={() => setDir('rto')}>RTO</Seg></div>
      </div>
    </div>
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', minWidth: 980, borderCollapse: 'separate', borderSpacing: '0 8px' }}>
        <thead><tr>{['Courier partner', 'Weight', ...ZONES.map(([, l]) => l), 'COD'].map((h, i) => <th key={h} style={{ padding: '14px 12px', textAlign: i === 0 ? 'left' : 'center', fontSize: 11.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--ops-muted)', background: 'var(--ops-surface-soft)', borderRadius: i === 0 ? '10px 0 0 10px' : i === 7 ? '0 10px 10px 0' : 0 }}>{h}{i >= 2 && i <= 6 && <small title={ZONES[i - 2][2]} style={{ display: 'block', fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>{ZONES[i - 2][2]}</small>}</th>)}</tr></thead>
        <tbody>{!shown.length ? <tr><td colSpan={8} style={{ padding: 24, textAlign: 'center', color: 'var(--ops-muted)' }}>No rates match these filters.</td></tr> : shown.flatMap((row) => {
          const first = rateFor(row, 'within_city') || row.rows[0]; const isOpen = !!open[row.key];
          const cell = { padding: '14px 12px', textAlign: 'center', borderTop: '1px solid var(--ops-border)', borderBottom: '1px solid var(--ops-border)', background: 'var(--ops-surface)' };
          const out = [<tr key={row.key}>
            <td style={{ ...cell, textAlign: 'left', borderLeft: '1px solid var(--ops-border)', borderRadius: '10px 0 0 10px' }}><div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}><Pill>{row.provider} {row.service}</Pill><Pill tone>{isAir(row.service) ? 'Air' : 'Surface'}</Pill></div></td>
            <td style={cell}><button type="button" aria-expanded={isOpen} aria-label={`Details for ${row.provider} ${row.service}`} onClick={() => setOpen((o) => ({ ...o, [row.key]: !o[row.key] }))} style={{ border: 0, background: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--ops-text)' }}>{isOpen ? '▾' : '▸'} &nbsp;{grams(row.from)}</button></td>
            {ZONES.map(([code]) => <td key={code} style={{ ...cell, fontWeight: 700, color: '#1B3A8A', fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>{price(base(rateFor(row, code)))}</td>)}
            <td style={{ ...cell, borderRight: '1px solid var(--ops-border)', borderRadius: '0 10px 10px 0', color: 'var(--ops-muted)', fontSize: 12.5 }}>{codOf(row)}</td>
          </tr>];
          if (isOpen) out.push(<tr key={`${row.key}-d`}>
            <td colSpan={2} style={{ padding: '4px 14px 10px', fontSize: 12.5, color: 'var(--ops-muted)' }}>First {grams(first.base_weight_g)} is the price shown. Every extra {grams(first.additional_weight_g)} adds:</td>
            {ZONES.map(([code]) => <td key={code} style={{ padding: '4px 12px 10px', textAlign: 'center', fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>+ {price(extra(rateFor(row, code)))}</td>)}
            <td />
          </tr>);
          return out;
        })}</tbody>
      </table>
    </div>
  </div>;
}

function RateCardModal({ sellerId, assign, onClose, onDone }) {
  const { showToast } = useAppState();
  const [view, setView] = useState(null); const [cards, setCards] = useState([]); const [pick, setPick] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  useEffect(() => {
    apiFetch(`/v1/admin/sellers/${sellerId}/rate-card`).then(setView).catch((e) => setError(errText(e, 'Rate card could not be loaded')));
    if (assign) apiFetch('/v1/admin/rate-cards').then((d) => setCards(d.items)).catch(() => {});
  }, [sellerId, assign]);
  const apply = async () => {
    setBusy(true); setError('');
    try { await apiFetch(`/v1/admin/sellers/${sellerId}/assign-rate-card`, { method: 'POST', body: { sourceRateCardId: pick } }); showToast('Rate card assigned. New bookings use it; shipments already booked keep their price.'); onDone(); onClose(); }
    catch (e) { setError(errText(e, 'Rate card could not be assigned')); } finally { setBusy(false); }
  };
  return <Modal heading={assign ? 'Assign rate card' : 'Rate card'} onClose={onClose} xl>
    {assign && <div style={{ ...CARD, background: 'var(--ops-surface-soft)', boxShadow: 'none', marginBottom: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Copy another seller&apos;s rate card onto this seller</div>
      <div style={{ fontSize: 12.5, color: 'var(--ops-muted)', marginBottom: 10 }}>New bookings use the copied rates. Shipments already booked keep their price. The table below is this seller&apos;s current card.</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <select style={{ ...FIELD, flex: 1, minWidth: 240 }} value={pick} onChange={(e) => setPick(e.target.value)}><option value="">Select a seller&apos;s rate card…</option>{cards.map((c) => <option key={c.id} value={c.id}>{c.seller_name} ({c.nexgo_code}) — {c.name}</option>)}</select>
        <Btn tone="primary" disabled={!pick || busy} onClick={apply}>{busy ? 'Assigning…' : 'Assign to this seller'}</Btn>
      </div>
    </div>}
    {error && <div role="alert" style={{ color: '#B23A2B', fontSize: 12.5, marginBottom: 10 }}>{error}</div>}
    {!view ? <div style={{ color: 'var(--ops-muted)', padding: 16 }}>Loading…</div> : !view.card ? <div style={{ color: 'var(--ops-muted)', padding: 16 }}>No active rate card for this seller.</div> : <>
      <div style={{ fontSize: 13, marginBottom: 10 }}><b>{view.card.name}</b> · effective {dateOnly(view.card.effective_from)} · prices are before 18% GST</div>
      <RateMatrix rates={view.rates} />
    </>}
  </Modal>;
}

function PincodeModal({ sellerId, onClose, onDone }) {
  const { showToast } = useAppState();
  const [items, setItems] = useState(null); const [search, setSearch] = useState(''); const [text, setText] = useState(''); const [serviceId, setServiceId] = useState(''); const [services, setServices] = useState([]);
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const load = useCallback(() => apiFetch(`/v1/admin/sellers/${sellerId}/pincode-blocks`).then((d) => setItems(d.items)).catch((e) => setError(errText(e, 'Blocked pincodes could not be loaded'))), [sellerId]);
  useEffect(() => { load(); adminApi.couriers().then((d) => setServices((d.items || []).flatMap((c) => (c.services || []).map((s) => ({ id: s.id, label: `${c.name} ${s.name}` }))))).catch(() => {}); }, [load]);
  const pins = [...new Set(text.split(/[\s,;]+/).filter(Boolean))];
  const bad = pins.filter((p) => !/^\d{6}$/.test(p));
  const run = async (fn, done) => { setBusy(true); setError(''); try { const out = await fn(); showToast(done(out)); setText(''); await load(); onDone(); } catch (e) { setError(errText(e, 'Pincode change failed')); } finally { setBusy(false); } };
  return <Modal heading="Pincode access" onClose={onClose} wide>
    <div style={{ fontSize: 13, color: 'var(--ops-muted)', marginBottom: 12 }}>Blocked pincodes are refused for this seller only — quotes, auto-assign and booking all enforce it on the server.</div>
    <div style={{ display: 'grid', gap: 10 }}>
      <textarea style={{ ...FIELD, height: 90, padding: 10, fontFamily: T.MONO }} placeholder="Paste pincodes, separated by commas, spaces or new lines" value={text} onChange={(e) => setText(e.target.value)} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <select style={{ ...FIELD, width: 'auto', minWidth: 220 }} value={serviceId} onChange={(e) => setServiceId(e.target.value)}><option value="">All couriers</option>{services.map((s) => <option key={s.id} value={s.id}>Only {s.label}</option>)}</select>
        <Btn tone="primary" disabled={busy || !pins.length || bad.length > 0} onClick={() => run(() => apiFetch(`/v1/admin/sellers/${sellerId}/pincode-blocks`, { method: 'POST', body: { pincodes: pins, serviceId: serviceId || null } }), (o) => `${o.added} pincode(s) blocked`)}>Block {pins.length || ''} pincode(s)</Btn>
        <Btn disabled={busy || !pins.length || bad.length > 0} onClick={() => run(() => apiFetch(`/v1/admin/sellers/${sellerId}/pincode-blocks/remove`, { method: 'POST', body: { pincodes: pins } }), (o) => `${o.removed} pincode(s) unblocked`)}>Unblock listed</Btn>
        <Btn tone="danger" disabled={busy || !items?.length} onClick={() => run(() => apiFetch(`/v1/admin/sellers/${sellerId}/pincode-blocks/remove`, { method: 'POST', body: { all: true } }), (o) => `${o.removed} pincode(s) unblocked`)}>Clear all</Btn>
      </div>
      {bad.length > 0 && <div role="alert" style={{ color: '#B23A2B', fontSize: 12.5 }}>Not a 6-digit pincode: {bad.slice(0, 6).join(', ')}{bad.length > 6 ? '…' : ''}</div>}
      {error && <div role="alert" style={{ color: '#B23A2B', fontSize: 12.5 }}>{error}</div>}
    </div>
    {(() => {
      // One row per pincode (a pincode can be blocked for several couriers); unblocking a row clears all of them.
      const byPin = new Map();
      for (const b of items || []) byPin.set(b.pincode, [...(byPin.get(b.pincode) || []), b.provider_name ? `${b.provider_name} ${b.service_name}` : 'All couriers']);
      const q = search.trim();
      const list = [...byPin.entries()].filter(([pin]) => !q || pin.includes(q));
      return <div style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
          <b style={{ fontSize: 13 }}>{items ? `${byPin.size} blocked pincode${byPin.size === 1 ? '' : 's'}` : 'Loading…'}</b>
          <input aria-label="Search blocked pincodes" placeholder="Search a pincode" inputMode="numeric" style={{ ...FIELD, width: 200 }} value={search} onChange={(e) => setSearch(e.target.value.replace(/\D/g, '').slice(0, 6))} />
        </div>
        {items && !list.length && <div style={{ color: 'var(--ops-muted)', fontSize: 13, padding: '10px 0' }}>{q ? 'No blocked pincode matches this search.' : 'No pincodes are blocked for this seller.'}</div>}
        {!!list.length && <div style={{ border: '1px solid var(--ops-border)', borderRadius: 10, maxHeight: 280, overflowY: 'auto' }}>
          {list.slice(0, 300).map(([pin, scopes], i) => <div key={pin} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '8px 12px', borderTop: i ? '1px solid var(--ops-divider)' : 0 }}>
            <span style={{ minWidth: 0 }}><b style={{ fontFamily: T.MONO, fontSize: 13 }}>{pin}</b><small style={{ marginLeft: 10, color: 'var(--ops-muted)' }}>{scopes.join(', ')}</small></span>
            <Btn disabled={busy} onClick={() => run(() => apiFetch(`/v1/admin/sellers/${sellerId}/pincode-blocks/remove`, { method: 'POST', body: { pincodes: [pin] } }), () => `${pin} unblocked`)}>Unblock</Btn>
          </div>)}
        </div>}
        {list.length > 300 && <div style={{ fontSize: 12, color: 'var(--ops-muted)', marginTop: 6 }}>Showing the first 300. Search a pincode to find the rest.</div>}
      </div>;
    })()}
  </Modal>;
}

function PocEditor({ sellerId, p, onSaved }) {
  const { showToast } = useAppState();
  const [f, setF] = useState({ kam: p.kam_name || '', opener: p.account_opened_by || '', limit: String(p.wallet_debit_limit_paise / 100), approval: String(p.wallet_debit_approval_paise / 100), approvedBy: p.wallet_debit_approved_by || '', days: String(p.remittance_days >= 1 && p.remittance_days <= 7 ? p.remittance_days : 2) });
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const num = (v) => Math.round(Number(v || 0) * 100);
  const save = async (e) => {
    e.preventDefault(); setBusy(true); setError('');
    try {
      await apiFetch(`/v1/admin/sellers/${sellerId}/poc`, { method: 'PATCH', body: { kamName: f.kam || null, accountOpenedBy: f.opener || null, walletDebitLimitPaise: num(f.limit), walletDebitApprovalPaise: num(f.approval), walletDebitApprovedBy: f.approvedBy || null, remittanceDays: Number(f.days) } });
      showToast('POC details saved'); onSaved();
    } catch (err) { setError(errText(err, 'POC details could not be saved')); } finally { setBusy(false); }
  };
  return <form onSubmit={save} style={{ display: 'grid', gap: 11 }}>
    <Row k="Account opening date" v={dateOnly(p.created_at)} />
    <Row k="KYC approved" v={p.kyc_status === 'verified' ? 'Y' : 'N'} />
    <Label>Account opened by<input style={FIELD} value={f.opener} onChange={set('opener')} maxLength={120} /></Label>
    <Label>KAM name<input style={FIELD} value={f.kam} onChange={set('kam')} maxLength={120} /></Label>
    <Label>Wallet debit limit (₹ the wallet may go below zero)<input style={FIELD} inputMode="decimal" value={f.limit} onChange={(e) => setF((s) => ({ ...s, limit: e.target.value.replace(/[^0-9.]/g, '') }))} /></Label>
    <Label>Wallet debit approval (₹)<input style={FIELD} inputMode="decimal" value={f.approval} onChange={(e) => setF((s) => ({ ...s, approval: e.target.value.replace(/[^0-9.]/g, '') }))} /></Label>
    <Label>Wallet debit approved by<input style={FIELD} value={f.approvedBy} onChange={set('approvedBy')} maxLength={120} /></Label>
    <Label>Remittance cycle<select style={FIELD} value={f.days} onChange={set('days')}>{[1, 2, 3, 4, 5, 6, 7].map((d) => <option key={d} value={d}>D+{d}</option>)}</select></Label>
    {error && <div role="alert" style={{ color: '#B23A2B', fontSize: 12.5 }}>{error}</div>}
    <div><Btn type="submit" tone="primary" disabled={busy}>{busy ? 'Saving…' : 'Save POC details'}</Btn></div>
  </form>;
}

const DOC_LABELS = { kyc_pan: 'PAN card', kyc_aadhaar: 'Aadhaar', kyc_aadhaar_front: 'Aadhaar (front)', kyc_aadhaar_back: 'Aadhaar (back)', kyc_gst: 'GST certificate', kyc_bank: 'Cancelled cheque / bank statement', logo: 'Invoice logo', signature: 'Invoice signature' };

function Documents({ sellerId }) {
  const { showToast } = useAppState();
  const [files, setFiles] = useState(null); const [error, setError] = useState('');
  useEffect(() => { apiFetch(`/v1/admin/sellers/${sellerId}/files`).then((d) => setFiles(d.items)).catch((e) => setError(errText(e, 'Documents could not be loaded'))); }, [sellerId]);
  const view = (id) => openSellerFile(id, true).catch((e) => showToast(errText(e, 'File could not be opened'), 'error'));
  return <Section heading="Uploaded documents">
    {error ? <div role="alert" style={{ color: '#B23A2B', fontSize: 13 }}>{error}</div> : !files ? <div style={{ color: 'var(--ops-muted)', fontSize: 13 }}>Loading…</div> : !files.length ? <div style={{ color: 'var(--ops-muted)', fontSize: 13 }}>No documents uploaded yet.</div> :
      files.map((f) => <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '7px 0', fontSize: 13 }}>
        <span style={{ minWidth: 0 }}><b style={{ fontWeight: 600 }}>{DOC_LABELS[f.purpose] || f.purpose}</b><small style={{ display: 'block', color: 'var(--ops-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.filename} · {dateOnly(f.created_at)}</small></span>
        <Btn onClick={() => view(f.id)}>View</Btn>
      </div>)}
  </Section>;
}

function Reports({ sellerId }) {
  const [today] = useState(() => new Date().toISOString().slice(0, 10));
  const [from, setFrom] = useState(() => new Date(Date.now() - 29 * 864e5).toISOString().slice(0, 10)); const [to, setTo] = useState(today);
  const [res, setRes] = useState(null);
  const key = `${sellerId}|${from}|${to}`;
  useEffect(() => {
    let live = true;
    const qs = `from=${from}&to=${to}`;
    Promise.all([apiFetch(`/v1/admin/sellers/${sellerId}/performance?${qs}`), apiFetch(`/v1/admin/sellers/${sellerId}/profitability?${qs}`)])
      .then(([perf, profit]) => { if (live) setRes({ key, perf, profit }); }).catch((e) => live && setRes({ key, error: errText(e, 'Reports could not be loaded') }));
    return () => { live = false; };
  }, [sellerId, from, to, key]);
  const current = res?.key === key ? res : null;
  const { perf, profit, error } = current || {};
  const stat = (k, v, sub) => <div style={{ padding: '10px 12px', border: '1px solid var(--ops-divider)', borderRadius: 10 }}><div style={{ fontSize: 11, color: 'var(--ops-muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{k}</div><div style={{ fontSize: 20, fontWeight: 700, marginTop: 3 }}>{v}</div>{sub && <div style={{ fontSize: 11.5, color: 'var(--ops-muted)', marginTop: 2 }}>{sub}</div>}</div>;
  return <Section heading="Performance & profitability" full>
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12, fontSize: 12.5, color: 'var(--ops-muted)' }}>
      <span>Booked between</span><input type="date" style={{ ...FIELD, width: 150 }} value={from} max={to} onChange={(e) => setFrom(e.target.value)} /><span>and</span><input type="date" style={{ ...FIELD, width: 150 }} value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} />
    </div>
    {error ? <div role="alert" style={{ color: '#B23A2B', fontSize: 13 }}>{error}</div> : !perf || !profit ? <div style={{ color: 'var(--ops-muted)' }}>Loading…</div> : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
      {stat('Packets given', perf.packets, `${perf.cancelled} cancelled not counted`)}
      {stat('Delivered', perf.delivered, `${perf.in_transit} in transit · ${perf.ndr} NDR · ${perf.rto} RTO`)}
      {stat('Delivery %', `${perf.deliveryPercent}%`, 'Delivered ÷ packets booked')}
      {stat('Rate given to seller', money(profit.sellerChargedPaise), `${profit.packets} packets`)}
      {stat('Rate from courier', profit.costCardConfigured ? money(profit.courierCostPaise) : 'Not set', profit.costCardConfigured ? `${profit.costedPackets} of ${profit.packets} packets priced` : 'Publish the courier cost card in Partners')}
      {stat('Profit', profit.costCardConfigured ? money(profit.profitPaise) : '—', 'Seller rate − courier rate, per packet')}
    </div>}
  </Section>;
}

const STATE_TONE = { active: ['#E6F6EE', '#1C7C4D'], suspended: ['#FDECEA', '#B23A2B'] };
const TABS = [['overview', 'Overview'], ['account', 'Account & wallet'], ['documents', 'Documents'], ['performance', 'Performance']];

function StateBadge({ state }) {
  const [bg, fg] = STATE_TONE[state] || ['#FFF4DB', '#8A5A00'];
  return <span style={{ background: bg, color: fg, borderRadius: 99, padding: '3px 10px', fontSize: 12, fontWeight: 600 }}>● {title(state)}</span>;
}

function Kpi({ label, value, sub }) {
  return <div style={{ border: '1px solid var(--ops-border)', borderRadius: 12, padding: '12px 14px', background: 'var(--ops-surface)', minWidth: 0 }}>
    <div style={{ fontSize: 12, color: 'var(--ops-muted)' }}>{label}</div>
    <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4, color: 'var(--ops-heading)' }}>{value}</div>
    <div style={{ fontSize: 11.5, color: 'var(--ops-muted)', marginTop: 2 }}>{sub}</div>
  </div>;
}

function MoreActions({ items }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return undefined;
    const close = () => setOpen(false);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [open]);
  return <div style={{ position: 'relative' }} onClick={(e) => e.stopPropagation()}>
    <Btn onClick={() => setOpen((o) => !o)}>⋮ More actions</Btn>
    {open && <div role="menu" style={{ position: 'absolute', right: 0, top: 42, zIndex: 40, minWidth: 250, padding: 6, ...CARD, borderRadius: 10 }}>
      {items.map((it, i) => it.divider ? <div key={i} style={{ height: 1, background: 'var(--ops-divider)', margin: '6px 0' }} /> :
        <button key={it.label} role="menuitem" type="button" disabled={it.disabled} onClick={() => { setOpen(false); it.onClick(); }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 10px', border: 0, borderRadius: 7, background: 'transparent', fontSize: 13, color: it.danger ? '#B23A2B' : 'var(--ops-text)', cursor: it.disabled ? 'not-allowed' : 'pointer', opacity: it.disabled ? .5 : 1 }}>{it.label}</button>)}
    </div>}
  </div>;
}

export default function AdminSellerProfile({ sellerId }) {
  const router = useRouter();
  const { showToast } = useAppState();
  const [p, setP] = useState(null); const [error, setError] = useState(''); const [modal, setModal] = useState(null); const [busy, setBusy] = useState('');
  const [tab, setTab] = useState('overview'); const [kpi, setKpi] = useState(null);
  const load = useCallback(() => apiFetch(`/v1/admin/sellers/${sellerId}/profile`).then((d) => { setP(d); setError(''); }).catch((e) => setError(e instanceof ApiError && e.status === 404 ? 'Seller not found.' : errText(e, 'Seller profile could not be loaded'))), [sellerId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const to = new Date().toISOString().slice(0, 10); const from = new Date(Date.now() - 29 * 864e5).toISOString().slice(0, 10);
    apiFetch(`/v1/admin/sellers/${sellerId}/performance?from=${from}&to=${to}`).then(setKpi).catch(() => setKpi(null));
  }, [sellerId]);

  const setState = async (state) => { setBusy('state'); try { await adminApi.setSellerState(sellerId, state, 'Updated from seller profile'); showToast(`Seller is now ${state}`); await load(); } catch (e) { showToast(errText(e, 'Seller state could not be changed'), 'error'); } finally { setBusy(''); } };
  const viewAs = async () => { setBusy('imp'); try { await apiFetch(`/v1/admin/sellers/${sellerId}/impersonate`, { method: 'POST' }); router.push('/dashboard'); } catch (e) { showToast(errText(e, 'Could not open the seller panel'), 'error'); setBusy(''); } };

  if (error) return <div style={{ ...CARD, padding: 40, textAlign: 'center', color: 'var(--ops-muted)' }}>{error}<div style={{ marginTop: 14 }}><Btn onClick={() => router.push('/admin/sellers')}>Back to sellers</Btn></div></div>;
  if (!p) return <div style={{ ...CARD, minHeight: 240, display: 'grid', placeItems: 'center', color: 'var(--ops-muted)' }}>Loading seller profile</div>;
  const menu = [
    { label: 'Update password', onClick: () => setModal('password') },
    { label: 'Manage wallet (credit / debit note)', onClick: () => setModal('wallet') },
    { label: 'View rate card', onClick: () => setModal('rate') },
    { label: 'Assign rate card', onClick: () => router.push(`/admin/rate-cards/${sellerId}/assign`) },
    { label: `Pincode access${p.blockedPincodeCount ? ` (${p.blockedPincodeCount} blocked)` : ''}`, onClick: () => setModal('pincodes') },
    { divider: true },
    p.state === 'suspended' ? { label: 'Restore seller', disabled: busy === 'state', onClick: () => setState('active') } : { label: 'Suspend seller', danger: true, disabled: busy === 'state' || p.state !== 'active', onClick: () => setState('suspended') },
  ];
  return (
    <div style={{ padding: '18px 24px 56px', display: 'grid', gap: 16, width: '100%', boxSizing: 'border-box' }}>
      <style>{'.ap-two{display:grid;gap:16px;grid-template-columns:minmax(0,3fr) minmax(0,2fr);align-items:start}.ap-id{display:grid;gap:18px;grid-template-columns:minmax(0,1fr) minmax(0,1.5fr);align-items:center}.ap-kpis{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(130px,1fr))}@media(max-width:1000px){.ap-two,.ap-id{grid-template-columns:minmax(0,1fr)}}'}</style>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <button type="button" onClick={() => router.push('/admin/sellers')} style={{ border: 0, background: 'none', padding: 0, color: 'var(--ac, #3877fc)', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>← All sellers</button>
          <div style={{ fontSize: 12.5, color: 'var(--ops-muted)', marginTop: 4 }}>Manage profile, shipping activity and account settings</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <MoreActions items={menu} />
          <Btn tone="primary" disabled={busy === 'imp' || p.state === 'suspended'} onClick={viewAs}>{busy === 'imp' ? 'Opening…' : 'View as seller'}</Btn>
        </div>
      </div>

      <div className="ap-id" style={CARD}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', minWidth: 0 }}>
          <div aria-hidden style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--ac, #3877fc)', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 26, fontWeight: 700, flexShrink: 0 }}>{(p.legal_name || '?').trim().charAt(0).toUpperCase()}</div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--ops-heading)', wordBreak: 'break-word' }}>{p.legal_name}</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 6 }}>
              <span style={{ fontFamily: T.MONO, fontSize: 12, color: 'var(--ops-muted)' }}>{p.nexgo_code}</span><StateBadge state={p.state} />
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--ops-muted)', marginTop: 8, display: 'grid', gap: 2 }}>
              <span>Joined {dateOnly(p.created_at)}</span><span>{p.owner_email}</span>{p.mobile && <span>{p.mobile}</span>}
            </div>
          </div>
        </div>
        <div className="ap-kpis">
          <Kpi label="Packets" value={kpi ? kpi.packets : '…'} sub="last 30 days" />
          <Kpi label="Delivered" value={kpi ? kpi.delivered : '…'} sub={kpi ? `${kpi.deliveryPercent}% delivery` : 'last 30 days'} />
          <Kpi label="In transit" value={kpi ? kpi.in_transit : '…'} sub={kpi ? `${kpi.ndr} NDR` : 'last 30 days'} />
          <Kpi label="RTO" value={kpi ? kpi.rto : '…'} sub="last 30 days" />
        </div>
      </div>

      <div role="tablist" style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--ops-border)', overflowX: 'auto' }}>
        {TABS.map(([id, label]) => <button key={id} role="tab" aria-selected={tab === id} type="button" onClick={() => setTab(id)} style={{ padding: '10px 16px', border: 0, borderBottom: tab === id ? '2px solid var(--ac, #3877fc)' : '2px solid transparent', background: 'none', color: tab === id ? 'var(--ac, #3877fc)' : 'var(--ops-muted)', fontWeight: 600, fontSize: 13.5, cursor: 'pointer', whiteSpace: 'nowrap' }}>{label}</button>)}
      </div>

      {tab === 'overview' && <div className="ap-two">
        <div style={{ display: 'grid', gap: 16 }}>
          <Section heading="Business information">
            <Row k="Brand name" v={p.legal_name} /><Row k="GSTIN" v={p.gst_applicable === false ? 'Not applicable' : p.gstin} /><Row k="PAN" v={p.pan} /><Row k="Entity type" v={p.entity_type && title(p.entity_type)} />
            <Row k="Registered address" v={p.registered_address || 'Not submitted'} />
          </Section>
          <Section heading="Bank details">
            <Row k="Bank" v={p.bank_name} /><Row k="Account holder" v={p.bank_account_holder} /><Row k="Account no." v={p.has_bank_account ? 'On file (encrypted)' : null} /><Row k="IFSC" v={p.bank_ifsc} /><Row k="Type" v={p.bank_account_type && title(p.bank_account_type)} />
          </Section>
        </div>
        <div style={{ display: 'grid', gap: 16 }}>
          <Section heading="Account & shipping">
            <Row k="Wallet balance" v={money(p.wallet_balance_paise)} /><Row k="Debit limit" v={money(p.wallet_debit_limit_paise)} /><Row k="COD remittance" v={`D+${p.remittance_days}`} />
            <Row k="Blocked pincodes" v={p.blockedPincodeCount || 0} /><Row k="Orders / shipments" v={`${p.order_count} / ${p.shipment_count}`} />
          </Section>
          <Section heading="Contact">
            <Row k="Name" v={p.owner_name} /><Row k="Email" v={p.owner_email} /><Row k="Mobile" v={p.mobile} /><Row k="Role" v="Owner" /><Row k="KAM" v={p.kam_name} />
          </Section>
        </div>
      </div>}

      {tab === 'account' && <div className="ap-two">
        <Section heading="POC & wallet settings"><PocEditor key={p.updated_at} sellerId={sellerId} p={p} onSaved={load} /></Section>
        <div style={{ display: 'grid', gap: 16 }}>
          <Section heading="Quick actions"><div style={{ display: 'grid', gap: 8 }}>
            <Btn onClick={() => setModal('wallet')}>Manage wallet (credit / debit note)</Btn>
            <Btn onClick={() => router.push(`/admin/rate-cards/${sellerId}/assign`)}>Assign rate card</Btn>
            <Btn onClick={() => setModal('rate')}>View rate card</Btn>
            <Btn onClick={() => setModal('pincodes')}>Pincode access{p.blockedPincodeCount ? ` (${p.blockedPincodeCount} blocked)` : ''}</Btn>
            <Btn onClick={() => setModal('password')}>Update password</Btn>
          </div></Section>
          <Section heading="System info">
            <Row k="Opened by" v={p.account_opened_by} /><Row k="KYC approved by" v={p.kyc_status === 'verified' ? p.kyc_reviewed_by || 'Verified' : '—'} /><Row k="Created" v={dateTime(p.created_at)} /><Row k="Updated" v={dateTime(p.updated_at)} />
            <div style={{ fontSize: 12, color: 'var(--ops-muted)', marginTop: 6 }}>D in D+N is the delivery date. A negative wallet balance is recovered from the COD before payout.</div>
          </Section>
        </div>
      </div>}

      {tab === 'documents' && <Documents sellerId={sellerId} />}
      {tab === 'performance' && <Reports sellerId={sellerId} />}

      {modal === 'password' && <PasswordModal sellerId={sellerId} owner={p.owner_email} onClose={() => setModal(null)} />}
      {modal === 'wallet' && <WalletModal sellerId={sellerId} balance={p.wallet_balance_paise} onClose={() => setModal(null)} onDone={load} />}
      {(modal === 'rate' || modal === 'assign') && <RateCardModal sellerId={sellerId} assign={modal === 'assign'} onClose={() => setModal(null)} onDone={load} />}
      {modal === 'pincodes' && <PincodeModal sellerId={sellerId} onClose={() => setModal(null)} onDone={load} />}
    </div>
  );
}
