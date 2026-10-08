'use client';
/* eslint-disable react/jsx-key -- cell arrays are positional; each cell is keyed by its <td> when rendered */

import { useCallback, useEffect, useState } from 'react';
import { adminApi, apiFetch, ApiError } from '@/lib/api';
import { useAppState } from '@/lib/AppStateContext';
import * as T from '@/lib/theme';

const CARD = { background: 'var(--nx-surface)', border: '1px solid var(--nx-border)', borderRadius: 10, boxShadow: '0 1px 2px rgba(20,44,66,.04), 0 8px 24px rgba(20,44,66,.045)' };
const title = (v = '') => v.replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
const money = (v = 0) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Number(v) / 100);
function Button({ children, onClick, disabled, primary = false }) { return <button onClick={onClick} disabled={disabled} style={{ height: 33, padding: '0 10px', borderRadius: 8, border: `1px solid ${primary ? T.NAVY : T.INPUT_BORDER}`, color: primary ? '#fff' : T.TEXT, background: primary ? T.NAVY : T.SURFACE, fontSize: 12, fontWeight: 720, cursor: disabled ? 'wait' : 'pointer', opacity: disabled ? .6 : 1 }}>{children}</button>; }
function Pill({ children, tone = 'ok' }) { const c = tone === 'warn' ? T.AMBER : tone === 'bad' ? T.RED : T.GREEN; return <span style={{ display: 'inline-flex', padding: '4px 8px', borderRadius: 99, color: c, background: `${c}14`, fontWeight: 720, fontSize: 11.5 }}>{children}</span>; }

// Placeholder until a real bank transfer reference is captured from the payout rail.
const demoBankReference = () => `NX-DEMO-${Date.now()}`;

// Kept outside the component so a reload depends only on the screen, not on
// per-row busy state (memoizing on `busy` refetched the queue on every click).
const LOADERS = {
  'a-kyc': () => adminApi.kycQueue('pending_review'),
  'a-wallets': () => adminApi.wallets(),
  'a-cod': () => adminApi.codRemittances(),
  'a-invoices': () => adminApi.invoices(),
  'a-jobs': () => adminApi.jobs(),
  'a-audit': () => adminApi.auditEvents(),
};

