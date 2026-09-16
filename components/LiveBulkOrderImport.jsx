'use client';

import { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { apiFetch, ApiError } from '@/lib/api';
import { useAppState } from '@/lib/AppStateContext';
import * as T from '@/lib/theme';

const CARD = { background: 'linear-gradient(165deg,var(--nx-glass-1),var(--nx-glass-2))', backdropFilter: 'blur(18px) saturate(150%)', border: '1px solid var(--nx-glass-border)', borderRadius: 14, boxShadow: '0 12px 30px rgba(15,31,61,.08)' };
const REQUIRED = ['Order number', 'Customer name', 'Phone', 'Address', 'Pincode', 'SKU or Product name', 'Quantity', 'Unit price', 'Weight (g)'];
const aliases = { ordernumber: 'orderNumber', customername: 'customerName', fullname: 'customerName', phone: 'phone', mobile: 'phone', email: 'email', address: 'address', addressline1: 'address', city: 'city', state: 'state', pincode: 'pincode', postcode: 'pincode', sku: 'sku', productname: 'name', name: 'name', quantity: 'quantity', qty: 'quantity', unitprice: 'price', price: 'price', weightg: 'weight', weight: 'weight', paymentmode: 'paymentMode', payment: 'paymentMode', codamount: 'codAmount', cod: 'codAmount' };
const cleanKey = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const text = (value) => String(value ?? '').trim();
const money = (value) => `₹${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function Action({ children, onClick, primary = false, disabled = false, type = 'button' }) {
  return <button type={type} disabled={disabled} onClick={onClick} style={{ minHeight: 36, padding: '0 13px', borderRadius: 9, border: `1px solid ${primary ? T.NAVY : T.INPUT_BORDER}`, background: primary ? T.NAVY : T.SURFACE, color: primary ? '#fff' : T.TEXT, fontSize: 12.5, fontWeight: 750, cursor: disabled ? 'wait' : 'pointer', opacity: disabled ? .58 : 1 }}>{children}</button>;
}

function normalize(source, products) {
  const row = {};
  Object.entries(source).forEach(([key, value]) => { const field = aliases[cleanKey(key)]; if (field) row[field] = text(value); });
  const product = products.find((item) => item.sku?.toLowerCase() === row.sku?.toLowerCase());
  if (product) {
    row.name ||= product.name;
    row.price ||= String(Number(product.unit_price_paise || 0) / 100);
    row.weight ||= String(product.weight_g || '');
    row.productId = product.id;
  }
  row.paymentMode = row.paymentMode?.toLowerCase() === 'cod' ? 'cod' : 'prepaid';
  if (row.paymentMode === 'prepaid') row.codAmount = '0';
  const errors = [];
  if (!row.orderNumber) errors.push('Order number is required');
  if (!row.customerName) errors.push('Customer name is required');
  if (!/^[6-9]\d{9}$/.test(row.phone?.replace(/\D/g, '') || '')) errors.push('Enter a valid 10-digit phone');
  if (!row.address) errors.push('Address is required');
  if (!/^\d{6}$/.test(row.pincode || '')) errors.push('Enter a 6-digit pincode');
  if (!row.sku && !row.name) errors.push('Add a SKU or product name');
  if (!(Number(row.quantity) > 0 && Number.isInteger(Number(row.quantity)))) errors.push('Quantity must be a whole number');
  if (!(Number(row.price) >= 0)) errors.push('Unit price must be 0 or more');
  if (!(Number(row.weight) > 0)) errors.push('Weight must be greater than 0');
  if (row.paymentMode === 'cod' && !(Number(row.codAmount) > 0)) errors.push('COD amount is required for COD orders');
  return { ...row, phone: row.phone?.replace(/\D/g, ''), errors, quotes: [], selectedQuote: 0, locationStatus: '' };
}

export default function LiveBulkOrderImport({ mobile }) {
  const { nav, showToast } = useAppState();
  const inputRef = useRef(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [fileName, setFileName] = useState('');

  const importFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return showToast('Use a file smaller than 5 MB.', 'error');
    setLoading(true); setRows([]); setFileName(file.name);
    try {
      const [warehouseData, productData] = await Promise.all([apiFetch('/v1/warehouses'), apiFetch('/v1/products')]);
      const warehouse = warehouseData.items?.[0];
      if (!warehouse) throw new Error('Create an active warehouse before importing orders.');
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const sourceRows = XLSX.utils.sheet_to_json(firstSheet, { defval: '' });
      if (!sourceRows.length) throw new Error('The first sheet has no order rows.');
      if (sourceRows.length > 100) throw new Error('Import up to 100 rows at a time.');
      const parsed = sourceRows.map((source, index) => ({ id: `${Date.now()}-${index}`, index: index + 1, warehouseId: warehouse.id, ...normalize(source, productData.items || []) }));
      const enriched = await Promise.all(parsed.map(async (row) => {
        if (row.errors.length || row.city || row.state) return row;
        try { const location = await apiFetch(`/v1/locations/pincode/${row.pincode}`); return { ...row, city: location.city, state: location.state, locationStatus: 'Location filled from pincode' }; } catch { return { ...row, locationStatus: 'City and state not found locally' }; }
      }));
      const quoted = await Promise.all(enriched.map(async (row) => {
        if (row.errors.length) return row;
        try { const response = await apiFetch('/v1/shipping/quotes', { method: 'POST', body: { destinationPincode: row.pincode, weightG: Number(row.weight), paymentMode: row.paymentMode } }); return { ...row, quotes: response.quotes || [] }; } catch (error) { return { ...row, errors: [...row.errors, error instanceof ApiError ? error.message : 'Could not find courier options'] }; }
      }));
      setRows(quoted);
      const invalid = quoted.filter((row) => row.errors.length).length;
      showToast(invalid ? `${quoted.length - invalid} rows ready. Fix ${invalid} row${invalid === 1 ? '' : 's'} before creating orders.` : `${quoted.length} rows ready for courier selection.`);
    } catch (error) { showToast(error instanceof ApiError ? error.message : error.message || 'Unable to import this file.', 'error'); setRows([]); }
    finally { setLoading(false); }
  };

  const chooseQuote = (rowId, quoteIndex) => setRows((current) => current.map((row) => row.id === rowId ? { ...row, selectedQuote: quoteIndex } : row));
  const validRows = rows.filter((row) => !row.errors.length);
  const createOrders = async () => {
    if (!validRows.length) return;
    setCreating(true); let created = 0; const failures = [];
    for (const row of validRows) {
      try {
        await apiFetch('/v1/orders', { method: 'POST', body: { warehouseId: row.warehouseId, orderNumber: row.orderNumber, orderFlow: 'forward', notes: 'Created from bulk order upload', paymentMode: row.paymentMode, codAmountPaise: row.paymentMode === 'cod' ? Math.round(Number(row.codAmount) * 100) : 0, customer: { fullName: row.customerName, email: row.email || undefined, phone: row.phone, addressLine1: row.address, city: row.city || 'Unresolved', state: row.state || 'Unresolved', pincode: row.pincode }, items: [{ productId: row.productId, sku: row.sku || 'CUSTOM', name: row.name || 'Custom item', quantity: Number(row.quantity), unitPricePaise: Math.round(Number(row.price) * 100), weightG: Number(row.weight) }] } });
        created += 1;
      } catch (error) { failures.push(`${row.orderNumber}: ${error instanceof ApiError ? error.message : 'not created'}`); }
    }
    setCreating(false);
    if (created) showToast(`${created} order${created === 1 ? '' : 's'} created. Choose and book a courier from All orders.`);
    if (failures.length) showToast(`${failures.length} row${failures.length === 1 ? '' : 's'} could not be created.`, 'error');
    if (created && !failures.length) nav('orders');
  };

  return <div style={{ flex: 1, padding: mobile ? '14px 12px 42px' : '18px 22px 48px' }}>
    <div style={{ ...CARD, padding: mobile ? 17 : 22 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 18, flexWrap: 'wrap' }}>
        <div><div style={{ color: T.TEXT, fontSize: 19, fontWeight: 780, letterSpacing: '-.025em' }}>Bulk order upload</div><p style={{ margin: '6px 0 0', maxWidth: 620, color: T.TEXT_SECONDARY, fontSize: 13.5, lineHeight: 1.55 }}>Import up to 100 orders from Excel or CSV. We validate every row, enrich the destination from pincode and show available courier rates before any order is created.</p></div>
        <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}><a href="/bulk-order-template.xlsx" download style={{ minHeight: 36, display: 'inline-flex', alignItems: 'center', padding: '0 13px', border: `1px solid ${T.INPUT_BORDER}`, borderRadius: 9, color: T.TEXT, background: T.SURFACE, textDecoration: 'none', fontSize: 12.5, fontWeight: 750 }}>Download Excel template</a><Action primary disabled={loading} onClick={() => inputRef.current?.click()}>{loading ? 'Reading file…' : 'Import orders'}</Action><input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" onChange={importFile} hidden /></div>
      </div>
      <div style={{ marginTop: 19, padding: '13px 14px', display: 'grid', gridTemplateColumns: mobile ? '1fr' : 'repeat(3, minmax(0,1fr))', gap: 12, borderRadius: 10, background: T.SURFACE_SOFT, border: `1px solid ${T.BORDER}` }}>
        {['1. Download the template', '2. Import and review rows', '3. Create orders, then book a courier'].map((item) => <div key={item} style={{ color: T.TEXT_LABEL, fontSize: 12.5, fontWeight: 700 }}>{item}</div>)}
      </div>
    </div>

    {!!rows.length && <><div style={{ margin: '18px 0 11px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}><div><b style={{ color: T.TEXT, fontSize: 15 }}>Imported {rows.length} row{rows.length === 1 ? '' : 's'}</b><span style={{ marginLeft: 9, color: T.TEXT_MUTED, fontSize: 12.5 }}>{fileName} · {validRows.length} ready</span></div><Action primary disabled={!validRows.length || creating} onClick={createOrders}>{creating ? 'Creating orders…' : `Create ${validRows.length} valid order${validRows.length === 1 ? '' : 's'}`}</Action></div>
      <div style={{ display: 'grid', gap: 12 }}>{rows.map((row) => <div key={row.id} style={{ ...CARD, padding: mobile ? 15 : 17, borderColor: row.errors.length ? `${T.RED}80` : 'var(--nx-glass-border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}><div><div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}><b style={{ color: T.TEXT, fontSize: 14.5 }}>#{row.index} · {row.orderNumber || 'Missing order number'}</b><span style={{ padding: '3px 7px', borderRadius: 99, fontSize: 10.5, fontWeight: 800, color: row.errors.length ? T.RED : T.GREEN, background: row.errors.length ? `${T.RED}14` : `${T.GREEN}14` }}>{row.errors.length ? 'Needs attention' : 'Ready'}</span></div><div style={{ marginTop: 5, color: T.TEXT_SECONDARY, fontSize: 12.5 }}>{row.customerName || 'Customer missing'} · {row.name || row.sku || 'Product missing'} · {row.quantity || '—'} unit{Number(row.quantity) === 1 ? '' : 's'} · {row.weight || '—'} g</div>{row.locationStatus && <div style={{ marginTop: 4, color: T.TEXT_MUTED, fontSize: 11.5 }}>{row.locationStatus}</div>}</div><div style={{ color: T.TEXT_LABEL, fontSize: 13, fontWeight: 750 }}>{row.paymentMode === 'cod' ? `COD ${money(row.codAmount)}` : 'Prepaid'} · {money(row.price)}</div></div>
        {row.errors.length ? <div style={{ marginTop: 12, padding: '10px 11px', borderRadius: 9, background: `${T.RED}0D`, color: T.RED, fontSize: 12.5, lineHeight: 1.5 }}>{row.errors.join(' · ')}</div> : <div style={{ marginTop: 14 }}><div style={{ marginBottom: 8, color: T.TEXT_LABEL, fontSize: 12.5, fontWeight: 750 }}>Courier options for {row.pincode}</div>{row.quotes.length ? <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : 'repeat(auto-fit,minmax(180px,1fr))', gap: 9 }}>{row.quotes.map((quote, index) => { const selected = row.selectedQuote === index; return <button type="button" key={`${quote.provider.code}-${quote.service.code}`} onClick={() => chooseQuote(row.id, index)} style={{ padding: 12, textAlign: 'left', borderRadius: 10, cursor: 'pointer', border: `1px solid ${selected ? T.ACCENT : T.BORDER}`, background: selected ? 'rgba(0,179,164,.09)' : T.SURFACE, color: T.TEXT }}><span style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><b style={{ fontSize: 12.5 }}>{quote.provider.name}</b><b style={{ fontSize: 13.5 }}>{money(quote.price.total)}</b></span><span style={{ display: 'block', marginTop: 4, color: T.TEXT_MUTED, fontSize: 11.5 }}>{quote.service.name}{selected ? ' · selected' : ''}</span></button>; })}</div> : <div style={{ color: T.TEXT_MUTED, fontSize: 12.5 }}>No courier is available for this serviceability combination.</div>}</div>}
      </div>)}</div></>}
  </div>;
}
