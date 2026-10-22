'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { useAppState } from '@/lib/AppStateContext';
import { openSellerFile } from '@/lib/uploadFile';
import * as T from '@/lib/theme';

const CARD = { background: 'var(--nx-surface)', border: '1px solid var(--nx-glass-border)', borderRadius: 12, boxShadow: '0 2px 8px rgba(15,31,61,.05)' };
const KYC_LABEL = { verified: 'VERIFIED', pending_review: 'UNDER REVIEW', rejected: 'REJECTED', unsubmitted: 'KYC NOT SUBMITTED' };
const DOC_LABELS = { kyc_pan: 'PAN card', kyc_aadhaar: 'Aadhaar', kyc_aadhaar_front: 'Aadhaar (front)', kyc_aadhaar_back: 'Aadhaar (back)', kyc_gst: 'GST certificate', kyc_bank: 'Cancelled cheque / bank statement' };

// Real KYC + document state for the profile page (no placeholder values).
function useKycAndFiles() {
  const [state, setState] = useState({ kyc: null, files: null });
  useEffect(() => {
    let live = true;
    Promise.all([apiFetch('/v1/seller/kyc').catch(() => ({ status: 'unsubmitted' })), apiFetch('/v1/seller/files').then((d) => d.items).catch(() => [])]).then(([kyc, files]) => live && setState({ kyc, files }));
    return () => { live = false; };
  }, []);
  return state;
}

export function ProfileStatus({ identity, mobile }) {
  const { kyc } = useKycAndFiles();
  if (!kyc) return null;
  const rows = [['Email', true], ['PAN', !!kyc.pan], ['Aadhaar', !!kyc.aadhaar_last4], ['GST', kyc.gst_applicable === false ? true : !!kyc.gstin], ['Bank', !!kyc.bank_ifsc]];
  const since = identity?.created_at ? new Date(identity.created_at).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : null;
  return (
    <section style={{ ...CARD, padding: 0, marginBottom: 13, overflow: 'hidden' }}>
      <div style={{ padding: '18px 20px', background: '#0b1f44', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>Account Status</div>
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
            <span style={{ padding: '5px 9px', borderRadius: 99, background: 'rgba(255,255,255,.22)', fontSize: 11, fontWeight: 850, letterSpacing: '.05em' }}>{KYC_LABEL[kyc.status] || KYC_LABEL.unsubmitted}</span>
            {since && <span style={{ fontSize: 12.5, opacity: .86 }}>Member since {since}</span>}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: mobile ? 'repeat(2,minmax(0,1fr))' : 'repeat(5,minmax(82px,1fr))', gap: 9 }}>
          {rows.map(([name, ok]) => (
            <div key={name} style={{ minHeight: 64, padding: '9px 10px', borderRadius: 8, background: 'rgba(255,255,255,.12)' }}>
              <b style={{ display: 'block', fontSize: 12 }}>{name}</b>
              <span style={{ display: 'block', marginTop: 6, fontSize: 11.5, color: ok ? '#B8F7D0' : '#FFD48A' }}>{ok ? '✓ Provided' : '△ Missing'}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function ProfileDocuments({ mobile }) {
  const { showToast } = useAppState();
  const { files } = useKycAndFiles();
  const docs = (files || []).filter((f) => DOC_LABELS[f.purpose]);
  const view = (id) => openSellerFile(id).catch((e) => showToast(e.message || 'File could not be opened', 'error'));
  if (!files) return null;
  return (
    <section style={{ ...CARD, padding: 17, marginTop: 13 }}>
      <h3 style={{ margin: 0, color: T.TEXT, fontSize: 16 }}>Documents</h3>
      <p style={{ margin: '4px 0 13px', color: T.TEXT_MUTED, fontSize: 12.5 }}>{docs.length ? `${docs.length} document${docs.length === 1 ? '' : 's'} uploaded` : 'No documents uploaded yet. Add them from the KYC page.'}</p>
      <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : 'repeat(3,minmax(0,1fr))', gap: 10 }}>
        {docs.map((f) => (
          <article key={f.id} style={{ border: `1px solid ${T.BORDER}`, borderRadius: 9, padding: 11, background: T.SURFACE_SOFT }}>
            <b style={{ display: 'block', color: T.TEXT, fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.filename}</b>
            <small style={{ display: 'block', marginTop: 4, color: T.TEXT_MUTED }}>{DOC_LABELS[f.purpose]}</small>
            <button type="button" onClick={() => view(f.id)} style={{ marginTop: 10, width: '100%', height: 30, border: 0, borderRadius: 7, color: '#fff', background: '#3877fc', fontSize: 11.5, fontWeight: 800, cursor: 'pointer' }}>View Document</button>
          </article>
        ))}
      </div>
    </section>
  );
}
