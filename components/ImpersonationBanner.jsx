'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { useAppState } from '@/lib/AppStateContext';

// Shown on every seller-panel page while an admin is viewing as that seller.
export default function ImpersonationBanner() {
  const router = useRouter();
  const { showToast } = useAppState();
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { apiFetch('/v1/impersonation').then((d) => setInfo(d.active ? d : null)).catch(() => setInfo(null)); }, []);
  if (!info) return null;
  const exit = async () => {
    setBusy(true);
    try { const out = await apiFetch('/v1/impersonation/exit', { method: 'POST' }); setInfo(null); router.push(`/admin/sellers/${out.sellerId}`); }
    catch (e) { showToast(e instanceof ApiError ? e.message : 'Could not exit the seller view', 'error'); setBusy(false); }
  };
  return (
    <div role="status" style={{ flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, flexWrap: 'wrap', padding: '8px 14px', background: '#B23A2B', color: '#fff', fontSize: 13, fontWeight: 600 }}>
      <span>You are viewing as {info.sellerName} (signed in as {info.adminEmail}). Changes are made on their behalf and logged.</span>
      <button type="button" disabled={busy} onClick={exit} style={{ minHeight: 28, padding: '0 12px', borderRadius: 7, border: '1px solid #fff', background: '#fff', color: '#B23A2B', fontWeight: 700, cursor: 'pointer' }}>{busy ? 'Exiting…' : 'Exit'}</button>
    </div>
  );
}
