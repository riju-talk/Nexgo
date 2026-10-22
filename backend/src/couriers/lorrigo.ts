import type { BookingDetails, CourierAdapter, CourierBookingRequest, CourierBookingResult } from './types.js';

// Lorrigo (app.lorrigo.com/api/v2), Bearer API key. Booking is three calls:
//   POST /pickup-address  (once per warehouse)  ->  POST /orders  ->  POST /shipments {order_id, courier_id}  (one click, returns the AWB)
// Cancel is POST /shipments/:id/cancel. Tracking arrives by webhook (routes/lorrigoWebhook.ts).
// Request shapes were taken from the live API's validation messages; response shapes are read defensively (see firstString).

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);

// Walks a response along candidate paths ("data.order.id") and returns the first non-empty string/number found.
export function firstString(body: unknown, paths: string[]): string | null {
  for (const path of paths) {
    let cur: unknown = body;
    for (const key of path.split('.')) cur = isObj(cur) ? cur[key] : undefined;
    if ((typeof cur === 'string' && cur) || typeof cur === 'number') return String(cur);
  }
  return null;
}
// Last resort for the AWB: any key that is called awb / awb_number / waybill / tracking number, at any depth.
export function findByKey(body: unknown, pattern: RegExp, depth = 0): string | null {
  if (depth > 5 || !body || typeof body !== 'object') return null;
  for (const [k, v] of Object.entries(body as Json)) {
    if (pattern.test(k) && (typeof v === 'string' || typeof v === 'number') && String(v)) return String(v);
    const nested = findByKey(v, pattern, depth + 1); if (nested) return nested;
  }
  return null;
}

const rupees = (paise: number) => Math.round(paise) / 100;
const kg = (grams: number) => String(Math.max(grams, 1) / 1000);
const cm = (mm: number | null) => String(mm ? Math.max(1, Math.round(mm / 10)) : 10); // unknown dimensions fall back to 10 cm so the order can still be created
const tenDigits = (phone: string) => phone.replace(/\D/g, '').slice(-10);

export class LorrigoError extends Error {
  // 4xx from Lorrigo (unserviceable pincode, bad data...) is a 422 so auto-assign moves on to the next courier; anything else is a 502.
  constructor(message: string, readonly statusCode: number) { super(message); }
}

export class LorrigoAdapter implements CourierAdapter {
  readonly providerCode = 'lorrigo';
  constructor(private readonly apiKey: string, private readonly baseUrl = 'https://app.lorrigo.com/api/v2') {}

