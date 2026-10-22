import { createHash } from 'node:crypto';
import { volumetricWeightG } from '../lib/money.js';
import type { BookingDetails, CourierAdapter, CourierBookingRequest, CourierBookingResult, NdrCourierAction } from './types.js';

// Lorrigo (app.lorrigo.com/api/v2), Bearer API key. Booking, verified against the live API:
//   POST /pickup-address (once per warehouse)  ->  POST /orders  ->  GET /shipments/:orderId/rates  ->  POST /shipments {order_id, courier_id}
// The rates call is mandatory (POST /shipments answers "Rate information not available" without it) and doubles as the serviceability check:
// only couriers that can serve the lane are listed. orderChannel is an enum on Lorrigo's side ("CUSTOM" is accepted). A repeated orderId is a 409.
// Cancel is POST /shipments/:id/cancel. Tracking arrives by webhook (routes/lorrigoWebhook.ts).
// The success response of POST /shipments could not be observed (the account wallet is empty), so the AWB and shipment id are read from the
// order record (GET /orders/:id -> shipment { id, awb }), which was observed, and only then from the ship response.

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
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class LorrigoError extends Error {
  // 4xx from Lorrigo (unserviceable pincode, bad data...) is a 422 so auto-assign moves on to the next courier; anything else is a 502.
  readonly expose = true; // the message is safe to show the seller (see the error handler in app.ts)
  constructor(message: string, readonly statusCode: number, readonly upstreamStatus?: number) { super(message); }
}
const invalid = (message: string) => new LorrigoError(message, 422);

// Checked before any Lorrigo call, so bad data never creates a hub or an order there and the seller is told exactly what to fix.
function validate(d: BookingDetails, request: CourierBookingRequest) {
  if (!/^[6-9]\d{9}$/.test(tenDigits(d.consignee.phone))) throw invalid('The customer mobile number is not valid for this courier (10 digits starting 6-9). Correct it in Track > Failed.');
  if (!/^\d{6}$/.test(d.consignee.pincode) || d.consignee.pincode === '000000') throw invalid('The customer pincode is missing or not valid. Correct it in Track > Failed.');
  if (d.consignee.name.trim().length < 2) throw invalid('The customer name is missing.');
  if (d.consignee.address1.trim().length < 3 || /^address missing$/i.test(d.consignee.address1.trim())) throw invalid('The customer address is missing. Correct it in Track > Failed.');
  if (!d.items.length) throw invalid('The order has no products.');
  if (request.paymentMode === 'cod' && !(request.codAmountPaise > 0)) throw invalid('A cash-on-delivery order needs an amount to collect.');
}
function validateWarehouse(w: BookingDetails['warehouse']) {
  if (!/^[6-9]\d{9}$/.test(tenDigits(w.phone))) throw invalid(`The pickup warehouse "${w.name}" needs a 10-digit mobile number (starting 6-9) before it can be used with this courier.`);
  if (!/^\d{6}$/.test(w.pincode)) throw invalid(`The pickup warehouse "${w.name}" needs a valid 6-digit pincode.`);
  if (w.contactName.trim().length < 2) throw invalid(`The pickup warehouse "${w.name}" needs a contact person.`);
}

export class LorrigoAdapter implements CourierAdapter {
  readonly providerCode = 'lorrigo';
  constructor(private readonly apiKey: string, private readonly baseUrl = 'https://app.lorrigo.com/api/v2') {}

