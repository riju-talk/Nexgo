import { config } from '../config.js';
import { db } from '../db/client.js';
import { sendMail } from './mailer.js';
import { allPlugins, isConfigured } from '../couriers/credentials.js';
import { aggregatorAdapter } from '../couriers/registry.js';

/**
 * The platform's prepaid wallet with each courier aggregator pays for EVERY booking of EVERY seller. When it runs out the aggregator refuses all bookings
 * ("Courier booking is paused"), so it is read here, cached for a minute, and shown to admins with a warning long before it reaches zero.
 */
export type AggregatorBalance = { id: string; label: string; balance: number | null; status: 'ok' | 'low' | 'empty' | 'unknown'; message: string | null; checkedAt: string };

let cache: { at: number; items: AggregatorBalance[] } | null = null;
const TTL_MS = 60_000;

export function balanceStatus(balance: number | null, low = config.AGGREGATOR_LOW_BALANCE): AggregatorBalance['status'] {
  if (balance === null || !Number.isFinite(balance)) return 'unknown';
  if (balance <= 0) return 'empty';
  return balance < low ? 'low' : 'ok';
}

export async function aggregatorBalances(force = false): Promise<AggregatorBalance[]> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.items;
  const items: AggregatorBalance[] = [];
  for (const p of allPlugins()) {
    if (!p.capabilities.balance || !isConfigured(p.id)) continue;
    const checkedAt = new Date().toISOString();
    try {
      const adapter = aggregatorAdapter(p.id);
      const balance = adapter.balance ? await Promise.race([adapter.balance(), new Promise<never>((_, no) => setTimeout(() => no(new Error('The balance check timed out.')), 6000))]) : null;
      items.push({ id: p.id, label: p.label, balance, status: balanceStatus(balance), message: null, checkedAt });
    } catch (e) {
      items.push({ id: p.id, label: p.label, balance: null, status: 'unknown', message: (((e as { detail?: string }).detail ?? (e as Error).message) || 'The balance check failed.').slice(0, 200), checkedAt });
    }
  }
  cache = { at: Date.now(), items };
  return items;
}

const alertedAt = new Map<string, number>(); // `${aggregator}:${status}` -> when the admins were last e-mailed (memory only: a restart may repeat one e-mail)
const ALERT_EVERY_MS = { empty: 3 * 3_600_000, low: 24 * 3_600_000 } as const;

/** E-mails the platform admins (at most every few hours per wallet) so the top-up happens before a seller finds out. Best effort, never throws. */
export async function alertAdmins(b: AggregatorBalance): Promise<boolean> {
  if (b.status !== 'empty' && b.status !== 'low') return false;
  const key = `${b.id}:${b.status}`;
  if (Date.now() - (alertedAt.get(key) ?? 0) < ALERT_EVERY_MS[b.status]) return false;
  try {
    const rows = await db.query<{ email: string }>(`SELECT DISTINCT COALESCE(NULLIF(pa.otp_email::text, ''), u.email::text) AS email FROM platform_admins pa JOIN users u ON u.id = pa.user_id WHERE pa.role IN ('super_admin', 'operations_admin')`);
    if (!rows.rows.length) return false;
    alertedAt.set(key, Date.now());
    const empty = b.status === 'empty';
    const subject = empty ? `ACTION NEEDED: ${b.label} wallet is empty, bookings are paused` : `${b.label} wallet is running low`;
    const text = `The NEXGO wallet with ${b.label} has a balance of ₹${b.balance}.

` + (empty
      ? `Because it is empty, ${b.label} refuses every booking for every seller. Sellers' orders are being kept safely and will book automatically after the top-up (within a few minutes), but nothing can be booked until then.

`
      : `Below ₹${config.AGGREGATOR_LOW_BALANCE} it can run out during a busy upload, which pauses bookings for every seller.

`)
      + `Please top it up in ${b.label}'s own dashboard (Recharge). Test bookings also spend this wallet.`;
    let sent = false;
    for (const r of rows.rows) sent = (await sendMail(r.email, subject, text)) || sent;
    return sent;
  } catch (e) { console.error('Wallet alert could not be sent', e instanceof Error ? e.message : String(e)); return false; }
}

/** For the worker: say it loudly in the logs while a wallet is low or empty, and e-mail the admins. */
export async function logLowBalances(log: (m: string) => void): Promise<void> {
  for (const b of await aggregatorBalances(true).catch(() => [])) {
    if (b.status === 'empty') log(`${b.label} wallet is EMPTY (balance ${b.balance}): bookings are refused for every seller until it is topped up.`);
    else if (b.status === 'low') log(`${b.label} wallet is low (balance ${b.balance}, warning below ${config.AGGREGATOR_LOW_BALANCE}): top it up soon.`);
    await alertAdmins(b);
  }
}
