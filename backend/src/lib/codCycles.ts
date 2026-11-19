import type { Pool, PoolClient } from 'pg';
import { db, withTransaction } from '../db/client.js';
import { config } from '../config.js';
import { invalidateMetrics } from './metrics.js';
import { notify } from './notify.js';

type Db = Pool | PoolClient;

/*
 * COD REMITTANCE: THE RULES (one place, read by the seller page, dashboard, admin screens and the daily job)
 *
 * 1. A COD parcel becomes money owed to the seller when it is DELIVERED. D = the delivery day (India date).
 * 2. It is payable on D + N, where N = the seller's remittance_days (set by the admin, default 2).
 *      delivered 18 Nov, N = 2  ->  due 20 Nov.
 * 3. Amount owed per parcel = COD collected, minus freight only when COD_DEDUCT_FREIGHT is on. By default freight was already paid
 *    from the wallet when the parcel was booked, so it is NOT taken a second time: the seller gets the full COD amount.
 * 4. Every hour the system gathers each seller's parcels that are due (D + N <= today) and not yet in a cycle into ONE payout cycle
 *    (status "pending") and links each parcel to it (shipments.cod_cycle_id), so a parcel is in exactly one cycle, never two, never none.
 * 5. Admin approves the cycle, then records the bank transfer (reference). Remitting is refused before the due date.
 *    If the seller's wallet is negative the shortfall is recovered from the payout first (wallet -10,000, COD 1,00,000 -> pays 90,000).
 * 6. Seller page figures:
 *      Total remittance due  = everything delivered and not yet paid (cycles not remitted + parcels not yet in a cycle), due or not.
 *      Remitted till date    = money actually paid out (after any wallet recovery).
 *      Next remittance       = what the next payout will be: all that is already due; if nothing is due yet, what falls due first.
 *      Next remittance date  = that due date (D + N of the oldest unpaid parcel).
 *    COD on parcels still in transit is NOT owed yet and is not in any of these.
 */

export const deliveredDaySql = (a = 's.') => `((COALESCE(${a}delivered_at, ${a}booked_at)) AT TIME ZONE 'Asia/Kolkata')::date`;
/** COD owed for one parcel (cod_amount, minus freight only when that rule is on). */
export const codNetSql = (shipment = 's.', order = 'o.') => `GREATEST(${order}cod_amount_paise - ${config.COD_DEDUCT_FREIGHT ? `${shipment}shipping_charge_paise` : '0'}, 0)`;
export const codFreightSql = (shipment = 's.') => (config.COD_DEDUCT_FREIGHT ? `${shipment}shipping_charge_paise` : '0');

export type DueItem = { dueDate: string; netPaise: number; kind: 'cycle' | 'parcel' };

/** Everything delivered and not yet paid, each with its due date. */
export async function unpaidItems(client: Db, sellerId?: string): Promise<DueItem[]> {
  const args = sellerId ? [sellerId] : [];
  const scopeS = sellerId ? 'AND s.seller_id = $1' : '';
  const scopeC = sellerId ? 'AND c.seller_id = $1' : '';
  const [cycles, parcels] = await Promise.all([
    client.query<{ due: string; net: string }>(`SELECT COALESCE(c.due_date, c.cycle_end + sl.remittance_days)::text AS due, c.net_remitted_paise::text AS net
       FROM cod_remittance_cycles c JOIN sellers sl ON sl.id = c.seller_id WHERE c.status IN ('pending','approved') ${scopeC}`, args),
    client.query<{ due: string; net: string }>(`SELECT (${deliveredDaySql()} + sl.remittance_days)::text AS due, sum(${codNetSql()})::text AS net
       FROM shipments s JOIN orders o ON o.id = s.order_id JOIN sellers sl ON sl.id = s.seller_id
       WHERE s.state = 'delivered' AND o.payment_mode = 'cod' AND s.cod_cycle_id IS NULL ${scopeS} GROUP BY 1`, args),
  ]);
  return [
    ...cycles.rows.map((r) => ({ dueDate: r.due, netPaise: Number(r.net), kind: 'cycle' as const })),
    ...parcels.rows.map((r) => ({ dueDate: r.due, netPaise: Number(r.net), kind: 'parcel' as const })),
  ].filter((i) => i.netPaise > 0);
}

export const istToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

