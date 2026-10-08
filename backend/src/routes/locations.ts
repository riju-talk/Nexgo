import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db/client.js';

// Pincode directory lookup (table `pincodes`). Used by every address form to fill city and state.
// Unknown pincodes return 404 so the client leaves the fields editable instead of guessing.
export async function locationRoutes(app: FastifyInstance) {
  app.get('/v1/locations/pincode/:pincode', async (request, reply) => {
    const pincode = z.string().regex(/^\d{6}$/).parse((request.params as { pincode: string }).pincode);
    const row = (await db.query('SELECT pincode, city, state, district, zone, latitude, longitude, cod_available, is_oda FROM pincodes WHERE pincode=$1 AND is_active', [pincode])).rows[0];
    if (!row) return reply.code(404).send({ error: 'PINCODE_NOT_FOUND' });
    return { pincode: row.pincode, city: row.city, state: row.state, district: row.district, zone: row.zone, latitude: row.latitude === null ? null : Number(row.latitude), longitude: row.longitude === null ? null : Number(row.longitude), codAvailable: row.cod_available, outOfDeliveryArea: row.is_oda };
  });

  // Typing aid: pincodes that start with the digits entered so far.
  app.get('/v1/locations/pincodes', async (request) => {
    const { q } = z.object({ q: z.string().regex(/^\d{2,6}$/) }).parse(request.query);
    return { items: (await db.query('SELECT pincode, city, state FROM pincodes WHERE pincode LIKE $1 AND is_active ORDER BY pincode LIMIT 8', [`${q}%`])).rows };
  });
}
