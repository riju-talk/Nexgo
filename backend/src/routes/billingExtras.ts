import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db, withSellerTransaction, withTransaction } from '../db/client.js';
import { requireAccountAdmin, requirePlatformAdmin } from '../lib/adminAuth.js';
import { requireSeller } from './seller.js';

const GST_BPS = 1800;

function financialYearLabel(date: Date): string {
  const startYear = date.getUTCMonth() >= 3 ? date.getUTCFullYear() : date.getUTCFullYear() - 1;
  return `${String(startYear).slice(-2)}-${String(startYear + 1).slice(-2)}`;
}

const creditNoteInput = z.object({
  sellerId: z.string().uuid(),
  invoiceId: z.string().uuid().optional(),
  reason: z.string().trim().min(3).max(500),
  subtotalPaise: z.number().int().positive().max(10_000_000_000),
});
const tdsInput = z.object({
  sellerId: z.string().uuid(),
  financialYear: z.string().regex(/^[0-9]{2}-[0-9]{2}$/),
  quarter: z.number().int().min(1).max(4),
  section: z.string().trim().min(2).max(10).default('194C'),
  taxablePaise: z.number().int().positive(),
  rateBps: z.number().int().min(0).max(10000),
  certificateReference: z.string().trim().max(60).optional(),
});

export async function billingExtrasRoutes(app: FastifyInstance) {
  app.get('/v1/seller/credit-notes', { preHandler: requireSeller }, async (request) => {
    const p = request.principal!;
    return withSellerTransaction(p.sellerId, async (client) => ({
      items: (await client.query(
        `SELECT c.id, c.credit_note_number, c.reason, c.subtotal_paise, c.gst_paise, c.total_paise, c.issued_at, i.invoice_number
         FROM credit_notes c LEFT JOIN invoices i ON i.id = c.invoice_id WHERE c.seller_id=$1 ORDER BY c.issued_at DESC LIMIT 200`, [p.sellerId])).rows,
    }));
  });

  app.get('/v1/seller/tds', { preHandler: requireSeller }, async (request) => {
    const p = request.principal!;
    return withSellerTransaction(p.sellerId, async (client) => ({
      items: (await client.query(
        `SELECT id, financial_year, quarter, section, taxable_paise, tds_rate_bps, tds_paise, certificate_reference, created_at
         FROM tds_entries WHERE seller_id=$1 ORDER BY financial_year DESC, quarter DESC, created_at DESC LIMIT 200`, [p.sellerId])).rows,
    }));
  });

  app.post('/v1/admin/credit-notes', { preHandler: [requirePlatformAdmin, requireAccountAdmin] }, async (request, reply) => {
    const input = creditNoteInput.parse(request.body);
    const note = await withTransaction(async (client) => {
      if (input.invoiceId) {
        const inv = await client.query('SELECT 1 FROM invoices WHERE id=$1 AND seller_id=$2', [input.invoiceId, input.sellerId]);
        if (!inv.rows[0]) throw Object.assign(new Error('Invoice not found for this seller'), { statusCode: 404 });
      }
      const gst = (BigInt(input.subtotalPaise) * BigInt(GST_BPS)) / 10_000n;
      // Same gapless trick as invoices: increment and insert share one transaction.
      const seq = await client.query<{ next_number: number }>(
        `INSERT INTO credit_note_sequences (seller_id) VALUES ($1)
         ON CONFLICT (seller_id) DO UPDATE SET next_number = credit_note_sequences.next_number + 1 RETURNING next_number`, [input.sellerId]);
      const number = `NXCN/${financialYearLabel(new Date())}/${String(seq.rows[0].next_number).padStart(6, '0')}`;
      const row = await client.query(
        `INSERT INTO credit_notes (seller_id, credit_note_number, invoice_id, reason, subtotal_paise, gst_paise, total_paise, issued_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [input.sellerId, number, input.invoiceId ?? null, input.reason, input.subtotalPaise, gst.toString(), (BigInt(input.subtotalPaise) + gst).toString(), request.adminPrincipal!.userId]);
      await client.query(
        `INSERT INTO audit_events (seller_id, actor_user_id, action, target_type, target_id, request_id, metadata) VALUES ($1,$2,'credit_note.issued','credit_note',$3,$4,$5)`,
        [input.sellerId, request.adminPrincipal!.userId, row.rows[0].id, request.id, JSON.stringify({ number })]);
      return row.rows[0];
    });
    return reply.code(201).send(note);
  });

  app.post('/v1/admin/tds', { preHandler: [requirePlatformAdmin, requireAccountAdmin] }, async (request, reply) => {
    const input = tdsInput.parse(request.body);
    const tds = (BigInt(input.taxablePaise) * BigInt(input.rateBps)) / 10_000n;
    const row = await withTransaction(async (client) => {
      const created = await client.query(
        `INSERT INTO tds_entries (seller_id, financial_year, quarter, section, taxable_paise, tds_rate_bps, tds_paise, certificate_reference, recorded_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [input.sellerId, input.financialYear, input.quarter, input.section, input.taxablePaise, input.rateBps, tds.toString(), input.certificateReference ?? null, request.adminPrincipal!.userId]);
      await client.query(
        `INSERT INTO audit_events (seller_id, actor_user_id, action, target_type, target_id, request_id, metadata) VALUES ($1,$2,'tds.recorded','tds_entry',$3,$4,$5)`,
        [input.sellerId, request.adminPrincipal!.userId, created.rows[0].id, request.id, JSON.stringify({ financialYear: input.financialYear, quarter: input.quarter })]);
      return created.rows[0];
    });
    return reply.code(201).send(row);
  });

  app.get('/v1/admin/credit-notes', { preHandler: requirePlatformAdmin }, async () => ({
    items: (await db.query(`SELECT c.*, s.legal_name AS seller_name FROM credit_notes c JOIN sellers s ON s.id=c.seller_id ORDER BY c.issued_at DESC LIMIT 200`)).rows,
  }));
}
