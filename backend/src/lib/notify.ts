import type { Pool, PoolClient } from 'pg';
import { db } from '../db/client.js';
import { IST, pickupMissedSql } from './metrics.js';
import { sellerSafeMessage } from './sellerSafeError.js';

export type NotifyKind = 'delivered' | 'rto' | 'ndr' | 'pickup_missed' | 'wallet' | 'cod' | 'weight' | 'kyc' | 'ticket' | 'batch' | 'system';
export type Note = { kind: NotifyKind; title: string; body?: string; screen?: string; entityId?: string; dedupeKey?: string };

/**
 * Stores one notification for a seller. Never throws: a notification must never break the action it reports.
 * Call it AFTER the transaction that caused the event has committed (a failed insert inside a transaction would abort it).
 * The same dedupeKey stores the event once.
 */
export async function notify(sellerId: string | undefined | null, note: Note, client: Pool | PoolClient = db): Promise<void> {
  if (!sellerId) return;
  try {
    await client.query(
      `INSERT INTO seller_notifications (seller_id, kind, title, body, screen, entity_id, dedupe_key) VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (seller_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING`,
      [sellerId, note.kind, note.title.slice(0, 160), note.body ? sellerSafeMessage(note.body).slice(0, 400) : null, note.screen ?? null, note.entityId ?? null, note.dedupeKey ?? null]);
  } catch (error) { console.error('Notification could not be stored', { kind: note.kind, reason: error instanceof Error ? error.message : String(error) }); }
}

/** The wallet cannot cover a booking (empty wallet or debit limit reached): said once an hour, not once per failed order. */
export function notifyFunds(sellerId: string, message: string) {
  const limit = /^debit limit reached/i.test(message);
  const hour = new Date().toISOString().slice(0, 13);
  return notify(sellerId, { kind: 'wallet', title: limit ? 'Debit limit reached' : 'Wallet balance too low', body: limit ? 'You cannot push more orders until you recharge your wallet.' : 'Recharge your wallet to book more shipments.', screen: 'billing', dedupeKey: `funds:${sellerId}:${hour}` });
}

/**
 * Parcels past their 24-hour pickup deadline: one notification per seller per India day, kept up to date while the day goes on.
 * Run by the worker every few minutes (the same pickupMissedSql as every pickup figure).
 */
export async function scanPickupMissed(): Promise<number> {
  try {
    const r = await db.query(
      `INSERT INTO seller_notifications (seller_id, kind, title, body, screen, dedupe_key)
       SELECT m.seller_id, 'pickup_missed', m.n || ' pickup' || CASE WHEN m.n = 1 THEN '' ELSE 's' END || ' missed',
              'The courier has not collected ' || CASE WHEN m.n = 1 THEN 'a parcel' ELSE m.n || ' parcels' END || ' within 24 hours of booking. Mark them for re-pickup from your dashboard.',
              'shipments', 'pickup_missed:' || m.seller_id || ':' || to_char(now() ${IST}, 'YYYY-MM-DD')
       FROM (SELECT seller_id, count(*)::int AS n FROM shipments WHERE ${pickupMissedSql()} GROUP BY seller_id) m
       ON CONFLICT (seller_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO UPDATE SET title = EXCLUDED.title, body = EXCLUDED.body
         WHERE seller_notifications.read_at IS NULL`);
    return r.rowCount ?? 0;
  } catch (error) { console.error('Pickup-missed check failed', error instanceof Error ? error.message : String(error)); return 0; }
}
