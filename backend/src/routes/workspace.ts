import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { db, withSellerTransaction } from '../db/client.js';
import { audit } from '../lib/audit.js';
import { requirePlatformAdmin } from '../lib/adminAuth.js';
import { requireSeller } from './seller.js';

function seller(request: FastifyRequest) { if (!request.principal) throw Object.assign(new Error('Authentication required'), { statusCode: 401 }); return request.principal; }
const settings = z.record(z.string().max(80), z.union([z.string().max(500), z.number().finite(), z.boolean(), z.null()]));
const ticket = z.object({ subject: z.string().trim().min(4).max(180), category: z.string().trim().min(2).max(60), message: z.string().trim().min(8).max(4000), priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal') });

export async function workspaceRoutes(app: FastifyInstance) {
  app.get('/v1/settings/:area', { preHandler: requireSeller }, async (request) => {
    const p = seller(request); const area = z.string().regex(/^[a-z-]{2,50}$/).parse((request.params as { area: string }).area);
    return withSellerTransaction(p.sellerId, async client => { const row = await client.query<{ preferences: Record<string, unknown> }>('SELECT preferences FROM seller_preferences WHERE seller_id=$1', [p.sellerId]); return { area, values: row.rows[0]?.preferences?.[area] ?? {} }; });
  });
  app.put('/v1/settings/:area', { preHandler: requireSeller }, async (request) => {
    const p = seller(request); const area = z.string().regex(/^[a-z-]{2,50}$/).parse((request.params as { area: string }).area); const values = settings.parse(request.body);
    return withSellerTransaction(p.sellerId, async client => { const result = await client.query<{ preferences: Record<string, unknown> }>(`INSERT INTO seller_preferences(seller_id,preferences,updated_by) VALUES($1,jsonb_build_object($2::text,$3::jsonb),$4)
      ON CONFLICT(seller_id) DO UPDATE SET preferences=seller_preferences.preferences || jsonb_build_object($2::text,$3::jsonb),updated_by=$4,updated_at=now() RETURNING preferences`, [p.sellerId, area, JSON.stringify(values), p.userId]); await audit(client, { sellerId: p.sellerId, actorUserId: p.userId, action: 'settings.updated', targetType: 'seller_preferences', targetId: p.sellerId, requestId: request.id, metadata: { area, keys: Object.keys(values) } }); return { area, values: result.rows[0].preferences[area] ?? {} }; });
  });
  app.get('/v1/reports/summary', { preHandler: requireSeller }, async request => {
    const p = seller(request); return withSellerTransaction(p.sellerId, async client => { const [orders, shipments, spend, ndr] = await Promise.all([
      client.query('SELECT state,count(*)::int AS count FROM orders WHERE seller_id=$1 GROUP BY state', [p.sellerId]), client.query('SELECT state,count(*)::int AS count FROM shipments WHERE seller_id=$1 GROUP BY state', [p.sellerId]), client.query<{ amount: string }>(`SELECT COALESCE(SUM(amount_paise),0)::bigint AS amount FROM wallet_entries WHERE seller_id=$1 AND entry_type IN ('debit','hold')`, [p.sellerId]), client.query('SELECT state,count(*)::int AS count FROM ndr_cases WHERE seller_id=$1 GROUP BY state', [p.sellerId]),
    ]); return { orders: orders.rows, shipments: shipments.rows, ndr: ndr.rows, shippingSpendPaise: Number(spend.rows[0].amount) }; });
  });
  app.get('/v1/tickets', { preHandler: requireSeller }, async request => { const p = seller(request); return withSellerTransaction(p.sellerId, async c => ({ items: (await c.query('SELECT id,subject,category,priority,state,resolution_note,created_at,updated_at FROM support_tickets WHERE seller_id=$1 ORDER BY created_at DESC LIMIT 100', [p.sellerId])).rows })); });
  app.post('/v1/tickets', { preHandler: requireSeller }, async (request, reply) => { const p = seller(request); const input = ticket.parse(request.body); const row = await withSellerTransaction(p.sellerId, async c => { const x = await c.query('INSERT INTO support_tickets(seller_id,created_by,subject,category,message,priority) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,subject,category,priority,state,created_at', [p.sellerId, p.userId, input.subject, input.category, input.message, input.priority]); await audit(c, { sellerId: p.sellerId, actorUserId: p.userId, action: 'support.ticket_created', targetType: 'support_ticket', targetId: x.rows[0].id, requestId: request.id }); return x.rows[0]; }); return reply.code(201).send(row); });
  app.get('/v1/admin/tickets', { preHandler: requirePlatformAdmin }, async () => ({ items: (await db.query(`SELECT t.*,s.legal_name AS seller_name FROM support_tickets t JOIN sellers s ON s.id=t.seller_id ORDER BY CASE t.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END,t.created_at DESC LIMIT 200`)).rows }));
  app.patch('/v1/admin/tickets/:ticketId', { preHandler: requirePlatformAdmin }, async (request, reply) => { const id = z.string().uuid().parse((request.params as { ticketId: string }).ticketId); const input = z.object({ state: z.enum(['open','in_progress','resolved','closed']), resolutionNote: z.string().trim().max(2000).optional() }).parse(request.body); const row = await db.query(`UPDATE support_tickets SET state=$1::support_ticket_state,resolution_note=$2,assigned_to=$3,resolved_at=CASE WHEN $1 IN ('resolved','closed') THEN now() ELSE NULL END,updated_at=now() WHERE id=$4 RETURNING id,state,resolution_note,updated_at`, [input.state, input.resolutionNote ?? null, request.adminPrincipal!.userId, id]); if (!row.rows[0]) return reply.code(404).send({ error: 'TICKET_NOT_FOUND' }); return row.rows[0]; });
}
