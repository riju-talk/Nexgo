import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { withSellerTransaction } from '../db/client.js';
import { audit } from '../lib/audit.js';
import { volumetricWeightG } from '../lib/money.js';
import { requireSeller } from './seller.js';

const uuid = z.string().uuid();
const pincode = z.string().regex(/^\d{6}$/);
const phone = z.string().trim().regex(/^[0-9+() -]{7,24}$/);
const address = z.object({ fullName: z.string().trim().min(2).max(120), email: z.string().email().max(254).optional(), phone, addressLine1: z.string().trim().min(3).max(200), addressLine2: z.string().trim().max(200).optional(), city: z.string().trim().min(2).max(100), state: z.string().trim().min(2).max(100), pincode });
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const warehouseBase = z.object({
  name: z.string().trim().min(2).max(120), warehouseType: z.enum(['primary', 'secondary', 'fulfilment', 'returns']).default('primary'),
  contactName: z.string().trim().min(2).max(100), phone, email: z.string().trim().email().max(254).optional().or(z.literal('').transform(() => undefined)),
  addressLine1: z.string().trim().min(3).max(200), addressLine2: z.string().trim().max(200).optional(), city: z.string().trim().min(2).max(100), state: z.string().trim().min(2).max(100), pincode,
  latitude: z.number().min(-90).max(90).optional(), longitude: z.number().min(-180).max(180).optional(),
  capacitySqft: z.number().int().positive().max(100_000_000).optional(), opensAt: hhmm.optional(), closesAt: hhmm.optional(),
  managerName: z.string().trim().max(100).optional(), notes: z.string().trim().max(1000).optional(),
  isDefault: z.boolean().default(false), isReturnAddress: z.boolean().default(false), cutoffTime: hhmm.optional(),
});
const warehouseChecks = (v: { opensAt?: string; closesAt?: string; latitude?: number; longitude?: number }, ctx: z.RefinementCtx) => {
  if (v.opensAt && v.closesAt && v.closesAt <= v.opensAt) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Closing time must be after opening time', path: ['closesAt'] });
  if ((v.latitude === undefined) !== (v.longitude === undefined)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Enter both latitude and longitude', path: ['latitude'] });
};
const warehouseInput = warehouseBase.superRefine(warehouseChecks);
const warehousePatch = warehouseBase.partial().superRefine(warehouseChecks);
const productInput = z.object({ sku: z.string().trim().min(1).max(80), name: z.string().trim().min(2).max(200), description: z.string().trim().max(2000).optional(), hsnCode: z.string().trim().max(20).optional(), unitPricePaise: z.number().int().min(0).default(0), weightG: z.number().int().positive().optional(), lengthMm: z.number().int().positive().optional(), widthMm: z.number().int().positive().optional(), heightMm: z.number().int().positive().optional() });
const consignee = address.extend({ companyName: z.string().trim().max(120).optional(), alternatePhone: phone.optional(), landmark: z.string().trim().max(200).optional() });
const paise = z.number().int().min(0).max(1_000_000_000);
const orderInput = z.object({
  warehouseId: uuid, orderNumber: z.string().trim().min(1).max(100), externalReference: z.string().trim().min(1).max(150).optional(),
  orderFlow: z.enum(['forward','reverse','dropship','ship_now']).default('forward'), channel: z.enum(['single', 'bulk_upload', 'shopify', 'amazon', 'woocommerce', 'opencart', 'magento']).default('single'), paymentMode: z.enum(['prepaid', 'cod']).default('prepaid'),
  codAmountPaise: paise.default(0), notes: z.string().trim().max(2000).optional(), customer: consignee,
  items: z.array(z.object({ productId: uuid.optional(), sku: z.string().trim().min(1).max(80), name: z.string().trim().min(2).max(200), hsnCode: z.string().trim().regex(/^\d{4,8}$/).optional(), quantity: z.number().int().min(1).max(10_000), unitPricePaise: paise, weightG: z.number().int().min(0).default(0) })).min(1, 'Add at least one product').max(5, 'An order can contain at most 5 products'),
  // Physical parcel. weightG overrides the item-weight sum (it includes packaging); dimensions drive volumetric weight.
  package: z.object({ weightG: z.number().int().min(1).max(500_000).optional(), lengthMm: z.number().int().min(10).max(5_000).optional(), widthMm: z.number().int().min(10).max(5_000).optional(), heightMm: z.number().int().min(10).max(5_000).optional() }).default({}),
  charges: z.object({ shippingPaise: paise.default(0), giftWrapPaise: paise.default(0), transactionPaise: paise.default(0), otherPaise: paise.default(0), discountPaise: paise.default(0), taxRateBps: z.number().int().min(0).max(10_000).default(0) }).default({}),
}).superRefine((value, ctx) => {
  if (value.paymentMode === 'cod' && value.codAmountPaise <= 0) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'COD orders require a positive COD amount', path: ['codAmountPaise'] });
  if (value.paymentMode === 'prepaid' && value.codAmountPaise !== 0) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Prepaid orders cannot have a COD amount', path: ['codAmountPaise'] });
  const dims = [value.package.lengthMm, value.package.widthMm, value.package.heightMm].filter((d) => d !== undefined).length;
  // Orders keyed in by the seller (single form or bulk sheet) must carry the full package size: courier rates depend on it.
  const manual = value.channel === 'single' || value.channel === 'bulk_upload';
  if (manual && dims !== 3) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Length, breadth and height are required', path: ['package'] });
  else if (dims !== 0 && dims !== 3) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Provide length, width and height together', path: ['package'] });
});

