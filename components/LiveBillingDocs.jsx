'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import { useAppState } from '@/lib/AppStateContext';
import * as T from '@/lib/theme';

// Credit notes and TDS: finance documents issued by the platform, read-only for sellers.
const CARD = { background: 'linear-gradient(165deg,var(--nx-glass-1),var(--nx-glass-2))', border: '1px solid var(--nx-glass-border)', borderRadius: 14, boxShadow: '0 12px 30px rgba(15,31,61,.07)' };
const inr = (paise) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Number(paise || 0) / 100);
const day = (v) => (v ? new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

const KINDS = {
  'credit-note': {
    path: '/v1/seller/credit-notes', heading: 'Credit notes', noun: 'credit notes',
    intro: 'Adjustments issued against your invoices. They reduce what you owe on the next billing cycle.',
    empty: 'No credit notes yet. If a charge is corrected, the credit note appears here.',
    stats: (rows) => [['Credit notes', rows.length], ['Total credited', inr(rows.reduce((s, r) => s + Number(r.total_paise), 0))], ['GST reversed', inr(rows.reduce((s, r) => s + Number(r.gst_paise), 0))]],
    columns: ['Credit note', 'Against invoice', 'Reason', 'Issued', 'Amount'],
    cells: (r) => [<b key="n" style={{ fontFamily: T.MONO }}>{r.credit_note_number}</b>, r.invoice_number || '—', r.reason, day(r.issued_at), <b key="a">{inr(r.total_paise)}</b>],
    csv: (rows) => [['Credit note', 'Invoice', 'Reason', 'Issued', 'Subtotal INR', 'GST INR', 'Total INR'], ...rows.map((r) => [r.credit_note_number, r.invoice_number || '', r.reason, day(r.issued_at), r.subtotal_paise / 100, r.gst_paise / 100, r.total_paise / 100])],
  },
  tds: {
    path: '/v1/seller/tds', heading: 'TDS', noun: 'TDS entries',
    intro: 'Tax deducted at source on your payouts, grouped by financial year and quarter for your return filing.',
    empty: 'No TDS entries yet. Deductions and their certificate references appear here once recorded.',
    stats: (rows) => [['Entries', rows.length], ['Taxable amount', inr(rows.reduce((s, r) => s + Number(r.taxable_paise), 0))], ['TDS deducted', inr(rows.reduce((s, r) => s + Number(r.tds_paise), 0))]],
    columns: ['Financial year', 'Quarter', 'Section', 'Taxable', 'Rate', 'TDS', 'Certificate'],
    cells: (r) => [<b key="f">FY {r.financial_year}</b>, `Q${r.quarter}`, r.section, inr(r.taxable_paise), `${(r.tds_rate_bps / 100).toFixed(2)}%`, <b key="t">{inr(r.tds_paise)}</b>, r.certificate_reference || 'Awaited'],
    csv: (rows) => [['Financial year', 'Quarter', 'Section', 'Taxable INR', 'Rate %', 'TDS INR', 'Certificate'], ...rows.map((r) => [r.financial_year, r.quarter, r.section, r.taxable_paise / 100, r.tds_rate_bps / 100, r.tds_paise / 100, r.certificate_reference || ''])],
  },
};

export default function LiveBillingDocs({ kind, mobile }) {
  const { nav, showToast } = useAppState();
  const cfg = KINDS[kind];
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let live = true;
    apiFetch(cfg.path).then((x) => live && (setRows(x.items || []), setError(null))).catch((e) => live && setError(e));
    return () => { live = false; };
  }, [cfg.path]);

  const stats = useMemo(() => (rows ? cfg.stats(rows) : null), [rows, cfg]);
  const pad = mobile ? '14px 12px 42px' : '18px 22px 48px';
  const unauth = error instanceof ApiError && error.status === 401;

  const exportCsv = () => {
    const text = cfg.csv(rows).map((r) => r.map((c) => `"${String(c).replaceAll('"', '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
    a.download = `${kind}.csv`; a.click(); URL.revokeObjectURL(a.href);
    showToast(`${cfg.heading} exported`);
  };

  return (
    <main style={{ padding: pad, maxWidth: 1100 }}>
      <p style={{ margin: '0 0 14px', color: T.TEXT_SECONDARY, fontSize: 13 }}>{cfg.intro}</p>
      {error ? (
        <section style={{ ...CARD, padding: 26, color: T.TEXT_SECONDARY, fontSize: 13.5 }}>{unauth ? 'Sign in to see your ' : 'Could not load your '}{cfg.noun}.{unauth && <button onClick={() => nav('login')} style={{ marginLeft: 10, border: 0, background: 'transparent', color: T.ACCENT, fontWeight: 750, cursor: 'pointer' }}>Sign in</button>}</section>
      ) : !rows ? (
        <section style={{ ...CARD, padding: 26, color: T.TEXT_MUTED, fontSize: 13 }}>Loading {cfg.noun}…</section>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : 'repeat(3,1fr)', gap: 12, marginBottom: 13 }}>
            {stats.map(([label, value]) => <section key={label} style={{ ...CARD, padding: 16 }}><span style={{ color: T.TEXT_MUTED, fontSize: 11, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase' }}>{label}</span><div style={{ marginTop: 8, color: T.TEXT, fontSize: 24, fontWeight: 760 }}>{value}</div></section>)}
          </div>
          {!rows.length ? <section style={{ ...CARD, padding: 26, color: T.TEXT_SECONDARY, fontSize: 13.5 }}>{cfg.empty}</section> : (
            <section style={{ ...CARD, overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${T.DIVIDER}` }}>
                <b style={{ color: T.TEXT, fontSize: 14 }}>{cfg.heading}</b>
                <button onClick={exportCsv} style={{ height: 32, padding: '0 11px', borderRadius: 8, border: `1px solid ${T.INPUT_BORDER}`, background: T.SURFACE, color: T.TEXT, fontWeight: 720, fontSize: 12, cursor: 'pointer' }}>Export CSV</button>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', minWidth: 680, borderCollapse: 'collapse' }}>
                  <thead><tr>{cfg.columns.map((h) => <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 10.5, letterSpacing: '.07em', color: T.TEXT_MUTED, background: T.TABLE_HEAD, textTransform: 'uppercase' }}>{h}</th>)}</tr></thead>
                  <tbody>{rows.map((r) => <tr key={r.id}>{cfg.cells(r).map((cell, i) => <td key={i} style={{ padding: '12px 14px', borderTop: `1px solid ${T.DIVIDER}`, color: T.TEXT_LABEL, fontSize: 13 }}>{cell}</td>)}</tr>)}</tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </main>
  );
}
