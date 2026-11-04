import argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { db } from '../db/client.js';
import { requireAccountAdmin, requireCommercialAdmin, requirePlatformAdmin } from '../lib/adminAuth.js';
import { sessionCookieOptions } from '../lib/cookies.js';
import { issueCsrfCookie, clearCsrfCookie } from '../lib/csrf.js';
import { calculateRate } from '../lib/money.js';
import { hashSessionToken, newSessionToken } from '../lib/session.js';

const uuid = z.string().uuid();
const BALANCE_SQL = `COALESCE(SUM(CASE WHEN entry_type IN ('credit','release') THEN amount_paise WHEN entry_type IN ('debit','hold') THEN -amount_paise ELSE amount_paise END),0)::bigint`;
const IMPERSONATION_MINUTES = 120;

// Only finance-accountable roles move money; analysts/support can look but not touch.
async function requireFinanceAdmin(request: FastifyRequest) {
  if (!['super_admin', 'finance_admin'].includes(request.adminPrincipal!.role)) {
    throw Object.assign(new Error('This administrator role cannot add or deduct wallet money'), { statusCode: 403 });
  }
}
async function requireImpersonationAdmin(request: FastifyRequest) {
  if (!['super_admin', 'operations_admin', 'support_admin'].includes(request.adminPrincipal!.role)) {
    throw Object.assign(new Error('This administrator role cannot view the seller panel as a seller'), { statusCode: 403 });
  }
}

