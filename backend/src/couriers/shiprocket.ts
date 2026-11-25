import { createHash } from 'node:crypto';
import { sellerSafeMessage, BOOKING_PAUSED } from '../lib/sellerSafeError.js';
import { config } from '../config.js';
import { aggregatorLimiter } from './aggregatorLimiterShared.js';
import { isBalanceRefusal, markRefused, markWorking } from '../lib/aggregatorRefusals.js';
import { db } from '../db/client.js';
import type { BookingDetails, CourierAdapter, CourierBookingRequest, CourierBookingResult } from './types.js';

// Shiprocket (https://apiv2.shiprocket.in/v1/external), a second courier aggregator next to Lorrigo. Booking:
//   POST /auth/login (API user e-mail + password -> token, cached)  ->  POST /settings/company/addpickup (once per warehouse)
//   ->  POST /orders/create/adhoc  ->  GET /courier/serviceability (is the chosen courier_company_id on offer for this lane?)
//   ->  POST /courier/assign/awb {shipment_id, courier_id}  ->  POST /courier/generate/pickup {shipment_id: [id]} (best effort).
// Cancel is POST /orders/cancel {ids: [order_id]}; NEXGO keeps the Shiprocket ORDER id as shipments.provider_shipment_id for that.
// Tracking arrives by webhook and, as a safety net, GET /courier/track/awb/{awb} (see aggregators/shiprocket/index.ts).
// Built from the public Shiprocket documentation (apidocs.shiprocket.in, the API helpsheet) and tested against a fake Shiprocket server: it has NOT yet
// been run against a live Shiprocket account (no API user was available), so the first real booking should be a single test order.

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);

export function firstString(body: unknown, paths: string[]): string | null {
  for (const path of paths) {
    let cur: unknown = body;
    for (const key of path.split('.')) cur = isObj(cur) ? cur[key] : Array.isArray(cur) ? cur[Number(key)] : undefined;
    if ((typeof cur === 'string' && cur) || typeof cur === 'number') return String(cur);
  }
  return null;
}
export function findByKey(body: unknown, pattern: RegExp, depth = 0): string | null {
  if (depth > 6 || !body || typeof body !== 'object') return null;
  for (const [k, v] of Object.entries(body as Json)) {
    if (pattern.test(k) && (typeof v === 'string' || typeof v === 'number') && String(v)) return String(v);
    const nested = findByKey(v, pattern, depth + 1); if (nested) return nested;
  }
  return null;
}

