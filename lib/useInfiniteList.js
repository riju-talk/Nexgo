'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from './api';
import { createListLoader } from './infiniteListCore';

/**
 * A list that loads its first batch at once and more batches as the user scrolls (see infiniteListCore.js for the rules).
 *   const list = useInfiniteList({ fetchPage: (cursor, limit) => apiFetch(...), pageSize: 50, deps: [tab, filters] });
 *   list.items / list.total / list.loading (first batch) / list.loadingMore / list.hasMore / list.error / list.loadMore() / list.reload()
 * Anything in `deps` changing starts the list again from the top; `fetchPage` itself may change on every render.
 */
export function useInfiniteList({ fetchPage, pageSize = 50, deps = [], enabled = true }) {
  const fetchRef = useRef(fetchPage);
  useEffect(() => { fetchRef.current = fetchPage; });
  const stableFetch = useCallback((cursor, limit) => fetchRef.current(cursor, limit), []); // always calls the latest fetchPage
  const depsKey = JSON.stringify(deps);
  // A new loader per set of dependencies, so an answer for the old filter can never reach the new list.
  const loader = useMemo(() => createListLoader({ fetchPage: stableFetch, pageSize }), [stableFetch, pageSize, depsKey]); // eslint-disable-line react-hooks/exhaustive-deps, react-hooks/refs -- depsKey is the dependency list; stableFetch reads the ref only when a batch is requested, never during render
  const [state, setState] = useState(loader.state);
  useEffect(() => {
    if (!enabled) return undefined;
    setState(loader.state); // eslint-disable-line react-hooks/set-state-in-effect -- show the new loader's empty/loading state at once
    const off = loader.subscribe(setState);
    loader.reset();
    return () => { off(); loader.stop(); };
  }, [loader, enabled]);
  return { ...state, loadMore: loader.loadMore, reload: loader.reset, refreshFirst: loader.refreshFirst };
}

/** Calls `onVisible` whenever the element comes within `margin` px of the viewport (the scroll container can be any ancestor). */
export function useAutoLoad(ref, onVisible, { enabled = true, margin = 400 } = {}) {
  const cb = useRef(onVisible);
  useEffect(() => { cb.current = onVisible; });
  useEffect(() => {
    const el = ref.current;
    if (!enabled || !el || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) cb.current?.(); }, { rootMargin: `0px 0px ${margin}px 0px` });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, enabled, margin]);
}

/**
 * The common case: a screen that reads `GET <path>?<query>&page=&pageSize=` and gets { items, total, pages }.
 * `query` is the filter string WITHOUT page/pageSize; `tick` can be bumped to start again (after an action). Returns the list plus `message`
 * (a plain-language error for the table) and the first answer's extra fields in `extra` (cards above the table).
 */
export function usePagedList({ path, query = '', pageSize = 25, tick = 0, enabled = true, every = 0 }) {
  const [extra, setExtra] = useState({});
  const list = useInfiniteList({
    pageSize, enabled, deps: [path, query, tick],
    fetchPage: (cursor, size) => {
      const p = new URLSearchParams(query); p.set('page', String(cursor || 1)); p.set('pageSize', String(size));
      return apiFetch(`${path}?${p}`).then((x) => {
        if (!cursor) { const { items: _items, ...rest } = x; setExtra(rest); }
        // Some endpoints give only a total: work out how many pages that is.
        return x.pages === undefined && x.total !== undefined ? { ...x, page: Number(cursor || 1), pages: Math.max(1, Math.ceil(Number(x.total) / size)) } : x;
      });
    },
  });
  const listRef = useRef(list);
  useEffect(() => { listRef.current = list; });
  // Quietly re-read the top of the list now (after an action) or every `every` ms while the tab is visible; scrolled-down lists are left alone.
  const refresh = useCallback(async () => { const did = await listRef.current.refreshFirst(); if (!did && !listRef.current.loadingMore && listRef.current.items.length <= pageSize) listRef.current.reload(); }, [pageSize]);
  useEffect(() => {
    if (!every) return undefined;
    const timer = setInterval(() => { if (document.visibilityState === 'visible') listRef.current.refreshFirst(); }, every);
    return () => clearInterval(timer);
  }, [every]);
  const e = list.error;
  const message = e ? (e.status === 401 ? 'Sign in to view this data.' : e.message || 'This list could not be loaded.') : '';
  return { ...list, extra, message, refresh };
}
