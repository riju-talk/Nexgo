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
  'courier-rules': ['Courier rules', 'Set operational defaults for how orders are offered to eligible couriers.', [['autoAllocate', 'Enable smart courier allocation', 'boolean'], ['preferLowestRate', 'Prefer lowest configured rate', 'boolean'], ['maxDeliveryDays', 'Maximum delivery promise (days)', 'number']]],
  label: ['Label settings', 'Label and return-document preferences used by your fulfilment team.', [['labelSize', 'Label size', 'select:4×6|4×4|A4'], ['includeInvoice', 'Include invoice with label', 'boolean'], ['includeReturnLabel', 'Create return label by default', 'boolean']]],
  printer: ['Printer settings', 'Workstation printing defaults for operations.', [['printerName', 'Printer name', 'text'], ['copies', 'Default copies', 'number'], ['autoPrint', 'Print labels after generation', 'boolean']]],
  'inv-settings': ['Invoice settings', 'Defaults used on the shipment invoices you generate.', [['prefix', 'Invoice prefix', 'text'], ['gstRate', 'GST rate (%)', 'number'], ['showHsn', 'Show HSN details', 'boolean']]],
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

function Settings({ activeId, mobile }) {
  const c = CONFIG[activeId]; const { showToast, nav } = useAppState();
  const [values, setValues] = useState({}); const [busy, setBusy] = useState(false); const [loaded, setLoaded] = useState(false); const [identity, setIdentity] = useState(null);
  useEffect(() => {
    let live = true;
    setLoaded(false); // eslint-disable-line react-hooks/set-state-in-effect -- reset while the next screen's settings load
    apiFetch(`/v1/settings/${activeId}`).then((x) => live && setValues(x.values || {})).catch(() => live && setValues({})).finally(() => live && setLoaded(true));
    if (activeId === 'profile') apiFetch('/v1/seller/me').then((x) => live && setIdentity(x)).catch(() => {});
    return () => { live = false; };
  }, [activeId]);
  const save = async () => { setBusy(true); try { await apiFetch(`/v1/settings/${activeId}`, { method: 'PUT', body: values }); showToast('Settings saved to your workspace'); } catch (e) { showToast(e.message || 'Settings could not be saved', 'error'); } finally { setBusy(false); } };
  const set = (key, value) => setValues((v) => ({ ...v, [key]: value }));
  return (
    <main style={{ padding: mobile ? '14px 12px 42px' : '18px 28px 48px', maxWidth: '100%' }}>
      <div style={{ marginBottom: 15 }}><h2 style={{ margin: 0, color: T.TEXT, fontSize: 19 }}>{c[0]}</h2><p style={{ margin: '5px 0 0', color: T.TEXT_SECONDARY, fontSize: 13 }}>{c[1]}</p></div>
      {identity && <section style={{ ...CARD, padding: 17, marginBottom: 13, display: 'grid', gridTemplateColumns: mobile ? '1fr' : 'repeat(3,1fr)', gap: 12 }}>{[['Legal name', identity.legal_name], ['Account owner', `${identity.full_name} · ${title(identity.role)}`], ['Sign-in email', identity.email]].map(([k, v]) => <div key={k}><span style={{ color: T.TEXT_MUTED, fontSize: 11, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase' }}>{k}</span><b style={{ display: 'block', marginTop: 6, color: T.TEXT_LABEL, fontSize: 13.5 }}>{v}</b></div>)}</section>}
      {identity && activeId === 'profile' && <section style={{ ...CARD, padding: 0, marginBottom: 13, overflow: 'hidden' }}><div style={{ padding: '18px 20px', background: 'linear-gradient(135deg,#0c3459,#1b9fd6)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}><div><div style={{ fontSize: 18, fontWeight: 800 }}>Account Status</div><div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}><span style={{ padding: '5px 9px', borderRadius: 99, background: 'rgba(255,255,255,.22)', fontSize: 11, fontWeight: 850, letterSpacing: '.05em' }}>VERIFIED</span><span style={{ fontSize: 12.5, opacity: .86 }}>Member since Apr 2025</span></div></div><div style={{ display: 'grid', gridTemplateColumns: mobile ? 'repeat(2,minmax(0,1fr))' : 'repeat(5,minmax(82px,1fr))', gap: 9 }}>{[['Email', 'Verified'], ['Phone', 'Verified'], ['Aadhaar', 'Pending'], ['PAN', 'Verified'], ['Bank', 'Pending']].map(([name, state]) => <div key={name} style={{ minHeight: 64, padding: '9px 10px', borderRadius: 8, background: 'rgba(255,255,255,.12)' }}><b style={{ display: 'block', fontSize: 12 }}>{name}</b><span style={{ display: 'block', marginTop: 6, fontSize: 11.5, color: state === 'Verified' ? '#B8F7D0' : '#FFD48A' }}>{state === 'Verified' ? '✓' : '△'} {state}</span></div>)}</div></div></section>}
      <section style={{ ...CARD, padding: 17, display: 'grid', gap: 13 }}>
        {!loaded && <span style={{ color: T.TEXT_MUTED, fontSize: 13 }}>Loading your saved settings…</span>}
        {c[2].map(([key, label, kind]) => (
          <label key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 18, color: T.TEXT_LABEL, fontSize: 13, fontWeight: 650 }}>
            <span>{label}</span>
            {kind === 'boolean' ? <input aria-label={label} type="checkbox" checked={Boolean(values[key])} onChange={(e) => set(key, e.target.checked)} style={{ width: 18, height: 18, accentColor: T.ACCENT }} />
              : kind.startsWith('select:') ? <select aria-label={label} value={values[key] || kind.split(':')[1].split('|')[0]} onChange={(e) => set(key, e.target.value)} style={{ ...field, width: 190 }}>{kind.split(':')[1].split('|').map((x) => <option key={x}>{x}</option>)}</select>
              : <input aria-label={label} type={kind} value={values[key] ?? ''} onChange={(e) => set(key, kind === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value)} style={{ ...field, width: 240 }} />}
          </label>
        ))}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><Button primary disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save changes'}</Button>{(LINKS[activeId] || []).map(([label, dest]) => <Button key={dest} onClick={() => nav(dest)}>{label}</Button>)}</div>
      </section>
      {activeId === 'profile' && <section style={{ ...CARD, padding: 17, marginTop: 13 }}><div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 13 }}><div><h3 style={{ margin: 0, color: T.TEXT, fontSize: 16 }}>Documents</h3><p style={{ margin: '4px 0 0', color: T.TEXT_MUTED, fontSize: 12.5 }}>{PROFILE_DOCUMENTS.length} documents uploaded</p></div><span style={{ display: 'inline-flex', padding: '4px 8px', borderRadius: 99, color: T.GREEN, background: `${T.GREEN}14`, fontSize: 11.5, fontWeight: 720 }}>Read only</span></div><div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : 'repeat(3,minmax(0,1fr))', gap: 10 }}>{PROFILE_DOCUMENTS.map(([name, kind, state]) => <article key={name} style={{ border: `1px solid ${T.BORDER}`, borderRadius: 9, padding: 11, background: T.SURFACE_SOFT }}><b style={{ display: 'block', color: T.TEXT, fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</b><small style={{ display: 'block', marginTop: 4, color: T.TEXT_MUTED }}>{kind} · {state}</small><button type="button" onClick={() => showToast('Document preview is read-only and cannot be modified.')} style={{ marginTop: 10, width: '100%', height: 30, border: 0, borderRadius: 7, color: '#fff', background: 'linear-gradient(135deg,#1b9fd6,#3877fc)', fontSize: 11.5, fontWeight: 800, cursor: 'pointer' }}>View Document</button></article>)}</div></section>}
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
function Tickets({admin,mobile}){const {showToast}=useAppState();const [items,setItems]=useState([]);const [f,setF]=useState({subject:'',category:'Operations',message:'',priority:'normal'});const load=useCallback(()=>admin?adminApi.auditEvents().then(()=>apiFetch('/v1/admin/tickets')).then(x=>setItems(x.items||[])):apiFetch('/v1/tickets').then(x=>setItems(x.items||[])),[admin]);useEffect(()=>{load().catch(()=>setItems([]))},[load]);const create=async()=>{try{await apiFetch('/v1/tickets',{method:'POST',body:f});setF({subject:'',category:'Operations',message:'',priority:'normal'});showToast('Support ticket created');load()}catch(e){showToast(e.message||'Ticket could not be created','error')}};const update=async(r,state)=>{try{await apiFetch(`/v1/admin/tickets/${r.id}`,{method:'PATCH',body:{state,resolutionNote:state==='resolved'?'Resolved from admin operations':'In review'}});showToast('Ticket updated');load()}catch(e){showToast(e.message||'Ticket could not be updated','error')}};return <main style={{padding:mobile?'14px 12px 42px':'18px 28px 48px',maxWidth: '100%'}}><h2 style={{margin:0,color:T.TEXT,fontSize:19}}>{admin?'Support centre':'Support tickets'}</h2><p style={{color:T.TEXT_SECONDARY,fontSize:13}}>{admin?'Manage seller operational requests from one queue.':'Create and track operational requests for the platform team.'}</p>{!admin&&<section style={{...CARD,padding:16,display:'grid',gap:9,marginBottom:13}}><input placeholder="What do you need help with?" value={f.subject} onChange={e=>setF({...f,subject:e.target.value})} style={field}/><div style={{display:'grid',gridTemplateColumns:'1fr 140px',gap:9}}><input placeholder="Category" value={f.category} onChange={e=>setF({...f,category:e.target.value})} style={field}/><select value={f.priority} onChange={e=>setF({...f,priority:e.target.value})} style={field}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></div><textarea placeholder="Describe the issue" value={f.message} onChange={e=>setF({...f,message:e.target.value})} style={{...field,height:90,padding:'10px 11px',resize:'vertical'}}/><div><Button primary disabled={!f.subject||!f.message} onClick={create}>Create ticket</Button></div></section>}<section style={{...CARD,overflow:'hidden'}}>{items.length?items.map(r=><div key={r.id} style={{padding:14,borderBottom:`1px solid ${T.DIVIDER}`,display:'flex',justifyContent:'space-between',gap:12,alignItems:'center'}}><div><b style={{color:T.TEXT,fontSize:13}}>{r.subject}</b><small style={{display:'block',color:T.TEXT_MUTED,marginTop:4}}>{r.seller_name?`${r.seller_name} · `:''}{title(r.category)} · {title(r.priority)} · {title(r.state)}</small></div>{admin&&r.state!=='resolved'&&<Button primary onClick={()=>update(r,'resolved')}>Resolve</Button>}</div>):<div style={{padding:24,color:T.TEXT_SECONDARY,fontSize:13}}>No tickets yet.</div>}</section></main>}
export default function LiveWorkspaceTools({activeId,mobile}){if(CONFIG[activeId])return <Settings activeId={activeId} mobile={mobile}/>;if(activeId==='mis')return <LiveReports mobile={mobile}/>;if(activeId==='weight')return <Reports activeId={activeId} mobile={mobile}/>;if(activeId==='a-tickets')return <Tickets admin mobile={mobile}/>;return <Tickets mobile={mobile}/>}
