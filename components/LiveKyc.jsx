'use client';

import { useEffect, useRef, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import { useAppState } from '@/lib/AppStateContext';
import { uploadSellerFile } from '@/lib/uploadFile';
import { ONBOARDING_EVENT } from '@/lib/onboarding';
import { ID_PROOFS, idNumberProblem, idProofLabel, maskedIdProof } from '@/lib/idProof';
import * as T from '@/lib/theme';
import { BLUE, Btn, CARD, FIELD, Pill, dateTime, titleCase } from './Kit';

const ENTITY = [['individual', 'Individual'], ['proprietorship', 'Proprietorship'], ['partnership', 'Partnership'], ['private_limited', 'Private Limited'], ['llp', 'LLP'], ['public_limited', 'Public Limited']];
const STATUS = { unsubmitted: ['Not submitted', T.TEXT_MUTED], pending_review: ['Under review', T.AMBER], verified: ['Verified', T.GREEN], rejected: ['Needs changes', T.RED] };
const MAX_BYTES = 3 * 1024 * 1024;
const RULES = { pan: /^[A-Z]{5}[0-9]{4}[A-Z]$/, gstin: /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, ifsc: /^[A-Z]{4}0[A-Z0-9]{6}$/, account: /^[0-9]{9,18}$/ };

const Label = ({ children, required }) => <span style={{ display: 'block', fontSize: 12.5, fontWeight: 650, color: T.TEXT_LABEL, marginBottom: 6 }}>{children}{required && <span style={{ color: T.RED }}> *</span>}</span>;
function Section({ n, title, hint, children }) {
  return (
    <section style={{ ...CARD, padding: 18 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 14 }}><span style={{ width: 30, height: 30, borderRadius: 15, background: `${BLUE}18`, color: BLUE, display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 14 }}>{n}</span><div><b style={{ color: T.TEXT, fontSize: 15.5 }}>{title}</b>{hint && <small style={{ display: 'block', color: T.TEXT_MUTED, marginTop: 2 }}>{hint}</small>}</div></div>
      {children}
    </section>
  );
}

// Save button of one section, with a tick once that section is stored.
const SaveRow = ({ done, busy, onSave, label }) => <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 16 }}><Btn primary onClick={onSave} disabled={busy}>{busy ? 'Saving…' : label}</Btn>{done && <span style={{ color: T.GREEN, fontSize: 12.5, fontWeight: 700 }}>✓ Saved</span>}</div>;

// Document chooser. Files are validated here and uploaded together with the KYC submission.
function DocPicker({ label, file, onPick, onClear, required }) {
  const { showToast } = useAppState(); const ref = useRef(null);
  const choose = (e) => {
    const f = e.target.files?.[0]; e.target.value = ''; if (!f) return;
    if (!/\.(pdf|png|jpe?g)$/i.test(f.name)) return showToast('Choose a PDF, PNG or JPG file.', 'error');
    if (f.size > MAX_BYTES) return showToast('The file must be smaller than 3 MB.', 'error');
    onPick(f);
  };
  return (
    <div>
      <Label required={required}>{label}</Label>
      <input ref={ref} type="file" accept=".pdf,.png,.jpg,.jpeg" hidden onChange={choose} />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <Btn small onClick={() => ref.current?.click()}>{file ? 'Replace file' : '⬆ Choose file'}</Btn>
        {file ? <><span style={{ fontSize: 12.5, color: T.TEXT }}>{file.name} <small style={{ color: T.TEXT_MUTED }}>({Math.max(1, Math.round(file.size / 1024))} KB · uploaded when you save this section)</small></span><button type="button" onClick={onClear} style={{ border: 0, background: 'transparent', color: T.RED, cursor: 'pointer', fontSize: 12 }}>Remove</button></> : <small style={{ color: T.TEXT_MUTED }}>PDF, PNG or JPG · max 3 MB</small>}
      </div>
    </div>
  );
}

