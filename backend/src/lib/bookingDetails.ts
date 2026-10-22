import type { PoolClient } from 'pg';
import type { BookingDetails } from '../couriers/types.js';

// Order, consignee, pickup warehouse and line items for the courier call, read inside the booking transaction.
export async function loadBookingDetails(client: PoolClient, sellerId: string, orderId: string, serviceId: string): Promise<BookingDetails> {
  const r = (await client.query(
    `SELECT o.order_number, o.nexgo_order_id, o.total_weight_g, o.volumetric_weight_g, o.package_length_mm, o.package_width_mm, o.package_height_mm,
            w.id AS wid, w.name AS wname, w.contact_name, w.phone AS wphone, w.email AS wemail, w.address_line_1 AS wa1, w.address_line_2 AS wa2, w.city AS wcity, w.state AS wstate, w.pincode AS wpin,
            c.full_name, c.phone, c.email, c.address_line_1, c.address_line_2, c.landmark, c.city, c.state, c.pincode,
            s.legal_name, cs.external_service_id, h.external_hub_id
       FROM orders o JOIN warehouses w ON w.id = o.warehouse_id JOIN customers c ON c.id = o.customer_id JOIN sellers s ON s.id = o.seller_id
       JOIN courier_services cs ON cs.id = $3
       LEFT JOIN courier_pickup_hubs h ON h.warehouse_id = w.id AND h.provider_id = cs.provider_id
      WHERE o.id = $1 AND o.seller_id = $2`, [orderId, sellerId, serviceId])).rows[0];
  if (!r) throw Object.assign(new Error('Order not found'), { statusCode: 404 });
  const items = (await client.query<{ name: string; sku: string; quantity: number; unit_price_paise: number; weight_g: number }>('SELECT name, sku, quantity, unit_price_paise, weight_g FROM order_items WHERE order_id = $1 ORDER BY created_at', [orderId])).rows;
  return {
    sellerName: r.legal_name, orderNumber: r.order_number, nexgoOrderId: r.nexgo_order_id, externalServiceId: r.external_service_id, pickupHubId: r.external_hub_id,
    warehouse: { id: r.wid, name: r.wname, contactName: r.contact_name, phone: r.wphone, email: r.wemail, address1: r.wa1, address2: r.wa2, city: r.wcity, state: r.wstate, pincode: r.wpin },
    consignee: { name: r.full_name, phone: r.phone, email: r.email, address1: r.address_line_1, address2: r.address_line_2, landmark: r.landmark, city: r.city, state: r.state, pincode: r.pincode },
    items: items.map((i) => ({ name: i.name, sku: i.sku, quantity: i.quantity, unitPricePaise: i.unit_price_paise, weightG: i.weight_g })),
    package: { weightG: r.total_weight_g, lengthMm: r.package_length_mm, widthMm: r.package_width_mm, heightMm: r.package_height_mm, volumetricWeightG: r.volumetric_weight_g },
  };
}
