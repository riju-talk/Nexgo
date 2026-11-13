import type { FastifyInstance, FastifyRequest } from 'fastify';
import { pageRows } from '../lib/paging.js';
import { z } from 'zod';
import { db, withSellerTransaction } from '../db/client.js';
import { audit } from '../lib/audit.js';
import { encryptSecret, maskAccountNumber } from '../lib/crypto.js';
import { requireAccountAdmin, requirePlatformAdmin } from '../lib/adminAuth.js';
import { requireSeller } from './seller.js';
import { ID_PROOF_TYPES, idLast4, idNumberProblem } from '../lib/idProof.js';
import { notify } from '../lib/notify.js';

function principal(request: FastifyRequest) {
  if (!request.principal) throw Object.assign(new Error('Authentication required'), { statusCode: 401 });
  return request.principal;
}

const kycBase = z.object({
  gstApplicable: z.boolean().default(true),
  gstin: z.string().trim().toUpperCase().regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, 'Enter a valid 15-character GSTIN').optional().or(z.literal('').transform(() => undefined)),
  pan: z.string().trim().toUpperCase().regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, 'Enter a valid 10-character PAN'),
  panHolderName: z.string().trim().min(2, 'Name on PAN is required').max(150),
  // Any verifiable government ID. The full number is validated here but only its last 4 characters are stored.
  idProofType: z.enum(ID_PROOF_TYPES).default('aadhaar'),
  idNumber: z.string().trim().min(5, 'Enter your ID number').max(30),
  entityType: z.enum(['individual', 'proprietorship', 'partnership', 'private_limited', 'llp', 'public_limited']),
  registeredAddress: z.string().trim().min(10).max(500),
  bankAccountHolder: z.string().trim().min(2).max(150),
  bankAccountNumber: z.string().trim().regex(/^[0-9]{9,18}$/, 'Enter a valid bank account number'),
  bankIfsc: z.string().trim().toUpperCase().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Enter a valid IFSC code'),
});
const kycSubmission = kycBase.superRefine((v, ctx) => {
  const idProblem = idNumberProblem(v.idProofType, v.idNumber);
  if (idProblem) ctx.addIssue({ code: z.ZodIssueCode.custom, message: idProblem, path: ['idNumber'] });
  if (v.gstApplicable && !v.gstin) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Enter your GSTIN, or mark GST as not applicable', path: ['gstin'] });
});

const kycDecision = z.object({
  decision: z.enum(['verified', 'rejected']),
  rejectionReason: z.string().trim().min(5).max(500).optional(),
}).superRefine((value, ctx) => {
  if (value.decision === 'rejected' && !value.rejectionReason) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'A rejection requires a reason the seller can act on', path: ['rejectionReason'] });
  }
});

// Never let the account number itself leave the server once it's on file —
// the seller only needs to see that something is saved and what changed.
function toSellerView(row: Record<string, unknown> | undefined) {
  if (!row) return { status: 'unsubmitted' as const };
  const { bank_account_number_encrypted: _enc, key_reference: _key, ...rest } = row;
  return rest;
}

type KycInput = z.infer<typeof kycBase>;

/** Writes the full KYC submission (status pending_review). Shared by the one-shot form and the section-by-section flow. */
export async function submitKyc(p: { sellerId: string; userId: string }, input: KycInput, secret: { ciphertext: Buffer; keyReference: string }, requestId: string) {
  return withSellerTransaction(p.sellerId, async (client) => {
    const current = await client.query<{ status: string }>('SELECT status FROM seller_kyc WHERE seller_id = $1 FOR UPDATE', [p.sellerId]);
    if (current.rows[0] && ['pending_review', 'verified'].includes(current.rows[0].status)) {
      throw Object.assign(new Error(`KYC cannot be resubmitted while its status is ${current.rows[0].status}`), { statusCode: 409 });
    }
    // The scans are uploaded to the bucket first; a submission without them cannot be reviewed.
    const scans = await client.query<{ purpose: string }>("SELECT DISTINCT purpose FROM seller_files WHERE seller_id = $1 AND purpose IN ('kyc_pan', 'kyc_id_front', 'kyc_aadhaar_front')", [p.sellerId]);
    const have = new Set(scans.rows.map((r) => r.purpose));
    if (!have.has('kyc_pan')) throw Object.assign(new Error('Upload a scanned copy of your PAN card first'), { statusCode: 400 });
    if (!have.has('kyc_id_front') && !have.has('kyc_aadhaar_front')) throw Object.assign(new Error('Upload a scanned copy of your identity proof first'), { statusCode: 400 });
    const result = await client.query(
      `INSERT INTO seller_kyc (seller_id, gstin, pan, entity_type, registered_address, bank_account_holder, bank_account_number_encrypted, bank_ifsc, key_reference, aadhaar_last4, gst_applicable, pan_holder_name, id_proof_type, id_proof_last4, status, submitted_at, rejection_reason, reviewed_at, reviewed_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'pending_review',now(),NULL,NULL,NULL)
       ON CONFLICT (seller_id) DO UPDATE SET gstin=EXCLUDED.gstin, pan=EXCLUDED.pan, entity_type=EXCLUDED.entity_type,
         registered_address=EXCLUDED.registered_address, bank_account_holder=EXCLUDED.bank_account_holder,
         bank_account_number_encrypted=EXCLUDED.bank_account_number_encrypted, bank_ifsc=EXCLUDED.bank_ifsc,
         key_reference=EXCLUDED.key_reference, aadhaar_last4=EXCLUDED.aadhaar_last4, id_proof_type=EXCLUDED.id_proof_type, id_proof_last4=EXCLUDED.id_proof_last4, gst_applicable=EXCLUDED.gst_applicable, pan_holder_name=EXCLUDED.pan_holder_name, status='pending_review', submitted_at=now(),
         rejection_reason=NULL, reviewed_at=NULL, reviewed_by=NULL, updated_at=now()
       RETURNING *`,
      [p.sellerId, input.gstApplicable ? input.gstin : null, input.pan, input.entityType, input.registeredAddress, input.bankAccountHolder, secret.ciphertext, input.bankIfsc, secret.keyReference, input.idProofType === 'aadhaar' ? idLast4(input.idNumber) : null, input.gstApplicable, input.panHolderName ?? null, input.idProofType, idLast4(input.idNumber)],
    );
    await audit(client, { sellerId: p.sellerId, actorUserId: p.userId, action: 'kyc.submitted', targetType: 'seller_kyc', targetId: p.sellerId, requestId, metadata: { bankAccountMasked: maskAccountNumber(input.bankAccountNumber) } });
    return result.rows[0];
  });
}

