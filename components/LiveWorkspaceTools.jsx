'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch, adminApi } from '@/lib/api';
import { useAppState } from '@/lib/AppStateContext';
import * as T from '@/lib/theme';
import LiveReports from './LiveReports';
import { saveRows } from '@/lib/exportFile';
const CARD={background:'var(--nx-surface)',border:'1px solid var(--nx-glass-border)',borderRadius:12,boxShadow:'0 2px 8px rgba(15,31,61,.05)'};
const field={width:'100%',height:40,boxSizing:'border-box',borderRadius:8,border:`1px solid ${T.INPUT_BORDER}`,background:T.SURFACE,color:T.TEXT,padding:'0 11px',fontSize:13};
const title=v=>(v||'').replaceAll('-',' ').replace(/\b\w/g,c=>c.toUpperCase());
function Button({children,onClick,primary=false,disabled=false}){return <button disabled={disabled} onClick={onClick} style={{height:34,padding:'0 11px',borderRadius:8,border:`1px solid ${primary?T.NAVY:T.INPUT_BORDER}`,background:primary?T.NAVY:T.SURFACE,color:primary?'#fff':T.TEXT,fontWeight:720,fontSize:12,cursor:disabled?'wait':'pointer',opacity:disabled?.6:1}}>{children}</button>}
const EVENTS = [['onBooked', 'Shipment booked', 'boolean'], ['onOutForDelivery', 'Out for delivery', 'boolean'], ['onDelivered', 'Delivered', 'boolean'], ['onNdr', 'Delivery attempt failed (NDR)', 'boolean'], ['onRto', 'Return to origin', 'boolean']];
const CONFIG = {
  'courier-rules': ['Courier rules', 'Orders are offered to couriers in this order. If a courier cannot serve the order, the next one is tried. Other settings follow once the admin area is complete.', [['priority1', 'Priority 1', 'select:Not set|Blue Dart|XpressBees|Ekart|Shadowfax|Delhivery|Ecom Express', 'Blue Dart'], ['priority2', 'Priority 2', 'select:Not set|Blue Dart|XpressBees|Ekart|Shadowfax|Delhivery|Ecom Express', 'XpressBees'], ['priority3', 'Priority 3', 'select:Not set|Blue Dart|XpressBees|Ekart|Shadowfax|Delhivery|Ecom Express', 'Ekart'], ['priority4', 'Priority 4', 'select:Not set|Blue Dart|XpressBees|Ekart|Shadowfax|Delhivery|Ecom Express', 'Shadowfax'], ['priority5', 'Priority 5', 'select:Not set|Blue Dart|XpressBees|Ekart|Shadowfax|Delhivery|Ecom Express', 'Delhivery'], ['priority6', 'Priority 6', 'select:Not set|Blue Dart|XpressBees|Ekart|Shadowfax|Delhivery|Ecom Express', 'Not set']]],
  label: ['Label settings', 'Design the shipping label your team prints and downloads.', [['labelSize', 'Label size', 'select:Thermal 4×6|Thermal 3×5|A4 page (4 per sheet)'], ['includeInvoice', 'Include invoice with label', 'boolean'], ['includeReturnLabel', 'Create return label by default', 'boolean']], 'label'],
  'inv-settings': ['Invoice settings', 'Defaults used on the tax invoices you generate.', [['hideCompanyName', 'Hide company name on invoice', 'boolean'], ['prefix', 'Invoice number prefix (for example NP)', 'text'], ['pageFormat', 'Page setting', 'select:A4 (8×11 in) standard printer|Thermal printer (4×6 in)'], ['gstRate', 'GST rate (%)', 'number'], ['showHsn', 'Show HSN details', 'boolean'], ['logoUrl', 'Logo image link (https://…)', 'text'], ['signatureUrl', 'Signature image link (https://…)', 'text'], ['customName1', 'Custom field 1 — column name', 'text'], ['customValue1', 'Custom field 1 — value', 'text'], ['customName2', 'Custom field 2 — column name', 'text'], ['customValue2', 'Custom field 2 — value', 'text']], 'invoice'],
  'email-reports': ['Schedule email reports', 'Send a recurring report to your team. Delivery starts once an email provider is connected.', [['enabled', 'Send scheduled reports', 'boolean'], ['report', 'Report', 'select:MIS summary|Shipment register|NDR ageing|COD remittance'], ['frequency', 'Frequency', 'select:Daily|Weekly|Monthly'], ['sendTime', 'Send time', 'time'], ['recipients', 'Recipients (comma separated)', 'text']]],
  'wa-api': ['WhatsApp notifications', 'Choose which shipment events message your customers on WhatsApp.', [['enabled', 'Send WhatsApp updates', 'boolean'], ['senderNumber', 'Business number', 'text'], ...EVENTS]],
  'sms-api': ['SMS notifications', 'Choose which shipment events text your customers.', [['enabled', 'Send SMS updates', 'boolean'], ['senderId', 'Sender ID (6 letters)', 'text'], ['dltEntityId', 'DLT entity ID', 'text'], ...EVENTS]],
  notifications: ['Order confirmation', 'Confirm orders with the customer before they are dispatched.', [['enabled', 'Ask customers to confirm orders', 'boolean'], ['codOnly', 'Only for cash-on-delivery orders', 'boolean'], ['channel', 'Send through', 'select:WhatsApp|SMS|Email'], ['autoCancelHours', 'Hold unconfirmed orders for (hours)', 'number']]],
  abandoned: ['Abandoned checkout notifications', 'Remind shoppers who left your store before paying.', [['enabled', 'Send abandoned-checkout reminders', 'boolean'], ['channel', 'Send through', 'select:WhatsApp|SMS|Email'], ['delayMinutes', 'First reminder after (minutes)', 'number'], ['maxReminders', 'Maximum reminders', 'number']]],
  profile: ['Profile settings', 'Your business details as they appear on documents and notifications.', [['displayName', 'Business display name', 'text'], ['contactPhone', 'Contact phone', 'text'], ['supportEmail', 'Support email', 'text'], ['website', 'Website', 'text'], ['billingAddress', 'Billing address', 'text']]],
};
const PROFILE_DOCUMENTS = [
  ['pancard_vimalenterprises.jpeg', 'PAN card', 'Verified'],
  ['GST Certificate Vimal Enterprises.pdf', 'GST certificate', 'Verified'],
  ['aadhar_front_vimal_enterprises.jpg', 'Aadhaar front', 'Pending'],
  ['aadhar_back_bvimla_enterprises.jpg', 'Aadhaar back', 'Pending'],
];
const LINKS = { profile: [['Change password', 'password'], ['KYC', 'kyc']] };

