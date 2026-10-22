import { courierAdapter } from '../couriers/registry.js';
import type { NdrCourierAction } from '../couriers/types.js';
import { withSellerTransaction } from '../db/client.js';
import { audit } from './audit.js';

// What the seller chose on the NDR board, translated to what the courier is told. Choices that need no courier action
// (customer_contact: the seller phoned the buyer) map to null and are not sent.
const COURIER_ACTION: Record<string, NdrCourierAction | null> = { reattempt: 'reattempt', delivery_rescheduled: 'reattempt', address_update: 'reattempt', rto: 'return', cancelled: 'cancel', customer_contact: null };

export type CourierSync = { status: 'sent' | 'failed' | 'not_applicable'; message?: string };

// Runs AFTER the NDR decision is saved, so a courier that is down never blocks the seller from recording it. A failure is kept in the
// audit trail and returned, so the board can say "saved, but the courier was not told" instead of pretending it worked.
export async function pushNdrToCourier(input: { sellerId: string; userId: string; shipmentId: string; caseId: string; resolution: string; comment: string; requestId: string }): Promise<CourierSync> {
  const action = COURIER_ACTION[input.resolution] ?? null;
  if (!action) return { status: 'not_applicable' };
  try {
    const row = await withSellerTransaction(input.sellerId, async (c) => (await c.query<{ awb: string | null; code: string }>('SELECT s.awb, cp.code FROM shipments s JOIN courier_providers cp ON cp.id=s.provider_id WHERE s.id=$1 AND s.seller_id=$2', [input.shipmentId, input.sellerId])).rows[0]);
    if (!row?.awb) return { status: 'not_applicable' };
    const adapter = courierAdapter(row.code);
    if (!adapter.ndrAction) return { status: 'not_applicable' }; // e.g. the sandbox courier has no NDR API
    await adapter.ndrAction(row.awb, action, input.comment);
    await withSellerTransaction(input.sellerId, (c) => audit(c, { sellerId: input.sellerId, actorUserId: input.userId, action: 'ndr.courier_notified', targetType: 'ndr_case', targetId: input.caseId, requestId: input.requestId, metadata: { action } }));
    return { status: 'sent' };
  } catch (e) {
    const message = ((e as Error).message || 'The courier did not accept the request.').slice(0, 300);
    await withSellerTransaction(input.sellerId, (c) => audit(c, { sellerId: input.sellerId, actorUserId: input.userId, action: 'ndr.courier_notify_failed', targetType: 'ndr_case', targetId: input.caseId, requestId: input.requestId, metadata: { resolution: input.resolution, message } })).catch(() => undefined);
    return { status: 'failed', message };
  }
}
