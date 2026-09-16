import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

// The demo ships with common dispatch/destination pincodes locally so address
// completion works even before a commercial postal-data provider is connected.
// Unknown pincodes stay editable on the client rather than guessing a city.
const PINCODES: Record<string, { city: string; state: string }> = {
  '110001': { city: 'New Delhi', state: 'Delhi' },
  '122001': { city: 'Gurugram', state: 'Haryana' },
  '201301': { city: 'Noida', state: 'Uttar Pradesh' },
  '302001': { city: 'Jaipur', state: 'Rajasthan' },
  '380001': { city: 'Ahmedabad', state: 'Gujarat' },
  '400001': { city: 'Mumbai', state: 'Maharashtra' },
  '411001': { city: 'Pune', state: 'Maharashtra' },
  '500001': { city: 'Hyderabad', state: 'Telangana' },
  '560001': { city: 'Bengaluru', state: 'Karnataka' },
  '600001': { city: 'Chennai', state: 'Tamil Nadu' },
  '700001': { city: 'Kolkata', state: 'West Bengal' },
  '751001': { city: 'Bhubaneswar', state: 'Odisha' },
  '781001': { city: 'Guwahati', state: 'Assam' },
};

export async function locationRoutes(app: FastifyInstance) {
  app.get('/v1/locations/pincode/:pincode', async (request, reply) => {
    const pincode = z.string().regex(/^\d{6}$/).parse((request.params as { pincode: string }).pincode);
    const location = PINCODES[pincode];
    if (!location) return reply.code(404).send({ error: 'PINCODE_NOT_IN_LOCAL_DIRECTORY' });
    return { pincode, ...location };
  });
}
