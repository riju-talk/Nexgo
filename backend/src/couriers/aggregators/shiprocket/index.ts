import { createHash, timingSafeEqual } from 'node:crypto';
import { config } from '../../../config.js';
import { ShiprocketAdapter } from '../../shiprocket.js';
import type { Mapped } from '../../../lib/trackingIngest.js';
import type { AggregatorPlugin, NormalizedEvent, NormalizedUpdate } from '../types.js';

// Shiprocket pushes tracking to the webhook URL saved in its dashboard (Settings > API > Webhooks) and can also be asked per AWB
// (GET /courier/track/awb/{awb}). Both carry the same pieces: the overall status (a label and a numeric id) and the scans (each with an
// "sr-status" id and "sr-status-label"). Statuses are mapped by id first (stable), then by label (normalised text), and anything
// unknown is returned as `unmappedStatus` so support sees it. A cancellation at Shiprocket is deliberately not applied: it must go through
// NEXGO's own cancel so the wallet refund happens exactly once.
const BY_ID: Record<number, Mapped> = {
  6: { state: 'in_transit' }, 18: { state: 'in_transit' }, 42: { state: 'in_transit' }, 38: { state: 'in_transit' }, 39: { state: 'in_transit' },
  17: { state: 'out_for_delivery' }, 7: { state: 'delivered' }, 26: { state: 'delivered' }, 21: { state: 'ndr' }, 12: { state: 'lost' },
  9: { state: 'rto' }, 14: { state: 'rto', rto: 'in_transit' }, 46: { state: 'rto', rto: 'in_transit' }, 40: { state: 'rto', rto: 'in_transit' }, 41: { state: 'rto', rto: 'out_for_delivery' }, 10: { state: 'rto', rto: 'delivered' },
};
// Statuses that need no action (the booking already recorded them, or they describe a delay that changes nothing).
const IGNORED = /^(NEW|READY TO SHIP|PICKUP SCHEDULED|PICKUP GENERATED|OUT FOR PICKUP|PICKUP RESCHEDULED|PICKUP ERROR|PICKUP EXCEPTION|PICKUP BOOKED|AWB ASSIGNED|MANIFEST(ED)?|SHIPMENT BOOKED|DELAYED|CANCELLATION REQUESTED|PARTIAL DELIVERED)$/;

export const normalize = (s: unknown) => String(s ?? '').trim().toUpperCase().replace(/[\s_-]+/g, ' ');
const safeEqual = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };

/** Maps a Shiprocket status (numeric id and / or label) to a NEXGO state; undefined when unknown. */
export function mapStatus(id: unknown, label: unknown): Mapped | undefined {
  const n = Number(id); if (Number.isInteger(n) && BY_ID[n]) return BY_ID[n];
  const t = normalize(label); if (!t) return undefined;
  if (/^RTO/.test(t)) return /DELIVERED/.test(t) && !/UNDELIVERED/.test(t) ? { state: 'rto', rto: 'delivered' } : /OFD|OUT FOR DELIVERY/.test(t) ? { state: 'rto', rto: 'out_for_delivery' } : /INITIATED|^RTO$/.test(t) ? { state: 'rto' } : { state: 'rto', rto: 'in_transit' };
  if (/^(DELIVERED|FULFILLED)$/.test(t)) return { state: 'delivered' };
  if (/OUT FOR DELIVERY/.test(t)) return { state: 'out_for_delivery' };
  if (/^UNDELIVERED/.test(t)) return { state: 'ndr' }; // "UNDELIVERED-1st Attempt" ...
  if (/^LOST$/.test(t)) return { state: 'lost' };
  if (/^(PICKED UP|SHIPPED|IN TRANSIT|REACHED (AT )?DESTINATION HUB|MISROUTED|IN FLIGHT|CONNECTION ALIGNED|HANDOVER TO COURIER)/.test(t)) return { state: 'in_transit' };
  return undefined;
}
const isIgnored = (label: unknown) => IGNORED.test(normalize(label));

