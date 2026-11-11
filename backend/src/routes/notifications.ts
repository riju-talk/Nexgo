import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { withSellerTransaction } from '../db/client.js';
import { requireSeller } from './seller.js';

/**
 * The seller's notification inbox.
 *   GET  /v1/notifications/summary          unread count + the latest few (the bell polls this)
 *   GET  /v1/notifications                  the full list: paged, filter by kind, unread only
 *   POST /v1/notifications/read             { ids: [...] } or { all: true }
 */
const uuid = z.string().uuid();
const GROUPS: Record<string, string[]> = { parcels: ['delivered', 'rto', 'ndr', 'pickup_missed', 'batch'], money: ['wallet', 'cod', 'weight'], account: ['kyc', 'ticket', 'system'] };
const KINDS = ['delivered', 'rto', 'ndr', 'pickup_missed', 'wallet', 'cod', 'weight', 'kyc', 'ticket', 'batch', 'system'] as const;

function principal(request: FastifyRequest) {
  if (!request.principal) throw Object.assign(new Error('Authentication required'), { statusCode: 401 });
  return request.principal;
}

export async function notificationRoutes(app: FastifyInstance) {
  app.get('/v1/notifications/summary', { preHandler: requireSeller }, async (request) => {
    const p = principal(request);
    return withSellerTransaction(p.sellerId, async (client) => {
      const [unread, latest] = await Promise.all([
        client.query<{ n: number }>('SELECT count(*)::int AS n FROM seller_notifications WHERE seller_id = $1 AND read_at IS NULL', [p.sellerId]),
        client.query(`SELECT id, kind, title, body, screen, entity_id, created_at, read_at FROM seller_notifications WHERE seller_id = $1 ORDER BY created_at DESC LIMIT 6`, [p.sellerId]),
      ]);
      return { unread: unread.rows[0].n, items: latest.rows };
    });
  });

  app.get('/v1/notifications', { preHandler: requireSeller }, async (request) => {
    const p = principal(request);
    const q = z.object({ kind: z.enum(KINDS).optional(), group: z.enum(['parcels', 'money', 'account']).optional(), unread: z.coerce.boolean().optional(), page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20) }).parse(request.query);
    return withSellerTransaction(p.sellerId, async (client) => {
      const where = ['seller_id = $1']; const params: unknown[] = [p.sellerId];
      if (q.kind) { params.push(q.kind); where.push(`kind = $${params.length}`); }
      if (q.group) { params.push(GROUPS[q.group]); where.push(`kind = ANY($${params.length}::text[])`); }
      if (q.unread) where.push('read_at IS NULL');
      const [rows, total, unread] = await Promise.all([
        client.query(`SELECT id, kind, title, body, screen, entity_id, created_at, read_at FROM seller_notifications WHERE ${where.join(' AND ')} ORDER BY created_at DESC, id LIMIT ${q.pageSize} OFFSET ${(q.page - 1) * q.pageSize}`, params),
        client.query<{ n: number }>(`SELECT count(*)::int AS n FROM seller_notifications WHERE ${where.join(' AND ')}`, params),
        client.query<{ n: number }>('SELECT count(*)::int AS n FROM seller_notifications WHERE seller_id = $1 AND read_at IS NULL', [p.sellerId]),
      ]);
      return { items: rows.rows, total: total.rows[0].n, unread: unread.rows[0].n, page: q.page, pageSize: q.pageSize, pages: Math.max(1, Math.ceil(total.rows[0].n / q.pageSize)) };
    });
  });

  app.post('/v1/notifications/read', { preHandler: requireSeller }, async (request) => {
    const p = principal(request);
    const input = z.object({ ids: z.array(uuid).max(200).optional(), all: z.boolean().optional() }).refine((v) => v.all || v.ids?.length, { message: 'Choose notifications to mark as read.' }).parse(request.body);
    return withSellerTransaction(p.sellerId, async (client) => {
      const r = input.all
        ? await client.query('UPDATE seller_notifications SET read_at = now() WHERE seller_id = $1 AND read_at IS NULL', [p.sellerId])
        : await client.query('UPDATE seller_notifications SET read_at = now() WHERE seller_id = $1 AND read_at IS NULL AND id = ANY($2::uuid[])', [p.sellerId, input.ids]);
      return { marked: r.rowCount ?? 0 };
    });
  });
}
