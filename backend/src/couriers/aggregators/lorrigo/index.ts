import { createHash, timingSafeEqual } from 'node:crypto';
import { config } from '../../../config.js';
import { LorrigoAdapter } from '../../lorrigo.js';
import type { Mapped } from '../../../lib/trackingIngest.js';
import type { AggregatorPlugin, NormalizedEvent, NormalizedUpdate } from '../types.js';

// Lorrigo pushes every tracking change to the URL saved in its dashboard (Webhooks), with the token we chose in the x-api-key header.
// The payload carries the whole history, so it is replayed idempotently: an event is unique per (awb, status, timestamp).
const STATUS: Record<string, Mapped> = {
  PICKED_UP: { state: 'in_transit' }, IN_TRANSIT: { state: 'in_transit' }, OUT_FOR_DELIVERY: { state: 'out_for_delivery' }, DELIVERED: { state: 'delivered' }, NDR: { state: 'ndr' },
  RTO_INITIATED: { state: 'rto' }, RTO_IN_TRANSIT: { state: 'rto', rto: 'in_transit' }, REACHED_BACK_AT_SELLER_CITY: { state: 'rto', rto: 'in_transit' },
  RTO_OFD: { state: 'rto', rto: 'out_for_delivery' }, RTO_DELIVERED: { state: 'rto', rto: 'delivered' }, LOST: { state: 'lost' },
};
// Known statuses that need no action (booking already recorded them), so they are not reported as "unmapped".
const IGNORED = new Set(['NEW', 'PICKUP_SCHEDULED', 'OUT_FOR_PICKUP']);
// CANCELLED is deliberately not applied: a cancellation made on Lorrigo's side has to go through NEXGO's own cancel flow so the wallet refund
// happens exactly once. It comes back as an unmapped status, so support can act on it.
const normalize = (s: unknown) => String(s ?? '').trim().toUpperCase().replace(/[\s-]+/g, '_');
const safeEqual = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };

// Any other RTO-prefixed status the aggregator may send (RTO_REACHED, RTO_UNDELIVERED ...) still means the parcel is returning.
function rtoFallback(status: string): Mapped | undefined {
  if (/^(NDR|UNDELIVERED)(_|$)/.test(status)) return { state: 'ndr' }; // e.g. NDR_1_ATTEMPT: a failed delivery attempt, whatever the suffix
  if (!/^RTO(_|$)/.test(status)) return undefined;
  return /DELIVERED/.test(status) && !/UNDELIVERED/.test(status) ? { state: 'rto', rto: 'delivered' } : /OFD|OUT_FOR/.test(status) ? { state: 'rto', rto: 'out_for_delivery' } : { state: 'rto', rto: 'in_transit' };
}

type TrackingEvent = { status?: string; location?: string | null; description?: string | null; timestamp?: string };
type Item = { awb?: string | number; status?: string; location?: string; description?: string; tracking_events?: TrackingEvent[] };

// Accepts { data: {...} }, { data: [...] }, a flat { awb, ... } or a bare array, so a change in Lorrigo's envelope cannot silently drop updates.
function items(body: unknown): Item[] {
  const list = Array.isArray(body) ? body : body && typeof body === 'object' ? ((body as { data?: unknown }).data ?? body) : [];
  return (Array.isArray(list) ? list : [list]).filter((x): x is Item => !!x && typeof x === 'object' && x.awb !== undefined && x.awb !== null && String(x.awb).trim() !== '').slice(0, 100);
}

/** One Lorrigo item (webhook payload or an order from GET /orders) as a normalised update. */
export function toUpdate(item: Item): NormalizedUpdate | null {
  const awb = String(item.awb).trim();
  if (!awb || awb.length > 64) return null;
  const events: NormalizedEvent[] = (Array.isArray(item.tracking_events) ? item.tracking_events : [])
    .map((e) => ({ e, status: normalize(e?.status), t: Date.parse(String(e?.timestamp ?? '')) }))
    .map((x) => ({ ...x, m: STATUS[x.status] ?? rtoFallback(x.status) }))
    .filter((x) => x.m && Number.isFinite(x.t)).sort((a, b) => a.t - b.t)
    .map((x) => ({ mapped: x.m as Mapped, at: new Date(x.t).toISOString(), location: x.e.location ?? null, description: x.e.description || x.status, eventId: createHash('sha1').update(`${awb}|${x.status}|${x.e.timestamp}`).digest('hex') }));
  const topStatus = normalize(item.status); const top = STATUS[topStatus] ?? rtoFallback(topStatus);
  // The courier's overall status is the truth about where the parcel is now. When it describes the same stage as a scan in the history, that
  // scan's own wording (e.g. the real NDR reason) is kept instead of the bare status name.
  const sameKind = [...events].reverse().find((e) => top && e.mapped.state === top.state && e.mapped.rto === top.rto); // keeps the courier's real wording (NDR reason)
  const current: NormalizedEvent | undefined = top ? { mapped: top, at: new Date().toISOString(), location: item.location ?? sameKind?.location ?? null, description: item.description || sameKind?.description || topStatus, eventId: `status:${topStatus}` } : undefined;
  return { awb, raw: item, events, current, unmappedStatus: topStatus && !top && !IGNORED.has(topStatus) ? topStatus : undefined };
}

export const lorrigo: AggregatorPlugin = {
  id: 'lorrigo',
  label: 'Lorrigo',
  credentialFields: [
    { key: 'apiKey', label: 'API key', secret: true, required: true, hint: 'Lorrigo dashboard > API' },
    { key: 'webhookToken', label: 'Webhook token', secret: true, required: true, hint: 'The same value goes in Lorrigo > Webhooks > Token (sent as the x-api-key header)' },
    { key: 'baseUrl', label: 'API base URL', secret: false, required: false, hint: 'Leave empty for https://app.lorrigo.com/api/v2' },
  ],
  capabilities: { listServices: true, serviceability: true, track: true, ndrAction: true, cancel: true, balance: true },
  envCredentials: () => ({ apiKey: config.LORRIGO_API_KEY ?? '', webhookToken: config.LORRIGO_WEBHOOK_TOKEN ?? '', baseUrl: config.LORRIGO_BASE_URL }),
  create(credentials) {
    // Never fall back to the mock here: a "live" aggregator that silently fakes an AWB would book nothing at the courier.
    if (!credentials.apiKey) throw Object.assign(new Error('Lorrigo is not configured on this server.'), { statusCode: 503, expose: true });
    return new LorrigoAdapter(credentials.apiKey, credentials.baseUrl || 'https://app.lorrigo.com/api/v2');
  },
  // The order list carries the same history as the webhook (as trackingEvents), so one call per 100 orders replaces per-AWB lookups.
  async poll(credentials, wanted) {
    const adapter = new LorrigoAdapter(credentials.apiKey, credentials.baseUrl || 'https://app.lorrigo.com/api/v2');
    return (await adapter.recentOrders(wanted?.size ? 20 : 5, wanted))
      .filter((o) => o.awb)
      .map((o) => toUpdate({ awb: o.awb as string, status: o.status as string, tracking_events: Array.isArray(o.trackingEvents) ? (o.trackingEvents as TrackingEvent[]) : [] }))
      .filter((u): u is NormalizedUpdate => !!u);
  },
  webhook: {
    configured: (credentials) => !!credentials.webhookToken,
    verify: (headers, credentials) => { const token = headers['x-api-key']; return !!credentials.webhookToken && typeof token === 'string' && safeEqual(token, credentials.webhookToken); },
    parse: (body) => items(body).map(toUpdate).filter((u): u is NormalizedUpdate => !!u),
  },
};