type Scan = { date?: string; status?: string; activity?: string; location?: string; 'sr-status'?: string | number; 'sr-status-label'?: string };
type Item = { awb?: string | number; current_status?: string; current_status_id?: string | number; shipment_status?: string; shipment_status_id?: string | number; scans?: Scan[] };

/** Shiprocket times are Indian time ("2024-05-02 14:30:00"); a value that already carries a zone is taken as it is. */
export function parseTime(v: unknown): number {
  const s = String(v ?? '').trim(); if (!s) return NaN;
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/.test(s)) return Date.parse(`${s.replace(' ', 'T')}${s.length === 16 ? ':00' : ''}+05:30`);
  const dmy = s.match(/^(\d{2})[ \-/](\d{2})[ \-/](\d{4})[ T](\d{2}):(\d{2}):?(\d{2})?$/); // "23 05 2024 11:43:52"
  if (dmy) return Date.parse(`${dmy[3]}-${dmy[2]}-${dmy[1]}T${dmy[4]}:${dmy[5]}:${dmy[6] ?? '00'}+05:30`);
  return Date.parse(s);
}

function items(body: unknown): Item[] {
  const list = Array.isArray(body) ? body : body && typeof body === 'object' ? ((body as { data?: unknown }).data ?? body) : [];
  return (Array.isArray(list) ? list : [list]).filter((x): x is Item => !!x && typeof x === 'object' && x.awb !== undefined && x.awb !== null && String(x.awb).trim() !== '').slice(0, 100);
}

/** One Shiprocket item (webhook payload, or a tracking answer reshaped by `fromTracking`) as a normalised update. */
export function toUpdate(item: Item): NormalizedUpdate | null {
  const awb = String(item.awb).trim();
  if (!awb || awb.length > 64) return null;
  const events: NormalizedEvent[] = (Array.isArray(item.scans) ? item.scans : [])
    .map((s) => ({ s, label: s?.['sr-status-label'] ?? s?.status, t: parseTime(s?.date) }))
    .map((x) => ({ ...x, m: mapStatus(x.s?.['sr-status'], x.s?.['sr-status-label'] ?? x.s?.status) }))
    .filter((x) => x.m && Number.isFinite(x.t)).sort((a, b) => a.t - b.t)
    .map((x) => ({ mapped: x.m as Mapped, at: new Date(x.t).toISOString(), location: x.s.location ?? null, description: x.s.activity || String(x.label ?? ''), eventId: createHash('sha1').update(`${awb}|${normalize(x.label)}|${x.s.date}`).digest('hex') }));
  const topLabel = item.current_status ?? item.shipment_status; const topId = item.current_status_id ?? item.shipment_status_id;
  const top = mapStatus(topId, topLabel);
  // The overall status keeps the wording of the newest scan describing the same stage (e.g. the real NDR reason).
  const sameKind = [...events].reverse().find((e) => top && e.mapped.state === top.state && e.mapped.rto === top.rto);
  const current: NormalizedEvent | undefined = top ? { mapped: top, at: new Date().toISOString(), location: sameKind?.location ?? null, description: sameKind?.description || String(topLabel ?? ''), eventId: `status:${normalize(topLabel) || topId}` } : undefined;
  const unmapped = !top && normalize(topLabel) && !isIgnored(topLabel) ? normalize(topLabel).replace(/ /g, '_') : undefined;
  return { awb, raw: item, events, current, unmappedStatus: unmapped };
}

/** The answer of GET /courier/track/awb/{awb} reshaped like a webhook payload. */
export function fromTracking(awb: string, body: unknown): Item | null {
  const t = body && typeof body === 'object' ? (body as { tracking_data?: Record<string, unknown> }).tracking_data : undefined;
  if (!t || typeof t !== 'object') return null;
  const track = Array.isArray(t.shipment_track) ? (t.shipment_track[0] as Record<string, unknown> | undefined) : undefined;
  return { awb, current_status: track?.current_status as string | undefined, current_status_id: t.shipment_status as number | undefined, scans: Array.isArray(t.shipment_track_activities) ? (t.shipment_track_activities as Scan[]) : [] };
}

