'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePagedNav } from '@/lib/usePageNav';
import { adminApi, apiFetch } from '@/lib/api';
import { useAppState } from '@/lib/AppStateContext';
import { FORMATS, saveRows } from '@/lib/exportFile';
import * as T from '@/lib/theme';
import { BLUE, Btn, CARD, FIELD, Pagination, Pill, Table, dateTime, isoDay, titleCase } from './Kit';

// Admin > Audit trail: who did what, when, from where. Rows come from audit_events (domain rows written by each route, plus one
// "admin.write" row for every successful admin change and an entry for each admin sign-in).
const KIND = { admin: ['Admin', BLUE], seller: ['Seller', T.GREEN], api: ['API', T.AMBER], system: ['System', T.TEXT_MUTED] };

const actionLabel = (r) => (r.action === 'admin.write' ? 'Admin change' : titleCase(String(r.action).replace(/[._]/g, ' ')));
// One readable line about what happened, from the row's own details.
function detail(r) {
  const m = r.metadata || {};
  if (r.action === 'admin.write') return `${m.method} ${m.path}${m.fields?.length ? ` · fields: ${m.fields.join(', ')}` : ''}${m.ip ? ` · ${m.ip}` : ''}`;
  if (r.action === 'admin.login' || r.action === 'admin.login_failed') return `${r.target_id}${m.ip ? ` · ${m.ip}` : ''}`;
  const parts = Object.entries(m).filter(([, v]) => v !== null && v !== '' && typeof v !== 'object').slice(0, 4).map(([k, v]) => `${k}: ${v}`);
  return parts.join(' · ') || `${r.target_type} ${String(r.target_id).slice(0, 8)}`;
}

export default function AdminAuditTrail({ mobile }) {
  const { showToast } = useAppState();
  const [filters, setFilters] = useState({ action: '', actor: '', sellerId: '', from: '', to: '' });
  const [applied, setApplied] = useState(filters);
  const [sellers, setSellers] = useState([]); const [busy, setBusy] = useState(false);
  const [format, setFormat] = useState('csv');

  useEffect(() => { adminApi.sellerOptions().then((x) => setSellers(x.items || [])).catch(() => {}); }, []);

  const query = useMemo(() => { const p = new URLSearchParams(); for (const [k, v] of Object.entries(applied)) if (v) p.set(k, v); return p.toString(); }, [applied]);
  const list = usePagedNav({ path: '/v1/admin/audit-events', query, name: 'admin-audit', defaultSize: 50 });
  const rows = list.items; const error = list.message;
  // Every row that matches the filters (not just this page), 200 at a time, up to 20,000.
  const exportRows = async () => {
    if (!list.total) return showToast('Nothing to export.', 'error');
    setBusy(true);
    try {
      const all = [];
      for (let page = 1; page <= 100; page++) { const x = await apiFetch(`/v1/admin/audit-events?${query}${query ? '&' : ''}page=${page}&pageSize=200`); all.push(...(x.items || [])); if (!x.hasMore) break; }
      await saveRows([['When', 'Actor', 'Actor type', 'Role', 'Action', 'Target', 'Workspace', 'Request ID', 'Details'],
        ...all.map((r) => [r.created_at, r.actor_email || '', KIND[r.actor_kind]?.[0] || '', r.actor_role || '', r.action, `${r.target_type} ${r.target_id}`, r.seller_name || 'Platform', r.request_id || '', detail(r)])],
        `audit-trail-${isoDay()}${all.length < list.total ? `-PARTIAL-first-${all.length}` : ''}`, format, 'Audit trail');
      showToast(all.length < list.total ? `Exported the newest ${all.length.toLocaleString('en-IN')} of ${list.total.toLocaleString('en-IN')}. Use the dates to get the rest.` : `Exported ${all.length} rows`, all.length < list.total ? 'error' : 'success');
    } catch (e) { showToast(e.message || 'Export failed', 'error'); } finally { setBusy(false); }
  };
  const set = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }));
  const apply = (e) => { e.preventDefault(); setApplied(filters); };
  const clear = () => { const empty = { action: '', actor: '', sellerId: '', from: '', to: '' }; setFilters(empty); setApplied(empty); };
  const box = { ...FIELD, height: 36 };

  return (
    <div style={{ padding: mobile ? '14px 12px 42px' : '18px 28px 48px', display: 'grid', gap: 14 }}>
      <div><div style={{ color: T.TEXT, fontWeight: 760, fontSize: 19 }}>Audit trail</div><div style={{ color: T.TEXT_SECONDARY, marginTop: 4, fontSize: 13 }}>Every sign-in and every change made by an admin, a seller or the system: who, what, when and from where. Rows cannot be edited.</div></div>
      <form onSubmit={apply} style={{ ...CARD, padding: 12, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <input aria-label="Action contains" placeholder="Action contains (e.g. booked, rate_card)" value={filters.action} onChange={set('action')} style={{ ...box, width: 230 }} />
        <input aria-label="Actor e-mail contains" placeholder="Actor e-mail" value={filters.actor} onChange={set('actor')} style={{ ...box, width: 190 }} />
        <select aria-label="Seller" value={filters.sellerId} onChange={set('sellerId')} style={box}><option value="">All workspaces</option>{sellers.map((s) => <option key={s.id} value={s.id}>{s.legal_name || s.name}</option>)}</select>
        <input aria-label="From date" type="date" value={filters.from} onChange={set('from')} style={box} />to<input aria-label="To date" type="date" value={filters.to} onChange={set('to')} style={box} />
        <Btn primary type="submit">Apply</Btn><Btn onClick={clear}>Clear</Btn>
        <span style={{ flex: 1 }} />
        <select aria-label="Export format" value={format} onChange={(e) => setFormat(e.target.value)} style={box}>{FORMATS.map(([id, l]) => <option key={id} value={id}>{l}</option>)}</select>
        <Btn onClick={exportRows} loading={busy}>Export</Btn>
      </form>
      <section style={{ ...CARD, overflow: 'hidden' }}>
        <Table loading={list.loading && !rows.length} error={error} rows={rows} rowKey={(r) => r.id} empty="No audit rows match these filters." minWidth={980} columns={[
          { h: 'When', cell: (r) => <span title={r.created_at}>{dateTime(r.created_at)}</span> },
          { h: 'Actor', cell: (r) => { const [label, color] = KIND[r.actor_kind] || KIND.system; return <span style={{ display: 'grid', gap: 3 }}><b style={{ color: T.TEXT, fontSize: 13 }}>{r.actor_email || (r.actor_kind === 'api' ? 'Admin API' : 'System')}</b><span><Pill color={color}>{label}{r.actor_role ? ` · ${titleCase(r.actor_role)}` : ''}</Pill></span></span>; } },
          { h: 'Action', cell: (r) => <b>{actionLabel(r)}</b> },
          { h: 'Details', wrap: true, cell: (r) => <span style={{ color: T.TEXT_SECONDARY, fontSize: 12.5, wordBreak: 'break-word' }}>{detail(r)}</span> },
          { h: 'Workspace', cell: (r) => r.seller_name || 'Platform' },
          { h: 'Request', cell: (r) => <code title={r.request_id} style={{ fontSize: 11.5, color: T.TEXT_MUTED }}>{String(r.request_id || '').slice(0, 10)}</code> },
        ]} />
        <Pagination page={list.page} pages={list.pages} size={list.size} total={list.total} loading={list.loading && !rows.length} onPage={list.setPage} onSize={list.setSize} noun="events" />
      </section>
    </div>
  );
}
