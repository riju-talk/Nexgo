import type { PoolClient } from 'pg';

const MESSAGE = (brand: string, customer: string, orderNumber: string) => `Hi, ${customer}. Thank you for Shopping with ${brand}. Your order number is ${orderNumber}. Press 1 to confirm the order and 2 to cancel the order.`;

// Called when a COD order is created. Does nothing unless the seller enabled COD confirmation for the order's channel.
// UNIQUE(order_id) + ON CONFLICT make a repeated call (retry, duplicate event) a no-op, so a customer is never asked twice.
export async function queueCodConfirmation(client: PoolClient, o: { sellerId: string; orderId: string; paymentMode: string; channel: string; customerName: string; orderNumber: string }) {
  if (o.paymentMode !== 'cod') return false;
  const prefs = await client.query<{ v: Record<string, unknown> | null }>(`SELECT preferences->'cod-confirmation' AS v FROM seller_preferences WHERE seller_id = $1`, [o.sellerId]);
  const v = prefs.rows[0]?.v;
  const channel = o.channel === 'single' || o.channel === 'bulk_upload' ? 'custom' : o.channel;
  const brand = typeof v?.brandName === 'string' ? v.brandName.trim() : '';
  if (!v || v.status !== 'Enable' || !brand || v[`channel_${channel}`] !== true) return false;
  const r = await client.query(`INSERT INTO cod_confirmations (seller_id, order_id, channel, message) VALUES ($1,$2,$3,$4) ON CONFLICT (order_id) DO NOTHING`, [o.sellerId, o.orderId, channel, MESSAGE(brand, o.customerName, o.orderNumber)]);
  return (r.rowCount ?? 0) > 0;
}
