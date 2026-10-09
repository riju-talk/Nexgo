'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import { useAppState } from '@/lib/AppStateContext';
import { FORMATS, saveRows } from '@/lib/exportFile';
import * as T from '@/lib/theme';
import { BLUE, Btn, CARD, FIELD, Pager, Pill, Table, dayText, inr, isoDay, kg } from './Kit';

const STATUS = { open: ['Awaiting seller', '#C2410C'], disputed: ['Needs decision', BLUE], accepted: ['Accepted by seller', '#6B7280'], won: ['Won', T.GREEN], lost: ['Lost', T.RED], withdrawn: ['Withdrawn', '#6B7280'] };
const TABS = [['', 'All'], ['disputed', 'Needs decision'], ['open', 'Awaiting seller'], ['won', 'Won'], ['lost', 'Lost'], ['accepted', 'Accepted'], ['withdrawn', 'Withdrawn']];

// Admin side of weight management: every seller's discrepancy; the admin records the courier's final decision.
export default function LiveAdminDisputes({ mobile }) {
  const { showToast } = useAppState();
  const [status, setStatus] = useState('disputed'); const [page, setPage] = useState(1); const [qInput, setQInput] = useState(''); const [q, setQ] = useState('');
  const [tick, setTick] = useState(0); const [data, setData] = useState({ key: '', items: [], total: 0, pages: 1, counts: {}, error: '' });
  const [dialog, setDialog] = useState(null); const [outcome, setOutcome] = useState('won'); const [note, setNote] = useState(''); const [busy, setBusy] = useState(false); const [format, setFormat] = useState('csv');

  useEffect(() => { const t = window.setTimeout(() => { setQ(qInput.trim()); setPage(1); }, 300); return () => window.clearTimeout(t); }, [qInput]);
  const params = useMemo(() => { const p = new URLSearchParams({ page: String(page), pageSize: '10' }); if (status) p.set('status', status); if (q) p.set('q', q); return p; }, [status, page, q]);
  const key = `${params}#${tick}`;
  useEffect(() => {
    let live = true;
    apiFetch(`/v1/admin/weight-disputes?${params}`).then((x) => { if (live) setData({ key, error: '', ...x }); })
      .catch((e) => { if (live) setData({ key, items: [], total: 0, pages: 1, counts: {}, error: e.status === 401 || e.status === 403 ? 'Sign in as a platform administrator.' : e.message || 'Disputes could not be loaded.' }); });
    return () => { live = false; };
  }, [params, key]);
  const loading = data.key !== key; const c = data.counts || {};
  const openDialog = (row) => { setDialog(row); setOutcome('won'); setNote(''); };

  const submit = async () => {
    setBusy(true);
    try { await apiFetch(`/v1/admin/weight-disputes/${dialog.id}/resolve`, { method: 'POST', body: { outcome, note: note.trim() || undefined } }); showToast(outcome === 'won' ? 'Dispute marked as won. The seller is not charged.' : `Dispute marked as lost. ${inr(dialog.additional_charge_paise)} debited from the seller wallet.`); setDialog(null); setTick((t) => t + 1); }
    catch (e) { showToast(e instanceof ApiError ? e.message : 'Could not record the decision', 'error'); } finally { setBusy(false); }
  };
  const exportAll = async () => {
    setBusy(true);
    try {
      const p = new URLSearchParams(params); p.set('pageSize', '100'); const all = [];
      for (let pg = 1; pg <= 50; pg++) { p.set('page', String(pg)); const x = await apiFetch(`/v1/admin/weight-disputes?${p}`); all.push(...x.items); if (pg >= x.pages) break; }
      if (!all.length) return showToast('Nothing to export.', 'error');
      await saveRows([['Seller', 'Order', 'AWB', 'Courier', 'Declared g', 'Billed g', 'Extra charge INR', 'Status', 'Raised', 'Respond by', 'Seller note', 'Decision note'], ...all.map((r) => [r.seller_name, r.order_number, r.awb, r.courier_name, r.declared_weight_g, r.billed_weight_g, r.additional_charge_paise / 100, r.status, dayText(r.raised_at), dayText(r.dispute_deadline), r.seller_notes || '', r.courier_notes || ''])], `weight-disputes-${isoDay()}`, format, 'Disputes');
      showToast(`Exported ${all.length} disputes`);
    } catch (e) { showToast(e.message || 'Export failed', 'error'); } finally { setBusy(false); }
  };

  return (
    <div style={{ padding: mobile ? '14px 12px 42px' : '18px 28px 48px', maxWidth: 1560, margin: '0 auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: mobile ? 'repeat(2,1fr)' : 'repeat(5,1fr)', gap: 12, marginBottom: 14 }}>
        {[['Needs decision', c.disputed?.n ?? 0, BLUE], ['Awaiting seller', c.open?.n ?? 0, '#F58220'], ['Won', c.won?.n ?? 0, T.GREEN], ['Lost', c.lost?.n ?? 0, T.RED], ['Disputed value', inr(c.disputed?.amountPaise ?? 0), '#6D28D9']].map(([l, v, col]) => <div key={l} style={{ ...CARD, padding: 14, borderTop: `3px solid ${col}`, background: 'var(--ops-surface)' }}><span style={{ fontSize: 11.5, color: T.TEXT_MUTED }}>{l}</span><b style={{ display: 'block', fontSize: 22, color: T.TEXT, marginTop: 3 }}>{v}</b></div>)}
      </div>
      <section style={{ ...CARD, background: 'var(--ops-surface)' }}>
        <div role="tablist" style={{ display: 'flex', gap: 4, padding: '4px 14px 0', borderBottom: `1px solid ${T.DIVIDER}`, overflowX: 'auto' }}>
          {TABS.map(([id, label]) => <button key={id || 'all'} role="tab" aria-selected={status === id} type="button" onClick={() => { setStatus(id); setPage(1); }} style={{ padding: '12px 14px', border: 0, borderBottom: `3px solid ${status === id ? BLUE : 'transparent'}`, background: 'transparent', color: status === id ? BLUE : T.TEXT_SECONDARY, fontWeight: status === id ? 800 : 600, fontSize: 13.5, cursor: 'pointer', whiteSpace: 'nowrap' }}>{label}</button>)}
        </div>
        <div style={{ padding: 14, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input aria-label="Search" style={{ ...FIELD, flex: '1 1 240px' }} placeholder="Search seller, AWB or order…" value={qInput} onChange={(e) => setQInput(e.target.value)} />
          <select aria-label="Export format" style={FIELD} value={format} onChange={(e) => setFormat(e.target.value)}>{FORMATS.map(([id, l]) => <option key={id} value={id}>{l}</option>)}</select><Btn onClick={exportAll} disabled={busy}>⤓ Export</Btn>
        </div>
        <Table loading={loading} error={data.error} rows={data.items} minWidth={1000} empty="No weight disputes in this view."
          columns={[
            { h: 'Seller', cell: (r) => <b>{r.seller_name}</b> }, { h: 'Order / AWB', cell: (r) => <span><b style={{ color: BLUE }}>{r.order_number}</b><small style={{ display: 'block', fontFamily: T.MONO, color: T.TEXT_MUTED }}>{r.awb}</small></span> }, { h: 'Courier', cell: (r) => r.courier_name },
            { h: 'Declared → Billed', cell: (r) => <span>{kg(r.declared_weight_g)} → <b>{kg(r.billed_weight_g)}</b></span> }, { h: 'Extra charge', cell: (r) => <b>{inr(r.additional_charge_paise)}</b> },
            { h: 'Seller note', wrap: true, cell: (r) => <span style={{ display: 'inline-block', maxWidth: 240, color: T.TEXT_SECONDARY }}>{r.seller_notes || '—'}</span> }, { h: 'Respond by', cell: (r) => dayText(r.dispute_deadline) },
            { h: 'Status', cell: (r) => { const [l, col] = STATUS[r.status] || [r.status, T.TEXT]; return <Pill color={col}>{l}</Pill>; } },
            { h: 'Action', cell: (r) => (r.status === 'disputed' ? <Btn small primary onClick={() => openDialog(r)}>Record decision</Btn> : <span style={{ color: T.TEXT_MUTED }}>—</span>) },
          ]} />
        <Pager page={page} pages={data.pages} total={data.total} pageSize={10} onPage={setPage} loading={loading} />
      </section>

      {dialog && (
        <div role="dialog" aria-modal="true" aria-label="Record courier decision" onClick={() => setDialog(null)} style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(8,16,30,.5)', display: 'grid', placeItems: 'center', padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ ...CARD, width: 'min(100%, 480px)', padding: 22, background: 'var(--ops-surface)' }}>
            <b style={{ fontSize: 17, color: T.TEXT }}>Courier decision · {dialog.order_number}</b>
            <p style={{ margin: '6px 0 14px', color: T.TEXT_SECONDARY, fontSize: 13 }}>{dialog.seller_name} · {dialog.courier_name} · extra charge {inr(dialog.additional_charge_paise)}</p>
            {[['won', 'Seller wins', 'The courier withdrew the extra charge. The seller pays nothing.'], ['lost', 'Seller loses', `The charge stands. ${inr(dialog.additional_charge_paise)} is debited from the seller wallet.`]].map(([id, t, h]) => <label key={id} style={{ display: 'flex', gap: 10, padding: '10px 12px', marginBottom: 8, borderRadius: 9, border: `1px solid ${outcome === id ? BLUE : T.BORDER}`, cursor: 'pointer' }}><input type="radio" name="outcome" checked={outcome === id} onChange={() => setOutcome(id)} style={{ marginTop: 3 }} /><span><b style={{ color: T.TEXT, fontSize: 13.5 }}>{t}</b><small style={{ display: 'block', color: T.TEXT_MUTED }}>{h}</small></span></label>)}
            <textarea style={{ ...FIELD, width: '100%', height: 70, padding: 10, resize: 'vertical', marginTop: 4 }} maxLength={1000} placeholder="Courier's response / note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
            <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', gap: 10 }}><Btn onClick={() => setDialog(null)}>Cancel</Btn><Btn primary={outcome === 'won'} danger={outcome === 'lost'} disabled={busy} onClick={submit}>{busy ? 'Saving…' : outcome === 'won' ? 'Mark as won' : 'Mark as lost and debit'}</Btn></div>
          </div>
        </div>
      )}
    </div>
  );
}
