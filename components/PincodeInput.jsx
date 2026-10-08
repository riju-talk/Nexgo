'use client';

import { usePincode } from '@/lib/usePincode';
import * as T from '@/lib/theme';

const FIELD = { width: '100%', height: 42, boxSizing: 'border-box', border: `1px solid ${T.INPUT_BORDER}`, borderRadius: 8, background: T.SURFACE, color: T.TEXT, padding: '0 34px 0 11px', fontSize: 14, outline: 'none' };

// 6-digit pincode field that shows the matched city/state (or why it could not be matched) underneath.
export default function PincodeInput({ label, value, onChange, required = true, placeholder = '6-digit pincode' }) {
  const { info, status } = usePincode(value);
  return (
    <label style={{ display: 'block', fontSize: 12.5, fontWeight: 650, color: T.TEXT_LABEL }}>
      {label}{required && <span style={{ color: T.RED }}> *</span>}
      <div style={{ position: 'relative', marginTop: 6 }}>
        <input value={value} inputMode="numeric" maxLength={6} placeholder={placeholder} onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))} style={FIELD} />
        {value && <button type="button" aria-label={`Clear ${label}`} onClick={() => onChange('')} style={{ position: 'absolute', right: 8, top: 9, width: 24, height: 24, border: 0, borderRadius: 12, background: 'transparent', color: T.TEXT_MUTED, cursor: 'pointer', fontSize: 15 }}>×</button>}
      </div>
      <small style={{ display: 'block', minHeight: 15, marginTop: 4, fontSize: 11.5, color: status === 'found' ? T.GREEN : status === 'missing' ? T.AMBER : T.TEXT_MUTED }}>
        {status === 'found' ? `${info.city}, ${info.state}${info.outOfDeliveryArea ? ' · remote area' : ''}` : status === 'missing' ? 'Not in our pincode directory' : status === 'loading' ? 'Looking up…' : ''}
      </small>
    </label>
  );
}
