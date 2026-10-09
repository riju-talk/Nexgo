import { z } from 'zod';

// Filters shared by the NDR and RTO boards (Shiprocket-style filter panel). Queries must alias
// shipments as s, orders as o, and filter through the `add` helper (a `?` in the SQL becomes the next $n).
export const shipmentFilterFields = {
  orderIds: z.string().trim().max(2000).optional(),
  awbs: z.string().trim().max(2000).optional(),
  product: z.string().trim().max(80).optional(),
  channel: z.enum(['single', 'bulk_upload', 'shopify', 'amazon', 'woocommerce', 'opencart', 'magento']).optional(),
  orderType: z.enum(['forward', 'reverse', 'dropship', 'ship_now']).optional(),
  whatsapp: z.enum(['not_sent', 'sent', 'delivered', 'read', 'failed']).optional(),
  warehouse: z.string().uuid().optional(),
};

const list = (value: string) => [...new Set(value.split(/[\s,;]+/).map((v) => v.trim()).filter(Boolean))].slice(0, 200);

export function applyShipmentFilters(add: (sql: string, value: unknown) => void, q: { orderIds?: string; awbs?: string; product?: string; channel?: string; orderType?: string; whatsapp?: string; warehouse?: string }) {
  if (q.orderIds && list(q.orderIds).length) add('(o.order_number = ANY(?::text[]) OR o.nexgo_order_id = ANY(?::text[]))', list(q.orderIds));
  if (q.awbs && list(q.awbs).length) add('s.awb = ANY(?::text[])', list(q.awbs));
  if (q.product) add('EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.id AND oi.name ILIKE ?)', `%${q.product}%`);
  if (q.channel) add('o.channel = ?', q.channel);
  if (q.orderType) add('o.order_flow = ?', q.orderType);
  if (q.whatsapp) add('s.whatsapp_status = ?', q.whatsapp);
  if (q.warehouse) add('o.warehouse_id = ?', q.warehouse);
}