export default function LiveAdminOperations({ activeId, mobile }) {
  const { showToast } = useAppState(); const [items, setItems] = useState(null); const [busy, setBusy] = useState('');
  const load = useCallback(async () => { const loader = LOADERS[activeId]; if (!loader) return; try { const x = await loader(); setItems(x.items || []); } catch { setItems([]); } }, [activeId]);
  useEffect(() => { load(); }, [load]); // eslint-disable-line react-hooks/set-state-in-effect -- async fetch on mount; state is set after the await
  const decide = async (r, decision) => { setBusy(r.seller_id); try { await adminApi.kycDecision(r.seller_id, decision, decision === 'rejected' ? 'Please review submitted business documents.' : undefined); showToast(`KYC ${decision}`); load(); } catch (e) { showToast(e instanceof ApiError ? e.message : 'KYC action failed', 'error'); } finally { setBusy(''); } };
  const cod = async (r, action) => { setBusy(r.id); try { await apiFetch(`/v1/admin/cod-remittances/${r.id}/${action}`, { method: 'POST', body: action === 'remit' ? { bankReference: demoBankReference() } : {} }); showToast(action === 'approve' ? 'COD cycle approved' : 'COD cycle marked remitted'); load(); } catch (e) { showToast(e.message || 'COD action failed', 'error'); } finally { setBusy(''); } };
  const issue = async r => { setBusy(r.id); try { await apiFetch(`/v1/admin/invoices/${r.id}/issue`, { method: 'POST', body: {} }); showToast('Invoice issued and document job queued'); load(); } catch (e) { showToast(e.message || 'Invoice could not be issued', 'error'); } finally { setBusy(''); } };
  const retry = async r => { setBusy(r.id); try { await adminApi.retryJob(r.id); showToast('Job retry queued'); load(); } catch (e) { showToast(e.message || 'Retry failed', 'error'); } finally { setBusy(''); } };
  const config = {
    'a-kyc': { title: 'KYC verification', intro: 'Review submitted seller identities and settlement details.', columns: ['Seller', 'Business identity', 'Settlement', 'Submitted', ''], cells: r => [<><b>{r.seller_name}</b><small>{r.entity_type}</small></>, <><b>{r.gstin}</b><small>{r.pan}</small></>, <><b>{r.bank_account_holder}</b><small>{r.bank_ifsc}</small></>, new Date(r.submitted_at).toLocaleString('en-IN'), <div style={{ display: 'flex', gap: 6 }}><Button primary disabled={busy === r.seller_id} onClick={() => decide(r, 'verified')}>Approve</Button><Button disabled={busy === r.seller_id} onClick={() => decide(r, 'rejected')}>Reject</Button></div>] },
    'a-wallets': { title: 'Seller wallets', intro: 'Live prepaid-wallet balances and recent financial activity across the platform.', columns: ['Seller', 'Balance', 'Entries', 'Last activity', 'Account state'], cells: r => [<b>{r.legal_name}</b>, <b style={{ color: Number(r.balance_paise) < 0 ? T.RED : T.TEXT }}>{money(r.balance_paise)}</b>, r.entry_count, r.last_activity_at ? new Date(r.last_activity_at).toLocaleString('en-IN') : 'No activity', <Pill tone={r.state === 'active' ? 'ok' : 'warn'}>{title(r.state)}</Pill>] },
    'a-cod': { title: 'COD settlements', intro: 'Review and release COD remittance cycles created from delivered shipments.', columns: ['Seller', 'Cycle', 'Shipments', 'Net remittance', 'Status', ''], cells: r => [<b>{r.seller_name}</b>, `${r.cycle_start} → ${r.cycle_end}`, r.shipment_count, money(r.net_remitted_paise), <Pill tone={r.status === 'remitted' ? 'ok' : 'warn'}>{title(r.status)}</Pill>, r.status === 'pending' ? <Button primary disabled={busy === r.id} onClick={() => cod(r, 'approve')}>Approve</Button> : r.status === 'approved' ? <Button primary disabled={busy === r.id} onClick={() => cod(r, 'remit')}>Mark remitted</Button> : null] },
    'a-invoices': { title: 'Invoices', intro: 'Issue seller shipping invoices and queue the document generation flow.', columns: ['Invoice', 'Seller', 'Period', 'Total', 'Status', ''], cells: r => [<b>{r.invoice_number}</b>, r.seller_name, `${r.period_start} → ${r.period_end}`, money(r.total_paise), <Pill tone={r.status === 'issued' ? 'ok' : 'warn'}>{title(r.status)}</Pill>, r.status === 'draft' ? <Button primary disabled={busy === r.id} onClick={() => issue(r)}>Issue</Button> : null] },
    'a-jobs': { title: 'Background jobs', intro: 'Live operational jobs queued by channel sync, documents, and integrations.', columns: ['Job', 'Seller', 'State', 'Attempts', 'Queued', ''], cells: r => [<b>{title(r.job_type)}</b>, r.seller_name || 'Platform', <Pill tone={r.state === 'failed' ? 'bad' : r.state === 'queued' ? 'warn' : 'ok'}>{title(r.state)}</Pill>, r.attempts, new Date(r.queued_at).toLocaleString('en-IN'), r.state === 'failed' ? <Button primary disabled={busy === r.id} onClick={() => retry(r)}>Retry</Button> : null] },
    'a-audit': { title: 'Audit trail', intro: 'Immutable administrative activity across sellers, couriers, finance, and access.', columns: ['When', 'Actor', 'Action', 'Target', 'Workspace'], cells: r => [new Date(r.created_at).toLocaleString('en-IN'), r.actor_name || 'System', <b>{title(r.action)}</b>, `${r.target_type || '—'} ${r.target_id ? String(r.target_id).slice(0, 8) : ''}`, r.seller_name || 'Platform'] },
  }[activeId];
  if (!config) return null;
  return <div style={{ padding: mobile ? '14px 12px 42px' : '18px 28px 48px', maxWidth: '100%' }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: 12, marginBottom: 15 }}><div><div style={{ color: T.TEXT, fontWeight: 760, fontSize: 19 }}>{config.title}</div><div style={{ color: T.TEXT_SECONDARY, marginTop: 4, fontSize: 13 }}>{config.intro}</div></div><Button onClick={load}>Refresh</Button></div>{items === null ? <div style={{ ...CARD, padding: 30, color: T.TEXT_SECONDARY }}>Loading operations…</div> : !items.length ? <div style={{ ...CARD, padding: 30, color: T.TEXT_SECONDARY }}>No records need attention right now.</div> : <div style={{ ...CARD, overflow: 'hidden' }}><div style={{ overflowX: 'auto' }}><table style={{ width: '100%', minWidth: 850, borderCollapse: 'collapse' }}><thead><tr>{config.columns.map(x => <th key={x} style={{ padding: '11px 14px', textAlign: 'left', background: T.TABLE_HEAD_BG, color: T.TEXT_MUTED, fontSize: 10.5, letterSpacing: '.07em', textTransform: 'uppercase' }}>{x}</th>)}</tr></thead><tbody>{items.map(r => <tr key={r.id || r.seller_id}>{config.cells(r).map((cell, i) => <td key={i} style={{ padding: '13px 14px', borderTop: `1px solid ${T.DIVIDER}`, color: T.TEXT_LABEL, fontSize: 13 }}>{cell}</td>)}</tr>)}</tbody></table></div></div>}</div>;
}
