// Shared money / date formatting for printable documents.
export const rs = (paise) => `Rs. ${(Number(paise || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: Number(paise || 0) % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
export const amount = (paise) => (Number(paise || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const longDate = (v) => (v ? new Date(v).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }) : '—');
export const joinParts = (...parts) => parts.filter((p) => p && String(p).trim()).join(', ');
