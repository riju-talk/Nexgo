'use client';

import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import { useAppState } from '@/lib/AppStateContext';
import * as T from '@/lib/theme';

const CARD = { background: 'linear-gradient(165deg,var(--nx-glass-1),var(--nx-glass-2))', backdropFilter: 'blur(18px)', border: '1px solid var(--nx-glass-border)', borderRadius: 14, boxShadow: '0 12px 30px rgba(15,31,61,.07)' };
const inr = (paise) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Number(paise || 0) / 100);
const date = (v) => (v ? new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const title = (v = '') => String(v).replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const CREDIT = new Set(['credit', 'release']);

function Pill({ children, tone }) {
  const c = tone === 'ok' ? T.GREEN : tone === 'bad' ? T.RED : T.AMBER;
  return <span style={{ display: 'inline-flex', padding: '3px 8px', borderRadius: 99, color: c, background: `${c}14`, fontWeight: 720, fontSize: 11.5 }}>{children}</span>;
}

function Panel({ heading, count, onViewAll, columns, rows, empty, mobile }) {
  return (
    <section style={{ ...CARD, overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: mobile ? '13px 14px' : '14px 18px', borderBottom: `1px solid ${T.DIVIDER}` }}>
        <b style={{ color: T.TEXT, fontSize: 14.5 }}>{heading}{count != null && <span style={{ marginLeft: 8, color: T.TEXT_MUTED, fontWeight: 600, fontSize: 12.5 }}>{count}</span>}</b>
        {onViewAll && <button onClick={onViewAll} style={{ border: 0, background: 'transparent', color: T.ACCENT, fontWeight: 750, fontSize: 12.5, cursor: 'pointer' }}>View all →</button>}
      </div>
      {!rows.length ? <div style={{ padding: '22px 18px', color: T.TEXT_MUTED, fontSize: 13 }}>{empty}</div> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: 640, borderCollapse: 'collapse' }}>
            <thead><tr>{columns.map((c) => <th key={c} style={{ padding: '9px 16px', textAlign: 'left', background: T.TABLE_HEAD, color: T.TEXT_MUTED, fontSize: 10.5, letterSpacing: '.07em', textTransform: 'uppercase' }}>{c}</th>)}</tr></thead>
            <tbody>{rows.map((cells, r) => <tr key={r}>{cells.map((cell, i) => <td key={i} style={{ padding: '11px 16px', borderTop: `1px solid ${T.DIVIDER}`, color: T.TEXT_LABEL, fontSize: 13 }}>{cell}</td>)}</tr>)}</tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default function LiveBilling({ mobile }) {
  const { nav, showToast } = useAppState();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const get = (path) => apiFetch(path).catch((e) => { if (e instanceof ApiError && e.status === 401) throw e; return { items: [] }; });
    Promise.all([apiFetch('/v1/wallet'), get('/v1/wallet/ledger'), get('/v1/wallet/recharges'), get('/v1/seller/cod-remittances'), get('/v1/seller/invoices')])
      .then(([wallet, ledger, recharges, cod, invoices]) => setData({ wallet, ledger: ledger.items || [], recharges: recharges.items || [], cod: cod.items || [], invoices: invoices.items || [] }))
      .catch(setError);
  }, []);

  const pad = mobile ? '14px 12px 42px' : '18px 22px 48px';
  if (error) {
    const unauth = error instanceof ApiError && error.status === 401;
    return <div style={{ padding: pad }}><div style={{ ...CARD, padding: 30, color: T.TEXT_SECONDARY, fontSize: 13.5 }}>{unauth ? 'Sign in to see your billing.' : 'Billing could not be loaded right now.'}{unauth && <button onClick={() => nav('login')} style={{ marginLeft: 10, border: 0, background: 'transparent', color: T.ACCENT, fontWeight: 750, cursor: 'pointer' }}>Sign in</button>}</div></div>;
  }
  if (!data) return <div style={{ padding: pad }}><div style={{ ...CARD, padding: 30, color: T.TEXT_SECONDARY, fontSize: 13 }}>Loading billing…</div></div>;

  const pendingCod = data.cod.filter((c) => c.status !== 'remitted').reduce((s, c) => s + Number(c.net_remitted_paise || 0), 0);
  const remittedCod = data.cod.filter((c) => c.status === 'remitted').reduce((s, c) => s + Number(c.net_remitted_paise || 0), 0);
  const invoiced = data.invoices.reduce((s, i) => s + Number(i.total_paise || 0), 0);
  const download = async (inv) => {
    try {
      const x = await apiFetch(`/v1/seller/invoices/${inv.id}/download`);
      if (x?.downloadUrl) window.open(x.downloadUrl, '_blank', 'noopener'); else showToast('Invoice PDF is still being generated.', 'error');
    } catch (e) { showToast(e instanceof ApiError ? e.message : 'Invoice could not be downloaded', 'error'); }
  };

  const kpis = [
    ['Wallet balance', inr(data.wallet.balancePaise), data.wallet.balancePaise < 0 ? T.RED : T.TEXT, 'recharges', 'Recharge'],
    ['COD pending remittance', inr(pendingCod), T.AMBER, 'cod', 'View cycles'],
    ['COD remitted', inr(remittedCod), T.GREEN, 'cod', 'View cycles'],
    ['Invoiced', inr(invoiced), T.TEXT, 'invoice', 'View invoices'],
  ];

  return (
    <div style={{ padding: pad, display: 'grid', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr 1fr' : 'repeat(4, minmax(0,1fr))', gap: 12 }}>
        {kpis.map(([label, value, color, dest, cta]) => (
          <div key={label} style={{ ...CARD, padding: mobile ? 14 : 17 }}>
            <div style={{ color: T.TEXT_MUTED, fontSize: 11, fontWeight: 800, letterSpacing: '.07em', textTransform: 'uppercase' }}>{label}</div>
            <div style={{ marginTop: 7, color, fontSize: mobile ? 19 : 23, fontWeight: 780 }}>{value}</div>
            <button onClick={() => nav(dest)} style={{ marginTop: 6, padding: 0, border: 0, background: 'transparent', color: T.ACCENT, fontWeight: 720, fontSize: 12, cursor: 'pointer' }}>{cta} →</button>
          </div>
        ))}
      </div>

      <Panel mobile={mobile} heading="COD remittance" count={data.cod.length} onViewAll={() => nav('cod')} empty="No COD payout cycles yet — they appear once COD shipments are delivered."
        columns={['Cycle', 'Shipments', 'COD collected', 'Deductions', 'Net remittance', 'UTR / reference', 'Status']}
        rows={data.cod.slice(0, 5).map((c) => [`${date(c.cycle_start)} → ${date(c.cycle_end)}`, c.shipment_count, inr(c.cod_collected_paise), inr(c.charges_deducted_paise), <b key="n">{inr(c.net_remitted_paise)}</b>, c.bank_reference || '—', <Pill key="s" tone={c.status === 'remitted' ? 'ok' : 'warn'}>{title(c.status)}</Pill>])} />

      <Panel mobile={mobile} heading="Invoices" count={data.invoices.length} onViewAll={() => nav('invoice')} empty="No invoices issued yet."
        columns={['Invoice #', 'Period', 'Shipments', 'Taxable', 'GST', 'Total', 'Status', '']}
        rows={data.invoices.slice(0, 5).map((i) => [<b key="n">{i.invoice_number}</b>, `${date(i.period_start)} → ${date(i.period_end)}`, i.shipment_count, inr(i.subtotal_paise), inr(i.gst_paise), <b key="t">{inr(i.total_paise)}</b>, <Pill key="s" tone={i.status === 'issued' ? 'ok' : 'warn'}>{title(i.status)}</Pill>, i.status === 'issued' ? <button key="d" onClick={() => download(i)} style={{ border: 0, background: 'transparent', color: T.ACCENT, fontWeight: 750, cursor: 'pointer' }}>Download</button> : '—'])} />

      <Panel mobile={mobile} heading="Wallet ledger" count={data.ledger.length} onViewAll={() => nav('wallet')} empty="No wallet activity yet."
        columns={['Date', 'Type', 'Description', 'Reference', 'Amount']}
        rows={data.ledger.slice(0, 8).map((e) => [date(e.created_at), <Pill key="t" tone={CREDIT.has(e.entry_type) ? 'ok' : 'bad'}>{title(e.entry_type)}</Pill>, e.description || '—', e.reference_type ? title(e.reference_type) : '—', <b key="a" style={{ color: CREDIT.has(e.entry_type) ? T.GREEN : T.RED }}>{CREDIT.has(e.entry_type) ? '+' : '−'} {inr(e.amount_paise)}</b>])} />

      <Panel mobile={mobile} heading="Wallet recharges" count={data.recharges.length} onViewAll={() => nav('recharges')} empty="No recharges yet."
        columns={['Date', 'Payment reference', 'Amount', 'Status']}
        rows={data.recharges.slice(0, 5).map((r) => [date(r.created_at), r.provider_order_id || '—', <b key="a">{inr(r.amount_paise)}</b>, <Pill key="s" tone={r.status === 'succeeded' ? 'ok' : r.status === 'failed' ? 'bad' : 'warn'}>{title(r.status)}</Pill>])} />
    </div>
  );
}
