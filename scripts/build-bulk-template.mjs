// Builds public/bulk-order-template.xlsx from lib/bulkTemplate.mjs. Run after changing the columns:  node scripts/build-bulk-template.mjs
// (exceljs is a dev dependency: SheetJS cannot write cell colours or drop-down lists.)
import ExcelJS from 'exceljs';
import { TEMPLATE_COLUMNS, TEMPLATE_HEADERS, TEMPLATE_INSTRUCTIONS, TEMPLATE_SAMPLE_ROWS } from '../lib/bulkTemplate.mjs';

const RED = 'FFC62828'; const BLUE = 'FF3877FC'; const YELLOW = 'FFFFF6CC'; const BORDER = { style: 'thin', color: { argb: 'FFB8C4D0' } };
const book = new ExcelJS.Workbook();
const sheet = book.addWorksheet('Orders', { views: [{ state: 'frozen', ySplit: 1 }] });
sheet.columns = TEMPLATE_COLUMNS.map((c, i) => ({ header: TEMPLATE_HEADERS[i], key: c.key, width: Math.max(c.width, TEMPLATE_HEADERS[i].length + 3) }));

const head = sheet.getRow(1); head.height = 32;
TEMPLATE_COLUMNS.forEach((c, i) => {
  const cell = head.getCell(i + 1);
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c.required ? RED : BLUE } };
  cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  cell.border = { top: BORDER, left: BORDER, bottom: BORDER, right: BORDER };
  cell.note = { texts: [{ text: `${c.required ? 'MANDATORY. ' : 'Optional. '}${c.help}` }], margins: { insetmode: 'auto' } };
});
TEMPLATE_SAMPLE_ROWS.forEach((r) => sheet.addRow(r));

// 200 input rows: mandatory cells shaded yellow so they are obvious, text format for phone/pincode so leading digits survive, and a Prepaid/COD list.
const ROWS = 200;
TEMPLATE_COLUMNS.forEach((c, i) => {
  const col = i + 1;
  for (let r = 2; r <= ROWS + 1; r++) {
    const cell = sheet.getCell(r, col);
    if (c.required) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: YELLOW } };
    cell.border = { top: BORDER, left: BORDER, bottom: BORDER, right: BORDER };
    if (['phone', 'alternatePhone', 'pincode', 'hsn', 'orderNumber'].includes(c.key)) cell.numFmt = '@';
    if (c.list) cell.dataValidation = { type: 'list', allowBlank: false, formulae: [`"${c.list.join(',')}"`], showErrorMessage: true, errorTitle: 'Payment mode', error: `Choose ${c.list.join(' or ')}.` };
  }
});

const info = book.addWorksheet('Instructions');
info.columns = [{ width: 24 }, { width: 110 }];
TEMPLATE_INSTRUCTIONS.forEach(([a, b], i) => { const r = info.addRow([a, b]); r.getCell(1).font = { bold: true, size: i === 0 ? 14 : 11 }; r.getCell(2).alignment = { wrapText: true, vertical: 'top' }; });
info.getCell('B3').value = { richText: [{ text: 'RED header with a *', font: { bold: true, color: { argb: RED } } }, { text: ' = mandatory.  ' }, { text: 'BLUE header', font: { bold: true, color: { argb: BLUE } } }, { text: ' = optional.  Mandatory cells are shaded ' }, { text: 'yellow', font: { bold: true, color: { argb: 'FF8A6D00' } } }, { text: '.' }] };
const legend = info.addRow(['', '']); void legend;
info.addRow(['Columns', '']).getCell(1).font = { bold: true };
TEMPLATE_COLUMNS.forEach((c, i) => { const r = info.addRow([TEMPLATE_HEADERS[i], `${c.required ? 'Mandatory. ' : 'Optional. '}${c.help}`]); r.getCell(1).font = { bold: true, color: { argb: c.required ? RED : BLUE } }; r.getCell(2).alignment = { wrapText: true, vertical: 'top' }; });

await book.xlsx.writeFile(new URL('../public/bulk-order-template.xlsx', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
console.log(`Wrote public/bulk-order-template.xlsx (${TEMPLATE_COLUMNS.length} columns, ${TEMPLATE_COLUMNS.filter((c) => c.required).length} mandatory)`);
