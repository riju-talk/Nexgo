import { config } from '../config.js';
import { LorrigoAdapter } from './lorrigo.js';
import { MockCourierAdapter } from './mock.js';
import type { CourierAdapter } from './types.js';

export function courierAdapter(providerCode: string): CourierAdapter {
  if (providerCode === 'lorrigo') {
    // Never fall back to the mock here: a "live" provider that silently fakes an AWB would book nothing at the courier.
    if (!config.LORRIGO_API_KEY) throw Object.assign(new Error('Lorrigo is not configured on this server.'), { statusCode: 503, expose: true });
    return new LorrigoAdapter(config.LORRIGO_API_KEY, config.LORRIGO_BASE_URL);
  }
  // Until a provider is configured with verified credentials, local/sandbox providers use the deterministic adapter.
  return new MockCourierAdapter(providerCode);
}
