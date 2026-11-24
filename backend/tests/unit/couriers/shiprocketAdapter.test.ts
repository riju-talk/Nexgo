import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ShiprocketAdapter } from '../../../src/couriers/shiprocket.js';
import { BOOKING_PAUSED } from '../../../src/lib/sellerSafeError.js';
import type { BookingDetails, CourierBookingRequest } from '../../../src/couriers/types.js';

// Our own memory of orders already sent (aggregator_orders): a stub that can be told an order is already known.
const known = vi.hoisted(() => ({ value: null as string | null }));
const dbQuery = vi.hoisted(() => vi.fn(async (sql: string) => ({ rows: /SELECT external_order_id/.test(sql) && known.value ? [{ external_order_id: known.value }] : [] as unknown[] })));
vi.mock('../../../src/db/client.js', () => ({ db: { query: dbQuery }, withTransaction: vi.fn(), withSellerTransaction: vi.fn() }));

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const details = (over: Partial<BookingDetails> = {}): BookingDetails => ({
  sellerName: 'Acme', orderNumber: 'A1', nexgoOrderId: 'NX26110100001', externalServiceId: '10', pickupHubId: null,
  warehouse: { id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', name: 'Main', contactName: 'Owner', phone: '9876543210', email: null, address1: '5 Test Lane', address2: null, city: 'Kolkata', state: 'West Bengal', pincode: '700001' },
  consignee: { name: 'Buyer One', phone: '9876543211', email: null, address1: '12 Road', address2: null, landmark: 'Near park', city: 'Mumbai', state: 'Maharashtra', pincode: '400001' },
  items: [{ name: 'Shirt', sku: 'S1', quantity: 2, unitPricePaise: 40000, weightG: 200 }],
  package: { weightG: 500, lengthMm: 200, widthMm: 150, heightMm: 100, volumetricWeightG: 100 }, ...over,
});
const request = (over: Partial<CourierBookingRequest> = {}): CourierBookingRequest => ({ reference: 'r1', destinationPincode: '400001', weightG: 500, paymentMode: 'cod', codAmountPaise: 89900, details: details(), ...over });

type Handler = (url: URL, init: RequestInit) => Response | Promise<Response>;
function fakeShiprocket(handlers: Record<string, Handler>) {
  const calls: { method: string; path: string; body: unknown; auth: string | null }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: string, init: RequestInit = {}) => {
    const url = new URL(input); const path = url.pathname.replace('/v1/external', ''); const method = init.method ?? 'GET';
    const headers = (init.headers ?? {}) as Record<string, string>;
    calls.push({ method, path, body: init.body ? JSON.parse(String(init.body)) : undefined, auth: headers.authorization ?? null });
    const h = handlers[`${method} ${path}`]; return h ? h(url, init) : json({ message: `no handler for ${method} ${path}` }, 404);
  }));
  return calls;
}
const happy = (over: Record<string, Handler> = {}): Record<string, Handler> => ({
  'POST /auth/login': () => json({ token: 'tok-1' }),
  'GET /settings/company/pickup': () => json({ data: { shipping_address: [] } }),
  'POST /settings/company/addpickup': () => json({ success: true }),
  'POST /orders/create/adhoc': () => json({ order_id: 5001, shipment_id: 6001, status: 'NEW' }),
  'GET /courier/serviceability/': () => json({ data: { available_courier_companies: [{ courier_company_id: 10, courier_name: 'Delhivery', rate: 60 }, { courier_company_id: 11, courier_name: 'Xpressbees' }] } }),
  'POST /courier/assign/awb': () => json({ awb_assign_status: 1, response: { data: { awb_code: 'SR123456789', courier_name: 'Delhivery' } } }),
  'POST /courier/generate/pickup': () => json({ pickup_status: 1 }),
  ...over,
});
const adapter = () => new ShiprocketAdapter('api@example.com', 'pw', 'https://sr.test');

