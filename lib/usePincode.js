'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';

const cache = new Map();

// Looks a 6-digit pincode up in the directory (city, state, zone, COD / delivery-area flags).
// status: 'idle' (not 6 digits yet) | 'loading' | 'found' | 'missing' (valid format, not in the directory).
export function usePincode(pincode) {
  const valid = /^\d{6}$/.test(pincode || '');
  const [loaded, setLoaded] = useState({ pin: '', info: null });

  useEffect(() => {
    if (!valid) return undefined;
    if (cache.has(pincode)) return undefined;
    let live = true;
    const timer = window.setTimeout(() => {
      apiFetch(`/v1/locations/pincode/${pincode}`)
        .then((info) => { cache.set(pincode, info); if (live) setLoaded({ pin: pincode, info }); })
        .catch((error) => { if (error.status === 404) cache.set(pincode, null); if (live) setLoaded({ pin: pincode, info: null }); });
    }, 200);
    return () => { live = false; window.clearTimeout(timer); };
  }, [pincode, valid]);

  if (!valid) return { info: null, status: 'idle' };
  if (cache.has(pincode)) { const info = cache.get(pincode); return { info, status: info ? 'found' : 'missing' }; }
  if (loaded.pin === pincode) return { info: loaded.info, status: loaded.info ? 'found' : 'missing' };
  return { info: null, status: 'loading' };
}
