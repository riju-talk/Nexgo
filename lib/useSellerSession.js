'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';

const rupees = (paise) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Number(paise) / 100);

export const initialsOf = (name = '') => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';

// Real identity + wallet balance for the app chrome. `refreshKey` (the active screen) re-reads
// the balance after a booking or recharge. Failures leave placeholders instead of fake data.
export function useSellerSession({ wallet = false, refreshKey } = {}) {
  const [me, setMe] = useState(null);
  const [balancePaise, setBalancePaise] = useState(null);

  useEffect(() => {
    let live = true;
    apiFetch('/v1/seller/me').then((x) => live && setMe(x)).catch(() => live && setMe(null));
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (!wallet) return undefined;
    let live = true;
    apiFetch('/v1/wallet').then((x) => live && setBalancePaise(x.balancePaise)).catch(() => live && setBalancePaise(null));
    return () => { live = false; };
  }, [wallet, refreshKey]);

  return { me, balance: balancePaise == null ? '—' : rupees(balancePaise) };
}
