import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import { db, withSellerTransaction } from '../db/client.js';
import { requireSeller } from './seller.js';
import { requirePlatformAdmin } from '../lib/adminAuth.js';

function seller(request: FastifyRequest) { if (!request.principal) throw Object.assign(new Error('Authentication required'), { statusCode: 401 }); return request.principal.sellerId; }
const summarize = async (client: Pool | PoolClient, sellerId?: string) => {
  const scope = sellerId ? 'WHERE seller_id=$1' : '';
  const args = sellerId ? [sellerId] : [];
  const [orders, shipments, ndr, spend, trend] = await Promise.all([
    client.query(`SELECT state,count(*)::int AS count FROM orders ${scope} GROUP BY state`, args),
    client.query(`SELECT state,count(*)::int AS count FROM shipments ${scope} GROUP BY state`, args),
    client.query(`SELECT state,count(*)::int AS count FROM ndr_cases ${scope} GROUP BY state`, args),
    client.query<{ value: string }>(`SELECT COALESCE(SUM(shipping_charge_paise),0)::bigint AS value FROM shipments ${scope}`, args),
    client.query<{ day: string; orders: number; delivered: number }>(`WITH days AS (SELECT generate_series(current_date-interval '6 days',current_date,interval '1 day')::date day) SELECT to_char(days.day,'DD Mon') AS day, COALESCE((SELECT count(*) FROM orders o WHERE o.created_at::date=days.day ${sellerId ? 'AND o.seller_id=$1' : ''}),0)::int orders, COALESCE((SELECT count(*) FROM shipments s WHERE s.created_at::date=days.day AND s.state='delivered' ${sellerId ? 'AND s.seller_id=$1' : ''}),0)::int delivered FROM days ORDER BY days.day`, args),
  ]);
  const by = (rows: { state: string; count: number }[]) => Object.fromEntries(rows.map((x) => [x.state, Number(x.count)]));
  const orderBy = by(orders.rows), shipmentBy = by(shipments.rows), ndrBy = by(ndr.rows);
  const totalShipments = Object.values(shipmentBy).reduce((a, b) => a + b, 0);
  return { metrics: { orderVolume: Object.values(orderBy).reduce((a,b)=>a+b,0), inTransit: (shipmentBy.in_transit || 0) + (shipmentBy.out_for_delivery || 0), deliveryRate: totalShipments ? +(((shipmentBy.delivered || 0) / totalShipments) * 100).toFixed(1) : 0, ndrRate: totalShipments ? +(((shipmentBy.ndr || 0) / totalShipments) * 100).toFixed(1) : 0, rtoRate: totalShipments ? +(((shipmentBy.rto || 0) / totalShipments) * 100).toFixed(1) : 0, shippingSpendPaise: Number(spend.rows[0].value) }, pipeline: { ...orderBy, ...shipmentBy }, ndrOpen: ndrBy.open || 0, trend: trend.rows.map((x) => ({ ...x, orders: Number(x.orders), delivered: Number(x.delivered) })) };
};
export async function analyticsRoutes(app: FastifyInstance) {
  app.get('/v1/analytics/dashboard', { preHandler: requireSeller }, async (request) => withSellerTransaction(seller(request), (client) => summarize(client, seller(request))));
  app.get('/v1/admin/analytics/dashboard', { preHandler: requirePlatformAdmin }, async () => {
    const data = await summarize(db);
    const sellers = await db.query<{ value: string }>(`SELECT count(*)::int AS value FROM sellers WHERE state='active'`);
    return { ...data, activeSellers: Number(sellers.rows[0].value) };
  });
}
