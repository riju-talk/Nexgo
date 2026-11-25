import { pageOf, pageWithTotal } from '../lib/paging.js';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { withSellerTransaction } from '../db/client.js';
import { requireSeller } from './seller.js';
function principal(request: FastifyRequest) { if (!request.principal) throw Object.assign(new Error('Authentication required'), { statusCode: 401 }); return request.principal; }

export async function walletRoutes(app: FastifyInstance) {
  app.get('/v1/wallet', { preHandler: requireSeller }, async (request) => { const p = principal(request); return withSellerTransaction(p.sellerId, async (client) => { const result = await client.query<{ balance_paise: string }>(`SELECT COALESCE(SUM(CASE WHEN entry_type IN ('credit','release') THEN amount_paise WHEN entry_type IN ('debit','hold') THEN -amount_paise ELSE amount_paise END),0)::bigint AS balance_paise FROM wallet_entries WHERE seller_id=$1`, [p.sellerId]); const lim = Number((await client.query<{ l: string }>('SELECT wallet_debit_limit_paise AS l FROM sellers WHERE id=$1', [p.sellerId])).rows[0]?.l ?? 0); const bal = Number(result.rows[0].balance_paise); return { currency: 'INR', balancePaise: bal, debitLimitPaise: lim, availablePaise: bal + lim }; }); });
  app.get('/v1/wallet/ledger', { preHandler: requireSeller }, async (request) => { const p = principal(request); return withSellerTransaction(p.sellerId, (client) => pageWithTotal((t, v) => client.query(t, v), 'SELECT id,entry_type,amount_paise,reference_type,reference_id,description,created_at FROM wallet_entries WHERE seller_id=$1 ORDER BY created_at DESC, id', [p.sellerId], pageOf(request.query))); });
}
