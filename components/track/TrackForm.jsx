'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

// The tracking-number box shared by /track and /track/<awb>.
export default function TrackForm({ initial = '' }) {
  const router = useRouter();
  const [awb, setAwb] = useState(initial);
  const go = (e) => {
    e.preventDefault();
    const v = awb.trim().replace(/\s+/g, '');
    if (v) router.push(`/track/${encodeURIComponent(v)}`);
  };
  return (
    <form className="tk-form" onSubmit={go} role="search">
      <input value={awb} onChange={(e) => setAwb(e.target.value)} placeholder="Enter your tracking number (AWB)" aria-label="Tracking number" autoComplete="off" inputMode="text" maxLength={40} />
      <button type="submit">Track parcel</button>
    </form>
  );
}
