// The NEXGO bulk order sheet: one definition used by the Excel template (scripts/build-bulk-template.mjs), the CSV template and the
// "failed orders" re-upload file, so all three always have the same columns in the same order.
// `required: true` columns are marked with * in the header (and coloured red in the Excel file).
// Payment mode comes right after the order number, with Prepaid listed before COD.
export const TEMPLATE_COLUMNS = [
  { key: 'orderNumber', header: 'Order number', required: true, width: 16, help: 'Your own order ID. Repeat it on several rows for an order with several products (max 5).' },
  { key: 'paymentMode', header: 'Payment mode', required: true, width: 14, list: ['Prepaid', 'COD'], help: 'Prepaid or COD.' },
  { key: 'codAmount', header: 'COD amount', width: 13, help: 'Amount to collect. Leave blank on a COD order to collect the order value. Leave blank on Prepaid.' },
  { key: 'customerName', header: 'Customer name', required: true, width: 20, help: 'Name of the person receiving the parcel.' },
  { key: 'phone', header: 'Phone', required: true, width: 14, help: '10-digit mobile number starting 6-9.' },
  { key: 'alternatePhone', header: 'Alternate phone', width: 15, help: 'Optional second 10-digit number.' },
  { key: 'email', header: 'Email', width: 22, help: 'Optional.' },
  { key: 'companyName', header: 'Company name', width: 18, help: 'Optional, for business deliveries.' },
  { key: 'address', header: 'Address line 1', required: true, width: 28, help: 'House / flat number and street.' },
  { key: 'address2', header: 'Address line 2', width: 22, help: 'Optional.' },
  { key: 'landmark', header: 'Landmark', width: 18, help: 'Optional, helps the delivery agent.' },
  { key: 'pincode', header: 'Pincode', required: true, width: 10, help: '6-digit delivery pincode.' },
  { key: 'city', header: 'City', width: 14, help: 'Optional: filled automatically from the pincode when blank.' },
  { key: 'state', header: 'State', width: 16, help: 'Optional: filled automatically from the pincode when blank.' },
  { key: 'warehouseName', header: 'Pickup warehouse', width: 20, help: 'Name of the pickup warehouse exactly as in Settings > Warehouse. Leave blank to use the warehouse chosen on the upload page.' },
  { key: 'warehouseAddress', header: 'Pickup warehouse address', width: 30, help: 'Address (or pincode) of the pickup warehouse. Use it instead of the name, or with it. Leave blank to use the warehouse chosen on the upload page.' },
  { key: 'sku', header: 'SKU', width: 14, help: 'A SKU saved in your catalog auto-fills product name, HSN, price and weight.' },
  { key: 'productName', header: 'Product name', required: true, width: 22, help: 'Required unless the SKU is saved in your catalog.' },
  { key: 'hsn', header: 'HSN code', width: 12, help: 'Optional, 4 to 8 digits.' },
  { key: 'quantity', header: 'Quantity', required: true, width: 10, help: 'Whole number.' },
  { key: 'price', header: 'Unit price', required: true, width: 12, help: 'Price of one unit in rupees.' },
  { key: 'weight', header: 'Weight (g)', required: true, width: 11, help: 'Weight of one unit in grams.' },
  { key: 'length', header: 'Length (cm)', required: true, width: 11, help: 'Parcel length in cm.' },
  { key: 'width', header: 'Breadth (cm)', required: true, width: 12, help: 'Parcel breadth in cm.' },
  { key: 'height', header: 'Height (cm)', required: true, width: 11, help: 'Parcel height in cm.' },
];

// The header text as written in the files: mandatory columns carry a * so they stand out even in CSV.
export const columnHeader = (c) => (c.required ? `${c.header} *` : c.header);
export const TEMPLATE_HEADERS = TEMPLATE_COLUMNS.map(columnHeader);

const row = (v) => TEMPLATE_COLUMNS.map((c) => v[c.key] ?? '');
export const TEMPLATE_SAMPLE_ROWS = [
  row({ orderNumber: 'BULK-10001', paymentMode: 'Prepaid', customerName: 'Aarav Mehta', phone: '9876543210', email: 'aarav@example.com', address: '24 Residency Road', address2: 'Shanthala Nagar', landmark: 'Near Garuda Mall', pincode: '560001', city: 'Bengaluru', state: 'Karnataka', warehouseName: 'Main warehouse', warehouseAddress: '14 Industrial Area, Mumbai 400001', sku: 'DEMO-KIT-01', productName: 'NEXGO Demo Kit', hsn: '49119990', quantity: 1, price: 1299.5, weight: 500, length: 20, width: 15, height: 10 }),
  row({ orderNumber: 'BULK-10002', paymentMode: 'COD', customerName: 'Priya Sharma', phone: '9811122233', alternatePhone: '9811122234', companyName: 'Sharma Traders', address: 'B-14 Lajpat Nagar II', pincode: '110024', productName: 'Cotton Kurta', hsn: '62114200', quantity: 2, price: 799, weight: 350, length: 30, width: 25, height: 5 }),
  row({ orderNumber: 'BULK-10002', paymentMode: 'COD', customerName: 'Priya Sharma', phone: '9811122233', alternatePhone: '9811122234', companyName: 'Sharma Traders', address: 'B-14 Lajpat Nagar II', pincode: '110024', productName: 'Silk Dupatta', hsn: '62143000', quantity: 1, price: 499, weight: 150, length: 30, width: 25, height: 5 }),
];

export const TEMPLATE_INSTRUCTIONS = [
  ['NEXGO bulk order import: how to fill the Orders sheet', ''],
  ['', ''],
  ['Colour key', 'RED header with a * = mandatory. BLUE header = optional. Mandatory cells are shaded yellow.'],
  ['Multiple products', 'Repeat the same Order number on several rows (one row per product, maximum 5 products per order). Customer, payment and package columns are read from the first row of that order.'],
  ['Payment mode', 'Choose Prepaid or COD from the list. Prepaid is listed first.'],
  ['Pickup warehouse', 'Optional. Type the warehouse name exactly as in Settings > Warehouse, or its address / pincode. Blank = the warehouse selected on the upload page.'],
  ['City / State', 'Optional. Filled automatically from the pincode when left blank.'],
  ['SKU', 'Use a SKU saved in your catalog to auto-fill product name, HSN, price and weight.'],
  ['Parcel size', 'Length, breadth and height (in cm) are mandatory: couriers bill on volumetric weight.'],
  ['Limits', 'Up to 5,000 orders and 20,000 rows per file. Keep the header row as it is. Delete the example rows before uploading.'],
];