export async function kycRoutes(app: FastifyInstance) {
  app.get('/v1/seller/kyc', { preHandler: requireSeller }, async (request) => {
    const p = principal(request);
    return withSellerTransaction(p.sellerId, async (client) => {
      const result = await client.query('SELECT * FROM seller_kyc WHERE seller_id = $1', [p.sellerId]);
      return toSellerView(result.rows[0]);
    });
  });

  // Submitting again while pending/verified is refused — a seller can only
  // open a fresh review by first being rejected, so "resubmit" always means
  // "something an admin flagged has actually changed."
  app.post('/v1/seller/kyc', { preHandler: requireSeller }, async (request, reply) => {
    const input = kycSubmission.parse(request.body);
    const p = principal(request);
    const row = await submitKyc(p, input, encryptSecret(input.bankAccountNumber), request.id);
    return reply.code(202).send(toSellerView(row));
  });

  app.get('/v1/admin/kyc', { preHandler: requirePlatformAdmin }, async (request) => {
    const status = z.enum(['unsubmitted', 'pending_review', 'verified', 'rejected']).optional().parse((request.query as { status?: string }).status);
    const pg = z.object({ limit: z.coerce.number().int().min(1).max(200).default(50), offset: z.coerce.number().int().min(0).default(0) }).parse(request.query);
    const result = await db.query(
      `SELECT k.seller_id, k.gstin, k.gst_applicable, k.pan, k.pan_holder_name, k.aadhaar_last4, k.id_proof_type, k.id_proof_last4, k.entity_type, k.registered_address, k.bank_account_holder, k.bank_ifsc,
              k.status, k.rejection_reason, k.submitted_at, k.reviewed_at, s.legal_name AS seller_name
       FROM seller_kyc k JOIN sellers s ON s.id = k.seller_id
       WHERE $1::kyc_status IS NULL OR k.status = $1
       ORDER BY k.submitted_at DESC NULLS LAST, k.seller_id LIMIT $2 OFFSET $3`,
      [status ?? null, pg.limit + 1, pg.offset],
    );
    return pageRows(result.rows, pg.limit);
  });

  app.post('/v1/admin/kyc/:sellerId/decision', { preHandler: [requirePlatformAdmin, requireAccountAdmin] }, async (request, reply) => {
    const sellerId = z.string().uuid().parse((request.params as { sellerId: string }).sellerId);
    const input = kycDecision.parse(request.body);
    const current = await db.query<{ status: string }>('SELECT status FROM seller_kyc WHERE seller_id = $1', [sellerId]);
    if (!current.rows[0]) return reply.code(404).send({ error: 'KYC_NOT_SUBMITTED' });
    if (current.rows[0].status !== 'pending_review') return reply.code(409).send({ error: 'KYC_NOT_PENDING_REVIEW' });
    const result = await db.query(
      `UPDATE seller_kyc SET status = $1::kyc_status, rejection_reason = $2, reviewed_at = now(), reviewed_by = $3, updated_at = now()
       WHERE seller_id = $4 RETURNING seller_id, status, reviewed_at`,
      [input.decision, input.rejectionReason ?? null, request.adminPrincipal!.userId, sellerId],
    );
    await db.query(
      `INSERT INTO audit_events (seller_id, actor_user_id, action, target_type, target_id, request_id, metadata)
       VALUES ($1, $2, $3, 'seller_kyc', $4, $5, $6)`,
      [sellerId, request.adminPrincipal!.userId, `kyc.${input.decision}`, sellerId, request.id, JSON.stringify({ rejectionReason: input.rejectionReason ?? null })],
    );
    await notify(sellerId, { kind: 'kyc', title: input.decision === 'verified' ? 'KYC verified' : 'KYC needs your attention', body: input.decision === 'verified' ? 'Your documents were verified.' : (input.rejectionReason ?? 'Please review and resubmit your KYC.'), screen: 'kyc', entityId: sellerId, dedupeKey: `kyc:${sellerId}:${Date.now()}` });
    return result.rows[0];
  });
}