// Server-side money for an order: clients send line inputs, never totals.
function orderTotals(input: z.infer<typeof orderInput>) {
  const subtotal = input.items.reduce((sum, item) => sum + item.quantity * item.unitPricePaise, 0);
  const c = input.charges; const tax = Math.round((subtotal * c.taxRateBps) / 10_000);
  const gross = subtotal + tax + c.shippingPaise + c.giftWrapPaise + c.transactionPaise + c.otherPaise;
  if (c.discountPaise > gross) throw Object.assign(new Error('Discount cannot exceed the order value'), { statusCode: 422 });
  const total = gross - c.discountPaise;
  if (input.paymentMode === 'cod' && input.codAmountPaise > total) throw Object.assign(new Error('COD amount cannot exceed the order total'), { statusCode: 422 });
  const itemWeight = input.items.reduce((sum, item) => sum + item.quantity * item.weightG, 0);
  const { lengthMm, widthMm, heightMm } = input.package;
  const volumetric = lengthMm && widthMm && heightMm ? volumetricWeightG(lengthMm, widthMm, heightMm) : 0;
  return { subtotal, tax, total, deadWeight: input.package.weightG ?? itemWeight, volumetric };
}
const transitions: Record<string, readonly string[]> = { draft: ['new', 'cancelled'], new: ['ready_to_ship', 'cancelled'], ready_to_ship: ['booked', 'cancelled'], booked: ['returned'], cancelled: [], returned: [] };

function getPrincipal(request: FastifyRequest) { if (!request.principal) throw Object.assign(new Error('Authentication required'), { statusCode: 401 }); return request.principal; }

