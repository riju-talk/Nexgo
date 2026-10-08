// Client-side file export. Reports are generated as CSV by the API; XLSX is built here from the same rows,
// so both formats always contain exactly the same data.
export const FORMATS = [['csv', 'CSV'], ['xlsx', 'Excel (.xlsx)']];

export function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = name; document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const csvCell = (v) => { const t = v === null || v === undefined ? '' : String(v); return /[",\n\r]/.test(t) ? `"${t.replaceAll('"', '""')}"` : t; };

// rows: array of arrays, first row = headers.
export async function saveRows(rows, baseName, format = 'csv', sheetName = 'Report') {
  if (format === 'xlsx') {
    const XLSX = await import('xlsx');
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    sheet['!cols'] = rows[0].map((_, c) => ({ wch: Math.min(40, Math.max(10, ...rows.slice(0, 200).map((r) => String(r[c] ?? '').length)) + 2) }));
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, sheetName.slice(0, 31));
    XLSX.writeFile(book, `${baseName}.xlsx`);
    return;
  }
  saveBlob(new Blob([`﻿${rows.map((r) => r.map(csvCell).join(',')).join('\n')}\n`], { type: 'text/csv;charset=utf-8' }), `${baseName}.csv`);
}

// Turns the API's CSV text back into rows (quote-aware) so it can be re-exported as XLSX.
export function parseCsv(text) {
  const rows = []; let row = []; let cell = ''; let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false; } else cell += ch; }
    else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (ch !== '\r') cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  // Numbers become real numbers in Excel; text such as AWBs and pincodes stays text.
  return rows.map((r, i) => (i === 0 ? r : r.map((c) => (/^-?\d+(\.\d+)?$/.test(c) && !/^0\d/.test(c) && c.length < 12 ? Number(c) : c))));
}