const rupees = (paise: number) => Math.round(paise) / 100;
const kg = (grams: number) => Math.max(grams, 1) / 1000;
const cm = (mm: number | null) => (mm ? Math.max(1, Math.round(mm / 10)) : 10); // unknown dimensions fall back to 10 cm so the order can still be created
const tenDigits = (phone: string) => phone.replace(/\D/g, '').slice(-10);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** "YYYY-MM-DD HH:mm" in Indian time, the format Shiprocket wants for order_date. */
export function istDateTime(d = new Date()): string {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour === '24' ? '00' : p.hour}:${p.minute}`;
}

export class ShiprocketError extends Error {
  // 4xx from Shiprocket (unserviceable pincode, bad data...) is a 422 so auto-assign moves on to the next courier; anything else is a 502.
  readonly expose = true; // the message is safe to show the seller (see the error handler in app.ts)
  readonly detail: string; // the original text, for logs and the admin connection test
  laneRefusal?: boolean;
  constructor(message: string, readonly statusCode: number, readonly upstreamStatus?: number) { super(sellerSafeMessage(message)); this.detail = message; }
}
const invalid = (message: string) => new ShiprocketError(message, 422);

// Checked before any Shiprocket call, so bad data never creates a pickup location or an order there and the seller is told exactly what to fix.
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


// One login per credentials, shared by every booking: Shiprocket tokens last days, logging in for each call would be slow and could be rate limited.
const TOKEN_TTL_MS = 20 * 3_600_000; // the documentation says 240 h in one place and 24 h in another: refreshed well inside the shorter one (and on any 401)
const tokens = new Map<string, { token: string; at: number }>();
const logins = new Map<string, Promise<string>>();

export class ShiprocketAdapter implements CourierAdapter {
  readonly providerCode = 'shiprocket';
  constructor(private readonly email: string, private readonly password: string, private readonly baseUrl = 'https://apiv2.shiprocket.in') {}
  private get tokenKey() { return `${this.baseUrl}|${this.email}`; }

  private async rawFetch(method: 'GET' | 'POST', path: string, body: unknown, token: string | null): Promise<{ res: Response; json: unknown }> {
    const t0 = Date.now();
    let res: Response; let text: string;
    try {
      ({ res, text } = await aggregatorLimiter.run(async () => {
        const r = await fetch(`${this.baseUrl}/v1/external${path}`, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(9_000) });
        return { res: r, text: await r.text() };
      }));
    } catch { throw new ShiprocketError('The courier network did not respond in time. Try again.', 502); }
    let json: unknown = null; try { json = text ? JSON.parse(text) : null; } catch { /* an HTML error page from a gateway */ }
    console.log(JSON.stringify({ evt: 'aggregator.call', aggregator: 'shiprocket', method, path: path.split('?')[0].replace(/\/\d{5,}/g, '/:id'), status: res.status, ms: Date.now() - t0 }));
    return { res, json };
  }

  private async login(): Promise<string> {
    const key = this.tokenKey;
    const hit = tokens.get(key); if (hit && Date.now() - hit.at < TOKEN_TTL_MS) return hit.token;
    const running = logins.get(key); if (running) return running;
    const flight = (async () => {
      const { res, json } = await this.rawFetch('POST', '/auth/login', { email: this.email, password: this.password }, null);
      const token = isObj(json) && typeof json.token === 'string' ? json.token : null;
      if (!res.ok || !token) {
        const why = isObj(json) && typeof json.message === 'string' ? json.message : `status ${res.status}`;
        throw new ShiprocketError(res.status === 401 || res.status === 403 || res.status === 422 ? `Shiprocket rejected the API user e-mail or password (${why}). Please contact support.` : `Shiprocket login failed (${why}).`, 502, res.status);
      }
      tokens.set(key, { token, at: Date.now() });
      return token;
    })().finally(() => { logins.delete(key); });
    logins.set(key, flight);
    return flight;
  }

  // The API runs as a 30 s serverless function and a booking is several calls, so every call is capped and the booking as a whole has a deadline.
  private deadline = 0;
  private async call(method: 'GET' | 'POST', path: string, body?: unknown, attempt = 0): Promise<unknown> {
    if (this.deadline && Date.now() > this.deadline) throw new ShiprocketError('The courier network is responding too slowly. Nothing was charged; try again in a moment.', 502);
    const token = await this.login();
    const { res, json } = await this.rawFetch(method, path, body, token);
    if (res.ok) { aggregatorLimiter.ok(); return json; }
    if (res.status === 401 && attempt < 1) { tokens.delete(this.tokenKey); return this.call(method, path, body, attempt + 1); } // the token expired: log in again once
    if (res.status === 502 || res.status === 503 || res.status === 504) {
      aggregatorLimiter.tooMany();
      if (method === 'GET' && attempt < 2) { await sleep(400 + Math.floor(Math.random() * 600)); return this.call(method, path, body, attempt + 1); }
    }
    if (res.status === 429) {
      aggregatorLimiter.tooMany();
      if (attempt < 3) { await sleep(Math.min(5000, (Number(res.headers.get('retry-after')) || 1) * 1000) + Math.floor(Math.random() * 400)); return this.call(method, path, body, attempt + 1); }
      throw new ShiprocketError('The courier network is rate limiting requests right now. Try again in a minute.', 502, 429);
    }
    throw new ShiprocketError(`Shiprocket: ${errorText(json, res.status)}`, res.status >= 500 ? 502 : res.status === 401 || res.status === 403 ? 502 : 422, res.status);
  }

  /** The courier services this aggregator offers, read from the serviceability call on a few typical lanes (Shiprocket has no plain list of courier ids). */
  async listServices(): Promise<{ id: string; name: string; type: string }[]> {
    const lanes: [string, string][] = [['110001', '400001'], ['400001', '560001'], ['700001', '110001'], ['600001', '500001']];
    const seen = new Map<string, { id: string; name: string; type: string }>();
    let firstError: unknown = null;
    for (const [from, to] of lanes) {
      try {
        const res = await this.call('GET', `/courier/serviceability/?pickup_postcode=${from}&delivery_postcode=${to}&weight=0.5&cod=0`);
        for (const c of availableCouriers(res)) { const id = String(c.courier_company_id ?? ''); const name = String(c.courier_name ?? '').trim(); if (id && name && !seen.has(id)) seen.set(id, { id, name, type: String(c.mode ?? c.type ?? '').toLowerCase() }); }
      } catch (e) { firstError = firstError ?? e; }
    }
    if (!seen.size && firstError) throw firstError;
    return [...seen.values()];
  }

  /** The platform's wallet with Shiprocket in rupees (GET /account/details/wallet-balance). Null when the answer carries no balance. */
  async balance(): Promise<number | null> {
    const body = await this.call('GET', '/account/details/wallet-balance');
    const raw = findByKey(body, /^balance_?amount$/i) ?? findByKey(body, /^(wallet_?)?balance$/i);
    const n = raw === null ? NaN : Number(raw);
    return Number.isFinite(n) ? n : null;
  }

  /** Finds our pickup location by name, otherwise creates it. Shiprocket's `pickup_location` on an order is this NAME, not an id. */
  private async findHub(name: string): Promise<string | null> {
    const res = await this.call('GET', '/settings/company/pickup');
    const list = isObj(res) && isObj(res.data) && Array.isArray(res.data.shipping_address) ? res.data.shipping_address : [];
    const found = list.find((h) => isObj(h) && h.pickup_location === name);
    return found ? name : null;
  }
  private static hubFlights = new Map<string, Promise<string>>(); // a new warehouse's first bookings start together: only ONE looks it up / creates it
  private ensureHub(w: BookingDetails['warehouse']): Promise<string> {
    const key = `${this.baseUrl}|${w.id}`;
    const running = ShiprocketAdapter.hubFlights.get(key); if (running) return running;
    const flight = this.ensureHubOnce(w).finally(() => { ShiprocketAdapter.hubFlights.delete(key); });
    ShiprocketAdapter.hubFlights.set(key, flight);
    return flight;
  }
  private async ensureHubOnce(w: BookingDetails['warehouse']): Promise<string> {
    validateWarehouse(w);
    const name = `NX-${w.id.replace(/-/g, '').slice(0, 10)}`; // short and unique per warehouse (Shiprocket limits the name's length)
    if (await this.findHub(name)) return name;
    try {
      await this.call('POST', '/settings/company/addpickup', {
        pickup_location: name, name: w.contactName, email: w.email && EMAIL.test(w.email) ? w.email : `pickup-${w.id.slice(0, 8)}@${platformDomain()}`, phone: tenDigits(w.phone),
        address: w.address1, address_2: w.address2 ?? '', city: w.city, state: w.state, country: 'India', pin_code: w.pincode,
      });
    } catch (e) { // two bookings from a new warehouse at once: the other one created it a moment ago
      if (e instanceof ShiprocketError && /already|exists|duplicate/i.test(e.detail) && await this.findHub(name)) return name;
      throw e;
    }
    return name;
  }

  /** A stable reference for the Shiprocket order: it changes when the customer, products, weight or payment change, so a corrected order is not stuck with stale data. */
  private orderRef(d: BookingDetails, request: CourierBookingRequest) {
    const fingerprint = JSON.stringify([d.consignee, d.items, d.package, request.paymentMode, request.codAmountPaise, d.warehouse.id]);
    return `${d.nexgoOrderId}-${createHash('sha1').update(fingerprint).digest('hex').slice(0, 6)}${d.undone ? `-R${d.undone}` : ''}`; // -R1, -R2 ...: an earlier booking was undone
  }
  /** Our own record of orders already sent (ref -> "orderId:shipmentId"): a retry reuses the order instead of creating it twice. */
  private async knownOrder(ref: string): Promise<{ orderId: string; shipmentId: string } | null> {
    try {
      const v = (await db.query<{ external_order_id: string }>(`SELECT external_order_id FROM aggregator_orders WHERE aggregator = 'shiprocket' AND ref = $1`, [ref])).rows[0]?.external_order_id;
      const [orderId, shipmentId] = (v ?? '').split(':'); return orderId && shipmentId ? { orderId, shipmentId } : null;
    } catch { return null; }
  }
  private async rememberOrder(ref: string, orderId: string, shipmentId: string, nexgoOrderId: string): Promise<void> {
    try {
      await db.query(`INSERT INTO aggregator_orders (aggregator, ref, external_order_id, order_id, seller_id) SELECT 'shiprocket', $1, $2, o.id, o.seller_id FROM orders o WHERE o.nexgo_order_id = $3
        ON CONFLICT (aggregator, ref) DO UPDATE SET external_order_id = EXCLUDED.external_order_id`, [ref, `${orderId}:${shipmentId}`, nexgoOrderId]);
    } catch (e) { console.error('Could not remember the aggregator order id', (e as Error).message); }
  }

  private async createOrReuseOrder(d: BookingDetails, request: CourierBookingRequest, hub: string): Promise<{ orderId: string; shipmentId: string; reused: boolean }> {
    const ref = this.orderRef(d, request);
    const known = await this.knownOrder(ref); if (known) return { ...known, reused: true };
    const cod = request.paymentMode === 'cod';
    const itemsTotal = d.items.reduce((s, i) => s + i.unitPricePaise * i.quantity, 0);
    const [first, ...rest] = d.consignee.name.trim().split(/\s+/);
    const body = {
      order_id: ref, order_date: istDateTime(), pickup_location: hub, comment: `NEXGO ${d.nexgoOrderId}`,
      billing_customer_name: first, billing_last_name: rest.join(' '),
      billing_address: [d.consignee.address1, d.consignee.landmark].filter(Boolean).join(', ').slice(0, 190), billing_address_2: (d.consignee.address2 ?? '').slice(0, 190),
      billing_city: d.consignee.city, billing_pincode: d.consignee.pincode, billing_state: d.consignee.state, billing_country: 'India',
      billing_email: d.consignee.email && EMAIL.test(d.consignee.email) ? d.consignee.email : `${d.nexgoOrderId.toLowerCase()}@${platformDomain()}`, // Shiprocket insists on an e-mail
      billing_phone: tenDigits(d.consignee.phone), shipping_is_billing: true,
      order_items: d.items.map((i) => ({ name: i.name.slice(0, 120), sku: i.sku || i.name.slice(0, 40), units: i.quantity, selling_price: rupees(i.unitPricePaise), discount: 0, tax: 0 })),
      payment_method: cod ? 'COD' : 'Prepaid', // case-sensitive
      shipping_charges: 0, giftwrap_charges: 0, transaction_charges: 0, total_discount: 0,
      sub_total: rupees(cod ? request.codAmountPaise : itemsTotal), // for COD this is the amount the courier collects
      length: cm(d.package.lengthMm), breadth: cm(d.package.widthMm), height: cm(d.package.heightMm), weight: kg(d.package.weightG),
    };
    let created: unknown;
    try { created = await this.call('POST', '/orders/create/adhoc', body); }
    catch (e) {
      if (e instanceof ShiprocketError && /pickup/i.test(e.detail) && /location|address|verif|wrong/i.test(e.detail)) throw new ShiprocketError('The pickup address for this warehouse is not ready on the courier network yet (it may need verification). Please contact support.', 502, e.upstreamStatus);
      throw e;
    }
    const orderId = firstString(created, ['order_id', 'data.order_id']); const shipmentId = firstString(created, ['shipment_id', 'data.shipment_id']);
    if (!orderId || !shipmentId) throw new ShiprocketError(`Shiprocket did not accept the order${isObj(created) && typeof created.message === 'string' ? `: ${created.message}` : ' (no order id was returned)'}.`, 502);
    await this.rememberOrder(ref, orderId, shipmentId, d.nexgoOrderId);
    return { orderId, shipmentId, reused: false };
  }

  /** Is the chosen courier on offer for this lane (and payment mode)? Otherwise a 422 lane refusal: the next courier is tried and the refusal is remembered for 24 h. */
  private async assertServiceable(d: BookingDetails, request: CourierBookingRequest, courierId: string): Promise<void> {
    let res: unknown;
    try { res = await this.call('GET', `/courier/serviceability/?pickup_postcode=${d.warehouse.pincode}&delivery_postcode=${d.consignee.pincode}&weight=${kg(d.package.weightG)}&cod=${request.paymentMode === 'cod' ? 1 : 0}`); }
    catch (e) { if (e instanceof ShiprocketError && e.statusCode === 422 && /serviceab|courier|pincode/i.test(e.detail)) throw lane(`This courier cannot serve ${d.consignee.pincode} from this warehouse.`); throw e; }
    const ok = availableCouriers(res).some((c) => String(c.courier_company_id) === courierId);
    if (!ok) throw lane(`This courier cannot serve ${d.consignee.pincode} from this warehouse${request.paymentMode === 'cod' ? ' for cash on delivery' : ''}.`);
  }

  /** A booking that went through also tells the rest of the system that Shiprocket accepts bookings (any earlier refusal for balance is over). */
  async book(request: CourierBookingRequest): Promise<CourierBookingResult> {
    const out = await this.bookOnce(request);
    markWorking('shiprocket');
    return out;
  }

  private async bookOnce(request: CourierBookingRequest): Promise<CourierBookingResult> {
    const d = request.details; if (!d) throw new ShiprocketError('Booking details are missing.', 502);
    this.deadline = Date.now() + 22_000;
    if (!d.externalServiceId) throw invalid('This courier service is not mapped to a courier on the courier network.');
    validate(d, request);
    const hub = d.pickupHubId ?? await this.ensureHub(d.warehouse);
    const order = await this.createOrReuseOrder(d, request, hub);
    const result = (awb: string): CourierBookingResult => ({ providerShipmentId: order.orderId, awb, labelAvailable: true, pickupHubId: hub !== d.pickupHubId ? hub : undefined });

    // An earlier attempt may already have shipped this order (our side rolled back, or the answer was lost): reuse it, never ship twice.
    if (order.reused) { const earlier = await this.readAwbStrict(order.orderId); if (earlier) { await this.requestPickup(order.shipmentId); return result(earlier); } }
    await this.assertServiceable(d, request, d.externalServiceId);
    let assigned: unknown;
    try { assigned = await this.call('POST', '/courier/assign/awb', { shipment_id: order.shipmentId, courier_id: d.externalServiceId }); }
    catch (e) {
      // Timeout / 5xx: Shiprocket may have booked anyway; a refusal can also mean "already assigned" (an earlier answer was lost). Read the order before believing it.
      if (e instanceof ShiprocketError && !isBalanceRefusal(e.detail)) { const after = await this.readAwb(order.orderId); if (after) return result(after); }
      if (e instanceof ShiprocketError && isBalanceRefusal(e.detail)) throw await outOfBalance();
      throw e;
    }
    // A 200 can still be a refusal: { awb_assign_status: 0, message: "..." }.
    const awb = firstString(assigned, ['response.data.awb_code', 'data.awb_code', 'awb_code']) ?? findByKey(assigned, /^awb(_?code)?$/i);
    if (!awb) {
      const message = isObj(assigned) ? errorText(assigned, 200) : '';
      if (isBalanceRefusal(message)) throw await outOfBalance();
      const again = await this.readAwb(order.orderId); if (again) return result(again); // "already assigned"
      if (/not serviceable|serviceab|pincode/i.test(message)) throw lane(`This courier cannot take this parcel. ${message}`.slice(0, 200));
      throw new ShiprocketError(`Shiprocket did not assign an AWB${message ? `: ${message}` : ''}.`, message ? 422 : 502);
    }
    await this.requestPickup(order.shipmentId);
    return result(awb);
  }

  /** The AWB of an order that may already be booked (GET /orders/show/{id}). */
  private async readAwbStrict(orderId: string): Promise<string | null> {
    const res = await this.call('GET', `/orders/show/${encodeURIComponent(orderId)}`);
    return firstString(res, ['data.shipments.awb', 'data.shipments.0.awb', 'data.awb_data.awb', 'data.awb_code', 'data.awb']);
  }
  private async readAwb(orderId: string): Promise<string | null> { return this.readAwbStrict(orderId).catch(() => null); }
  /**
   * Did an earlier call already book this? Only an order whose id we stored can carry an AWB (the AWB is asked for after the id is known and stored), so no stored id
   * means nothing was shipped. Throws when Shiprocket cannot be read (never "not booked" by mistake).
   */
  async findBooking(request: CourierBookingRequest): Promise<CourierBookingResult | null> {
    const d = request.details; if (!d) return null;
    this.deadline = 0;
    const row = (await db.query<{ external_order_id: string }>(`SELECT external_order_id FROM aggregator_orders WHERE aggregator = 'shiprocket' AND ref = $1`, [this.orderRef(d, request)])).rows[0];
    const orderId = row?.external_order_id.split(':')[0]; if (!orderId) return null;
    const awb = await this.readAwbStrict(orderId);
    return awb ? { providerShipmentId: orderId, awb, labelAvailable: true } : null;
  }
  /** Asks the courier to collect the parcel. Best effort: a booking whose pickup was already requested (or auto-scheduled) is still a booking. */
  private async requestPickup(shipmentId: string): Promise<void> {
    try { await this.call('POST', '/courier/generate/pickup', { shipment_id: [Number.isFinite(Number(shipmentId)) ? Number(shipmentId) : shipmentId] }); }
    catch (e) { console.warn('Shiprocket pickup request not accepted (the parcel is booked)', (e as Error).message); }
  }

  /** Tracking for one AWB (GET /courier/track/awb/{awb}); the poll fallback reads it when webhooks are missing. */
  trackAwb(awb: string): Promise<unknown> { return this.call('GET', `/courier/track/awb/${encodeURIComponent(awb)}`); }

  async cancel(providerShipmentId: string): Promise<void> {
    try { await this.call('POST', '/orders/cancel', { ids: [Number.isFinite(Number(providerShipmentId)) ? Number(providerShipmentId) : providerShipmentId] }); }
    catch (e) {
      // Only an explicit "already cancelled" counts as done. "Not found" is NOT treated that way: with a wrong id it would let NEXGO refund the seller while the courier still ships.
      if (e instanceof ShiprocketError && /already (been )?cancel+ed/i.test(e.detail)) return;
      throw e;
    }
  }
}

function platformDomain(): string { try { return new URL(config.FRONTEND_ORIGIN).hostname || 'mynexgo.com'; } catch { return 'mynexgo.com'; } }
function lane(message: string): ShiprocketError { const e = new ShiprocketError(message, 422); e.laneRefusal = true; return e; }
async function outOfBalance(): Promise<ShiprocketError> {
  console.error('Shiprocket refused a booking for balance: top the wallet up to resume bookings.');
  await markRefused('shiprocket'); // awaited: the hold is recorded for every process BEFORE this booking reports its failure (no race with the next attempt)
  return new ShiprocketError(BOOKING_PAUSED, 503, 402); // every courier on this aggregator shares that balance: stop at once, the queue keeps the orders and books them after a top-up
}
function availableCouriers(res: unknown): Json[] {
  const list = isObj(res) && isObj(res.data) && Array.isArray(res.data.available_courier_companies) ? res.data.available_courier_companies : [];
  return list.filter(isObj);
}
/** Shiprocket errors look like { message, errors: { field: ["text"] }, status_code }. */
function errorText(json: unknown, status: number): string {
  if (!isObj(json)) return `error ${status}`;
  const parts: string[] = [];
  if (typeof json.message === 'string') parts.push(json.message);
  if (isObj(json.errors)) for (const v of Object.values(json.errors)) parts.push(Array.isArray(v) ? v.filter((x) => typeof x === 'string').join(' ') : typeof v === 'string' ? v : '');
  return (parts.filter(Boolean).join(' ') || `error ${status}`).slice(0, 300);
}
