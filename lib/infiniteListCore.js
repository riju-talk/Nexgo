// The framework-free heart of "load more as you scroll" (used by lib/useInfiniteList.js, tested in tests/infiniteList.test.mjs).
//
// fetchPage(cursor, limit) answers one batch. `cursor` is null for the first batch, then whatever the previous answer returned:
//   cursor lists (Track):  { items, nextCursor | null, total? }
//   page lists (older endpoints): { items, page, pages, total? }  -> the cursor is the next page number
// Rules this guarantees, so every screen behaves the same way:
//  - an answer that arrives after the list was reset (new filter, new tab) is ignored: the newest request always wins;
//  - a row that appears in two batches (a new order shifted the pages) is shown once;
//  - only one batch is requested at a time, and nothing is requested once the end is reached;
//  - a failed batch keeps what is already on screen and can be retried (loadMore again).

export function createListLoader({ fetchPage, pageSize = 50, idOf = (row) => row.id }) {
  let state = { items: [], total: null, hasMore: true, loading: false, loadingMore: false, error: null, started: false };
  let epoch = 0;
  let cursor = null;
  const subscribers = new Set();
  const set = (patch) => { state = { ...state, ...patch }; subscribers.forEach((fn) => fn(state)); };

  const nextFrom = (res) => {
    if (res.nextCursor !== undefined) return { cursor: res.nextCursor, hasMore: res.nextCursor !== null && res.nextCursor !== '' };
    const page = Number(res.page || 1); const pages = Number(res.pages || 1);
    return { cursor: page + 1, hasMore: page < pages };
  };

  async function run(my, first) {
    try {
      const res = await fetchPage(first ? null : cursor, pageSize);
      if (my !== epoch) return; // reset while this request was on its way: drop it
      const seen = new Set(first ? [] : state.items.map(idOf));
      const fresh = (res.items || []).filter((row) => { const id = idOf(row); if (id === undefined || id === null) return true; if (seen.has(id)) return false; seen.add(id); return true; });
      const next = nextFrom(res);
      // An empty batch that still claims there is more would loop forever: treat it as the end.
      cursor = next.cursor;
      set({ items: first ? fresh : [...state.items, ...fresh], total: res.total ?? state.total, hasMore: next.hasMore && (res.items || []).length > 0, loading: false, loadingMore: false, error: null });
    } catch (error) {
      if (my !== epoch) return;
      set({ error, loading: false, loadingMore: false });
    }
  }

  return {
    get state() { return state; },
    subscribe(fn) { subscribers.add(fn); return () => { subscribers.delete(fn); }; },
    /** Start again from the top (new filter / tab / Refresh). */
    reset() { epoch += 1; cursor = null; set({ items: [], total: null, hasMore: true, loading: true, loadingMore: false, error: null, started: true }); return run(epoch, true); },
    /** The next batch; does nothing while one is loading or at the end. */
    loadMore() {
      if (!state.started || state.loading || state.loadingMore || !state.hasMore) return Promise.resolve();
      set({ loadingMore: true, error: null });
      return run(epoch, false);
    },
    /**
     * Quietly re-read the top of the list. Only when nothing beyond the first batch is on screen are the rows replaced (so nothing jumps under the
     * user's eyes); otherwise just the total is updated and the caller can offer a "refresh" action. Returns true when the rows were replaced.
     */
    async refreshFirst() {
      const my = epoch;
      if (!state.started || state.loading || state.loadingMore) return false;
      try {
        const res = await fetchPage(null, pageSize);
        if (my !== epoch) return false;
        if (state.items.length > pageSize) { set({ total: res.total ?? state.total }); return false; }
        const next = nextFrom(res); cursor = next.cursor;
        set({ items: (res.items || []).filter((row, i, all) => idOf(row) == null || all.findIndex((x) => idOf(x) === idOf(row)) === i), total: res.total ?? state.total, hasMore: next.hasMore && (res.items || []).length > 0 });
        return true;
      } catch { return false; } // a quiet refresh never shows an error
    },
    stop() { epoch += 1; subscribers.clear(); },
  };
}
