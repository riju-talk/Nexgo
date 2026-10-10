import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { PoolClient } from 'pg';
import { withSellerTransaction } from '../db/client.js';
import { audit } from '../lib/audit.js';
import { calculateRate, paiseToAmount } from '../lib/money.js';
import { laneZone } from '../lib/zone.js';
import { requireSeller } from './seller.js';
import { ensurePrivateBucket, storage } from '../lib/storage.js';
import { config } from '../config.js';
import { courierAdapter } from '../couriers/registry.js';

const uuid = z.string().uuid();
const bookingInput = z.object({ orderId: uuid, providerCode: z.string().regex(/^[a-z0-9-]{2,64}$/), serviceCode: z.string().regex(/^[a-z0-9-]{2,64}$/) });
function principal(request: FastifyRequest) { if (!request.principal) throw Object.assign(new Error('Authentication required'), { statusCode: 401 }); return request.principal; }

type Rate = { provider_id: string; provider_code: string; provider_name: string; service_id: string; service_code: string; service_name: string; base_weight_g: number; base_price_paise: number; additional_weight_g: number; additional_price_paise: number; cod_fee_paise: number; fuel_surcharge_bps: number; cod_percent_bps: number; rto_base_price_paise: number | null; rto_additional_price_paise: number | null; payment_mode: 'prepaid' | 'cod'; cod_amount_paise: number; total_weight_g: number; destination_pincode: string };

