import type { FastifyInstance } from 'fastify';
import { db } from '../db/client.js';
import { hashSessionToken } from '../lib/session.js';
import { z } from 'zod';
import argon2 from 'argon2';
import { config } from '../config.js';
import { newSessionToken } from '../lib/session.js';
import { requirePlatformAdmin, requireCommercialAdmin } from '../lib/adminAuth.js';
import { sessionCookieOptions } from '../lib/cookies.js';
import { issueCsrfCookie, clearCsrfCookie } from '../lib/csrf.js';

const courierInput = z.object({
  code: z.string().regex(/^[a-z0-9-]{2,64}$/),
  name: z.string().min(2).max(120),
  integrationState: z.enum(['sandbox', 'live', 'maintenance', 'disabled']).default('sandbox'),
  supportsCod: z.boolean().default(false),
  supportsReverse: z.boolean().default(false),
  services: z.array(z.object({
    code: z.string().regex(/^[a-z0-9-]{2,64}$/),
    displayName: z.string().min(2).max(120),
    serviceType: z.enum(['surface', 'express', 'air', 'reverse']),
  })).min(1).max(20),
});

const accessInput = z.object({
  serviceId: z.string().uuid(),
  accountMode: z.enum(['platform', 'seller_owned']).default('platform'),
  state: z.enum(['enabled', 'disabled']).default('enabled'),
  codEnabled: z.boolean().default(false),
  autoAssignEligible: z.boolean().default(true),
});

const rateCardInput = z.object({
  name: z.string().min(2).max(120),
  effectiveFrom: z.string().datetime().optional(),
  rates: z.array(z.object({
    serviceId: z.string().uuid(),
    zoneCode: z.string().min(2).max(40).default('national'),
    minWeightG: z.number().int().min(0).default(0),
    baseWeightG: z.number().int().min(1).default(500),
    basePricePaise: z.number().int().min(0),
    additionalWeightG: z.number().int().min(1).default(500),
    additionalPricePaise: z.number().int().min(0).default(0),
    codFeePaise: z.number().int().min(0).default(0),
    fuelSurchargeBps: z.number().int().min(0).max(10_000).default(0),
  })).min(1).max(500),
});
const pincodeRuleInput = z.object({ serviceId: z.string().uuid(), destinationPrefix: z.string().regex(/^\d{1,6}$/), ruleType: z.enum(['allowed', 'blocked']), note: z.string().trim().max(500).optional() });

const adminLoginInput = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(200),
});

