// Opens the label / invoice print page for a selection of shipments, and says honestly how it went (UX-010).
//
// Why not window.open(url, '_blank', 'noopener'): with the "noopener" feature the browser ALWAYS returns null, so a blocked pop-up cannot be told apart from a
// window that opened. It is opened plainly instead, the opener link is cut by hand, and a null / closed window means "blocked".
//
// A few ids travel in the address; a bigger selection (the address would be too long) is handed over through browser storage, which the new tab reads once.
export const MAX_PRINT = 5000;
export const INLINE_MAX = 60;

const defaultEnv = () => ({
  open: (...args) => window.open(...args),
  setItem: (k, v) => window.localStorage.setItem(k, v),
  now: () => Date.now(),
  random: () => Math.random().toString(36).slice(2, 6),
});

/**
 * Returns { status, url?, count }:
 *   opened          a tab opened
 *   blocked         the browser stopped the pop-up; `url` is what to open from a real click (an <a> link is never blocked)
 *   storage_failed  more than INLINE_MAX shipments need browser storage and it is unavailable (private mode, full, disabled)
 *   too_many        more than MAX_PRINT shipments
 *   empty           nothing selected
 */
export function openDocuments(kind, ids, env = defaultEnv()) {
  const list = [...new Set(ids)];
  if (!list.length) return { status: 'empty', count: 0 };
  if (list.length > MAX_PRINT) return { status: 'too_many', count: list.length };
  let url;
  if (list.length <= INLINE_MAX) url = `/documents/${kind}?ids=${list.join(',')}`;
  else {
    const key = `nx-doc-${env.now().toString(36)}${env.random()}`;
    try { env.setItem(key, JSON.stringify(list)); } catch { return { status: 'storage_failed', count: list.length }; }
    url = `/documents/${kind}?batch=${key}`;
  }
  let w = null;
  try { w = env.open(url, '_blank'); } catch { w = null; }
  if (!w || w.closed) return { status: 'blocked', url, count: list.length };
  try { w.opener = null; } catch { /* the tab is already isolated */ }
  return { status: 'opened', url, count: list.length };
}

/** The sentence for each outcome (null when nothing needs saying). */
export function openDocumentsMessage(result, kind = 'label') {
  const noun = kind === 'invoice' ? 'invoice' : 'label';
  switch (result.status) {
    case 'blocked': return `Your browser blocked the ${noun} window. Use the "Open ${result.count} ${noun}${result.count === 1 ? '' : 's'}" link shown on this page, or allow pop-ups for this site.`;
    case 'storage_failed': return `Your browser cannot hold a selection of this size (storage is blocked or full). Select ${INLINE_MAX} or fewer shipments, or allow site storage and try again.`;
    case 'too_many': return `Select up to ${MAX_PRINT.toLocaleString('en-IN')} shipments for one print job (your browser has to draw every page). ${result.count.toLocaleString('en-IN')} are selected.`;
    case 'empty': return 'Select shipments that have an AWB first.';
    default: return null;
  }
}
