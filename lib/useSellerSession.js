'use client';

import { useEffect, useState } from 'react';
import { apiFetch, WALLET_CHANGED_EVENT } from '@/lib/api';

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

  // The balance is read when the screen changes, right after anything that moves money (a booking, a cancellation: WALLET_CHANGED_EVENT, at most once
  // every 2 seconds), when the tab is shown again and every minute.
  useEffect(() => {
    if (!wallet) return undefined;
    let live = true; let last = 0; let timer = null;
    const read = () => { last = Date.now(); apiFetch('/v1/wallet').then((x) => live && setBalancePaise(x.balancePaise)).catch(() => live && setBalancePaise(null)); };
    const soon = () => { const wait = Math.max(0, 2000 - (Date.now() - last)); clearTimeout(timer); timer = setTimeout(read, wait); };
    const visible = () => { if (document.visibilityState === 'visible') soon(); };
    read();
    window.addEventListener(WALLET_CHANGED_EVENT, soon); document.addEventListener('visibilitychange', visible);
    const interval = setInterval(visible, 60000);
    return () => { live = false; clearTimeout(timer); clearInterval(interval); window.removeEventListener(WALLET_CHANGED_EVENT, soon); document.removeEventListener('visibilitychange', visible); };
  }, [wallet, refreshKey]);

  return { me, balance: balancePaise == null ? '—' : rupees(balancePaise) };
}
