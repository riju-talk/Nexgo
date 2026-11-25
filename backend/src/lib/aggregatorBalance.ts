import { config } from '../config.js';
import { db } from '../db/client.js';
import { sendMail } from './mailer.js';
import { allPlugins, isConfigured } from '../couriers/credentials.js';
import { aggregatorAdapter } from '../couriers/registry.js';
import { refusingAggregators } from './aggregatorRefusals.js';

/**
 * The platform's prepaid wallet with each courier aggregator pays for EVERY booking of EVERY seller. Its balance is shown to admins (with a warning when it is
 * low or negative), but it NEVER decides whether bookings are tried: aggregators such as Lorrigo run on a credit limit, so a negative balance still books
 * (the wallet showed -19,105 rupees while bookings went through). What pauses bookings is the aggregator actually REFUSING one (see aggregatorRefusals.ts).
 *   ok       balance at or above the warning level
 *   low      balance below the warning level (this includes a negative balance: a credit limit may still allow bookings)
 *   refusing the aggregator refused a booking for balance recently and has not booked since: bookings are on hold
 *   unknown  the balance could not be read
 */
export type AggregatorBalance = { id: string; label: string; balance: number | null; status: 'ok' | 'low' | 'refusing' | 'unknown'; message: string | null; checkedAt: string };

type RawBalance = Omit<AggregatorBalance, 'status'> & { reading: 'ok' | 'low' | 'unknown' };
let cache: { at: number; items: RawBalance[] } | null = null;
const TTL_MS = 60_000;

/** What the balance alone says. Never "refusing": that comes only from a real refusal. */
export function balanceStatus(balance: number | null, low = config.AGGREGATOR_LOW_BALANCE): 'ok' | 'low' | 'unknown' {
  if (balance === null || !Number.isFinite(balance)) return 'unknown';
  return balance < low ? 'low' : 'ok';
}

async function readBalances(force: boolean): Promise<RawBalance[]> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.items;
  const items: RawBalance[] = [];
  for (const p of allPlugins()) {
    if (!p.capabilities.balance || !isConfigured(p.id)) continue;
    const checkedAt = new Date().toISOString();
    try {
      const adapter = aggregatorAdapter(p.id);
      const balance = adapter.balance ? await Promise.race([adapter.balance(), new Promise<never>((_, no) => setTimeout(() => no(new Error('The balance check timed out.')), 6000))]) : null;
      items.push({ id: p.id, label: p.label, balance, reading: balanceStatus(balance), message: null, checkedAt });
    } catch (e) {
      items.push({ id: p.id, label: p.label, balance: null, reading: 'unknown', message: (((e as { detail?: string }).detail ?? (e as Error).message) || 'The balance check failed.').slice(0, 200), checkedAt });
    }
  }
  cache = { at: Date.now(), items };
  return items;
}

/** Balance and status per aggregator. The status is recomputed on every call, so a refusal (or the end of one) shows at once even while the balance is cached. */
export async function aggregatorBalances(force = false): Promise<AggregatorBalance[]> {
  const [items, refusing] = await Promise.all([readBalances(force), refusingAggregators()]);
  return items.map(({ reading, ...b }) => ({ ...b, status: refusing.has(b.id) ? 'refusing' : reading }));
}

const alertedAt = new Map<string, number>(); // `${aggregator}:${status}` -> when the admins were last e-mailed (memory only: a restart may repeat one e-mail)
const ALERT_EVERY_MS = { refusing: 3 * 3_600_000, low: 24 * 3_600_000 } as const;