/** The figures on the seller's COD page (and the dashboard's COD pending). */
export function summarizeDue(items: DueItem[], today = istToday()) {
  const totalPaise = items.reduce((a, i) => a + i.netPaise, 0);
  const due = items.filter((i) => i.dueDate <= today);
  const dueNowPaise = due.reduce((a, i) => a + i.netPaise, 0);
  if (dueNowPaise > 0) return { totalPaise, dueNowPaise, nextPaise: dueNowPaise, nextDate: due.map((i) => i.dueDate).sort()[0] as string | null, nextIsOverdue: true };
  const first = items.map((i) => i.dueDate).sort()[0] ?? null;
  return { totalPaise, dueNowPaise: 0, nextPaise: first ? items.filter((i) => i.dueDate === first).reduce((a, i) => a + i.netPaise, 0) : 0, nextDate: first, nextIsOverdue: false };
}

/**
 * Gathers every seller's due, unlinked COD parcels into one pending cycle each and links them. Safe to run any number of times (a parcel
 * is linked once; a second run finds nothing). Returns how many cycles were created.
 */
export async function generateDueCycles(onlySellerId?: string): Promise<number> {
  const sellers = await db.query<{ seller_id: string }>(
    `SELECT DISTINCT s.seller_id FROM shipments s JOIN orders o ON o.id = s.order_id JOIN sellers sl ON sl.id = s.seller_id
     WHERE s.state = 'delivered' AND o.payment_mode = 'cod' AND s.cod_cycle_id IS NULL AND ${deliveredDaySql()} + sl.remittance_days <= (now() AT TIME ZONE 'Asia/Kolkata')::date
       AND ($1::uuid IS NULL OR s.seller_id = $1)`, [onlySellerId ?? null]);
  let made = 0;
  for (const { seller_id } of sellers.rows) {
    const cycle = await withTransaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))', [`cod:${seller_id}`]);
      const due = await client.query<{ id: string; day: string; cod: string; freight: string }>(
        `SELECT s.id, ${deliveredDaySql()}::text AS day, o.cod_amount_paise::text AS cod, LEAST(${codFreightSql()}, o.cod_amount_paise)::text AS freight
         FROM shipments s JOIN orders o ON o.id = s.order_id JOIN sellers sl ON sl.id = s.seller_id
         WHERE s.seller_id = $1 AND s.state = 'delivered' AND o.payment_mode = 'cod' AND s.cod_cycle_id IS NULL
           AND ${deliveredDaySql()} + sl.remittance_days <= (now() AT TIME ZONE 'Asia/Kolkata')::date FOR UPDATE OF s`, [seller_id]);
      if (!due.rows.length) return null;
      const days = due.rows.map((r) => r.day).sort();
      const cod = due.rows.reduce((a, r) => a + BigInt(r.cod), 0n);
      const freight = due.rows.reduce((a, r) => a + BigInt(r.freight), 0n);
      const n = (await client.query<{ n: number }>('SELECT remittance_days AS n FROM sellers WHERE id = $1', [seller_id])).rows[0].n;
      const inserted = await client.query<{ id: string; net_remitted_paise: string }>(
        `INSERT INTO cod_remittance_cycles (seller_id, cycle_start, cycle_end, shipment_count, cod_collected_paise, charges_deducted_paise, net_remitted_paise, due_date, auto_generated)
         VALUES ($1,$2::date,$3::date,$4,$5,$6,$7,($3::date + $8::int),true) RETURNING id, net_remitted_paise`,
        [seller_id, days[0], days[days.length - 1], due.rows.length, cod.toString(), freight.toString(), (cod - freight).toString(), n]);
      await client.query('UPDATE shipments SET cod_cycle_id = $1 WHERE id = ANY($2::uuid[])', [inserted.rows[0].id, due.rows.map((r) => r.id)]);
      await client.query(`INSERT INTO audit_events (seller_id, action, target_type, target_id, request_id, metadata) VALUES ($1,'cod_remittance.auto_generated','cod_remittance_cycle',$2,'system:cod-cycles',$3)`, [seller_id, inserted.rows[0].id, JSON.stringify({ shipments: due.rows.length })]);
      return inserted.rows[0];
    });
    if (cycle) {
      made++; invalidateMetrics(seller_id);
      await notify(seller_id, { kind: 'cod', title: 'COD payout is being prepared', body: `₹${(Number(cycle.net_remitted_paise) / 100).toLocaleString('en-IN')} of delivered COD is ready for payout and will be paid after approval.`, screen: 'cod', entityId: cycle.id, dedupeKey: `cod-cycle:${cycle.id}` });
    }
  }
  return made;
}
