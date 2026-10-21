'use client';

import { useCallback, useEffect, useState } from 'react';
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
  return <button type={type} disabled={disabled} onClick={onClick} style={{ minHeight: 36, padding: '0 14px', borderRadius: 8, border: solid ? '1px solid var(--ac, #1b9fd6)' : '1px solid var(--ops-border)', background: solid ? 'var(--ac, #1b9fd6)' : 'var(--ops-surface)', color: solid ? '#fff' : tone === 'danger' ? '#B23A2B' : 'var(--ops-text)', fontSize: 13, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? .55 : 1, textAlign: 'left' }}>{children}</button>;
}
const Row = ({ k, v }) => <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, padding: '7px 0', fontSize: 13 }}><span style={{ color: 'var(--ops-muted)', flexShrink: 0 }}>{k}</span><b style={{ textAlign: 'right', wordBreak: 'break-word', fontWeight: 600 }}>{v ?? '—'}</b></div>;
const Section = ({ heading, children, full }) => <section style={{ ...CARD, gridColumn: full ? '1 / -1' : undefined, minWidth: 0 }}><h3 style={{ margin: '0 0 8px', fontSize: 13.5, fontWeight: 700, color: 'var(--ops-heading)' }}>{heading}</h3>{children}</section>;
const Label = ({ children, hint }) => <label style={{ display: 'grid', gap: 5, fontSize: 12, color: 'var(--ops-muted)' }}><span>{children}</span>{hint}</label>;

function Modal({ heading, onClose, children, wide }) {
  return (
    <div role="dialog" aria-label={heading} onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 80, display: 'grid', placeItems: 'center', background: 'rgba(15,30,45,.45)', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...CARD, width: `min(${wide ? 860 : 460}px, 100%)`, maxHeight: '90vh', overflowY: 'auto', color: 'var(--ops-text)' }}>
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
  return <Modal heading={assign ? 'Assign rate card' : 'Rate card'} onClose={onClose} wide>
    {assign && <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
      <select style={{ ...FIELD, flex: 1, minWidth: 220 }} value={pick} onChange={(e) => setPick(e.target.value)}><option value="">Copy the active rate card of…</option>{cards.map((c) => <option key={c.id} value={c.id}>{c.seller_name} ({c.nexgo_code}) — {c.name}</option>)}</select>
      <Btn tone="primary" disabled={!pick || busy} onClick={apply}>{busy ? 'Assigning…' : 'Assign'}</Btn>
    </div>}
    {error && <div role="alert" style={{ color: '#B23A2B', fontSize: 12.5, marginBottom: 10 }}>{error}</div>}
    {!view ? <div style={{ color: 'var(--ops-muted)', padding: 16 }}>Loading…</div> : !view.card ? <div style={{ color: 'var(--ops-muted)', padding: 16 }}>No active rate card for this seller.</div> : <>
      <div style={{ fontSize: 13, marginBottom: 8 }}><b>{view.card.name}</b> · effective {dateOnly(view.card.effective_from)}</div>
      <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
        <thead><tr>{['Courier', 'Zone', 'From (g)', 'Base (g)', 'Base ₹', 'Add. (g)', 'Add. ₹', 'COD ₹', 'COD %', 'RTO ₹'].map((h) => <th key={h} style={{ textAlign: 'left', padding: '8px 8px', color: 'var(--ops-muted)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.06em', background: 'var(--ops-surface-soft)' }}>{h}</th>)}</tr></thead>
        <tbody>{view.rates.map((r, i) => <tr key={i}>
          {[`${r.provider_name} ${r.service_name}`, title(r.zone_code), r.min_weight_g, r.base_weight_g, money(r.base_price_paise), r.additional_weight_g, money(r.additional_price_paise), money(r.cod_fee_paise), `${(r.cod_percent_bps || 0) / 100}%`, r.rto_base_price_paise == null ? '—' : money(r.rto_base_price_paise)].map((c, j) => <td key={j} style={{ padding: '8px 8px', borderTop: '1px solid var(--ops-divider)' }}>{c}</td>)}
        </tr>)}</tbody>
      </table></div></>}
  </Modal>;
}

