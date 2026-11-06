import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { withSellerTransaction } from '../db/client.js';
import { audit } from '../lib/audit.js';
import { decryptSecret, encryptSecret, maskAccountNumber } from '../lib/crypto.js';
import { ID_PROOF_TYPES, idNumberProblem } from '../lib/idProof.js';
import { requireSeller } from './seller.js';
import { submitKyc } from './kyc.js';

/**
 * KYC saved one section at a time (business, identity, bank), each with its own Save button, so nobody has to fill one long form.
 * "Submit for verification" assembles the saved sections and goes through the same submitKyc() as the one-shot form.
 * The bank account number is stored encrypted; the identity number is dropped once the submission is made.
 */

function principal(request: FastifyRequest) {
  if (!request.principal) throw Object.assign(new Error('Authentication required'), { statusCode: 401 });
  return request.principal;
}

const gstin = z.string().trim().toUpperCase().regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, 'Enter a valid 15-character GSTIN');
const business = z.object({
  gstApplicable: z.boolean().default(false),
  gstin: gstin.optional().or(z.literal('').transform(() => undefined)),
  entityType: z.enum(['individual', 'proprietorship', 'partnership', 'private_limited', 'llp', 'public_limited']),
  registeredAddress: z.string().trim().min(10, 'Enter the full registered address').max(500),
}).superRefine((v, ctx) => {
  if (v.gstApplicable && !v.gstin) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Enter your GSTIN, or mark GST as not applicable', path: ['gstin'] });
});
const identity = z.object({
  pan: z.string().trim().toUpperCase().regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, 'Enter a valid 10-character PAN'),
  panHolderName: z.string().trim().min(2, 'Name on PAN is required').max(150),
  idProofType: z.enum(ID_PROOF_TYPES).default('aadhaar'),
  idNumber: z.string().trim().min(5, 'Enter your ID number').max(30),
}).superRefine((v, ctx) => {
  const problem = idNumberProblem(v.idProofType, v.idNumber);
  if (problem) ctx.addIssue({ code: z.ZodIssueCode.custom, message: problem, path: ['idNumber'] });
});
const bank = z.object({
  bankAccountHolder: z.string().trim().min(2, 'Enter the account holder name').max(150),
  bankAccountNumber: z.string().trim().regex(/^[0-9]{9,18}$/, 'Enter a valid bank account number'),
  bankIfsc: z.string().trim().toUpperCase().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Enter a valid IFSC code'),
});
const SCHEMAS = { business, identity, bank } as const;
const SECTION = z.enum(['business', 'identity', 'bank']);

const LOCKED = ['pending_review', 'verified'];

export async function kycSectionRoutes(app: FastifyInstance) {
  // What is saved so far (never the full ID number or the bank account number) and which scans are uploaded.
  app.get('/v1/seller/kyc/sections', { preHandler: requireSeller }, async (request) => {
    const p = principal(request);
    return withSellerTransaction(p.sellerId, async (client) => {
      const rows = await client.query<{ section: string; data: Record<string, unknown>; updated_at: string }>('SELECT section, data, updated_at FROM seller_kyc_sections WHERE seller_id = $1', [p.sellerId]);
      const files = await client.query<{ purpose: string }>("SELECT DISTINCT purpose FROM seller_files WHERE seller_id = $1 AND purpose LIKE 'kyc%'", [p.sellerId]);
      const sections: Record<string, unknown> = {};
      for (const r of rows.rows) {
        const { bankAccountEncrypted: _enc, keyReference: _key, idNumber: _id, ...visible } = r.data;
        sections[r.section] = { ...visible, savedAt: r.updated_at };
      }
      return { sections, files: files.rows.map((r) => r.purpose) };
    });
  });

  app.put('/v1/seller/kyc/sections/:section', { preHandler: requireSeller }, async (request) => {
    const name = SECTION.parse((request.params as { section: string }).section);
    const p = principal(request);
    const parsed = SCHEMAS[name].parse(request.body) as Record<string, unknown>;
    let data: Record<string, unknown> = parsed;
    if (name === 'bank') {
      const number = String(parsed.bankAccountNumber);
      const { ciphertext, keyReference } = encryptSecret(number);
      data = { bankAccountHolder: parsed.bankAccountHolder, bankIfsc: parsed.bankIfsc, bankAccountMasked: maskAccountNumber(number), bankAccountEncrypted: ciphertext.toString('base64'), keyReference };
    }
    return withSellerTransaction(p.sellerId, async (client) => {
      const current = await client.query<{ status: string }>('SELECT status FROM seller_kyc WHERE seller_id = $1', [p.sellerId]);
      if (current.rows[0] && LOCKED.includes(current.rows[0].status)) throw Object.assign(new Error(`KYC cannot be changed while its status is ${current.rows[0].status}`), { statusCode: 409 });
      await client.query(
        `INSERT INTO seller_kyc_sections (seller_id, section, data) VALUES ($1,$2,$3)
         ON CONFLICT (seller_id, section) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`, [p.sellerId, name, JSON.stringify(data)]);
      await audit(client, { sellerId: p.sellerId, actorUserId: p.userId, action: 'kyc.section_saved', targetType: 'seller_kyc', targetId: p.sellerId, requestId: request.id, metadata: { section: name } });
      return { saved: name };
    });
  });

  app.post('/v1/seller/kyc/submit', { preHandler: requireSeller }, async (request, reply) => {
    const p = principal(request);
    const saved = await withSellerTransaction(p.sellerId, async (client) => (await client.query<{ section: string; data: Record<string, unknown> }>('SELECT section, data FROM seller_kyc_sections WHERE seller_id = $1', [p.sellerId])).rows);
    const by: Record<string, Record<string, unknown>> = Object.fromEntries(saved.map((r) => [r.section, r.data]));
    const missing = (['business', 'identity', 'bank'] as const).filter((n) => !by[n]);
    if (missing.length) throw Object.assign(new Error(`Save these sections first: ${missing.join(', ')}`), { statusCode: 400 });
    const b = by.bank as { bankAccountHolder: string; bankIfsc: string; bankAccountEncrypted: string; keyReference: string };
    const account = decryptSecret(Buffer.from(b.bankAccountEncrypted, 'base64'), b.keyReference);
    const input = z.object({
      gstApplicable: z.boolean(), gstin: z.string().optional(), pan: z.string(), panHolderName: z.string(), idProofType: z.enum(ID_PROOF_TYPES), idNumber: z.string(),
      entityType: z.enum(['individual', 'proprietorship', 'partnership', 'private_limited', 'llp', 'public_limited']), registeredAddress: z.string(),
      bankAccountHolder: z.string(), bankAccountNumber: z.string(), bankIfsc: z.string(),
    }).parse({ ...by.business, ...by.identity, bankAccountHolder: b.bankAccountHolder, bankIfsc: b.bankIfsc, bankAccountNumber: account });
    const row = await submitKyc(p, input, encryptSecret(account), request.id);
    await withSellerTransaction(p.sellerId, (client) => client.query("UPDATE seller_kyc_sections SET data = data - 'idNumber' WHERE seller_id = $1 AND section = 'identity'", [p.sellerId]));
    const { bank_account_number_encrypted: _enc, key_reference: _key, ...visible } = row;
    return reply.code(202).send(visible);
  });
}
