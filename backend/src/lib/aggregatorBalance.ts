import { config } from '../config.js';
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

/** For the worker: say it loudly in the logs while a wallet is low or empty. */
export async function logLowBalances(log: (m: string) => void): Promise<void> {
  for (const b of await aggregatorBalances(true).catch(() => [])) {
    if (b.status === 'empty') log(`${b.label} wallet is EMPTY (balance ${b.balance}): bookings are refused for every seller until it is topped up.`);
    else if (b.status === 'low') log(`${b.label} wallet is low (balance ${b.balance}, warning below ${config.AGGREGATOR_LOW_BALANCE}): top it up soon.`);
  }
}
