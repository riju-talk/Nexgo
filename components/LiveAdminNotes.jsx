'use client';

import { useEffect, useState } from 'react';
import { adminApi, apiFetch, ApiError } from '@/lib/api';
import { useAppState } from '@/lib/AppStateContext';
import * as T from '@/lib/theme';
import { BLUE, Btn, CARD, FIELD, Table, dayText, inr } from './Kit';

const GST_BPS = 1800;
const rupeesToPaise = (v) => Math.round((Number(v) || 0) * 100);
const currentFy = () => { const d = new Date(); const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1; return `${String(y).slice(2)}-${String(y + 1).slice(2)}`; };
const Label = ({ children }) => <span style={{ display: 'block', fontSize: 12.5, fontWeight: 650, color: T.TEXT_LABEL, marginBottom: 6 }}>{children}</span>;

// Admin side of billing documents: sellers only read credit notes and TDS entries; they are issued here.
export default function LiveAdminNotes({ mobile }) {
  const { showToast } = useAppState();
  const [sellers, setSellers] = useState([]); const [invoices, setInvoices] = useState([]);
  const [notes, setNotes] = useState(null); const [tds, setTds] = useState(null); const [error, setError] = useState('');
  const [cn, setCn] = useState({ sellerId: '', invoiceId: '', reason: '', amount: '' }); const [td, setTd] = useState({ sellerId: '', fy: currentFy(), quarter: '1', section: '194C', taxable: '', rate: '1', cert: '' });
  const [busy, setBusy] = useState('');

  const [tick, setTick] = useState(0);
  const load = () => setTick((t) => t + 1);
  useEffect(() => {
    let live = true;
    Promise.all([apiFetch('/v1/admin/credit-notes'), apiFetch('/v1/admin/tds')])
      .then(([a, b]) => { if (live) { setNotes(a.items); setTds(b.items); setError(''); } })
      .catch((e) => { if (live) { setNotes([]); setTds([]); setError(e.status === 401 || e.status === 403 ? 'Sign in as a platform administrator.' : e.message || 'Documents could not be loaded.'); } });
    return () => { live = false; };
  }, [tick]);
  useEffect(() => { let live = true; adminApi.sellers({ limit: '100' }).then((x) => { if (live) setSellers(x.items || []); }).catch(() => {}); return () => { live = false; }; }, []);
  useEffect(() => { if (!cn.sellerId) return; let live = true; adminApi.invoices({ sellerId: cn.sellerId }).then((x) => { if (live) setInvoices(x.items || []); }).catch(() => { if (live) setInvoices([]); }); return () => { live = false; }; }, [cn.sellerId]);

  const subtotal = rupeesToPaise(cn.amount); const gst = Math.floor((subtotal * GST_BPS) / 10_000);
  const taxable = rupeesToPaise(td.taxable); const tdsAmount = Math.floor((taxable * Math.round(Number(td.rate) * 100)) / 10_000);
  const cnOk = cn.sellerId && cn.reason.trim().length >= 3 && subtotal > 0;
  const tdOk = td.sellerId && /^\d{2}-\d{2}$/.test(td.fy) && taxable > 0 && Number(td.rate) >= 0 && Number(td.rate) <= 100;

  const issueCn = async (e) => { e.preventDefault(); if (!cnOk) return; setBusy('cn'); try { const r = await apiFetch('/v1/admin/credit-notes', { method: 'POST', body: { sellerId: cn.sellerId, invoiceId: cn.invoiceId || undefined, reason: cn.reason.trim(), subtotalPaise: subtotal } }); showToast(`Credit note ${r.credit_note_number || ''} issued`); setCn({ ...cn, invoiceId: '', reason: '', amount: '' }); load(); } catch (x) { showToast(x instanceof ApiError ? x.message : 'Credit note could not be issued', 'error'); } finally { setBusy(''); } };
  const issueTds = async (e) => { e.preventDefault(); if (!tdOk) return; setBusy('tds'); try { await apiFetch('/v1/admin/tds', { method: 'POST', body: { sellerId: td.sellerId, financialYear: td.fy, quarter: Number(td.quarter), section: td.section.trim() || '194C', taxablePaise: taxable, rateBps: Math.round(Number(td.rate) * 100), certificateReference: td.cert.trim() || undefined } }); showToast('TDS entry recorded'); setTd({ ...td, taxable: '', cert: '' }); load(); } catch (x) { showToast(x instanceof ApiError ? x.message : 'TDS entry could not be recorded', 'error'); } finally { setBusy(''); } };

  const sellerSelect = (value, onChange) => <select style={{ ...FIELD, width: '100%', height: 42 }} value={value} onChange={onChange}><option value="">Select seller…</option>{sellers.map((s) => <option key={s.id} value={s.id}>{s.legal_name}</option>)}</select>;
  const two = mobile ? '1fr' : '1fr 1fr';
  return (
    <div style={{ padding: mobile ? '14px 12px 42px' : '18px 28px 48px', maxWidth: 1560, margin: '0 auto', display: 'grid', gap: 16 }}>
      {error && <div style={{ ...CARD, padding: 14, color: T.RED }}>{error}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : '1fr 1fr', gap: 16, alignItems: 'start' }}>
        <form onSubmit={issueCn} style={{ ...CARD, padding: 18, background: 'var(--ops-surface)' }}>
          <b style={{ color: T.TEXT, fontSize: 15.5 }}>Issue a credit note</b><small style={{ display: 'block', color: T.TEXT_MUTED, margin: '3px 0 14px' }}>Reduces what the seller owes. GST at 18% is added automatically.</small>
          <div style={{ display: 'grid', gridTemplateColumns: two, gap: 12 }}>
            <label><Label>Seller</Label>{sellerSelect(cn.sellerId, (e) => setCn({ ...cn, sellerId: e.target.value, invoiceId: '' }))}</label>
            <label><Label>Against invoice (optional)</Label><select style={{ ...FIELD, width: '100%', height: 42 }} value={cn.invoiceId} disabled={!cn.sellerId} onChange={(e) => setCn({ ...cn, invoiceId: e.target.value })}><option value="">None</option>{invoices.map((i) => <option key={i.id} value={i.id}>{i.invoice_number}</option>)}</select></label>
            <label><Label>Amount before GST (₹)</Label><input style={{ ...FIELD, width: '100%', height: 42 }} type="number" min="0.01" step="0.01" value={cn.amount} onChange={(e) => setCn({ ...cn, amount: e.target.value })} /></label>
            <label><Label>Reason</Label><input style={{ ...FIELD, width: '100%', height: 42 }} maxLength={500} value={cn.reason} onChange={(e) => setCn({ ...cn, reason: e.target.value })} placeholder="e.g. Weight dispute reversal" /></label>
          </div>
          <div style={{ marginTop: 12, fontSize: 13, color: T.TEXT_SECONDARY }}>GST {inr(gst)} · Total credit <b style={{ color: T.TEXT }}>{inr(subtotal + gst)}</b></div>
          <div style={{ marginTop: 14 }}><Btn primary type="submit" disabled={!cnOk || busy === 'cn'}>{busy === 'cn' ? 'Issuing…' : 'Issue credit note'}</Btn></div>
        </form>

        <form onSubmit={issueTds} style={{ ...CARD, padding: 18, background: 'var(--ops-surface)' }}>
          <b style={{ color: T.TEXT, fontSize: 15.5 }}>Record a TDS entry</b><small style={{ display: 'block', color: T.TEXT_MUTED, margin: '3px 0 14px' }}>Tax deducted at source on a seller payout, shown to the seller by financial year and quarter.</small>
          <div style={{ display: 'grid', gridTemplateColumns: two, gap: 12 }}>
            <label><Label>Seller</Label>{sellerSelect(td.sellerId, (e) => setTd({ ...td, sellerId: e.target.value }))}</label>
            <label><Label>Financial year (YY-YY)</Label><input style={{ ...FIELD, width: '100%', height: 42 }} value={td.fy} maxLength={5} onChange={(e) => setTd({ ...td, fy: e.target.value })} placeholder="26-27" /></label>
            <label><Label>Quarter</Label><select style={{ ...FIELD, width: '100%', height: 42 }} value={td.quarter} onChange={(e) => setTd({ ...td, quarter: e.target.value })}>{[1, 2, 3, 4].map((q) => <option key={q} value={q}>Q{q}</option>)}</select></label>
            <label><Label>Section</Label><input style={{ ...FIELD, width: '100%', height: 42 }} value={td.section} maxLength={10} onChange={(e) => setTd({ ...td, section: e.target.value })} /></label>
            <label><Label>Taxable amount (₹)</Label><input style={{ ...FIELD, width: '100%', height: 42 }} type="number" min="0.01" step="0.01" value={td.taxable} onChange={(e) => setTd({ ...td, taxable: e.target.value })} /></label>
            <label><Label>TDS rate (%)</Label><input style={{ ...FIELD, width: '100%', height: 42 }} type="number" min="0" max="100" step="0.01" value={td.rate} onChange={(e) => setTd({ ...td, rate: e.target.value })} /></label>
            <label style={{ gridColumn: mobile ? undefined : '1 / -1' }}><Label>Certificate reference (optional)</Label><input style={{ ...FIELD, width: '100%', height: 42 }} maxLength={60} value={td.cert} onChange={(e) => setTd({ ...td, cert: e.target.value })} /></label>
          </div>
          <div style={{ marginTop: 12, fontSize: 13, color: T.TEXT_SECONDARY }}>TDS deducted <b style={{ color: T.TEXT }}>{inr(tdsAmount)}</b></div>
          <div style={{ marginTop: 14 }}><Btn primary type="submit" disabled={!tdOk || busy === 'tds'}>{busy === 'tds' ? 'Saving…' : 'Record TDS'}</Btn></div>
        </form>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : '1fr 1fr', gap: 16, alignItems: 'start' }}>
        <section style={{ ...CARD, overflow: 'hidden', background: 'var(--ops-surface)' }}><div style={{ padding: '13px 16px', borderBottom: `1px solid ${T.DIVIDER}` }}><b style={{ color: T.TEXT }}>Recent credit notes</b></div>
          <Table loading={notes === null} rows={notes || []} minWidth={520} empty="No credit notes issued yet." columns={[{ h: 'Credit note', cell: (r) => <b style={{ fontFamily: T.MONO }}>{r.credit_note_number}</b> }, { h: 'Seller', cell: (r) => r.seller_name }, { h: 'Issued', cell: (r) => dayText(r.issued_at) }, { h: 'Total', cell: (r) => <b>{inr(r.total_paise)}</b> }]} /></section>
        <section style={{ ...CARD, overflow: 'hidden', background: 'var(--ops-surface)' }}><div style={{ padding: '13px 16px', borderBottom: `1px solid ${T.DIVIDER}` }}><b style={{ color: T.TEXT }}>Recent TDS entries</b></div>
          <Table loading={tds === null} rows={tds || []} minWidth={520} empty="No TDS entries recorded yet." columns={[{ h: 'Seller', cell: (r) => r.seller_name }, { h: 'FY / Qtr', cell: (r) => `FY ${r.financial_year} · Q${r.quarter}` }, { h: 'Section', cell: (r) => r.section }, { h: 'TDS', cell: (r) => <b>{inr(r.tds_paise)}</b> }]} /></section>
      </div>
    </div>
  );
}