describe('Shiprocket adapter: booking', () => {
  beforeEach(() => { known.value = null; dbQuery.mockClear(); });
  afterEach(() => vi.unstubAllGlobals());

  it('books: pickup location, order, serviceability check, AWB, pickup request, with the right fields', async () => {
    const calls = fakeShiprocket(happy());
    const out = await new ShiprocketAdapter('api-a@example.com', 'pw', 'https://sr-a.test').book(request());
    expect(out.awb).toBe('SR123456789');
    expect(out.providerShipmentId).toBe('5001'); // the ORDER id: that is what cancel needs
    expect(out.pickupHubId).toMatch(/^NX-/);
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual(['POST /auth/login', 'GET /settings/company/pickup', 'POST /settings/company/addpickup', 'POST /orders/create/adhoc', 'GET /courier/serviceability/', 'POST /courier/assign/awb', 'POST /courier/generate/pickup']);
    const order = calls.find((c) => c.path === '/orders/create/adhoc')!.body as Record<string, unknown>;
    expect(order).toMatchObject({ payment_method: 'COD', sub_total: 899, weight: 0.5, length: 20, breadth: 15, height: 10, billing_pincode: '400001', billing_phone: '9876543211', shipping_is_billing: true, billing_country: 'India', pickup_location: out.pickupHubId });
    expect((order.order_items as { selling_price: number; units: number }[])[0]).toMatchObject({ selling_price: 400, units: 2 });
    expect(String(order.order_id)).toMatch(/^NX26110100001-[0-9a-f]{6}$/);
    expect(calls.find((c) => c.path === '/courier/assign/awb')!.body).toEqual({ shipment_id: '6001', courier_id: '10' });
    expect(calls.find((c) => c.path === '/courier/generate/pickup')!.body).toEqual({ shipment_id: [6001] });
    expect(calls.filter((c) => c.path !== '/auth/login').every((c) => c.auth === 'Bearer tok-1')).toBe(true);
  });

  it('prepaid orders say Prepaid and use the items total', async () => {
    const calls = fakeShiprocket(happy());
    await new ShiprocketAdapter('api-b@example.com', 'pw', 'https://sr-b.test').book(request({ paymentMode: 'prepaid', codAmountPaise: 0 }));
    expect(calls.find((c) => c.path === '/orders/create/adhoc')!.body).toMatchObject({ payment_method: 'Prepaid', sub_total: 800 });
    expect((calls.find((c) => c.path === '/courier/serviceability/') as unknown as { path: string }).path).toBe('/courier/serviceability/');
  });

  it('logs in once and reuses the token for the next booking', async () => {
    const calls = fakeShiprocket(happy({ 'GET /settings/company/pickup': () => json({ data: { shipping_address: [{ pickup_location: 'NX-aaaaaaaabb' }] } }) }));
    const a = new ShiprocketAdapter('api-c@example.com', 'pw', 'https://sr-c.test');
    await a.book(request()); await a.book(request({ details: details({ nexgoOrderId: 'NX26110100002' }) }));
    expect(calls.filter((c) => c.path === '/auth/login')).toHaveLength(1);
  });

  it('logs in again once when a call answers 401 (an expired token)', async () => {
    let first = true; let logins = 0;
    fakeShiprocket(happy({
      'POST /auth/login': () => { logins++; return json({ token: `tok-${logins}` }); },
      'POST /orders/create/adhoc': () => { if (first) { first = false; return json({ message: 'Unauthenticated' }, 401); } return json({ order_id: 5002, shipment_id: 6002 }); },
    }));
    const out = await new ShiprocketAdapter('api-d@example.com', 'pw', 'https://sr-d.test').book(request());
    expect(out.awb).toBe('SR123456789'); expect(logins).toBe(2);
  });

  it('an empty courier wallet is the "booking paused" refusal (503), so the queue keeps the order', async () => {
    fakeShiprocket(happy({ 'POST /courier/assign/awb': () => json({ message: 'Insufficient wallet balance. Please recharge your wallet.' }, 422) }));
    await expect(new ShiprocketAdapter('api-e@example.com', 'pw', 'https://sr-e.test').book(request())).rejects.toMatchObject({ statusCode: 503, message: BOOKING_PAUSED });
  });
  it('the same refusal inside a 200 answer ({ awb_assign_status: 0 }) is also "paused"', async () => {
    fakeShiprocket(happy({ 'POST /courier/assign/awb': () => json({ awb_assign_status: 0, message: 'Low wallet balance' }) }));
    await expect(new ShiprocketAdapter('api-f@example.com', 'pw', 'https://sr-f.test').book(request())).rejects.toMatchObject({ statusCode: 503, message: BOOKING_PAUSED });
  });

  it('a courier that does not serve the lane is a 422 lane refusal (next courier is tried, remembered for 24 h) and nothing is booked', async () => {
    const calls = fakeShiprocket(happy({ 'GET /courier/serviceability/': () => json({ data: { available_courier_companies: [{ courier_company_id: 99, courier_name: 'Other' }] } }) }));
    await expect(new ShiprocketAdapter('api-g@example.com', 'pw', 'https://sr-g.test').book(request())).rejects.toMatchObject({ statusCode: 422, laneRefusal: true });
    expect(calls.some((c) => c.path === '/courier/assign/awb')).toBe(false);
  });

  it('bad customer data is refused before any call', async () => {
    const calls = fakeShiprocket(happy());
    const a = new ShiprocketAdapter('api-h@example.com', 'pw', 'https://sr-h.test');
    await expect(a.book(request({ details: details({ consignee: { ...details().consignee, phone: '12345' } }) }))).rejects.toMatchObject({ statusCode: 422 });
    await expect(a.book(request({ details: details({ consignee: { ...details().consignee, pincode: '0' } }) }))).rejects.toMatchObject({ statusCode: 422 });
    await expect(a.book(request({ paymentMode: 'cod', codAmountPaise: 0 }))).rejects.toMatchObject({ statusCode: 422 });
    expect(calls).toHaveLength(0);
  });

  it('an unmapped courier service is refused', async () => {
    fakeShiprocket(happy());
    await expect(new ShiprocketAdapter('api-i@example.com', 'pw', 'https://sr-i.test').book(request({ details: details({ externalServiceId: null }) }))).rejects.toMatchObject({ statusCode: 422 });
  });

  it('retries reuse the order we already sent (no second order) and an AWB that already exists is not booked twice', async () => {
    known.value = '5001:6001';
    const calls = fakeShiprocket(happy({ 'GET /orders/show/5001': () => json({ data: { shipments: { awb: 'SR-OLD-AWB' } } }) }));
    const out = await new ShiprocketAdapter('api-j@example.com', 'pw', 'https://sr-j.test').book(request({ details: details({ pickupHubId: 'NX-hub' }) }));
    expect(out.awb).toBe('SR-OLD-AWB'); expect(out.providerShipmentId).toBe('5001');
    expect(calls.some((c) => c.path === '/orders/create/adhoc')).toBe(false);
    expect(calls.some((c) => c.path === '/courier/assign/awb')).toBe(false);
  });
  it('a remembered order that has no AWB yet goes on to the AWB step with the remembered shipment id', async () => {
    known.value = '5001:6001';
    const calls = fakeShiprocket(happy({ 'GET /orders/show/5001': () => json({ data: { shipments: {} } }) }));
    const out = await new ShiprocketAdapter('api-k@example.com', 'pw', 'https://sr-k.test').book(request({ details: details({ pickupHubId: 'NX-hub' }) }));
    expect(out.awb).toBe('SR123456789');
    expect(calls.find((c) => c.path === '/courier/assign/awb')!.body).toEqual({ shipment_id: '6001', courier_id: '10' });
  });

  it('the pickup request failing does not fail the booking', async () => {
    fakeShiprocket(happy({ 'POST /courier/generate/pickup': () => json({ message: 'Pickup already scheduled' }, 422) }));
    const out = await new ShiprocketAdapter('api-l@example.com', 'pw', 'https://sr-l.test').book(request({ details: details({ pickupHubId: 'NX-hub' }) }));
    expect(out.awb).toBe('SR123456789');
  });

  it('error messages shown to a seller never name Shiprocket', async () => {
    fakeShiprocket(happy({ 'POST /orders/create/adhoc': () => json({ message: 'Shiprocket: Wrong pincode', errors: { billing_pincode: ['The billing pincode is invalid.'] } }, 422) }));
    const err = await new ShiprocketAdapter('api-m@example.com', 'pw', 'https://sr-m.test').book(request({ details: details({ pickupHubId: 'NX-hub' }) })).catch((e) => e);
    expect(err.statusCode).toBe(422); expect(err.message).not.toMatch(/shiprocket/i); expect(err.message).toMatch(/pincode/i);
  });
  it('a bad API user login is a readable 502, not a crash', async () => {
    fakeShiprocket({ 'POST /auth/login': () => json({ message: 'Invalid email or password' }, 403) });
    await expect(new ShiprocketAdapter('api-n@example.com', 'bad', 'https://sr-n.test').book(request({ details: details({ pickupHubId: 'NX-hub' }) }))).rejects.toMatchObject({ statusCode: 502 });
  });
});

