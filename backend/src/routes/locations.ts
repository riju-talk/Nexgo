import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db/client.js';

const NE_JK = new Set(['assam', 'arunachal pradesh', 'manipur', 'meghalaya', 'mizoram', 'nagaland', 'tripura', 'sikkim', 'jammu and kashmir']);
type Found = { pincode: string; city: string; state: string; district: string | null; zone: string; latitude: null; longitude: null; cod_available: boolean; is_oda: boolean };
const inFlight = new Map<string, Promise<Found | null>>();

// Our directory only holds a few hundred pincodes. For any other pincode, ask India Post's public directory once and remember the answer
// in `pincodes`, so every later lookup (forms, bulk upload, rating zones) is local. The district is used as the city: it is what couriers expect
// and it is stable across the many post offices that share a pincode. Failure (timeout, unknown pincode) just means "not found".
async function lookupIndiaPost(pincode: string): Promise<Found | null> {
  try {
    const res = await fetch(`https://api.postalpincode.in/pincode/${pincode}`, { signal: AbortSignal.timeout(4500) });
    if (!res.ok) return null;
    const body = (await res.json()) as { Status?: string; PostOffice?: { District?: string; State?: string; DeliveryStatus?: string }[] }[];
    const offices = body?.[0]?.Status === 'Success' ? body[0].PostOffice ?? [] : [];
    const office = offices.find((o) => o.DeliveryStatus === 'Delivery' && o.District && o.State) ?? offices.find((o) => o.District && o.State);
    if (!office?.District || !office.State) return null;
    const city = office.District.trim().slice(0, 80); const state = office.State.trim().slice(0, 80);
    const zone = NE_JK.has(state.toLowerCase()) ? 'remote' : 'tier2';
    await db.query('INSERT INTO pincodes (pincode, city, state, district, zone) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (pincode) DO NOTHING', [pincode, city, state, city, zone]);
    return { pincode, city, state, district: city, zone, latitude: null, longitude: null, cod_available: true, is_oda: false };
  } catch { return null; }
}

// Pincode directory lookup (table `pincodes`). Used by every address form to fill city and state.
// Unknown pincodes return 404 so the client leaves the fields editable instead of guessing.
export async function locationRoutes(app: FastifyInstance) {
  app.get('/v1/locations/pincode/:pincode', { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } }, async (request, reply) => {
    const pincode = z.string().regex(/^\d{6}$/).parse((request.params as { pincode: string }).pincode);
    let row = (await db.query('SELECT pincode, city, state, district, zone, latitude, longitude, cod_available, is_oda, is_active FROM pincodes WHERE pincode=$1', [pincode])).rows[0] as Found & { is_active?: boolean } | undefined;
    if (row && row.is_active === false) row = undefined; // deliberately switched off: never re-added from outside
    else if (!row) {
      if (!inFlight.has(pincode)) inFlight.set(pincode, lookupIndiaPost(pincode).finally(() => inFlight.delete(pincode)));
      row = (await inFlight.get(pincode)) ?? undefined;
    }
    if (!row) return reply.code(404).send({ error: 'PINCODE_NOT_FOUND' });
    return { pincode: row.pincode, city: row.city, state: row.state, district: row.district, zone: row.zone, latitude: row.latitude === null ? null : Number(row.latitude), longitude: row.longitude === null ? null : Number(row.longitude), codAvailable: row.cod_available, outOfDeliveryArea: row.is_oda };
  });

  // Many pincodes at once (bulk upload): one round trip per chunk instead of one request per order. Known pincodes come from one query; at most
  // 20 per call, so the few unknown ones can be looked up at India Post (5 at a time) inside the serverless time limit.
  app.post('/v1/locations/resolve', { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } }, async (request) => {
    const { pincodes } = z.object({ pincodes: z.array(z.string().regex(/^\d{6}$/)).min(1).max(20) }).parse(request.body);
    const unique = [...new Set(pincodes)];
    const known = (await db.query<{ pincode: string; city: string; state: string }>('SELECT pincode, city, state FROM pincodes WHERE pincode = ANY($1::text[]) AND is_active', [unique])).rows;
    const items: Record<string, { city: string; state: string } | null> = Object.fromEntries(unique.map((x) => [x, null]));
    for (const r of known) items[r.pincode] = { city: r.city, state: r.state };
    const missing = unique.filter((x) => !items[x]);
    for (let i = 0; i < missing.length; i += 10) {
      await Promise.all(missing.slice(i, i + 10).map(async (pin) => {
        if (!inFlight.has(pin)) inFlight.set(pin, lookupIndiaPost(pin).finally(() => inFlight.delete(pin)));
        const found = await inFlight.get(pin);
        if (found) items[pin] = { city: found.city, state: found.state };
      }));
    }
    return { items };
  });

  // Typing aid: pincodes that start with the digits entered so far.
  app.get('/v1/locations/pincodes', async (request) => {
    const { q } = z.object({ q: z.string().regex(/^\d{2,6}$/) }).parse(request.query);
    return { items: (await db.query('SELECT pincode, city, state FROM pincodes WHERE pincode LIKE $1 AND is_active ORDER BY pincode LIMIT 8', [`${q}%`])).rows };
  });
}
