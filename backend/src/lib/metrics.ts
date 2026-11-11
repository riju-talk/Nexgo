import type { Pool, PoolClient } from 'pg';

/**
 * One definition for every figure shown on a dashboard, so the same number reads the same on every screen.
 *
 *  - A "window" is a range of INDIA dates, midnight to midnight, written so the database can use its indexes (no casts on the column).
 *  - Cancelled shipments are never part of a rate.
 *  - Delivery rate and RTO rate are shares of parcels that have FINISHED (delivered + returned + lost).
 *  - "Right now" figures (in transit, pickup pending, open NDR) are live snapshots, not tied to the window.
 */
export const IST = `AT TIME ZONE 'Asia/Kolkata'`;

/** `col` falls on a day inside the window. f / t / d are the parameter numbers holding from, to and the default number of days. */
export function windowSql(col: string, f: number, t: number, d: number): string {
  const start = `(COALESCE($${f}::date, (now() ${IST})::date - ($${d}::int - 1))::timestamp ${IST})`;
  const end = `((COALESCE($${t}::date, (now() ${IST})::date) + 1)::timestamp ${IST})`;
  return `(${col} >= ${start} AND ${col} < ${end})`;
}

/** Like windowSql, for an optional from / to pair given as two date parameters (either may be null = open ended). */
export function optWindowSql(col: string, f: number, t: number): string {
  return `(($${f}::date IS NULL OR ${col} >= ($${f}::date::timestamp ${IST})) AND ($${t}::date IS NULL OR ${col} < (($${t}::date + 1)::timestamp ${IST})))`;
}

/** A percentage, or null when there is nothing to divide by (a screen shows "-" instead of a made-up 0%). */
export const pct = (n: number, d: number): number | null => (d > 0 ? Math.round((n / d) * 1000) / 10 : null);

export const PICKUP_STATES = `('booked','pickup_pending','pickup_scheduled')`;
/** Pickup pending: booked, no pickup scan yet, and not cancelled at the courier. Used by every pickup number in the product. */
export const pickupPendingSql = (a = '') => `${a}state IN ${PICKUP_STATES} AND ${a}courier_cancelled_at IS NULL`;
/** Pickup missed: pickup pending past its deadline (24 hours from booking unless it was rescheduled). */
export const pickupMissedSql = (a = '') => `${pickupPendingSql(a)} AND COALESCE(${a}pickup_deadline_at, ${a}booked_at + interval '24 hours') < now()`;

type Db = Pool | PoolClient;

/**
 * COD still to reach the seller = payout cycles not yet paid (net of freight) + delivered COD not yet in any cycle (also net of freight).
 * The COD page, the dashboard and the admin screens all read this one function.
 */
export async function codPending(client: Db, sellerId?: string) {
  const scope = sellerId ? 'AND seller_id = $1' : '';
  const args = sellerId ? [sellerId] : [];
  const [cycles, uncycled, next] = await Promise.all([
    client.query<{ v: string }>(`SELECT COALESCE(sum(net_remitted_paise),0)::bigint AS v FROM cod_remittance_cycles WHERE status IN ('pending','approved') ${scope}`, args),
    client.query<{ v: string }>(
      `SELECT COALESCE(sum(o.cod_amount_paise - s.shipping_charge_paise),0)::bigint AS v
       FROM shipments s JOIN orders o ON o.id = s.order_id
       WHERE s.state = 'delivered' AND o.payment_mode = 'cod' ${sellerId ? 'AND s.seller_id = $1' : ''}
         AND NOT EXISTS (SELECT 1 FROM cod_remittance_cycles c WHERE c.seller_id = s.seller_id AND COALESCE(s.delivered_at, s.booked_at)::date BETWEEN c.cycle_start AND c.cycle_end)`, args),
    sellerId
      ? client.query<{ net: string; due_date: string | null }>(`SELECT net_remitted_paise::text AS net, due_date::text FROM cod_remittance_cycles WHERE seller_id = $1 AND status IN ('pending','approved') ORDER BY due_date NULLS LAST, cycle_end LIMIT 1`, [sellerId])
      : Promise.resolve({ rows: [] as { net: string; due_date: string | null }[] }),
  ]);
  const cyclesNet = Number(cycles.rows[0].v); const uncycledNet = Math.max(0, Number(uncycled.rows[0].v));
  return { cyclesNetPaise: cyclesNet, uncycledNetPaise: uncycledNet, totalPaise: cyclesNet + uncycledNet, nextExpectedPaise: next.rows[0] ? Number(next.rows[0].net) : 0, nextExpectedDate: next.rows[0]?.due_date ?? null };
}

// ---- a small shared cache: one computation serves every open tab; a change by the owner clears it at once ----
type Entry = { at: number; value?: unknown; pending?: Promise<unknown> };
const cache = new Map<string, Entry>();

/** Returns the cached value for `key` while it is younger than `ttlMs`; concurrent callers share one computation. */
export async function cached<T>(key: string, ttlMs: number, compute: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && hit.pending) return hit.pending as Promise<T>;
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;
  const pending = compute().then((value) => { cache.set(key, { at: Date.now(), value }); return value; }).catch((error) => { cache.delete(key); throw error; });
  cache.set(key, { at: hit?.at ?? 0, value: hit?.value, pending });
  return pending;
}

/** Forget every cached figure of one seller (call after a booking, cancel, tracking update, NDR or COD change) and the platform-wide ones. */
export function invalidateMetrics(sellerId?: string) {
  for (const k of cache.keys()) if (k.startsWith('admin:') || (sellerId && k.startsWith(`seller:${sellerId}:`))) cache.delete(k);
}
export const metricsCacheSize = () => cache.size;
