import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db/client.js';
import { sellerSafeMessage } from '../lib/sellerSafeError.js';

// Public parcel tracking for the person receiving the parcel: AWB in, journey out.
// It never returns the seller, the customer, the address, the amount or any internal id.
const awbParam = z.string().trim().min(6).max(40).regex(/^[A-Za-z0-9-]+$/);

const LABEL: Record<string, string> = {
  booked: 'Booked', pickup_pending: 'Waiting for pickup', pickup_scheduled: 'Pickup scheduled', picked_up: 'Picked up',
  in_transit: 'In transit', out_for_delivery: 'Out for delivery', delivered: 'Delivered', ndr: 'Delivery attempt failed',
  rto: 'Returning to sender', rto_in_transit: 'Returning to sender', lost: 'Delayed', cancelled: 'Cancelled', ready: 'Booked',
};

export default async function publicTrackRoutes(app: FastifyInstance) {
  app.get('/v1/public/track/:awb', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request, reply) => {
    const parsed = awbParam.safeParse((request.params as { awb: string }).awb);
    if (!parsed.success) return reply.code(404).send({ error: 'NOT_FOUND', message: 'We could not find a parcel with that tracking number.' });
    const s = await db.query(
      `SELECT s.id, s.awb, s.state, s.booked_at, s.delivered_at, s.promised_delivery_at, cp.name AS courier
         FROM shipments s JOIN courier_providers cp ON cp.id = s.provider_id
        WHERE upper(s.awb) = upper($1) AND s.state <> 'cancelled' LIMIT 1`, [parsed.data]);
    const row = s.rows[0];
    if (!row) return reply.code(404).send({ error: 'NOT_FOUND', message: 'We could not find a parcel with that tracking number.' });
    const ev = await db.query(
      `SELECT state, occurred_at, location, description FROM shipment_events WHERE shipment_id = $1 ORDER BY occurred_at DESC LIMIT 60`, [row.id]);
    reply.header('Cache-Control', 'no-store');
    return {
      awb: row.awb, courier: row.courier, status: LABEL[row.state] ?? 'In progress', stateCode: row.state,
      bookedAt: row.booked_at, deliveredAt: row.delivered_at, expectedBy: row.promised_delivery_at ?? null,
      events: ev.rows.map((e) => ({ at: e.occurred_at, status: LABEL[e.state] ?? 'Update', location: e.location, note: sellerSafeMessage(e.description) })),
    };
  });
}
