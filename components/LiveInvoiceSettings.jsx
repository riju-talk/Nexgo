'use client';

import { useEffect, useRef, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import { useAppState } from '@/lib/AppStateContext';
import { saveRows } from '@/lib/exportFile';
import { uploadSellerFile } from '@/lib/uploadFile';
import * as T from '@/lib/theme';
import { Btn, CARD, FIELD } from './Kit';
import { SAMPLE_DOC, invoiceRows } from './documents/exportRows';

const A4 = 'A4 (8×11 in) standard printer';
const THERMAL = 'Thermal printer (4×6 in)';
const MAX_CUSTOM = 5;
const heading = { margin: 0, color: T.TEXT, fontSize: 15, fontWeight: 800 };
const hint = { margin: '5px 0 0', color: T.TEXT_SECONDARY, fontSize: 12.5 };
const rule = { border: 0, borderTop: `1px solid ${T.DIVIDER}`, margin: '20px 0' };

function FilePicker({ label, purpose, fileId, onUploaded }) {
  const { showToast } = useAppState();
  const input = useRef(null); const [busy, setBusy] = useState(false); const [name, setName] = useState('');
  const pick = async (e) => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    setBusy(true);
    try { const saved = await uploadSellerFile(purpose, file); setName(saved.filename); onUploaded(saved.id); showToast(`${label} uploaded`); }
    catch (err) { showToast(err instanceof ApiError || err instanceof Error ? err.message : 'Upload failed', 'error'); } finally { setBusy(false); }
  };
  return (
    <div>
      <h3 style={heading}>{label}</h3>
      <div style={{ display: 'flex', marginTop: 8, border: `1px solid ${T.INPUT_BORDER}`, borderRadius: 8, overflow: 'hidden', background: T.SURFACE }}>
        <span style={{ flex: 1, padding: '10px 12px', color: name || fileId ? T.TEXT : T.TEXT_MUTED, fontSize: 13 }}>{name || (fileId ? 'Image saved — choose another to replace' : 'Choose file')}</span>
        <button type="button" disabled={busy} onClick={() => input.current?.click()} style={{ padding: '0 16px', border: 0, borderLeft: `1px solid ${T.INPUT_BORDER}`, background: T.SURFACE_SOFT, color: T.TEXT, fontSize: 13, cursor: 'pointer' }}>{busy ? 'Uploading…' : 'Browse'}</button>
        <input ref={input} type="file" accept="image/png,image/jpeg" onChange={pick} hidden />
      </div>
      <p style={hint}>PNG or JPG, up to 3 MB.</p>
    </div>
  );
}

