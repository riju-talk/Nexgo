import { config } from '../config.js';
import { LorrigoAdapter } from './lorrigo.js';
import { MockCourierAdapter } from './mock.js';
import type { CourierAdapter } from './types.js';

export const AGGREGATORS = ['lorrigo'] as const;
export type Aggregator = (typeof AGGREGATORS)[number];

export function lorrigoAdapter(): LorrigoAdapter {
  // Never fall back to the mock here: a "live" aggregator that silently fakes an AWB would book nothing at the courier.
  if (!config.LORRIGO_API_KEY) throw Object.assign(new Error('Lorrigo is not configured on this server.'), { statusCode: 503, expose: true });
  return new LorrigoAdapter(config.LORRIGO_API_KEY, config.LORRIGO_BASE_URL);
}

// A courier books through its aggregator; a courier with no aggregator is a sandbox one and uses the deterministic adapter.
export function courierAdapter(aggregator: string | null, providerCode: string): CourierAdapter {
  if (aggregator === 'lorrigo') return lorrigoAdapter();
  return new MockCourierAdapter(providerCode);
}
