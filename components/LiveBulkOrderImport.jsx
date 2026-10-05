'use client';

import { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { apiFetch, ApiError } from '@/lib/api';
import { useAppState } from '@/lib/AppStateContext';
import * as T from '@/lib/theme';

const CARD = { background: 'var(--nx-surface)', border: '1px solid var(--nx-border)', borderRadius: 10, boxShadow: '0 1px 2px rgba(20,44,66,.04), 0 8px 24px rgba(20,44,66,.045)' };
const MAX_ORDERS = 100;
const MAX_ROWS = 500;

// Header text (any case/spacing/punctuation) → field. Kept loose so seller-made sheets import too.
const ALIASES = {
  ordernumber: 'orderNumber', orderid: 'orderNumber', orderno: 'orderNumber',
  customername: 'customerName', consigneename: 'customerName', fullname: 'customerName',
  companyname: 'companyName', company: 'companyName',
  phone: 'phone', mobile: 'phone', phonenumber: 'phone', alternatephone: 'alternatePhone', altphone: 'alternatePhone',
  email: 'email', address: 'address', addressline1: 'address', addressline2: 'address2', landmark: 'landmark',
  city: 'city', state: 'state', pincode: 'pincode', postcode: 'pincode', pin: 'pincode',
  sku: 'sku', productname: 'productName', product: 'productName', hsn: 'hsn', hsncode: 'hsn',
  quantity: 'quantity', qty: 'quantity', unitprice: 'price', price: 'price', unitpricers: 'price',
  weightg: 'weight', unitweightg: 'weight', weight: 'weight',
  lengthcm: 'length', breadthcm: 'width', widthcm: 'width', heightcm: 'height',
  paymentmode: 'paymentMode', payment: 'paymentMode', codamount: 'codAmount', cod: 'codAmount',
};
const cleanKey = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const text = (value) => String(value ?? '').trim();
const toPaise = (value) => Math.round((Number(value) || 0) * 100);
const inr = (paise) => `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function Action({ children, onClick, primary = false, disabled = false }) {
  return <button type="button" disabled={disabled} onClick={onClick} style={{ minHeight: 36, padding: '0 13px', borderRadius: 9, border: `1px solid ${primary ? T.NAVY : T.INPUT_BORDER}`, background: primary ? T.NAVY : T.SURFACE, color: primary ? '#fff' : T.TEXT, fontSize: 12.5, fontWeight: 750, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.55 : 1 }}>{children}</button>;
}

// Finds the header row (the first row with an "Order number" column) so title or
// instruction rows above the table don't break the import.
function readRows(workbook) {
  for (const name of workbook.SheetNames) {
    const grid = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: '', blankrows: false });
    const headerIndex = grid.findIndex((row) => row.some((cell) => ALIASES[cleanKey(cell)] === 'orderNumber'));
    if (headerIndex < 0) continue;
    const fields = grid[headerIndex].map((cell) => ALIASES[cleanKey(cell)]);
    return grid.slice(headerIndex + 1)
      .map((cells, offset) => {
        const row = { line: headerIndex + offset + 2 };
        fields.forEach((field, i) => { if (field && row[field] === undefined) row[field] = text(cells[i]); });
        return row;
      })
      .filter((row) => fields.some((field) => field && row[field]));
  }
  return null;
}

// Rows sharing an order number become one order with several items; customer,
// payment and package come from the order's first row.
function groupOrders(rows, products) {
  const orders = new Map();
  for (const row of rows) {
    const key = row.orderNumber || `__missing_${row.line}`;
    if (!orders.has(key)) orders.set(key, { ...row, lines: [row.line], items: [], errors: [] });
    const order = orders.get(key);
    if (order.lines[0] !== row.line) order.lines.push(row.line);
    const product = row.sku ? products.find((p) => p.sku?.toLowerCase() === row.sku.toLowerCase()) : null;
    order.items.push({
      productId: product?.id, sku: row.sku || product?.sku || 'CUSTOM', name: row.productName || product?.name || '',
      hsn: row.hsn || product?.hsn_code || '', quantity: Number(row.quantity || 0),
      pricePaise: row.price !== '' && row.price !== undefined ? toPaise(row.price) : Number(product?.unit_price_paise || 0),
      weight: Number(row.weight || product?.weight_g || 0), line: row.line,
    });
  }
  return [...orders.values()].map((order) => validate(order));
}

function validate(order) {
  const errors = [];
  const paymentMode = order.paymentMode?.toLowerCase() === 'cod' ? 'cod' : 'prepaid';
  const phone = (order.phone || '').replace(/\D/g, '').slice(-10);
  const alternatePhone = (order.alternatePhone || '').replace(/\D/g, '').slice(-10);
  if (!order.orderNumber) errors.push('Order number is required');
  if (!order.customerName || order.customerName.length < 2) errors.push('Customer name is required');
  if (!/^[6-9]\d{9}$/.test(phone)) errors.push('Enter a valid 10-digit phone');
  if (alternatePhone && !/^[6-9]\d{9}$/.test(alternatePhone)) errors.push('Alternate phone must be a 10-digit number');
  if (!order.address || order.address.length < 3) errors.push('Address is required');
  if (!/^\d{6}$/.test(order.pincode || '')) errors.push('Enter a 6-digit pincode');
  order.items.forEach((item) => {
    const at = order.items.length > 1 ? ` (row ${item.line})` : '';
    if (!item.name || item.name.length < 2) errors.push(`Product name or a saved SKU is required${at}`);
    if (!(item.quantity > 0 && Number.isInteger(item.quantity))) errors.push(`Quantity must be a whole number${at}`);
    if (item.hsn && !/^\d{4,8}$/.test(item.hsn)) errors.push(`HSN must be 4–8 digits${at}`);
  });
  const weightG = order.items.reduce((sum, item) => sum + item.quantity * item.weight, 0);
  if (!(weightG > 0)) errors.push('Weight (g) is required');
  const dims = [order.length, order.width, order.height].map((v) => Math.round((Number(v) || 0) * 10));
  const dimCount = dims.filter((d) => d > 0).length;
  if (dimCount !== 0 && dimCount !== 3) errors.push('Give length, breadth and height together');
  const subtotal = order.items.reduce((sum, item) => sum + item.quantity * item.pricePaise, 0);
  // Blank COD amount on a COD order means "collect the order value".
  const codAmountPaise = paymentMode === 'cod' ? (order.codAmount ? toPaise(order.codAmount) : subtotal) : 0;
  if (paymentMode === 'cod' && !(codAmountPaise > 0)) errors.push('COD orders need a value to collect');
  if (paymentMode === 'cod' && codAmountPaise > subtotal) errors.push('COD amount cannot exceed the order value');
  return { ...order, phone, alternatePhone, paymentMode, codAmountPaise, subtotal, weightG, dims: dimCount === 3 ? dims : null, errors, quote: null };
}

function downloadErrorReport(orders, fileName) {
  const rows = orders.filter((o) => o.errors.length || o.failure).map((o) => ({ 'Order number': o.orderNumber || '', 'Sheet rows': o.lines.join(', '), Problem: o.failure || o.errors.join('; ') }));
  const sheet = XLSX.utils.json_to_sheet(rows);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'Errors');
  XLSX.writeFile(book, `${fileName.replace(/\.[^.]+$/, '') || 'bulk-orders'}-errors.xlsx`);
}

export default function LiveBulkOrderImport({ mobile, embedded = false }) {
  const { nav, showToast } = useAppState();
  const inputRef = useRef(null);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState('');
  const [result, setResult] = useState(null);

  const importFile = async (file) => {
    if (!file) return;
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) return showToast('Upload an .xlsx, .xls or .csv file.', 'error');
    if (file.size > 5 * 1024 * 1024) return showToast('Use a file smaller than 5 MB.', 'error');
    setLoading(true); setOrders([]); setResult(null); setFileName(file.name);
    try {
      const [warehouseData, productData] = await Promise.all([apiFetch('/v1/warehouses'), apiFetch('/v1/products')]);
      const warehouse = (warehouseData.items || []).find((w) => w.is_active !== false);
      if (!warehouse) throw new Error('Add an active pickup warehouse before importing orders.');
      const rows = readRows(XLSX.read(await file.arrayBuffer(), { type: 'array' }));
      if (!rows) throw new Error('No "Order number" column found. Start from the NEXGO template.');
      if (!rows.length) throw new Error('The sheet has headers but no order rows.');
      if (rows.length > MAX_ROWS) throw new Error(`Import up to ${MAX_ROWS} rows at a time.`);
      const grouped = groupOrders(rows, productData.items || []).map((o) => ({ ...o, warehouseId: warehouse.id }));
      if (grouped.length > MAX_ORDERS) throw new Error(`Import up to ${MAX_ORDERS} orders at a time.`);

      // Resolve city/state from pincode where the sheet left them blank.
      const located = await Promise.all(grouped.map(async (o) => {
        if (o.errors.length || (o.city && o.state)) return o;
        try { const l = await apiFetch(`/v1/locations/pincode/${o.pincode}`); return { ...o, city: o.city || l.city, state: o.state || l.state, located: true }; }
        catch { return { ...o, errors: [...o.errors, 'City and state not found for this pincode — add them to the sheet'] }; }
      }));
      // Indicative cheapest rate for the chargeable weight; booking happens later from All orders.
      const quoted = await Promise.all(located.map(async (o) => {
        if (o.errors.length) return o;
        try {
          const body = { destinationPincode: o.pincode, weightG: o.weightG, paymentMode: o.paymentMode, ...(o.dims ? { lengthMm: o.dims[0], widthMm: o.dims[1], heightMm: o.dims[2] } : {}) };
          const response = await apiFetch('/v1/shipping/quotes', { method: 'POST', body });
          return { ...o, quote: response.quotes?.[0] || null, quoteCount: response.quotes?.length || 0 };
        } catch { return o; }
      }));
      setOrders(quoted);
      const invalid = quoted.filter((o) => o.errors.length).length;
      showToast(invalid ? `${quoted.length - invalid} orders ready. ${invalid} need fixing.` : `${quoted.length} orders ready to create.`, invalid ? 'error' : 'success');
    } catch (error) {
      showToast(error instanceof ApiError ? error.message : error.message || 'Unable to read this file.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const validOrders = orders.filter((o) => !o.errors.length && !o.created);
  const createOrders = async () => {
    if (!validOrders.length) return;
    setCreating(true);
    const outcome = new Map();
    for (const o of validOrders) {
      try {
        await apiFetch('/v1/orders', { method: 'POST', body: {
          warehouseId: o.warehouseId, orderNumber: o.orderNumber, orderFlow: 'forward', notes: 'Created from bulk order upload',
          paymentMode: o.paymentMode, codAmountPaise: o.codAmountPaise,
          customer: { fullName: o.customerName, companyName: o.companyName || undefined, email: o.email || undefined, phone: o.phone, alternatePhone: o.alternatePhone || undefined, addressLine1: o.address, addressLine2: o.address2 || undefined, landmark: o.landmark || undefined, city: o.city, state: o.state, pincode: o.pincode },
          items: o.items.map((i) => ({ productId: i.productId, sku: i.sku, name: i.name, hsnCode: i.hsn || undefined, quantity: i.quantity, unitPricePaise: i.pricePaise, weightG: Math.round(i.weight) })),
          package: { weightG: o.weightG, ...(o.dims ? { lengthMm: o.dims[0], widthMm: o.dims[1], heightMm: o.dims[2] } : {}) },
        } });
        outcome.set(o.orderNumber, { created: true });
      } catch (error) {
        outcome.set(o.orderNumber, { failure: error instanceof ApiError ? error.message : 'Not created' });
      }
    }
    const next = orders.map((o) => (outcome.has(o.orderNumber) ? { ...o, ...outcome.get(o.orderNumber) } : o));
    setOrders(next);
    setCreating(false);
    const created = next.filter((o) => o.created).length;
    const failed = next.filter((o) => o.errors.length || o.failure).length;
    setResult({ total: next.length, created, failed });
    if (created) showToast(`${created} order${created === 1 ? '' : 's'} created. Book couriers from All orders.`);
    if (failed) showToast(`${failed} order${failed === 1 ? '' : 's'} not created — download the error report.`, 'error');
  };

  const onDrop = (e) => { e.preventDefault(); setDragging(false); importFile(e.dataTransfer.files?.[0]); };
  const failedCount = orders.filter((o) => o.errors.length || o.failure).length;

  return (
    <div style={{ flex: 1, padding: embedded ? 0 : mobile ? '14px 12px 42px' : '18px 22px 48px' }}>
      <div style={{ ...CARD, padding: mobile ? 17 : 22 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 18, flexWrap: 'wrap' }}>
          <div>
            <div style={{ color: T.TEXT, fontSize: 17, fontWeight: 780 }}>Bulk upload</div>
            <p style={{ margin: '6px 0 0', maxWidth: 640, color: T.TEXT_SECONDARY, fontSize: 13.5, lineHeight: 1.55 }}>Upload up to {MAX_ORDERS} orders from Excel or CSV. Repeat an order number on several rows to add multiple products to one order. Every order is validated and priced before anything is created.</p>
          </div>
          <a href="/bulk-order-template.xlsx" download style={{ minHeight: 36, display: 'inline-flex', alignItems: 'center', padding: '0 13px', border: `1px solid ${T.INPUT_BORDER}`, borderRadius: 9, color: T.TEXT, background: T.SURFACE, textDecoration: 'none', fontSize: 12.5, fontWeight: 750 }}>Download Excel template</a>
        </div>

        <div
          role="button" tabIndex={0}
          onClick={() => !loading && inputRef.current?.click()}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click(); }}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          style={{ marginTop: 18, padding: mobile ? '26px 14px' : '34px 20px', textAlign: 'center', borderRadius: 12, border: `1.5px dashed ${dragging ? T.ACCENT : T.INPUT_BORDER}`, background: dragging ? 'rgba(0,215,195,.07)' : T.SURFACE_SOFT, cursor: loading ? 'wait' : 'pointer' }}
        >
          <b style={{ display: 'block', color: T.TEXT, fontSize: 14 }}>{loading ? 'Reading and validating…' : 'Drop your order file here, or click to browse'}</b>
          <span style={{ display: 'block', marginTop: 5, color: T.TEXT_MUTED, fontSize: 12.5 }}>{fileName && !loading ? fileName : '.xlsx, .xls or .csv · up to 5 MB'}</span>
          <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; importFile(f); }} />
        </div>
      </div>

      {!!orders.length && (
        <>
          <div style={{ margin: '18px 0 11px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 13, color: T.TEXT_SECONDARY }}>
              <span>Total <b style={{ color: T.TEXT }}>{orders.length}</b></span>
              <span>Ready <b style={{ color: T.GREEN }}>{validOrders.length}</b></span>
              {result && <span>Created <b style={{ color: T.GREEN }}>{result.created}</b></span>}
              <span>Failed <b style={{ color: failedCount ? T.RED : T.TEXT }}>{failedCount}</b></span>
            </div>
            <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
              {failedCount > 0 && <Action onClick={() => downloadErrorReport(orders, fileName)}>Download error report</Action>}
              {result?.created > 0 && <Action onClick={() => nav('orders')}>Go to All orders</Action>}
              <Action primary disabled={!validOrders.length || creating} onClick={createOrders}>{creating ? 'Creating orders…' : `Create ${validOrders.length} order${validOrders.length === 1 ? '' : 's'}`}</Action>
            </div>
          </div>

          <div style={{ display: 'grid', gap: 10 }}>
            {orders.map((o) => {
              const bad = o.errors.length || o.failure;
              const status = o.created ? ['Created', T.GREEN] : bad ? ['Needs attention', T.RED] : ['Ready', T.ACCENT];
              return (
                <div key={o.orderNumber || o.lines[0]} style={{ ...CARD, padding: mobile ? 14 : 16, borderColor: bad ? `${T.RED}80` : 'var(--nx-glass-border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <b style={{ color: T.TEXT, fontSize: 14 }}>{o.orderNumber || 'Missing order number'}</b>
                        <span style={{ padding: '3px 7px', borderRadius: 99, fontSize: 10.5, fontWeight: 800, color: status[1], background: `${status[1]}14` }}>{status[0]}</span>
                        <span style={{ color: T.TEXT_MUTED, fontSize: 11.5 }}>row{o.lines.length > 1 ? 's' : ''} {o.lines.join(', ')}</span>
                      </div>
                      <div style={{ marginTop: 5, color: T.TEXT_SECONDARY, fontSize: 12.5 }}>
                        {o.customerName || 'Customer missing'} · {o.city ? `${o.city}, ` : ''}{o.pincode || '—'} · {o.items.length} product{o.items.length === 1 ? '' : 's'} · {(o.weightG / 1000).toFixed(2)} kg
                        {o.located && <span style={{ color: T.GREEN }}> · location from pincode</span>}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ color: T.TEXT_LABEL, fontSize: 13, fontWeight: 750 }}>{o.paymentMode === 'cod' ? `COD ${inr(o.codAmountPaise)}` : `Prepaid ${inr(o.subtotal)}`}</div>
                      {o.quote && !bad && <div style={{ marginTop: 3, color: T.TEXT_MUTED, fontSize: 11.5 }}>From {inr(Math.round(o.quote.price.total * 100))} · {o.quote.provider.name} ({o.quoteCount} option{o.quoteCount === 1 ? '' : 's'})</div>}
                      {!o.quote && !bad && <div style={{ marginTop: 3, color: T.AMBER, fontSize: 11.5 }}>No serviceable courier yet</div>}
                    </div>
                  </div>
                  {bad && <div style={{ marginTop: 10, padding: '9px 11px', borderRadius: 9, background: `${T.RED}0D`, color: T.RED, fontSize: 12.5, lineHeight: 1.5 }}>{o.failure || o.errors.join(' · ')}</div>}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