  // The API runs as a 30 s serverless function and a booking is up to six calls, so every call is capped and the booking as a whole has a deadline.
  private deadline = 0;
  private async call(method: 'GET' | 'POST', path: string, body?: unknown, attempt = 0): Promise<unknown> {
    if (this.deadline && Date.now() > this.deadline) throw new LorrigoError('Lorrigo is responding too slowly. Nothing was charged; try again in a moment.', 502);
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, { method, headers: { authorization: `Bearer ${this.apiKey}`, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(9_000) });
    } catch { throw new LorrigoError('Lorrigo did not respond in time. Try again.', 502); }
    const text = await res.text(); let json: unknown = null; try { json = text ? JSON.parse(text) : null; } catch { /* an HTML error page from a gateway */ }
    if (res.ok) return json;
    if (res.status === 429) {
      if (attempt < 1) { await sleep(Math.min(2000, (Number(res.headers.get('retry-after')) || 1) * 1000)); return this.call(method, path, body, attempt + 1); }
      throw new LorrigoError('Lorrigo is rate limiting requests right now. Try again in a minute.', 502, 429);
    }
    const message = (isObj(json) && (typeof json.message === 'string' ? json.message : typeof json.error === 'string' ? json.error : null)) || `Lorrigo error ${res.status}`;
    if (res.status === 401) throw new LorrigoError('Lorrigo rejected the API key. Please contact support.', 502, 401);
    if (res.status === 403) throw new LorrigoError('The Lorrigo API key does not have permission for this action. Please contact support.', 502, 403);
    throw new LorrigoError(`Lorrigo: ${String(message).slice(0, 300)}`, res.status >= 500 ? 502 : 422, res.status);
  }

  /** Finds our pickup address by name (paging through the list), otherwise creates it. */
  private async findHub(facilityName: string): Promise<string | null> {
    for (let page = 1; page <= 5; page++) {
      const list = await this.call('GET', `/pickup-address?limit=100&page=${page}`);
      const hubs = isObj(list) && Array.isArray(list.hubs) ? list.hubs : [];
      const found = hubs.find((h) => isObj(h) && (h.name === facilityName || h.facilityName === facilityName) && h.is_active !== false);
      const id = found ? firstString(found, ['id']) : null; if (id) return id;
      if (!(isObj(list) && list.hasNextPage === true)) return null;
    }
    return null;
  }
  private async ensureHub(w: BookingDetails['warehouse']): Promise<string> {
    validateWarehouse(w);
    const facilityName = `${w.name} - NX${w.id.slice(0, 6)}`.slice(0, 60);
    const existing = await this.findHub(facilityName); if (existing) return existing;
    const address = [w.address1, w.address2].filter(Boolean).join(', ');
    let created: unknown;
    try {
      created = await this.call('POST', '/pickup-address', {
        facilityName, contactPersonName: w.contactName, phone: tenDigits(w.phone), email: w.email && EMAIL.test(w.email) ? w.email : undefined,
        address: /[/-]/.test(address) ? address : `${address} - ${w.city}`, // Lorrigo insists the address contains "/" or "-"
        country: 'India', pincode: w.pincode, city: w.city, state: w.state,
        isRTOAddressSame: true,
      });
    } catch (e) { // two bookings from a new warehouse at once: the other one created it a moment ago
      if (e instanceof LorrigoError && /already|exists|duplicate/i.test(e.message)) { const again = await this.findHub(facilityName); if (again) return again; }
      throw e;
    }
    const id = firstString(created, ['hub.id', 'id', 'hubId', 'data.id', 'data.hub.id', 'pickupAddress.id']) ?? findByKey(created, /^hub_?id$/i);
    if (!id) throw new LorrigoError('Lorrigo created the pickup address but did not return its id.', 502);
    return id;
  }

  /** A stable reference for the Lorrigo order: it changes when the customer, products, weight or payment change, so a corrected order is not stuck with stale data. */
  private orderRef(d: BookingDetails, request: CourierBookingRequest) {
    const fingerprint = JSON.stringify([d.consignee, d.items, d.package, request.paymentMode, request.codAmountPaise, d.warehouse.id]);
    return `${d.nexgoOrderId}-${createHash('sha1').update(fingerprint).digest('hex').slice(0, 6)}`;
  }

  /** Creates the Lorrigo order; if this exact order was already sent (an earlier courier attempt failed), the existing one is reused. */
  private async createOrReuseOrder(d: BookingDetails, request: CourierBookingRequest, hubId: string): Promise<{ id: string; hubId: string }> {
    const cod = request.paymentMode === 'cod'; const ref = this.orderRef(d, request);
    const body = (hub: string) => ({
      pickupAddressId: hub, orderId: ref, orderChannel: 'CUSTOM', orderType: 'domestic',
      sellerDetails: { name: d.sellerName },
      deliveryDetails: { isBusiness: false, fullName: d.consignee.name, mobileNumber: tenDigits(d.consignee.phone), email: d.consignee.email && EMAIL.test(d.consignee.email) ? d.consignee.email : undefined, completeAddress: [d.consignee.address1, d.consignee.address2].filter(Boolean).join(', '), landmark: d.consignee.landmark || 'NA', pincode: d.consignee.pincode, city: d.consignee.city, state: d.consignee.state, billingIsSameAsDelivery: true },
      productDetails: { products: d.items.map((i) => ({ name: i.name, sku: i.sku, quantity: i.quantity, price: rupees(i.unitPricePaise) })) },
      paymentMethod: { paymentMethod: cod ? 'cod' : 'prepaid' },
      ...(cod ? { amountToCollect: rupees(request.codAmountPaise) } : {}),
      packageDetails: { deadWeight: kg(d.package.weightG), length: cm(d.package.lengthMm), breadth: cm(d.package.widthMm), height: cm(d.package.heightMm), volumetricWeight: kg(d.package.volumetricWeightG || volumetricWeightG(d.package.lengthMm ?? 100, d.package.widthMm ?? 100, d.package.heightMm ?? 100)) },
    });
    const create = async (hub: string) => {
      const order = await this.call('POST', '/orders', body(hub));
      const id = firstString(order, ['id', 'order.id', 'orderId', 'order_id', 'data.id', 'data.order.id', 'data.orderId']);
      if (!id) throw new LorrigoError('Lorrigo created the order but did not return its id.', 502);
      return id;
    };
    try { return { id: await create(hubId), hubId }; }
    catch (e) {
      if (!(e instanceof LorrigoError)) throw e;
      if (e.upstreamStatus === 409) { // "Order Id already exists": reuse it
        const found = await this.call('GET', `/orders?orderNumber=${encodeURIComponent(ref)}`);
        const match = (isObj(found) && Array.isArray(found.orders) ? found.orders : []).find((o) => isObj(o) && (o.orderNumber === ref || o.order_number === ref));
        const id = match ? firstString(match, ['id']) : null;
        if (!id) throw e; // "already exists" but we cannot find it: surface Lorrigo's message
        return { id, hubId };
      }
      // The remembered pickup address was deleted or deactivated on Lorrigo's side: make (or find) a fresh one and retry once.
      if (d.pickupHubId && e.upstreamStatus === 400 && /hub|pickup/i.test(e.message)) { const fresh = await this.ensureHub(d.warehouse); if (fresh !== hubId) return { id: await create(fresh), hubId: fresh }; }
      throw e;
    }
  }

  /** The rates call is what makes an order shippable on Lorrigo, and it only lists couriers that serve this lane. */
  private async assertServiceable(lorrigoOrderId: string, courierId: string): Promise<void> {
    const res = await this.call('GET', `/shipments/${encodeURIComponent(lorrigoOrderId)}/rates`);
    const rates = isObj(res) && Array.isArray(res.rates) ? res.rates : [];
    if (!rates.some((r) => isObj(r) && r.id === courierId)) throw invalid('This courier does not serve this pickup/delivery pincode (Lorrigo lists it as unavailable). Choose another courier.');
  }

  /** The Lorrigo order record carries shipment { id, awb } once a courier is assigned; awb is null before that. */
  private async readShipment(lorrigoOrderId: string): Promise<{ id: string | null; awb: string | null; routing: string | null }> {
    const order = await this.call('GET', `/orders/${encodeURIComponent(lorrigoOrderId)}`).catch(() => null);
    const shipment = isObj(order) ? order.shipment : null; // the routing / sort code, if Lorrigo exposes one on the shipment, is printed on the label
    return { id: firstString(order, ['shipment.id']), awb: firstString(order, ['shipment.awb']), routing: findByKey(shipment, /^(routing(_?code)?|sort_?code|destination_?code|dest_?code)$/i) };
  }

  async book(request: CourierBookingRequest): Promise<CourierBookingResult> {
    const d = request.details; if (!d) throw new LorrigoError('Booking details are missing.', 502);
    this.deadline = Date.now() + 22_000;
    if (!d.externalServiceId) throw invalid('This courier service is not mapped to a Lorrigo courier.');
    validate(d, request);
    const hubId = d.pickupHubId ?? await this.ensureHub(d.warehouse);
    const order = await this.createOrReuseOrder(d, request, hubId);
    const result = (awb: string, id: string | null, routing: string | null = null): CourierBookingResult => ({ providerShipmentId: id ?? order.id, awb, labelAvailable: true, routingCode: routing ?? undefined, pickupHubId: order.hubId !== d.pickupHubId ? order.hubId : undefined });

    // An earlier attempt may already have shipped this order (our side rolled back, or the response was lost): reuse it, never ship twice.
    const earlier = await this.readShipment(order.id); if (earlier.awb) return result(earlier.awb, earlier.id, earlier.routing);
    await this.assertServiceable(order.id, d.externalServiceId);
    let shipment: unknown = null;
    try {
      shipment = await this.call('POST', '/shipments', { order_id: order.id, courier_id: d.externalServiceId });
    } catch (e) {
      if (e instanceof LorrigoError && e.statusCode === 502) { const after = await this.readShipment(order.id); if (after.awb) return result(after.awb, after.id, after.routing); } // timeout / 5xx: Lorrigo may have booked anyway
      if (e instanceof LorrigoError && /insufficient balance|recharge your wallet/i.test(e.message)) {
        console.error('Lorrigo account wallet is out of balance: top it up to resume bookings.'); // the platform's problem, not the seller's
        throw invalid('This courier is temporarily unavailable. Please choose another courier or contact support.');
      }
      throw e;
    }
    const after = await this.readShipment(order.id); // authoritative: it also holds the shipment id that /shipments/:id/cancel takes
    const awb = after.awb ?? firstString(shipment, ['awb', 'awb_number', 'awbNumber', 'shipment.awb', 'data.awb', 'data.shipment.awb']) ?? findByKey(shipment, /^(awb|awb_?number|waybill|tracking_?(number|id))$/i);
    if (!awb) throw new LorrigoError('Lorrigo did not return an AWB for this shipment. Check the shipment in the Lorrigo dashboard before booking again.', 502);
    return result(awb, after.id ?? firstString(shipment, ['shipment.id', 'shipment_id', 'shipmentId', 'data.shipment.id']), after.routing);
  }

  // POST /ndr/action, verified live by validation errors: body { ndrId, actionType, comment }; ndrId is the AWB (a wrong one answers "Shipment not found for AWB"),
  // actionType is one of reattempt | return | cancel. The success response could not be observed (no NDR exists on the account), so only a failure is read.
  async ndrAction(awb: string, action: NdrCourierAction, comment: string): Promise<void> {
    const res = await this.call('POST', '/ndr/action', { ndrId: awb, actionType: action, comment: comment.slice(0, 500) || 'Seller action from NEXGO' });
    if (isObj(res) && res.success === false) throw new LorrigoError(typeof res.message === 'string' ? res.message : 'Lorrigo did not accept the NDR action.', 502);
  }

  async cancel(providerShipmentId: string): Promise<void> {
    try { await this.call('POST', `/shipments/${encodeURIComponent(providerShipmentId)}/cancel`, {}); }
    catch (e) {
      // Only an explicit "already cancelled" counts as done. A 404 is NOT treated that way: with a wrong shipment id it would let NEXGO refund
      // the seller while the courier still ships the parcel.
      if (e instanceof LorrigoError && /already (been )?cancel+ed/i.test(e.message)) return;
      throw e;
    }
  }
}
