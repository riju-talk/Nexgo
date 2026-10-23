import { computeInvoice, invoiceNumber } from './invoiceMath';
import { joinParts, longDate } from './format';

// Rows for the Excel / CSV downloads of printable documents (first row = headers). Numbers are real numbers, in rupees.
const rupees = (paise) => Math.round(Number(paise || 0)) / 100;

export function invoiceRows(items, cfg = {}) {
  const head = ['Invoice number', 'Invoice date', 'AWB', 'Order ID', 'Payment method', 'Customer', 'Customer state', 'Customer pincode', 'Sold by', 'Seller GSTIN',
    'Line', 'Product', 'SKU', 'HSN', 'Quantity', 'Unit price (INR)', 'Taxable value (INR)', 'GST rate %', 'CGST (INR)', 'SGST (INR)', 'IGST (INR)', 'Line total incl. GST (INR)'];
  const rows = [head];
  for (const d of items) {
    const v = computeInvoice(d, cfg); const pct = Number(v.pct);
    const common = [v.invoiceNo, longDate(d.booked_at || d.order_date), d.awb, d.order_number, d.payment_mode === 'cod' ? 'COD' : 'Prepaid', d.customer_name, d.customer_state, d.customer_pincode, cfg.hideCompanyName ? '' : d.seller_name, d.seller_gstin || ''];
    v.lines.forEach((l, i) => rows.push([...common, i + 1, l.name, l.sku === 'CUSTOM' ? '' : l.sku, l.hsn || '', l.quantity, rupees(l.unitPricePaise), rupees(l.base), pct,
      v.intra ? rupees(Math.floor(l.tax / 2)) : 0, v.intra ? rupees(l.tax - Math.floor(l.tax / 2)) : 0, v.intra ? 0 : rupees(l.tax), rupees(l.total)]));
    for (const [label, paise] of v.charges) if (paise) rows.push([...common, '', label, '', '', '', '', rupees(paise), '', 0, 0, 0, rupees(paise)]);
    if (d.discount_paise > 0) rows.push([...common, '', 'Discount', '', '', '', '', -rupees(d.discount_paise), '', 0, 0, 0, -rupees(d.discount_paise)]);
    rows.push([...common, '', 'INVOICE TOTAL', '', '', '', '', '', '', '', '', '', rupees(v.grand)]);
  }
  return rows;
}

export function labelRows(items, cfg = {}) {
  const head = ['AWB', 'Invoice number', 'Courier', 'Routing', 'Order ID', 'NEXGO order ID', 'Order date', 'Payment', 'COD to collect (INR)', 'Weight (kg)', 'Dimensions (cm)', 'Customer', 'Mobile', 'Address', 'City', 'State', 'Pincode', 'Products', 'Pickup warehouse', 'Pickup address'];
  return [head, ...items.map((d) => [
    d.awb, invoiceNumber(d, cfg), d.courier_name, routingOf(d), d.order_number, d.nexgo_order_id, longDate(d.order_date), d.payment_mode === 'cod' ? 'COD' : 'Prepaid', d.payment_mode === 'cod' ? rupees(d.cod_amount_paise) : 0,
    Math.max(d.chargeable_weight_g || 0, d.total_weight_g || 0) / 1000, d.package_length_mm ? `${d.package_length_mm / 10} x ${d.package_width_mm / 10} x ${d.package_height_mm / 10}` : '',
    d.customer_name, d.customer_phone, joinParts(d.address_line_1, d.address_line_2, d.landmark), d.customer_city, d.customer_state, d.customer_pincode,
    (d.items || []).map((i) => `${i.name} x${i.quantity}`).join('; '), d.warehouse_name, joinParts(d.wh_line_1, d.wh_line_2, d.wh_city, d.wh_state, d.wh_pincode),
  ])];
}

// The courier's own routing / sort code when it gave one; otherwise the lane (origin city > destination city), so a label never goes out without routing.
const code3 = (city) => String(city || '').replace(/[^a-z]/gi, '').slice(0, 3).toUpperCase();
export const routingOf = (d) => d.routing_code || [code3(d.wh_city), code3(d.customer_city)].filter(Boolean).join(' > ') || '';

// A sample shipment for previewing and downloading the invoice / label design from the settings pages.
export const SAMPLE_DOC = {
  id: 'sample', awb: 'NXSAMPLE0001', state: 'booked', booked_at: new Date().toISOString(), chargeable_weight_g: 500, courier_name: 'Sample Courier', service_name: 'Surface',
  order_number: 'SAMPLE-1001', nexgo_order_id: 'NX2610000001', order_date: new Date().toISOString(), invoice_seq: 1, payment_mode: 'cod', cod_amount_paise: 149800, subtotal_paise: 126950,
  total_paise: 149800, tax_rate_bps: 1800, tax_paise: 22850, shipping_charges_paise: 0, transaction_charges_paise: 0, gift_wrap_paise: 0, other_charges_paise: 0, discount_paise: 0, total_weight_g: 500,
  package_length_mm: 200, package_width_mm: 150, package_height_mm: 100, customer_name: 'Aarav Mehta', customer_phone: '9876543210', address_line_1: '24 Residency Road', address_line_2: 'Shanthala Nagar',
  landmark: 'Near Garuda Mall', customer_city: 'Bengaluru', customer_state: 'Karnataka', customer_pincode: '560001', warehouse_name: 'Main warehouse', contact_name: 'Operations',
  warehouse_phone: '9811122233', warehouse_email: 'ops@example.com', wh_line_1: '14 Industrial Area', wh_line_2: 'Phase 2', wh_city: 'Mumbai', wh_state: 'Maharashtra', wh_pincode: '400001',
  seller_name: 'Your Company Pvt Ltd', seller_gstin: '27AAAAA0000A1Z5', seller_address: '14 Industrial Area, Phase 2, Mumbai, Maharashtra, 400001', routing_code: '',
  items: [{ sku: 'KIT-01', name: 'Demo kit', hsn: '49119990', quantity: 1, unitPricePaise: 99950 }, { sku: 'TEE-02', name: 'Cotton T-shirt', hsn: '61091000', quantity: 1, unitPricePaise: 27000 }],
};
