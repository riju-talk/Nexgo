import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db/client.js';
import { requireAccountAdmin, requireCommercialAdmin, requirePlatformAdmin } from '../lib/adminAuth.js';

const uuid = z.string().uuid();
// Escape LIKE wildcards so a search for "50%" matches literally.
const escLike = (v: string) => v.replace(/[\\%_]/g, '\\$&');
const sellerState = z.enum(['onboarding', 'active', 'suspended']);
const pageQuery = z.object({
  state: sellerState.optional(),
  search: z.string().trim().min(1).max(120).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});

// A seller can only move to the state that's actually a legitimate next step —
// e.g. skipping straight from onboarding to suspended isn't a "suspension,"
// it's a rejection, and should go through a different flow than this one.
const sellerTransitions: Record<string, readonly string[]> = {
  onboarding: ['active', 'suspended'],
  active: ['suspended'],
  suspended: ['active'],
};

const zoneInput = z.object({
  zoneCode: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{2,40}$/),
  destinationPrefix: z.string().trim().regex(/^\d{1,6}$/),
  label: z.string().trim().min(2).max(120),
});

export async function adminOperationsRoutes(app: FastifyInstance) {
  // --- Seller lifecycle -----------------------------------------------
  app.get('/v1/admin/wallets', { preHandler: requirePlatformAdmin }, async (request) => {
    const q = z.object({ search: z.string().trim().max(120).optional() }).parse(request.query);
    const result = await db.query(
      `SELECT s.id, s.legal_name, s.nexgo_code, s.state,
        COALESCE(SUM(CASE WHEN w.entry_type IN ('credit','release') THEN w.amount_paise WHEN w.entry_type IN ('debit','hold') THEN -w.amount_paise ELSE w.amount_paise END), 0)::bigint AS balance_paise,
        COUNT(w.id)::int AS entry_count, MAX(w.created_at) AS last_activity_at
       FROM sellers s LEFT JOIN wallet_entries w ON w.seller_id=s.id
       WHERE ($1::text IS NULL OR s.legal_name ILIKE '%' || $1 || '%' OR s.nexgo_code ILIKE '%' || $1 || '%')
       GROUP BY s.id ORDER BY balance_paise ASC, s.legal_name LIMIT 200`,
      [q.search ? escLike(q.search) : null],
    );
    return { items: result.rows };
  });

  app.get('/v1/admin/pickups', { preHandler: requirePlatformAdmin }, async () => {
    const result = await db.query(
      `SELECT p.id, p.state, p.requested_for, p.created_at, s.legal_name AS seller_name, w.name AS warehouse_name, cp.name AS courier_name
       FROM pickup_requests p JOIN sellers s ON s.id=p.seller_id JOIN warehouses w ON w.id=p.warehouse_id
       LEFT JOIN courier_providers cp ON cp.id=p.courier_provider_id
       ORDER BY p.requested_for DESC, p.created_at DESC LIMIT 200`,
    );
    return { items: result.rows };
  });

  app.get('/v1/admin/orders', { preHandler: requirePlatformAdmin }, async (request) => {
    const q = z.object({ state: z.enum(['new', 'ready_to_ship', 'booked', 'cancelled']).optional(), orderFlow: z.enum(['forward', 'reverse', 'dropship', 'ship_now']).optional(), sellerId: uuid.optional(), q: z.string().trim().max(120).optional(), limit: z.coerce.number().int().min(1).max(200).default(100) }).parse(request.query);
    const result = await db.query(
      `SELECT o.id, o.order_number, o.order_flow, o.notes, o.state, o.payment_mode, o.subtotal_paise, o.total_weight_g, o.created_at,
              s.legal_name AS seller_name, c.full_name AS customer_name, c.city AS customer_city, c.pincode AS customer_pincode
       FROM orders o JOIN sellers s ON s.id = o.seller_id JOIN customers c ON c.id = o.customer_id
       WHERE ($1::order_state IS NULL OR o.state = $1) AND ($2::text IS NULL OR o.order_flow = $2) AND ($3::uuid IS NULL OR o.seller_id = $3)
         AND ($5::text IS NULL OR o.order_number ILIKE '%' || $5 || '%' OR c.full_name ILIKE '%' || $5 || '%' OR c.phone ILIKE '%' || $5 || '%')
       ORDER BY o.created_at DESC LIMIT $4`,
      [q.state ?? null, q.orderFlow ?? null, q.sellerId ?? null, q.limit, q.q ? escLike(q.q) : null],
    );
    return { items: result.rows };
  });

  app.get('/v1/admin/sellers', { preHandler: requirePlatformAdmin }, async (request) => {
    const q = pageQuery.parse(request.query);
    const result = await db.query(
      `SELECT s.id, s.legal_name, s.slug, s.nexgo_code, s.state, s.created_at, COALESCE(k.status, 'unsubmitted') AS kyc_status,
              poc.email AS email, poc.full_name AS poc_name,
              (SELECT count(*) FROM orders o WHERE o.seller_id = s.id) AS order_count,
              (SELECT count(*) FROM shipments sh WHERE sh.seller_id = s.id) AS shipment_count
       FROM sellers s
       LEFT JOIN seller_kyc k ON k.seller_id = s.id
       LEFT JOIN LATERAL (SELECT u.email, u.full_name FROM seller_memberships m JOIN users u ON u.id = m.user_id WHERE m.seller_id = s.id ORDER BY (m.role = 'owner') DESC, m.created_at LIMIT 1) poc ON true
       WHERE ($1::seller_state IS NULL OR s.state = $1)
         AND ($2::text IS NULL OR s.legal_name ILIKE '%' || $2 || '%')
       ORDER BY s.created_at DESC LIMIT $3 OFFSET $4`,
      [q.state ?? null, q.search ?? null, q.limit, q.offset],
    );
    return { items: result.rows };
  });

  app.get('/v1/admin/sellers/:sellerId', { preHandler: requirePlatformAdmin }, async (request, reply) => {
    const sellerId = uuid.parse((request.params as { sellerId: string }).sellerId);
    const seller = await db.query('SELECT id, legal_name, slug, state, created_at FROM sellers WHERE id = $1', [sellerId]);
    if (!seller.rows[0]) return reply.code(404).send({ error: 'SELLER_NOT_FOUND' });
    const [kyc, members, wallet, shipments] = await Promise.all([
      db.query('SELECT status, submitted_at, reviewed_at, rejection_reason FROM seller_kyc WHERE seller_id = $1', [sellerId]),
      db.query('SELECT u.full_name, u.email, m.role FROM seller_memberships m JOIN users u ON u.id = m.user_id WHERE m.seller_id = $1 ORDER BY m.created_at', [sellerId]),
      db.query<{ balance_paise: string }>(
        `SELECT COALESCE(SUM(CASE WHEN entry_type IN ('credit','release') THEN amount_paise WHEN entry_type IN ('debit','hold') THEN -amount_paise ELSE amount_paise END),0)::bigint AS balance_paise FROM wallet_entries WHERE seller_id = $1`,
        [sellerId],
      ),
      db.query('SELECT state, count(*)::int AS count FROM shipments WHERE seller_id = $1 GROUP BY state', [sellerId]),
    ]);
    return {
      ...seller.rows[0],
      kyc: kyc.rows[0] ?? { status: 'unsubmitted' },
      members: members.rows,
      walletBalancePaise: Number(wallet.rows[0].balance_paise),
      shipmentsByState: shipments.rows,
    };
  });

  app.post('/v1/admin/sellers/:sellerId/state', { preHandler: [requirePlatformAdmin, requireAccountAdmin] }, async (request, reply) => {
    const sellerId = uuid.parse((request.params as { sellerId: string }).sellerId);
    const { state, note } = z.object({ state: sellerState, note: z.string().trim().max(500).optional() }).parse(request.body);
    const current = await db.query<{ state: string }>('SELECT state FROM sellers WHERE id = $1 FOR UPDATE', [sellerId]);
    if (!current.rows[0]) return reply.code(404).send({ error: 'SELLER_NOT_FOUND' });
    if (!sellerTransitions[current.rows[0].state].includes(state)) {
      return reply.code(409).send({ error: 'INVALID_STATE_TRANSITION', from: current.rows[0].state, to: state });
    }
    if (state === 'active' && current.rows[0].state === 'onboarding') {
      const kyc = await db.query<{ status: string }>('SELECT status FROM seller_kyc WHERE seller_id = $1', [sellerId]);
      if (kyc.rows[0]?.status !== 'verified') {
        return reply.code(409).send({ error: 'KYC_NOT_VERIFIED', message: 'A seller cannot be activated before KYC is verified' });
      }
    }
    const result = await db.query('UPDATE sellers SET state = $1::seller_state, updated_at = now() WHERE id = $2 RETURNING id, state', [state, sellerId]);
    await db.query(
      `INSERT INTO audit_events (seller_id, actor_user_id, action, target_type, target_id, request_id, metadata)
       VALUES ($1, $2, 'seller.state_changed', 'seller', $3, $4, $5)`,
      [sellerId, request.adminPrincipal!.userId, sellerId, request.id, JSON.stringify({ from: current.rows[0].state, to: state, note: note ?? null })],
    );
    return result.rows[0];
  });

  // --- Courier zone mapping ---------------------------------------------
  app.get('/v1/admin/courier-zones', { preHandler: requirePlatformAdmin }, async () => {
    const result = await db.query('SELECT * FROM courier_zones ORDER BY zone_code, destination_prefix');
    return { items: result.rows };
  });

  app.post('/v1/admin/courier-zones', { preHandler: [requirePlatformAdmin, requireCommercialAdmin] }, async (request, reply) => {
    const input = zoneInput.parse(request.body);
    const existing = await db.query('SELECT id FROM courier_zones WHERE destination_prefix = $1', [input.destinationPrefix]);
    if (existing.rows[0]) return reply.code(409).send({ error: 'PREFIX_ALREADY_MAPPED' });
    const result = await db.query(
      'INSERT INTO courier_zones (zone_code, destination_prefix, label, created_by) VALUES ($1,$2,$3,$4) RETURNING *',
      [input.zoneCode, input.destinationPrefix, input.label, request.adminPrincipal!.userId],
    );
    await db.query(
      `INSERT INTO audit_events (actor_user_id, action, target_type, target_id, request_id, metadata)
       VALUES ($1, 'courier.zone.created', 'courier_zone', $2, $3, $4)`,
      [request.adminPrincipal!.userId, result.rows[0].id, request.id, JSON.stringify(input)],
    );
    return reply.code(201).send(result.rows[0]);
  });

  app.delete('/v1/admin/courier-zones/:zoneId', { preHandler: [requirePlatformAdmin, requireCommercialAdmin] }, async (request, reply) => {
    const zoneId = uuid.parse((request.params as { zoneId: string }).zoneId);
    const result = await db.query('DELETE FROM courier_zones WHERE id = $1 RETURNING id', [zoneId]);
    if (!result.rows[0]) return reply.code(404).send({ error: 'ZONE_RULE_NOT_FOUND' });
    return reply.code(204).send();
  });

  // --- Platform-wide shipment and NDR queues -----------------------------
  app.get('/v1/admin/shipments', { preHandler: requirePlatformAdmin }, async (request) => {
    const q = z.object({
      state: z.enum(['booked', 'in_transit', 'out_for_delivery', 'delivered', 'ndr', 'rto', 'cancelled']).optional(),
      sellerId: uuid.optional(),
      providerId: uuid.optional(),
      q: z.string().trim().max(120).optional(),
      limit: z.coerce.number().int().min(1).max(200).default(100),
    }).parse(request.query);
    const result = await db.query(
      `SELECT sh.id, sh.awb, sh.state, sh.chargeable_weight_g, sh.shipping_charge_paise, sh.booked_at, sh.provider_id,
              cp.name AS courier_name, cs.display_name AS service_name,
              s.legal_name AS seller_name, o.order_number
       FROM shipments sh JOIN sellers s ON s.id = sh.seller_id JOIN orders o ON o.id = sh.order_id
       JOIN courier_providers cp ON cp.id = sh.provider_id JOIN courier_services cs ON cs.id = sh.service_id
       WHERE ($1::shipment_state IS NULL OR sh.state = $1) AND ($2::uuid IS NULL OR sh.seller_id = $2)
         AND ($4::uuid IS NULL OR sh.provider_id = $4)
         AND ($5::text IS NULL OR sh.awb ILIKE '%' || $5 || '%' OR o.order_number ILIKE '%' || $5 || '%')
       ORDER BY sh.booked_at DESC LIMIT $3`,
      [q.state ?? null, q.sellerId ?? null, q.limit, q.providerId ?? null, q.q ? escLike(q.q) : null],
    );
    return { items: result.rows };
  });

  // --- Global search box (top bar): sellers, AWBs and orders in one call ----
  app.get('/v1/admin/search', { preHandler: requirePlatformAdmin }, async (request) => {
    const { q } = z.object({ q: z.string().trim().min(1).max(120) }).parse(request.query);
    const like = escLike(q);
    const [sellers, shipments, orders] = await Promise.all([
      db.query(`SELECT id, legal_name, nexgo_code FROM sellers WHERE legal_name ILIKE '%' || $1 || '%' OR nexgo_code ILIKE '%' || $1 || '%' ORDER BY legal_name LIMIT 5`, [like]),
      db.query(`SELECT sh.id, sh.awb, sh.state, s.legal_name AS seller_name, cp.name AS courier_name FROM shipments sh JOIN sellers s ON s.id = sh.seller_id JOIN courier_providers cp ON cp.id = sh.provider_id WHERE sh.awb ILIKE '%' || $1 || '%' ORDER BY sh.booked_at DESC LIMIT 5`, [like]),
      db.query(`SELECT o.id, o.order_number, o.state, s.legal_name AS seller_name, c.full_name AS customer_name FROM orders o JOIN sellers s ON s.id = o.seller_id JOIN customers c ON c.id = o.customer_id WHERE o.order_number ILIKE '%' || $1 || '%' OR c.full_name ILIKE '%' || $1 || '%' OR c.phone ILIKE '%' || $1 || '%' ORDER BY o.created_at DESC LIMIT 5`, [like]),
    ]);
    return { sellers: sellers.rows, shipments: shipments.rows, orders: orders.rows };
  });

  // --- Platform-wide pincode blocks: blocked here = blocked for every seller; opened = open for all ----
  app.get('/v1/admin/pincode-blocks', { preHandler: requirePlatformAdmin }, async () => {
    const result = await db.query(
      `SELECT b.pincode, b.note, b.created_at, p.city, p.state FROM platform_pincode_blocks b LEFT JOIN pincodes p ON p.pincode = b.pincode ORDER BY b.created_at DESC, b.pincode LIMIT 5000`);
    return { items: result.rows };
  });

  const pincodeList = z.array(z.string().regex(/^\d{6}$/)).min(1).max(5000);
  app.post('/v1/admin/pincode-blocks', { preHandler: [requirePlatformAdmin, requireCommercialAdmin] }, async (request) => {
    const input = z.object({ pincodes: pincodeList, note: z.string().trim().max(200).optional() }).parse(request.body);
    const pins = [...new Set(input.pincodes)];
    const result = await db.query(
      `INSERT INTO platform_pincode_blocks (pincode, note, created_by) SELECT p, $1, $2 FROM unnest($3::text[]) AS p ON CONFLICT DO NOTHING RETURNING pincode`,
      [input.note ?? null, request.adminPrincipal!.userId, pins]);
    await db.query(`INSERT INTO audit_events (actor_user_id,action,target_type,target_id,request_id,metadata) VALUES ($1,'platform.pincodes_blocked','pincode','platform',$2,$3)`, [request.adminPrincipal!.userId, request.id, JSON.stringify({ requested: pins.length, added: result.rowCount })]);
    return { added: result.rowCount, requested: pins.length };
  });

  app.post('/v1/admin/pincode-blocks/open', { preHandler: [requirePlatformAdmin, requireCommercialAdmin] }, async (request) => {
    const input = z.object({ pincodes: pincodeList }).parse(request.body);
    const pins = [...new Set(input.pincodes)];
    const result = await db.query(`DELETE FROM platform_pincode_blocks WHERE pincode = ANY($1::text[])`, [pins]);
    await db.query(`INSERT INTO audit_events (actor_user_id,action,target_type,target_id,request_id,metadata) VALUES ($1,'platform.pincodes_opened','pincode','platform',$2,$3)`, [request.adminPrincipal!.userId, request.id, JSON.stringify({ requested: pins.length, removed: result.rowCount })]);
    return { removed: result.rowCount, requested: pins.length };
  });

  app.get('/v1/admin/ndr', { preHandler: requirePlatformAdmin }, async (request) => {
    const q = z.object({
      state: z.enum(['open', 'reattempt_requested', 'rto_requested', 'resolved']).optional(),
      sellerId: uuid.optional(),
      limit: z.coerce.number().int().min(1).max(200).default(50),
    }).parse(request.query);
    const result = await db.query(
      `SELECT n.id, n.state, n.reason_code, n.reason_detail, n.opened_at, n.resolved_at,
              s.legal_name AS seller_name, sh.awb, o.order_number
       FROM ndr_cases n
       JOIN shipments sh ON sh.id = n.shipment_id
       JOIN orders o ON o.id = sh.order_id
       JOIN sellers s ON s.id = n.seller_id
       WHERE ($1::ndr_state IS NULL OR n.state = $1) AND ($2::uuid IS NULL OR n.seller_id = $2)
       ORDER BY n.opened_at DESC LIMIT $3`,
      [q.state ?? null, q.sellerId ?? null, q.limit],
    );
    return { items: result.rows };
  });
}