/** E-mails the platform admins (at most every few hours per aggregator) so the top-up / limit increase happens before a seller finds out. Best effort, never throws. */
export async function alertAdmins(b: AggregatorBalance): Promise<boolean> {
  if (b.status !== 'refusing' && b.status !== 'low') return false;
  const key = `${b.id}:${b.status}`;
  if (Date.now() - (alertedAt.get(key) ?? 0) < ALERT_EVERY_MS[b.status]) return false;
  try {
    const rows = await db.query<{ email: string }>(`SELECT DISTINCT COALESCE(NULLIF(pa.otp_email::text, ''), u.email::text) AS email FROM platform_admins pa JOIN users u ON u.id = pa.user_id WHERE pa.role IN ('super_admin', 'operations_admin')`);
    if (!rows.rows.length) return false;
    alertedAt.set(key, Date.now());
    const refusing = b.status === 'refusing';
    const shown = b.balance === null ? 'unknown' : `₹${b.balance}`;
    const subject = refusing ? `ACTION NEEDED: ${b.label} is refusing bookings` : `${b.label} balance is low`;
    const text = refusing
      ? `${b.label} refused a booking because its wallet is used up (balance ${shown}).\\n\\nWhile it refuses, every seller's bookings are on hold. Orders are kept safely and book by themselves, within a minute or two, as soon as ${b.label} accepts bookings again (after a top-up or a higher credit limit).\\n\\nPlease top it up or raise the limit in ${b.label}'s own dashboard. Test bookings also spend this wallet.`
      : `The NEXGO wallet with ${b.label} is at ${shown}, below the warning level of ₹${config.AGGREGATOR_LOW_BALANCE}.\\n\\nBookings still go through for now (${b.label} may allow a credit limit), but when it refuses, every seller's bookings pause. Please top it up in ${b.label}'s own dashboard.`;
    let sent = false;
    for (const r of rows.rows) sent = (await sendMail(r.email, subject, text.replace(/\\n/g, '\n'))) || sent;
    return sent;
  } catch (e) { console.error('Wallet alert could not be sent', e instanceof Error ? e.message : String(e)); return false; }
}

let inUseCache: { at: number; ids: Set<string> } | null = null;
async function aggregatorsInUse(): Promise<Set<string>> {
  if (inUseCache && Date.now() - inUseCache.at < TTL_MS) return inUseCache.ids;
  try {
    const rows = await db.query<{ aggregator: string }>(`SELECT DISTINCT cp.aggregator FROM courier_providers cp WHERE cp.aggregator IS NOT NULL AND cp.integration_state = 'live' AND EXISTS (SELECT 1 FROM courier_services cs WHERE cs.provider_id = cp.id AND cs.is_active)`);
    inUseCache = { at: Date.now(), ids: new Set(rows.rows.map((r) => r.aggregator)) };
  } catch { return new Set(allPlugins().map((p) => p.id)); } // cannot tell: count every aggregator
  return inUseCache.ids;
}

/** Aggregators that refused a booking for balance recently and have not booked since (the booking code tries another aggregator's couriers first). */
export async function pausedAggregatorIds(): Promise<Set<string>> {
  return refusingAggregators();
}

/** True only when EVERY aggregator that has a live courier is refusing: then nothing can be booked anywhere. One aggregator that accepts keeps bookings going. */
export async function allBookingPaused(): Promise<boolean> {
  // Only aggregators that actually have a live courier count: credentials saved for one nobody uses must not keep the others' pause from closing.
  // An aggregator that is refusing right now is in use by definition, so it counts even if the (cached) list of live couriers does not know about it yet:
  // a courier added within the last minute used to be ignored, and the seller was not told that booking was paused.
  const [inUse, refusing] = await Promise.all([aggregatorsInUse(), refusingAggregators()]);
  const configured = allPlugins().filter((p) => isConfigured(p.id) && (inUse.has(p.id) || refusing.has(p.id)));
  if (!configured.length) return false;
  return configured.every((p) => refusing.has(p.id));
}

/** For the worker: say it loudly in the logs while an aggregator refuses or its balance is low, and e-mail the admins. */
export async function logLowBalances(log: (m: string) => void): Promise<void> {
  for (const b of await aggregatorBalances(true).catch(() => [])) {
    if (b.status === 'refusing') log(`${b.label} is REFUSING bookings (balance ${b.balance}): every seller's orders are on hold until it accepts again (top up or raise the limit).`);
    else if (b.status === 'low') log(`${b.label} balance is low (${b.balance}, warning below ${config.AGGREGATOR_LOW_BALANCE}): bookings still go through, top it up soon.`);
    await alertAdmins(b);
  }
}
