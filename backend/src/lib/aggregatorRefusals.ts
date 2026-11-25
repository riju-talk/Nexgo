import { db } from '../db/client.js';

/**
 * Is an aggregator refusing bookings right now? Decided by what the aggregator DID, never by the sign of its balance: Lorrigo runs on a credit limit
 * (the wallet showed -19,105 rupees and bookings still went through), so "balance <= 0" must not stop anything. A refusal for balance is recorded when it
 * happens (courier_aggregators.last_refused_at, shared by the API and the worker), and cleared by the next successful booking (last_ok_at).
 * A refusal older than TTL_MS counts as gone: the next attempt simply finds out again.
 * This module imports nothing but the database, so the adapters can use it without an import cycle.
 */
const TTL_MS = 10 * 60_000; // a refusal is trusted this long; one trial booking per minute (assign queue) finds out sooner if it has cleared
const READ_MS = 10_000;     // the shared state is read at most this often per process
type Row = { refused: number | null; ok: number | null };

let cache: { at: number; rows: Map<string, Row> } | null = null;
let flight: Promise<Map<string, Row>> | null = null;
const lastOkWrite = new Map<string, number>();

async function read(force = false): Promise<Map<string, Row>> {
  if (!force && cache && Date.now() - cache.at < READ_MS) return cache.rows;
  if (flight) return flight;
  flight = (async () => {
    try {
      const res = await db.query<{ code: string; r: Date | null; o: Date | null }>('SELECT code, last_refused_at AS r, last_ok_at AS o FROM courier_aggregators');
      const rows = new Map(res.rows.map((x) => [x.code, { refused: x.r ? new Date(x.r).getTime() : null, ok: x.o ? new Date(x.o).getTime() : null }] as [string, Row]));
      cache = { at: Date.now(), rows };
      return rows;
    } catch { return cache?.rows ?? new Map<string, Row>(); } // cannot tell: nothing is blocked
  })().finally(() => { flight = null; });
  return flight;
}

const refusing = (r?: Row) => !!r && r.refused !== null && Date.now() - r.refused < TTL_MS && (r.ok === null || r.ok < r.refused);

/** The aggregators that refused a booking for balance recently and have not booked anything since. */
export async function refusingAggregators(): Promise<Set<string>> {
  const rows = await read();
  return new Set([...rows].filter(([, r]) => refusing(r)).map(([id]) => id));
}

/** The aggregator just refused a booking for balance. Visible to every process at once (the local copy is updated first). */
export async function markRefused(id: string): Promise<void> {
  const rows = await read();
  const r = rows.get(id) ?? { refused: null, ok: null }; r.refused = Date.now(); rows.set(id, r);
  try { await db.query('UPDATE courier_aggregators SET last_refused_at = now() WHERE code = $1', [id]); } catch { /* the local copy still protects this process */ }
}

/** A booking went through: any earlier refusal is over. Cheap on the normal path (it writes only when a refusal is on record, and at most every 5 s). */
export function markWorking(id: string): void {
  const r = cache?.rows.get(id);
  if (!r || !refusing(r)) return;
  if (Date.now() - (lastOkWrite.get(id) ?? 0) < 5000) return;
  lastOkWrite.set(id, Date.now()); r.ok = Date.now();
  void db.query('UPDATE courier_aggregators SET last_ok_at = now() WHERE code = $1', [id]).catch(() => {});
}

/**
 * Is this aggregator error text a refusal because the aggregator's WALLET / credit is used up? Deliberately narrow: a message that merely contains the word
 * "wallet" or "insufficient" (insufficient address, wallet mentioned in a pincode note...) must NOT pause every seller's bookings on that aggregator.
 */
export function isBalanceRefusal(message: string): boolean {
  const t = String(message ?? '');
  return /insufficient\s+(wallet\s+)?(balance|funds|credit)/i.test(t)
    || /(wallet|account)\s+(balance\s+)?(is\s+)?(low|insufficient|exhausted|empty)/i.test(t)
    || /low\s+(wallet\s+)?balance/i.test(t)
    || /(please\s+)?recharge\s+(your\s+)?(wallet|account)/i.test(t)
    || /not\s+enough\s+(wallet\s+)?(balance|funds|credit)/i.test(t);
}

/** Tests: forget everything held in memory. */
export function resetRefusalCache(): void { cache = null; flight = null; lastOkWrite.clear(); }
