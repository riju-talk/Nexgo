// Failed (courier not assigned) orders: Excel download, corrected-file parsing and row validation.
// The sheet is keyed by "NEXGO order ID" so a corrected file updates the existing orders instead of creating new ones.

export const SHEET_HEADERS = ['NEXGO order ID', 'Order number', 'Customer name', 'Phone', 'Address line 1', 'Address line 2', 'Landmark', 'City', 'State', 'Pincode', 'Weight (g)', 'Length (cm)', 'Breadth (cm)', 'Height (cm)', 'Payment mode', 'COD amount', 'Issue (fix the cells, then upload this file)'];
const FIELD_BY_HEADER = { nexgoorderid: 'nexgoId', customername: 'customerName', phone: 'phone', addressline1: 'address1', addressline2: 'address2', landmark: 'landmark', city: 'city', state: 'state', pincode: 'pincode', weightg: 'weightG', lengthcm: 'length', breadthcm: 'width', heightcm: 'height', paymentmode: 'paymentMode', codamount: 'codAmount' };
const clean = (v) => String(v || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const text = (v) => String(v ?? '').trim();
const tenDigits = (v) => String(v || '').replace(/\D/g, '').slice(-10);

// Problems that stop a courier being assigned, found from the stored order. Empty list = the order itself looks fine.
export function diagnose(o) {
  const out = [];
  if (!o.customer_name || o.customer_name.trim().length < 2) out.push('Customer name is missing');
  if (!/^[6-9]\d{9}$/.test(tenDigits(o.customer_phone))) out.push('Mobile number is not valid (10 digits starting 6-9)');
  if (!o.customer_address1 || o.customer_address1.trim().length < 3) out.push('Address is missing');
  if (!/^\d{6}$/.test(o.customer_pincode || '')) out.push('Pincode is not valid (6 digits)');
  if (!o.customer_city) out.push('City is missing');
  if (!o.customer_state) out.push('State is missing');
  if (!(Number(o.total_weight_g) > 0)) out.push('Weight is missing');
  if (!o.package_length_mm || !o.package_width_mm || !o.package_height_mm) out.push('Length, breadth and height are missing');
  if (o.payment_mode === 'cod' && !(Number(o.cod_amount_paise) > 0)) out.push('COD amount is missing');
  return out;
}

export function failedSheet(orders) {
  const rows = orders.map((o) => {
    const problems = diagnose(o);
    return [
      o.nexgo_order_id || '', o.order_number || '', o.customer_name || '', o.customer_phone || '', o.customer_address1 || '', o.customer_address2 || '', o.customer_landmark || '', o.customer_city || '', o.customer_state || '', o.customer_pincode || '',
      o.total_weight_g || '', o.package_length_mm ? o.package_length_mm / 10 : '', o.package_width_mm ? o.package_width_mm / 10 : '', o.package_height_mm ? o.package_height_mm / 10 : '',
      o.payment_mode === 'cod' ? 'COD' : 'Prepaid', o.payment_mode === 'cod' ? Number(o.cod_amount_paise || 0) / 100 : '',
      problems.length ? problems.join(' | ') : 'No courier serves this pincode / weight / payment mode, or the wallet balance was too low. Check the details and upload again to retry.',
    ];
  });
  return [SHEET_HEADERS, ...rows];
}

// Reads a corrected sheet (xlsx/xls/csv) into rows keyed by NEXGO order ID. Returns null when that column is not found.
export async function readCorrections(file) {
  const XLSX = await import('xlsx');
  const book = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  for (const name of book.SheetNames) {
    const grid = XLSX.utils.sheet_to_json(book.Sheets[name], { header: 1, defval: '', blankrows: false });
    const headerAt = grid.findIndex((r) => r.some((c) => clean(c) === 'nexgoorderid'));
    if (headerAt < 0) continue;
    const fields = grid[headerAt].map((c) => FIELD_BY_HEADER[clean(c)]);
    return grid.slice(headerAt + 1).map((cells, i) => {
      const row = { line: headerAt + i + 2 };
      fields.forEach((f, c) => { if (f && row[f] === undefined) row[f] = text(cells[c]); });
      return row;
    }).filter((r) => r.nexgoId);
  }
  return null;
}

// Validates one corrected row and builds the PATCH /v1/orders/:id/details body, or lists what is still wrong.
export function toPatch(row) {
  const errors = [];
  const phone = tenDigits(row.phone);
  if (!row.customerName || row.customerName.length < 2) errors.push('Customer name is missing');
  if (!/^[6-9]\d{9}$/.test(phone)) errors.push('Mobile number is not valid (10 digits starting 6-9)');
  if (!row.address1 || row.address1.length < 3) errors.push('Address line 1 is missing');
  if (!row.city) errors.push('City is missing');
  if (!row.state) errors.push('State is missing');
  if (!/^\d{6}$/.test(row.pincode || '')) errors.push('Pincode must be 6 digits');
  const weightG = Math.round(Number(row.weightG));
  if (!(weightG > 0)) errors.push('Weight (g) is missing');
  const dims = [row.length, row.width, row.height].map((v) => Math.round(Number(v) * 10));
  if (dims.some((d) => !(d >= 10))) errors.push('Length, breadth and height (cm) are required');
  const mode = clean(row.paymentMode);
  if (mode !== 'cod' && mode !== 'prepaid') errors.push('Payment mode must be COD or Prepaid');
  const codPaise = Math.round(Number(row.codAmount || 0) * 100);
  if (mode === 'cod' && !(codPaise > 0)) errors.push('COD amount is required for COD orders');
  if (errors.length) return { errors };
  return { errors, body: { customer: { fullName: row.customerName, phone, addressLine1: row.address1, addressLine2: row.address2 || undefined, landmark: row.landmark || undefined, city: row.city, state: row.state, pincode: row.pincode }, paymentMode: mode, codAmountPaise: mode === 'cod' ? codPaise : 0, package: { weightG, lengthMm: dims[0], widthMm: dims[1], heightMm: dims[2] } } };
}
