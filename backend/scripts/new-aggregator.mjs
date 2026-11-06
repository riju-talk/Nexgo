// Usage: npm run new:aggregator -- <id> "<Label>"      e.g.  npm run new:aggregator -- shipway "Shipway"
// Creates src/couriers/aggregators/<id>/index.ts (a working skeleton) and tells you the one line to add to src/couriers/aggregators/index.ts.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const [id, ...rest] = process.argv.slice(2);
const label = rest.join(' ') || id;
if (!id || !/^[a-z0-9-]{2,40}$/.test(id)) { console.error('Give an id of 2-40 lowercase letters, digits or dashes. Example: npm run new:aggregator -- shipway "Shipway"'); process.exit(1); }
const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'couriers', 'aggregators', id);
if (existsSync(root)) { console.error(`${root} already exists.`); process.exit(1); }
mkdirSync(root, { recursive: true });
const ENV = id.toUpperCase().replace(/-/g, '_');

writeFileSync(join(root, 'index.ts'), `import { timingSafeEqual } from 'node:crypto';
import type { CourierAdapter, CourierBookingRequest, CourierBookingResult } from '../../types.js';
import type { AggregatorPlugin, NormalizedUpdate } from '../types.js';

// ${label}: fill in the TODOs from the aggregator's API documentation, then run:  npx vitest run tests/unit/couriers
// The shared contract test (tests/unit/couriers/aggregatorContract.test.ts) already covers this plugin once it is listed in aggregators/index.ts.

class ${label.replace(/[^A-Za-z0-9]/g, '')}Adapter implements CourierAdapter {
  readonly providerCode = '${id}';
  constructor(private readonly apiKey: string, private readonly baseUrl: string) {}

  async book(request: CourierBookingRequest): Promise<CourierBookingResult> {
    void request; void this.apiKey; void this.baseUrl;
    // TODO: create the order / shipment at the aggregator and return { providerShipmentId, awb, labelAvailable }.
    // Rules every adapter keeps: never fake an AWB; if this exact order was already booked (a retry), return the existing shipment instead of booking twice;
    // throw an Error with statusCode 422 for "this courier cannot take this parcel" (and set laneRefusal: true when it is a lane problem), 502 for outages.
    throw Object.assign(new Error('${label} booking is not implemented yet.'), { statusCode: 501, expose: true });
  }
  async cancel(providerShipmentId: string): Promise<void> {
    void providerShipmentId; // TODO: cancel the shipment at the aggregator. Do not treat "not found" as success.
    throw Object.assign(new Error('${label} cancel is not implemented yet.'), { statusCode: 501, expose: true });
  }
  // Optional, delete what the aggregator does not offer (and set the matching capability to false below):
  // async listServices() { /* the courier services this aggregator sells: [{ id, name, type }] */ }
  // async ndrAction(awb: string, action: 'reattempt' | 'return' | 'cancel', comment: string) { /* ... */ }
}

const safeEqual = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };

export const ${id.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase())}: AggregatorPlugin = {
  id: '${id}',
  label: '${label}',
  credentialFields: [
    { key: 'apiKey', label: 'API key', secret: true, required: true },
    { key: 'webhookToken', label: 'Webhook token', secret: true, required: true, hint: 'The same value goes in ${label}\\'s webhook settings' },
    { key: 'baseUrl', label: 'API base URL', secret: false, required: false },
  ],
  capabilities: { listServices: false, serviceability: false, track: false, ndrAction: false, cancel: true },
  envCredentials: () => ({ apiKey: process.env.${ENV}_API_KEY ?? '', webhookToken: process.env.${ENV}_WEBHOOK_TOKEN ?? '', baseUrl: process.env.${ENV}_BASE_URL ?? '' }),
  create(credentials) {
    if (!credentials.apiKey) throw Object.assign(new Error('${label} is not configured on this server.'), { statusCode: 503, expose: true });
    return new ${label.replace(/[^A-Za-z0-9]/g, '')}Adapter(credentials.apiKey, credentials.baseUrl || 'https://api.example.com');
  },
  webhook: {
    configured: (credentials) => !!credentials.webhookToken,
    verify: (headers, credentials) => { const token = headers['x-api-key']; return !!credentials.webhookToken && typeof token === 'string' && safeEqual(token, credentials.webhookToken); },
    // TODO: turn the aggregator's payload into updates. Map its statuses to NEXGO's: in_transit, out_for_delivery, delivered, ndr, rto (+ rto sub-status), lost.
    parse: (_body): NormalizedUpdate[] => [],
  },
};
`);
console.log(`Created ${root}${'/index.ts'}\n\nNow add these two lines to src/couriers/aggregators/index.ts:\n  import { ${id.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase())} } from './${id}/index.js';\n  export const PLUGINS: AggregatorPlugin[] = [lorrigo, ${id.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase())}];\n\nThen: implement the TODOs, add recorded real responses as tests (see tests/unit/couriers/lorrigoPlugin.test.ts), and save the key on Admin > Integrations.`);
