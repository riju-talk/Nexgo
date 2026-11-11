'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from './api';

// A small stale-while-revalidate cache shared by every screen: opening a page shows the last numbers at once, then refreshes them in the
// background. One request per URL at a time (single flight), so many components asking for the same figures cost one call.
const store = new Map(); // url -> { data, at }
const inflight = new Map();

export const getCached = (url) => store.get(url)?.data;
export function clearCached(prefix = '') { for (const k of [...store.keys()]) if (k.startsWith(prefix)) store.delete(k); }

function load(url) {
  if (inflight.has(url)) return inflight.get(url);
  const p = apiFetch(url).then((data) => { store.set(url, { data, at: Date.now() }); return data; }).finally(() => inflight.delete(url));
  inflight.set(url, p);
  return p;
}

/**
 * useLiveQuery(url, { every, enabled }) -> { data, error, loading, refresh }
 * Never shows another URL's numbers: when the dates or filters change, the new URL's cached data (or a loading state) is shown.
 * Refreshes when the tab is shown again and every `every` ms while it is visible. An error is returned, not swallowed.
 */
export function useLiveQuery(url, { every = 30000, enabled = true } = {}) {
  const [state, setState] = useState(() => { const hit = url ? store.get(url) : null; return { data: hit?.data ?? null, error: null, loading: !hit }; });
  const current = useRef(url);

  const run = useCallback(async () => {
    if (!url || !enabled) return;
    try { const data = await load(url); if (current.current === url) setState({ data, error: null, loading: false }); }
    catch (error) { if (current.current === url) setState((s) => ({ ...s, error, loading: false })); }
  }, [url, enabled]);

  useEffect(() => {
    current.current = url;
    const hit = url ? store.get(url) : null;
    setState({ data: hit?.data ?? null, error: null, loading: !hit });
    run();
    const bump = () => { if (document.visibilityState === 'visible') run(); };
    const timer = every ? setInterval(bump, every) : null;
    document.addEventListener('visibilitychange', bump); window.addEventListener('focus', bump);
    return () => { if (timer) clearInterval(timer); document.removeEventListener('visibilitychange', bump); window.removeEventListener('focus', bump); };
  }, [url, run, every]);

  return { ...state, refresh: run };
}
