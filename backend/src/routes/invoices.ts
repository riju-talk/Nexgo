import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { db, withSellerTransaction, withTransaction } from '../db/client.js';
import { requireAccountAdmin, requirePlatformAdmin } from '../lib/adminAuth.js';
import { requireSeller } from './seller.js';
import { ensurePrivateBucket, storage } from '../lib/storage.js';
import { config } from '../config.js';

const GST_BPS = 1800; // 18%, matches the rate already used across the mock UI

// Indian financial year: 01 Apr - 31 Mar. "26-27" for a period starting in
// or after April 2026. This is what the invoice number's series segment
// encodes, independent of calendar year.
function financialYearLabel(periodStart: string): string {
  const date = new Date(periodStart);
  const startYear = date.getUTCMonth() >= 3 ? date.getUTCFullYear() : date.getUTCFullYear() - 1;
  return `${String(startYear).slice(-2)}-${String(startYear + 1).slice(-2)}`;
}

const generateInput = z.object({ sellerId: z.string().uuid(), periodStart: z.string().date(), periodEnd: z.string().date() });

export async function invoiceRoutes(app: FastifyInstance) {
  app.post('/v1/admin/invoices/generate', { preHandler: [requirePlatformAdmin, requireAccountAdmin] }, async (request, reply) => {
    const input = generateInput.parse(request.body);
    if (input.periodEnd < input.periodStart) return reply.code(400).send({ error: 'INVALID_PERIOD' });
    const invoice = await withTransaction(async (client) => {
      // One generation per seller at a time, so two concurrent requests cannot both pass the overlap check.
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))', [`invoice:${input.sellerId}`]);
      const overlap = await client.query(`SELECT invoice_number FROM invoices WHERE seller_id=$1 AND status<>'void' AND period_start<=$3::date AND period_end>=$2::date LIMIT 1`, [input.sellerId, input.periodStart, input.periodEnd]);
      if (overlap.rows[0]) throw Object.assign(new Error(`This period overlaps invoice ${overlap.rows[0].invoice_number}. Choose a period that does not overlap an existing invoice.`), { statusCode: 409 });
      const charges = await client.query<{ subtotal: string; count: string }>(
        `SELECT COALESCE(SUM(shipping_charge_paise),0)::bigint AS subtotal, count(*)::int AS count
         FROM shipments WHERE seller_id = $1 AND state <> 'cancelled' AND booked_at::date BETWEEN $2 AND $3`,
        [input.sellerId, input.periodStart, input.periodEnd],
      );
      const subtotalPaise = BigInt(charges.rows[0].subtotal);
      const shipmentCount = Number(charges.rows[0].count);
      if (shipmentCount === 0) throw Object.assign(new Error('No billable shipments in this period'), { statusCode: 422 });
      const gstPaise = (subtotalPaise * BigInt(GST_BPS)) / 10_000n;
      const totalPaise = subtotalPaise + gstPaise;
      // Sequence increment and invoice insert share this transaction — if the
      // insert fails for any reason, the increment rolls back with it, so the
      // series never has a gap. First call for a seller inserts the row at its
      // default (1) and RETURNING hands back that same 1, unincremented, since
      // the INSERT path never runs the UPDATE; every call after that goes
      // through the conflict branch, which increments then returns the new
      // value — so each call already returns exactly the number this invoice
      // should use, with no separate "peek" query needed.
      const seq = await client.query<{ next_number: number }>(
        `INSERT INTO invoice_sequences (seller_id) VALUES ($1)
         ON CONFLICT (seller_id) DO UPDATE SET next_number = invoice_sequences.next_number + 1
         RETURNING next_number`,
        [input.sellerId],
      );
      const invoiceNumber = `NX/${financialYearLabel(input.periodStart)}/${String(seq.rows[0].next_number).padStart(6, '0')}`;
      const result = await client.query(
        `INSERT INTO invoices (seller_id, invoice_number, period_start, period_end, subtotal_paise, gst_paise, total_paise, shipment_count, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'draft') RETURNING *`,
        [input.sellerId, invoiceNumber, input.periodStart, input.periodEnd, subtotalPaise.toString(), gstPaise.toString(), totalPaise.toString(), shipmentCount],
      );
      await client.query(
        `INSERT INTO audit_events (seller_id, actor_user_id, action, target_type, target_id, request_id, metadata)
         VALUES ($1,$2,'invoice.generated','invoice',$3,$4,$5)`,
        [input.sellerId, request.adminPrincipal!.userId, result.rows[0].id, request.id, JSON.stringify({ invoiceNumber, shipmentCount })],
      );
      return result.rows[0];
    });
    return reply.code(201).send(invoice);
  });

  app.post('/v1/admin/invoices/:invoiceId/issue', { preHandler: [requirePlatformAdmin, requireAccountAdmin] }, async (request, reply) => {
    const invoiceId = z.string().uuid().parse((request.params as { invoiceId: string }).invoiceId);
    const outcome = await withTransaction(async (client) => {
      // Row lock held for the whole transaction, so a double-click cannot create two documents and two PDF jobs.
      const current = await client.query<{ status: string; seller_id: string; invoice_number: string }>('SELECT status, seller_id, invoice_number FROM invoices WHERE id = $1 FOR UPDATE', [invoiceId]);
      if (!current.rows[0]) return { error: 'INVOICE_NOT_FOUND', status: 404 } as { error: string; status: number };
      if (current.rows[0].status !== 'draft') return { error: 'INVOICE_NOT_DRAFT', status: 409 } as { error: string; status: number };
      const doc = await client.query<{ id: string }>(
        `INSERT INTO documents (seller_id, kind, storage_key, content_type) VALUES ($1,'invoice',$2,'application/pdf') RETURNING id`,
        [current.rows[0].seller_id, `invoices/${current.rows[0].seller_id}/${current.rows[0].invoice_number.replace(/\//g, '-')}.pdf`],
      );
      const job = await client.query<{ id: string }>(
        `INSERT INTO job_runs (seller_id, job_type, payload) VALUES ($1,'invoice.generate',$2) RETURNING id`,
        [current.rows[0].seller_id, JSON.stringify({ documentId: doc.rows[0].id, invoiceId })],
      );
      const result = await client.query(
        'UPDATE invoices SET status=\'issued\', document_id=$1, issued_by=$2, issued_at=now() WHERE id=$3 RETURNING id, invoice_number, status, document_id',
        [doc.rows[0].id, request.adminPrincipal!.userId, invoiceId],
      );
      await client.query(
        `INSERT INTO audit_events (seller_id, actor_user_id, action, target_type, target_id, request_id, metadata)
         VALUES ($1,$2,'invoice.issued','invoice',$3,$4,$5)`,
        [current.rows[0].seller_id, request.adminPrincipal!.userId, invoiceId, request.id, JSON.stringify({ jobId: job.rows[0].id })],
      );
      return { row: result.rows[0] };
    });
    if (!('row' in outcome)) return reply.code(outcome.status).send({ error: outcome.error });
    return outcome.row;
  });

  app.get('/v1/admin/invoices', { preHandler: requirePlatformAdmin }, async (request) => {
    const q = z.object({ sellerId: z.string().uuid().optional(), status: z.enum(['draft', 'issued', 'void']).optional() }).parse(request.query);
    const result = await db.query(
      `SELECT i.*, s.legal_name AS seller_name FROM invoices i JOIN sellers s ON s.id = i.seller_id
       WHERE ($1::uuid IS NULL OR i.seller_id = $1) AND ($2::invoice_status IS NULL OR i.status = $2)
       ORDER BY i.created_at DESC LIMIT 100`,
      [q.sellerId ?? null, q.status ?? null],
    );
    return { items: result.rows };
  });

  function principal(request: FastifyRequest) {
    if (!request.principal) throw Object.assign(new Error('Authentication required'), { statusCode: 401 });
    return request.principal;
  }

  app.get('/v1/seller/invoices', { preHandler: requireSeller }, async (request) => {
    const p = principal(request);
    return withSellerTransaction(p.sellerId, async (client) => ({
      items: (await client.query('SELECT id, invoice_number, period_start, period_end, subtotal_paise, gst_paise, total_paise, shipment_count, status, issued_at FROM invoices WHERE seller_id=$1 ORDER BY created_at DESC LIMIT 100', [p.sellerId])).rows,
    }));
  });

  app.get('/v1/seller/invoices/:invoiceId/download', { preHandler: requireSeller }, async (request, reply) => {
    if (!config.STORAGE_ENABLED) return reply.code(501).send({ error: 'FILE_STORAGE_NOT_CONNECTED', message: 'File storage is not connected yet; this will be available soon.' });
    const p = principal(request);
    const invoiceId = z.string().uuid().parse((request.params as { invoiceId: string }).invoiceId);
    return withSellerTransaction(p.sellerId, async (client) => {
      const result = await client.query<{ storage_key: string; status: string }>(
        `SELECT d.storage_key, d.status FROM invoices i JOIN documents d ON d.id = i.document_id WHERE i.id=$1 AND i.seller_id=$2`,
        [invoiceId, p.sellerId],
      );
      const doc = result.rows[0];
      if (!doc) return reply.code(404).send({ error: 'INVOICE_DOCUMENT_NOT_READY' });
      if (doc.status !== 'ready') return { status: doc.status };
      await ensurePrivateBucket();
      return { status: 'ready', downloadUrl: await storage.presignedGetObject(config.MINIO_BUCKET, doc.storage_key, 300), expiresInSeconds: 300 };
    });
  });
}