const sellerParam = (request: FastifyRequest) => uuid.parse((request.params as { sellerId: string }).sellerId);
const adminAudit = (request: FastifyRequest, sellerId: string, action: string, targetType: string, targetId: string, metadata: Record<string, unknown>) =>
  db.query(
    `INSERT INTO audit_events (seller_id, actor_user_id, action, target_type, target_id, request_id, metadata) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [sellerId, request.adminPrincipal!.userId, action, targetType, targetId, request.id, JSON.stringify(metadata)],
  );

const range = z.object({ from: z.string().date().optional(), to: z.string().date().optional() });
const pocInput = z.object({
  kamName: z.string().trim().max(120).nullable().optional(),
  accountOpenedBy: z.string().trim().max(120).nullable().optional(),
  walletDebitLimitPaise: z.number().int().min(0).max(100_000_000_00).optional(),
  walletDebitApprovalPaise: z.number().int().min(0).max(100_000_000_00).optional(),
  walletDebitApprovedBy: z.string().trim().max(120).nullable().optional(),
  remittanceDays: z.number().int().min(1).max(7).optional(),
});
const noteInput = z.object({
  type: z.enum(['credit', 'debit']),
  amountPaise: z.number().int().min(100).max(100_000_000_00),
  reason: z.string().trim().min(3).max(300),
  idempotencyKey: z.string().min(8).max(100).optional(),
});

export async function impersonationContext(token: string | undefined) {
  if (!token) return null;
  const row = await db.query<{ session_id: string; admin_user_id: string; seller_id: string; admin_email: string; seller_name: string }>(
    `SELECT i.session_id, i.admin_user_id, i.seller_id, a.email AS admin_email, s.legal_name AS seller_name
     FROM sessions se JOIN impersonation_sessions i ON i.session_id = se.id JOIN users a ON a.id = i.admin_user_id JOIN sellers s ON s.id = i.seller_id
     WHERE se.token_hash = $1 AND se.revoked_at IS NULL AND se.expires_at > now()`,
    [hashSessionToken(token)],
  );
  return row.rows[0] ?? null;
}

// Writes made while viewing as a seller are attributed to the admin; a few account-level actions are off limits.
const FORBIDDEN_WHILE_IMPERSONATING = [/^\/v1\/auth\/(change-password|reset-password)/, /^\/v1\/seller\/team/, /^\/v1\/sessions/, /^\/v1\/impersonation\/start/];
export async function impersonationGuard(request: FastifyRequest, reply: FastifyReply) {
  if (request.method === 'GET' || request.method === 'HEAD' || request.method === 'OPTIONS') return;
  const ctx = await impersonationContext(request.cookies?.nx_session);
  if (!ctx) return;
  const path = request.url.split('?')[0];
  if (FORBIDDEN_WHILE_IMPERSONATING.some((re) => re.test(path))) {
    return reply.code(403).send({ error: 'IMPERSONATION_FORBIDDEN', message: 'This action is not available while viewing as a seller. Exit the seller view first.' });
  }
}
export async function impersonationAudit(request: FastifyRequest, reply: FastifyReply) {
  if (request.method === 'GET' || request.method === 'HEAD' || request.method === 'OPTIONS' || reply.statusCode >= 400) return;
  const ctx = await impersonationContext(request.cookies?.nx_session);
  if (!ctx || request.url.startsWith('/v1/impersonation')) return;
  await db.query(
    `INSERT INTO audit_events (seller_id, actor_user_id, action, target_type, target_id, request_id, metadata) VALUES ($1,$2,'impersonation.action','request',$3,$4,$5)`,
    [ctx.seller_id, ctx.admin_user_id, request.url.split('?')[0], request.id, JSON.stringify({ method: request.method, status: reply.statusCode, viaAdmin: ctx.admin_email })],
  );
}

export async function adminSellerProfileRoutes(app: FastifyInstance) {
  // --- Profile: everything the reference page shows, in one read -----------
  app.get('/v1/admin/sellers/:sellerId/profile', { preHandler: requirePlatformAdmin }, async (request, reply) => {
    const sellerId = sellerParam(request);
    const seller = await db.query(
      `SELECT s.id, s.legal_name, s.slug, s.nexgo_code, s.state, s.created_at, s.updated_at, s.remittance_days,
              s.kam_name, s.account_opened_by, s.wallet_debit_limit_paise, s.wallet_debit_approval_paise, s.wallet_debit_approved_by,
              owner.full_name AS owner_name, owner.email AS owner_email,
              (SELECT w.phone FROM warehouses w WHERE w.seller_id = s.id ORDER BY w.created_at LIMIT 1) AS mobile,
              COALESCE(k.status, 'unsubmitted') AS kyc_status, k.gstin, k.gst_applicable, k.pan, k.pan_holder_name, k.aadhaar_last4, k.entity_type, k.registered_address,
              k.bank_account_holder, COALESCE(k.bank_ifsc, ba.ifsc_code) AS bank_ifsc, ba.bank_name, ba.account_type AS bank_account_type, (k.bank_account_number_encrypted IS NOT NULL OR ba.id IS NOT NULL) AS has_bank_account, k.submitted_at, k.reviewed_at, rv.full_name AS kyc_reviewed_by,
              (SELECT ${BALANCE_SQL} FROM wallet_entries e WHERE e.seller_id = s.id) AS wallet_balance_paise,
              (SELECT count(*)::int FROM orders o WHERE o.seller_id = s.id) AS order_count,
              (SELECT count(*)::int FROM shipments sh WHERE sh.seller_id = s.id) AS shipment_count
       FROM sellers s
       LEFT JOIN seller_kyc k ON k.seller_id = s.id
       LEFT JOIN users rv ON rv.id = k.reviewed_by
       LEFT JOIN LATERAL (SELECT b.id, b.bank_name, b.account_type, b.ifsc_code FROM bank_accounts b WHERE b.seller_id = s.id AND b.is_active ORDER BY b.is_primary DESC, b.created_at LIMIT 1) ba ON true
       LEFT JOIN LATERAL (SELECT u.full_name, u.email FROM seller_memberships m JOIN users u ON u.id = m.user_id WHERE m.seller_id = s.id ORDER BY (m.role = 'owner') DESC, m.created_at LIMIT 1) owner ON true
       WHERE s.id = $1`,
      [sellerId],
    );
    if (!seller.rows[0]) return reply.code(404).send({ error: 'SELLER_NOT_FOUND' });
    const [rateCard, blocks] = await Promise.all([
      db.query(`SELECT id, name, effective_from FROM rate_cards WHERE seller_id = $1 AND state = 'active' ORDER BY effective_from DESC, created_at DESC LIMIT 1`, [sellerId]),
      db.query('SELECT count(*)::int AS count FROM seller_pincode_blocks WHERE seller_id = $1', [sellerId]),
    ]);
    return { ...seller.rows[0], activeRateCard: rateCard.rows[0] ?? null, blockedPincodeCount: blocks.rows[0].count };
  });

  // --- POC details + debit limit + remittance cycle -----------------------
  app.patch('/v1/admin/sellers/:sellerId/poc', { preHandler: [requirePlatformAdmin, requireAccountAdmin] }, async (request, reply) => {
    const sellerId = sellerParam(request);
    const input = pocInput.parse(request.body);
    const before = await db.query('SELECT kam_name, account_opened_by, wallet_debit_limit_paise, wallet_debit_approval_paise, wallet_debit_approved_by, remittance_days FROM sellers WHERE id = $1', [sellerId]);
    if (!before.rows[0]) return reply.code(404).send({ error: 'SELLER_NOT_FOUND' });
    // Limit / approval fields are money decisions: finance or super admin only, and never self-approved by naming oneself.
    const touchesMoney = input.walletDebitLimitPaise !== undefined || input.walletDebitApprovalPaise !== undefined || input.walletDebitApprovedBy !== undefined;
    if (touchesMoney) await requireFinanceAdmin(request);
    const result = await db.query(
      `UPDATE sellers SET kam_name = CASE WHEN $2::boolean THEN $3 ELSE kam_name END,
         account_opened_by = CASE WHEN $4::boolean THEN $5 ELSE account_opened_by END,
         wallet_debit_limit_paise = COALESCE($6, wallet_debit_limit_paise),
         wallet_debit_approval_paise = COALESCE($7, wallet_debit_approval_paise),
         wallet_debit_approved_by = CASE WHEN $8::boolean THEN $9 ELSE wallet_debit_approved_by END,
         remittance_days = COALESCE($10, remittance_days), updated_at = now()
       WHERE id = $1 RETURNING kam_name, account_opened_by, wallet_debit_limit_paise, wallet_debit_approval_paise, wallet_debit_approved_by, remittance_days`,
      [sellerId, input.kamName !== undefined, input.kamName ?? null, input.accountOpenedBy !== undefined, input.accountOpenedBy ?? null,
        input.walletDebitLimitPaise ?? null, input.walletDebitApprovalPaise ?? null, input.walletDebitApprovedBy !== undefined, input.walletDebitApprovedBy ?? null, input.remittanceDays ?? null],
    );
    await adminAudit(request, sellerId, 'seller.poc_updated', 'seller', sellerId, { before: before.rows[0], after: result.rows[0] });
    return result.rows[0];
  });

  // --- Update the owner's password ---------------------------------------
  app.post('/v1/admin/sellers/:sellerId/password', { preHandler: [requirePlatformAdmin, requireAccountAdmin], config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    const sellerId = sellerParam(request);
    const { password } = z.object({ password: z.string().min(12).max(200) }).parse(request.body);
    const owner = await db.query<{ user_id: string; email: string }>(
      `SELECT m.user_id, u.email FROM seller_memberships m JOIN users u ON u.id = m.user_id WHERE m.seller_id = $1 ORDER BY (m.role = 'owner') DESC, m.created_at LIMIT 1`, [sellerId]);
    if (!owner.rows[0]) return reply.code(404).send({ error: 'OWNER_NOT_FOUND' });
    const hash = await argon2.hash(password, { type: argon2.argon2id });
    await db.query('UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2', [hash, owner.rows[0].user_id]);
    await db.query('UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [owner.rows[0].user_id]);
    await adminAudit(request, sellerId, 'seller.password_updated', 'user', owner.rows[0].user_id, { email: owner.rows[0].email });
    return { ok: true, email: owner.rows[0].email };
  });

  // --- Rate card: view / assign -------------------------------------------
  app.get('/v1/admin/sellers/:sellerId/rate-card', { preHandler: requirePlatformAdmin }, async (request) => {
    const sellerId = sellerParam(request);
    const card = await db.query(`SELECT id, name, effective_from FROM rate_cards WHERE seller_id = $1 AND state = 'active' ORDER BY effective_from DESC, created_at DESC LIMIT 1`, [sellerId]);
    if (!card.rows[0]) return { card: null, rates: [] };
    const rates = await db.query(
      `SELECT cp.name AS provider_name, cs.display_name AS service_name, r.zone_code, r.min_weight_g, r.base_weight_g, r.base_price_paise, r.additional_weight_g, r.additional_price_paise,
              r.cod_fee_paise, r.cod_percent_bps, r.rto_base_price_paise, r.rto_additional_price_paise
       FROM rate_card_rates r JOIN courier_services cs ON cs.id = r.service_id JOIN courier_providers cp ON cp.id = cs.provider_id
       WHERE r.rate_card_id = $1 ORDER BY cp.name, cs.display_name, r.zone_code, r.min_weight_g`,
      [card.rows[0].id],
    );
    return { card: card.rows[0], rates: rates.rows };
  });

  // Rate cards screen: every seller with the card they currently have (name, since when, how many courier services are priced).
  app.get('/v1/admin/rate-cards/overview', { preHandler: requirePlatformAdmin }, async (request) => {
    const { search } = z.object({ search: z.string().trim().max(120).optional() }).parse(request.query);
    const like = search ? `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;
    const result = await db.query(
      `SELECT s.id, s.legal_name, s.nexgo_code, s.state, rc.id AS card_id, rc.name AS card_name, rc.effective_from,
              COALESCE(x.services, 0)::int AS services, COALESCE(x.couriers, '{}') AS couriers
       FROM sellers s
       LEFT JOIN LATERAL (SELECT id, name, effective_from FROM rate_cards WHERE seller_id = s.id AND state = 'active' ORDER BY effective_from DESC, created_at DESC LIMIT 1) rc ON true
       LEFT JOIN LATERAL (SELECT count(DISTINCT r.service_id) AS services, array_agg(DISTINCT cp.name) AS couriers
                          FROM rate_card_rates r JOIN courier_services cs ON cs.id = r.service_id JOIN courier_providers cp ON cp.id = cs.provider_id WHERE r.rate_card_id = rc.id) x ON true
       WHERE ($1::text IS NULL OR s.legal_name ILIKE $1 OR s.nexgo_code ILIKE $1)
       ORDER BY s.legal_name LIMIT 300`, [like]);
    return { items: result.rows };
  });

  // Everything the "Assign courier and rates" screen needs for one seller: all bookable courier services, whether the seller can use each, and the current card's rows.
  app.get('/v1/admin/sellers/:sellerId/rate-setup', { preHandler: requirePlatformAdmin }, async (request, reply) => {
    const sellerId = sellerParam(request);
    const seller = await db.query('SELECT id, legal_name, nexgo_code FROM sellers WHERE id = $1', [sellerId]);
    if (!seller.rows[0]) return reply.code(404).send({ error: 'SELLER_NOT_FOUND' });
    const services = await db.query(
      `SELECT cs.id, cs.code, cs.display_name AS name, cs.service_type AS type, cp.code AS provider_code, cp.name AS provider_name, cp.aggregator, cp.supports_cod,
              sca.state AS access_state, sca.cod_enabled
       FROM courier_services cs JOIN courier_providers cp ON cp.id = cs.provider_id AND cp.integration_state = 'live'
       LEFT JOIN seller_courier_access sca ON sca.service_id = cs.id AND sca.seller_id = $1
       WHERE cs.is_active ORDER BY cp.name, cs.display_name`, [sellerId]);
    const card = await db.query(`SELECT id, name, effective_from FROM rate_cards WHERE seller_id = $1 AND state = 'active' ORDER BY effective_from DESC, created_at DESC LIMIT 1`, [sellerId]);
    const rates = card.rows[0] ? (await db.query(
      `SELECT service_id, zone_code, min_weight_g, base_weight_g, base_price_paise, additional_weight_g, additional_price_paise, cod_fee_paise, cod_percent_bps, fuel_surcharge_bps, rto_base_price_paise, rto_additional_price_paise
       FROM rate_card_rates WHERE rate_card_id = $1 ORDER BY service_id, min_weight_g, zone_code`, [card.rows[0].id])).rows : [];
    return { seller: seller.rows[0], services: services.rows, card: card.rows[0] ?? null, rates };
  });

  // Every active card that can be copied onto a seller (platform courier-cost card excluded).
  app.get('/v1/admin/rate-cards', { preHandler: requirePlatformAdmin }, async () => {
    const result = await db.query(
      `SELECT DISTINCT ON (rc.seller_id) rc.id, rc.name, rc.effective_from, s.legal_name AS seller_name, s.nexgo_code
       FROM rate_cards rc JOIN sellers s ON s.id = rc.seller_id WHERE rc.state = 'active'
       ORDER BY rc.seller_id, rc.effective_from DESC, rc.created_at DESC`,
    );
    return { items: result.rows };
  });

  app.post('/v1/admin/sellers/:sellerId/assign-rate-card', { preHandler: [requirePlatformAdmin, requireCommercialAdmin] }, async (request, reply) => {
    const sellerId = sellerParam(request);
    const { sourceRateCardId } = z.object({ sourceRateCardId: uuid }).parse(request.body);
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const source = await client.query<{ name: string; seller_id: string | null }>(`SELECT name, seller_id FROM rate_cards WHERE id = $1 AND state = 'active'`, [sourceRateCardId]);
      if (!source.rows[0] || source.rows[0].seller_id === null) { await client.query('ROLLBACK'); return reply.code(404).send({ error: 'RATE_CARD_NOT_FOUND' }); }
      // A new immutable card: in-flight shipments keep the price they were booked at.
      const card = await client.query<{ id: string }>(
        `INSERT INTO rate_cards (seller_id, name, state, effective_from, created_by) VALUES ($1, $2, 'active', now(), $3) RETURNING id`,
        [sellerId, `${source.rows[0].name} (assigned)`, request.adminPrincipal!.userId]);
      await client.query(
        `INSERT INTO rate_card_rates (rate_card_id, service_id, zone_code, min_weight_g, base_weight_g, base_price_paise, additional_weight_g, additional_price_paise, cod_fee_paise, fuel_surcharge_bps, cod_percent_bps, rto_base_price_paise, rto_additional_price_paise)
         SELECT $1, service_id, zone_code, min_weight_g, base_weight_g, base_price_paise, additional_weight_g, additional_price_paise, cod_fee_paise, fuel_surcharge_bps, cod_percent_bps, rto_base_price_paise, rto_additional_price_paise
         FROM rate_card_rates WHERE rate_card_id = $2`,
        [card.rows[0].id, sourceRateCardId]);
      await client.query(
        `INSERT INTO audit_events (seller_id, actor_user_id, action, target_type, target_id, request_id, metadata) VALUES ($1,$2,'rate_card.assigned','rate_card',$3,$4,$5)`,
        [sellerId, request.adminPrincipal!.userId, card.rows[0].id, request.id, JSON.stringify({ sourceRateCardId })]);
      await client.query('COMMIT');
      return { id: card.rows[0].id };
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  });

  // --- Wallet notes: credit note adds money, debit note deducts ------------
  app.post('/v1/admin/sellers/:sellerId/wallet-notes', { preHandler: [requirePlatformAdmin, requireFinanceAdmin] }, async (request, reply) => {
    const sellerId = sellerParam(request);
    const input = noteInput.parse(request.body);
    const key = `admin-note:${input.idempotencyKey ?? randomUUID()}`;
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))', [`wallet:${sellerId}`]);
      const exists = await client.query('SELECT 1 FROM sellers WHERE id = $1', [sellerId]);
      if (!exists.rows[0]) { await client.query('ROLLBACK'); return reply.code(404).send({ error: 'SELLER_NOT_FOUND' }); }
      const dup = await client.query('SELECT id FROM wallet_entries WHERE seller_id = $1 AND idempotency_key = $2', [sellerId, key]);
      if (!dup.rows[0]) {
        const noteNo = `${input.type === 'credit' ? 'CN' : 'DN'}-${Date.now().toString(36).toUpperCase()}`;
        await client.query(
          `INSERT INTO wallet_entries (seller_id, entry_type, amount_paise, reference_type, reference_id, idempotency_key, description, metadata)
           VALUES ($1, $2::wallet_entry_type, $3, $4, $5, $6, $7, $8)`,
          [sellerId, input.type, input.amountPaise, input.type === 'credit' ? 'credit_note' : 'debit_note', noteNo, key,
            `${input.type === 'credit' ? 'Credit note' : 'Debit note'}: ${input.reason}`, JSON.stringify({ adminUserId: request.adminPrincipal!.userId, adminRole: request.adminPrincipal!.role })]);
        await client.query(
          `INSERT INTO audit_events (seller_id, actor_user_id, action, target_type, target_id, request_id, metadata) VALUES ($1,$2,$3,'wallet_note',$4,$5,$6)`,
          [sellerId, request.adminPrincipal!.userId, `wallet.${input.type}_note`, noteNo, request.id, JSON.stringify({ amountPaise: input.amountPaise, reason: input.reason })]);
      }
      const balance = await client.query<{ b: string }>(`SELECT ${BALANCE_SQL} AS b FROM wallet_entries WHERE seller_id = $1`, [sellerId]);
      await client.query('COMMIT');
      return { ok: true, replay: !!dup.rows[0], walletBalancePaise: Number(balance.rows[0].b) };
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  });

  // --- Pincode access: block pincodes for one seller (optionally one courier) -
  app.get('/v1/admin/sellers/:sellerId/pincode-blocks', { preHandler: requirePlatformAdmin }, async (request) => {
    const sellerId = sellerParam(request);
    const result = await db.query(
      `SELECT b.id, b.pincode, b.note, b.created_at, cp.name AS provider_name, cs.display_name AS service_name
       FROM seller_pincode_blocks b LEFT JOIN courier_services cs ON cs.id = b.service_id LEFT JOIN courier_providers cp ON cp.id = cs.provider_id
       WHERE b.seller_id = $1 ORDER BY b.created_at DESC, b.pincode LIMIT 2000`, [sellerId]);
    return { items: result.rows };
  });

  app.post('/v1/admin/sellers/:sellerId/pincode-blocks', { preHandler: [requirePlatformAdmin, requireCommercialAdmin] }, async (request) => {
    const sellerId = sellerParam(request);
    const input = z.object({ pincodes: z.array(z.string().regex(/^\d{6}$/)).min(1).max(5000), serviceId: uuid.nullable().optional(), note: z.string().trim().max(200).optional() }).parse(request.body);
    const pins = [...new Set(input.pincodes)];
    const result = await db.query(
      `INSERT INTO seller_pincode_blocks (seller_id, service_id, pincode, note, created_by)
       SELECT $1, $2, p, $3, $4 FROM unnest($5::text[]) AS p ON CONFLICT DO NOTHING RETURNING id`,
      [sellerId, input.serviceId ?? null, input.note ?? null, request.adminPrincipal!.userId, pins]);
    await adminAudit(request, sellerId, 'seller.pincodes_blocked', 'seller', sellerId, { requested: pins.length, added: result.rowCount, serviceId: input.serviceId ?? null });
    return { added: result.rowCount, requested: pins.length };
  });

  app.post('/v1/admin/sellers/:sellerId/pincode-blocks/remove', { preHandler: [requirePlatformAdmin, requireCommercialAdmin] }, async (request) => {
    const sellerId = sellerParam(request);
    const input = z.object({ pincodes: z.array(z.string().regex(/^\d{6}$/)).max(5000).optional(), all: z.boolean().optional() }).parse(request.body);
    if (!input.all && !input.pincodes?.length) throw Object.assign(new Error('Pick pincodes to unblock or choose clear all'), { statusCode: 400 });
    const result = await db.query(
      `DELETE FROM seller_pincode_blocks WHERE seller_id = $1 AND ($2::boolean OR pincode = ANY($3::text[]))`, [sellerId, !!input.all, input.pincodes ?? []]);
    await adminAudit(request, sellerId, 'seller.pincodes_unblocked', 'seller', sellerId, { removed: result.rowCount, all: !!input.all });
    return { removed: result.rowCount };
  });

  // --- Seller performance + profitability ---------------------------------
  app.get('/v1/admin/sellers/:sellerId/performance', { preHandler: requirePlatformAdmin }, async (request) => {
    const sellerId = sellerParam(request);
    const q = range.parse(request.query);
    const result = await db.query<{ packets: number; delivered: number; rto: number; ndr: number; in_transit: number; cancelled: number }>(
      `SELECT count(*) FILTER (WHERE state <> 'cancelled')::int AS packets,
              count(*) FILTER (WHERE state = 'delivered')::int AS delivered,
              count(*) FILTER (WHERE state = 'rto')::int AS rto,
              count(*) FILTER (WHERE state = 'ndr')::int AS ndr,
              count(*) FILTER (WHERE state IN ('booked','in_transit','out_for_delivery'))::int AS in_transit,
              count(*) FILTER (WHERE state = 'cancelled')::int AS cancelled
       FROM shipments WHERE seller_id = $1
         AND ($2::date IS NULL OR (created_at AT TIME ZONE 'Asia/Kolkata')::date >= $2)
         AND ($3::date IS NULL OR (created_at AT TIME ZONE 'Asia/Kolkata')::date <= $3)`,
      [sellerId, q.from ?? null, q.to ?? null]);
    const r = result.rows[0];
    // Delivery % = delivered / packets booked (cancelled excluded) in the booking-date window.
    return { ...r, deliveryPercent: r.packets ? Math.round((r.delivered / r.packets) * 1000) / 10 : 0 };
  });

  // Profit = Σ (rate given to the seller − rate got from the courier) over packets in the window.
  // The courier rate is the active platform cost card (seller_id NULL) priced with the same slab maths.
  app.get('/v1/admin/sellers/:sellerId/profitability', { preHandler: requirePlatformAdmin }, async (request) => {
    const sellerId = sellerParam(request);
    const q = range.parse(request.query);
    const costCard = await db.query<{ id: string }>(`SELECT id FROM rate_cards WHERE seller_id IS NULL AND state = 'active' ORDER BY effective_from DESC, created_at DESC LIMIT 1`);
    const shipments = await db.query<{ id: string; service_id: string; shipping_charge_paise: number; chargeable_weight_g: number; zone: string | null; payment_mode: string | null; cod_value: string | null }>(
      `SELECT sh.id, sh.service_id, sh.shipping_charge_paise, sh.chargeable_weight_g, sh.quote_snapshot->>'zone' AS zone, sh.quote_snapshot->>'paymentMode' AS payment_mode,
              (o.cod_amount_paise)::text AS cod_value
       FROM shipments sh JOIN orders o ON o.id = sh.order_id
       WHERE sh.seller_id = $1 AND sh.state <> 'cancelled'
         AND ($2::date IS NULL OR (sh.created_at AT TIME ZONE 'Asia/Kolkata')::date >= $2)
         AND ($3::date IS NULL OR (sh.created_at AT TIME ZONE 'Asia/Kolkata')::date <= $3)`,
      [sellerId, q.from ?? null, q.to ?? null]);
    const rates = costCard.rows[0]
      ? (await db.query(`SELECT * FROM rate_card_rates WHERE rate_card_id = $1`, [costCard.rows[0].id])).rows as Array<Record<string, any>>
      : [];
    let sellerChargedPaise = 0; let courierCostPaise = 0; let costedPackets = 0;
    for (const s of shipments.rows) {
      sellerChargedPaise += s.shipping_charge_paise;
      const zone = s.zone ?? 'national';
      const rate = rates.filter((r) => r.service_id === s.service_id && [zone, 'national'].includes(r.zone_code) && r.min_weight_g <= s.chargeable_weight_g)
        .sort((a, b) => Number(b.zone_code === zone) - Number(a.zone_code === zone) || b.min_weight_g - a.min_weight_g)[0];
      if (!rate) continue;
      costedPackets += 1;
      courierCostPaise += calculateRate(rate as never, s.chargeable_weight_g, s.payment_mode === 'cod', Number(s.cod_value ?? 0)).totalPaise;
    }
    const packets = shipments.rows.length;
    // Only packets with a known courier rate contribute to profit, so the figure is never inflated by missing costs.
    const costedCharged = shipments.rows.reduce((sum, s) => {
      const zone = s.zone ?? 'national';
      const has = rates.some((r) => r.service_id === s.service_id && [zone, 'national'].includes(r.zone_code) && r.min_weight_g <= s.chargeable_weight_g);
      return sum + (has ? s.shipping_charge_paise : 0);
    }, 0);
    return {
      packets, costedPackets, costCardConfigured: !!costCard.rows[0],
      sellerChargedPaise, courierCostPaise, profitPaise: costedCharged - courierCostPaise,
    };
  });

  // --- View as seller (impersonation) -------------------------------------
  app.post('/v1/admin/sellers/:sellerId/impersonate', { preHandler: [requirePlatformAdmin, requireImpersonationAdmin] }, async (request, reply) => {
    const sellerId = sellerParam(request);
    const adminToken = request.cookies.nx_session!;
    if (await impersonationContext(adminToken)) return reply.code(409).send({ error: 'ALREADY_IMPERSONATING' });
    const owner = await db.query<{ user_id: string; legal_name: string; state: string }>(
      `SELECT m.user_id, s.legal_name, s.state FROM sellers s JOIN seller_memberships m ON m.seller_id = s.id WHERE s.id = $1 ORDER BY (m.role = 'owner') DESC, m.created_at LIMIT 1`, [sellerId]);
    if (!owner.rows[0]) return reply.code(404).send({ error: 'SELLER_NOT_FOUND' });
    if (owner.rows[0].state === 'suspended') return reply.code(409).send({ error: 'SELLER_SUSPENDED', message: 'Restore the seller before viewing their panel' });
    const token = newSessionToken();
    const session = await db.query<{ id: string }>(
      `INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1,$2, now() + interval '${IMPERSONATION_MINUTES} minutes') RETURNING id`, [owner.rows[0].user_id, hashSessionToken(token)]);
    await db.query('INSERT INTO impersonation_sessions (session_id, admin_user_id, seller_id) VALUES ($1,$2,$3)', [session.rows[0].id, request.adminPrincipal!.userId, sellerId]);
    await adminAudit(request, sellerId, 'impersonation.started', 'seller', sellerId, { expiresInMinutes: IMPERSONATION_MINUTES });
    // The admin's own session is parked in a separate httpOnly cookie and restored on exit.
    const opts = { ...sessionCookieOptions(), maxAge: IMPERSONATION_MINUTES * 60 };
    reply.setCookie('nx_admin_return', adminToken, opts);
    reply.setCookie('nx_session', token, opts);
    issueCsrfCookie(reply, token);
    return { ok: true, sellerName: owner.rows[0].legal_name };
  });

  app.get('/v1/impersonation', async (request) => {
    const ctx = await impersonationContext(request.cookies.nx_session);
    return ctx ? { active: true, sellerName: ctx.seller_name, adminEmail: ctx.admin_email } : { active: false };
  });

  app.post('/v1/impersonation/exit', async (request, reply) => {
    const ctx = await impersonationContext(request.cookies.nx_session);
    const back = request.cookies.nx_admin_return;
    if (!ctx) return reply.code(409).send({ error: 'NOT_IMPERSONATING' });
    await db.query('UPDATE sessions SET revoked_at = now() WHERE id = $1', [ctx.session_id]);
    await db.query(
      `INSERT INTO audit_events (seller_id, actor_user_id, action, target_type, target_id, request_id, metadata) VALUES ($1,$2,'impersonation.ended','seller',$3,$4,'{}')`,
      [ctx.seller_id, ctx.admin_user_id, ctx.seller_id, request.id]);
    reply.clearCookie('nx_admin_return', { path: '/' });
    if (back) { reply.setCookie('nx_session', back, sessionCookieOptions()); issueCsrfCookie(reply, back); } else { reply.clearCookie('nx_session', { path: '/' }); clearCsrfCookie(reply); }
    return { ok: true, sellerId: ctx.seller_id };
  });
}

