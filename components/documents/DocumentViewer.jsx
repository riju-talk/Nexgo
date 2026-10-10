'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import LabelSheet from './LabelSheet';
import InvoiceSheet from './InvoiceSheet';

// Print-ready shipping labels / tax invoices. Open with ?ids=<shipmentId>,<shipmentId>…; "Print / Save as PDF" uses the
// browser's print dialog, so the output is a real vector PDF with selectable text and scannable barcodes.
export default function DocumentViewer({ kind }) {
  const params = useSearchParams();
  const ids = params.get('ids') || '';
  const [state, setState] = useState({ ids: '', items: [], error: '' });
  const [layout, setLayout] = useState('thermal'); // labels: 4×6 in thermal, or four per A4 sheet
  const label = kind === 'label';

  useEffect(() => {
    if (!ids) return undefined;
    let live = true;
    apiFetch(`/v1/shipments/documents?ids=${encodeURIComponent(ids)}`)
      .then((x) => { if (live) setState({ ids, items: x.items || [], error: '' }); })
      .catch((e) => { if (live) setState({ ids, items: [], error: e instanceof ApiError && e.status === 401 ? 'Sign in to print documents.' : e.message || 'The documents could not be loaded.' }); });
    return () => { live = false; };
  }, [ids]);

  const loading = !!ids && state.ids !== ids;
  const { items, error } = ids ? state : { items: [], error: 'No shipments selected.' };
  const page = label ? (layout === 'thermal' ? '4in 6in' : 'A4') : 'A4';

  return (
    <div className={`doc-root ${label ? `doc-${layout}` : 'doc-a4'}`}>
      <style>{CSS.replace('__PAGE__', page)}</style>
      <header className="doc-bar">
        <b>{label ? 'Shipping labels' : 'Tax invoices'}{items.length ? ` · ${items.length}` : ''}</b>
        {label && <select value={layout} onChange={(e) => setLayout(e.target.value)} aria-label="Label size"><option value="thermal">4 × 6 in (thermal printer)</option><option value="a4">A4 sheet (4 labels per page)</option></select>}
        <button type="button" onClick={() => window.print()} disabled={!items.length}>Print / Save as PDF</button>
      </header>
      {loading && <p className="doc-msg">Preparing {label ? 'labels' : 'invoices'}…</p>}
      {!loading && error && <p className="doc-msg doc-err">{error}</p>}
      <main className="doc-pages">
        {!loading && items.map((d) => (label ? <LabelSheet key={d.id} d={d} /> : <InvoiceSheet key={d.id} d={d} />))}
      </main>
    </div>
  );
}

