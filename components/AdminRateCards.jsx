'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { adminApi, ApiError } from '@/lib/api';

const CARD = { background: 'var(--ops-surface)', border: '1px solid var(--ops-border)', borderRadius: 12, boxShadow: 'var(--ops-shadow)' };
const FIELD = { height: 36, boxSizing: 'border-box', border: '1px solid var(--ops-border)', borderRadius: 8, padding: '0 10px', background: 'var(--ops-surface)', color: 'var(--ops-text)', fontSize: 13 };
const dateOnly = (v) => (v ? new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '');
const TH = { padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 760, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--ops-muted)', background: 'var(--ops-surface-2, #f6f8fc)' };
const TD = { padding: '12px 14px', borderTop: '1px solid var(--ops-border)', fontSize: 13, verticalAlign: 'middle' };

function Btn({ children, onClick, primary }) {
  return <button type="button" onClick={onClick} style={{ minHeight: 34, padding: '0 13px', borderRadius: 8, border: primary ? '1px solid var(--ac, #3877fc)' : '1px solid var(--ops-border)', background: primary ? 'var(--ac, #3877fc)' : 'var(--ops-surface)', color: primary ? '#fff' : 'var(--ops-heading)', fontSize: 12.5, fontWeight: 720, cursor: 'pointer', whiteSpace: 'nowrap' }}>{children}</button>;
}

// Admin > Couriers > Rate cards: every seller, the rate card they have now, and the two separate actions (assign rates / view the card).
export default function AdminRateCards({ mobile }) {
  const router = useRouter();
  const [q, setQ] = useState(''); const [qLive, setQLive] = useState('');
  const [rows, setRows] = useState(null); const [error, setError] = useState(null);
  useEffect(() => { const t = setTimeout(() => setQLive(q.trim()), 300); return () => clearTimeout(t); }, [q]);
  const load = useCallback(async () => {
    setError(null);
    try { setRows((await adminApi.rateCardOverview(qLive)).items || []); } catch (e) { setError(e); }
  }, [qLive]);
  useEffect(() => { load(); }, [load]); // eslint-disable-line react-hooks/set-state-in-effect -- async fetch; state is set after the await

  const unauth = error instanceof ApiError && error.status === 401;
  return (
    <div style={{ padding: mobile ? '14px 12px 42px' : '18px 28px 48px' }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
        <input aria-label="Search sellers" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search seller name or Nexgo code" style={{ ...FIELD, width: mobile ? '100%' : 300 }} />
        <span style={{ color: 'var(--ops-muted)', fontSize: 13 }}>{rows ? `${rows.length} seller${rows.length === 1 ? '' : 's'}` : 'Loading sellers'}</span>
      </div>
      {error ? <div style={{ ...CARD, padding: 28, color: 'var(--ops-muted)', fontSize: 13.5 }}>{unauth ? 'Sign in as a platform administrator to manage rate cards.' : 'Rate cards could not be loaded. Try again.'}</div> : !rows ? <div style={{ ...CARD, padding: 28, color: 'var(--ops-muted)' }}>Loading…</div> : !rows.length ? <div style={{ ...CARD, padding: 28, color: 'var(--ops-muted)' }}>No seller matches this search.</div> : (
        <div style={{ ...CARD, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: 820, borderCollapse: 'collapse' }}>
              <thead><tr>{['Seller', 'Nexgo code', 'Rate card', 'Couriers priced', 'Actions'].map((h) => <th key={h} style={TH}>{h}</th>)}</tr></thead>
              <tbody>{rows.map((r) => (
                <tr key={r.id}>
                  <td style={TD}><b style={{ color: 'var(--ops-heading)' }}>{r.legal_name}</b></td>
                  <td style={{ ...TD, fontFamily: 'var(--font-mono, ui-monospace, monospace)', fontWeight: 700 }}>{r.nexgo_code}</td>
                  <td style={TD}>{r.card_id ? <><b>{r.card_name}</b><div style={{ color: 'var(--ops-muted)', fontSize: 12 }}>since {dateOnly(r.effective_from)} · {r.services} service{r.services === 1 ? '' : 's'}</div></> : <span style={{ color: '#9B6500', fontWeight: 700 }}>No rate card assigned</span>}</td>
                  <td style={TD}>{r.couriers?.length ? <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{r.couriers.map((c) => <span key={c} style={{ border: '1px solid var(--ops-border)', borderRadius: 99, padding: '2px 9px', fontSize: 12 }}>{c}</span>)}</div> : <span style={{ color: 'var(--ops-muted)' }}>None</span>}</td>
                  <td style={TD}><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><Btn primary onClick={() => router.push(`/admin/rate-cards/${r.id}/assign`)}>Assign courier &amp; rates</Btn><Btn onClick={() => router.push(`/admin/rate-cards/${r.id}`)}>View rate card</Btn></div></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
