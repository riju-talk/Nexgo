'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import { useAppState } from '@/lib/AppStateContext';
import * as T from '@/lib/theme';

const CARD = { background: 'var(--nx-surface)', border: '1px solid var(--nx-border)', borderRadius: 10, boxShadow: '0 1px 2px rgba(20,44,66,.04), 0 8px 24px rgba(20,44,66,.045)' };
const field = { width: '100%', height: 41, boxSizing: 'border-box', border: `1px solid ${T.INPUT_BORDER}`, borderRadius: 8, background: T.SURFACE, color: T.TEXT, padding: '0 11px', fontSize: 13 };
const title = (value = '') => value.replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase());

function Button({ children, onClick, primary, disabled }) { return <button disabled={disabled} onClick={onClick} style={{ height: 35, padding: '0 11px', border: `1px solid ${primary ? T.NAVY : T.INPUT_BORDER}`, borderRadius: 8, background: primary ? T.NAVY : T.SURFACE, color: primary ? '#fff' : T.TEXT, fontWeight: 720, fontSize: 12, cursor: disabled ? 'wait' : 'pointer', opacity: disabled ? .58 : 1 }}>{children}</button>; }

export default function LiveMarketing({ channel, mobile }) {
  const { showToast } = useAppState();
  const [items, setItems] = useState([]); const [busy, setBusy] = useState(false); const [queueing, setQueueing] = useState('');
  const [form, setForm] = useState({ name: '', audience: channel === 'whatsapp' ? 'Recent COD customers' : 'Recent purchasers', message: '' });
  const load = useCallback(() => apiFetch(`/v1/marketing/campaigns?channel=${channel}`).then(x => setItems(x.items || [])).catch(() => setItems([])), [channel]);
  useEffect(() => { load(); }, [load]);
  const save = async (event) => { event.preventDefault(); setBusy(true); try { await apiFetch('/v1/marketing/campaigns', { method: 'POST', body: { channel, ...form } }); setForm({ name: '', audience: channel === 'whatsapp' ? 'Recent COD customers' : 'Recent purchasers', message: '' }); showToast('Campaign saved as a draft'); load(); } catch (error) { showToast(error instanceof ApiError ? error.message : 'Campaign could not be saved', 'error'); } finally { setBusy(false); } };
  const queue = async (id) => { setQueueing(id); try { const result = await apiFetch(`/v1/marketing/campaigns/${id}/queue`, { method: 'POST' }); showToast(`Campaign queued as job ${String(result.jobId).slice(0, 8)}`); load(); } catch (error) { showToast(error instanceof ApiError ? error.message : 'Campaign could not be queued', 'error'); } finally { setQueueing(''); } };
  const label = channel === 'whatsapp' ? 'WhatsApp' : 'Email';
  const accent = channel === 'whatsapp' ? T.GREEN : T.ACCENT;
  return <main style={{ padding: mobile ? '14px 12px 42px' : '18px 22px 48px', maxWidth: 1080 }}>
    <div style={{ marginBottom: 15 }}><h2 style={{ margin: 0, color: T.TEXT, fontSize: 19 }}>{label} marketing</h2><p style={{ margin: '5px 0 0', color: T.TEXT_SECONDARY, fontSize: 13 }}>Create a campaign, keep it as a draft, then queue it through the workspace job system. Provider delivery is connected once your {label} credentials are configured.</p></div>
    <form onSubmit={save} style={{ ...CARD, padding: 17, marginBottom: 14 }}><div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : '1fr 1fr', gap: 10 }}><label style={{ color: T.TEXT_LABEL, fontSize: 12, fontWeight: 650 }}>Campaign name<input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder={`${label} September offer`} style={{ ...field, marginTop: 5 }} /></label><label style={{ color: T.TEXT_LABEL, fontSize: 12, fontWeight: 650 }}>Audience<input required value={form.audience} onChange={e => setForm({ ...form, audience: e.target.value })} style={{ ...field, marginTop: 5 }} /></label></div><label style={{ display: 'block', marginTop: 10, color: T.TEXT_LABEL, fontSize: 12, fontWeight: 650 }}>Message<textarea required value={form.message} onChange={e => setForm({ ...form, message: e.target.value })} placeholder={channel === 'whatsapp' ? 'Your order is on its way. Track it from your NEXGO portal.' : 'Your latest order and delivery updates are ready in NEXGO.'} style={{ ...field, height: 100, padding: '10px 11px', marginTop: 5, resize: 'vertical' }} /></label><div style={{ marginTop: 13 }}><Button primary disabled={busy}>{busy ? 'Saving…' : 'Save draft'}</Button></div></form>
    <section style={{ ...CARD, overflow: 'hidden' }}><div style={{ padding: '14px 16px', borderBottom: `1px solid ${T.DIVIDER}`, color: T.TEXT, fontSize: 14, fontWeight: 760 }}>Campaigns</div>{items.length ? items.map(item => <div key={item.id} style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderBottom: `1px solid ${T.DIVIDER}`, flexWrap: 'wrap' }}><div><b style={{ color: T.TEXT, fontSize: 13.5 }}>{item.name}</b><span style={{ marginLeft: 8, padding: '3px 7px', borderRadius: 99, color: item.state === 'draft' ? T.AMBER : accent, background: item.state === 'draft' ? `${T.AMBER}14` : `${accent}14`, fontSize: 10.5, fontWeight: 800 }}>{title(item.state)}</span><small style={{ display: 'block', color: T.TEXT_MUTED, marginTop: 4 }}>{item.audience} · {new Date(item.created_at).toLocaleString('en-IN')}</small></div>{item.state === 'draft' ? <Button primary disabled={queueing === item.id} onClick={() => queue(item.id)}>{queueing === item.id ? 'Queueing…' : 'Queue send'}</Button> : <span style={{ color: T.TEXT_MUTED, fontSize: 12 }}>Job is queued for delivery</span>}</div>) : <div style={{ padding: 28, color: T.TEXT_MUTED, fontSize: 13 }}>No {label.toLowerCase()} campaigns yet. Create the first draft above.</div>}</section>
  </main>;
}
