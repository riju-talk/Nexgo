import type { PoolClient } from 'pg';

/**
 * Side effects of a shipment reaching a new state. Every path that moves a shipment (Lorrigo webhook, generic courier webhook,
 * NDR actions) calls this inside the same transaction, so the money and the NDR board can never disagree with the shipment.
 */

/**
 * Bills the RTO (return) freight to the wallet, once per shipment.
 * The forward freight and COD fee were debited at booking, so only the return leg is charged here: the quote saved at booking holds
 * `rtoPaise` (forward + return freight); minus `transportPaise` (forward freight) leaves the return leg. Prices are pre-GST, like every
 * wallet debit. An RTO is a cost the courier has already incurred, so it is never refused for a low balance (the wallet may go negative;
 * the seller's next recharge and COD remittance recover it). Older quotes without the figures are skipped rather than guessed.
 * Returns the amount debited in paise (0 when nothing was charged or it was already charged).
 */
export async function chargeRtoOnce(client: PoolClient, sellerId: string, shipmentId: string): Promise<number> {
  const found = await client.query<{ awb: string; price: { rtoPaise?: number; transportPaise?: number } | null }>(
    "SELECT awb, quote_snapshot->'price' AS price FROM shipments WHERE id = $1 AND seller_id = $2", [shipmentId, sellerId]);
  const row = found.rows[0]; if (!row) return 0;
  const amount = Number(row.price?.rtoPaise) - Number(row.price?.transportPaise);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))', [`wallet:${sellerId}`]);
  const inserted = await client.query(
    `INSERT INTO wallet_entries (seller_id, entry_type, amount_paise, reference_type, reference_id, idempotency_key, description)
     VALUES ($1, 'debit', $2, 'shipment_rto', $3, $4, $5) ON CONFLICT (seller_id, idempotency_key) DO NOTHING RETURNING id`,
    [sellerId, amount, shipmentId, `rto-charge:${shipmentId}`, `RTO charge for ${row.awb}`]);
  return inserted.rows[0] ? amount : 0;
}

/**
 * An NDR case is only "open" while the parcel is stuck. Once the courier delivers it the case is resolved; once the parcel is on its way
 * back it moves to the RTO column. Cases a seller already actioned are left alone.
 */
export async function closeNdrForState(client: PoolClient, shipmentId: string, state: string): Promise<void> {
  if (state === 'delivered') await client.query("UPDATE ndr_cases SET state = 'resolved', resolved_at = COALESCE(resolved_at, now()), updated_at = now() WHERE shipment_id = $1 AND state IN ('open', 'reattempt_requested')", [shipmentId]);
  else if (state === 'rto') await client.query("UPDATE ndr_cases SET state = 'rto_requested', updated_at = now() WHERE shipment_id = $1 AND state IN ('open', 'reattempt_requested')", [shipmentId]);
}

/** One call for every state change. */
export async function applyShipmentStateEffects(client: PoolClient, sellerId: string, shipmentId: string, state: string): Promise<void> {
  if (state === 'rto') await chargeRtoOnce(client, sellerId, shipmentId);
  await closeNdrForState(client, shipmentId, state);
}