  private async call(method: 'GET' | 'POST', path: string, body?: unknown): Promise<unknown> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, { method, headers: { authorization: `Bearer ${this.apiKey}`, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(25_000) });
    } catch { throw new LorrigoError('Lorrigo did not respond in time. Try again.', 502); }
    const text = await res.text(); let json: unknown = null; try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON body */ }
    if (res.ok) return json;
    const message = (isObj(json) && (typeof json.message === 'string' ? json.message : typeof json.error === 'string' ? json.error : null)) || `Lorrigo error ${res.status}`;
    if (res.status === 401) throw new LorrigoError('Lorrigo rejected the API key.', 502);
    if (res.status === 403) throw new LorrigoError('The Lorrigo API key does not have permission for this action.', 502);
    throw new LorrigoError(`Lorrigo: ${String(message).slice(0, 300)}`, res.status >= 500 ? 502 : 422);
  }

  /** Reuses an existing Lorrigo pickup address with our facility name, otherwise creates one. */
  private async ensureHub(w: BookingDetails['warehouse']): Promise<string> {
    const facilityName = `${w.name} - NX${w.id.slice(0, 6)}`.slice(0, 60);
    const list = await this.call('GET', '/pickup-address?limit=100');
    const hubs = isObj(list) && Array.isArray(list.hubs) ? list.hubs : [];
    const found = hubs.find((h) => isObj(h) && (h.facilityName === facilityName || h.name === facilityName));
    const existing = found ? firstString(found, ['id']) : null; if (existing) return existing;
    const address = [w.address1, w.address2].filter(Boolean).join(', ');
    const created = await this.call('POST', '/pickup-address', {
      facilityName, contactPersonName: w.contactName, phone: tenDigits(w.phone), email: w.email ?? undefined,
      address: /[/-]/.test(address) ? address : `${address} - ${w.city}`, // Lorrigo insists the address contains "/" or "-"
      country: 'India', pincode: w.pincode, city: w.city, state: w.state,
      isRTOAddressSame: true,
    });
    const id = firstString(created, ['id', 'hub.id', 'hubId', 'data.id', 'data.hub.id', 'pickupAddress.id']) ?? findByKey(created, /^hub_?id$/i);
    if (!id) throw new LorrigoError('Lorrigo created the pickup address but did not return its id.', 502);
    return id;
  }

  async book(request: CourierBookingRequest): Promise<CourierBookingResult> {
    const d = request.details; if (!d) throw new LorrigoError('Booking details are missing.', 502);
    if (!d.externalServiceId) throw new LorrigoError('This courier service is not mapped to a Lorrigo courier.', 422);
    const hubId = d.pickupHubId ?? await this.ensureHub(d.warehouse);
    const cod = request.paymentMode === 'cod';
    const order = await this.call('POST', '/orders', {
      pickupAddressId: hubId, orderId: d.nexgoOrderId, orderChannel: 'NEXGO', orderType: 'domestic',
      sellerDetails: { name: d.sellerName },
      deliveryDetails: { isBusiness: false, fullName: d.consignee.name, mobileNumber: tenDigits(d.consignee.phone), email: d.consignee.email ?? undefined, completeAddress: [d.consignee.address1, d.consignee.address2].filter(Boolean).join(', '), landmark: d.consignee.landmark || 'NA', pincode: d.consignee.pincode, city: d.consignee.city, state: d.consignee.state, billingIsSameAsDelivery: true },
      productDetails: { products: d.items.map((i) => ({ name: i.name, sku: i.sku, quantity: i.quantity, price: rupees(i.unitPricePaise) })) },
      paymentMethod: { paymentMethod: cod ? 'cod' : 'prepaid' },
      ...(cod ? { amountToCollect: rupees(request.codAmountPaise) } : {}),
      packageDetails: { deadWeight: kg(d.package.weightG), length: cm(d.package.lengthMm), breadth: cm(d.package.widthMm), height: cm(d.package.heightMm), volumetricWeight: kg(d.package.volumetricWeightG) },
    });
    const lorrigoOrderId = firstString(order, ['id', 'order.id', 'orderId', 'order_id', 'data.id', 'data.order.id', 'data.orderId']);
    if (!lorrigoOrderId) throw new LorrigoError('Lorrigo created the order but did not return its id.', 502);
    const shipment = await this.call('POST', '/shipments', { order_id: lorrigoOrderId, courier_id: d.externalServiceId });
    const awb = firstString(shipment, ['awb', 'awb_number', 'awbNumber', 'shipment.awb', 'data.awb', 'data.shipment.awb']) ?? findByKey(shipment, /^(awb|awb_?number|waybill|tracking_?(number|id))$/i);
    if (!awb) throw new LorrigoError('Lorrigo did not return an AWB for this shipment.', 502);
    const shipmentId = firstString(shipment, ['id', 'shipment.id', 'shipment_id', 'shipmentId', 'data.id', 'data.shipment.id']) ?? lorrigoOrderId;
    return { providerShipmentId: shipmentId, awb, labelAvailable: true, pickupHubId: d.pickupHubId ? undefined : hubId };
  }

  async cancel(providerShipmentId: string): Promise<void> {
    await this.call('POST', `/shipments/${encodeURIComponent(providerShipmentId)}/cancel`, {});
  }
}