describe('Shiprocket adapter: cancel, balance, services, tracking', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('cancel posts the ORDER id; "already cancelled" is done, "not found" is NOT', async () => {
    const calls = fakeShiprocket(happy({ 'POST /orders/cancel': () => json({ message: 'Order cancelled successfully' }) }));
    const a = new ShiprocketAdapter('api-o@example.com', 'pw', 'https://sr-o.test');
    await a.cancel('5001');
    expect(calls.find((c) => c.path === '/orders/cancel')!.body).toEqual({ ids: [5001] });
    fakeShiprocket(happy({ 'POST /orders/cancel': () => json({ message: 'Order already cancelled' }, 422) }));
    await expect(new ShiprocketAdapter('api-p@example.com', 'pw', 'https://sr-p.test').cancel('5001')).resolves.toBeUndefined();
    fakeShiprocket(happy({ 'POST /orders/cancel': () => json({ message: 'Order not found' }, 404) }));
    await expect(new ShiprocketAdapter('api-q@example.com', 'pw', 'https://sr-q.test').cancel('5001')).rejects.toMatchObject({ statusCode: 422 });
  });

  it('reads the wallet balance, however it is wrapped; unknown when absent', async () => {
    fakeShiprocket(happy({ 'GET /account/details/wallet-balance': () => json({ data: { balance_amount: '1250.50' } }) }));
    expect(await new ShiprocketAdapter('api-r@example.com', 'pw', 'https://sr-r.test').balance()).toBe(1250.5);
    fakeShiprocket(happy({ 'GET /account/details/wallet-balance': () => json({ data: { balance_amount: -300 } }) }));
    expect(await new ShiprocketAdapter('api-s@example.com', 'pw', 'https://sr-s.test').balance()).toBe(-300);
    fakeShiprocket(happy({ 'GET /account/details/wallet-balance': () => json({ data: {} }) }));
    expect(await new ShiprocketAdapter('api-t@example.com', 'pw', 'https://sr-t.test').balance()).toBeNull();
  });

  it('lists courier services from the serviceability call on several lanes, without duplicates', async () => {
    fakeShiprocket(happy({ 'GET /courier/serviceability/': () => json({ data: { available_courier_companies: [{ courier_company_id: 10, courier_name: 'Delhivery Surface' }, { courier_company_id: 11, courier_name: 'Xpressbees' }] } }) }));
    const list = await new ShiprocketAdapter('api-u@example.com', 'pw', 'https://sr-u.test').listServices();
    expect(list.map((s) => s.id).sort()).toEqual(['10', '11']);
    expect(list.find((s) => s.id === '10')!.name).toBe('Delhivery Surface');
  });

  it('asks for tracking per AWB', async () => {
    const calls = fakeShiprocket(happy({ 'GET /courier/track/awb/SR1': () => json({ tracking_data: { shipment_status: 6 } }) }));
    const out = await new ShiprocketAdapter('api-v@example.com', 'pw', 'https://sr-v.test').trackAwb('SR1');
    expect(out).toEqual({ tracking_data: { shipment_status: 6 } });
    expect(calls.some((c) => c.path === '/courier/track/awb/SR1')).toBe(true);
  });
});
