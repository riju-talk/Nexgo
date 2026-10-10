'use client';

import Barcode from 'react-barcode';
import { joinParts, longDate, rs } from './format';

// 4 × 6 inch thermal shipping label. Black on white, no colour, so it prints cleanly on any label printer.
// `d` is one entry of GET /v1/shipments/documents.
export default function LabelSheet({ d }) {
  const cod = d.payment_mode === 'cod';
  const dims = d.package_length_mm ? `${(d.package_length_mm / 10).toFixed(2)} X ${(d.package_width_mm / 10).toFixed(2)} X ${(d.package_height_mm / 10).toFixed(2)}` : '—';
  const items = d.items || [];
  const invoiceNo = d.invoice_seq ? `#${d.invoice_seq}` : d.order_number;
  return (
    <section className="doc-label">
      <div className="lb-to">
        <b>To:</b>
        <b className="lb-name">{d.customer_name}</b>
        <span>{joinParts(d.address_line_1, d.address_line_2, d.landmark && `Landmark - ${d.landmark}`)}</span>
        <span>{joinParts(d.customer_city, d.customer_state, 'India')} - {d.customer_pincode}</span>
        {d.customer_phone && <span>Mobile: {d.customer_phone}</span>}
      </div>

      <div className="lb-row lb-meta">
        <div>
          <div>Order Date: <b>{longDate(d.order_date)}</b></div>
          <div>Invoice No: <b>{invoiceNo}</b></div>
          <div>Order ID: <b>{d.order_number}</b></div>
        </div>
        <div className="lb-center"><Barcode value={d.nexgo_order_id || d.order_number} format="CODE128" width={1} height={34} fontSize={10} margin={0} displayValue /></div>
      </div>

      <div className="lb-row lb-main">
        <div className="lb-pay">
          <div className="lb-paid">{cod ? 'COD' : 'PAID'}</div>
          {cod && <div className="lb-cod">Collect {rs(d.cod_amount_paise)}</div>}
          <div className="lb-weight">WEIGHT : {(Math.max(d.chargeable_weight_g, d.total_weight_g) / 1000).toFixed(2)} KG</div>
        </div>
        <div className="lb-awb">
          <div className="lb-courier">{d.courier_name}</div>
          <Barcode value={d.awb} format="CODE128" width={1.7} height={52} fontSize={13} margin={0} displayValue />
          <div className="lb-dims">Dimensions (cm): {dims}</div>
        </div>
      </div>

      <table className="lb-items">
        <thead><tr><th style={{ width: '26%' }}>SKU</th><th>Item Name</th><th style={{ width: '12%' }}>Qty.</th></tr></thead>
        <tbody>{items.map((i, n) => <tr key={n}><td>{i.sku === 'CUSTOM' ? '' : i.sku}</td><td>{i.name}</td><td className="c">{i.quantity}</td></tr>)}</tbody>
      </table>

      <div className="lb-block">
        <b>Pickup and Return Address:</b>
        <b className="lb-sub">{d.warehouse_name}</b>
        <span>{joinParts(d.wh_line_1, d.wh_line_2, d.wh_city, d.wh_state)} - {d.wh_pincode}</span>
      </div>
      <div className="lb-block">
        <b>For any query please contact:</b>
        <span><b>Mobile:</b> {d.warehouse_phone} {d.warehouse_email && <><b>Email:</b> {d.warehouse_email}</>}</span>
      </div>
      <div className="lb-foot">
        This is computer generated document, hence does not required signature.<br />
        <b>Note:</b> All matters shall be handled as per the Seller&apos;s Agreement and T&amp;C. Goods once sold will only be taken back or exchanged as per the store&apos;s exchange/return policy.
      </div>
    </section>
  );
}
