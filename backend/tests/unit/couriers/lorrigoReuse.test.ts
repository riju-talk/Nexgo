import { afterEach, describe, expect, it, vi } from 'vitest';
import { LorrigoAdapter, hasNextPage } from '../../../src/couriers/lorrigo.js';

// The adapter remembers aggregator order ids in our database: here the database is a stub.
const dbQuery = vi.hoisted(() => vi.fn(async (_sql: string, _params?: unknown[]) => ({ rows: [] as unknown[] })));
vi.mock('../../../src/db/client.js', () => ({ db: { query: dbQuery }, withTransaction: vi.fn(), withSellerTransaction: vi.fn() }));

// Regression: GET /orders on Lorrigo ignores every filter and lists the newest orders first (10 by default). The order a retry needs to
// reuse was looked up in that first page only, so with more than 10 newer orders the retry failed with "Order Id already exists".
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('Lorrigo: reusing an order that was already sent', () => {
  afterEach(() => { vi.unstubAllGlobals(); dbQuery.mockClear(); });

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

// Production regression (2026-11-13): 139 orders failed with "Order Id already exists" because Lorrigo answered 400, not 409, for an order that an
// earlier attempt had already created. The order must be found and reused whatever the status code.
describe('Lorrigo: "Order Id already exists" under any status code', () => {
  afterEach(() => { vi.unstubAllGlobals(); dbQuery.mockClear(); dbQuery.mockImplementation(async () => ({ rows: [] })); });
  const details = {
    nexgoOrderId: 'NX26110100001', sellerName: 'Seller', warehouse: { id: 'w1' }, pickupHubId: 'hub-1', externalServiceId: 'svc',
    consignee: { name: 'Buyer', phone: '9876543210', address1: '12 Road', city: 'Howrah', state: 'West Bengal', pincode: '711101' },
    items: [{ name: 'Item', sku: 'S', quantity: 1, unitPricePaise: 50000 }], package: { weightG: 400, lengthMm: 100, widthMm: 100, heightMm: 100 },
  };
  const request = { paymentMode: 'prepaid', codAmountPaise: 0, details } as never;
  type Priv = { createOrReuseOrder(d: unknown, r: unknown, hub: string): Promise<{ id: string; reused?: boolean }>; orderRef(d: unknown, r: unknown): string };

  for (const status of [400, 409, 422]) {
    it(`reuses the existing order when Lorrigo answers ${status}`, async () => {
      const adapter = new LorrigoAdapter('key', 'https://lorrigo.test/api') as unknown as Priv;
      const ref = adapter.orderRef(details, request);
      vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === 'POST' && url.endsWith('/orders')) return json({ message: 'Order Id already exists. Please try with another Order Id.' }, status);
        if (url.includes('/orders?page=')) return json({ orders: [{ id: 'existing-order', orderNumber: ref }], hasMore: false });
        return json({});
      }));
      const out = await adapter.createOrReuseOrder(details, request, 'hub-1');
      expect(out).toMatchObject({ id: 'existing-order', reused: true });
    });
  }

  it('says so plainly (and does not echo the raw message) when the existing order cannot be found', async () => {
    const adapter = new LorrigoAdapter('key', 'https://lorrigo.test/api') as unknown as Priv;
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST' && url.endsWith('/orders')) return json({ message: 'Order Id already exists. Please try with another Order Id.' }, 400);
      return json({ orders: [], hasMore: false });
    }));
    await expect(adapter.createOrReuseOrder(details, request, 'hub-1')).rejects.toThrow(/already with the courier network/);
  });
});

