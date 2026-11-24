import { describe, expect, it } from 'vitest';
import { shiprocket, mapStatus, parseTime, fromTracking, toUpdate } from '../../../src/couriers/aggregators/shiprocket/index.js';
import { sellerSafeMessage, revealsAggregator } from '../../../src/lib/sellerSafeError.js';

const cred = { webhookToken: 'right-token-right-token-1234' };

describe('Shiprocket plugin: status mapping', () => {
  it('maps by numeric id first', () => {
    expect(mapStatus(6, '')).toEqual({ state: 'in_transit' });
    expect(mapStatus('7', 'whatever')).toEqual({ state: 'delivered' });
    expect(mapStatus(17, '')).toEqual({ state: 'out_for_delivery' });
    expect(mapStatus(21, '')).toEqual({ state: 'ndr' });
    expect(mapStatus(9, '')).toEqual({ state: 'rto' });
    expect(mapStatus(10, '')).toEqual({ state: 'rto', rto: 'delivered' });
    expect(mapStatus(12, '')).toEqual({ state: 'lost' });
  });
  it('maps by label when there is no known id, ignoring case, dashes and underscores', () => {
    expect(mapStatus(null, 'Out For Delivery')).toEqual({ state: 'out_for_delivery' });
    expect(mapStatus(null, 'IN-TRANSIT')).toEqual({ state: 'in_transit' });
    expect(mapStatus(null, 'Picked Up')).toEqual({ state: 'in_transit' });
    expect(mapStatus(null, 'UNDELIVERED-1st Attempt')).toEqual({ state: 'ndr' });
    expect(mapStatus(null, 'RTO Initiated')).toEqual({ state: 'rto' });
    expect(mapStatus(null, 'RTO_IN_TRANSIT')).toEqual({ state: 'rto', rto: 'in_transit' });
    expect(mapStatus(null, 'RTO OFD')).toEqual({ state: 'rto', rto: 'out_for_delivery' });
    expect(mapStatus(null, 'RTO Delivered')).toEqual({ state: 'rto', rto: 'delivered' });
    expect(mapStatus(null, 'RTO UNDELIVERED')).toEqual({ state: 'rto', rto: 'in_transit' }); // a return still on its way, not a delivery
  });
  it('never mistakes UNDELIVERED for DELIVERED', () => {
    expect(mapStatus(null, 'UNDELIVERED')).toEqual({ state: 'ndr' });
    expect(mapStatus(null, 'DELIVERED')).toEqual({ state: 'delivered' });
  });
  it('unknown statuses are undefined', () => {
    expect(mapStatus(null, 'SOMETHING NEW')).toBeUndefined();
    expect(mapStatus(null, '')).toBeUndefined();
  });
});

describe('Shiprocket plugin: times', () => {
  it('reads Indian time', () => {
    expect(new Date(parseTime('2026-11-20 14:30:00')).toISOString()).toBe('2026-11-20T09:00:00.000Z');
    expect(new Date(parseTime('2026-11-20 14:30')).toISOString()).toBe('2026-11-20T09:00:00.000Z');
    expect(new Date(parseTime('23 05 2026 11:43:52')).toISOString()).toBe('2026-05-23T06:13:52.000Z');
    expect(new Date(parseTime('2026-11-20T09:00:00Z')).toISOString()).toBe('2026-11-20T09:00:00.000Z');
    expect(Number.isNaN(parseTime('not a date'))).toBe(true);
  });
});

