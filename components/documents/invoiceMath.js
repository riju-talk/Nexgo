import { stateCode } from '@/lib/gstStateCodes';
import { amount } from './format';

// The single source of the tax invoice's numbers: the printed sheet and the Excel/CSV download both read from here, so they can never disagree.
// IGST for inter-state supplies, CGST + SGST (half each) when seller and buyer are in the same state.
export function computeInvoice(d, cfg = {}) {
  const thermal = String(cfg.pageFormat || '').startsWith('Thermal');
  const prefix = String(cfg.prefix || '').trim();
  const invoiceNo = prefix ? `${prefix}${String(d.invoice_seq).padStart(3, '0')}` : `#${d.invoice_seq}`;
  const custom = thermal ? [] : [1, 2, 3, 4, 5].map((n) => [cfg[`customName${n}`], cfg[`customValue${n}`]]).filter(([k, v]) => k && v);
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
  return { thermal, invoiceNo, custom, items, rate, sellerCode, buyerCode, intra, lines, charges, grand, pct, taxCols, taxCells };
}
