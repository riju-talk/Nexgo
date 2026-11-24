import { describe, expect, it, vi, afterEach } from 'vitest';
import { lorrigo } from '../../../src/couriers/aggregators/lorrigo/index.js';

const T = '2026-11-06T10:00:00.000Z';
const hook = (token: string) => lorrigo.webhook!.verify({ 'x-api-key': token }, { webhookToken: 'right-token-right-token-1234' }, '');

describe('Lorrigo plugin: webhook', () => {
  it('accepts only its own token', () => {
    expect(hook('right-token-right-token-1234')).toBe(true);
    expect(hook('right-token-right-token-1235')).toBe(false);
    expect(hook('')).toBe(false);
    expect(lorrigo.webhook!.verify({}, { webhookToken: '' }, '')).toBe(false);
  });

  it('reads the payload however Lorrigo wraps it', () => {
    const item = { awb: '123', status: 'IN_TRANSIT', tracking_events: [{ status: 'PICKED_UP', timestamp: T, location: 'Mumbai' }] };
    for (const body of [item, { data: item }, { data: [item] }, [item]]) {
      const u = lorrigo.webhook!.parse(body);
      expect(u).toHaveLength(1);
      expect(u[0].awb).toBe('123');
      expect(u[0].events[0].mapped.state).toBe('in_transit');
      expect(u[0].current?.mapped.state).toBe('in_transit');
    }
  });

  // Regression: parcels stayed "In transit" in NEXGO while the aggregator showed NDR (a hub scan after the NDR moved the state on).
  // The overall status keeps the courier's real NDR wording, so re-applying it never replaces the reason with the bare word "NDR".
  it('keeps the real NDR reason on the overall status', () => {
    const [u] = lorrigo.webhook!.parse({ awb: 'N1', status: 'NDR', tracking_events: [
      { status: 'PICKED_UP', timestamp: T }, { status: 'NDR', timestamp: '2026-11-07T10:00:00.000Z', description: 'Customer not available' }, { status: 'IN_TRANSIT', timestamp: '2026-11-08T10:00:00.000Z' }] });
    expect(u.current?.mapped.state).toBe('ndr');
    expect(u.current?.description).toBe('Customer not available');
  });

  it('treats NDR-style status variants as a failed attempt', () => {
    for (const status of ['NDR', 'NDR_1_ATTEMPT', 'ndr-2', 'UNDELIVERED']) {
      const [u] = lorrigo.webhook!.parse({ awb: 'V1', status });
      expect(u.current?.mapped.state).toBe('ndr');
      expect(u.unmappedStatus).toBeUndefined();
    }
  });

  // Lorrigo showed 270 parcels as PICKUP_EXCEPTION ("Seller Not Available / Phone no. Not Contactable") while NEXGO said only "pickup pending".
  it('keeps the courier\'s own status and reason, and is quiet about it (no state change, not "unmapped")', () => {
    const [u] = lorrigo.webhook!.parse({ awb: 'P1', status: 'PICKUP_EXCEPTION', pickup_exception_reason: 'Seller Not Available / Phone no. Not Contactable',
      tracking_events: [{ status: 'PICKUP_EXCEPTION', timestamp: T, description: 'Manifested - Shipper unavailable' }] });
    expect(u.courierStatus).toEqual({ label: 'PICKUP_EXCEPTION', note: 'Seller Not Available / Phone no. Not Contactable' });
    expect(u.events).toEqual([]);
    expect(u.current).toBeUndefined();
    expect(u.unmappedStatus).toBeUndefined();
  });

  it('falls back to the newest event wording for the reason, and records an NDR as the courier\'s status too', () => {
    const [u] = lorrigo.webhook!.parse({ awb: 'N9', status: 'NDR', tracking_events: [{ status: 'NDR', timestamp: T, description: 'Pending - Consignee Unavailable' }] });
    expect(u.courierStatus).toEqual({ label: 'NDR', note: 'Pending - Consignee Unavailable' });
    expect(u.current?.mapped.state).toBe('ndr');
  });

  it('maps return-to-origin statuses and keeps the RTO sub-status', () => {
    const [u] = lorrigo.webhook!.parse({ awb: 'A1', status: 'RTO_DELIVERED', tracking_events: [
      { status: 'rto-initiated', timestamp: T }, { status: 'RTO_OFD', timestamp: '2026-11-07T10:00:00.000Z' }, { status: 'RTO_DELIVERED', timestamp: '2026-11-08T10:00:00.000Z' }] });
    expect(u.events.map((e) => e.mapped)).toEqual([{ state: 'rto' }, { state: 'rto', rto: 'out_for_delivery' }, { state: 'rto', rto: 'delivered' }]);
  });

  it('sorts the history oldest first, drops events with no valid time and gives every event a stable id', () => {
    const body = { awb: 'A2', status: 'DELIVERED', tracking_events: [
      { status: 'DELIVERED', timestamp: '2026-11-09T10:00:00.000Z' }, { status: 'IN_TRANSIT', timestamp: T }, { status: 'NDR', timestamp: 'not a date' }] };
    const [a] = lorrigo.webhook!.parse(body); const [b] = lorrigo.webhook!.parse(body);
    expect(a.events.map((e) => e.mapped.state)).toEqual(['in_transit', 'delivered']);
    expect(a.events.map((e) => e.eventId)).toEqual(b.events.map((e) => e.eventId));
  });

  it('does not report known quiet statuses as unmapped, but reports a cancellation so support can act', () => {
    expect(lorrigo.webhook!.parse({ awb: 'A3', status: 'OUT_FOR_PICKUP' })[0].unmappedStatus).toBeUndefined();
    expect(lorrigo.webhook!.parse({ awb: 'A3', status: 'PICKUP_SCHEDULED' })[0].unmappedStatus).toBeUndefined();
    expect(lorrigo.webhook!.parse({ awb: 'A3', status: 'CANCELLED_SHIPMENT' })[0].unmappedStatus).toBe('CANCELLED_SHIPMENT');
  });

  it('ignores items without an AWB and caps a batch at 100', () => {
    expect(lorrigo.webhook!.parse({ data: [{ status: 'DELIVERED' }, { awb: '', status: 'DELIVERED' }] })).toEqual([]);
    const many = Array.from({ length: 150 }, (_, i) => ({ awb: String(1000 + i), status: 'IN_TRANSIT' }));
    expect(lorrigo.webhook!.parse(many)).toHaveLength(100);
  });
});

describe('Lorrigo plugin: tracking poll', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('turns the order list (trackingEvents) into the same updates a webhook gives', async () => {
    const page = { orders: [
      { awb: 'P1', status: 'IN_TRANSIT', trackingEvents: [{ status: 'PICKED_UP', timestamp: T, location: 'Mumbai', description: 'Picked' }] },
      { awb: null, status: 'NEW' }, // no AWB yet: skipped
    ], hasMore: false };
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(page), { status: 200, headers: { 'content-type': 'application/json' } })));
    const updates = await lorrigo.poll!({ apiKey: 'k', baseUrl: 'https://lorrigo.test/api' });
    expect(updates).toHaveLength(1);
    expect(updates[0].awb).toBe('P1');
    expect(updates[0].events[0]).toMatchObject({ mapped: { state: 'in_transit' }, location: 'Mumbai' });
  });
});
