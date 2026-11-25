import { describe, expect, it } from 'vitest';
import { pageOf, pageWithTotal } from '../../../src/lib/paging.js';

describe('pageOf', () => {
  it('page + pageSize', () => expect(pageOf({ page: '3', pageSize: '25' })).toEqual({ limit: 25, offset: 50 }));
  it('limit + offset still work', () => expect(pageOf({ limit: '10', offset: '30' })).toEqual({ limit: 10, offset: 30 }));
  it('caps the size and falls back on rubbish', () => { expect(pageOf({ pageSize: '9999' }).limit).toBe(200); expect(pageOf({ page: '-2', pageSize: 'x' })).toEqual({ limit: 50, offset: 0 }); });
});

describe('pageWithTotal', () => {
  const rows = Array.from({ length: 53 }, (_, i) => ({ id: i }));
  const run = async (sql: string) => { if (sql.startsWith('SELECT count(*)')) return { rows: [{ n: rows.length }] }; const m = sql.match(/LIMIT (\d+) OFFSET (\d+)/)!; return { rows: rows.slice(+m[2], +m[2] + +m[1]) }; };
  it('exact total and hasMore on every page', async () => {
    expect(await pageWithTotal(run, 'q', [], { limit: 25, offset: 0 })).toMatchObject({ total: 53, hasMore: true });
    const last = await pageWithTotal(run, 'q', [], { limit: 25, offset: 50 }); expect(last.items).toHaveLength(3); expect(last).toMatchObject({ total: 53, hasMore: false });
    expect(await pageWithTotal(run, 'q', [], { limit: 25, offset: 100 })).toMatchObject({ items: [], total: 53, hasMore: false });
  });
  it('a short first page needs no count query', async () => { let counted = false; const r = await pageWithTotal(async (s) => { if (s.startsWith('SELECT count')) counted = true; return { rows: [{ id: 1 }] }; }, 'q', [], { limit: 25, offset: 0 }); expect(r.total).toBe(1); expect(counted).toBe(false); });
});
