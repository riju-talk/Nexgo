// In-app replacements for window.confirm / window.prompt, so the browser never pops its own "mynexgo.com says" box.
// askConfirm() resolves true / false; askText() resolves the typed text, or null when cancelled.
// Both are drawn by <DialogHost /> (mounted once in the root layout).
export const DIALOG_EVENT = 'nx:dialog';

function open(detail) {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') { resolve(detail.kind === 'text' ? null : false); return; }
    window.dispatchEvent(new CustomEvent(DIALOG_EVENT, { detail: { ...detail, resolve } }));
  });
}

export const askConfirm = ({ title = 'Please confirm', message = '', confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false } = {}) =>
  open({ kind: 'confirm', title, message, confirmLabel, cancelLabel, danger });

export const askText = ({ title = 'Enter a value', message = '', label = '', placeholder = '', confirmLabel = 'Save', cancelLabel = 'Cancel', minLength = 1 } = {}) =>
  open({ kind: 'text', title, message, label, placeholder, confirmLabel, cancelLabel, minLength });
