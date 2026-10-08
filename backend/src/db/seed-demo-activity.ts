import { db, withTransaction } from './client.js';

// Sample operational history for the demo seller so reports, dashboards and the admin
// screens have something to show. Idempotent: does nothing once the seller has shipments.
const email = 'demo@acmeexports.com';
const CITIES: [string, string, string][] = [
  ['Mumbai', 'Maharashtra', '400001'], ['Delhi', 'Delhi', '110001'], ['Pune', 'Maharashtra', '411001'], ['Hyderabad', 'Telangana', '500001'],
  ['Chennai', 'Tamil Nadu', '600001'], ['Kolkata', 'West Bengal', '700001'], ['Jaipur', 'Rajasthan', '302001'], ['Ahmedabad', 'Gujarat', '380001'],
];
const FLOW = ['delivered', 'delivered', 'delivered', 'delivered', 'in_transit', 'out_for_delivery', 'ndr', 'rto'] as const;
const COUNT = 24;

async function main() {
  const found = await db.query<{ seller_id: string }>('SELECT m.seller_id FROM seller_memberships m JOIN users u ON u.id=m.user_id WHERE u.email=$1', [email]);
  if (!found.rows[0]) throw new Error('Run the demo account seed first');
  const sellerId = found.rows[0].seller_id;
  if ((await db.query('SELECT 1 FROM shipments WHERE seller_id=$1 LIMIT 1', [sellerId])).rows[0]) { console.log('Demo activity already present'); await db.end(); return; }

  const services = (await db.query<{ service_id: string; provider_id: string }>(`SELECT sca.service_id, cs.provider_id FROM seller_courier_access sca JOIN courier_services cs ON cs.id=sca.service_id WHERE sca.seller_id=$1 AND sca.state='enabled' ORDER BY cs.id`, [sellerId])).rows;
  if (!services.length) throw new Error('Run the demo network seed first');
  const warehouse = (await db.query<{ id: string }>('SELECT id FROM warehouses WHERE seller_id=$1 ORDER BY created_at LIMIT 1', [sellerId])).rows[0];
  const product = (await db.query<{ id: string }>(`SELECT id FROM products WHERE seller_id=$1 AND sku='DEMO-KIT-01'`, [sellerId])).rows[0];

  await withTransaction(async (c) => {
    await c.query(`INSERT INTO wallet_entries (seller_id,entry_type,amount_paise,reference_type,reference_id,idempotency_key,description,created_at) VALUES ($1,'credit',500000,'demo_seed','demo-recharge-2','demo-recharge-credit-2','Wallet recharge via Razorpay', now() - interval '21 days') ON CONFLICT (seller_id,idempotency_key) DO NOTHING`, [sellerId]);
    for (let i = 0; i < COUNT; i++) {
      const state = FLOW[i % FLOW.length];
      const [city, region, pin] = CITIES[i % CITIES.length];
      const cod = i % 3 === 0;
      const weight = 450 + (i % 6) * 250;
      const charge = 5500 + (i % 5) * 1300 + Math.floor(weight / 100) * 120;
      const subtotal = 99900 + (i % 4) * 25000;
      const bookedDays = ['delivered', 'ndr', 'rto'].includes(state) ? i + 6 : (i % 3) + 1;
      const svc = services[i % services.length];
      const num = `ACME-${2001 + i}`;
      const customer = await c.query<{ id: string }>(`INSERT INTO customers (seller_id,full_name,phone,address_line_1,city,state,pincode) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`, [sellerId, `Buyer ${i + 1} ${city}`, `+9198000${String(10000 + i)}`, `${10 + i} Market Road`, city, region, pin]);
      const order = await c.query<{ id: string }>(`INSERT INTO orders (seller_id,warehouse_id,customer_id,order_number,external_reference,state,payment_mode,cod_amount_paise,subtotal_paise,total_weight_g,created_at) VALUES ($1,$2,$3,$4,$4,'booked',$5,$6,$7,$8, now() - make_interval(days => $9)) RETURNING id`, [sellerId, warehouse.id, customer.rows[0].id, num, cod ? 'cod' : 'prepaid', cod ? subtotal : 0, subtotal, weight, bookedDays]);
      await c.query(`INSERT INTO order_items (order_id,product_id,sku,name,quantity,unit_price_paise,weight_g) VALUES ($1,$2,'DEMO-KIT-01','NEXGO Demo Shipping Kit',1,$3,$4)`, [order.rows[0].id, product?.id ?? null, subtotal, weight]);
      const late = i % 7 === 0;
      const ship = await c.query<{ id: string }>(
        `INSERT INTO shipments (seller_id,order_id,provider_id,service_id,awb,state,chargeable_weight_g,shipping_charge_paise,quote_snapshot,idempotency_key,booked_at,promised_delivery_at,destination_pincode,destination_city,pickup_completed_at,delivered_at,rto_initiated_at)
         VALUES ($1,$2,$3,$4,$5,$6::shipment_state,$7,$8,'{"demo":true}',$9, now() - make_interval(days => $10), now() - make_interval(days => $10) + make_interval(days => $11), $12,$13,
           CASE WHEN $6 <> 'booked' THEN now() - make_interval(days => $10) + interval '1 day' END,
           CASE WHEN $6 = 'delivered' THEN now() - make_interval(days => $10) + make_interval(days => $14) END,
           CASE WHEN $6 = 'rto' THEN now() - make_interval(days => $10) + interval '3 days' END) RETURNING id`,
        [sellerId, order.rows[0].id, svc.provider_id, svc.service_id, `ACMEDEMO${String(i + 1).padStart(4, '0')}`, state, weight, charge, `acme-demo-activity-${String(i + 1).padStart(2, '0')}`, bookedDays, late ? 2 : 5, pin, city, 2 + (i % 3)]);
      const shipmentId = ship.rows[0].id;
      await c.query(`INSERT INTO shipment_events (shipment_id,state,occurred_at,location,description,source) VALUES ($1,'booked', now() - make_interval(days => $2),$3,'Shipment booked successfully','booking')`, [shipmentId, bookedDays, 'Bengaluru Hub']);
      await c.query(`INSERT INTO shipment_events (shipment_id,state,occurred_at,location,description,source,source_event_id) VALUES ($1,'in_transit', now() - make_interval(days => $2) + interval '1 day',$3,'Shipment picked up','courier_webhook',$4)`, [shipmentId, bookedDays, 'Bengaluru Hub', `demo-${i + 1}-pickup`]);
      if (['delivered', 'out_for_delivery', 'ndr', 'rto'].includes(state)) await c.query(`INSERT INTO shipment_events (shipment_id,state,occurred_at,location,description,source,source_event_id) VALUES ($1,$2::shipment_state, now() - make_interval(days => $3) + interval '3 days',$4,$5,'courier_webhook',$6)`, [shipmentId, state, bookedDays, `${city} Hub`, state === 'delivered' ? 'Delivered to customer' : state === 'ndr' ? 'Customer unavailable at address' : state === 'rto' ? 'Return to origin initiated' : 'Out for delivery', `demo-${i + 1}-${state}`]);
      await c.query(`INSERT INTO wallet_entries (seller_id,entry_type,amount_paise,reference_type,reference_id,idempotency_key,description,created_at) VALUES ($1,'debit',$2,'shipment',$3,$4,$5, now() - make_interval(days => $6))`, [sellerId, charge, shipmentId, `demo-activity-debit-${i + 1}`, `Shipping charge for ACMEDEMO${String(i + 1).padStart(4, '0')}`, bookedDays]);
      if (state === 'ndr') await c.query(`INSERT INTO ndr_cases (seller_id,shipment_id,reason_code,reason_detail,ndr_reason,courier_notes,opened_at) VALUES ($1,$2,'customer_unavailable','Customer unavailable at address','customer_unavailable','Two delivery attempts made', now() - interval '1 day')`, [sellerId, shipmentId]);
      if (state === 'delivered' && i % 4 === 0) await c.query(`INSERT INTO weight_disputes (seller_id,shipment_id,raised_by_provider,declared_weight_g,billed_weight_g,original_charge_paise,disputed_charge_paise,held_amount_paise,status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'open')`, [sellerId, shipmentId, svc.provider_id, weight, weight + 400, charge, charge + 2400, 2400]);
    }
    // One settled and one pending COD payout cycle, plus an issued invoice for the older period.
    await c.query(`INSERT INTO cod_remittance_cycles (seller_id,cycle_start,cycle_end,shipment_count,cod_collected_paise,charges_deducted_paise,net_remitted_paise,status,bank_reference,approved_at,remitted_at)
      SELECT $1, current_date-30, current_date-10, count(*), COALESCE(sum(o.cod_amount_paise),0), COALESCE(sum(s.shipping_charge_paise),0), COALESCE(sum(o.cod_amount_paise),0)-COALESCE(sum(s.shipping_charge_paise),0), 'remitted', 'UTR-DEMO-0001', now()-interval '8 days', now()-interval '7 days'
      FROM shipments s JOIN orders o ON o.id=s.order_id WHERE s.seller_id=$1 AND s.state='delivered' AND o.payment_mode='cod' AND s.delivered_at::date BETWEEN current_date-30 AND current_date-10 HAVING count(*)>0`, [sellerId]);
    await c.query(`INSERT INTO cod_remittance_cycles (seller_id,cycle_start,cycle_end,shipment_count,cod_collected_paise,charges_deducted_paise,net_remitted_paise,status)
      SELECT $1, current_date-9, current_date, count(*), COALESCE(sum(o.cod_amount_paise),0), COALESCE(sum(s.shipping_charge_paise),0), COALESCE(sum(o.cod_amount_paise),0)-COALESCE(sum(s.shipping_charge_paise),0), 'pending'
      FROM shipments s JOIN orders o ON o.id=s.order_id WHERE s.seller_id=$1 AND s.state='delivered' AND o.payment_mode='cod' AND s.delivered_at::date BETWEEN current_date-9 AND current_date HAVING count(*)>0`, [sellerId]);
    const seq = await c.query<{ next_number: number }>(`INSERT INTO invoice_sequences (seller_id) VALUES ($1) ON CONFLICT (seller_id) DO UPDATE SET next_number=invoice_sequences.next_number+1 RETURNING next_number`, [sellerId]);
    await c.query(`INSERT INTO invoices (seller_id,invoice_number,period_start,period_end,subtotal_paise,gst_paise,total_paise,shipment_count,status,issued_at)
      SELECT $1, $2, current_date-30, current_date-10, sub, sub*18/100, sub + sub*18/100, n, 'issued', now()-interval '9 days'
      FROM (SELECT COALESCE(sum(shipping_charge_paise),0)::bigint AS sub, count(*)::int AS n FROM shipments WHERE seller_id=$1 AND state<>'cancelled' AND booked_at::date BETWEEN current_date-30 AND current_date-10) t WHERE n>0`, [sellerId, `NX/26-27/${String(seq.rows[0].next_number).padStart(6, '0')}`]);
  });
  console.log(`Demo activity ready: ${COUNT} shipments with events, NDR, disputes, COD cycles and an invoice`);
  await db.end();
}
main().catch(async (error) => { console.error(error); await db.end(); process.exit(1); });
