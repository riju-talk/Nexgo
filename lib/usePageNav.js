'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from './api';

/**
 * Numbered pagination: one page of a list at a time, with page and page-size controls (see <Pagination> in components/Kit.jsx).
 *   const nav = usePageNav({ name: 'track', fetchPage: (page, size) => apiFetch(...).then((x) => ({ items: x.items, total: x.total })), deps: [tab, filters] });
 *   nav.items / nav.total / nav.page / nav.pages / nav.size / nav.loading / nav.error / nav.setPage(n) / nav.setSize(n) / nav.reload() / nav.refreshQuiet()
 * Anything in `deps` changing goes back to page 1. The chosen page size is remembered per `name` (in this browser only).
 */
export const PAGE_SIZES = [15, 25, 50, 100];
const sizeKey = (name) => `nx-page-size:${name}`;
function readSize(name, fallback) {
  try { const v = Number(localStorage.getItem(sizeKey(name))); return PAGE_SIZES.includes(v) ? v : fallback; } catch { return fallback; }
}

export function usePageNav({ name = 'list', fetchPage, deps = [], defaultSize = 25, enabled = true, every = 0 }) {
  const depsKey = JSON.stringify(deps);
  const [size, setSizeState] = useState(() => readSize(name, defaultSize));
  // The page belongs to one set of filters: a different set starts again at page 1 without any effect.
  const [nav, setNav] = useState({ key: depsKey, page: 1 });
  const page = nav.key === depsKey ? nav.page : 1;
  const [tick, setTick] = useState(0);
  const [state, setState] = useState({ items: [], total: undefined, loading: true, error: null, started: false, extra: {} });
  const fetchRef = useRef(fetchPage);
  useEffect(() => { fetchRef.current = fetchPage; });
  const seq = useRef(0);

  const run = useCallback(async (quiet) => {
    const id = ++seq.current;
    if (!quiet) setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const x = await fetchRef.current(page, size);
      if (id !== seq.current) return; // an answer for an older page / filter must never replace this one
      const total = x.total ?? 0;
      // The page ran out (rows were deleted or cancelled meanwhile): show the last page that still exists.
      if (!x.items.length && page > 1 && total > 0) { setNav({ key: depsKey, page: Math.max(1, Math.ceil(total / size)) }); return; }
      setState({ items: x.items, total, loading: false, error: null, started: true, extra: x.extra || {} });
    } catch (e) {
      if (id !== seq.current) return;
      setState((s) => ({ ...s, loading: false, error: e, started: true }));
    }
  }, [page, size, depsKey]);

  useEffect(() => {
    if (!enabled) return undefined;
    run(false);
    return () => { seq.current += 1; };
  }, [run, tick, enabled]);

  useEffect(() => {
    if (!every || !enabled) return undefined;
    const timer = setInterval(() => { if (document.visibilityState === 'visible') run(true); }, every);
    return () => clearInterval(timer);
  }, [every, enabled, run]);

  const total = state.total;
  const pages = Math.max(1, Math.ceil((total || 0) / size));
  const setPage = useCallback((n) => setNav({ key: depsKey, page: Math.min(Math.max(1, Math.floor(n) || 1), pages) }), [depsKey, pages]);
  const setSize = useCallback((n) => {
    if (!PAGE_SIZES.includes(n)) return;
    try { localStorage.setItem(sizeKey(name), String(n)); } catch { /* the choice just is not remembered */ }
    setSizeState(n); setNav({ key: depsKey, page: 1 });
  }, [name, depsKey]);
  return { ...state, page, pages, size, setPage, setSize, reload: () => setTick((t) => t + 1), refreshQuiet: () => run(true), hasMore: false, loadingMore: false, loadMore: () => {} };
}

/**
 * Numbered pagination for the many screens that read `GET <path>?<query>&page=&pageSize=` and get { items, total } (or { items, total, pages }).
 * `query` is the filter string WITHOUT page / pageSize; `tick` starts again; the first answer's other fields are in `extra`.
 */
export function usePagedNav({ path, query = '', name, defaultSize = 25, tick = 0, enabled = true, every = 0 }) {
  const nav = usePageNav({
    name: name || path, defaultSize, enabled, every, deps: [path, query, tick],
    fetchPage: (page, size) => {
      const p = new URLSearchParams(query); p.set('page', String(page)); p.set('pageSize', String(size));
      return apiFetch(`${path}?${p}`).then((x) => { const { items, ...rest } = x; return { items: items || [], total: x.total ?? (items || []).length, extra: rest }; });
    },
  });
  const e = nav.error;
  const message = e ? (e.status === 401 ? 'Sign in to view this data.' : e.message || 'This list could not be loaded.') : '';
  return { ...nav, message, refresh: nav.refreshQuiet };
}