let pollCursor = 0; // the poll asks for a slice of the live AWBs each time and moves on, so a big fleet is covered over a few rounds
const POLL_BATCH = 60;

export const shiprocket: AggregatorPlugin = {
  id: 'shiprocket',
  label: 'Shiprocket',
  credentialFields: [
    { key: 'email', label: 'API user e-mail', secret: false, required: true, hint: 'Shiprocket > Settings > API > Create an API User. Use that API user, not your normal login (its e-mail must differ from the account e-mail).' },
    { key: 'password', label: 'API user password', secret: true, required: true, hint: 'The password you set for the API user' },
    { key: 'webhookToken', label: 'Webhook token', secret: true, required: true, hint: 'Any long random text. Save the same value as the token (sent as the x-api-key header) when you add the webhook URL in Shiprocket > Settings > API > Webhooks' },
    { key: 'baseUrl', label: 'API base URL', secret: false, required: false, hint: 'Leave empty for https://apiv2.shiprocket.in' },
  ],
  capabilities: { listServices: true, serviceability: true, track: true, ndrAction: false, cancel: true, balance: true },
  envCredentials: () => ({ email: config.SHIPROCKET_EMAIL ?? '', password: config.SHIPROCKET_PASSWORD ?? '', webhookToken: config.SHIPROCKET_WEBHOOK_TOKEN ?? '', baseUrl: config.SHIPROCKET_BASE_URL }),
  create(credentials) {
    // Never fall back to a fake here: a "live" aggregator that silently invents an AWB would book nothing at the courier.
    if (!credentials.email || !credentials.password) throw Object.assign(new Error('Shiprocket is not configured on this server.'), { statusCode: 503, expose: true });
    return new ShiprocketAdapter(credentials.email, credentials.password, credentials.baseUrl || 'https://apiv2.shiprocket.in');
  },
  // Shiprocket has no list of recent orders with tracking: each live AWB is asked for individually (a rotating slice of POLL_BATCH per round).
  async poll(credentials, wanted) {
    if (!wanted?.size) return [];
    const adapter = new ShiprocketAdapter(credentials.email, credentials.password, credentials.baseUrl || 'https://apiv2.shiprocket.in');
    const all = [...wanted]; const start = pollCursor % all.length; pollCursor += POLL_BATCH;
    const slice = [...all.slice(start), ...all.slice(0, start)].slice(0, POLL_BATCH);
    const out: NormalizedUpdate[] = [];
    for (let i = 0; i < slice.length; i += 4) {
      const part = await Promise.all(slice.slice(i, i + 4).map(async (awb) => {
        try { const item = fromTracking(awb, await adapter.trackAwb(awb)); return item ? toUpdate(item) : null; } catch { return null; } // one AWB failing must not stop the others
      }));
      for (const u of part) if (u) out.push(u);
    }
    return out;
  },
  webhook: {
    // Shiprocket's dashboard does not accept the words "shiprocket", "kartrocket", "sr" or "kr" in a webhook URL, so it has its own neutral path.
    path: '/v1/webhooks/carrier-events',
    configured: (credentials) => !!credentials.webhookToken,
    // The token saved in Shiprocket arrives in the x-api-key header (an "Authorization: Bearer <token>" header is accepted as well).
    verify: (headers, credentials) => {
      if (!credentials.webhookToken) return false;
      const key = headers['x-api-key']; const auth = headers['authorization'];
      const given = typeof key === 'string' && key ? key : typeof auth === 'string' ? auth.replace(/^Bearer\s+/i, '') : '';
      return !!given && safeEqual(given, credentials.webhookToken);
    },
    parse: (body) => items(body).map(toUpdate).filter((u): u is NormalizedUpdate => !!u),
  },
};