// Production regression (2026-11-14): the order list answers hasMore:false even on page 1 of 3, so the search stopped after the newest 100 orders and
// older ones were "already with the courier network but could not be matched".
describe('Lorrigo: paging the order list', () => {
  afterEach(() => { vi.unstubAllGlobals(); dbQuery.mockClear(); dbQuery.mockImplementation(async () => ({ rows: [] })); });

  it('does not trust hasMore: the page counters decide', () => {
    expect(hasNextPage({ orders: [1], totalPages: 3, hasMore: false }, 1, 100, 100)).toBe(true);
    expect(hasNextPage({ orders: [1], totalPages: 3, hasMore: false }, 3, 28, 100)).toBe(false);
    expect(hasNextPage({ orders: [1], total: 228, hasMore: false }, 2, 100, 100)).toBe(true);
    expect(hasNextPage({ orders: [1], total: 228 }, 3, 28, 100)).toBe(false);
    expect(hasNextPage({ orders: [] , totalPages: 3 }, 1, 0, 100)).toBe(false);
    expect(hasNextPage({ orders: [1], hasMore: true }, 1, 5, 100)).toBe(true);
    expect(hasNextPage({ orders: [1] }, 1, 100, 100)).toBe(true); // nothing else to go by: a full page may have a next one
    expect(hasNextPage({ orders: [1] }, 1, 40, 100)).toBe(false);
  });

  it('finds an order on page 3 although every page says hasMore:false', async () => {
    const pages: Record<string, unknown> = {
      '1': { orders: Array.from({ length: 3 }, (_, i) => ({ id: `a${i}`, orderNumber: `N${i}` })), total: 7, totalPages: 3, hasMore: false },
      '2': { orders: Array.from({ length: 3 }, (_, i) => ({ id: `b${i}`, orderNumber: `M${i}` })), total: 7, totalPages: 3, hasMore: false },
      '3': { orders: [{ id: 'target-id', orderNumber: 'NX9-old123' }], total: 7, totalPages: 3, hasMore: false },
    };
    vi.stubGlobal('fetch', vi.fn(async (url: string) => json(pages[new URL(url).searchParams.get('page') ?? '1'])));
    const adapter = new LorrigoAdapter('key', 'https://lorrigo.test/api');
    expect(await (adapter as unknown as { findOrderIdByRef(ref: string): Promise<string | null> }).findOrderIdByRef('NX9-old123')).toBe('target-id');
  });
});

describe('Lorrigo: the order id is remembered in our database', () => {
  afterEach(() => { vi.unstubAllGlobals(); dbQuery.mockClear(); dbQuery.mockImplementation(async () => ({ rows: [] })); });
  const details = {
    nexgoOrderId: 'NX26110100077', sellerName: 'Seller', warehouse: { id: 'w1' }, pickupHubId: 'hub-1', externalServiceId: 'svc',
    consignee: { name: 'Buyer', phone: '9876543210', address1: '12 Road', city: 'Howrah', state: 'West Bengal', pincode: '711101' },
    items: [{ name: 'Item', sku: 'S', quantity: 1, unitPricePaise: 50000 }], package: { weightG: 400, lengthMm: 100, widthMm: 100, heightMm: 100 },
  };
  const request = { paymentMode: 'prepaid', codAmountPaise: 0, details } as never;
  type Priv = { createOrReuseOrder(d: unknown, r: unknown, hub: string): Promise<{ id: string; reused?: boolean }> };

  it('uses the stored id and makes no call to the aggregator at all', async () => {
    dbQuery.mockImplementation(async (sql: string) => ({ rows: /FROM aggregator_orders/.test(sql) ? [{ external_order_id: 'stored-id' }] : [] }));
    const fetchMock = vi.fn(async () => json({}));
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new LorrigoAdapter('key', 'https://lorrigo.test/api') as unknown as Priv;
    expect(await adapter.createOrReuseOrder(details, request, 'hub-1')).toMatchObject({ id: 'stored-id', reused: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('stores the id after creating a new order', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ id: 'fresh-id' })));
    const adapter = new LorrigoAdapter('key', 'https://lorrigo.test/api') as unknown as Priv;
    expect(await adapter.createOrReuseOrder(details, request, 'hub-1')).toMatchObject({ id: 'fresh-id' });
    const insert = dbQuery.mock.calls.find((c) => /INSERT INTO aggregator_orders/.test(String(c[0])));
    expect(insert).toBeTruthy();
    expect(insert![1]).toEqual([expect.stringMatching(/^NX26110100077-[0-9a-f]{6}$/), 'fresh-id', 'NX26110100077']);
  });

  it('stores the id it had to search for, so the next retry needs no search', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return json({ message: 'Order Id already exists. Please try with another Order Id.' }, 400);
      return json({ orders: [{ id: 'found-id', orderNumber: (globalThis as { __ref?: string }).__ref }], totalPages: 1, hasMore: false });
    }));
    const adapter = new LorrigoAdapter('key', 'https://lorrigo.test/api') as unknown as Priv & { orderRef(d: unknown, r: unknown): string };
    (globalThis as { __ref?: string }).__ref = adapter.orderRef(details, request);
    expect(await adapter.createOrReuseOrder(details, request, 'hub-1')).toMatchObject({ id: 'found-id', reused: true });
    expect(dbQuery.mock.calls.some((c) => /INSERT INTO aggregator_orders/.test(String(c[0])) && (c[1] as string[])[1] === 'found-id')).toBe(true);
  });
});
