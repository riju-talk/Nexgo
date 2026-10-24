import { stateNameForCode } from '@/lib/gstStateCodes';

// The monthly tax invoice: ONE source of numbers for the printed page (/documents/monthly-invoice) and the shipment-wise Excel / CSV annexure,
// so the two always agree. Layout follows the reference invoice PDF and the reference annexure sheet.
const rupees = (paise) => Math.round(Number(paise || 0)) / 100;
const GST_BPS = 1800;
const ZONE_NO = { within_city: 'z1', within_state: 'z2', metro_to_metro: 'z3', rest_of_india: 'z4', national: 'z4', ne_jk: 'z5' };
const statusText = (s) => String(s || '').split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' '); // in_transit -> In Transit, rto -> Rto

// Same-state supply = CGST + SGST (half each); otherwise IGST. Needs both GSTINs; with either missing the supply is treated as inter-state.
export function monthlyInvoiceFigures({ invoice, seller, company }) {
  const sellerCode = String(seller?.gstin || '').slice(0, 2);
  const companyCode = String(company?.gstin || '').slice(0, 2);
  const intra = !!sellerCode && sellerCode === companyCode;
  const gst = Number(invoice.gst_paise); const half = Math.floor(gst / 2);
  return {
    intra, shippingPaise: Number(invoice.subtotal_paise), igst: intra ? 0 : gst, cgst: intra ? half : 0, sgst: intra ? gst - half : 0, netPaise: Number(invoice.total_paise),
    placeOfSupply: stateNameForCode(sellerCode), stateCode: sellerCode,
  };
}

export const ANNEXURE_HEAD = ['Bill Type', 'Carrier', 'Zone', 'AWB Number', 'Shipment Status', 'Seller Company Name', 'Shipment ID', 'Order ID', 'Payment Type', 'Pincode', 'Destination City', 'Destination State',
  'Charged Weight', 'Applied Weight', 'Foward Freight', 'RTO Freight', 'Extra Wgt Charges', 'RTO Extra Wgt Charges', 'COD Charges', 'Sub Total', 'IGST', 'SGST', 'CGST', 'Grand Total', 'Order Amount',
  'Warehouse City', 'Warehouse State', 'Warehouse Pin Code',
  ...Array.from({ length: 10 }, (_, i) => [`SKU(${i + 1})`, `Product(${i + 1})`, `Quantity(${i + 1})`]).flat()];

export function annexureRows(data) {
  const { invoice, seller, lines } = data; const f = monthlyInvoiceFigures(data);
  // Per-line GST is rounded to paise; the remainder against the invoice's own GST lands on the last billed line, so the sheet adds up to the invoice.
  const subs = lines.map((l) => (l.state === 'cancelled' ? 0 : Number(l.shipping_charge_paise || 0)));
  const taxes = subs.map((v) => Math.round((v * GST_BPS) / 10000));
  const last = subs.reduce((at, v, i) => (v > 0 ? i : at), -1);
  if (last >= 0) taxes[last] += Number(invoice.gst_paise) - taxes.reduce((n, t) => n + t, 0);
  const rows = lines.map((l, i) => {
    const billed = l.state !== 'cancelled'; const price = l.quote_snapshot?.price || {};
    const cod = billed && l.payment_mode === 'cod' ? Math.min(Number(price.codFeePaise || 0), subs[i]) : 0;
    const extra = billed ? Math.min(Number(price.extraWeightPaise || 0), subs[i] - cod) : 0;
    const tax = taxes[i]; const half = Math.floor(tax / 2);
    const items = (l.items || []).slice(0, 10).flatMap((it) => [it.sku === 'CUSTOM' ? '' : it.sku, it.name, it.quantity]);
    const kg = Number(l.chargeable_weight_g || 0) / 1000;
    return [
      'Forward', l.service_name?.toLowerCase().startsWith(String(l.courier_name || '').toLowerCase()) ? l.service_name : `${l.courier_name} ${l.service_name}`.trim(),
      ZONE_NO[l.quote_snapshot?.zone] || '', l.awb, statusText(l.state), seller.legal_name, l.nexgo_order_id || '', l.order_number, l.payment_mode === 'cod' ? 'COD' : 'PREPAID',
      l.destination_pincode || l.customer_pincode || '', l.destination_city || l.customer_city || '', l.customer_state || '',
      kg, billed ? kg : '', rupees(subs[i] - cod - extra), 0, rupees(extra), 0, rupees(cod), rupees(subs[i]),
      f.intra ? 0 : rupees(tax), f.intra ? rupees(tax - half) : 0, f.intra ? rupees(half) : 0, rupees(subs[i] + tax), rupees(l.order_amount_paise),
      l.wh_city || '', l.wh_state || '', l.wh_pincode || '', ...items,
    ];
  });
  return [ANNEXURE_HEAD, ...rows];
}
