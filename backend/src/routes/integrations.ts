import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { withSellerTransaction } from '../db/client.js';
import { audit } from '../lib/audit.js';
import { requireSeller } from './seller.js';
const input = z.object({ provider: z.enum(['shopify', 'woocommerce', 'amazon', 'magento', 'opencart', 'custom']), displayName: z.string().trim().min(2).max(120), storeUrl: z.string().trim().max(300).regex(/^https?:\/\/[^\s]+$/, 'Enter the store URL starting with https://').optional().or(z.literal('').transform(() => undefined)) });
function p(r: FastifyRequest) { if (!r.principal) throw Object.assign(new Error('Authentication required'), { statusCode: 401 }); return r.principal; }
export async function integrationRoutes(app: FastifyInstance) {
  app.get('/v1/channels', { preHandler: requireSeller }, async (request) => { const x=p(request); return withSellerTransaction(x.sellerId, async c => ({ items:(await c.query(`SELECT id,provider,display_name,store_url,state,last_synced_at,last_error,created_at,(SELECT count(*)::int FROM job_runs j WHERE j.seller_id=channel_connections.seller_id AND j.job_type LIKE 'channel.%' AND j.payload->>'channelId'=channel_connections.id::text AND j.state IN ('queued','running')) AS pending_syncs FROM channel_connections WHERE seller_id=$1 ORDER BY created_at DESC`,[x.sellerId])).rows })); });
  app.post('/v1/channels', { preHandler: requireSeller }, async (request, reply) => { const v=input.parse(request.body); const x=p(request); const row=await withSellerTransaction(x.sellerId,async c=>{const q=await c.query('INSERT INTO channel_connections (seller_id,provider,display_name,store_url) VALUES ($1,$2,$3,$4) RETURNING id,provider,display_name,store_url,state',[x.sellerId,v.provider,v.displayName,v.storeUrl??null]);await audit(c,{sellerId:x.sellerId,actorUserId:x.userId,action:'channel.created',targetType:'channel',targetId:q.rows[0].id,requestId:request.id});return q.rows[0]});return reply.code(201).send(row); });
  app.post('/v1/channels/:channelId/sync', { preHandler: requireSeller }, async (request, reply) => { const x=p(request); const id=z.string().uuid().parse((request.params as {channelId:string}).channelId); const row=await withSellerTransaction(x.sellerId,async c=>{const channel=await c.query('SELECT id FROM channel_connections WHERE id=$1 AND seller_id=$2',[id,x.sellerId]);if(!channel.rows[0])throw Object.assign(new Error('Channel not found'),{statusCode:404});const q=await c.query(`INSERT INTO job_runs (seller_id,job_type,payload) VALUES ($1,'channel.sync',$2) RETURNING id,state,queued_at`,[x.sellerId,JSON.stringify({channelId:id})]);await audit(c,{sellerId:x.sellerId,actorUserId:x.userId,action:'channel.sync_requested',targetType:'channel',targetId:id,requestId:request.id,metadata:{jobId:q.rows[0].id}});return q.rows[0]});return reply.code(202).send(row); });
  app.get('/v1/jobs', { preHandler: requireSeller }, async request => { const x=p(request);return withSellerTransaction(x.sellerId,async c=>({items:(await c.query('SELECT id,job_type,state,attempts,error_summary,queued_at,started_at,completed_at FROM job_runs WHERE seller_id=$1 ORDER BY queued_at DESC LIMIT 100',[x.sellerId])).rows})); });
  app.delete('/v1/channels/:channelId', { preHandler: requireSeller }, async (request) => {
    const x = p(request); const id = z.string().uuid().parse((request.params as { channelId: string }).channelId);
    return withSellerTransaction(x.sellerId, async (c) => {
      const removed = await c.query('DELETE FROM channel_connections WHERE id=$1 AND seller_id=$2 RETURNING id,provider,display_name', [id, x.sellerId]);
      if (!removed.rows[0]) throw Object.assign(new Error('Channel not found'), { statusCode: 404 });
      await audit(c, { sellerId: x.sellerId, actorUserId: x.userId, action: 'channel.removed', targetType: 'channel', targetId: id, requestId: request.id });
      return { id, removed: true };
    });
  });
}