export async function adminRoutes(app: FastifyInstance) {
  app.post('/v1/admin/auth/login', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    const input = adminLoginInput.parse(request.body);
    const account = await db.query<{ user_id: string; password_hash: string; role: string; full_name: string; mfa_required: boolean; totp_enrolled_at: string | null }>(
      `SELECT pa.user_id, u.password_hash, pa.role, u.full_name, pa.mfa_required, pa.totp_enrolled_at
       FROM platform_admins pa JOIN users u ON u.id = pa.user_id
       WHERE u.email = $1`, [input.email.toLowerCase()],
    );
    const admin = account.rows[0];
    if (!admin || !(await argon2.verify(admin.password_hash, input.password))) {
      return reply.code(401).send({ error: 'INVALID_CREDENTIALS' });
    }
    // MFA is only enforceable once an admin has actually enrolled a device —
    // an admin with mfa_required=true but no enrolled secret still logs in
    // with password alone and is expected to enroll immediately after.
    if (admin.mfa_required && admin.totp_enrolled_at) {
      const mfaToken = newSessionToken();
      await db.query(`INSERT INTO admin_mfa_challenges (user_id, token_hash, expires_at) VALUES ($1,$2, now() + interval '5 minutes')`, [admin.user_id, hashSessionToken(mfaToken)]);
      return reply.code(202).send({ requiresMfa: true, mfaToken });
    }
    const token = newSessionToken();
    const session = await db.query<{ expires_at: string }>(
      `INSERT INTO sessions (user_id, token_hash, expires_at, user_agent, ip_address)
       VALUES ($1, $2, now() + ($3 || ' days')::interval, $4, $5) RETURNING expires_at`,
      [admin.user_id, hashSessionToken(token), String(config.SESSION_TTL_DAYS), request.headers['user-agent'] ?? null, request.ip],
    );
    reply.setCookie('nx_session', token, sessionCookieOptions());
    issueCsrfCookie(reply);
    return { userId: admin.user_id, fullName: admin.full_name, role: admin.role, expiresAt: session.rows[0].expires_at };
  });

  app.post('/v1/admin/auth/logout', { preHandler: requirePlatformAdmin }, async (request, reply) => {
    const token = request.cookies.nx_session;
    if (token) await db.query('UPDATE sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL', [hashSessionToken(token)]);
    reply.clearCookie('nx_session', { path: '/' });
    clearCsrfCookie(reply);
    return reply.code(204).send();
  });

  app.get('/v1/admin/me', { preHandler: requirePlatformAdmin }, async (request) => {
    const row = await db.query<{ full_name: string; email: string }>('SELECT full_name, email FROM users WHERE id = $1', [request.adminPrincipal!.userId]);
    return { userId: request.adminPrincipal!.userId, role: request.adminPrincipal!.role, fullName: row.rows[0]?.full_name ?? '', email: row.rows[0]?.email ?? '' };
  });

  // Seller lifecycle (list/detail/state transitions) lives in adminOperations.ts
  // alongside the other cross-tenant queues, so it isn't split across two files.

  app.get('/v1/admin/couriers', { preHandler: requirePlatformAdmin }, async () => {
    const result = await db.query(
      `SELECT cp.id, cp.code, cp.name, cp.integration_state, cp.supports_cod, cp.supports_reverse,
              COALESCE(json_agg(json_build_object('id', cs.id, 'code', cs.code, 'name', cs.display_name, 'type', cs.service_type))
                FILTER (WHERE cs.id IS NOT NULL), '[]') AS services
       FROM courier_providers cp
       LEFT JOIN courier_services cs ON cs.provider_id = cp.id
       GROUP BY cp.id ORDER BY cp.name`,
    );
    return { items: result.rows };
  });

  app.get('/v1/admin/courier-pincode-rules', { preHandler: requirePlatformAdmin }, async () => {
    const result = await db.query(`SELECT r.*,cp.name AS provider_name,cs.display_name AS service_name FROM courier_pincode_rules r JOIN courier_services cs ON cs.id=r.service_id JOIN courier_providers cp ON cp.id=cs.provider_id ORDER BY cp.name,cs.display_name,r.destination_prefix`);
    return { items: result.rows };
  });
  app.post('/v1/admin/courier-pincode-rules', { preHandler: [requirePlatformAdmin, requireCommercialAdmin] }, async (request, reply) => {
    const input = pincodeRuleInput.parse(request.body);
    const result = await db.query(`INSERT INTO courier_pincode_rules (service_id,destination_prefix,rule_type,note,created_by) VALUES ($1,$2,$3::pincode_rule_type,$4,$5) RETURNING *`, [input.serviceId, input.destinationPrefix, input.ruleType, input.note ?? null, request.adminPrincipal!.userId]);
    await db.query(`INSERT INTO audit_events (actor_user_id,action,target_type,target_id,request_id,metadata) VALUES ($1,'courier.pincode_rule.created','courier_pincode_rule',$2,$3,$4)`, [request.adminPrincipal!.userId, result.rows[0].id, request.id, JSON.stringify(input)]);
    return reply.code(201).send(result.rows[0]);
  });
  app.delete('/v1/admin/courier-pincode-rules/:ruleId', { preHandler: [requirePlatformAdmin, requireCommercialAdmin] }, async (request, reply) => {
    const ruleId = z.string().uuid().parse((request.params as { ruleId: string }).ruleId);
    const result = await db.query('DELETE FROM courier_pincode_rules WHERE id=$1 RETURNING id', [ruleId]);
    if (!result.rows[0]) return reply.code(404).send({ error: 'PINCODE_RULE_NOT_FOUND' });
    await db.query(`INSERT INTO audit_events (actor_user_id,action,target_type,target_id,request_id) VALUES ($1,'courier.pincode_rule.deleted','courier_pincode_rule',$2,$3)`, [request.adminPrincipal!.userId, ruleId, request.id]);
    return reply.code(204).send();
  });

  app.post('/v1/admin/couriers', { preHandler: [requirePlatformAdmin, requireCommercialAdmin] }, async (request) => {
    const input = courierInput.parse(request.body);
    const provider = await db.query<{ id: string }>(
      `INSERT INTO courier_providers (code, name, integration_state, supports_cod, supports_reverse)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [input.code, input.name, input.integrationState, input.supportsCod, input.supportsReverse],
    );
    const providerId = provider.rows[0].id;
    for (const service of input.services) {
      await db.query(
        'INSERT INTO courier_services (provider_id, code, display_name, service_type) VALUES ($1, $2, $3, $4)',
        [providerId, service.code, service.displayName, service.serviceType],
      );
    }
    await db.query(
      `INSERT INTO audit_events (actor_user_id, action, target_type, target_id, request_id, metadata)
       VALUES ($1, 'courier.created', 'courier_provider', $2, $3, $4)`,
      [request.adminPrincipal!.userId, providerId, request.id, JSON.stringify({ code: input.code })],
    );
    return { id: providerId };
  });

  app.put('/v1/admin/sellers/:sellerId/courier-access', { preHandler: [requirePlatformAdmin, requireCommercialAdmin] }, async (request) => {
    const sellerId = z.string().uuid().parse((request.params as { sellerId: string }).sellerId);
    const input = accessInput.parse(request.body);
    await db.query(
      `INSERT INTO seller_courier_access (seller_id, service_id, account_mode, state, cod_enabled, auto_assign_eligible)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (seller_id, service_id) DO UPDATE SET account_mode = EXCLUDED.account_mode, state = EXCLUDED.state,
         cod_enabled = EXCLUDED.cod_enabled, auto_assign_eligible = EXCLUDED.auto_assign_eligible, updated_at = now()`,
      [sellerId, input.serviceId, input.accountMode, input.state, input.codEnabled, input.autoAssignEligible],
    );
    await db.query(
      `INSERT INTO audit_events (seller_id, actor_user_id, action, target_type, target_id, request_id, metadata)
       VALUES ($1, $2, 'seller.courier_access.updated', 'courier_service', $3, $4, $5)`,
      [sellerId, request.adminPrincipal!.userId, input.serviceId, request.id, JSON.stringify(input)],
    );
    return { ok: true };
  });

  app.post('/v1/admin/sellers/:sellerId/rate-cards', { preHandler: [requirePlatformAdmin, requireCommercialAdmin] }, async (request) => {
    const sellerId = z.string().uuid().parse((request.params as { sellerId: string }).sellerId);
    const input = rateCardInput.parse(request.body);
    const card = await db.query<{ id: string }>(
      `INSERT INTO rate_cards (seller_id, name, state, effective_from, created_by)
       VALUES ($1, $2, 'active', COALESCE($3::timestamptz, now()), $4) RETURNING id`,
      [sellerId, input.name, input.effectiveFrom ?? null, request.adminPrincipal!.userId],
    );
    const rateCardId = card.rows[0].id;
    // A commercial edit is a new immutable snapshot. Start from the previous
    // active card so changing one courier never accidentally removes all
    // other seller options from the next quote.
    await db.query(
      `INSERT INTO rate_card_rates (rate_card_id, service_id, zone_code, min_weight_g, base_weight_g, base_price_paise,
        additional_weight_g, additional_price_paise, cod_fee_paise, fuel_surcharge_bps)
       SELECT $1, r.service_id, r.zone_code, r.min_weight_g, r.base_weight_g, r.base_price_paise,
         r.additional_weight_g, r.additional_price_paise, r.cod_fee_paise, r.fuel_surcharge_bps
       FROM rate_card_rates r
       WHERE r.rate_card_id = (SELECT id FROM rate_cards WHERE seller_id=$2 AND state='active' AND id <> $1 ORDER BY effective_from DESC, created_at DESC LIMIT 1)`,
      [rateCardId, sellerId],
    );
    for (const rate of input.rates) {
      await db.query(
        `INSERT INTO rate_card_rates (rate_card_id, service_id, zone_code, min_weight_g, base_weight_g, base_price_paise,
          additional_weight_g, additional_price_paise, cod_fee_paise, fuel_surcharge_bps)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (rate_card_id, service_id, zone_code, min_weight_g) DO UPDATE SET
          base_weight_g=EXCLUDED.base_weight_g, base_price_paise=EXCLUDED.base_price_paise,
          additional_weight_g=EXCLUDED.additional_weight_g, additional_price_paise=EXCLUDED.additional_price_paise,
          cod_fee_paise=EXCLUDED.cod_fee_paise, fuel_surcharge_bps=EXCLUDED.fuel_surcharge_bps`,
        [rateCardId, rate.serviceId, rate.zoneCode, rate.minWeightG, rate.baseWeightG, rate.basePricePaise,
          rate.additionalWeightG, rate.additionalPricePaise, rate.codFeePaise, rate.fuelSurchargeBps],
      );
    }
    await db.query(
      `INSERT INTO audit_events (seller_id, actor_user_id, action, target_type, target_id, request_id, metadata)
       VALUES ($1, $2, 'rate_card.published', 'rate_card', $3, $4, $5)`,
      [sellerId, request.adminPrincipal!.userId, rateCardId, request.id, JSON.stringify({ name: input.name, rateCount: input.rates.length })],
    );
    return { id: rateCardId, state: 'active' };
  });
}
