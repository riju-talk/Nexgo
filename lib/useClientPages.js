'use client';

import { useState } from 'react';
import { PAGE_SIZES, readPageSize, savePageSize } from './usePageNav';

/**
 * Numbered pages over rows that are already in the browser (an uploaded sheet, a short document list). Same control as the server lists: spread `pager` into <Pagination>.
 *   const { items, pager } = useClientPages(rows, 'bulk-results', { resetKey: filter });
 * A different `resetKey` starts again at page 1; when rows disappear the last page that still exists is shown.
 */
export function useClientPages(rows, name, { defaultSize = 25, resetKey = '' } = {}) {
  const [size, setSize] = useState(() => readPageSize(name, defaultSize));
  const [nav, setNav] = useState({ key: resetKey, page: 1 });
  const total = rows?.length ?? 0;
  const pages = Math.max(1, Math.ceil(total / size));
  const page = Math.min(nav.key === resetKey ? nav.page : 1, pages);
  return {
    items: (rows || []).slice((page - 1) * size, page * size),
    pager: {
      page, pages, size, total,
      onPage: (n) => setNav({ key: resetKey, page: Math.min(Math.max(1, Math.floor(n) || 1), pages) }),
      onSize: (n) => { if (!PAGE_SIZES.includes(n)) return; savePageSize(name, n); setSize(n); setNav({ key: resetKey, page: 1 }); },
    },
  };
}