describe('Shiprocket plugin: webhook', () => {
  const payload = (over: Record<string, unknown> = {}) => ({
    awb: '14308923', courier_name: 'Delhivery', current_status: 'UNDELIVERED', current_status_id: 21, order_id: 'NX1-abc123', sr_order_id: 77,
    scans: [
      { date: '2026-11-20 10:00:00', activity: 'Shipment picked up', location: 'Kolkata', 'sr-status': '6', 'sr-status-label': 'SHIPPED' },
      { date: '2026-11-21 16:30:00', activity: 'Customer not available', location: 'Howrah', 'sr-status': '21', 'sr-status-label': 'UNDELIVERED' },
    ], ...over,
  });

  it('accepts its own token in x-api-key (or a bearer header) and nothing else', () => {
    const v = (h: Record<string, unknown>) => shiprocket.webhook!.verify(h, cred, '');
    expect(v({ 'x-api-key': 'right-token-right-token-1234' })).toBe(true);
    expect(v({ authorization: 'Bearer right-token-right-token-1234' })).toBe(true);
    expect(v({ 'x-api-key': 'right-token-right-token-1235' })).toBe(false);
    expect(v({})).toBe(false);
    expect(shiprocket.webhook!.verify({ 'x-api-key': 'x' }, {}, '')).toBe(false);
  });

  it('turns the payload into history + current status, keeping the real NDR reason', () => {
    const [u] = shiprocket.webhook!.parse(payload());
    expect(u.awb).toBe('14308923');
    expect(u.events.map((e) => e.mapped.state)).toEqual(['in_transit', 'ndr']);
    expect(u.events[1].description).toBe('Customer not available');
    expect(u.events[0].at).toBe('2026-11-20T04:30:00.000Z');
    expect(u.current?.mapped.state).toBe('ndr');
    expect(u.current?.description).toBe('Customer not available');
    expect(u.unmappedStatus).toBeUndefined();
  });

  it('gives every event a stable id and is idempotent', () => {
    const a = shiprocket.webhook!.parse(payload())[0]; const b = shiprocket.webhook!.parse(payload())[0];
    expect(a.events.map((e) => e.eventId)).toEqual(b.events.map((e) => e.eventId));
    expect(new Set(a.events.map((e) => e.eventId)).size).toBe(2);
  });

  it('accepts a single object, a { data } wrapper or an array', () => {
    for (const body of [payload(), { data: payload() }, [payload()]]) expect(shiprocket.webhook!.parse(body)).toHaveLength(1);
  });

  it('reports an unknown status, stays quiet for known quiet ones, and reports a cancellation so support can act', () => {
    expect(shiprocket.webhook!.parse({ awb: 'A1', current_status: 'Strange Thing', scans: [] })[0].unmappedStatus).toBe('STRANGE_THING');
    expect(shiprocket.webhook!.parse({ awb: 'A2', current_status: 'Pickup Scheduled', scans: [] })[0].unmappedStatus).toBeUndefined();
    expect(shiprocket.webhook!.parse({ awb: 'A3', current_status: 'Delayed', scans: [] })[0].unmappedStatus).toBeUndefined();
    expect(shiprocket.webhook!.parse({ awb: 'A4', current_status: 'CANCELED', current_status_id: 8, scans: [] })[0].unmappedStatus).toBe('CANCELED'); // matches /^CANCEL/ in the shared ingest
  });

  it('ignores items with no AWB', () => {
    expect(shiprocket.webhook!.parse([{ current_status: 'DELIVERED' }, { awb: '' }])).toEqual([]);
  });

  it('has its own URL path without the words Shiprocket, SR or KR (the dashboard refuses them)', () => {
    const path = shiprocket.webhook!.path!;
    expect(path).toBe('/v1/webhooks/carrier-events');
    expect(/shiprocket|kartrocket|sr|kr/i.test(path.replace('/v1/webhooks/', ''))).toBe(false);
  });
});

describe('Shiprocket plugin: tracking poll answer', () => {
  it('reshapes GET /courier/track/awb/{awb} like a webhook payload', () => {
    const item = fromTracking('999', { tracking_data: { track_status: 1, shipment_status: 7, shipment_track: [{ current_status: 'Delivered' }],
      shipment_track_activities: [{ date: '2026-11-20 10:00:00', activity: 'Picked up', location: 'A', 'sr-status': '42', 'sr-status-label': 'PICKED UP' }, { date: '2026-11-22 12:00:00', activity: 'Delivered to customer', location: 'B', 'sr-status': '7', 'sr-status-label': 'DELIVERED' }] } });
    const u = toUpdate(item!);
    expect(u?.events.map((e) => e.mapped.state)).toEqual(['in_transit', 'delivered']);
    expect(u?.current?.mapped.state).toBe('delivered');
  });
  it('a tracking answer without data is nothing', () => {
    expect(fromTracking('1', { tracking_data: { track_status: 0, error: 'no data' } })?.scans).toEqual([]);
    expect(fromTracking('1', {})).toBeNull();
    expect(fromTracking('1', null)).toBeNull();
  });
});

describe('Shiprocket: sellers never see the aggregator', () => {
  it('scrubs the name from messages', () => {
    expect(sellerSafeMessage('Shiprocket: Pincode not serviceable')).toBe('Pincode not serviceable');
    expect(revealsAggregator(sellerSafeMessage('Shiprocket did not assign an AWB.'))).toBe(false);
    expect(revealsAggregator(sellerSafeMessage("Shiprocket's wallet is low"))).toBe(false);
  });
});
