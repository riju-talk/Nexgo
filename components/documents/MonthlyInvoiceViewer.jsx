'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { saveRows } from '@/lib/exportFile';
import { annexureRows, monthlyInvoiceFigures } from './monthlyInvoice';

// The monthly tax invoice (open with ?id=<invoiceId>): Print / Save as PDF uses the browser, so the PDF is real text.
// Layout follows the reference invoice: title, invoice facts on the right, From / To, a Description / Amount table, net payable, bank details, registered office.
const money = (paise) => `₹${(Math.round(Number(paise || 0)) / 100).toString()}`;
const longDate = (v) => (v ? new Date(v).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '');

export default function MonthlyInvoiceViewer() {
  const id = useSearchParams().get('id') || '';
  const [state, setState] = useState({ id: '', data: null, error: '' });
  useEffect(() => {
    if (!id) return undefined;
    let live = true;
    apiFetch(`/v1/seller/invoices/${encodeURIComponent(id)}/lines`)
      .then((data) => live && setState({ id, data, error: '' }))
      .catch((e) => live && setState({ id, data: null, error: e instanceof ApiError && e.status === 401 ? 'Sign in to view this invoice.' : e.message || 'The invoice could not be loaded.' }));
    return () => { live = false; };
  }, [id]);

  const loading = !!id && state.id !== id;
  const data = state.data; const error = id ? state.error : 'No invoice selected.';
  const f = data ? monthlyInvoiceFigures(data) : null;
  const inv = data?.invoice; const seller = data?.seller; const co = data?.company;
  const download = (format) => saveRows(annexureRows(data), `invoice-${String(inv.invoice_number).replace(/[^A-Za-z0-9._-]+/g, '-')}`, format, 'Invoice');
  return (
    <div className="mi-root">
      <style>{CSS}</style>
      <header className="mi-bar">
        <b>Tax invoice{inv ? ` · ${inv.invoice_number}` : ''}</b>
        <button type="button" onClick={() => window.print()} disabled={!data}>Print / Save as PDF</button>
        <button type="button" onClick={() => download('xlsx')} disabled={!data}>Download Excel</button>
        <button type="button" onClick={() => download('csv')} disabled={!data}>Download CSV</button>
      </header>
      {loading && <p className="mi-msg">Preparing invoice…</p>}
      {!loading && error && <p className="mi-msg mi-err">{error}</p>}
      {!loading && data && (
        <main className="mi-page">
          <h1 className="mi-title">Tax Invoice</h1>
          <div className="mi-head">
            <div>
              <div><b>Invoice #:</b> {inv.invoice_number}</div>
              <div><b>Invoice Date:</b> {longDate(inv.issued_at || inv.created_at)}</div>
              <div><b>Invoice Period:</b> {longDate(inv.period_start)} - {longDate(inv.period_end)}</div>
              <div><b>SID:</b> {seller.nexgo_code}</div>
            </div>
          </div>
          <div className="mi-parties">
            <div>
              <div><b>From:</b> {co.name}</div>
              {co.address && <div className="mi-pre">{co.address}</div>}
              {co.gstin && <div>GSTIN: {co.gstin}</div>}
              <div>RCM Applicable : No</div>
            </div>
            <div className="mi-right">
              <div><b>To:</b> {seller.legal_name}</div>
              {seller.registered_address && <div className="mi-pre">{seller.registered_address}</div>}
              {seller.gstin && <div>GSTIN: {seller.gstin}</div>}
              {f.placeOfSupply && <div>Place of supply: {f.placeOfSupply}</div>}
              {f.stateCode && <div>State Code: {f.stateCode}</div>}
              {seller.phone && <div>Mobile: {seller.phone}</div>}
            </div>
          </div>
          <table className="mi-table">
            <thead><tr><th>Description</th><th className="r">Amount</th></tr></thead>
            <tbody>
              <tr><td>Shipping charges (HSN Code - 996812)</td><td className="r">{money(f.shippingPaise)}</td></tr>
              <tr><td>IGST @ 18%</td><td className="r">{money(f.igst)}</td></tr>
              <tr><td>SGST @ 9%</td><td className="r">{money(f.sgst)}</td></tr>
              <tr><td>CGST @ 9%</td><td className="r">{money(f.cgst)}</td></tr>
            </tbody>
          </table>
          <div className="mi-net">Net Payable: {money(f.netPaise)}</div>
          {(co.bank || co.accountNo) && (
            <div className="mi-bank">
              <p>Kindly remit the net payable amount to the below mentioned account<br />(Ignore if already paid):</p>
              <p><b>Bank Details:</b><br />
                {(co.bankAccountName || co.name) && <><b>Name:</b> {co.bankAccountName || co.name}<br /></>}
                {co.bank && <><b>Bank:</b> {co.bank}<br /></>}
                {co.accountNo && <><b>Account No.:</b> {co.accountNo}<br /></>}
                {co.ifsc && <><b>IFSC Code:</b> {co.ifsc}<br /></>}
                {co.branch && <><b>Branch:</b> {co.branch}</>}
              </p>
            </div>
          )}
          <footer className="mi-foot">
            {co.regdOffice && <div><b>Regd. Office:</b> {co.regdOffice}</div>}
            <div>This is a computer generated invoice no signature is required</div>
          </footer>
        </main>
      )}
    </div>
  );
}

