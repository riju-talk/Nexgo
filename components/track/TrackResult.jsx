'use client';

import { useEffect, useState } from 'react';

const when = (v) => (v ? new Date(v).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
const day = (v) => (v ? new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const BAD = ['ndr', 'rto', 'rto_in_transit', 'lost'];

// Shows where one parcel is. Reads the public tracking endpoint; nothing about the seller or the customer comes back.
export default function TrackResult({ awb }) {
  const [state, setState] = useState({ loading: true, data: null, error: null });
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const r = await fetch(`/v1/public/track/${encodeURIComponent(awb)}`, { headers: { accept: 'application/json' } });
        const j = await r.json().catch(() => ({}));
        if (!live) return;
        if (!r.ok) {
          const error = r.status === 404 ? 'We could not find a parcel with that tracking number. Check the number and try again.'
            : r.status === 429 ? 'Too many lookups. Please wait a minute and try again.'
              : 'Tracking is not available right now. Please try again shortly.';
          setState({ loading: false, data: null, error });
        } else setState({ loading: false, data: j, error: null });
      } catch { if (live) setState({ loading: false, data: null, error: 'Tracking is not available right now. Please try again shortly.' }); }
    })();
    return () => { live = false; };
  }, [awb]);

  if (state.loading) return <div className="tk-card" aria-busy="true">Looking up your parcel…</div>;
  if (state.error) return <div className="tk-error" role="alert">{state.error}</div>;
  const d = state.data;
  const tone = d.stateCode === 'delivered' ? 'good' : BAD.includes(d.stateCode) ? 'bad' : '';
  return (
    <>
      <div className="tk-card">
        <div className="tk-top">
          <div><small>Tracking number</small><b>{d.awb}</b></div>
          <span className={`tk-pill ${tone}`}>{d.status}</span>
        </div>
        <div className="tk-meta">
          <div><span>Carried by</span><b>{d.courier}</b></div>
          <div><span>Booked on</span><b>{day(d.bookedAt)}</b></div>
          <div><span>{d.deliveredAt ? 'Delivered on' : 'Expected by'}</span><b>{day(d.deliveredAt || d.expectedBy)}</b></div>
        </div>
      </div>
      <div className="tk-card">
        <h2 style={{ margin: '0 0 16px', fontSize: 18 }}>Journey</h2>
        {d.events.length === 0 ? <p style={{ margin: 0, color: 'var(--mute)' }}>No updates yet. The courier has not scanned this parcel.</p> : (
          <ol className="tk-steps">
            {d.events.map((e, i) => (
              <li key={`${e.at}-${i}`}>
                <b>{e.note || e.status}</b>
                <small>{when(e.at)}{e.location ? ` · ${e.location}` : ''}</small>
              </li>
            ))}
          </ol>
        )}
      </div>
    </>
  );
}
