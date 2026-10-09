import { createHmac, timingSafeEqual } from 'node:crypto';

const canonicalStates = new Set(['booked', 'in_transit', 'out_for_delivery', 'delivered', 'ndr', 'rto', 'cancelled']);
export type CanonicalShipmentState = 'booked' | 'in_transit' | 'out_for_delivery' | 'delivered' | 'ndr' | 'rto' | 'cancelled';

export function mapCourierStatus(value: string): CanonicalShipmentState | null {
  const normalized = value.trim().toLowerCase().replace(/[ -]+/g, '_');
  const map: Record<string, CanonicalShipmentState> = {
    booked: 'booked', manifest: 'booked', picked_up: 'in_transit', in_transit: 'in_transit', transit: 'in_transit',
    out_for_delivery: 'out_for_delivery', delivered: 'delivered', ndr: 'ndr', rto: 'rto', rto_initiated: 'rto', cancelled: 'cancelled',
  };
  if (rtoSubStatus(normalized)) return 'rto';
  return canonicalStates.has(normalized) ? normalized as CanonicalShipmentState : map[normalized] ?? null;
}

// Courier statuses that describe where a returning parcel is (stored in shipments.rto_status for the RTO dashboard).
const RTO_SUB: Record<string, 'in_transit' | 'out_for_delivery' | 'delivered' | 'lost' | 'damaged' | 'undelivered'> = {
  rto_in_transit: 'in_transit', rto_out_for_delivery: 'out_for_delivery', rto_ofd: 'out_for_delivery', rto_delivered: 'delivered', rto_lost: 'lost', rto_damaged: 'damaged', rto_undelivered: 'undelivered',
};
export function rtoSubStatus(value: string) { return RTO_SUB[value.trim().toLowerCase().replace(/[ -]+/g, '_')] ?? null; }

export function isProgressionAllowed(from: CanonicalShipmentState, to: CanonicalShipmentState) {
  const allowed: Record<CanonicalShipmentState, CanonicalShipmentState[]> = {
    booked: ['in_transit', 'cancelled'], in_transit: ['out_for_delivery', 'ndr', 'rto', 'delivered'],
    out_for_delivery: ['delivered', 'ndr', 'rto'], ndr: ['in_transit', 'out_for_delivery', 'rto'],
    rto: ['in_transit', 'delivered'], delivered: [], cancelled: [],
  };
  return from === to || allowed[from].includes(to);
}

export function validWebhookSignature(rawBody: string, signature: string | undefined, secret: string) {
  if (!signature) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const received = Buffer.from(signature.replace(/^sha256=/, ''), 'hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  return received.length === expectedBuffer.length && timingSafeEqual(received, expectedBuffer);
}