// One booking, inside the caller's seller transaction (wallet-checked, idempotent on the key).
async function bookInTx(client: PoolClient, p: ReturnType<typeof principal>, requestId: string, input: z.infer<typeof bookingInput>, key: string) {
    const previous = await client.query('SELECT * FROM shipments WHERE seller_id=$1 AND idempotency_key=$2', [p.sellerId, key]); if (previous.rows[0]) return { shipment: previous.rows[0], replay: true };
    const lane = await client.query<{ wc: string; ws: string; cc: string; cs: string }>(`SELECT w.city AS wc, w.state AS ws, COALESCE(p.city, c.city) AS cc, COALESCE(p.state, c.state) AS cs FROM orders o JOIN warehouses w ON w.id=o.warehouse_id JOIN customers c ON c.id=o.customer_id LEFT JOIN pincodes p ON p.pincode=c.pincode WHERE o.id=$1 AND o.seller_id=$2`, [input.orderId, p.sellerId]);
    const zone = lane.rows[0] ? laneZone({ city: lane.rows[0].wc, state: lane.rows[0].ws }, { city: lane.rows[0].cc, state: lane.rows[0].cs }) : 'rest_of_india';
    const rate = await client.query<Rate>(`SELECT cp.id AS provider_id,cp.code AS provider_code,cp.name AS provider_name,cs.id AS service_id,cs.code AS service_code,cs.display_name AS service_name,rcr.base_weight_g,rcr.base_price_paise,rcr.additional_weight_g,rcr.additional_price_paise,rcr.cod_fee_paise,rcr.fuel_surcharge_bps,rcr.cod_percent_bps,rcr.rto_base_price_paise,rcr.rto_additional_price_paise,o.payment_mode,o.cod_amount_paise,GREATEST(o.total_weight_g,o.volumetric_weight_g) AS total_weight_g,c.pincode AS destination_pincode FROM orders o JOIN customers c ON c.id=o.customer_id JOIN seller_courier_access sca ON sca.seller_id=o.seller_id AND sca.state='enabled' JOIN courier_services cs ON cs.id=sca.service_id AND cs.is_active JOIN courier_providers cp ON cp.id=cs.provider_id AND cp.integration_state='live' JOIN LATERAL (SELECT id FROM rate_cards WHERE seller_id=o.seller_id AND state='active' AND effective_from<=now() AND (effective_to IS NULL OR effective_to>now()) ORDER BY effective_from DESC LIMIT 1) card ON true JOIN rate_card_rates rcr ON rcr.rate_card_id=card.id AND rcr.service_id=cs.id AND rcr.zone_code IN ($5,'national') AND rcr.min_weight_g<=GREATEST(o.total_weight_g,o.volumetric_weight_g) WHERE o.id=$1 AND o.seller_id=$2 AND o.state='ready_to_ship' AND cp.code=$3 AND cs.code=$4 AND (o.payment_mode='prepaid' OR sca.cod_enabled=true) AND NOT EXISTS (SELECT 1 FROM courier_pincode_rules blocked WHERE blocked.service_id=cs.id AND blocked.rule_type='blocked' AND c.pincode LIKE blocked.destination_prefix || '%') AND (NOT EXISTS (SELECT 1 FROM courier_pincode_rules allowed WHERE allowed.service_id=cs.id AND allowed.rule_type='allowed') OR EXISTS (SELECT 1 FROM courier_pincode_rules allowed WHERE allowed.service_id=cs.id AND allowed.rule_type='allowed' AND c.pincode LIKE allowed.destination_prefix || '%')) ORDER BY (rcr.zone_code=$5) DESC, rcr.min_weight_g DESC LIMIT 1`, [input.orderId, p.sellerId, input.providerCode, input.serviceCode, zone]);
    const selection = rate.rows[0]; if (!selection) throw Object.assign(new Error('The selected courier service is not available for this ready-to-ship order'), { statusCode: 422 });
    const pinLane = (await client.query<{ is_oda: boolean; cod_available: boolean; serves_oda: boolean }>(`SELECT p.is_oda, p.cod_available, cs.serves_oda FROM courier_services cs LEFT JOIN pincodes p ON p.pincode=$1 WHERE cs.id=$2`, [selection.destination_pincode, selection.service_id])).rows[0];
    if (pinLane?.is_oda && !pinLane.serves_oda) throw Object.assign(new Error('This courier does not deliver to this pincode (out of delivery area). Choose another courier.'), { statusCode: 422 });
    if (selection.payment_mode === 'cod' && pinLane && pinLane.cod_available === false) throw Object.assign(new Error('Cash on delivery is not available at this pincode. Switch the order to prepaid or choose another courier.'), { statusCode: 422 });
    const price = calculateRate(selection, selection.total_weight_g || 1, selection.payment_mode === 'cod', selection.cod_amount_paise || 0);
    // Wallet writes for one seller are serialised so two concurrent bookings cannot both pass the balance check.
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))', [`wallet:${p.sellerId}`]);
    const balance = await client.query<{ balance_paise: string }>(`SELECT COALESCE(SUM(CASE WHEN entry_type IN ('credit','release') THEN amount_paise WHEN entry_type IN ('debit','hold') THEN -amount_paise ELSE amount_paise END),0)::bigint AS balance_paise FROM wallet_entries WHERE seller_id=$1`, [p.sellerId]);
    if (Number(balance.rows[0].balance_paise) < price.totalPaise) throw Object.assign(new Error('Insufficient wallet balance. Recharge your wallet to book this shipment.'), { statusCode: 402 });
    const providerBooking = await courierAdapter(selection.provider_code).book({ reference: input.orderId, destinationPincode: selection.destination_pincode, weightG: Math.max(selection.total_weight_g, 1), paymentMode: selection.payment_mode, codAmountPaise: selection.payment_mode === 'cod' ? selection.cod_amount_paise : 0 });
    const shipment = await client.query(`INSERT INTO shipments (seller_id,order_id,provider_id,service_id,awb,chargeable_weight_g,shipping_charge_paise,quote_snapshot,idempotency_key,destination_pincode,destination_city,promised_delivery_at) SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,cu.pincode,cu.city,now()+interval '5 days' FROM orders o JOIN customers cu ON cu.id=o.customer_id WHERE o.id=$2 RETURNING *`, [p.sellerId, input.orderId, selection.provider_id, selection.service_id, providerBooking.awb, Math.max(selection.total_weight_g, 1), price.totalPaise, JSON.stringify({ provider: selection.provider_code, providerShipmentId: providerBooking.providerShipmentId, service: selection.service_code, destinationPincode: selection.destination_pincode, paymentMode: selection.payment_mode, price }), key]);
    await client.query("UPDATE orders SET state='booked',updated_at=now() WHERE id=$1", [input.orderId]);
    await client.query("INSERT INTO shipment_events (shipment_id,state,occurred_at,description,source) VALUES ($1,'booked',now(),'Shipment booked successfully','booking')", [shipment.rows[0].id]);
    await client.query(`INSERT INTO wallet_entries (seller_id,entry_type,amount_paise,reference_type,reference_id,idempotency_key,description)
      VALUES ($1,'debit',$2,'shipment',$3,$4,$5)`, [p.sellerId, price.totalPaise, shipment.rows[0].id, `shipment-booking:${key}`, `Shipping charge for ${shipment.rows[0].awb}`]);
    await audit(client, { sellerId: p.sellerId, actorUserId: p.userId, action: 'shipment.booked', targetType: 'shipment', targetId: shipment.rows[0].id, requestId, metadata: { orderId: input.orderId, awb: shipment.rows[0].awb, amount: paiseToAmount(price.totalPaise) } }); return { shipment: shipment.rows[0], replay: false };
}