export async function operationsRoutes(app: FastifyInstance) {
  app.get('/v1/warehouses', { preHandler: requireSeller }, async (request) => {
    const p = getPrincipal(request); return withSellerTransaction(p.sellerId, async (client) => ({ items: (await client.query('SELECT * FROM warehouses WHERE seller_id = $1 ORDER BY is_active DESC, is_default DESC, name', [p.sellerId])).rows }));
  });
  // A known pincode must match the city/state typed, so a mistyped pincode cannot silently misroute pickups.
  const checkLocation = async (client: PoolClient, pin: string, state?: string) => {
    const known = (await client.query<{ city: string; state: string }>('SELECT city, state FROM pincodes WHERE pincode=$1', [pin])).rows[0];
    if (known && state && known.state.toLowerCase() !== state.toLowerCase()) throw Object.assign(new Error(`Pincode ${pin} belongs to ${known.state}, not ${state}`), { statusCode: 400 });
  };
  const WAREHOUSE_COLUMNS: Record<string, string> = { name: 'name', warehouseType: 'warehouse_type', contactName: 'contact_name', phone: 'phone', email: 'email', addressLine1: 'address_line_1', addressLine2: 'address_line_2', city: 'city', state: 'state', pincode: 'pincode', latitude: 'latitude', longitude: 'longitude', capacitySqft: 'capacity_sqft', opensAt: 'opens_at', closesAt: 'closes_at', managerName: 'manager_name', notes: 'notes', isReturnAddress: 'is_return_address', cutoffTime: 'cutoff_time' };

  app.post('/v1/warehouses', { preHandler: requireSeller }, async (request, reply) => {
    const input = warehouseInput.parse(request.body); const p = getPrincipal(request);
    const row = await withSellerTransaction(p.sellerId, async (client) => {
      await checkLocation(client, input.pincode, input.state);
      const existing = (await client.query<{ n: string }>('SELECT count(*) AS n FROM warehouses WHERE seller_id=$1 AND is_active', [p.sellerId])).rows[0];
      const makeDefault = input.isDefault || Number(existing.n) === 0; // the first warehouse is always the default
      if (makeDefault) await client.query('UPDATE warehouses SET is_default=false, updated_at=now() WHERE seller_id=$1 AND is_default', [p.sellerId]);
      const result = await client.query(`INSERT INTO warehouses (seller_id,name,warehouse_type,contact_name,phone,email,address_line_1,address_line_2,city,state,pincode,latitude,longitude,capacity_sqft,opens_at,closes_at,manager_name,notes,is_default,is_return_address,cutoff_time)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21) RETURNING *`,
        [p.sellerId, input.name, input.warehouseType, input.contactName, input.phone, input.email ?? null, input.addressLine1, input.addressLine2 ?? null, input.city, input.state, input.pincode, input.latitude ?? null, input.longitude ?? null, input.capacitySqft ?? null, input.opensAt ?? null, input.closesAt ?? null, input.managerName ?? null, input.notes ?? null, makeDefault, input.isReturnAddress, input.cutoffTime ?? null]).catch((e) => { if (e.code === '23505') throw Object.assign(new Error('You already have a warehouse with this name'), { statusCode: 409 }); throw e; });
      await audit(client, { sellerId: p.sellerId, actorUserId: p.userId, action: 'warehouse.created', targetType: 'warehouse', targetId: result.rows[0].id, requestId: request.id }); return result.rows[0];
    }); return reply.code(201).send(row);
  });

  app.patch('/v1/warehouses/:warehouseId', { preHandler: requireSeller }, async (request) => {
    const id = uuid.parse((request.params as { warehouseId: string }).warehouseId); const input = warehousePatch.parse(request.body); const p = getPrincipal(request);
    return withSellerTransaction(p.sellerId, async (client) => {
      const current = (await client.query('SELECT id, pincode, state, is_default FROM warehouses WHERE id=$1 AND seller_id=$2 FOR UPDATE', [id, p.sellerId])).rows[0];
      if (!current) throw Object.assign(new Error('Warehouse not found'), { statusCode: 404 });
      await checkLocation(client, input.pincode ?? current.pincode, input.state ?? current.state);
      const sets: string[] = []; const values: unknown[] = [id, p.sellerId];
      for (const [key, column] of Object.entries(WAREHOUSE_COLUMNS)) { const v = (input as Record<string, unknown>)[key]; if (v !== undefined) { values.push(v === '' ? null : v); sets.push(`${column}=$${values.length}`); } }
      if (input.isDefault === true && !current.is_default) { await client.query('UPDATE warehouses SET is_default=false, updated_at=now() WHERE seller_id=$1 AND is_default', [p.sellerId]); sets.push('is_default=true'); }
      if (!sets.length) return (await client.query('SELECT * FROM warehouses WHERE id=$1', [id])).rows[0];
      const result = await client.query(`UPDATE warehouses SET ${sets.join(', ')}, updated_at=now() WHERE id=$1 AND seller_id=$2 RETURNING *`, values).catch((e) => { if (e.code === '23505') throw Object.assign(new Error('You already have a warehouse with this name'), { statusCode: 409 }); throw e; });
      await audit(client, { sellerId: p.sellerId, actorUserId: p.userId, action: 'warehouse.updated', targetType: 'warehouse', targetId: id, requestId: request.id, metadata: { fields: Object.keys(input) } });
      return result.rows[0];
    });
  });

  app.post('/v1/warehouses/:warehouseId/default', { preHandler: requireSeller }, async (request) => {
    const id = uuid.parse((request.params as { warehouseId: string }).warehouseId); const p = getPrincipal(request);
    return withSellerTransaction(p.sellerId, async (client) => {
      const target = (await client.query('SELECT id, is_active FROM warehouses WHERE id=$1 AND seller_id=$2 FOR UPDATE', [id, p.sellerId])).rows[0];
      if (!target) throw Object.assign(new Error('Warehouse not found'), { statusCode: 404 });
      if (!target.is_active) throw Object.assign(new Error('An inactive warehouse cannot be the default'), { statusCode: 409 });
      await client.query('UPDATE warehouses SET is_default=false, updated_at=now() WHERE seller_id=$1 AND is_default', [p.sellerId]);
      const result = await client.query('UPDATE warehouses SET is_default=true, updated_at=now() WHERE id=$1 RETURNING *', [id]);
      await audit(client, { sellerId: p.sellerId, actorUserId: p.userId, action: 'warehouse.default_set', targetType: 'warehouse', targetId: id, requestId: request.id });
      return result.rows[0];
    });
  });

  // Soft delete: orders and shipments keep their pickup address. A new default is promoted if the default is removed.
  app.delete('/v1/warehouses/:warehouseId', { preHandler: requireSeller }, async (request) => {
    const id = uuid.parse((request.params as { warehouseId: string }).warehouseId); const p = getPrincipal(request);
    return withSellerTransaction(p.sellerId, async (client) => {
      const target = (await client.query('SELECT id, is_default FROM warehouses WHERE id=$1 AND seller_id=$2 AND is_active FOR UPDATE', [id, p.sellerId])).rows[0];
      if (!target) throw Object.assign(new Error('Warehouse not found'), { statusCode: 404 });
      const others = (await client.query('SELECT id FROM warehouses WHERE seller_id=$1 AND is_active AND id<>$2 ORDER BY created_at LIMIT 1', [p.sellerId, id])).rows[0];
      if (!others) throw Object.assign(new Error('You need at least one active warehouse. Add another before removing this one.'), { statusCode: 409 });
      await client.query('UPDATE warehouses SET is_active=false, is_default=false, updated_at=now() WHERE id=$1', [id]);
      if (target.is_default) await client.query('UPDATE warehouses SET is_default=true, updated_at=now() WHERE id=$1', [others.id]);
      await audit(client, { sellerId: p.sellerId, actorUserId: p.userId, action: 'warehouse.deactivated', targetType: 'warehouse', targetId: id, requestId: request.id });
      return { id, deactivated: true, newDefaultId: target.is_default ? others.id : null };
    });
  });
  app.get('/v1/customers', { preHandler: requireSeller }, async (request) => { const p = getPrincipal(request); return withSellerTransaction(p.sellerId, async (client) => ({ items: (await client.query('SELECT * FROM customers WHERE seller_id = $1 ORDER BY created_at DESC LIMIT 100', [p.sellerId])).rows })); });
  app.get('/v1/products', { preHandler: requireSeller }, async (request) => { const p = getPrincipal(request); return withSellerTransaction(p.sellerId, async (client) => ({ items: (await client.query('SELECT * FROM products WHERE seller_id = $1 ORDER BY sku LIMIT 250', [p.sellerId])).rows })); });
  app.post('/v1/products', { preHandler: requireSeller }, async (request, reply) => {
    const input = productInput.parse(request.body); const p = getPrincipal(request);
    const row = await withSellerTransaction(p.sellerId, async (client) => {
      const result = await client.query(`INSERT INTO products (seller_id,sku,name,description,hsn_code,unit_price_paise,weight_g,length_mm,width_mm,height_mm) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`, [p.sellerId, input.sku, input.name, input.description ?? null, input.hsnCode ?? null, input.unitPricePaise, input.weightG ?? null, input.lengthMm ?? null, input.widthMm ?? null, input.heightMm ?? null]);
      await audit(client, { sellerId: p.sellerId, actorUserId: p.userId, action: 'product.created', targetType: 'product', targetId: result.rows[0].id, requestId: request.id }); return result.rows[0];
    }); return reply.code(201).send(row);
  });
  app.get('/v1/orders', { preHandler: requireSeller }, async (request) => {
    const p = getPrincipal(request); return withSellerTransaction(p.sellerId, async (client) => ({ items: (await client.query(`SELECT o.*,w.name AS warehouse_name,c.full_name AS customer_name,c.city AS customer_city,c.pincode AS customer_pincode FROM orders o JOIN warehouses w ON w.id=o.warehouse_id JOIN customers c ON c.id=o.customer_id WHERE o.seller_id=$1 ORDER BY o.created_at DESC LIMIT 100`, [p.sellerId])).rows }));
  });
  app.get('/v1/orders/:orderId', { preHandler: requireSeller }, async (request) => {
    const p = getPrincipal(request); const orderId = uuid.parse((request.params as { orderId: string }).orderId);
    return withSellerTransaction(p.sellerId, async (client) => { const order = await client.query('SELECT * FROM orders WHERE id=$1 AND seller_id=$2', [orderId, p.sellerId]); if (!order.rows[0]) throw Object.assign(new Error('Order not found'), { statusCode: 404 }); const items = await client.query('SELECT * FROM order_items WHERE order_id=$1 ORDER BY created_at', [orderId]); return { ...order.rows[0], items: items.rows }; });
  });
  app.post('/v1/orders', { preHandler: requireSeller }, async (request, reply) => {
    const input = orderInput.parse(request.body); const p = getPrincipal(request);
    const row = await withSellerTransaction(p.sellerId, async (client) => {
      const warehouse = await client.query('SELECT id FROM warehouses WHERE id=$1 AND seller_id=$2 AND is_active', [input.warehouseId, p.sellerId]); if (!warehouse.rows[0]) throw Object.assign(new Error('Active warehouse not found'), { statusCode: 422 });
      let customer = await client.query<{ id: string }>('SELECT id FROM customers WHERE seller_id=$1 AND phone=$2 AND pincode=$3 LIMIT 1', [p.sellerId, input.customer.phone, input.customer.pincode]);
      const c = input.customer;
      if (!customer.rows[0]) customer = await client.query<{ id: string }>(`INSERT INTO customers (seller_id,full_name,email,phone,address_line_1,address_line_2,city,state,pincode,company_name,alternate_phone,landmark) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`, [p.sellerId, c.fullName, c.email ?? null, c.phone, c.addressLine1, c.addressLine2 ?? null, c.city, c.state, c.pincode, c.companyName ?? null, c.alternatePhone ?? null, c.landmark ?? null]);
      const t = orderTotals(input); const ch = input.charges; const pk = input.package;
      const result = await client.query(`INSERT INTO orders (seller_id,warehouse_id,customer_id,order_number,external_reference,order_flow,payment_mode,cod_amount_paise,subtotal_paise,total_weight_g,notes,state,package_length_mm,package_width_mm,package_height_mm,volumetric_weight_g,shipping_charges_paise,gift_wrap_paise,transaction_charges_paise,other_charges_paise,discount_paise,tax_rate_bps,tax_paise,total_paise) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'new',$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23) RETURNING *`, [p.sellerId, input.warehouseId, customer.rows[0].id, input.orderNumber, input.externalReference ?? input.orderNumber, input.orderFlow, input.paymentMode, input.codAmountPaise, t.subtotal, t.deadWeight, input.notes ?? null, pk.lengthMm ?? null, pk.widthMm ?? null, pk.heightMm ?? null, t.volumetric, ch.shippingPaise, ch.giftWrapPaise, ch.transactionPaise, ch.otherPaise, ch.discountPaise, ch.taxRateBps, t.tax, t.total]);
      if (input.channel !== 'single') { await client.query('UPDATE orders SET channel=$1 WHERE id=$2', [input.channel, result.rows[0].id]); result.rows[0].channel = input.channel; }
      for (const item of input.items) await client.query('INSERT INTO order_items (order_id,product_id,sku,name,quantity,unit_price_paise,weight_g,hsn_code) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [result.rows[0].id, item.productId ?? null, item.sku, item.name, item.quantity, item.unitPricePaise, item.weightG, item.hsnCode ?? null]);
      await audit(client, { sellerId: p.sellerId, actorUserId: p.userId, action: 'order.created', targetType: 'order', targetId: result.rows[0].id, requestId: request.id, metadata: { orderNumber: input.orderNumber, itemCount: input.items.length } }); return result.rows[0];
    }); return reply.code(201).send(row);
  });
  app.patch('/v1/orders/:orderId/state', { preHandler: requireSeller }, async (request) => {
    const p = getPrincipal(request); const orderId = uuid.parse((request.params as { orderId: string }).orderId); const { state } = z.object({ state: z.enum(['draft', 'new', 'ready_to_ship', 'booked', 'cancelled', 'returned']) }).parse(request.body);
    return withSellerTransaction(p.sellerId, async (client) => { const current = await client.query<{ state: string }>('SELECT state FROM orders WHERE id=$1 AND seller_id=$2 FOR UPDATE', [orderId, p.sellerId]); if (!current.rows[0]) throw Object.assign(new Error('Order not found'), { statusCode: 404 }); if (!transitions[current.rows[0].state].includes(state)) throw Object.assign(new Error(`Cannot transition order from ${current.rows[0].state} to ${state}`), { statusCode: 409 }); const updated = await client.query(`UPDATE orders SET state=$1::order_state,cancelled_at=CASE WHEN $1::order_state='cancelled'::order_state THEN now() ELSE cancelled_at END,updated_at=now() WHERE id=$2 RETURNING *`, [state, orderId]); await audit(client, { sellerId: p.sellerId, actorUserId: p.userId, action: 'order.state_changed', targetType: 'order', targetId: orderId, requestId: request.id, metadata: { from: current.rows[0].state, to: state } }); return updated.rows[0]; });
  });
}
