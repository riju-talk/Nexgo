'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { useAppState } from '@/lib/AppStateContext';
import { FORMATS, saveRows } from '@/lib/exportFile';
import * as T from '@/lib/theme';
import { BLUE, Btn, CARD, FIELD, ListTab, Pill, Stat, Table, dateTime, dayText, inr, isoDay, kg, titleCase } from './Kit';
import LiveBillingDocs from './LiveBillingDocs';
import LiveRateCalculator from './LiveRateCalculator';
import LiveRateCard from './LiveRateCard';

// One Billing screen with every finance tab. Real tabs map to routes (so the sidebar and links keep working);
// the calculator and rate chart tabs are embedded views of the Tools pages.
const TABS = [
  ['calc', 'Price Calculator', null], ['chart', 'Rate Chart', null],
  ['cod', 'COD Remittance', 'cod'], ['wallet', 'Wallet Transactions', 'wallet'], ['charges', 'Shipping Charges', 'charges'],
  ['invoice', 'Invoice', 'invoice'], ['credit-note', 'Credit Notes', 'credit-note'], ['tds', 'TDS', 'tds'],
];
const TAB_FOR_ID = { billing: 'cod', cod: 'cod', wallet: 'wallet', recharges: 'wallet', charges: 'charges', invoice: 'invoice', 'credit-note': 'credit-note', tds: 'tds' };
const CODE_STATUS = { remitted: ['Paid', T.GREEN], approved: ['Approved', '#3877fc'], pending: ['Pending', T.AMBER] };
const SHIP_STATUS_COLOR = (s) => (s === 'delivered' ? T.GREEN : s === 'cancelled' ? T.RED : s === 'ndr' || s === 'rto' ? T.AMBER : '#3877fc');
const dash = <span style={{ color: T.TEXT_MUTED }}>–</span>;
const money = (paise) => (Number(paise) ? inr(paise) : dash);
const soon = (showToast) => () => showToast('Document download is coming soon. It needs file storage, which is not connected yet.');

