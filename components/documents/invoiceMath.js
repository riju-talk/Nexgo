import { stateCode } from '@/lib/gstStateCodes';
import { amount } from './format';

// The single source of the tax invoice's numbers: the printed sheet and the Excel/CSV download both read from here, so they can never disagree.
// IGST for inter-state supplies, CGST + SGST (half each) when seller and buyer are in the same state.
// The number printed on the invoice and quoted on the shipping label, so the two can never differ.
export function invoiceNumber(d, cfg = {}) {
  if (!d.invoice_seq) return '';
  const prefix = String(cfg.prefix || '').trim();
  return prefix ? `${prefix}${String(d.invoice_seq).padStart(3, '0')}` : `#${d.invoice_seq}`;
}

export function computeInvoice(d, cfg = {}) {
  const thermal = String(cfg.pageFormat || '').startsWith('Thermal');
  const invoiceNo = invoiceNumber(d, cfg);
  const custom = thermal ? [] : [1, 2, 3, 4, 5].map((n) => [cfg[`customName${n}`], cfg[`customValue${n}`]]).filter(([k, v]) => k && v);
  const items = d.items || [];
  const rate = (d.tax_rate_bps || 0) / 10000;
  const sellerCode = (d.seller_gstin || '').slice(0, 2) || stateCode(d.wh_state);
  const buyerCode = stateCode(d.customer_state);
  const intra = !!sellerCode && sellerCode === buyerCode;
  const taxes = items.map((i) => Math.round(i.quantity * i.unitPricePaise * rate));
  // The order stores its tax rounded once for the whole order; per-line rounding can differ by a few paise, so the difference goes on the last taxed line.
  if (rate > 0 && d.tax_paise > 0 && taxes.length) {
    const diff = d.tax_paise - taxes.reduce((n, t) => n + t, 0);
    let last = taxes.length - 1; while (last > 0 && !taxes[last]) last--;
    if (diff && taxes[last] + diff >= 0) taxes[last] += diff;
  }
  const lines = items.map((i, n) => {
    const base = i.quantity * i.unitPricePaise;
    return { ...i, base, tax: taxes[n], total: base + taxes[n] };
  });
  const charges = [
    ['Shipping Charges', d.shipping_charges_paise],
    ['COD Charges', d.transaction_charges_paise],
    ['Gift Wrap', d.gift_wrap_paise],
    ['Other Charges', d.other_charges_paise],
  ];
  const computed = lines.reduce((n, l) => n + l.total, 0) + charges.reduce((n, [, v]) => n + (v || 0), 0) - (d.discount_paise || 0);
  const grand = d.total_paise > 0 ? d.total_paise : computed;
  // If the stored order total still differs from the rows (an imported order, say), show the gap as its own row so the printed rows always add up to the total.
  if (grand !== computed) charges.push(['Round off / adjustment', grand - computed]);
  const pct = (rate * 100).toFixed(rate * 100 % 1 ? 2 : 0);
  const taxCols = intra ? ['CGST (Value | %)', 'SGST (Value | %)'] : ['IGST (Value | %)'];
  const taxCells = (tax) => (intra
    ? [`${amount(Math.floor(tax / 2))} | ${(pct / 2)}%`, `${amount(tax - Math.floor(tax / 2))} | ${(pct / 2)}%`]
    : [`${amount(tax)} | ${pct}%`]);
  return { thermal, invoiceNo, custom, items, rate, sellerCode, buyerCode, intra, lines, charges, grand, pct, taxCols, taxCells };
}
