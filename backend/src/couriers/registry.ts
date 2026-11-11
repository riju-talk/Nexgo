import { AGGREGATOR_IDS, pluginById } from './aggregators/index.js';
import { credentialsFor } from './credentials.js';
import type { CourierAdapter } from './types.js';

/** The ids of every aggregator plugin (couriers/aggregators/index.ts). */
export const AGGREGATORS = AGGREGATOR_IDS;
export type Aggregator = string;

/** The adapter for one aggregator, built from its saved credentials (or the environment). Throws a readable 503 when it is not configured. */
export function aggregatorAdapter(aggregator: string): CourierAdapter {
  const plugin = pluginById(aggregator);
  if (!plugin) throw Object.assign(new Error(`Unknown courier aggregator "${aggregator}".`), { statusCode: 503, expose: true });
  return plugin.create(credentialsFor(aggregator));
}

// A courier books through its aggregator. A courier without one cannot be booked (there is no test courier any more).
export function courierAdapter(aggregator: string | null, _providerCode: string): CourierAdapter {
  if (aggregator) return aggregatorAdapter(aggregator);
  throw Object.assign(new Error('This courier is not available for booking right now. Choose another courier.'), { statusCode: 422 });
}