export async function shipmentRoutes(app: FastifyInstance) {
  // Seller shipment register: everything the Track page filters, groups and exports on, in one round trip.
  app.get('/v1/shipments', { preHandler: requireSeller }, async (request) => {
    const p = principal(request);
    return withSellerTransaction(p.sellerId, async (client) => ({ items: (await client.query(
      `SELECT s.*, o.order_number, o.nexgo_order_id, o.channel, o.payment_mode, o.cod_amount_paise, o.subtotal_paise, o.total_weight_g, o.order_flow, o.created_at AS order_created_at,
              c.full_name AS customer_name, c.phone AS customer_phone, c.city AS customer_city, c.pincode AS customer_pincode,
              cp.name AS courier_name, cs.display_name AS service_name, cs.service_type,
              w.name AS warehouse_name, w.pincode AS warehouse_pincode, w.city AS warehouse_city,
              it.products, it.quantity, it.product_names,
              ev.description AS last_description, ev.location AS last_location, ev.occurred_at AS last_event_at
       FROM shipments s
       JOIN orders o ON o.id=s.order_id JOIN customers c ON c.id=o.customer_id JOIN warehouses w ON w.id=o.warehouse_id
       JOIN courier_providers cp ON cp.id=s.provider_id JOIN courier_services cs ON cs.id=s.service_id
       LEFT JOIN LATERAL (SELECT count(*)::int AS products, COALESCE(sum(quantity),0)::int AS quantity, string_agg(name, ', ' ORDER BY name) AS product_names FROM order_items WHERE order_id=o.id) it ON true
       LEFT JOIN LATERAL (SELECT description, location, occurred_at FROM shipment_events WHERE shipment_id=s.id ORDER BY occurred_at DESC LIMIT 1) ev ON true
       WHERE s.seller_id=$1 ORDER BY s.created_at DESC LIMIT 500`, [p.sellerId])).rows,
      // Orders that never got a courier (booking failed, or no courier could be assigned): the "Failed" tab, to fix and re-assign.
      failed: (await client.query(
      `SELECT o.id, o.order_number, o.nexgo_order_id, o.channel, o.state AS order_state, o.payment_mode, o.cod_amount_paise, o.subtotal_paise, o.total_weight_g, o.created_at,
              c.full_name AS customer_name, c.phone AS customer_phone, c.city AS customer_city, c.pincode AS customer_pincode,
              w.name AS warehouse_name, w.pincode AS warehouse_pincode, w.city AS warehouse_city,
              it.quantity, it.product_names
       FROM orders o JOIN customers c ON c.id=o.customer_id JOIN warehouses w ON w.id=o.warehouse_id
       LEFT JOIN LATERAL (SELECT COALESCE(sum(quantity),0)::int AS quantity, string_agg(name, ', ' ORDER BY name) AS product_names FROM order_items WHERE order_id=o.id) it ON true
       WHERE o.seller_id=$1 AND o.state IN ('new','ready_to_ship') AND o.order_flow <> 'reverse' AND NOT EXISTS (SELECT 1 FROM shipments s WHERE s.order_id=o.id)
       ORDER BY o.created_at DESC LIMIT 500`, [p.sellerId])).rows }));
  });
  // Everything the printable shipping label and tax invoice need, for up to 100 shipments at once (see /documents/label and /documents/invoice).
  // Assigns the order's invoice number on first use.
  app.get('/v1/shipments/documents', { preHandler: requireSeller }, async (request) => {
    const p = principal(request);
    const { ids } = z.object({ ids: z.string().max(4000) }).parse(request.query);
    const shipmentIds = z.array(uuid).min(1).max(100).parse([...new Set(ids.split(',').map((v) => v.trim()).filter(Boolean))]);
    return withSellerTransaction(p.sellerId, async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))', [`invoice:${p.sellerId}`]);
      await client.query(`UPDATE orders o SET invoice_seq = n.seq FROM (
          SELECT o2.id, (SELECT COALESCE(max(invoice_seq), 0) FROM orders WHERE seller_id=$1) + row_number() OVER (ORDER BY o2.created_at, o2.id) AS seq
          FROM orders o2 JOIN shipments s ON s.order_id=o2.id WHERE s.id = ANY($2::uuid[]) AND s.seller_id=$1 AND o2.invoice_seq IS NULL) n WHERE o.id = n.id`, [p.sellerId, shipmentIds]);
      const rows = await client.query(
        `SELECT s.id, s.awb, s.state, s.booked_at, s.chargeable_weight_g, cp.name AS courier_name, cs.display_name AS service_name,
                o.order_number, o.nexgo_order_id, o.created_at AS order_date, o.invoice_seq, o.payment_mode, o.cod_amount_paise, o.subtotal_paise, o.total_paise, o.tax_rate_bps, o.tax_paise,
                o.shipping_charges_paise, o.transaction_charges_paise, o.gift_wrap_paise, o.other_charges_paise, o.discount_paise, o.total_weight_g,
                o.package_length_mm, o.package_width_mm, o.package_height_mm,
                c.full_name AS customer_name, c.phone AS customer_phone, c.address_line_1, c.address_line_2, c.landmark, c.city AS customer_city, c.state AS customer_state, c.pincode AS customer_pincode,
                w.name AS warehouse_name, w.contact_name, w.phone AS warehouse_phone, w.email AS warehouse_email, w.address_line_1 AS wh_line_1, w.address_line_2 AS wh_line_2, w.city AS wh_city, w.state AS wh_state, w.pincode AS wh_pincode,
                sl.legal_name AS seller_name, k.gstin AS seller_gstin, k.registered_address AS seller_address,
                (SELECT COALESCE(json_agg(json_build_object('sku', i.sku, 'name', i.name, 'hsn', i.hsn_code, 'quantity', i.quantity, 'unitPricePaise', i.unit_price_paise) ORDER BY i.created_at), '[]'::json) FROM order_items i WHERE i.order_id = o.id) AS items
         FROM shipments s JOIN orders o ON o.id=s.order_id JOIN customers c ON c.id=o.customer_id JOIN warehouses w ON w.id=o.warehouse_id
         JOIN courier_providers cp ON cp.id=s.provider_id JOIN courier_services cs ON cs.id=s.service_id JOIN sellers sl ON sl.id=s.seller_id LEFT JOIN seller_kyc k ON k.seller_id=s.seller_id
         WHERE s.seller_id=$1 AND s.id = ANY($2::uuid[])`, [p.sellerId, shipmentIds]);
      const order = new Map(shipmentIds.map((id, i) => [id, i]));
      return { items: rows.rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)) };
    });
  });
  // Tags: distinct list for filters, and bulk add/remove on selected shipments.
  app.get('/v1/shipments/tags', { preHandler: requireSeller }, async (request) => {
    const p = principal(request);
    return withSellerTransaction(p.sellerId, async (client) => ({ items: (await client.query<{ tag: string }>('SELECT DISTINCT unnest(tags) AS tag FROM shipments WHERE seller_id=$1 ORDER BY 1', [p.sellerId])).rows.map((r) => r.tag) }));
  });
  app.post('/v1/shipments/tags', { preHandler: requireSeller }, async (request) => {
    const p = principal(request);
    const tag = z.string().trim().min(1).max(30).regex(/^[a-zA-Z0-9 _-]+$/, 'Tags can use letters, numbers, spaces, - and _');
    const input = z.object({ shipmentIds: z.array(uuid).min(1).max(500), add: z.array(tag).max(10).default([]), remove: z.array(tag).max(10).default([]) }).parse(request.body);
    const add = input.add.map((t) => t.toLowerCase()); const remove = input.remove.map((t) => t.toLowerCase());
    return withSellerTransaction(p.sellerId, async (client) => {
      const r = await client.query(`UPDATE shipments SET tags = (SELECT COALESCE(array_agg(DISTINCT t ORDER BY t), '{}') FROM unnest(tags || $3::text[]) t WHERE t <> ALL($4::text[])), updated_at=now() WHERE seller_id=$1 AND id = ANY($2::uuid[]) RETURNING id, tags`, [p.sellerId, input.shipmentIds, add, remove]);
      return { updated: r.rowCount, items: r.rows };
    });
  });
  app.get('/v1/shipments/:shipmentId', { preHandler: requireSeller }, async (request) => {
    const p = principal(request); const shipmentId = uuid.parse((request.params as { shipmentId: string }).shipmentId);
    return withSellerTransaction(p.sellerId, async (client) => { const shipment = await client.query('SELECT * FROM shipments WHERE id=$1 AND seller_id=$2', [shipmentId, p.sellerId]); if (!shipment.rows[0]) throw Object.assign(new Error('Shipment not found'), { statusCode: 404 }); const events = await client.query('SELECT state,occurred_at,location,description,source FROM shipment_events WHERE shipment_id=$1 ORDER BY occurred_at DESC', [shipmentId]); return { ...shipment.rows[0], events: events.rows }; });
  });
  app.post('/v1/shipments/book', { preHandler: requireSeller }, async (request, reply) => {
    const input = bookingInput.parse(request.body); const p = principal(request); const key = request.headers['idempotency-key'];
    if (typeof key !== 'string' || key.length < 16 || key.length > 200) throw Object.assign(new Error('A 16-200 character Idempotency-Key header is required'), { statusCode: 400 });
    const result = await withSellerTransaction(p.sellerId, (client) => bookInTx(client, p, request.id, input, key));
    return reply.code(result.replay ? 200 : 201).send(result);
  });
  // Courier allocation by the seller's priority list (Settings > Courier rules: priority 1, 2, 3 ...). For each order the first courier
  // service that is serviceable and bookable wins; unlisted couriers are tried last. Orders nobody can take come back with the reason.
  app.post('/v1/shipments/auto-assign', { preHandler: requireSeller }, async (request) => {
    const { orderIds } = z.object({ orderIds: z.array(uuid).min(1).max(100) }).parse(request.body);
    const p = principal(request);
    const prefs = await withSellerTransaction(p.sellerId, async (client) => (await client.query<{ rules: Record<string, unknown> | null }>(`SELECT preferences->'courier-rules' AS rules FROM seller_preferences WHERE seller_id = $1`, [p.sellerId])).rows[0]?.rules ?? {});
    const priority = [1, 2, 3, 4, 5, 6].map((n) => String(prefs[`priority${n}`] ?? '').toLowerCase().replace(/[^a-z]/g, '')).filter((x) => x && x !== 'notset');
    const rank = (name: string, code: string) => { const key = `${name}${code}`.toLowerCase().replace(/[^a-z]/g, ''); const i = priority.findIndex((x) => key.includes(x) || (x === 'xb' && key.includes('xpressbees'))); return i < 0 ? priority.length : i; };
    const results: { orderId: string; ok: boolean; awb?: string; courier?: string; error?: string }[] = [];
    for (const orderId of orderIds) {
      try {
        const out = await withSellerTransaction(p.sellerId, async (client) => {
          const order = await client.query<{ state: string }>('SELECT state::text FROM orders WHERE id = $1 AND seller_id = $2 FOR UPDATE', [orderId, p.sellerId]);
          if (!order.rows[0]) return { ok: false, error: 'Order not found' };
          if (order.rows[0].state === 'booked') return { ok: false, error: 'Already assigned to a courier' };
          if (!['new', 'ready_to_ship'].includes(order.rows[0].state)) return { ok: false, error: `Order is ${order.rows[0].state}` };
          if (order.rows[0].state === 'new') await client.query(`UPDATE orders SET state = 'ready_to_ship', updated_at = now() WHERE id = $1`, [orderId]);
          const services = await client.query<{ pcode: string; pname: string; scode: string }>(
            `SELECT cp.code AS pcode, cp.name AS pname, cs.code AS scode FROM seller_courier_access sca JOIN courier_services cs ON cs.id = sca.service_id AND cs.is_active JOIN courier_providers cp ON cp.id = cs.provider_id AND cp.integration_state = 'live' WHERE sca.seller_id = $1 ORDER BY cp.name, cs.display_name`, [p.sellerId]);
          const ordered = services.rows.sort((a, b) => rank(a.pname, a.pcode) - rank(b.pname, b.pcode));
          if (!ordered.length) return { ok: false, error: 'No courier is enabled for this account' };
          let lastError = 'No serviceable courier for this order';
          for (const c of ordered) {
            await client.query('SAVEPOINT try_courier');
            try {
              const booked = await bookInTx(client, p, request.id, { orderId, providerCode: c.pcode, serviceCode: c.scode }, `auto-assign:${orderId}:${c.pcode}:${c.scode}`);
              await client.query('RELEASE SAVEPOINT try_courier');
              return { ok: true, awb: booked.shipment.awb as string, courier: c.pname };
            } catch (e) {
              await client.query('ROLLBACK TO SAVEPOINT try_courier');
              const status = (e as { statusCode?: number }).statusCode;
              lastError = (e as Error).message || lastError;
              if (status === 402) return { ok: false, error: lastError }; // wallet short: no point trying other couriers
              if (status !== 422) throw e;
            }
          }
          return { ok: false, error: lastError };
        });
        results.push({ orderId, ...out });
      } catch (e) { results.push({ orderId, ok: false, error: (e as Error).message || 'Could not assign a courier' }); }
    }
    return { results, assigned: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length };
  });
  // Cancel before pickup: the courier booking is cancelled and the exact wallet debit taken at booking is credited back (once).
  app.post('/v1/shipments/:shipmentId/cancel', { preHandler: requireSeller }, async (request) => {
    const p = principal(request); const shipmentId = uuid.parse((request.params as { shipmentId: string }).shipmentId);
    return withSellerTransaction(p.sellerId, async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))', [`wallet:${p.sellerId}`]);
      const found = await client.query<{ id: string; awb: string; state: string; order_id: string; code: string }>(`SELECT s.id, s.awb, s.state::text, s.order_id, cp.code FROM shipments s JOIN courier_providers cp ON cp.id = s.provider_id WHERE s.id = $1 AND s.seller_id = $2 FOR UPDATE OF s`, [shipmentId, p.sellerId]);
      const row = found.rows[0];
      if (!row) throw Object.assign(new Error('Shipment not found'), { statusCode: 404 });
      if (row.state === 'cancelled') return { id: row.id, state: 'cancelled', refundedPaise: 0, replay: true };
      if (!['booked', 'pickup_pending', 'pickup_scheduled'].includes(row.state)) throw Object.assign(new Error('Only shipments that have not been picked up can be cancelled'), { statusCode: 409 });
      await courierAdapter(row.code).cancel(row.awb);
      await client.query(`UPDATE shipments SET state = 'cancelled', cancelled_at = now(), updated_at = now() WHERE id = $1`, [row.id]);
      await client.query(`UPDATE orders SET state = 'cancelled', updated_at = now() WHERE id = $1`, [row.order_id]);
      await client.query(`INSERT INTO shipment_events (shipment_id, state, occurred_at, description, source) VALUES ($1, 'cancelled', now(), 'Shipment cancelled by seller', 'manual')`, [row.id]);
      const debit = await client.query<{ amount_paise: string }>(`SELECT COALESCE(SUM(amount_paise), 0)::bigint AS amount_paise FROM wallet_entries WHERE seller_id = $1 AND reference_type = 'shipment' AND reference_id = $2 AND entry_type = 'debit'`, [p.sellerId, row.id]);
      const refund = Number(debit.rows[0].amount_paise);
      if (refund > 0) await client.query(`INSERT INTO wallet_entries (seller_id, entry_type, amount_paise, reference_type, reference_id, idempotency_key, description) VALUES ($1, 'credit', $2, 'shipment_cancel', $3, $4, $5) ON CONFLICT DO NOTHING`, [p.sellerId, refund, row.id, `shipment-cancel:${row.id}`, `Refund for cancelled shipment ${row.awb}`]);
      await audit(client, { sellerId: p.sellerId, actorUserId: p.userId, action: 'shipment.cancelled', targetType: 'shipment', targetId: row.id, requestId: request.id, metadata: { awb: row.awb, refundedPaise: refund } });
      return { id: row.id, state: 'cancelled', refundedPaise: refund };
    });
  });
  app.post('/v1/shipments/:shipmentId/label',{ preHandler: requireSeller }, async (request, reply) => {
    if (!config.STORAGE_ENABLED) return reply.code(501).send({ error: 'FILE_STORAGE_NOT_CONNECTED', message: 'File storage is not connected yet; this will be available soon.' });
    const p = principal(request); const shipmentId = uuid.parse((request.params as { shipmentId: string }).shipmentId);
    const result = await withSellerTransaction(p.sellerId, async (client) => {
      const shipment = await client.query<{ awb: string }>('SELECT awb FROM shipments WHERE id=$1 AND seller_id=$2', [shipmentId, p.sellerId]);
      if (!shipment.rows[0]) throw Object.assign(new Error('Shipment not found'), { statusCode: 404 });
      const doc = await client.query<{ id: string }>(`INSERT INTO documents (seller_id,shipment_id,kind,storage_key,content_type) VALUES ($1,$2,'shipping_label',$3,'application/pdf') RETURNING id`, [p.sellerId, shipmentId, `labels/${p.sellerId}/${shipment.rows[0].awb}.pdf`]);
      const job = await client.query<{ id: string }>(`INSERT INTO job_runs (seller_id,job_type,payload) VALUES ($1,'shipment.label.generate',$2) RETURNING id`, [p.sellerId, JSON.stringify({ documentId: doc.rows[0].id, shipmentId })]);
      return { documentId: doc.rows[0].id, jobId: job.rows[0].id };
    });
    return reply.code(202).send(result);
  });
  app.get('/v1/shipments/:shipmentId/label', { preHandler: requireSeller }, async (request, reply) => {
    if (!config.STORAGE_ENABLED) return reply.code(501).send({ error: 'FILE_STORAGE_NOT_CONNECTED', message: 'File storage is not connected yet; this will be available soon.' });
    const p = principal(request); const shipmentId = uuid.parse((request.params as { shipmentId: string }).shipmentId);
    return withSellerTransaction(p.sellerId, async (client) => {
      const doc = await client.query<{ storage_key: string; status: string }>(`SELECT storage_key,status FROM documents WHERE shipment_id=$1 AND seller_id=$2 AND kind='shipping_label' ORDER BY created_at DESC LIMIT 1`, [shipmentId, p.sellerId]);
      if (!doc.rows[0]) throw Object.assign(new Error('Label not found'), { statusCode: 404 });
      if (doc.rows[0].status !== 'ready') return { status: doc.rows[0].status };
      await ensurePrivateBucket();
      return { status: 'ready', downloadUrl: await storage.presignedGetObject(config.MINIO_BUCKET, doc.rows[0].storage_key, 300), expiresInSeconds: 300 };
    });
  });
}
