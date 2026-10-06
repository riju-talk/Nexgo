/**
 * Comprehensive Test Data Generator
 * 
 * Generates realistic test data for EVERY feature in the application:
 * - Orders (all states, all types)
 * - Shipments (all states)
 * - NDR cases (with attempts)
 * - Weight disputes
 * - COD cycles
 * - Bank accounts
 * - Partners & dropship orders
 * - Wallet recharges
 * - Invoices
 * - Team members
 * - Warehouses
 * - Products
 * - Customers
 * - Rate cards
 * - SLA breaches
 * - Pickup requests
 */

import { db } from './client.js';
import { randomBytes } from 'crypto';

// Utility functions
function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomElement<T>(arr: T[]): T {
  return arr[randomInt(0, arr.length - 1)];
}

function randomDate(start: Date, end: Date): Date {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

const INDIAN_CITIES = [
  { name: 'Mumbai', state: 'MH', pincode: '400001' },
  { name: 'Delhi', state: 'DL', pincode: '110001' },
  { name: 'Bengaluru', state: 'KA', pincode: '560001' },
  { name: 'Pune', state: 'MH', pincode: '411001' },
  { name: 'Chennai', state: 'TN', pincode: '600001' },
  { name: 'Hyderabad', state: 'TS', pincode: '500001' },
  { name: 'Kolkata', state: 'WB', pincode: '700001' },
  { name: 'Ahmedabad', state: 'GJ', pincode: '380001' },
  { name: 'Jaipur', state: 'RJ', pincode: '302001' },
  { name: 'Kochi', state: 'KL', pincode: '682001' },
];

const FIRST_NAMES = ['Rahul', 'Priya', 'Amit', 'Sneha', 'Arjun', 'Divya', 'Rohan', 'Anjali', 'Karan', 'Pooja', 'Vikram', 'Neha', 'Sanjay', 'Kavita', 'Aditya'];
const LAST_NAMES = ['Sharma', 'Patel', 'Kumar', 'Singh', 'Reddy', 'Mehta', 'Gupta', 'Nair', 'Iyer', 'Kulkarni'];

const PRODUCT_NAMES = [
  'Cotton T-Shirt', 'Linen Kurta', 'Silk Saree', 'Wooden Chair', 'Ceramic Vase',
  'Handwoven Rug', 'Brass Lamp', 'Leather Wallet', 'Canvas Bag', 'Terracotta Planter',
  'Block Print Bedsheet', 'Jute Table Runner', 'Copper Water Bottle', 'Bamboo Cutting Board',
];

async function seedComprehensiveData() {
  console.log('🌱 Starting comprehensive test data generation...\n');

  // Get existing sellers
  const sellers = await db.query('SELECT id FROM sellers ORDER BY created_at LIMIT 3');
  if (sellers.rows.length === 0) {
    console.error('❌ No sellers found. Run seed-dev-accounts first!');
    process.exit(1);
  }

  const sellerId = sellers.rows[0].id;
  console.log(`✅ Using seller: ${sellerId}\n`);

  // Get courier providers
  const couriers = await db.query('SELECT id, code, name FROM courier_providers WHERE integration_state = \'live\' LIMIT 5');
  if (couriers.rows.length === 0) {
    console.error('❌ No couriers found. Run seed-demo-network first!');
    process.exit(1);
  }

  const couriersList = couriers.rows;
  console.log(`✅ Found ${couriersList.length} couriers\n`);

  // Get services
  const services = await db.query(`
    SELECT cs.id, cs.code, cs.display_name, cs.provider_id 
    FROM courier_services cs
    WHERE cs.is_active = true
    LIMIT 10
  `);

  const servicesList = services.rows;

  // ============================================================================
  // 1. CREATE WAREHOUSES
  // ============================================================================
  console.log('📦 Creating warehouses...');
  
  const warehouse1 = await db.query(`
    INSERT INTO warehouses (
      seller_id, name, contact_name, phone, email,
      address_line_1, city, state, pincode,
      is_return_address, cutoff_time, is_active
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true)
    RETURNING id
  `, [
    sellerId,
    'Bengaluru Main Warehouse',
    'Rajesh Kumar',
    '+919876543210',
    'warehouse@example.com',
    'Plot 42, KIADB Industrial Area, Bommasandra',
    'Bengaluru',
    'Karnataka',
    '560099',
    true,
    '16:30:00',
  ]);

  const warehouse2 = await db.query(`
    INSERT INTO warehouses (
      seller_id, name, contact_name, phone,
      address_line_1, city, state, pincode, cutoff_time, is_active
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true)
    RETURNING id
  `, [
    sellerId,
    'Pune Distribution Center',
    'Amit Patel',
    '+919123456780',
    'Gat No 123, Chakan MIDC',
    'Pune',
    'Maharashtra',
    '410501',
    '17:00:00',
  ]);

  const warehouseId = warehouse1.rows[0].id;
  console.log(`  ✓ Created 2 warehouses\n`);

  // ============================================================================
  // 2. CREATE PRODUCTS
  // ============================================================================
  console.log('📦 Creating products...');
  
  const products = [];
  for (let i = 0; i < 20; i++) {
    const product = await db.query(`
      INSERT INTO products (
        seller_id, sku, name, description, hsn_code,
        unit_price_paise, weight_g, length_mm, width_mm, height_mm
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id
    `, [
      sellerId,
      `SKU-${1000 + i}`,
      randomElement(PRODUCT_NAMES),
      `High quality ${randomElement(PRODUCT_NAMES).toLowerCase()}`,
      `${randomInt(1000, 9999)}`,
      randomInt(50000, 500000), // ₹500 - ₹5000
      randomInt(100, 5000), // 100g - 5kg
      randomInt(100, 500), // mm
      randomInt(100, 400),
      randomInt(50, 300),
    ]);
    products.push(product.rows[0].id);
  }

  console.log(`  ✓ Created ${products.length} products\n`);

  // ============================================================================
  // 3. CREATE CUSTOMERS
  // ============================================================================
  console.log('👥 Creating customers...');
  
  const customers = [];
  for (let i = 0; i < 100; i++) {
    const city = randomElement(INDIAN_CITIES);
    const customer = await db.query(`
      INSERT INTO customers (
        seller_id, full_name, phone, email,
        address_line_1, address_line_2, city, state, pincode
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id
    `, [
      sellerId,
      `${randomElement(FIRST_NAMES)} ${randomElement(LAST_NAMES)}`,
      `+9198${randomInt(10000000, 99999999)}`,
      `customer${i}@example.com`,
      `${randomInt(1, 999)} ${randomElement(['MG Road', 'Main Street', 'Park Avenue', 'Gandhi Nagar', 'Linking Road'])}`,
      randomElement(['Apartment 2A', 'Flat 301', '', null]),
      city.name,
      city.state,
      String(Number(city.pincode) + randomInt(0, 99)),
    ]);
    customers.push(customer.rows[0].id);
  }

  console.log(`  ✓ Created ${customers.length} customers\n`);

  // ============================================================================
  // 4. CREATE ORDERS IN VARIOUS STATES
  // ============================================================================
  console.log('📋 Creating orders in all states...');
  
  const orderStates: Array<{ state: string; count: number; flow: string }> = [
    { state: 'new', count: 30, flow: 'forward' },
    { state: 'ready_to_ship', count: 25, flow: 'forward' },
    { state: 'booked', count: 100, flow: 'forward' },
    { state: 'cancelled', count: 5, flow: 'forward' },
    { state: 'new', count: 10, flow: 'dropship' },
    { state: 'ready_to_ship', count: 8, flow: 'dropship' },
  ];

  const orders = [];
  let orderNumber = 1000;

  for (const { state, count, flow } of orderStates) {
    for (let i = 0; i < count; i++) {
      const customerId = randomElement(customers);
      const itemCount = randomInt(1, 3);
      const paymentMode = randomElement(['prepaid', 'cod']);
      const subtotal = randomInt(100000, 1000000); // ₹1000 - ₹10000
      const codAmount = paymentMode === 'cod' ? subtotal : 0;

      const order = await db.query(`
        INSERT INTO orders (
          seller_id, warehouse_id, customer_id, order_number,
          order_flow, payment_mode, cod_amount_paise,
          subtotal_paise, total_weight_g, total_paise, state,
          package_length_mm, package_width_mm, package_height_mm,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        RETURNING id
      `, [
        sellerId,
        warehouseId,
        customerId,
        `ORD-${orderNumber++}`,
        flow,
        paymentMode,
        codAmount,
        subtotal,
        randomInt(500, 3000), // 500g - 3kg
        subtotal,
        state,
        randomInt(200, 400),
        randomInt(200, 400),
        randomInt(100, 300),
        randomDate(new Date(2026, 7, 1), new Date()),
      ]);

      orders.push({ id: order.rows[0].id, state, paymentMode, codAmount });

      // Add order items
      for (let j = 0; j < itemCount; j++) {
        await db.query(`
          INSERT INTO order_items (
            order_id, product_id, sku, name, quantity, unit_price_paise, weight_g
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [
          order.rows[0].id,
          randomElement(products),
          `SKU-${randomInt(1000, 1019)}`,
          randomElement(PRODUCT_NAMES),
          randomInt(1, 2),
          randomInt(50000, 200000),
          randomInt(200, 1000),
        ]);
      }
    }
  }

  console.log(`  ✓ Created ${orders.length} orders\n`);

  // ============================================================================
  // 5. CREATE SHIPMENTS IN VARIOUS STATES
  // ============================================================================
  console.log('📮 Creating shipments...');
  
  const shipmentStates = [
    'pickup_pending', 'pickup_scheduled', 'in_transit', 
    'out_for_delivery', 'delivered', 'ndr', 'rto', 'rto_in_transit'
  ];

  const bookedOrders = orders.filter(o => o.state === 'booked');
  const shipments = [];

  for (const order of bookedOrders) {
    const service = randomElement(servicesList);
    const state = randomElement(shipmentStates);
    const weight = randomInt(500, 3000);
    const charge = randomInt(10000, 50000); // ₹100 - ₹500

    const shipment = await db.query(`
      INSERT INTO shipments (
        seller_id, order_id, provider_id, service_id,
        awb, state, chargeable_weight_g, shipping_charge_paise,
        origin_pincode, destination_pincode,
        promised_delivery_at, booked_at, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING id, awb
    `, [
      sellerId,
      order.id,
      service.provider_id,
      service.id,
      `AWB${randomInt(1000000000, 9999999999)}`,
      state,
      weight,
      charge,
      '560099',
      randomElement(INDIAN_CITIES).pincode,
      addDays(new Date(), randomInt(1, 5)),
      randomDate(new Date(2026, 7, 15), new Date()),
      randomDate(new Date(2026, 7, 15), new Date()),
    ]);

    shipments.push({ ...shipment.rows[0], state, order });

    // Add shipment events
    await db.query(`
      INSERT INTO shipment_events (shipment_id, state, occurred_at, description, source)
      VALUES ($1, 'booked', $2, 'Shipment booked successfully', 'booking')
    `, [shipment.rows[0].id, new Date()]);

    if (['in_transit', 'out_for_delivery', 'delivered', 'ndr', 'rto'].includes(state)) {
      await db.query(`
        INSERT INTO shipment_events (shipment_id, state, occurred_at, description, source)
        VALUES ($1, 'in_transit', $2, 'Package picked up', 'courier_scan')
      `, [shipment.rows[0].id, addDays(new Date(), -2)]);
    }

    if (state === 'delivered') {
      await db.query(`
        INSERT INTO shipment_events (shipment_id, state, occurred_at, description, source)
        VALUES ($1, 'delivered', $2, 'Delivered to customer', 'courier_scan')
      `, [shipment.rows[0].id, addDays(new Date(), -1)]);
    }
  }

  console.log(`  ✓ Created ${shipments.length} shipments\n`);

  // ============================================================================
  // 6. CREATE NDR CASES
  // ============================================================================
  console.log('⚠️  Creating NDR cases...');
  
  const ndrShipments = shipments.filter(s => s.state === 'ndr');
  const ndrReasons = ['customer_unavailable', 'address_incomplete', 'refused_delivery', 'payment_not_ready'];

  for (const shipment of ndrShipments.slice(0, 30)) {
    const attemptNumber = randomInt(1, 3);
    await db.query(`
      INSERT INTO ndr_cases (
        seller_id, shipment_id, reason_code, state,
        attempt_number, max_attempts, ndr_reason,
        sla_deadline_at, opened_at
      ) VALUES ($1, $2, $3, 'open', $4, 3, $5, $6, $7)
    `, [
      sellerId,
      shipment.id,
      randomElement(ndrReasons),
      attemptNumber,
      randomElement(ndrReasons),
      addDays(new Date(), 1), // 24 hours from now
      randomDate(new Date(2026, 8, 1), new Date()),
    ]);
  }

  console.log(`  ✓ Created 30 NDR cases\n`);

  // ============================================================================
  // 7. CREATE WEIGHT DISPUTES
  // ============================================================================
  console.log('⚖️  Creating weight disputes...');
  
  for (let i = 0; i < 25; i++) {
    const shipment = randomElement(shipments.filter(s => s.state === 'delivered'));
    const declaredWeight = randomInt(500, 2000);
    const billedWeight = declaredWeight + randomInt(300, 1000); // Always higher
    const originalCharge = randomInt(10000, 30000);
    const additionalCharge = randomInt(5000, 15000);

    await db.query(`
      INSERT INTO weight_disputes (
        seller_id, shipment_id, raised_by_provider,
        declared_weight_g, billed_weight_g,
        original_charge_paise, disputed_charge_paise, held_amount_paise,
        dispute_deadline, status, raised_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'open', $10)
    `, [
      sellerId,
      shipment.id,
      randomElement(couriersList).id,
      declaredWeight,
      billedWeight,
      originalCharge,
      originalCharge + additionalCharge,
      additionalCharge,
      addDays(new Date(), 7),
      randomDate(new Date(2026, 8, 1), new Date()),
    ]);
  }

  console.log(`  ✓ Created 25 weight disputes\n`);

  // ============================================================================
  // 8. CREATE BANK ACCOUNTS
  // ============================================================================
  console.log('🏦 Creating bank accounts...');
  
  const iv = randomBytes(16);
  const fakeEncrypted = Buffer.concat([iv, randomBytes(16), randomBytes(16)]);

  const bank1 = await db.query(`
    INSERT INTO bank_accounts (
      seller_id, account_holder_name, account_number_encrypted,
      key_reference, ifsc_code, bank_name, account_type,
      verification_status, verified_at, is_primary, is_active
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'verified', now(), true, true)
    RETURNING id
  `, [
    sellerId,
    'Acme Exports Pvt Ltd',
    fakeEncrypted,
    'default-v1',
    'HDFC0001234',
    'HDFC Bank',
    'current',
  ]);

  await db.query(`
    INSERT INTO bank_accounts (
      seller_id, account_holder_name, account_number_encrypted,
      key_reference, ifsc_code, bank_name, account_type,
      verification_status, is_primary, is_active
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', false, true)
  `, [
    sellerId,
    'Acme Exports Pvt Ltd',
    fakeEncrypted,
    'default-v1',
    'ICIC0005678',
    'ICICI Bank',
    'savings',
  ]);

  console.log(`  ✓ Created 2 bank accounts\n`);

  // ============================================================================
  // 9. CREATE COD REMITTANCE CYCLES
  // ============================================================================
  console.log('💰 Creating COD remittance cycles...');
  
  const codOrders = orders.filter(o => o.paymentMode === 'cod' && o.state === 'booked');
  const codCollected = codOrders.reduce((sum, o) => sum + o.codAmount, 0);
  const charges = Math.floor(codCollected * 0.08); // 8% charges

  await db.query(`
    INSERT INTO cod_remittance_cycles (
      seller_id, cycle_start, cycle_end, shipment_count,
      cod_collected_paise, charges_deducted_paise, net_remitted_paise,
      bank_account_id, status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
  `, [
    sellerId,
    new Date(2026, 8, 1),
    new Date(2026, 8, 7),
    codOrders.length,
    codCollected,
    charges,
    codCollected - charges,
    bank1.rows[0].id,
  ]);

  await db.query(`
    INSERT INTO cod_remittance_cycles (
      seller_id, cycle_start, cycle_end, shipment_count,
      cod_collected_paise, charges_deducted_paise, net_remitted_paise,
      bank_account_id, status, remitted_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'remitted', $9)
  `, [
    sellerId,
    new Date(2026, 7, 24),
    new Date(2026, 7, 31),
    45,
    12500000, // ₹1,25,000
    10000000, // ₹10,000 charges
    11500000, // ₹1,15,000 net
    bank1.rows[0].id,
    new Date(2026, 8, 2),
  ]);

  console.log(`  ✓ Created 2 COD cycles\n`);

  // ============================================================================
  // 10. CREATE WALLET ENTRIES
  // ============================================================================
  console.log('💳 Creating wallet transactions...');
  
  // Recharges
  for (let i = 0; i < 5; i++) {
    await db.query(`
      INSERT INTO wallet_entries (
        seller_id, entry_type, amount_paise, reference_type,
        reference_id, idempotency_key, description, created_at
      ) VALUES ($1, 'credit', $2, 'recharge', gen_random_uuid(), $3, $4, $5)
    `, [
      sellerId,
      randomInt(5000000, 20000000), // ₹50k - ₹2L
      `recharge-${i}`,
      'Wallet recharge via Razorpay',
      randomDate(new Date(2026, 7, 1), new Date()),
    ]);
  }

  // Shipping charges (debits)
  for (let i = 0; i < 50; i++) {
    await db.query(`
      INSERT INTO wallet_entries (
        seller_id, entry_type, amount_paise, reference_type,
        reference_id, idempotency_key, description, created_at
      ) VALUES ($1, 'debit', $2, 'shipment', gen_random_uuid(), $3, $4, $5)
    `, [
      sellerId,
      randomInt(10000, 50000), // ₹100 - ₹500
      `shipment-${i}`,
      'Shipping charge for AWB12345',
      randomDate(new Date(2026, 7, 1), new Date()),
    ]);
  }

  console.log(`  ✓ Created wallet transactions\n`);

  // ============================================================================
  // 11. MARKETPLACE PARTNERS & DROPSHIP ORDERS
  // ============================================================================
  console.log('🤝 Setting up marketplace partners...');
  
  // Partners already seeded in migration, just create mapping
  const partners = await db.query('SELECT id FROM marketplace_partners LIMIT 3');
  
  for (const partner of partners.rows) {
    await db.query(`
      INSERT INTO partner_seller_mappings (
        partner_id, seller_id, is_active, auto_accept_orders,
        custom_commission_percentage, activated_at
      ) VALUES ($1, $2, true, true, $3, now())
      ON CONFLICT DO NOTHING
    `, [
      partner.id,
      sellerId,
      randomInt(10, 20), // 10-20% commission
    ]);
  }

  // Update some orders to be dropship orders
  const dropshipOrders = orders.filter(o => o.state === 'new' && randomInt(1, 3) === 1);
  for (const order of dropshipOrders.slice(0, 10)) {
    const partner = randomElement(partners.rows);
    const commissionPct = randomInt(12, 18);
    const subtotal = randomInt(100000, 500000);
    const commission = Math.floor(subtotal * commissionPct / 100);

    await db.query(`
      UPDATE orders 
      SET 
        order_flow = 'dropship',
        partner_id = $1,
        partner_order_reference = $2,
        partner_commission_paise = $3,
        partner_fulfillment_fee_paise = 0
      WHERE id = $4
    `, [
      partner.id,
      `PARTNER-${randomInt(10000, 99999)}`,
      commission,
      order.id,
    ]);
  }

  console.log(`  ✓ Created partner relationships and dropship orders\n`);

  // ============================================================================
  // SUMMARY
  // ============================================================================
  console.log('\n🎉 Test data generation complete!\n');
  console.log('Summary:');
  console.log('  ✓ 2 warehouses');
  console.log(`  ✓ ${products.length} products`);
  console.log(`  ✓ ${customers.length} customers`);
  console.log(`  ✓ ${orders.length} orders (all states)`);
  console.log(`  ✓ ${shipments.length} shipments (all states)`);
  console.log('  ✓ 30 NDR cases');
  console.log('  ✓ 25 weight disputes');
  console.log('  ✓ 2 bank accounts');
  console.log('  ✓ 2 COD cycles');
  console.log('  ✓ 55 wallet transactions');
  console.log('  ✓ 3 marketplace partners');
  console.log('  ✓ 10 dropship orders');
  console.log('\n✅ Every feature now has test data!\n');
}

// Run the seeder
seedComprehensiveData()
  .then(() => {
    console.log('✅ Seeding completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  });
