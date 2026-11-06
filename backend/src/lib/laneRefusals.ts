import { db } from '../db/client.js';

/** Set on the error the Lorrigo adapter throws when its rates call does not list the chosen courier for this lane. */
export type LaneRefusal = { serviceId: string; pickup: string; destination: string };
export const REFUSAL_TTL_HOURS = 24;

export function laneRefusalOf(error: unknown): LaneRefusal | null {
  const lane = (error as { lane?: LaneRefusal } | null)?.lane;
  return lane && lane.serviceId && lane.pickup && lane.destination ? lane : null;
}

/** Best effort and outside the booking transaction (which rolls back on the refusal): a failure here must never change what the seller sees. */
export async function rememberLaneRefusals(items: { lane: LaneRefusal; reason: string }[]): Promise<void> {
  for (const { lane, reason } of items) {
    await db.query(
      `INSERT INTO courier_lane_refusals (service_id, pickup_pincode, destination_pincode, reason) VALUES ($1, $2, $3, $4)
       ON CONFLICT (service_id, pickup_pincode, destination_pincode) DO UPDATE SET reason = EXCLUDED.reason, refused_at = now()`,
      [lane.serviceId, lane.pickup, lane.destination, reason.slice(0, 300)]).catch(() => {});
  }
}
