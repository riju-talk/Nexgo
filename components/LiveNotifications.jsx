'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { useAppState } from '@/lib/AppStateContext';
import { clearCached, useLiveQuery } from '@/lib/queryCache';
import { GROUPS, KINDS, NOTIFICATIONS_CHANGED, notificationsChanged, timeAgo } from '@/lib/notificationKinds';
import * as T from '@/lib/theme';
import { BLUE, Btn, CARD, Pager } from './Kit';

const PAGE_SIZE = 20;

// Notifications: what happened to your parcels, wallet and account, in one place. Unread ones are marked; opening one takes you to the screen it is about.
export default function LiveNotifications({ mobile }) {
  const { nav, showToast } = useAppState();
  const [group, setGroup] = useState('all'); const [page, setPage] = useState(1); const [busy, setBusy] = useState(false);
  const qs = useMemo(() => {
    const p = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (group === 'unread') p.set('unread', '1');
    else if (group !== 'all') p.set('group', group);
    return p;
  }, [group, page]);
  const url = `/v1/notifications?${qs.toString()}`;
  const { data, error, loading, refresh } = useLiveQuery(url, { every: 30000 });
  const items = data?.items || [];
  useEffect(() => { window.addEventListener(NOTIFICATIONS_CHANGED, refresh); return () => window.removeEventListener(NOTIFICATIONS_CHANGED, refresh); }, [refresh]);

  const markRead = async (body) => {
    await apiFetch('/v1/notifications/read', { method: 'POST', body });
    clearCached('/v1/notifications'); refresh(); notificationsChanged();
  };
  const open = async (n) => {
    if (!n.read_at) { try { await markRead({ ids: [n.id] }); } catch { /* opening still works */ } }
    if (n.screen) nav(n.screen);
  };
  const markAll = async () => {
    setBusy(true);
    try { await markRead({ all: true }); showToast('All notifications marked as read'); } catch (e) { showToast(e.message || 'Could not mark as read', 'error'); } finally { setBusy(false); }
  };

  return (
    <div style={{ padding: mobile ? '14px 12px 42px' : '18px 28px 48px', display: 'grid', gap: 14, maxWidth: 980 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ color: T.TEXT, fontWeight: 760, fontSize: 19 }}>Notifications{data?.unread ? <span style={{ marginLeft: 10, fontSize: 12.5, fontWeight: 700, color: '#fff', background: '#E83D57', borderRadius: 10, padding: '2px 9px', verticalAlign: 'middle' }}>{data.unread} new</span> : null}</div>
          <div style={{ color: T.TEXT_SECONDARY, marginTop: 4, fontSize: 13 }}>Deliveries, returns, failed delivery attempts, missed pickups, wallet and payout updates, and answers to your support requests.</div>
        </div>
        <Btn loading={busy} disabled={!data?.unread} onClick={markAll}>Mark all as read</Btn>
      </div>

      <section style={{ ...CARD, overflow: 'hidden' }}>
        <div role="tablist" style={{ display: 'flex', gap: 4, padding: '8px 10px 0', borderBottom: `1px solid ${T.DIVIDER}`, overflowX: 'auto' }}>
          {GROUPS.map(([id, label]) => (
            <button key={id} role="tab" aria-selected={group === id} type="button" onClick={() => { setGroup(id); setPage(1); }} style={{ border: 0, background: 'transparent', padding: '9px 12px', cursor: 'pointer', fontSize: 13, fontWeight: group === id ? 750 : 600, color: group === id ? BLUE : T.TEXT_SECONDARY, borderBottom: `2px solid ${group === id ? BLUE : 'transparent'}`, whiteSpace: 'nowrap' }}>{label}</button>
          ))}
        </div>

        {error && !data && <div role="alert" style={{ padding: 22, color: T.RED, fontSize: 13 }}>Notifications could not be loaded. <button type="button" onClick={refresh} style={{ border: 0, background: 'transparent', color: BLUE, fontWeight: 700, cursor: 'pointer' }}>Try again</button></div>}
        {loading && !data && <div style={{ padding: 22 }}>{[0, 1, 2].map((i) => <div key={i} aria-hidden style={{ height: 52, borderRadius: 8, background: 'var(--nx-divider)', opacity: 0.6, marginBottom: 10 }} />)}</div>}
        {data && !items.length && (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: T.TEXT_SECONDARY, fontSize: 13.5 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: T.TEXT, marginBottom: 6 }}>{group === 'unread' ? 'You are all caught up' : 'Nothing here yet'}</div>
            {group === 'unread' ? 'There are no unread notifications.' : 'Updates about your shipments, wallet and account will appear here as they happen.'}
          </div>
        )}
        {items.map((n) => {
          const k = KINDS[n.kind] || KINDS.system; const unread = !n.read_at;
          return (
            <button key={n.id} type="button" onClick={() => open(n)} style={{ display: 'flex', gap: 14, alignItems: 'flex-start', width: '100%', textAlign: 'left', border: 0, borderBottom: `1px solid ${T.DIVIDER}`, background: unread ? 'rgba(56,119,252,.05)' : 'transparent', padding: '14px 18px', cursor: 'pointer', font: 'inherit' }}>
              <span aria-hidden style={{ width: 9, height: 9, borderRadius: '50%', background: unread ? '#E83D57' : 'transparent', border: unread ? 0 : `1px solid ${T.BORDER}`, flex: '0 0 9px', marginTop: 6 }} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <b style={{ fontSize: 14, color: T.TEXT, fontWeight: unread ? 750 : 600 }}>{n.title}</b>
                  <span style={{ fontSize: 11, fontWeight: 700, color: k.color, border: `1px solid ${k.color}44`, borderRadius: 20, padding: '1px 8px' }}>{k.label}</span>
                </span>
                {n.body && <span style={{ display: 'block', marginTop: 4, fontSize: 13, color: T.TEXT_SECONDARY, lineHeight: 1.5 }}>{n.body}</span>}
              </span>
              <span style={{ flex: '0 0 auto', fontSize: 12, color: T.TEXT_MUTED, whiteSpace: 'nowrap' }}>{timeAgo(n.created_at)}</span>
            </button>
          );
        })}
        {data && data.total > PAGE_SIZE && <Pager page={page} pages={data.pages} total={data.total} pageSize={PAGE_SIZE} onPage={setPage} loading={loading} />}
      </section>
    </div>
  );
}
