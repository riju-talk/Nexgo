import { afterEach, describe, expect, it, vi } from 'vitest';
import { LorrigoAdapter } from '../../../src/couriers/lorrigo.js';

// Regression: GET /orders on Lorrigo ignores every filter and lists the newest orders first (10 by default). The order a retry needs to
// reuse was looked up in that first page only, so with more than 10 newer orders the retry failed with "Order Id already exists".
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('Lorrigo: reusing an order that was already sent', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('finds the order on a later page of GET /orders', async () => {
    const pages: Record<string, unknown> = {
      '1': { orders: Array.from({ length: 3 }, (_, i) => ({ id: `new${i}`, orderNumber: `OTHER-${i}` })), hasMore: true },
      '2': { orders: [{ id: 'target-id', orderNumber: 'NX1-abc123' }], hasMore: false },
    };
    const urls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => { urls.push(url); const page = new URL(url).searchParams.get('page') ?? '1'; return json(pages[page]); }));
    const adapter = new LorrigoAdapter('key', 'https://lorrigo.test/api');
    const id = await (adapter as unknown as { findOrderIdByRef(ref: string): Promise<string | null> }).findOrderIdByRef('NX1-abc123');
    expect(id).toBe('target-id');
    expect(urls).toHaveLength(2);
    expect(urls[0]).toContain('limit=100');
  });

  it('gives up cleanly when the order is not on the account', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ orders: [{ id: 'a', orderNumber: 'X' }], hasMore: false })));
    const adapter = new LorrigoAdapter('key', 'https://lorrigo.test/api');
    expect(await (adapter as unknown as { findOrderIdByRef(ref: string): Promise<string | null> }).findOrderIdByRef('NX9-zzzzzz')).toBeNull();
  });
});