function CodTab() {
  const { showToast } = useAppState();
  return (
    <ListTab
      path="/v1/billing/cod" exportName="cod-remittance" empty="No COD remittances yet. Payouts appear here once your COD shipments are delivered and settled."
      columns={[
        { h: '#', cell: (r, i) => i + 1 }, { h: 'Remittance ID', cell: (r) => <b style={{ fontFamily: T.MONO }}>{r.remittance_no}</b> }, { h: 'COD amount', cell: (r) => inr(r.cod_collected_paise) },
        { h: 'Status', cell: (r) => { const [l, c] = CODE_STATUS[r.status] || [titleCase(r.status), T.TEXT]; return <Pill color={c}>{l}</Pill>; } },
        { h: 'Payment date', cell: (r) => dayText(r.payment_date) }, { h: 'Freight deductions', cell: (r) => money(r.freight_deduction_paise) }, { h: 'Remittance amount', cell: (r) => <b>{inr(r.remittance_paise)}</b> },
        { h: 'Convenience fee', cell: () => inr(0) }, { h: 'Payment ref', cell: (r) => r.bank_reference || dash }, { h: 'Remark', cell: (r) => `${r.shipment_count} shipment${r.shipment_count === 1 ? '' : 's'} · ${dayText(r.cycle_start)} – ${dayText(r.cycle_end)}` },
        { h: 'Download', cell: () => <Btn small onClick={soon(showToast)}>⤓</Btn> },
      ]}
      exportColumns={[
        { h: 'Remittance ID', value: (r) => r.remittance_no }, { h: 'Cycle start', value: (r) => r.cycle_start?.slice(0, 10) }, { h: 'Cycle end', value: (r) => r.cycle_end?.slice(0, 10) }, { h: 'Shipments', value: (r) => r.shipment_count },
        { h: 'COD amount INR', value: (r) => r.cod_collected_paise / 100 }, { h: 'Status', value: (r) => (CODE_STATUS[r.status] || [r.status])[0] }, { h: 'Payment date', value: (r) => r.payment_date?.slice(0, 10) || '' },
        { h: 'Freight deductions INR', value: (r) => r.freight_deduction_paise / 100 }, { h: 'Remittance amount INR', value: (r) => r.remittance_paise / 100 }, { h: 'Convenience fee INR', value: () => 0 }, { h: 'Payment ref', value: (r) => r.bank_reference || '' },
      ]}
    >
      {(d) => (
        <div style={{ ...CARD, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', marginBottom: 12, textAlign: 'center' }}>
          {[['Remitted Till Date', d.summary?.remittedTillDatePaise], ['Last Remittance', d.summary?.lastRemittancePaise], ['Next Remittance (Expected)', d.summary?.nextRemittancePaise], ['Total Remittance Due', d.summary?.totalDuePaise]].map(([l, v], i) => (
            <div key={l} style={{ padding: '16px 10px', borderLeft: i ? `1px solid ${T.DIVIDER}` : 0 }}><span style={{ fontSize: 13, color: T.TEXT_SECONDARY }}>{l}</span><b style={{ display: 'block', fontSize: 24, marginTop: 4, color: T.TEXT }}>{d.summary ? inr(v).replace('.00', '') : '—'}</b></div>
          ))}
        </div>
      )}
    </ListTab>
  );
}

function WalletTab() {
  const { nav } = useAppState();
  return (
    <ListTab
      path="/v1/billing/wallet" filters={['type', 'q']} exportName="wallet-transactions" pageSize={10} empty="No wallet transactions match these filters."
      toolbar={<Btn primary onClick={() => nav('recharges')}>+ Recharge wallet</Btn>}
      columns={[
        { h: 'Date', cell: (r) => dateTime(r.created_at) }, { h: 'Txn type', cell: (r) => r.txn_type }, { h: 'Ref no#', cell: (r) => <span style={{ fontFamily: T.MONO, color: BLUE }}>{r.ref_no}</span> },
        { h: 'Transaction ID', cell: (r) => `#${r.txn_id}` }, { h: 'Credit (₹)', cell: (r) => (Number(r.credit_paise) ? <b style={{ color: T.GREEN }}>{inr(r.credit_paise)}</b> : dash) },
        { h: 'Debit (₹)', cell: (r) => (Number(r.debit_paise) ? <b>{inr(r.debit_paise)}</b> : dash) }, { h: 'Closing balance (₹)', cell: (r) => inr(r.closing_paise) }, { h: 'Description', wrap: true, cell: (r) => r.description },
      ]}
      exportColumns={[
        { h: 'Date', value: (r) => r.created_at?.slice(0, 19).replace('T', ' ') }, { h: 'Txn type', value: (r) => r.txn_type }, { h: 'Ref no', value: (r) => r.ref_no }, { h: 'Transaction ID', value: (r) => r.txn_id },
        { h: 'Credit INR', value: (r) => r.credit_paise / 100 }, { h: 'Debit INR', value: (r) => r.debit_paise / 100 }, { h: 'Closing balance INR', value: (r) => r.closing_paise / 100 }, { h: 'Description', value: (r) => r.description },
      ]}
    >
      {(d) => <div style={{ margin: '0 0 12px', fontSize: 14, color: T.TEXT_SECONDARY }}>Wallet Balance: <b style={{ color: T.TEXT, fontSize: 18 }}>{d.balancePaise === undefined ? '—' : inr(d.balancePaise)}</b></div>}
    </ListTab>
  );
}

function ChargesTab() {
  const { nav } = useAppState();
  return (
    <ListTab
      path="/v1/billing/shipping-charges" filters={['q']} exportName="shipping-charges" empty="No shipments in this period." minWidth={1180}
      columns={[
        { h: 'Shipment created', cell: (r) => dateTime(r.booked_at) }, { h: 'Courier', cell: (r) => <span><b>{r.courier_name}</b><small style={{ display: 'block', color: T.TEXT_MUTED }}>{r.service_name}</small></span> },
        { h: 'AWB number', cell: (r) => <span style={{ fontFamily: T.MONO, color: BLUE }}>{r.awb}</span> }, { h: 'Status', cell: (r) => <Pill color={SHIP_STATUS_COLOR(r.state)}>{titleCase(r.state)}</Pill> },
        { h: 'Freight charges (₹)', cell: (r) => inr(r.freight_paise) }, { h: 'COD charges (₹)', cell: (r) => money(r.cod_fee_paise) }, { h: 'Entered wgt (kg)', cell: (r) => kg(r.entered_weight_g).replace(' kg', '') },
        { h: 'Applied wgt (kg)', cell: (r) => kg(r.applied_weight_g).replace(' kg', '') }, { h: 'Extra wgt charges (₹)', cell: (r) => money(r.extra_weight_paise) }, { h: 'RTO charges', cell: () => dash },
        { h: 'COD charge reversed', cell: (r) => money(r.cod_reversed_paise) }, { h: 'Total charges (₹)', cell: (r) => <b>{inr(r.total_paise)}</b> },
        { h: 'Action', cell: () => <Btn small onClick={() => nav('shipments')}>View</Btn> },
      ]}
      exportColumns={[
        { h: 'Shipment created', value: (r) => r.booked_at?.slice(0, 19).replace('T', ' ') }, { h: 'Courier', value: (r) => r.courier_name }, { h: 'Service', value: (r) => r.service_name }, { h: 'AWB', value: (r) => r.awb }, { h: 'Status', value: (r) => r.state },
        { h: 'Freight INR', value: (r) => r.freight_paise / 100 }, { h: 'COD charges INR', value: (r) => r.cod_fee_paise / 100 }, { h: 'Entered weight kg', value: (r) => r.entered_weight_g / 1000 }, { h: 'Applied weight kg', value: (r) => r.applied_weight_g / 1000 },
        { h: 'Extra weight charges INR', value: (r) => r.extra_weight_paise / 100 }, { h: 'COD charge reversed INR', value: (r) => r.cod_reversed_paise / 100 }, { h: 'Total charges INR', value: (r) => r.total_paise / 100 },
      ]}
    >
      {(d) => d.totalChargesPaise !== undefined && <div style={{ margin: '0 0 12px', fontSize: 14, color: T.TEXT_SECONDARY }}>Total charges for this selection: <b style={{ color: T.TEXT, fontSize: 18 }}>{inr(d.totalChargesPaise)}</b></div>}
    </ListTab>
  );
}

function InvoiceTab() {
  const { showToast } = useAppState();
  const [rows, setRows] = useState(null); const [error, setError] = useState('');
  const [from, setFrom] = useState(''); const [to, setTo] = useState(''); const [format, setFormat] = useState('csv');
  useEffect(() => { let live = true; apiFetch('/v1/seller/invoices').then((x) => { if (live) setRows(x.items || []); }).catch((e) => { if (live) { setRows([]); setError(e.status === 401 ? 'Sign in to view invoices.' : e.message || 'Invoices could not be loaded.'); } }); return () => { live = false; }; }, []);
  const shown = useMemo(() => (rows || []).filter((r) => (!from || (r.period_end || '').slice(0, 10) >= from) && (!to || (r.period_start || '').slice(0, 10) <= to)), [rows, from, to]);
  const period = (r) => new Date(r.period_start).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
  const exportRows = async () => { if (!shown.length) return showToast('Nothing to export.', 'error'); await saveRows([['Invoice no', 'Service type', 'Invoice date', 'Invoice period', 'Subtotal INR', 'GST INR', 'Invoice amount INR', 'Status'], ...shown.map((r) => [r.invoice_number, 'Shipment', dayText(r.issued_at || r.period_end), period(r), r.subtotal_paise / 100, r.gst_paise / 100, r.total_paise / 100, r.status])], `invoices-${isoDay()}`, format, 'Invoices'); showToast(`Exported ${shown.length} invoices`); };
  return (
    <div>
      <div style={{ ...CARD, padding: '10px 14px', marginBottom: 12, fontSize: 12.5, color: T.TEXT_SECONDARY, borderLeft: `4px solid ${BLUE}` }}>Please cross-check your invoice details (name, GST number, GST state, address). If anything is wrong, contact NEXGO support within 10 days of the invoice date.</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <input aria-label="From date" type="date" style={FIELD} value={from} onChange={(e) => setFrom(e.target.value)} /><span style={{ color: T.TEXT_MUTED }}>–</span><input aria-label="To date" type="date" style={FIELD} value={to} onChange={(e) => setTo(e.target.value)} />
        <Btn small onClick={() => { setFrom(''); setTo(''); }}>Clear</Btn>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}><select aria-label="Export format" style={FIELD} value={format} onChange={(e) => setFormat(e.target.value)}>{FORMATS.map(([id, l]) => <option key={id} value={id}>{l}</option>)}</select><Btn onClick={exportRows}>⤓ Export</Btn></div>
      </div>
      <section style={{ ...CARD, overflow: 'hidden' }}>
        <Table loading={rows === null} error={error} rows={shown} empty="No invoices yet. Your monthly shipping invoice appears here once it is issued."
          columns={[
            { h: 'Invoice no. #', cell: (r) => <b style={{ fontFamily: T.MONO }}>{r.invoice_number}</b> }, { h: 'Service type', cell: () => 'Shipment' }, { h: 'Invoice date', cell: (r) => dayText(r.issued_at || r.period_end) },
            { h: 'Invoice period', cell: (r) => period(r) }, { h: 'Shipments', cell: (r) => r.shipment_count }, { h: 'GST', cell: (r) => inr(r.gst_paise) }, { h: 'Invoice amount', cell: (r) => <b>{inr(r.total_paise)}</b> },
            { h: 'Status', cell: (r) => <Pill color={r.status === 'issued' ? T.GREEN : T.AMBER}>{titleCase(r.status)}</Pill> }, { h: 'Action', cell: () => <Btn small onClick={soon(showToast)}>⤓ PDF</Btn> },
          ]} />
      </section>
    </div>
  );
}

export default function LiveBillingHub({ activeId, mobile }) {
  const { nav } = useAppState();
  const routeTab = TAB_FOR_ID[activeId] || 'cod';
  const [embedded, setEmbedded] = useState(null); // 'calc' | 'chart' while the user is on an embedded tab
  const tab = embedded || routeTab;
  const pad = mobile ? '14px 12px 42px' : '18px 22px 48px';
  const pick = (id, route) => { if (!route) { setEmbedded(id); return; } setEmbedded(null); if (route !== activeId) nav(route); };

  return (
    <div style={{ padding: pad }}>
      <div role="tablist" aria-label="Billing sections" style={{ display: 'flex', gap: 4, overflowX: 'auto', borderBottom: `1px solid ${T.DIVIDER}`, marginBottom: 16 }}>
        {TABS.map(([id, label, route]) => { const on = tab === id; return <button key={id} role="tab" aria-selected={on} type="button" onClick={() => pick(id, route)} style={{ padding: '11px 14px', border: 0, borderBottom: `3px solid ${on ? BLUE : 'transparent'}`, background: on ? '#3877fc10' : 'transparent', color: on ? BLUE : T.TEXT_SECONDARY, fontWeight: on ? 800 : 600, fontSize: 13.5, cursor: 'pointer', whiteSpace: 'nowrap', borderRadius: '8px 8px 0 0' }}>{label}</button>; })}
      </div>
      {tab === 'calc' && <LiveRateCalculator mobile={mobile} embedded />}
      {tab === 'chart' && <LiveRateCard mobile={mobile} embedded />}
      {tab === 'cod' && <CodTab />}
      {tab === 'wallet' && <WalletTab />}
      {tab === 'charges' && <ChargesTab />}
      {tab === 'invoice' && <InvoiceTab />}
      {tab === 'credit-note' && <LiveBillingDocs kind="credit-note" mobile={mobile} embedded />}
      {tab === 'tds' && <LiveBillingDocs kind="tds" mobile={mobile} embedded />}
    </div>
  );
}