export default function LiveInvoiceSettings({ mobile }) {
  const { showToast } = useAppState();
  const [v, setV] = useState({}); const [loaded, setLoaded] = useState(false); const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    apiFetch('/v1/settings/inv-settings').then((x) => live && setV(x.values || {})).catch(() => {}).finally(() => live && setLoaded(true));
    return () => { live = false; };
  }, []);
  const set = (k, val) => setV((s) => ({ ...s, [k]: val }));
  const thermal = String(v.pageFormat || '').startsWith('Thermal');
  const rows = Math.min(MAX_CUSTOM, Math.max(1, ...[1, 2, 3, 4, 5].filter((n) => v[`customName${n}`] || v[`customValue${n}`]), v.customRows || 1));
  const save = async () => {
    setBusy(true);
    try { await apiFetch('/v1/settings/inv-settings', { method: 'PUT', body: { ...v, pageFormat: thermal ? THERMAL : A4, customRows: rows } }); showToast('Invoice settings saved'); }
    catch (e) { showToast(e instanceof ApiError ? e.message : 'Settings could not be saved', 'error'); } finally { setBusy(false); }
  };
  const latest = async () => {
    try { const x = await apiFetch('/v1/shipments'); const first = (x.items || [])[0]; if (!first) return showToast('No shipment yet, so there is no invoice to download. Use the sample instead.', 'error'); window.open(`/documents/invoice?ids=${first.id}`, '_blank', 'noopener'); }
    catch (e) { showToast(e.message || 'Could not open the invoice', 'error'); }
  };
  return (
    <main style={{ padding: mobile ? '14px 12px 42px' : '18px 28px 48px', maxWidth: 720 }}>
      <h2 style={{ margin: '0 0 14px', color: T.TEXT, fontSize: 21 }}>Invoice Settings</h2>
      <section style={{ ...CARD, padding: 22, opacity: loaded ? 1 : .6 }}>
        <h3 style={heading}>Show/Hide Your Company Name</h3>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, color: T.TEXT_LABEL, fontSize: 13 }}>
          <input type="checkbox" checked={!!v.hideCompanyName} onChange={(e) => set('hideCompanyName', e.target.checked)} style={{ width: 18, height: 18, accentColor: T.ACCENT }} />Hide Company Name On Invoice
        </label>
        <hr style={rule} />
        <h3 style={heading}>Set Prefix For Your Invoice No.</h3>
        <p style={hint}>This prefix will be shown on your invoice along with the invoice number. For example: NP001</p>
        <input style={{ ...FIELD, width: '100%', marginTop: 10 }} placeholder="Input Prefix" maxLength={12} value={v.prefix || ''} onChange={(e) => set('prefix', e.target.value.toUpperCase())} />
        <hr style={rule} />
        <FilePicker label="Set Logo" purpose="logo" fileId={v.logoFileId} onUploaded={(id) => set('logoFileId', id)} />
        <div style={{ height: 16 }} />
        <FilePicker label="Set Signature" purpose="signature" fileId={v.signatureFileId} onUploaded={(id) => set('signatureFileId', id)} />
        <hr style={rule} />
        <h3 style={heading}>Page Setting</h3>
        {[[A4, 'Standard Desktop Printers - Size A4 (8"x11")', 'Single Invoice Printed on one Sheet'], [THERMAL, 'Thermal Printers - Size (4"x6")', 'Single Invoice on one Sheet']].map(([value, name, sub]) => (
          <label key={value} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 12, cursor: 'pointer' }}>
            <input type="radio" name="pageFormat" checked={(value === THERMAL) === thermal} onChange={() => set('pageFormat', value)} style={{ marginTop: 3, accentColor: T.ACCENT }} />
            <span><b style={{ color: T.TEXT, fontSize: 13.5 }}>{name}</b><small style={{ display: 'block', color: T.TEXT_SECONDARY, marginTop: 2 }}>({sub})</small></span>
          </label>
        ))}
        <hr style={rule} />
        <h3 style={heading}>Customize Fields</h3>
        {thermal && <p style={{ margin: '6px 0 0', color: T.RED, fontSize: 12.5 }}>NOTE: Customize Fields are not allowed on Thermal Invoice.</p>}
        <p style={hint}>This option enables you to add the field along with value you want to show/print on your invoice</p>
        <div style={{ marginTop: 12, border: `1px solid ${T.BORDER}`, borderRadius: 8, padding: 12, display: 'grid', gap: 10, opacity: thermal ? .5 : 1 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 40px', gap: 10, color: T.TEXT_MUTED, fontSize: 11, fontWeight: 800, letterSpacing: '.06em' }}><span>COLUMN NAME</span><span>VALUE</span><span /></div>
          {Array.from({ length: rows }, (_, i) => i + 1).map((n) => (
            <div key={n} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 40px', gap: 10 }}>
              <input style={FIELD} disabled={thermal} placeholder="Column Name" maxLength={40} value={v[`customName${n}`] || ''} onChange={(e) => set(`customName${n}`, e.target.value)} />
              <input style={FIELD} disabled={thermal} placeholder="Value" maxLength={80} value={v[`customValue${n}`] || ''} onChange={(e) => set(`customValue${n}`, e.target.value)} />
              {n === rows && rows < MAX_CUSTOM ? <button type="button" aria-label="Add field" disabled={thermal} onClick={() => set('customRows', rows + 1)} style={{ border: 0, borderRadius: 8, background: '#3877fc', color: '#fff', fontSize: 20, cursor: 'pointer' }}>+</button> : <span />}
            </div>
          ))}
        </div>
        <hr style={rule} />
        <h3 style={heading}>Download Invoice</h3>
        <p style={hint}>Check how your invoice looks with these settings. The PDF preview uses your saved settings, so press Save changes first. Excel and CSV use what is on screen.</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
          <Btn onClick={() => window.open('/documents/invoice?sample=1', '_blank', 'noopener')}>Preview sample invoice (PDF)</Btn>
          <Btn onClick={() => saveRows(invoiceRows([SAMPLE_DOC], v), 'sample-invoice', 'xlsx', 'Invoice')}>Download sample (Excel)</Btn>
          <Btn onClick={() => saveRows(invoiceRows([SAMPLE_DOC], v), 'sample-invoice', 'csv')}>Download sample (CSV)</Btn>
          <Btn onClick={latest}>Download my latest invoice</Btn>
        </div>
        <div style={{ marginTop: 22 }}><Btn primary disabled={busy || !loaded} onClick={save}>{busy ? 'Saving…' : 'Save changes'}</Btn></div>
      </section>
    </main>
  );
}
