import { db } from './client.js';

const email = 'demo-2026@nexgo.local';

async function main() {
  const found = await db.query<{ seller_id: string }>('SELECT m.seller_id FROM seller_memberships m JOIN users u ON u.id=m.user_id WHERE u.email=$1', [email]);
  if (!found.rows[0]) throw new Error('Run the demo account seed first');
  const sellerId = found.rows[0].seller_id;
  const warehouse = await db.query<{ id: string }>(`INSERT INTO warehouses (seller_id,name,contact_name,phone,email,address_line_1,city,state,pincode,is_return_address) VALUES ($1,'Demo Bengaluru Hub','Demo Seller','+919876543210',$2,'42 Demo Logistics Park','Bengaluru','Karnataka','560001',true) ON CONFLICT (seller_id,name) DO UPDATE SET is_active=true RETURNING id`, [sellerId, email]);
  const product = await db.query<{ id: string }>(`INSERT INTO products (seller_id,sku,name,unit_price_paise,weight_g) VALUES ($1,'DEMO-KIT-01','NEXGO Demo Shipping Kit',149900,650) ON CONFLICT (seller_id,sku) DO UPDATE SET is_active=true RETURNING id`, [sellerId]);
  for (const n of ['DEMO-1001', 'DEMO-1002', 'DEMO-1003']) {
    const customer = await db.query<{ id: string }>(`INSERT INTO customers (seller_id,full_name,phone,address_line_1,city,state,pincode) VALUES ($1,$2,$3,'100 Demo Street','Bengaluru','Karnataka','560001') RETURNING id`, [sellerId, `Customer ${n}`, `+91987654${n.slice(-4)}`]);
    const order = await db.query<{ id: string }>(`INSERT INTO orders (seller_id,warehouse_id,customer_id,order_number,external_reference,state,payment_mode,cod_amount_paise,subtotal_paise,total_weight_g) VALUES ($1,$2,$3,$4,$4,'new','prepaid',0,149900,650) ON CONFLICT (seller_id,order_number) DO UPDATE SET updated_at=now() RETURNING id`, [sellerId, warehouse.rows[0].id, customer.rows[0].id, n]);
    await db.query(`INSERT INTO order_items (order_id,product_id,sku,name,quantity,unit_price_paise,weight_g) SELECT $1,$2,'DEMO-KIT-01','NEXGO Demo Shipping Kit',1,149900,650 WHERE NOT EXISTS (SELECT 1 FROM order_items WHERE order_id=$1)`, [order.rows[0].id, product.rows[0].id]);
  }
  await db.query(`INSERT INTO wallet_entries (seller_id,entry_type,amount_paise,reference_type,reference_id,idempotency_key,description) VALUES ($1,'credit',250000,'demo_seed','demo-wallet','demo-wallet-credit','Demo opening balance') ON CONFLICT (seller_id,idempotency_key) DO NOTHING`, [sellerId]);
  console.log('Demo seller data ready'); await db.end();
}
main().catch(async (error) => { console.error(error); await db.end(); process.exit(1); });
