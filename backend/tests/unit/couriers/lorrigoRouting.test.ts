import { afterEach, describe, expect, it, vi } from 'vitest';
import { LorrigoAdapter } from '../../../src/couriers/lorrigo.js';

vi.mock('../../../src/db/client.js', () => ({ db: { query: vi.fn(async () => ({ rows: [] })) }, withTransaction: vi.fn(), withSellerTransaction: vi.fn() }));
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

// The routing code on the label is the courier's own (what the aggregator prints, e.g. "ATQ/VKI"): read from GET /shipments/:id, never made up.
describe('Lorrigo: routing code for the label', () => {
  afterEach(() => vi.unstubAllGlobals());
  const adapter = () => new LorrigoAdapter('key', 'https://lorrigo.test/api');

  it('reads routing_code from the shipment record', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (u: string) => { urls.push(u); return json({ id: 'ship1', awb: '39598696122374', routing_code: 'ATQ/VKI' }); }));
    expect(await adapter().routingCode('ship1')).toBe('ATQ/VKI');
    expect(urls[0]).toContain('/shipments/ship1');
  });
  it('finds it when the shipment is wrapped in data', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ data: { routingCode: 'DEL/XYZ' } })));
    expect(await adapter().routingCode('s')).toBe('DEL/XYZ');
  });
  it('is null when Lorrigo has no code or the call fails (nothing invented)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ id: 's', awb: '1', routing_code: null })));
    expect(await adapter().routingCode('s')).toBeNull();
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'nope' }, 404)));
    expect(await adapter().routingCode('s')).toBeNull();
  });
});
