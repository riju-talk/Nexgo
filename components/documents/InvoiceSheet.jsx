'use client';

import { stateCode } from '@/lib/gstStateCodes';
import { amount, joinParts, longDate, rs } from './format';

// A4 tax invoice for one shipment, laid out like the client's sample.
// IGST for inter-state supplies, CGST + SGST (half each) when seller and buyer are in the same state.
export default function InvoiceSheet({ d }) {
  const items = d.items || [];
  const rate = (d.tax_rate_bps || 0) / 10000;
  const sellerCode = (d.seller_gstin || '').slice(0, 2) || stateCode(d.wh_state);
  const buyerCode = stateCode(d.customer_state);
  const intra = !!sellerCode && sellerCode === buyerCode;
  const lines = items.map((i) => {
    const base = i.quantity * i.unitPricePaise;
    const tax = Math.round(base * rate);
    return { ...i, base, tax, total: base + tax };
  });
  const charges = [
    ['Shipping Charges', d.shipping_charges_paise],
    ['COD Charges', d.transaction_charges_paise],
    ['Gift Wrap', d.gift_wrap_paise],
    ['Other Charges', d.other_charges_paise],
  ];
  const computed = lines.reduce((n, l) => n + l.total, 0) + charges.reduce((n, [, v]) => n + (v || 0), 0) - (d.discount_paise || 0);
  const grand = d.total_paise > 0 ? d.total_paise : computed;
  const pct = (rate * 100).toFixed(rate * 100 % 1 ? 2 : 0);
  const taxCols = intra ? ['CGST (Value | %)', 'SGST (Value | %)'] : ['IGST (Value | %)'];
  const taxCells = (tax) => (intra
    ? [`${amount(Math.floor(tax / 2))} | ${(pct / 2)}%`, `${amount(tax - Math.floor(tax / 2))} | ${(pct / 2)}%`]
    : [`${amount(tax)} | ${pct}%`]);
  return (
    <section className="doc-invoice">
      <h1 className="iv-title">TAX INVOICE</h1>
      <div className="iv-head">
        <div className="iv-head-r"><b className="iv-big">Invoice</b><div>Invoice Number - #{d.invoice_seq}</div><div>Invoice Date - {longDate(d.booked_at || d.order_date)}</div></div>
      </div>

      <div className="iv-parties">
        <div>
          <b>Bill &amp; Ship To:</b>
          <div>{d.customer_name}</div>
          <div>{joinParts(d.address_line_1, d.address_line_2, d.landmark && `Landmark - ${d.landmark}`)}</div>
          <div>{joinParts(d.customer_city, d.customer_state)}</div>
          <div>{d.customer_pincode}</div>
          {buyerCode && <div>State Code : {buyerCode}</div>}
          {d.customer_phone && <div>Mobile : {d.customer_phone}</div>}
        </div>
        <div className="iv-right">
          <b>Sold By:</b>
          <div>M/s {d.seller_name}</div>
          <div>{d.seller_address || joinParts(d.wh_line_1, d.wh_line_2, d.wh_city, d.wh_state, d.wh_pincode)}</div>
          {d.seller_gstin && <div>GSTIN : {d.seller_gstin}</div>}
          {sellerCode && <div>State Code : {sellerCode}</div>}
        </div>
      </div>

      <div className="iv-facts">
        <div><b>Payment Method:</b> {d.payment_mode === 'cod' ? 'COD' : 'Prepaid'}<br /><b>AWB No:</b> {d.awb}</div>
        <div className="iv-right"><b>Order Date:</b> {longDate(d.order_date)}<br /><b>Shipped By:</b> {d.courier_name}</div>
      </div>

      <table className="iv-table">
        <thead>
          <tr><th style={{ width: '24%' }}>Product Name</th><th>Product Sku</th><th>HSN</th><th>Quantity</th><th>Unit Price</th><th>TAX Amount</th>{taxCols.map((t) => <th key={t}>{t}</th>)}<th>TOTAL (Including GST)</th></tr>
        </thead>
        <tbody>
          {lines.map((l, n) => (
            <tr key={n}><td>{l.name}</td><td className="c">{l.sku === 'CUSTOM' ? '' : l.sku}</td><td className="c">{l.hsn || ''}</td><td className="c">{l.quantity}</td><td className="c">{amount(l.unitPricePaise)}</td><td className="c">{l.tax ? amount(l.tax) : ''}</td>{taxCells(l.tax).map((c, k) => <td key={k} className="c">{l.tax ? c : `0 | ${intra ? pct / 2 : pct}%`}</td>)}<td className="c">{amount(l.total)}</td></tr>
          ))}
        </tbody>
      </table>

      <table className="iv-table iv-charges">
        <thead><tr><th>Charges Applied</th><th>Tax Amount</th>{taxCols.map((t) => <th key={t}>{t}</th>)}<th>TOTAL (Including GST)</th></tr></thead>
        <tbody>
          {charges.filter(([label, v], i) => i < 2 || v > 0).map(([label, v]) => (
            <tr key={label}><th className="l">{label}</th><td className="c">-</td>{taxCols.map((t) => <td key={t} className="c">-</td>)}<td className="c">{v ? amount(v) : '-'}</td></tr>
          ))}
          {d.discount_paise > 0 && <tr><th className="l">Discount</th><td className="c">-</td>{taxCols.map((t) => <td key={t} className="c">-</td>)}<td className="c">- {amount(d.discount_paise)}</td></tr>}
        </tbody>
      </table>
      <div className="iv-total"><div>Total Amount</div><div>{rs(grand)}</div></div>
      {d.payment_mode === 'cod' && <div className="iv-note">Amount payable on delivery (COD): <b>{rs(d.cod_amount_paise)}</b></div>}
      <div className="iv-foot">This is a computer generated invoice and does not require a signature. Goods once sold will only be taken back or exchanged as per the seller&apos;s return policy.</div>
    </section>
  );
}
