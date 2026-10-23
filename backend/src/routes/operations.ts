import { queueCodConfirmation } from '../lib/codConfirmation.js';
import { maskCustomerRows } from '../lib/permissions.js';
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
  app.get('/v1/customers', { preHandler: requireSeller }, async (request) => { const p = getPrincipal(request); return withSellerTransaction(p.sellerId, async (client) => ({ items: maskCustomerRows((await client.query('SELECT * FROM customers WHERE seller_id = $1 ORDER BY created_at DESC LIMIT 100', [p.sellerId])).rows, p, 'orders.view_customer') })); });
  app.get('/v1/products', { preHandler: requireSeller }, async (request) => { const p = getPrincipal(request); return withSellerTransaction(p.sellerId, async (client) => ({ items: (await client.query('SELECT * FROM products WHERE seller_id = $1 ORDER BY sku LIMIT 250', [p.sellerId])).rows })); });
  app.post('/v1/products', { preHandler: requireSeller }, async (request, reply) => {
    const input = productInput.parse(request.body); const p = getPrincipal(request);
    const row = await withSellerTransaction(p.sellerId, async (client) => {
      const result = await client.query(`INSERT INTO products (seller_id,sku,name,description,hsn_code,unit_price_paise,weight_g,length_mm,width_mm,height_mm) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`, [p.sellerId, input.sku, input.name, input.description ?? null, input.hsnCode ?? null, input.unitPricePaise, input.weightG ?? null, input.lengthMm ?? null, input.widthMm ?? null, input.heightMm ?? null]);
      await audit(client, { sellerId: p.sellerId, actorUserId: p.userId, action: 'product.created', targetType: 'product', targetId: result.rows[0].id, requestId: request.id }); return result.rows[0];
    }); return reply.code(201).send(row);
  });
  app.get('/v1/orders', { preHandler: requireSeller }, async (request) => {
    const p = getPrincipal(request); return withSellerTransaction(p.sellerId, async (client) => ({ items: (await client.query(`SELECT o.*,w.name AS warehouse_name,w.pincode AS warehouse_pincode,c.full_name AS customer_name,c.city AS customer_city,c.pincode AS customer_pincode FROM orders o JOIN warehouses w ON w.id=o.warehouse_id JOIN customers c ON c.id=o.customer_id WHERE o.seller_id=$1 ORDER BY o.created_at DESC LIMIT 100`, [p.sellerId])).rows }));
  });
  app.get('/v1/orders/:orderId', { preHandler: requireSeller }, async (request) => {
    const p = getPrincipal(request); const orderId = uuid.parse((request.params as { orderId: string }).orderId);
    return withSellerTransaction(p.sellerId, async (client) => { const order = await client.query('SELECT * FROM orders WHERE id=$1 AND seller_id=$2', [orderId, p.sellerId]); if (!order.rows[0]) throw Object.assign(new Error('Order not found'), { statusCode: 404 }); const items = await client.query('SELECT * FROM order_items WHERE order_id=$1 ORDER BY created_at', [orderId]); return { ...order.rows[0], items: items.rows }; });
  });
  // One order in its own transaction. Shared by POST /v1/orders and POST /v1/orders/bulk, so both create orders exactly the same way.
  const createOrder = (p: ReturnType<typeof getPrincipal>, requestId: string, input: z.infer<typeof orderInput>) => withSellerTransaction(p.sellerId, async (client) => {
      const warehouse = await client.query('SELECT id FROM warehouses WHERE id=$1 AND seller_id=$2 AND is_active', [input.warehouseId, p.sellerId]); if (!warehouse.rows[0]) throw Object.assign(new Error('Active warehouse not found'), { statusCode: 422 });
      let customer = await client.query<{ id: string }>('SELECT id FROM customers WHERE seller_id=$1 AND phone=$2 AND pincode=$3 LIMIT 1', [p.sellerId, input.customer.phone, input.customer.pincode]);
      const c = input.customer;
      if (!customer.rows[0]) customer = await client.query<{ id: string }>(`INSERT INTO customers (seller_id,full_name,email,phone,address_line_1,address_line_2,city,state,pincode,company_name,alternate_phone,landmark) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`, [p.sellerId, c.fullName, c.email ?? null, c.phone, c.addressLine1, c.addressLine2 ?? null, c.city, c.state, c.pincode, c.companyName ?? null, c.alternatePhone ?? null, c.landmark ?? null]);
      const t = orderTotals(input); const ch = input.charges; const pk = input.package;
      // A cancelled order must not block its own number: shipments are one per order for good, so the cancelled record is kept (with its history)
      // under a "-CXL" suffix and the fresh order takes the number. Without this a re-upload of cancelled orders was answered "already exists".
      await client.query(`UPDATE orders SET order_number = order_number || '-CXL-' || left(id::text, 6), external_reference = CASE WHEN external_reference IN ($2, $3) THEN external_reference || '-CXL-' || left(id::text, 6) ELSE external_reference END, updated_at = now()
        WHERE seller_id = $1 AND state = 'cancelled' AND (order_number = $2 OR external_reference = $3)`, [p.sellerId, input.orderNumber, input.externalReference ?? input.orderNumber]);
      const result = await client.query(`INSERT INTO orders (seller_id,warehouse_id,customer_id,order_number,external_reference,order_flow,payment_mode,cod_amount_paise,subtotal_paise,total_weight_g,notes,state,package_length_mm,package_width_mm,package_height_mm,volumetric_weight_g,shipping_charges_paise,gift_wrap_paise,transaction_charges_paise,other_charges_paise,discount_paise,tax_rate_bps,tax_paise,total_paise) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'new',$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23) RETURNING *`, [p.sellerId, input.warehouseId, customer.rows[0].id, input.orderNumber, input.externalReference ?? input.orderNumber, input.orderFlow, input.paymentMode, input.codAmountPaise, t.subtotal, t.deadWeight, input.notes ?? null, pk.lengthMm ?? null, pk.widthMm ?? null, pk.heightMm ?? null, t.volumetric, ch.shippingPaise, ch.giftWrapPaise, ch.transactionPaise, ch.otherPaise, ch.discountPaise, ch.taxRateBps, t.tax, t.total]);
      if (input.channel !== 'single') { await client.query('UPDATE orders SET channel=$1 WHERE id=$2', [input.channel, result.rows[0].id]); result.rows[0].channel = input.channel; }
      await queueCodConfirmation(client, { sellerId: p.sellerId, orderId: result.rows[0].id, paymentMode: input.paymentMode, channel: input.channel, customerName: c.fullName, orderNumber: input.orderNumber });
      for (const item of input.items) await client.query('INSERT INTO order_items (order_id,product_id,sku,name,quantity,unit_price_paise,weight_g,hsn_code) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [result.rows[0].id, item.productId ?? null, item.sku, item.name, item.quantity, item.unitPricePaise, item.weightG, item.hsnCode ?? null]);
      await audit(client, { sellerId: p.sellerId, actorUserId: p.userId, action: 'order.created', targetType: 'order', targetId: result.rows[0].id, requestId: requestId, metadata: { orderNumber: input.orderNumber, itemCount: input.items.length } }); return result.rows[0];
  });
  // Set-based creation of many orders in ONE transaction: about a dozen statements for 50 orders instead of ~10 round trips per order (hosted Postgres
  // is ~150 ms away, so one order at a time made big sheets trickle in). Returns one entry per input, in order. Anything unusual (a rejected row, a
  // duplicate inside the batch, an order-number clash that is not a plain repeat) throws, and the caller falls back to the one-by-one path, which
  // reports each order's own error: the fast path can never change what a seller gets, only how quickly.
  const FALLBACK = Object.assign(new Error('batch fallback'), { fallback: true });
  const createOrdersBatch = (p: ReturnType<typeof getPrincipal>, requestId: string, inputs: z.infer<typeof orderInput>[]) => withSellerTransaction(p.sellerId, async (client) => {
    const numbers = inputs.map((i) => i.orderNumber); const refs = inputs.map((i) => i.externalReference ?? i.orderNumber);
    if (new Set(numbers).size !== numbers.length || new Set(refs).size !== refs.length) throw FALLBACK;
    const whIds = [...new Set(inputs.map((i) => i.warehouseId))];
    const wh = await client.query('SELECT id FROM warehouses WHERE seller_id=$1 AND is_active AND id = ANY($2::uuid[])', [p.sellerId, whIds]);
    if (wh.rowCount !== whIds.length) throw FALLBACK;
    const clash = await client.query<{ id: string; order_number: string; external_reference: string | null; state: string }>('SELECT id, order_number, external_reference, state FROM orders WHERE seller_id=$1 AND (order_number = ANY($2::text[]) OR external_reference = ANY($3::text[]))', [p.sellerId, numbers, refs]);
    const existingByNumber = new Map<string, string>(); const cancelled: string[] = [];
    for (const r of clash.rows) {
      if (r.state === 'cancelled') cancelled.push(r.id);
      else if (numbers.includes(r.order_number) && refs[numbers.indexOf(r.order_number)] === (r.external_reference ?? r.order_number)) existingByNumber.set(r.order_number, r.id);
      else throw FALLBACK;
    }
    if (cancelled.length) await client.query(`UPDATE orders SET order_number = order_number || '-CXL-' || left(id::text, 6), external_reference = CASE WHEN external_reference IS NULL THEN NULL ELSE external_reference || '-CXL-' || left(id::text, 6) END, updated_at = now() WHERE id = ANY($1::uuid[])`, [cancelled]);
    const fresh = inputs.filter((i) => !existingByNumber.has(i.orderNumber));
    const out = new Map<string, { id: string; existing: boolean }>();
    for (const [n, id] of existingByNumber) out.set(n, { id, existing: true });
    if (fresh.length) {
      const key = (phone: string, pin: string) => `${phone}|${pin}`;
      const distinct = new Map(fresh.map((i) => [key(i.customer.phone, i.customer.pincode), i.customer]));
      const customerIds = new Map<string, string>();
      const have = await client.query<{ id: string; phone: string; pincode: string }>('SELECT c.id, c.phone, c.pincode FROM customers c JOIN unnest($2::text[], $3::text[]) AS k(phone, pincode) ON c.phone = k.phone AND c.pincode = k.pincode WHERE c.seller_id = $1 ORDER BY c.created_at', [p.sellerId, [...distinct.values()].map((c) => c.phone), [...distinct.values()].map((c) => c.pincode)]);
      for (const r of have.rows) if (!customerIds.has(key(r.phone, r.pincode))) customerIds.set(key(r.phone, r.pincode), r.id);
      const missing = [...distinct.entries()].filter(([k]) => !customerIds.has(k)).map(([, c]) => ({ full_name: c.fullName, email: c.email ?? null, phone: c.phone, address_line_1: c.addressLine1, address_line_2: c.addressLine2 ?? null, city: c.city, state: c.state, pincode: c.pincode, company_name: c.companyName ?? null, alternate_phone: c.alternatePhone ?? null, landmark: c.landmark ?? null }));
      if (missing.length) {
        const made = await client.query<{ id: string; phone: string; pincode: string }>(`INSERT INTO customers (seller_id,full_name,email,phone,address_line_1,address_line_2,city,state,pincode,company_name,alternate_phone,landmark)
          SELECT $1, x.full_name, x.email, x.phone, x.address_line_1, x.address_line_2, x.city, x.state, x.pincode, x.company_name, x.alternate_phone, x.landmark
          FROM jsonb_to_recordset($2::jsonb) AS x(full_name text, email text, phone text, address_line_1 text, address_line_2 text, city text, state text, pincode text, company_name text, alternate_phone text, landmark text) RETURNING id, phone, pincode`, [p.sellerId, JSON.stringify(missing)]);
        for (const r of made.rows) customerIds.set(key(r.phone, r.pincode), r.id);
      }
      const rows = fresh.map((i) => {
        const t = orderTotals(i); const ch = i.charges; const pk = i.package;
        return { warehouse_id: i.warehouseId, customer_id: customerIds.get(key(i.customer.phone, i.customer.pincode)), order_number: i.orderNumber, external_reference: i.externalReference ?? i.orderNumber, order_flow: i.orderFlow, payment_mode: i.paymentMode, cod_amount_paise: i.codAmountPaise, subtotal_paise: t.subtotal, total_weight_g: t.deadWeight, notes: i.notes ?? null, channel: i.channel, pl: pk.lengthMm ?? null, pw: pk.widthMm ?? null, ph: pk.heightMm ?? null, vol: t.volumetric, ship: ch.shippingPaise, gift: ch.giftWrapPaise, txn: ch.transactionPaise, other: ch.otherPaise, disc: ch.discountPaise, tax_bps: ch.taxRateBps, tax: t.tax, total: t.total };
      });
      const created = await client.query<{ id: string; order_number: string }>(`INSERT INTO orders (seller_id,warehouse_id,customer_id,order_number,external_reference,order_flow,payment_mode,cod_amount_paise,subtotal_paise,total_weight_g,notes,state,channel,package_length_mm,package_width_mm,package_height_mm,volumetric_weight_g,shipping_charges_paise,gift_wrap_paise,transaction_charges_paise,other_charges_paise,discount_paise,tax_rate_bps,tax_paise,total_paise)
        SELECT $1, x.warehouse_id, x.customer_id, x.order_number, x.external_reference, x.order_flow, x.payment_mode::payment_mode, x.cod_amount_paise, x.subtotal_paise, x.total_weight_g, x.notes, 'new'::order_state, x.channel, x.pl, x.pw, x.ph, x.vol, x.ship, x.gift, x.txn, x.other, x.disc, x.tax_bps, x.tax, x.total
        FROM jsonb_to_recordset($2::jsonb) AS x(warehouse_id uuid, customer_id uuid, order_number text, external_reference text, order_flow text, payment_mode text, cod_amount_paise int, subtotal_paise int, total_weight_g int, notes text, channel text, pl int, pw int, ph int, vol int, ship int, gift int, txn int, other int, disc int, tax_bps int, tax int, total int) RETURNING id, order_number`, [p.sellerId, JSON.stringify(rows)]);
      if (created.rowCount !== fresh.length) throw FALLBACK;
      const idOf = new Map(created.rows.map((r) => [r.order_number, r.id]));
      const items = fresh.flatMap((i) => i.items.map((it) => ({ order_id: idOf.get(i.orderNumber), product_id: it.productId ?? null, sku: it.sku, name: it.name, quantity: it.quantity, unit_price_paise: it.unitPricePaise, weight_g: it.weightG, hsn_code: it.hsnCode ?? null })));
      await client.query(`INSERT INTO order_items (order_id,product_id,sku,name,quantity,unit_price_paise,weight_g,hsn_code)
        SELECT x.order_id, x.product_id, x.sku, x.name, x.quantity, x.unit_price_paise, x.weight_g, x.hsn_code FROM jsonb_to_recordset($1::jsonb) AS x(order_id uuid, product_id uuid, sku text, name text, quantity int, unit_price_paise int, weight_g int, hsn_code text)`, [JSON.stringify(items)]);
      if (fresh.some((i) => i.paymentMode === 'cod')) for (const i of fresh) await queueCodConfirmation(client, { sellerId: p.sellerId, orderId: idOf.get(i.orderNumber)!, paymentMode: i.paymentMode, channel: i.channel, customerName: i.customer.fullName, orderNumber: i.orderNumber });
      await client.query(`INSERT INTO audit_events (seller_id, actor_user_id, action, target_type, target_id, request_id, metadata)
        SELECT $1, $2, 'order.created', 'order', x.id, $3, jsonb_build_object('orderNumber', x.order_number, 'itemCount', x.item_count) FROM jsonb_to_recordset($4::jsonb) AS x(id text, order_number text, item_count int)`,
        [p.sellerId, p.userId, requestId, JSON.stringify(fresh.map((i) => ({ id: idOf.get(i.orderNumber), order_number: i.orderNumber, item_count: i.items.length })))]);
      for (const i of fresh) out.set(i.orderNumber, { id: idOf.get(i.orderNumber)!, existing: false });
    }
    return inputs.map((i) => out.get(i.orderNumber)!);
  });
  app.post('/v1/orders', { preHandler: requireSeller }, async (request, reply) => {
    const input = orderInput.parse(request.body);
    return reply.code(201).send(await createOrder(getPrincipal(request), request.id, input));
  });
  // Bulk upload: up to 50 orders per request instead of one request per order (the API allows 300 requests a minute, so a 5,000-order sheet
  // would otherwise take more than 15 minutes). Each order is validated and saved on its own: one bad order never blocks the others.
  app.post('/v1/orders/bulk', { preHandler: requireSeller }, async (request) => {
    const { orders } = z.object({ orders: z.array(z.unknown()).min(1).max(50) }).parse(request.body);
    const p = getPrincipal(request);
    const results: { index: number; ok: boolean; id?: string; existing?: boolean; error?: string }[] = [];
    // Fast path: when every order in the request is valid, create them all in one set-based transaction. If anything in it is refused nothing was saved
    // (one transaction) and the orders go through the one-by-one path below, which reports each order's own result.
    const parsedAll = orders.map((raw) => orderInput.safeParse(raw));
    if (parsedAll.every((x) => x.success)) {
      try {
        const made = await createOrdersBatch(p, request.id, parsedAll.map((x) => (x as { data: z.infer<typeof orderInput> }).data));
        const fast = made.map((m, index) => ({ index, ok: true, id: m.id, existing: m.existing || undefined }));
        return { results: fast, created: made.filter((m) => !m.existing).length, existing: made.filter((m) => m.existing).length, failed: 0 };
      } catch (error) { if (!(error as { fallback?: boolean }).fallback) request.log.warn({ err: error }, 'bulk batch refused, creating one by one'); }
    }
    for (const [index, raw] of orders.entries()) {
      const parsed = orderInput.safeParse(raw);
      if (!parsed.success) { const issue = parsed.error.issues[0]; results.push({ index, ok: false, error: `${issue.path.join('.') || 'order'}: ${issue.message}` }); continue; }
      try { results.push({ index, ok: true, id: (await createOrder(p, request.id, parsed.data)).id as string }); }
      catch (error) {
        const e = error as { code?: string; statusCode?: number; message?: string };
        // Re-uploading a sheet that was only partly created is safe: an order number that already exists is reported as such (with its id), not as a failure.
        if (e.code === '23505') {
          const existing = await withSellerTransaction(p.sellerId, (client) => client.query<{ id: string }>('SELECT id FROM orders WHERE seller_id=$1 AND order_number=$2 LIMIT 1', [p.sellerId, parsed.data.orderNumber])).catch(() => null);
          if (existing?.rows[0]) results.push({ index, ok: true, existing: true, id: existing.rows[0].id });
          else results.push({ index, ok: false, error: 'This order number already exists' });
        }
        else if (e.code === '23514' || (e.statusCode && e.statusCode < 500)) results.push({ index, ok: false, error: e.message || 'The order could not be created' });
        else { request.log.error(error); results.push({ index, ok: false, error: 'The order could not be created. Try again' }); }
      }
    }
    return { results, created: results.filter((r) => r.ok && !r.existing).length, existing: results.filter((r) => r.existing).length, failed: results.filter((r) => !r.ok).length };
  });
  // Rectify an order that never got a courier (Track > Failed): consignee, payment and parcel can change until a shipment exists.
  app.patch('/v1/orders/:orderId/details', { preHandler: requireSeller }, async (request) => {
    const p = getPrincipal(request); const orderId = uuid.parse((request.params as { orderId: string }).orderId);
    const input = z.object({
      customer: consignee, paymentMode: z.enum(['prepaid', 'cod']), codAmountPaise: paise.default(0),
      package: z.object({ weightG: z.number().int().min(1).max(500_000), lengthMm: z.number().int().min(10).max(5_000), widthMm: z.number().int().min(10).max(5_000), heightMm: z.number().int().min(10).max(5_000) }),
    }).superRefine((v, ctx) => {
      if (v.paymentMode === 'cod' && v.codAmountPaise <= 0) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'COD orders require a positive COD amount', path: ['codAmountPaise'] });
      if (v.paymentMode === 'prepaid' && v.codAmountPaise !== 0) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Prepaid orders cannot have a COD amount', path: ['codAmountPaise'] });
    }).parse(request.body);
    return withSellerTransaction(p.sellerId, async (client) => {
      const order = (await client.query<{ state: string; total_paise: string; shipments: string }>('SELECT o.state::text, o.total_paise, (SELECT count(*) FROM shipments s WHERE s.order_id=o.id) AS shipments FROM orders o WHERE o.id=$1 AND o.seller_id=$2 FOR UPDATE', [orderId, p.sellerId])).rows[0];
      if (!order) throw Object.assign(new Error('Order not found'), { statusCode: 404 });
      if (Number(order.shipments) > 0 || !['new', 'ready_to_ship'].includes(order.state)) throw Object.assign(new Error('Only orders without a courier can be edited'), { statusCode: 409 });
      if (input.paymentMode === 'cod' && input.codAmountPaise > Number(order.total_paise)) throw Object.assign(new Error('COD amount cannot exceed the order total'), { statusCode: 422 });
      const c = input.customer;
      await checkLocation(client, c.pincode, c.state);
      let customer = await client.query<{ id: string }>('SELECT id FROM customers WHERE seller_id=$1 AND phone=$2 AND pincode=$3 AND full_name=$4 AND address_line_1=$5 LIMIT 1', [p.sellerId, c.phone, c.pincode, c.fullName, c.addressLine1]);
      if (!customer.rows[0]) customer = await client.query<{ id: string }>(`INSERT INTO customers (seller_id,full_name,email,phone,address_line_1,address_line_2,city,state,pincode,company_name,alternate_phone,landmark) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`, [p.sellerId, c.fullName, c.email ?? null, c.phone, c.addressLine1, c.addressLine2 ?? null, c.city, c.state, c.pincode, c.companyName ?? null, c.alternatePhone ?? null, c.landmark ?? null]);
      const pk = input.package;
      const updated = await client.query('UPDATE orders SET customer_id=$3, payment_mode=$4, cod_amount_paise=$5, total_weight_g=$6, package_length_mm=$7, package_width_mm=$8, package_height_mm=$9, volumetric_weight_g=$10, updated_at=now() WHERE id=$1 AND seller_id=$2 RETURNING *',
        [orderId, p.sellerId, customer.rows[0].id, input.paymentMode, input.codAmountPaise, pk.weightG, pk.lengthMm, pk.widthMm, pk.heightMm, volumetricWeightG(pk.lengthMm, pk.widthMm, pk.heightMm)]);
      await audit(client, { sellerId: p.sellerId, actorUserId: p.userId, action: 'order.corrected', targetType: 'order', targetId: orderId, requestId: request.id });
      return updated.rows[0];
    });
  });
  app.patch('/v1/orders/:orderId/state',{ preHandler: requireSeller }, async (request) => {
    const p = getPrincipal(request); const orderId = uuid.parse((request.params as { orderId: string }).orderId); const { state } = z.object({ state: z.enum(['draft', 'new', 'ready_to_ship', 'booked', 'cancelled', 'returned']) }).parse(request.body);
    return withSellerTransaction(p.sellerId, async (client) => { const current = await client.query<{ state: string }>('SELECT state FROM orders WHERE id=$1 AND seller_id=$2 FOR UPDATE', [orderId, p.sellerId]); if (!current.rows[0]) throw Object.assign(new Error('Order not found'), { statusCode: 404 }); if (!transitions[current.rows[0].state].includes(state)) throw Object.assign(new Error(`Cannot transition order from ${current.rows[0].state} to ${state}`), { statusCode: 409 }); const updated = await client.query(`UPDATE orders SET state=$1::order_state,cancelled_at=CASE WHEN $1::order_state='cancelled'::order_state THEN now() ELSE cancelled_at END,updated_at=now() WHERE id=$2 RETURNING *`, [state, orderId]); await audit(client, { sellerId: p.sellerId, actorUserId: p.userId, action: 'order.state_changed', targetType: 'order', targetId: orderId, requestId: request.id, metadata: { from: current.rows[0].state, to: state } }); return updated.rows[0]; });
  });
}