export default function LiveKyc({ mobile }) {
  const { showToast } = useAppState();
  const [current, setCurrent] = useState(null); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ pan: '', panHolderName: '', idProofType: 'aadhaar', idNumber: '', gstApplicable: false, gstin: '', entityType: 'proprietorship', registeredAddress: '', bankAccountHolder: '', bankAccountNumber: '', bankIfsc: '' });
  const [files, setFiles] = useState({ pan: null, idFront: null, idBack: null, gst: null, bank: null });
  const [editing, setEditing] = useState(false);

  useEffect(() => { let live = true; apiFetch('/v1/seller/kyc').then((x) => { if (live) setCurrent(x); }).catch((e) => { if (live) { setCurrent({ status: 'unsubmitted' }); setError(e.status === 401 ? 'Sign in to submit your KYC.' : e.message || 'KYC status could not be loaded.'); } }); return () => { live = false; }; }, []);
  // A rejected submission starts from what was on file; secrets (full Aadhaar, bank account number) must be re-entered.
  const startEdit = () => { setF((x) => ({ ...x, pan: current.pan || '', panHolderName: current.pan_holder_name || '', gstApplicable: current.gst_applicable === true, gstin: current.gstin || '', entityType: current.entity_type || 'proprietorship', registeredAddress: current.registered_address || '', bankAccountHolder: current.bank_account_holder || '', bankIfsc: current.bank_ifsc || '' })); setEditing(true); };

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const up = (k) => (e) => setF({ ...f, [k]: e.target.value.toUpperCase() });
  const idProof = ID_PROOFS.find((x) => x.id === f.idProofType);

  // Each section is saved on its own (PUT /v1/seller/kyc/sections/:name) together with its own scans, so nobody fills one long form.
  const [saved, setSaved] = useState({}); const [onFile, setOnFile] = useState([]); const [savingSection, setSavingSection] = useState('');
  const loadSections = () => apiFetch('/v1/seller/kyc/sections').then((x) => {
    setSaved(x.sections || {}); setOnFile(x.files || []);
    const { business, identity, bank } = x.sections || {};
    setF((cur) => ({ ...cur,
      ...(business ? { entityType: business.entityType, registeredAddress: business.registeredAddress, gstApplicable: business.gstApplicable === true, gstin: business.gstin || '' } : {}),
      ...(identity ? { pan: identity.pan, panHolderName: identity.panHolderName, idProofType: identity.idProofType } : {}),
      ...(bank ? { bankAccountHolder: bank.bankAccountHolder, bankIfsc: bank.bankIfsc } : {}) }));
  }).catch(() => {});
  useEffect(() => { loadSections(); }, []);

  const sectionProblems = {
    business: [
      f.registeredAddress.trim().length < 10 && 'Enter the full registered address',
      f.gstApplicable && !RULES.gstin.test(f.gstin) && 'Enter a valid 15-character GSTIN, or switch GST to not applicable',
    ],
    identity: [
      !RULES.pan.test(f.pan) && 'Enter a valid 10-character PAN (e.g. ABCDE1234F)',
      f.panHolderName.trim().length < 2 && 'Enter the name exactly as printed on the PAN card',
      idNumberProblem(f.idProofType, f.idNumber),
      !files.pan && !onFile.includes('kyc_pan') && 'Upload your PAN card',
      !files.idFront && !onFile.includes('kyc_id_front') && !onFile.includes('kyc_aadhaar_front') && `Upload a scanned copy of your ${idProof.label}`,
    ],
    bank: [
      f.bankAccountHolder.trim().length < 2 && 'Enter the bank account holder name',
      !RULES.account.test(f.bankAccountNumber) && 'Enter a valid bank account number (9–18 digits)',
      !RULES.ifsc.test(f.bankIfsc) && 'Enter a valid IFSC code (e.g. HDFC0001234)',
    ],
  };
  const SECTION_FILES = { business: [['gst', 'kyc_gst']], identity: [['pan', 'kyc_pan'], ['idFront', 'kyc_id_front'], ['idBack', 'kyc_id_back']], bank: [['bank', 'kyc_bank']] };
  const SECTION_BODY = {
    business: () => ({ gstApplicable: f.gstApplicable, gstin: f.gstApplicable ? f.gstin : undefined, entityType: f.entityType, registeredAddress: f.registeredAddress.trim() }),
    identity: () => ({ pan: f.pan, panHolderName: f.panHolderName.trim(), idProofType: f.idProofType, idNumber: f.idNumber }),
    bank: () => ({ bankAccountHolder: f.bankAccountHolder.trim(), bankAccountNumber: f.bankAccountNumber, bankIfsc: f.bankIfsc }),
  };
  const errorText = (x) => (x instanceof ApiError ? (x.body?.details?.fieldErrors ? Object.values(x.body.details.fieldErrors).flat()[0] : x.message) : x.message || 'Could not save');

  const saveSection = async (name) => {
    const problem = sectionProblems[name].find(Boolean); if (problem) return showToast(problem, 'error');
    setSavingSection(name);
    try {
      for (const [k, purpose] of SECTION_FILES[name]) {
        if (!files[k]) continue;
        try { await uploadSellerFile(purpose, files[k]); } catch (err) { throw new Error(`${files[k].name} could not be uploaded: ${err.message}`); }
      }
      await apiFetch(`/v1/seller/kyc/sections/${name}`, { method: 'PUT', body: SECTION_BODY[name]() });
      setFiles((cur) => Object.fromEntries(Object.entries(cur).map(([k, v]) => [k, SECTION_FILES[name].some(([fk]) => fk === k) ? null : v])));
      setF((cur) => ({ ...cur, ...(name === 'identity' ? { idNumber: '' } : {}), ...(name === 'bank' ? { bankAccountNumber: '' } : {}) }));
      await loadSections();
      showToast(`${{ business: 'Business details', identity: 'Identity details', bank: 'Banking details' }[name]} saved`);
    } catch (x) { showToast(errorText(x), 'error'); }
    finally { setSavingSection(''); }
  };

  const allSaved = ['business', 'identity', 'bank'].every((n) => saved[n]);
  const docsReady = onFile.includes('kyc_pan') && (onFile.includes('kyc_id_front') || onFile.includes('kyc_aadhaar_front'));
  const submit = async (e) => {
    e.preventDefault(); if (!allSaved) return showToast('Save the business, identity and banking sections first.', 'error');
    if (!docsReady) return showToast('Upload your PAN card and identity proof first.', 'error');
    setBusy(true);
    try {
      setCurrent(await apiFetch('/v1/seller/kyc/submit', { method: 'POST', body: {} })); setEditing(false);
      showToast('KYC submitted for verification');
      window.dispatchEvent(new Event(ONBOARDING_EVENT)); // lets the onboarding gate re-check
    } catch (x) { showToast(errorText(x), 'error'); }
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
        <div><b style={{ color: T.TEXT, fontSize: 16 }}>KYC verification</b><span style={{ display: 'block', marginTop: 3, color: T.TEXT_SECONDARY, fontSize: 13 }}>Your PAN, one ID proof, GST (if applicable) and bank details let us confirm your business is genuine. Orders open once this is submitted; shipments open after we verify it.</span></div>
        <Pill color={color}>{label}</Pill>
      </section>
      {error && <div style={{ ...CARD, padding: 14, color: T.RED, fontSize: 13 }}>{error}</div>}
      {current.status === 'rejected' && <div style={{ ...CARD, padding: 14, borderLeft: `5px solid ${T.RED}`, fontSize: 13, color: T.TEXT_SECONDARY }}><b style={{ color: T.RED }}>Changes needed:</b> {current.rejection_reason || 'Please review the details below and resubmit.'}{!editing && <div style={{ marginTop: 10 }}><Btn primary onClick={startEdit}>Update and resubmit</Btn></div>}</div>}

      {!showForm && current.status !== 'unsubmitted' && (
        <section style={{ ...CARD, padding: 18 }}>
          <b style={{ color: T.TEXT, fontSize: 15 }}>Submitted details</b>
          <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: mobile ? '1fr' : 'repeat(3,1fr)', gap: 14 }}>
            {[['PAN', current.pan], ['PAN holder', current.pan_holder_name || '—'], ['Identity proof', maskedIdProof(current.id_proof_type || 'aadhaar', current.id_proof_last4 || current.aadhaar_last4)], ['GST', current.gst_applicable === false ? 'Not applicable' : current.gstin || '—'], ['Business type', titleCase(current.entity_type)], ['Registered address', current.registered_address], ['Bank account holder', current.bank_account_holder], ['Bank account', 'On file (hidden for your security)'], ['IFSC', current.bank_ifsc], ['Submitted', dateTime(current.submitted_at)]].map(([l, v]) => <div key={l}><small style={{ display: 'block', fontSize: 10.5, color: T.TEXT_MUTED, textTransform: 'uppercase', letterSpacing: '.05em' }}>{l}</small><b style={{ color: T.TEXT, fontSize: 13.5, wordBreak: 'break-word' }}>{v}</b></div>)}
          </div>
          {current.status === 'pending_review' && <p style={{ margin: '14px 0 0', color: T.TEXT_MUTED, fontSize: 12.5 }}>Our team is reviewing your submission. You will be able to edit it again only if changes are requested.</p>}
        </section>
      )}

      {showForm && (
        <form onSubmit={submit} style={{ display: 'grid', gap: 14 }}>
          <Section n="1" title="Business details" hint="Saved on its own. GST is optional.">
            <div style={{ display: 'grid', gridTemplateColumns: two, gap: 14 }}>
              <label><Label required>Business type</Label><select style={{ ...FIELD, width: '100%', height: 42 }} value={f.entityType} onChange={set('entityType')}>{ENTITY.map(([id, l]) => <option key={id} value={id}>{l}</option>)}</select></label>
              <label><Label required>Registered address</Label><textarea style={{ ...FIELD, width: '100%', height: 70, padding: 10, resize: 'vertical' }} value={f.registeredAddress} maxLength={500} onChange={set('registeredAddress')} /></label>
            </div>
            <label style={{ display: 'flex', gap: 10, alignItems: 'center', cursor: 'pointer', margin: '14px 0 10px' }}><input type="checkbox" checked={f.gstApplicable} onChange={(e) => setF({ ...f, gstApplicable: e.target.checked, gstin: e.target.checked ? f.gstin : '' })} style={{ width: 18, height: 18, accentColor: BLUE }} /><span style={{ color: T.TEXT, fontSize: 13.5, fontWeight: 650 }}>My business is GST registered (optional)</span></label>
            {f.gstApplicable && (
              <div style={{ display: 'grid', gridTemplateColumns: two, gap: 14 }}>
                <label><Label required>GSTIN</Label><input style={{ ...FIELD, width: '100%', height: 42, textTransform: 'uppercase' }} value={f.gstin} maxLength={15} onChange={up('gstin')} placeholder="22AAAAA0000A1Z5" /></label>
                <DocPicker label="Upload GST certificate" file={files.gst} onPick={(x) => setFiles({ ...files, gst: x })} onClear={() => setFiles({ ...files, gst: null })} />
              </div>
            )}
            <SaveRow done={!!saved.business} busy={savingSection === 'business'} onSave={() => saveSection('business')} label="Save business details" />
          </Section>
          <Section n="2" title="PAN and identity proof" hint="Any one government ID we can verify. Only the last 4 characters of the number are stored; the scans are kept in a private, encrypted bucket.">
            <div style={{ display: 'grid', gridTemplateColumns: two, gap: 14 }}>
              <label><Label required>PAN number</Label><input style={{ ...FIELD, width: '100%', height: 42, textTransform: 'uppercase' }} value={f.pan} maxLength={10} onChange={up('pan')} placeholder="ABCDE1234F" /></label>
              <label><Label required>Name on PAN</Label><input style={{ ...FIELD, width: '100%', height: 42 }} value={f.panHolderName} maxLength={150} onChange={set('panHolderName')} /></label>
              <DocPicker required={!onFile.includes('kyc_pan')} label={onFile.includes('kyc_pan') ? 'PAN card (uploaded: choose to replace)' : 'Upload PAN card'} file={files.pan} onPick={(x) => setFiles({ ...files, pan: x })} onClear={() => setFiles({ ...files, pan: null })} />
              <span />
              <label><Label required>Document</Label><select style={{ ...FIELD, width: '100%', height: 42 }} value={f.idProofType} onChange={(e) => setF({ ...f, idProofType: e.target.value, idNumber: '' })}>{ID_PROOFS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select></label>
              <label><Label required>{idProof.label} number</Label><input style={{ ...FIELD, width: '100%', height: 42, letterSpacing: '.06em', textTransform: 'uppercase' }} value={f.idNumber} maxLength={30} onChange={set('idNumber')} placeholder={idProof.placeholder} /></label>
              <DocPicker required={!(onFile.includes('kyc_id_front') || onFile.includes('kyc_aadhaar_front'))} label={`Upload ${idProof.label}: front / details page`} file={files.idFront} onPick={(x) => setFiles({ ...files, idFront: x })} onClear={() => setFiles({ ...files, idFront: null })} />
              <DocPicker label={`Upload ${idProof.label}: back / address page (if any)`} file={files.idBack} onPick={(x) => setFiles({ ...files, idBack: x })} onClear={() => setFiles({ ...files, idBack: null })} />
            </div>
            <SaveRow done={!!saved.identity} busy={savingSection === 'identity'} onSave={() => saveSection('identity')} label="Save identity details" />
          </Section>
          <Section n="3" title="Banking details" hint="COD remittances are paid into this account. The account number is stored encrypted.">
            <div style={{ display: 'grid', gridTemplateColumns: two, gap: 14 }}>
              <label><Label required>Account holder name</Label><input style={{ ...FIELD, width: '100%', height: 42 }} value={f.bankAccountHolder} maxLength={150} onChange={set('bankAccountHolder')} /></label>
              <label><Label required>Account number</Label><input style={{ ...FIELD, width: '100%', height: 42 }} value={f.bankAccountNumber} inputMode="numeric" maxLength={18} onChange={(e) => setF({ ...f, bankAccountNumber: e.target.value.replace(/\D/g, '') })} placeholder={saved.bank?.bankAccountMasked ? `On file: ${saved.bank.bankAccountMasked}` : ''} /></label>
              <label><Label required>IFSC code</Label><input style={{ ...FIELD, width: '100%', height: 42, textTransform: 'uppercase' }} value={f.bankIfsc} maxLength={11} onChange={up('bankIfsc')} placeholder="HDFC0001234" /></label>
              <DocPicker label="Upload cancelled cheque / bank statement" file={files.bank} onPick={(x) => setFiles({ ...files, bank: x })} onClear={() => setFiles({ ...files, bank: null })} />
            </div>
            <SaveRow done={!!saved.bank} busy={savingSection === 'bank'} onSave={() => saveSection('bank')} label="Save banking details" />
          </Section>
          <div style={{ ...CARD, padding: 16, display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
            <Btn primary type="submit" disabled={busy || !allSaved || !docsReady} style={{ height: 44, padding: '0 28px' }}>{busy ? 'Submitting…' : 'Submit for verification'}</Btn>
            {editing && <Btn onClick={() => setEditing(false)} style={{ height: 44 }}>Cancel</Btn>}
            <small style={{ color: T.TEXT_MUTED }}>{!allSaved ? 'Save all three sections above, then submit.' : !docsReady ? 'Upload your PAN card and identity proof, then save that section again.' : 'Everything is saved. Submit when you are ready.'}</small>
          </div>
        </form>
      )}
    </div>
  );
}
