import type { FastifyInstance, FastifyRequest } from 'fastify';
import { withSellerTransaction } from '../db/client.js';
import { requireSeller } from './seller.js';
function principal(request: FastifyRequest) { if (!request.principal) throw Object.assign(new Error('Authentication required'), { statusCode: 401 }); return request.principal; }

export async function walletRoutes(app: FastifyInstance) {
  app.get('/v1/wallet', { preHandler: requireSeller }, async (request) => { const p = principal(request); return withSellerTransaction(p.sellerId, async (client) => { const result = await client.query<{ balance_paise: string }>(`SELECT COALESCE(SUM(CASE WHEN entry_type IN ('credit','release') THEN amount_paise WHEN entry_type IN ('debit','hold') THEN -amount_paise ELSE amount_paise END),0)::bigint AS balance_paise FROM wallet_entries WHERE seller_id=$1`, [p.sellerId]); return { currency: 'INR', balancePaise: Number(result.rows[0].balance_paise) }; }); });
  app.get('/v1/wallet/ledger', { preHandler: requireSeller }, async (request) => { const p = principal(request); return withSellerTransaction(p.sellerId, async (client) => ({ items: (await client.query('SELECT id,entry_type,amount_paise,reference_type,reference_id,description,created_at FROM wallet_entries WHERE seller_id=$1 ORDER BY created_at DESC LIMIT 250', [p.sellerId])).rows })); });
}