const CSS = `
@page { size: __PAGE__; margin: 0; }
.doc-root { min-height: 100vh; background: #e9edf2; color: #111; font-family: Arial, Helvetica, sans-serif; }
.doc-bar { position: sticky; top: 0; z-index: 5; display: flex; align-items: center; gap: 12px; padding: 10px 20px; background: #fff; border-bottom: 1px solid #d5dce4; }
.doc-bar b { margin-right: auto; font-size: 15px; }
.doc-bar select, .doc-bar button { height: 36px; border-radius: 8px; border: 1px solid #c6d1da; background: #fff; padding: 0 12px; font-size: 13px; }
.doc-bar button { background: #1b9fd6; border-color: #1b9fd6; color: #fff; font-weight: 700; cursor: pointer; }
.doc-bar button:disabled { opacity: .5; cursor: not-allowed; }
.doc-msg { text-align: center; padding: 40px; font-size: 14px; color: #52677a; }
.doc-err { color: #b23a2b; }
.doc-pages { display: flex; flex-direction: column; align-items: center; gap: 18px; padding: 20px; }

/* ---- Shipping label, 4 x 6 in ---- */
.doc-label, .doc-invoice { color: #000; }
.doc-label { box-sizing: border-box; width: 4in; height: 6in; padding: .12in .14in; border: 1.5px solid #000; background: #fff; font-size: 10px; line-height: 1.35; display: flex; flex-direction: column; gap: 6px; page-break-after: always; break-after: page; overflow: hidden; }
.doc-label span, .doc-label div { word-break: break-word; }
.lb-to { display: flex; flex-direction: column; border-bottom: 2px solid #000; padding-bottom: 6px; font-size: 10.5px; }
.lb-name { font-size: 13px; }
.lb-row { display: flex; justify-content: space-between; gap: 8px; }
.lb-meta { border-bottom: 2px solid #000; padding-bottom: 6px; align-items: flex-end; font-size: 10px; }
.lb-center { text-align: center; }
.lb-main { align-items: center; }
.lb-pay { flex: 0 0 34%; text-align: center; }
.lb-paid { font-size: 26px; font-weight: 700; letter-spacing: .04em; }
.lb-cod { font-size: 11px; font-weight: 700; margin-top: 2px; }
.lb-weight { margin-top: 10px; font-size: 10px; }
.lb-awb { flex: 1; text-align: center; }
.lb-courier { font-weight: 700; font-size: 11px; letter-spacing: .06em; }
.lb-dims { font-size: 9.5px; margin-top: 2px; }
.lb-items { width: 100%; border-collapse: collapse; font-size: 10px; }
.lb-items th, .lb-items td { border: 1px solid #000; padding: 3px 5px; text-align: left; }
.lb-items th { text-align: center; }
.lb-items .c { text-align: center; }
.lb-block { display: flex; flex-direction: column; font-size: 10px; margin-top: 2px; }
.lb-sub { font-size: 12px; }
.lb-foot { margin-top: auto; border-top: 1px solid #000; padding-top: 5px; font-size: 7.5px; line-height: 1.3; }
svg { max-width: 100%; }

/* four labels per A4 sheet */
.doc-a4 .doc-pages:has(.doc-label) { display: grid; grid-template-columns: repeat(2, 4in); gap: 0; justify-content: center; }
.doc-a4 .doc-label { width: 4in; height: 5.6in; page-break-after: auto; break-after: auto; }

/* ---- Tax invoice, A4 ---- */
.doc-invoice { box-sizing: border-box; width: 210mm; min-height: 297mm; padding: 14mm 12mm; background: #fff; font-size: 11px; line-height: 1.45; page-break-after: always; break-after: page; }
.iv-title { margin: 0 0 14px; text-align: center; font-size: 17px; letter-spacing: .02em; }
.iv-head { display: flex; justify-content: flex-end; padding-bottom: 10px; border-bottom: 1px solid #777; }
.iv-head-r { text-align: right; font-size: 13px; }
.iv-big { display: block; font-size: 18px; }
.iv-parties { display: flex; justify-content: space-between; gap: 30px; margin-top: 12px; }
.iv-parties > div { width: 48%; }
.iv-right { text-align: right; }
.iv-facts { display: flex; justify-content: space-between; margin: 18px 0 14px; font-size: 13px; line-height: 1.7; }
.iv-table { width: 100%; border-collapse: collapse; margin-bottom: 14px; font-size: 11px; }
.iv-table th { background: #d5d0d1; border: 1px solid #fff; padding: 7px 6px; font-size: 10.5px; text-align: center; }
.iv-table td { background: #eeeeee; border: 1px solid #fff; padding: 8px 6px; }
.iv-table .c { text-align: center; }
.iv-table th.l { text-align: left; }
.iv-charges { width: 76%; margin-left: auto; }
.iv-total { display: flex; width: 76%; margin-left: auto; border: 1px solid #000; font-weight: 700; }
.iv-total div { padding: 7px 10px; }
.iv-total div:first-child { flex: 1; text-align: center; border-right: 1px solid #000; }
.iv-note { width: 76%; margin: 8px 0 0 auto; text-align: right; font-size: 11px; }
.iv-foot { margin-top: 30px; padding-top: 8px; border-top: 1px solid #bbb; font-size: 9.5px; color: #555; }

@media print {
  .doc-root { background: #fff; min-height: 0; }
  .doc-bar { display: none; }
  .doc-pages { display: block; padding: 0; gap: 0; }
  .doc-a4 .doc-pages:has(.doc-label) { display: grid; }
  .doc-label, .doc-invoice { box-shadow: none; margin: 0; }
}
@media screen {
  .doc-label, .doc-invoice { box-shadow: 0 2px 14px rgba(20, 44, 66, .18); }
}
`;
