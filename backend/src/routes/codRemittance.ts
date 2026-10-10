import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { db, withSellerTransaction, withTransaction } from '../db/client.js';
import { requireAccountAdmin, requirePlatformAdmin } from '../lib/adminAuth.js';
import { requireSeller } from './seller.js';

function principal(request: FastifyRequest) {
  if (!request.principal) throw Object.assign(new Error('Authentication required'), { statusCode: 401 });
  return request.principal;
}

const generateInput = z.object({ sellerId: z.string().uuid(), cycleStart: z.string().date(), cycleEnd: z.string().date() });

export async function codRemittanceRoutes(app: FastifyInstance) {
  app.post('/v1/admin/cod-remittances/generate', { preHandler: [requirePlatformAdmin, requireAccountAdmin] }, async (request, reply) => {
    const input = generateInput.parse(request.body);
    if (input.cycleEnd < input.cycleStart) return reply.code(400).send({ error: 'INVALID_CYCLE' });
    const cycle = await withTransaction(async (client) => {
      // Serialise per seller so two overlapping cycles can never be generated concurrently.
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))', [`cod:${input.sellerId}`]);
      const overlap = await client.query('SELECT 1 FROM cod_remittance_cycles WHERE seller_id=$1 AND cycle_start<=$3::date AND cycle_end>=$2::date LIMIT 1', [input.sellerId, input.cycleStart, input.cycleEnd]);
      if (overlap.rows[0]) throw Object.assign(new Error('This period overlaps an existing COD remittance cycle for the seller'), { statusCode: 409 });
      // COD is owed once the parcel is delivered, so cycles are cut on delivery date (booking date for legacy rows without one).
      const totals = await client.query<{ shipment_count: string; cod_collected: string; charges_deducted: string }>(
        `SELECT count(*)::int AS shipment_count, COALESCE(SUM(o.cod_amount_paise),0)::bigint AS cod_collected,
                COALESCE(SUM(sh.shipping_charge_paise),0)::bigint AS charges_deducted
         FROM shipments sh JOIN orders o ON o.id = sh.order_id
         WHERE sh.seller_id = $1 AND sh.state = 'delivered' AND o.payment_mode = 'cod'
           AND COALESCE(sh.delivered_at, sh.booked_at)::date BETWEEN $2 AND $3`,
        [input.sellerId, input.cycleStart, input.cycleEnd],
      );
      const row = totals.rows[0];
      if (Number(row.shipment_count) === 0) throw Object.assign(new Error('No delivered COD shipments in this period'), { statusCode: 422 });
      if (BigInt(row.charges_deducted) > BigInt(row.cod_collected)) throw Object.assign(new Error('Shipping charges exceed the COD collected for this period; settle the difference through the wallet first'), { statusCode: 422 });
      // D+N: D is the delivery date. The cycle is payable N days after its latest delivery (N = the seller's remittance_days).
      const due = await client.query<{ due: string }>(
        `SELECT (max(COALESCE(sh.delivered_at, sh.booked_at)::date) + (SELECT remittance_days FROM sellers WHERE id = $1)::int)::text AS due
         FROM shipments sh JOIN orders o ON o.id = sh.order_id
         WHERE sh.seller_id = $1 AND sh.state = 'delivered' AND o.payment_mode = 'cod' AND COALESCE(sh.delivered_at, sh.booked_at)::date BETWEEN $2 AND $3`,
        [input.sellerId, input.cycleStart, input.cycleEnd],
      );
      const result = await client.query(
        `INSERT INTO cod_remittance_cycles (seller_id, cycle_start, cycle_end, shipment_count, cod_collected_paise, charges_deducted_paise, net_remitted_paise, due_date)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [input.sellerId, input.cycleStart, input.cycleEnd, row.shipment_count, row.cod_collected, row.charges_deducted, BigInt(row.cod_collected) - BigInt(row.charges_deducted), due.rows[0]?.due ?? null],
      );
      await client.query(
        `INSERT INTO audit_events (seller_id, actor_user_id, action, target_type, target_id, request_id, metadata)
         VALUES ($1,$2,'cod_remittance.generated','cod_remittance_cycle',$3,$4,$5)`,
        [input.sellerId, request.adminPrincipal!.userId, result.rows[0].id, request.id, JSON.stringify({ shipmentCount: row.shipment_count })],
      );
      return result.rows[0];
    });
    return reply.code(201).send(cycle);
  });

  app.post('/v1/admin/cod-remittances/:cycleId/approve', { preHandler: [requirePlatformAdmin, requireAccountAdmin] }, async (request, reply) => {
    const cycleId = z.string().uuid().parse((request.params as { cycleId: string }).cycleId);
    const outcome = await withTransaction(async (client) => {
      // Status change and audit row commit together; the WHERE clause makes the transition a compare-and-set.
      const updated = await client.query('UPDATE cod_remittance_cycles SET status=\'approved\', approved_by=$1, approved_at=now() WHERE id=$2 AND status=\'pending\' RETURNING id, status, approved_at, seller_id', [request.adminPrincipal!.userId, cycleId]);
      if (!updated.rows[0]) {
        const exists = await client.query('SELECT 1 FROM cod_remittance_cycles WHERE id=$1', [cycleId]);
        return { error: exists.rows[0] ? 'CYCLE_NOT_PENDING' : 'CYCLE_NOT_FOUND', status: exists.rows[0] ? 409 : 404 } as { error: string; status: number };
      }
      await client.query(`INSERT INTO audit_events (seller_id, actor_user_id, action, target_type, target_id, request_id) VALUES ($1,$2,'cod_remittance.approved','cod_remittance_cycle',$3,$4)`, [updated.rows[0].seller_id, request.adminPrincipal!.userId, cycleId, request.id]);
      return { row: { id: updated.rows[0].id, status: updated.rows[0].status, approved_at: updated.rows[0].approved_at } };
    });
    if (!('row' in outcome)) return reply.code(outcome.status).send({ error: outcome.error });
    return outcome.row;
  });

  // Deliberately a separate step from approve, even though both currently
  // accept the same admin roles: this is where "the bank transfer actually
  // happened" gets recorded, and splitting it from approval leaves room to
  // require a second, different approver here later without a schema change.
  app.post('/v1/admin/cod-remittances/:cycleId/remit', { preHandler: [requirePlatformAdmin, requireAccountAdmin] }, async (request, reply) => {
    const cycleId = z.string().uuid().parse((request.params as { cycleId: string }).cycleId);
    const { bankReference } = z.object({ bankReference: z.string().trim().min(3).max(120) }).parse(request.body);
    const outcome = await withTransaction(async (client) => {
      const cycle = await client.query<{ id: string; seller_id: string; status: string; net_remitted_paise: string; due_date: string | null; overdue: boolean }>(
        'SELECT id, seller_id, status, net_remitted_paise, due_date::text, (due_date IS NULL OR due_date <= current_date) AS overdue FROM cod_remittance_cycles WHERE id=$1 FOR UPDATE', [cycleId]);
      const c = cycle.rows[0];
      if (!c) return { error: 'CYCLE_NOT_FOUND', status: 404 } as { error: string; status: number };
      if (c.status !== 'approved') return { error: 'CYCLE_NOT_APPROVED', status: 409 } as { error: string; status: number };
      if (!c.overdue) return { error: `NOT_DUE_UNTIL_${c.due_date}`, status: 409 } as { error: string; status: number };
      // The wallet is checked first: a negative balance is recovered from the COD before the seller is paid (wallet -10,000, COD 1,00,000 -> pay 90,000, wallet 0).
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))', [`wallet:${c.seller_id}`]);
      const wallet = await client.query<{ balance: string }>(`SELECT COALESCE(SUM(CASE WHEN entry_type IN ('credit','release') THEN amount_paise WHEN entry_type IN ('debit','hold') THEN -amount_paise ELSE amount_paise END),0)::bigint AS balance FROM wallet_entries WHERE seller_id=$1`, [c.seller_id]);
      const balance = BigInt(wallet.rows[0].balance); const net = BigInt(c.net_remitted_paise);
      const offset = balance < 0n ? (-balance < net ? -balance : net) : 0n;
      if (offset > 0n) {
        await client.query(`INSERT INTO wallet_entries (seller_id, entry_type, amount_paise, reference_type, reference_id, idempotency_key, description) VALUES ($1,'credit',$2,'cod_remittance',$3,$4,'Negative wallet balance recovered from COD remittance') ON CONFLICT DO NOTHING`, [c.seller_id, offset.toString(), cycleId, `cod-offset:${cycleId}`]);
      }
      const updated = await client.query('UPDATE cod_remittance_cycles SET status=\'remitted\', bank_reference=$1, remitted_by=$2, remitted_at=now(), wallet_offset_paise=$4, payout_paise=$5 WHERE id=$3 AND status=\'approved\' RETURNING id, status, remitted_at, bank_reference, seller_id, wallet_offset_paise, payout_paise', [bankReference, request.adminPrincipal!.userId, cycleId, offset.toString(), (net - offset).toString()]);
      await client.query(`INSERT INTO audit_events (seller_id, actor_user_id, action, target_type, target_id, request_id, metadata) VALUES ($1,$2,'cod_remittance.remitted','cod_remittance_cycle',$3,$4,$5)`, [c.seller_id, request.adminPrincipal!.userId, cycleId, request.id, JSON.stringify({ bankReference, walletOffsetPaise: offset.toString(), payoutPaise: (net - offset).toString() })]);
      const { seller_id: _seller, ...row } = updated.rows[0];
      return { row };
    });
    if (!('row' in outcome)) return reply.code(outcome.status).send({ error: outcome.error });
    return outcome.row;
  });

  // Admin sets the seller's payout day (D+N).
  app.put('/v1/admin/sellers/:sellerId/remittance-days', { preHandler: [requirePlatformAdmin, requireAccountAdmin] }, async (request, reply) => {
    const sellerId = z.string().uuid().parse((request.params as { sellerId: string }).sellerId);
    const { days } = z.object({ days: z.number().int().min(0).max(15) }).parse(request.body);
    const r = await db.query('UPDATE sellers SET remittance_days=$1 WHERE id=$2 RETURNING id, remittance_days', [days, sellerId]);
    if (!r.rows[0]) return reply.code(404).send({ error: 'SELLER_NOT_FOUND' });
    return r.rows[0];
  });

  app.get('/v1/admin/cod-remittances', { preHandler: requirePlatformAdmin }, async (request) => {
    const q = z.object({ sellerId: z.string().uuid().optional(), status: z.enum(['pending', 'approved', 'remitted']).optional() }).parse(request.query);
    const result = await db.query(
      `SELECT c.*, s.legal_name AS seller_name FROM cod_remittance_cycles c JOIN sellers s ON s.id = c.seller_id
       WHERE ($1::uuid IS NULL OR c.seller_id = $1) AND ($2::cod_remittance_status IS NULL OR c.status = $2)
       ORDER BY c.created_at DESC LIMIT 100`,
      [q.sellerId ?? null, q.status ?? null],
    );
    return { items: result.rows };
  });

  app.get('/v1/seller/cod-remittances', { preHandler: requireSeller }, async (request) => {
    const p = principal(request);
    return withSellerTransaction(p.sellerId, async (client) => ({
      items: (await client.query('SELECT id, cycle_start, cycle_end, shipment_count, cod_collected_paise, charges_deducted_paise, net_remitted_paise, status, bank_reference, remitted_at FROM cod_remittance_cycles WHERE seller_id=$1 ORDER BY cycle_start DESC LIMIT 100', [p.sellerId])).rows,
    }));
  });
}