const defaultsOf = (id) => Object.fromEntries(CONFIG[id][2].filter((x) => x[3] !== undefined && x[2].startsWith('select:')).map((x) => [x[0], x[3]]));

function Settings({ activeId, mobile }) {
  const c = CONFIG[activeId]; const { showToast, nav } = useAppState();
  const [values, setValues] = useState({}); const [busy, setBusy] = useState(false); const [loaded, setLoaded] = useState(false); const [identity, setIdentity] = useState(null);
  useEffect(() => {
    let live = true;
    setLoaded(false); // eslint-disable-line react-hooks/set-state-in-effect -- reset while the next screen's settings load
    apiFetch(`/v1/settings/${activeId}`).then((x) => live && setValues({ ...defaultsOf(activeId), ...(x.values || {}) })).catch(() => live && setValues(defaultsOf(activeId))).finally(() => live && setLoaded(true));
    if (activeId === 'profile') apiFetch('/v1/seller/me').then((x) => live && setIdentity(x)).catch(() => {});
    return () => { live = false; };
  }, [activeId]);
  const save = async () => { setBusy(true); try { await apiFetch(`/v1/settings/${activeId}`, { method: 'PUT', body: values }); showToast('Settings saved to your workspace'); } catch (e) { showToast(e.message || 'Settings could not be saved', 'error'); } finally { setBusy(false); } };
  const set = (key, value) => setValues((v) => ({ ...v, [key]: value }));
  // Opens the printable document for the newest shipment so the saved layout can be checked and downloaded (Print / Save as PDF).
  const preview = async () => {
    try { const x = await apiFetch('/v1/shipments'); const first = (x.items || [])[0]; if (!first) return showToast('Book a shipment first, then preview its document here.', 'error'); window.open(`/documents/${c[3]}?ids=${first.id}`, '_blank', 'noopener'); }
    catch (e) { showToast(e.message || 'Preview could not be opened', 'error'); }
  };
  return (
    <main style={{ padding: mobile ? '14px 12px 42px' : '18px 28px 48px', maxWidth: '100%' }}>
      <div style={{ marginBottom: 15 }}><h2 style={{ margin: 0, color: T.TEXT, fontSize: 19 }}>{c[0]}</h2><p style={{ margin: '5px 0 0', color: T.TEXT_SECONDARY, fontSize: 13 }}>{c[1]}</p></div>
      {identity && <section style={{ ...CARD, padding: 17, marginBottom: 13, display: 'grid', gridTemplateColumns: mobile ? '1fr' : 'repeat(3,1fr)', gap: 12 }}>{[['Legal name', identity.legal_name], ['Account owner', `${identity.full_name} · ${title(identity.role)}`], ['Sign-in email', identity.email]].map(([k, v]) => <div key={k}><span style={{ color: T.TEXT_MUTED, fontSize: 11, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase' }}>{k}</span><b style={{ display: 'block', marginTop: 6, color: T.TEXT_LABEL, fontSize: 13.5 }}>{v}</b></div>)}</section>}
      {identity && activeId === 'profile' && <section style={{ ...CARD, padding: 0, marginBottom: 13, overflow: 'hidden' }}><div style={{ padding: '18px 20px', background: '#0c3459', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}><div><div style={{ fontSize: 18, fontWeight: 800 }}>Account Status</div><div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}><span style={{ padding: '5px 9px', borderRadius: 99, background: 'rgba(255,255,255,.22)', fontSize: 11, fontWeight: 850, letterSpacing: '.05em' }}>VERIFIED</span><span style={{ fontSize: 12.5, opacity: .86 }}>Member since Apr 2025</span></div></div><div style={{ display: 'grid', gridTemplateColumns: mobile ? 'repeat(2,minmax(0,1fr))' : 'repeat(5,minmax(82px,1fr))', gap: 9 }}>{[['Email', 'Verified'], ['Phone', 'Verified'], ['Aadhaar', 'Pending'], ['PAN', 'Verified'], ['Bank', 'Pending']].map(([name, state]) => <div key={name} style={{ minHeight: 64, padding: '9px 10px', borderRadius: 8, background: 'rgba(255,255,255,.12)' }}><b style={{ display: 'block', fontSize: 12 }}>{name}</b><span style={{ display: 'block', marginTop: 6, fontSize: 11.5, color: state === 'Verified' ? '#B8F7D0' : '#FFD48A' }}>{state === 'Verified' ? '✓' : '△'} {state}</span></div>)}</div></div></section>}
      <section style={{ ...CARD, padding: 17, display: 'grid', gap: 13 }}>
        {!loaded && <span style={{ color: T.TEXT_MUTED, fontSize: 13 }}>Loading your saved settings…</span>}
        {c[2].map(([key, label, kind, dflt]) => (
          <label key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 18, color: T.TEXT_LABEL, fontSize: 13, fontWeight: 650 }}>
            <span>{label}</span>
            {kind === 'boolean' ? <input aria-label={label} type="checkbox" checked={Boolean(values[key])} onChange={(e) => set(key, e.target.checked)} style={{ width: 18, height: 18, accentColor: T.ACCENT }} />
              : kind.startsWith('select:') ? <select aria-label={label} value={values[key] || dflt || kind.split(':')[1].split('|')[0]} onChange={(e) => set(key, e.target.value)} style={{ ...field, width: 190 }}>{kind.split(':')[1].split('|').map((x) => <option key={x}>{x}</option>)}</select>
              : <input aria-label={label} type={kind} value={values[key] ?? ''} onChange={(e) => set(key, kind === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value)} style={{ ...field, width: 240 }} />}
          </label>
        ))}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><Button primary disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save changes'}</Button>{c[3] && <Button onClick={preview}>{c[3] === 'label' ? 'Preview / download label' : 'Preview / download invoice'}</Button>}{(LINKS[activeId] || []).map(([label, dest]) => <Button key={dest} onClick={() => nav(dest)}>{label}</Button>)}</div>
      </section>
      {activeId === 'profile' && <section style={{ ...CARD, padding: 17, marginTop: 13 }}><div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 13 }}><div><h3 style={{ margin: 0, color: T.TEXT, fontSize: 16 }}>Documents</h3><p style={{ margin: '4px 0 0', color: T.TEXT_MUTED, fontSize: 12.5 }}>{PROFILE_DOCUMENTS.length} documents uploaded</p></div><span style={{ display: 'inline-flex', padding: '4px 8px', borderRadius: 99, color: T.GREEN, background: `${T.GREEN}14`, fontSize: 11.5, fontWeight: 720 }}>Read only</span></div><div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : 'repeat(3,minmax(0,1fr))', gap: 10 }}>{PROFILE_DOCUMENTS.map(([name, kind, state]) => <article key={name} style={{ border: `1px solid ${T.BORDER}`, borderRadius: 9, padding: 11, background: T.SURFACE_SOFT }}><b style={{ display: 'block', color: T.TEXT, fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</b><small style={{ display: 'block', marginTop: 4, color: T.TEXT_MUTED }}>{kind} · {state}</small><button type="button" onClick={() => showToast('Document preview is read-only and cannot be modified.')} style={{ marginTop: 10, width: '100%', height: 30, border: 0, borderRadius: 7, color: '#fff', background: '#1b9fd6', fontSize: 11.5, fontWeight: 800, cursor: 'pointer' }}>View Document</button></article>)}</div></section>}
    </main>
  );
}

const fmtG = (g) => `${(Number(g) / 1000).toFixed(2)} kg`;
const inr = (paise) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Number(paise || 0) / 100);
function Stat({ label, value }) { return <section style={{ ...CARD, padding: 16 }}><span style={{ color: T.TEXT_MUTED, fontSize: 11, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase' }}>{label}</span><div style={{ marginTop: 8, color: T.TEXT, fontSize: 24, fontWeight: 760 }}>{value}</div></section>; }

function Reports({ activeId, mobile }) {
  const { showToast } = useAppState();
  const [rows, setRows] = useState(null); const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (activeId === 'weight') apiFetch('/v1/weight-discrepancies').then((x) => setRows(x.items || [])).catch(() => { setRows([]); setFailed(true); });
  }, [activeId]);
  const pad = mobile ? '14px 12px 42px' : '18px 28px 48px';

  if (activeId === 'weight') {
    const extra = rows?.reduce((s, r) => s + Number(r.difference_g), 0) || 0;
    const exportRows = async (format) => {
      const header = ['AWB', 'Order', 'Courier', 'Declared g', 'Billed g', 'Difference g', 'Charge INR'];
      await saveRows([header, ...rows.map((r) => [r.awb, r.order_number, r.courier_name, r.declared_weight_g, r.billed_weight_g, r.difference_g, r.shipping_charge_paise / 100])], 'weight-discrepancies', format, 'Weight discrepancies');
      showToast(`Weight discrepancy report downloaded (${format === 'xlsx' ? 'Excel' : 'CSV'})`);
    };
    return (
      <main style={{ padding: pad, maxWidth: '100%' }}>
        <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : 'repeat(3,1fr)', gap: 12, marginBottom: 13 }}><Stat label="Shipments flagged" value={rows ? rows.length : '…'} /><Stat label="Extra weight billed" value={rows ? fmtG(extra) : '…'} /><Stat label="Charges on flagged shipments" value={rows ? inr(rows.reduce((s, r) => s + r.shipping_charge_paise, 0)) : '…'} /></div>
        {!rows ? <section style={{ ...CARD, padding: 22, color: T.TEXT_MUTED, fontSize: 13 }}>Loading discrepancies…</section>
          : failed ? <section style={{ ...CARD, padding: 22, color: T.TEXT_SECONDARY, fontSize: 13 }}>Weight discrepancies could not be loaded. Check that you are signed in.</section>
          : !rows.length ? <section style={{ ...CARD, padding: 22, color: T.TEXT_SECONDARY, fontSize: 13 }}>No discrepancies. Every booked shipment was billed at or below its declared weight.</section>
          : <section style={{ ...CARD, overflow: 'hidden' }}><div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${T.DIVIDER}` }}><b style={{ color: T.TEXT, fontSize: 14 }}>Billed above declared weight</b><div style={{ display: 'flex', gap: 8 }}><Button onClick={() => exportRows('csv')}>Export CSV</Button><Button onClick={() => exportRows('xlsx')}>Export Excel</Button></div></div><div style={{ overflowX: 'auto' }}><table style={{ width: '100%', minWidth: 720, borderCollapse: 'collapse' }}><thead><tr>{['AWB', 'Order', 'Courier', 'Declared', 'Billed', 'Difference', 'Charge'].map((h) => <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 10.5, letterSpacing: '.07em', color: T.TEXT_MUTED, background: T.TABLE_HEAD_BG, textTransform: 'uppercase' }}>{h}</th>)}</tr></thead><tbody>{rows.map((r) => <tr key={r.id}>{[<b key="a" style={{ fontFamily: T.MONO }}>{r.awb}</b>, r.order_number, r.courier_name, fmtG(r.declared_weight_g), fmtG(r.billed_weight_g), <b key="d" style={{ color: T.AMBER }}>+{fmtG(r.difference_g)}</b>, inr(r.shipping_charge_paise)].map((cell, i) => <td key={i} style={{ padding: '12px 14px', borderTop: `1px solid ${T.DIVIDER}`, color: T.TEXT_LABEL, fontSize: 13 }}>{cell}</td>)}</tr>)}</tbody></table></div></section>}
      </main>
    );
  }
  return null;
}
const TICKET_CATEGORIES = ['Delivery Issue', 'Pickup Issue', 'Damage', 'Lost', 'RTO (Return to Origin)', 'COD Issue', 'Other'];
function Tickets({ admin, mobile }) {
  const { showToast } = useAppState();
  const [items, setItems] = useState([]); const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false);
  const blank = { subject: '', category: '', message: '', priority: 'normal' };
  const [f, setF] = useState(blank);
  const load = useCallback(() => (admin ? adminApi.auditEvents().then(() => apiFetch('/v1/admin/tickets')) : apiFetch('/v1/tickets')).then((x) => setItems(x.items || [])), [admin]);
  useEffect(() => { load().catch(() => setItems([])); }, [load]);
  const create = async (e) => {
    e.preventDefault(); setBusy(true);
    try { await apiFetch('/v1/tickets', { method: 'POST', body: f }); setF(blank); setOpen(false); showToast('Support ticket created'); load(); }
    catch (err) { showToast(err.message || 'Ticket could not be created', 'error'); }
    finally { setBusy(false); }
  };
  const update = async (r, state) => { try { await apiFetch(`/v1/admin/tickets/${r.id}`, { method: 'PATCH', body: { state, resolutionNote: state === 'resolved' ? 'Resolved from admin operations' : 'In review' } }); showToast('Ticket updated'); load(); } catch (err) { showToast(err.message || 'Ticket could not be updated', 'error'); } };
  const today = new Date().toDateString();
  const active = items.filter((r) => ['open', 'in_progress'].includes(r.state)).length;
  const resolved = items.filter((r) => ['resolved', 'closed'].includes(r.state)).length;
  const stats = [['Total tickets', items.length], ['Active tickets', active], ['SLA breached', 0], ['Resolved', resolved], ['Awaiting response', items.filter((r) => r.state === 'open').length], ['Created today', items.filter((r) => new Date(r.created_at).toDateString() === today).length]];
  const label = { display: 'block', color: T.TEXT_LABEL, fontSize: 12.5, fontWeight: 700 };
  return (
    <main style={{ padding: mobile ? '14px 12px 42px' : '18px 28px 48px', maxWidth: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div><h2 style={{ margin: 0, color: T.TEXT, fontSize: 19 }}>{admin ? 'Support centre' : 'Support tickets'}</h2><p style={{ color: T.TEXT_SECONDARY, fontSize: 13, margin: '5px 0 14px' }}>{admin ? 'Manage seller operational requests from one queue.' : 'Raise and track operational requests for the platform team.'}</p></div>
        {!admin && <Button primary onClick={() => setOpen(true)}>+ Create Ticket</Button>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: mobile ? 'repeat(2,1fr)' : 'repeat(6,1fr)', gap: 10, marginBottom: 14 }}>{stats.map(([k, v]) => <section key={k} style={{ ...CARD, padding: '12px 14px' }}><span style={{ color: T.TEXT_MUTED, fontSize: 11, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase' }}>{k}</span><div style={{ marginTop: 6, color: T.TEXT, fontSize: 22, fontWeight: 760 }}>{v}</div></section>)}</div>
      <section style={{ ...CARD, overflow: 'hidden' }}>{items.length ? items.map((r) => <div key={r.id} style={{ padding: 14, borderBottom: `1px solid ${T.DIVIDER}`, display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}><div><b style={{ color: T.TEXT, fontSize: 13 }}>{r.subject}</b><small style={{ display: 'block', color: T.TEXT_MUTED, marginTop: 4 }}>{r.seller_name ? `${r.seller_name} · ` : ''}{title(r.category)} · {title(r.priority)} · {title(r.state)}</small></div>{admin && r.state !== 'resolved' && <Button primary onClick={() => update(r, 'resolved')}>Resolve</Button>}</div>) : <div style={{ padding: 24, color: T.TEXT_SECONDARY, fontSize: 13 }}>No tickets yet.</div>}</section>
      {open && (
        <div role="dialog" aria-modal="true" aria-label="Create Support Ticket" onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(12,52,89,.45)', display: 'grid', placeItems: 'center', padding: 16 }}>
          <form onSubmit={create} onClick={(e) => e.stopPropagation()} style={{ ...CARD, width: 'min(560px,100%)', padding: 0, overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: `1px solid ${T.DIVIDER}` }}><b style={{ color: T.TEXT, fontSize: 18 }}>Create Support Ticket</b><button type="button" aria-label="Close" onClick={() => setOpen(false)} style={{ border: 0, background: 'transparent', fontSize: 22, color: T.TEXT_MUTED, cursor: 'pointer' }}>×</button></div>
            <div style={{ padding: 20, display: 'grid', gap: 14 }}>
              <label style={label}>Subject *<input required minLength={4} maxLength={200} placeholder="Brief summary of the issue" value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} style={{ ...field, marginTop: 6 }} /><small style={{ color: T.TEXT_MUTED, fontWeight: 500 }}>{f.subject.length}/200 characters</small></label>
              <label style={label}>Description *<textarea required minLength={8} maxLength={4000} placeholder="Provide detailed information about the issue…" value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} style={{ ...field, height: 130, padding: '10px 11px', resize: 'vertical', marginTop: 6 }} /></label>
              <label style={label}>Category *<select required value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} style={{ ...field, marginTop: 6 }}><option value="">Select a category</option>{TICKET_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></label>
              <label style={label}>Priority<select value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })} style={{ ...field, marginTop: 6 }}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></label>
            </div>
            <div style={{ padding: '12px 20px', borderTop: `1px solid ${T.DIVIDER}`, display: 'flex', justifyContent: 'flex-end', gap: 8 }}><Button onClick={() => setOpen(false)}>Cancel</Button><button type="submit" disabled={busy || !f.category} style={{ height: 34, padding: '0 14px', borderRadius: 8, border: `1px solid ${T.NAVY}`, background: T.NAVY, color: '#fff', fontWeight: 720, cursor: busy || !f.category ? 'not-allowed' : 'pointer', opacity: busy || !f.category ? 0.6 : 1 }}>{busy ? 'Creating…' : 'Create ticket'}</button></div>
          </form>
        </div>
      )}
    </main>
  );
}

export default function LiveWorkspaceTools({activeId,mobile}){if(CONFIG[activeId])return <Settings activeId={activeId} mobile={mobile}/>;if(activeId==='mis')return <LiveReports mobile={mobile}/>;if(activeId==='weight')return <Reports activeId={activeId} mobile={mobile}/>;if(activeId==='a-tickets')return <Tickets admin mobile={mobile}/>;return <Tickets mobile={mobile}/>}
