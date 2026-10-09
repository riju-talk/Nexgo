'use client';

import { useEffect, useRef, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import { useAppState } from '@/lib/AppStateContext';
import * as T from '@/lib/theme';
import { BLUE, Btn, CARD, FIELD, Pill, dateTime, titleCase } from './Kit';

const ENTITY = [['proprietorship', 'Proprietorship'], ['partnership', 'Partnership'], ['private_limited', 'Private Limited'], ['llp', 'LLP'], ['public_limited', 'Public Limited']];
const STATUS = { unsubmitted: ['Not submitted', T.TEXT_MUTED], pending_review: ['Under review', T.AMBER], verified: ['Verified', T.GREEN], rejected: ['Needs changes', T.RED] };
const MAX_BYTES = 5 * 1024 * 1024;
const RULES = { pan: /^[A-Z]{5}[0-9]{4}[A-Z]$/, aadhaar: /^[2-9][0-9]{11}$/, gstin: /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, ifsc: /^[A-Z]{4}0[A-Z0-9]{6}$/, account: /^[0-9]{9,18}$/ };

const Label = ({ children, required }) => <span style={{ display: 'block', fontSize: 12.5, fontWeight: 650, color: T.TEXT_LABEL, marginBottom: 6 }}>{children}{required && <span style={{ color: T.RED }}> *</span>}</span>;
function Section({ n, title, hint, children }) {
  return (
    <section style={{ ...CARD, padding: 18 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 14 }}><span style={{ width: 30, height: 30, borderRadius: 15, background: `${BLUE}18`, color: BLUE, display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 14 }}>{n}</span><div><b style={{ color: T.TEXT, fontSize: 15.5 }}>{title}</b>{hint && <small style={{ display: 'block', color: T.TEXT_MUTED, marginTop: 2 }}>{hint}</small>}</div></div>
      {children}
    </section>
  );
}

// Document chooser. Files are validated here; they are attached once document storage is connected.
function DocPicker({ label, file, onPick, onClear }) {
  const { showToast } = useAppState(); const ref = useRef(null);
  const choose = (e) => {
    const f = e.target.files?.[0]; e.target.value = ''; if (!f) return;
    if (!/\.(pdf|png|jpe?g)$/i.test(f.name)) return showToast('Choose a PDF, PNG or JPG file.', 'error');
    if (f.size > MAX_BYTES) return showToast('The file must be smaller than 5 MB.', 'error');
    onPick(f); showToast('Document noted. File upload goes live once document storage is connected; your details are saved now.');
  };
  return (
    <div>
      <Label>{label}</Label>
      <input ref={ref} type="file" accept=".pdf,.png,.jpg,.jpeg" hidden onChange={choose} />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <Btn small onClick={() => ref.current?.click()}>{file ? 'Replace file' : '⬆ Choose file'}</Btn>
        {file ? <><span style={{ fontSize: 12.5, color: T.TEXT }}>{file.name} <small style={{ color: T.TEXT_MUTED }}>({Math.max(1, Math.round(file.size / 1024))} KB · uploads when storage is enabled)</small></span><button type="button" onClick={onClear} style={{ border: 0, background: 'transparent', color: T.RED, cursor: 'pointer', fontSize: 12 }}>Remove</button></> : <small style={{ color: T.TEXT_MUTED }}>PDF, PNG or JPG · max 5 MB</small>}
      </div>
    </div>
  );
}

export default function LiveKyc({ mobile }) {
  const { showToast } = useAppState();
  const [current, setCurrent] = useState(null); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ pan: '', panHolderName: '', aadhaar: '', gstApplicable: true, gstin: '', entityType: 'proprietorship', registeredAddress: '', bankAccountHolder: '', bankAccountNumber: '', bankIfsc: '' });
  const [files, setFiles] = useState({ pan: null, aadhaar: null, gst: null, bank: null });
  const [editing, setEditing] = useState(false);

  useEffect(() => { let live = true; apiFetch('/v1/seller/kyc').then((x) => { if (live) setCurrent(x); }).catch((e) => { if (live) { setCurrent({ status: 'unsubmitted' }); setError(e.status === 401 ? 'Sign in to submit your KYC.' : e.message || 'KYC status could not be loaded.'); } }); return () => { live = false; }; }, []);
  // A rejected submission starts from what was on file; secrets (full Aadhaar, bank account number) must be re-entered.
  const startEdit = () => { setF((x) => ({ ...x, pan: current.pan || '', panHolderName: current.pan_holder_name || '', gstApplicable: current.gst_applicable !== false, gstin: current.gstin || '', entityType: current.entity_type || 'proprietorship', registeredAddress: current.registered_address || '', bankAccountHolder: current.bank_account_holder || '', bankIfsc: current.bank_ifsc || '' })); setEditing(true); };

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const up = (k) => (e) => setF({ ...f, [k]: e.target.value.toUpperCase() });
  const aadhaarDigits = f.aadhaar.replace(/\D/g, '');
  const problems = [
    !RULES.pan.test(f.pan) && 'Enter a valid 10-character PAN (e.g. ABCDE1234F)',
    !RULES.aadhaar.test(aadhaarDigits) && 'Enter a valid 12-digit Aadhaar number',
    f.gstApplicable && !RULES.gstin.test(f.gstin) && 'Enter a valid 15-character GSTIN, or switch GST to not applicable',
    f.registeredAddress.trim().length < 10 && 'Enter the full registered address',
    f.bankAccountHolder.trim().length < 2 && 'Enter the bank account holder name',
    !RULES.account.test(f.bankAccountNumber) && 'Enter a valid bank account number (9–18 digits)',
    !RULES.ifsc.test(f.bankIfsc) && 'Enter a valid IFSC code (e.g. HDFC0001234)',
  ].filter(Boolean);

  const submit = async (e) => {
    e.preventDefault(); if (problems.length) return showToast(problems[0], 'error');
    setBusy(true);
    try {
      const body = { gstApplicable: f.gstApplicable, gstin: f.gstApplicable ? f.gstin : undefined, pan: f.pan, panHolderName: f.panHolderName.trim() || undefined, aadhaarNumber: aadhaarDigits, entityType: f.entityType, registeredAddress: f.registeredAddress.trim(), bankAccountHolder: f.bankAccountHolder.trim(), bankAccountNumber: f.bankAccountNumber, bankIfsc: f.bankIfsc };
      setCurrent(await apiFetch('/v1/seller/kyc', { method: 'POST', body })); setEditing(false); setF((x) => ({ ...x, aadhaar: '', bankAccountNumber: '' }));
      showToast('KYC submitted for verification');
    } catch (x) { showToast(x instanceof ApiError ? (x.body?.details?.fieldErrors ? Object.values(x.body.details.fieldErrors).flat()[0] : x.message) : 'KYC could not be submitted', 'error'); }
    finally { setBusy(false); }
  };

  const pad = mobile ? '14px 12px 42px' : '18px 22px 48px';
  if (current === null) return <div style={{ padding: pad }}><div style={{ ...CARD, padding: 22, color: T.TEXT_MUTED }}>Loading KYC…</div></div>;
  const [label, color] = STATUS[current.status] || STATUS.unsubmitted;
  const showForm = current.status === 'unsubmitted' || (current.status === 'rejected' && editing);
  const two = mobile ? '1fr' : '1fr 1fr';

  return (
    <div style={{ padding: pad, display: 'grid', gap: 14 }}>
      <section style={{ ...CARD, padding: 16, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center', borderLeft: `5px solid ${color}` }}>
        <div><b style={{ color: T.TEXT, fontSize: 16 }}>KYC verification</b><span style={{ display: 'block', marginTop: 3, color: T.TEXT_SECONDARY, fontSize: 13 }}>PAN, Aadhaar, GST (if applicable) and bank details are needed before COD remittances can be paid out.</span></div>
        <Pill color={color}>{label}</Pill>
      </section>
      {error && <div style={{ ...CARD, padding: 14, color: T.RED, fontSize: 13 }}>{error}</div>}
      {current.status === 'rejected' && <div style={{ ...CARD, padding: 14, borderLeft: `5px solid ${T.RED}`, fontSize: 13, color: T.TEXT_SECONDARY }}><b style={{ color: T.RED }}>Changes needed:</b> {current.rejection_reason || 'Please review the details below and resubmit.'}{!editing && <div style={{ marginTop: 10 }}><Btn primary onClick={startEdit}>Update and resubmit</Btn></div>}</div>}

      {!showForm && current.status !== 'unsubmitted' && (
        <section style={{ ...CARD, padding: 18 }}>
          <b style={{ color: T.TEXT, fontSize: 15 }}>Submitted details</b>
          <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: mobile ? '1fr' : 'repeat(3,1fr)', gap: 14 }}>
            {[['PAN', current.pan], ['PAN holder', current.pan_holder_name || '—'], ['Aadhaar', current.aadhaar_last4 ? `XXXX XXXX ${current.aadhaar_last4}` : '—'], ['GST', current.gst_applicable === false ? 'Not applicable' : current.gstin || '—'], ['Business type', titleCase(current.entity_type)], ['Registered address', current.registered_address], ['Bank account holder', current.bank_account_holder], ['Bank account', 'On file (hidden for your security)'], ['IFSC', current.bank_ifsc], ['Submitted', dateTime(current.submitted_at)]].map(([l, v]) => <div key={l}><small style={{ display: 'block', fontSize: 10.5, color: T.TEXT_MUTED, textTransform: 'uppercase', letterSpacing: '.05em' }}>{l}</small><b style={{ color: T.TEXT, fontSize: 13.5, wordBreak: 'break-word' }}>{v}</b></div>)}
          </div>
          {current.status === 'pending_review' && <p style={{ margin: '14px 0 0', color: T.TEXT_MUTED, fontSize: 12.5 }}>Our team is reviewing your submission. You will be able to edit it again only if changes are requested.</p>}
        </section>
      )}

      {showForm && (
        <form onSubmit={submit} style={{ display: 'grid', gap: 14 }}>
          <Section n="1" title="PAN card" hint="Permanent Account Number of the business or proprietor.">
            <div style={{ display: 'grid', gridTemplateColumns: two, gap: 14 }}>
              <label><Label required>PAN number</Label><input style={{ ...FIELD, width: '100%', height: 42, textTransform: 'uppercase' }} value={f.pan} maxLength={10} onChange={up('pan')} placeholder="ABCDE1234F" /></label>
              <label><Label>Name on PAN</Label><input style={{ ...FIELD, width: '100%', height: 42 }} value={f.panHolderName} maxLength={150} onChange={set('panHolderName')} /></label>
              <DocPicker label="Upload PAN card" file={files.pan} onPick={(x) => setFiles({ ...files, pan: x })} onClear={() => setFiles({ ...files, pan: null })} />
            </div>
          </Section>
          <Section n="2" title="Aadhaar" hint="Only the last 4 digits are stored. The full number is never saved.">
            <div style={{ display: 'grid', gridTemplateColumns: two, gap: 14 }}>
              <label><Label required>Aadhaar number</Label><input style={{ ...FIELD, width: '100%', height: 42, letterSpacing: '.08em' }} value={aadhaarDigits.replace(/(\d{4})(?=\d)/g, '$1 ')} inputMode="numeric" maxLength={14} onChange={(e) => setF({ ...f, aadhaar: e.target.value.replace(/\D/g, '').slice(0, 12) })} placeholder="XXXX XXXX XXXX" /></label>
              <DocPicker label="Upload Aadhaar (front and back)" file={files.aadhaar} onPick={(x) => setFiles({ ...files, aadhaar: x })} onClear={() => setFiles({ ...files, aadhaar: null })} />
            </div>
          </Section>
          <Section n="3" title="GST" hint="Required if your business is GST registered.">
            <label style={{ display: 'flex', gap: 10, alignItems: 'center', cursor: 'pointer', marginBottom: 12 }}><input type="checkbox" checked={f.gstApplicable} onChange={(e) => setF({ ...f, gstApplicable: e.target.checked, gstin: e.target.checked ? f.gstin : '' })} style={{ width: 18, height: 18, accentColor: BLUE }} /><span style={{ color: T.TEXT, fontSize: 13.5, fontWeight: 650 }}>My business is GST registered</span></label>
            {f.gstApplicable ? (
              <div style={{ display: 'grid', gridTemplateColumns: two, gap: 14 }}>
                <label><Label required>GSTIN</Label><input style={{ ...FIELD, width: '100%', height: 42, textTransform: 'uppercase' }} value={f.gstin} maxLength={15} onChange={up('gstin')} placeholder="22AAAAA0000A1Z5" /></label>
                <DocPicker label="Upload GST certificate" file={files.gst} onPick={(x) => setFiles({ ...files, gst: x })} onClear={() => setFiles({ ...files, gst: null })} />
              </div>
            ) : <small style={{ color: T.TEXT_MUTED }}>GST not applicable. Invoices will be raised without a GSTIN on your side.</small>}
          </Section>
          <Section n="4" title="Business details">
            <div style={{ display: 'grid', gridTemplateColumns: two, gap: 14 }}>
              <label><Label required>Business type</Label><select style={{ ...FIELD, width: '100%', height: 42 }} value={f.entityType} onChange={set('entityType')}>{ENTITY.map(([id, l]) => <option key={id} value={id}>{l}</option>)}</select></label>
              <label><Label required>Registered address</Label><textarea style={{ ...FIELD, width: '100%', height: 70, padding: 10, resize: 'vertical' }} value={f.registeredAddress} maxLength={500} onChange={set('registeredAddress')} /></label>
            </div>
          </Section>
          <Section n="5" title="Banking details" hint="COD remittances are paid into this account. The account number is stored encrypted.">
            <div style={{ display: 'grid', gridTemplateColumns: two, gap: 14 }}>
              <label><Label required>Account holder name</Label><input style={{ ...FIELD, width: '100%', height: 42 }} value={f.bankAccountHolder} maxLength={150} onChange={set('bankAccountHolder')} /></label>
              <label><Label required>Account number</Label><input style={{ ...FIELD, width: '100%', height: 42 }} value={f.bankAccountNumber} inputMode="numeric" maxLength={18} onChange={(e) => setF({ ...f, bankAccountNumber: e.target.value.replace(/\D/g, '') })} /></label>
              <label><Label required>IFSC code</Label><input style={{ ...FIELD, width: '100%', height: 42, textTransform: 'uppercase' }} value={f.bankIfsc} maxLength={11} onChange={up('bankIfsc')} placeholder="HDFC0001234" /></label>
              <DocPicker label="Upload cancelled cheque / bank statement" file={files.bank} onPick={(x) => setFiles({ ...files, bank: x })} onClear={() => setFiles({ ...files, bank: null })} />
            </div>
          </Section>
          {problems.length > 0 && <div style={{ fontSize: 12.5, color: T.TEXT_MUTED }}>Still needed: {problems[0]}{problems.length > 1 ? ` (+${problems.length - 1} more)` : ''}</div>}
          <div style={{ display: 'flex', gap: 10 }}><Btn primary type="submit" disabled={busy || problems.length > 0} style={{ height: 44, padding: '0 28px' }}>{busy ? 'Submitting…' : 'Submit for verification'}</Btn>{editing && <Btn onClick={() => setEditing(false)} style={{ height: 44 }}>Cancel</Btn>}</div>
        </form>
      )}
    </div>
  );
}
