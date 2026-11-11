import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { withSellerTransaction } from '../db/client.js';
import { audit } from '../lib/audit.js';
import { IST, optWindowSql, pickupPendingSql } from '../lib/metrics.js';
import { requireSeller } from './seller.js';

/**
 * Pickup manifests (one courier + one pickup address + one day):
 *   POST /v1/manifests/generate     makes today's manifests from every parcel still waiting for pickup that is not on one yet
 *   GET  /v1/manifests              the seller's manifests with how many parcels were collected
 *   GET  /v1/manifests/:id/items    the parcels on one manifest (for printing / Excel / CSV)
 */
function principal(request: FastifyRequest) {
  if (!request.principal) throw Object.assign(new Error('Authentication required'), { statusCode: 401 });
  return request.principal;
}
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
// Collected = no longer waiting for pickup (picked up, in transit, delivered, ...). Cancelled parcels are left out of the counts.
const COLLECTED = `s.state NOT IN ('booked','pickup_pending','pickup_scheduled','cancelled')`;

export async function manifestRoutes(app: FastifyInstance) {
  app.post('/v1/manifests/generate', { preHandler: requireSeller }, async (request, reply) => {
    const p = principal(request);
    const out = await withSellerTransaction(p.sellerId, async (client) => {
      // Waiting for pickup, not courier-cancelled, not already on a manifest. Locked so two clicks cannot build two manifests for one parcel.
      const waiting = await client.query<{ id: string; provider_id: string; warehouse_id: string | null }>(
        `SELECT s.id, s.provider_id, o.warehouse_id
           FROM shipments s JOIN orders o ON o.id = s.order_id
          WHERE s.seller_id = $1 AND ${pickupPendingSql('s.')}
            AND NOT EXISTS (SELECT 1 FROM pickup_manifest_items i WHERE i.shipment_id = s.id)
          ORDER BY s.provider_id, o.warehouse_id, s.booked_at
            FOR UPDATE OF s SKIP LOCKED`, [p.sellerId]);
      if (!waiting.rows.length) return { created: 0, parcels: 0 };
      const stamp = (await client.query<{ d: string; n: number }>(
        `SELECT to_char((now() ${IST})::date, 'YYMMDD') AS d, (SELECT count(*)::int FROM pickup_manifests WHERE seller_id = $1 AND created_at >= (((now() ${IST})::date)::timestamp ${IST})) AS n`, [p.sellerId])).rows[0];
      const groups = new Map<string, string[]>();
      for (const r of waiting.rows) { const k = `${r.provider_id}|${r.warehouse_id ?? ''}`; (groups.get(k) ?? groups.set(k, []).get(k)!).push(r.id); }
      let seq = stamp.n; let parcels = 0;
      for (const [key, ids] of groups) {
        const [providerId, warehouseId] = key.split('|');
        seq += 1;
        const manifestNo = `MF${stamp.d}${String(seq).padStart(3, '0')}`;
        const m = await client.query<{ id: string }>(
          `INSERT INTO pickup_manifests (seller_id, manifest_no, provider_id, warehouse_id, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
          [p.sellerId, manifestNo, providerId, warehouseId || null, p.userId]);
        await client.query(`INSERT INTO pickup_manifest_items (manifest_id, shipment_id, seller_id) SELECT $1, x, $2 FROM unnest($3::uuid[]) AS x`, [m.rows[0].id, p.sellerId, ids]);
        parcels += ids.length;
        await audit(client, { sellerId: p.sellerId, actorUserId: p.userId, action: 'manifest.generated', targetType: 'pickup_manifest', targetId: m.rows[0].id, requestId: request.id, metadata: { manifestNo, parcels: ids.length } });
      }
      return { created: groups.size, parcels };
    });
    return reply.code(out.created ? 201 : 200).send({ ...out, message: out.created ? `${out.created} manifest${out.created === 1 ? '' : 's'} created for ${out.parcels} parcel${out.parcels === 1 ? '' : 's'}` : 'Every parcel waiting for pickup is already on a manifest, or none are waiting.' });
  });

  app.get('/v1/manifests', { preHandler: requireSeller }, async (request) => {
    const p = principal(request);
    const q = z.object({ q: z.string().trim().max(60).optional(), from: day.optional(), to: day.optional(), status: z.enum(['pending', 'in_progress', 'completed']).optional(), page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(15) }).parse(request.query);
    const offset = (q.page - 1) * q.pageSize;
    return withSellerTransaction(p.sellerId, async (client) => {
      const base = `FROM pickup_manifests m
        JOIN courier_providers cp ON cp.id = m.provider_id
        LEFT JOIN warehouses w ON w.id = m.warehouse_id
        LEFT JOIN LATERAL (
          SELECT count(*) FILTER (WHERE s.state <> 'cancelled')::int AS parcels, count(*) FILTER (WHERE ${COLLECTED})::int AS collected
            FROM pickup_manifest_items i JOIN shipments s ON s.id = i.shipment_id WHERE i.manifest_id = m.id) c ON true
        WHERE m.seller_id = $1 AND ${optWindowSql('m.created_at', 2, 3)}
          AND ($4::text IS NULL OR m.manifest_no ILIKE '%' || $4 || '%' OR cp.name ILIKE '%' || $4 || '%' OR w.name ILIKE '%' || $4 || '%')
          AND ($5::text IS NULL OR CASE WHEN c.collected = 0 THEN 'pending' WHEN c.collected >= c.parcels THEN 'completed' ELSE 'in_progress' END = $5)`;
      const args = [p.sellerId, q.from ?? null, q.to ?? null, q.q ?? null, q.status ?? null];
      const [rows, total] = await Promise.all([
        client.query(`SELECT m.id, m.manifest_no, m.created_at, cp.name AS courier, w.name AS warehouse, COALESCE(w.address_line_1, '') AS address, w.city, c.parcels, c.collected,
                      CASE WHEN c.collected = 0 THEN 'pending' WHEN c.collected >= c.parcels THEN 'completed' ELSE 'in_progress' END AS status
                      ${base} ORDER BY m.created_at DESC LIMIT $6 OFFSET $7`, [...args, q.pageSize, offset]),
        client.query<{ n: number }>(`SELECT count(*)::int AS n ${base}`, args),
      ]);
      return { items: rows.rows, total: total.rows[0].n, page: q.page, pages: Math.max(1, Math.ceil(total.rows[0].n / q.pageSize)) };
    });
  });

  app.get('/v1/manifests/:id/items', { preHandler: requireSeller }, async (request, reply) => {
    const p = principal(request);
    const id = z.string().uuid().parse((request.params as { id: string }).id);
    return withSellerTransaction(p.sellerId, async (client) => {
      const m = await client.query(
        `SELECT m.id, m.manifest_no, m.created_at, cp.name AS courier, w.name AS warehouse, w.address_line_1, w.city, w.state, w.pincode
           FROM pickup_manifests m JOIN courier_providers cp ON cp.id = m.provider_id LEFT JOIN warehouses w ON w.id = m.warehouse_id
          WHERE m.id = $1 AND m.seller_id = $2`, [id, p.sellerId]);
      if (!m.rows[0]) return reply.code(404).send({ error: 'MANIFEST_NOT_FOUND', message: 'That manifest was not found.' });
      const items = await client.query(
        `SELECT s.awb, o.order_number, s.state, s.chargeable_weight_g, o.payment_mode, o.cod_amount_paise, s.destination_city, s.destination_pincode, (${COLLECTED}) AS collected
           FROM pickup_manifest_items i JOIN shipments s ON s.id = i.shipment_id JOIN orders o ON o.id = s.order_id
          WHERE i.manifest_id = $1 AND s.state <> 'cancelled' ORDER BY s.awb`, [id]);
      return { manifest: m.rows[0], items: items.rows };
    });
  });
}