const CSS = `
@page { size: A4; margin: 0; }
.mi-root { min-height: 100vh; background: #e9edf2; color: #111; font-family: Georgia, 'Times New Roman', serif; }
.mi-bar { position: sticky; top: 0; z-index: 5; display: flex; align-items: center; gap: 12px; padding: 10px 20px; background: #fff; border-bottom: 1px solid #d5dce4; font-family: Arial, Helvetica, sans-serif; }
.mi-bar b { margin-right: auto; font-size: 15px; }
.mi-bar button { height: 36px; border-radius: 8px; border: 1px solid #3877fc; background: #3877fc; color: #fff; padding: 0 12px; font-size: 13px; font-weight: 700; cursor: pointer; }
.mi-bar button:disabled { opacity: .5; cursor: not-allowed; }
.mi-msg { text-align: center; padding: 40px; font-size: 14px; color: #52677a; font-family: Arial, Helvetica, sans-serif; }
.mi-err { color: #b23a2b; }
.mi-page { box-sizing: border-box; width: 210mm; min-height: 297mm; margin: 20px auto; padding: 16mm 14mm; background: #fff; font-size: 13px; line-height: 1.55; box-shadow: 0 2px 14px rgba(20,44,66,.18); }
.mi-title { margin: 0 0 18px; text-align: center; font-size: 20px; text-decoration: underline; }
.mi-head { display: flex; justify-content: flex-end; text-align: right; margin-bottom: 26px; }
.mi-parties { display: flex; justify-content: space-between; gap: 30px; margin-bottom: 26px; }
.mi-parties > div { width: 48%; }
.mi-right { text-align: right; }
.mi-pre { white-space: pre-line; }
.mi-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.mi-table th { background: #eee; padding: 9px 6px; text-align: left; border-bottom: 1px solid #ddd; }
.mi-table td { padding: 9px 6px; border-bottom: 1px solid #eee; }
.mi-table .r { text-align: right; }
.mi-net { width: 50%; margin: 0 0 0 auto; padding: 10px 6px; border-top: 2px solid #eee; text-align: right; font-weight: 700; font-size: 15px; }
.mi-bank { margin-top: 18px; padding: 14px 12px; border-top: 1px solid #ddd; }
.mi-bank p { margin: 0 0 14px; }
.mi-foot { margin-top: 40px; padding-top: 10px; border-top: 1px solid #ddd; text-align: center; font-size: 11.5px; }
@media print { .mi-root { background: #fff; } .mi-bar { display: none; } .mi-page { margin: 0; box-shadow: none; } }
`;