function PincodeModal({ sellerId, onClose, onDone }) {
  const { showToast } = useAppState();
  const [items, setItems] = useState(null); const [text, setText] = useState(''); const [serviceId, setServiceId] = useState(''); const [services, setServices] = useState([]);
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
    <div style={{ marginTop: 14, fontSize: 12.5, color: 'var(--ops-muted)' }}>{items ? `${items.length} blocked` : 'Loading…'}</div>
    {!!items?.length && <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 190, overflowY: 'auto' }}>
      {items.slice(0, 600).map((b) => <span key={b.id} title={b.provider_name ? `${b.provider_name} ${b.service_name}` : 'All couriers'} style={{ fontFamily: T.MONO, fontSize: 12, padding: '3px 8px', borderRadius: 6, background: 'var(--ops-surface-soft)', border: '1px solid var(--ops-border)' }}>{b.pincode}{b.provider_name ? ` · ${b.provider_name}` : ''}</span>)}
    </div>}
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

const DOC_LABELS = { kyc_pan: 'PAN card', kyc_aadhaar: 'Aadhaar', kyc_gst: 'GST certificate', kyc_bank: 'Cancelled cheque / bank statement', logo: 'Invoice logo', signature: 'Invoice signature' };

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

export default function AdminSellerProfile({ sellerId }) {
  const router = useRouter();
  const { showToast } = useAppState();
  const [p, setP] = useState(null); const [error, setError] = useState(''); const [modal, setModal] = useState(null); const [busy, setBusy] = useState('');
  const load = useCallback(() => apiFetch(`/v1/admin/sellers/${sellerId}/profile`).then((d) => { setP(d); setError(''); }).catch((e) => setError(e instanceof ApiError && e.status === 404 ? 'Seller not found.' : errText(e, 'Seller profile could not be loaded'))), [sellerId]);
  useEffect(() => { load(); }, [load]);

  const setState = async (state) => { setBusy('state'); try { await adminApi.setSellerState(sellerId, state, 'Updated from seller profile'); showToast(`Seller is now ${state}`); await load(); } catch (e) { showToast(errText(e, 'Seller state could not be changed'), 'error'); } finally { setBusy(''); } };
  const viewAs = async () => { setBusy('imp'); try { await apiFetch(`/v1/admin/sellers/${sellerId}/impersonate`, { method: 'POST' }); router.push('/dashboard'); } catch (e) { showToast(errText(e, 'Could not open the seller panel'), 'error'); setBusy(''); } };

  if (error) return <div style={{ ...CARD, padding: 40, textAlign: 'center', color: 'var(--ops-muted)' }}>{error}<div style={{ marginTop: 14 }}><Btn onClick={() => router.push('/admin/sellers')}>Back to sellers</Btn></div></div>;
  if (!p) return <div style={{ ...CARD, minHeight: 240, display: 'grid', placeItems: 'center', color: 'var(--ops-muted)' }}>Loading seller profile</div>;
  const owner = p.owner_name ? `${p.owner_name} (${p.owner_email})` : p.owner_email;
  return (
    <div style={{ padding: '18px 24px 56px', display: 'grid', gap: 16, width: '100%', boxSizing: 'border-box' }}>
      <style>{'.ap-grid{display:grid;gap:16px;grid-template-columns:repeat(3,minmax(0,1fr));align-items:start}@media(max-width:1100px){.ap-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:680px){.ap-grid{grid-template-columns:minmax(0,1fr)}}'}</style>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '20px 24px', borderRadius: 14, background: 'var(--ac, #1b9fd6)', color: '#fff' }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{p.legal_name}</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            <span style={{ background: 'rgba(0,0,0,.32)', borderRadius: 99, padding: '4px 11px', fontSize: 12, fontFamily: T.MONO }}>NEXGO Code: {p.nexgo_code}</span>
            <span style={{ background: 'rgba(0,0,0,.32)', borderRadius: 99, padding: '4px 11px', fontSize: 12 }}>Joined: {dateOnly(p.created_at)}</span>
            <span style={{ background: 'rgba(0,0,0,.32)', borderRadius: 99, padding: '4px 11px', fontSize: 12 }}>{title(p.state)}</span>
          </div>
        </div>
        <button type="button" onClick={() => router.push('/admin/sellers')} style={{ minHeight: 36, padding: '0 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,.7)', background: 'transparent', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>← All sellers</button>
      </div>

      <div className="ap-grid">
        <Section heading="+ Actions"><div style={{ display: 'grid', gap: 8 }}>
          <Btn onClick={() => setModal('password')}>Update password</Btn>
          <Btn onClick={() => setModal('assign')}>Assign rate card</Btn>
          <Btn onClick={() => setModal('rate')}>View rate card</Btn>
          <Btn onClick={() => setModal('wallet')}>Manage wallet (credit / debit note)</Btn>
          <Btn onClick={() => document.getElementById('poc-details')?.scrollIntoView({ behavior: 'smooth' })}>Debit limit: {money(p.wallet_debit_limit_paise)}</Btn>
          <Btn onClick={() => setModal('pincodes')}>Pincode access{p.blockedPincodeCount ? ` (${p.blockedPincodeCount} blocked)` : ''}</Btn>
          <Btn tone="primary" disabled={busy === 'imp' || p.state === 'suspended'} onClick={viewAs}>{busy === 'imp' ? 'Opening…' : 'View as seller (edit on their behalf)'}</Btn>
          {p.state === 'active' && <Btn tone="danger" disabled={busy === 'state'} onClick={() => setState('suspended')}>Suspend seller</Btn>}
          {p.state === 'suspended' && <Btn disabled={busy === 'state'} onClick={() => setState('active')}>Restore seller</Btn>}
        </div></Section>
        <Section heading="Contact & Role">
          <Row k="User name" v={p.owner_name} /><Row k="Email ID" v={p.owner_email} /><Row k="Mobile" v={p.mobile} /><Row k="Role" v="Owner" />
        </Section>
        <Section heading="Account & Balance">
          <Row k="KAM name" v={p.kam_name} /><Row k="KYC approved by" v={p.kyc_status === 'verified' ? p.kyc_reviewed_by || 'Verified' : '—'} />
          <Row k="Wallet" v={money(p.wallet_balance_paise)} /><Row k="Debit limit" v={money(p.wallet_debit_limit_paise)} /><Row k="Orders / shipments" v={`${p.order_count} / ${p.shipment_count}`} />
        </Section>
        <Section heading="POC details"><div id="poc-details" /><PocEditor key={p.updated_at} sellerId={sellerId} p={p} onSaved={load} /></Section>
        <Section heading="Address"><div style={{ fontSize: 13, lineHeight: 1.5 }}>{p.registered_address || <span style={{ color: 'var(--ops-muted)' }}>Not submitted</span>}</div></Section>
        <Section heading="Bank details">
          <Row k="Bank" v={p.bank_name} /><Row k="Account holder" v={p.bank_account_holder} /><Row k="Account no." v={p.has_bank_account ? 'On file (encrypted)' : null} /><Row k="IFSC" v={p.bank_ifsc} /><Row k="Type" v={p.bank_account_type && title(p.bank_account_type)} />
        </Section>
        <Section heading="Business">
          <Row k="GSTIN" v={p.gst_applicable === false ? 'Not applicable' : p.gstin} /><Row k="PAN" v={p.pan} /><Row k="Entity type" v={p.entity_type && title(p.entity_type)} /><Row k="Brand name" v={p.legal_name} />
        </Section>
        <Section heading="System info">
          <Row k="Admin" v={p.account_opened_by} /><Row k="Created" v={dateTime(p.created_at)} /><Row k="Updated" v={dateTime(p.updated_at)} />
        </Section>
        <Section heading="COD remittance"><Row k="Cycle" v={`D+${p.remittance_days}`} /><div style={{ fontSize: 12, color: 'var(--ops-muted)', marginTop: 4 }}>D is the delivery date. Negative wallet balance is recovered from the COD before payout.</div></Section>
        <Documents sellerId={sellerId} />
      </div>

      <Reports sellerId={sellerId} />

      {modal === 'password' && <PasswordModal sellerId={sellerId} owner={p.owner_email} onClose={() => setModal(null)} />}
      {modal === 'wallet' && <WalletModal sellerId={sellerId} balance={p.wallet_balance_paise} onClose={() => setModal(null)} onDone={load} />}
      {(modal === 'rate' || modal === 'assign') && <RateCardModal sellerId={sellerId} assign={modal === 'assign'} onClose={() => setModal(null)} onDone={load} />}
      {modal === 'pincodes' && <PincodeModal sellerId={sellerId} onClose={() => setModal(null)} onDone={load} />}
    </div>
  );
}
