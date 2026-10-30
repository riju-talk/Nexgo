import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { db, withSellerTransaction } from '../db/client.js';
import { audit } from '../lib/audit.js';
import { requirePlatformAdmin } from '../lib/adminAuth.js';
import { assertStorageEnabled, checkStorage, storage } from '../lib/storage.js';
import { requireSeller } from './seller.js';

const IMAGE_ONLY = ['logo', 'signature'];
const PURPOSES = ['logo', 'signature', 'kyc_pan', 'kyc_aadhaar', 'kyc_aadhaar_front', 'kyc_aadhaar_back', 'kyc_gst', 'kyc_bank'] as const;
const MAX_BYTES = 3 * 1024 * 1024;
const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'application/pdf': 'pdf' };
const SIGNED_URL_SECONDS = 300;

// The file's real header decides its type, so a renamed file cannot slip through.
function sniff(buf: Buffer): string | null {
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  return null;
}

const uploadInput = z.object({
  purpose: z.enum(PURPOSES),
  filename: z.string().trim().min(1).max(160),
  dataBase64: z.string().min(16).max(Math.ceil((MAX_BYTES * 4) / 3) + 16),
});

function principal(request: FastifyRequest) {
  if (!request.principal) throw Object.assign(new Error('Authentication required'), { statusCode: 401 });
  return request.principal;
}

export async function fileRoutes(app: FastifyInstance) {
  app.post('/v1/seller/files', { preHandler: requireSeller, bodyLimit: 5 * 1024 * 1024 }, async (request, reply) => {
    assertStorageEnabled();
    const p = principal(request);
    const input = uploadInput.parse(request.body);
    const data = Buffer.from(input.dataBase64, 'base64');
    if (!data.length || data.length > MAX_BYTES) throw Object.assign(new Error('File must be under 3 MB'), { statusCode: 413 });
    const type = sniff(data);
    if (!type || (IMAGE_ONLY.includes(input.purpose) && type === 'application/pdf')) {
      throw Object.assign(new Error(IMAGE_ONLY.includes(input.purpose) ? 'Upload a PNG or JPG image' : 'Upload a PNG, JPG or PDF file'), { statusCode: 415 });
    }
    const key = `sellers/${p.sellerId}/${input.purpose}/${randomUUID()}.${EXT[type]}`;
    await storage.putObject(key, data, type);
    const row = await withSellerTransaction(p.sellerId, async (client) => {
      const result = await client.query(
        `INSERT INTO seller_files (seller_id, purpose, filename, content_type, size_bytes, storage_key, uploaded_by) VALUES ($1,$2,$3,$4,$5,$6,$7)
         RETURNING id, purpose, filename, content_type, size_bytes, created_at`,
        [p.sellerId, input.purpose, input.filename.replace(/[^\w.\- ]/g, '_'), type, data.length, key, p.userId]);
      await audit(client, { sellerId: p.sellerId, actorUserId: p.userId, action: 'file.uploaded', targetType: 'seller_file', targetId: result.rows[0].id, requestId: request.id, metadata: { purpose: input.purpose } });
      return result.rows[0];
    });
    return reply.code(201).send(row);
  });

  // Newest file per purpose.
  app.get('/v1/seller/files', { preHandler: requireSeller }, async (request) => {
    const p = principal(request);
    return withSellerTransaction(p.sellerId, async (client) => {
      const result = await client.query(
        `SELECT DISTINCT ON (purpose) id, purpose, filename, content_type, size_bytes, created_at FROM seller_files WHERE seller_id = $1 ORDER BY purpose, created_at DESC`, [p.sellerId]);
      return { items: result.rows };
    });
  });

  app.get('/v1/seller/files/:fileId/url', { preHandler: requireSeller }, async (request, reply) => {
    assertStorageEnabled();
    const p = principal(request);
    const fileId = z.string().uuid().parse((request.params as { fileId: string }).fileId);
    const row = await withSellerTransaction(p.sellerId, async (client) => (await client.query('SELECT storage_key FROM seller_files WHERE id = $1 AND seller_id = $2', [fileId, p.sellerId])).rows[0]);
    if (!row) return reply.code(404).send({ error: 'FILE_NOT_FOUND' });
    return { url: await storage.presignedGetObject(row.storage_key, SIGNED_URL_SECONDS) };
  });

  // Admin: is the bucket reachable for every operation the app needs? Names the failing step and the fix.
  app.get('/v1/admin/storage/health', { preHandler: requirePlatformAdmin }, async () => checkStorage());

  // Admin: every document a seller uploaded.
  app.get('/v1/admin/sellers/:sellerId/files', { preHandler: requirePlatformAdmin }, async (request) => {
    const sellerId = z.string().uuid().parse((request.params as { sellerId: string }).sellerId);
    const result = await db.query(
      `SELECT DISTINCT ON (purpose) id, purpose, filename, content_type, size_bytes, created_at FROM seller_files WHERE seller_id = $1 ORDER BY purpose, created_at DESC`, [sellerId]);
    return { items: result.rows };
  });

  app.get('/v1/admin/files/:fileId/url', { preHandler: requirePlatformAdmin }, async (request, reply) => {
    assertStorageEnabled();
    const fileId = z.string().uuid().parse((request.params as { fileId: string }).fileId);
    const row = (await db.query<{ storage_key: string; seller_id: string }>('SELECT storage_key, seller_id FROM seller_files WHERE id = $1', [fileId])).rows[0];
    if (!row) return reply.code(404).send({ error: 'FILE_NOT_FOUND' });
    await db.query(`INSERT INTO audit_events (seller_id, actor_user_id, action, target_type, target_id, request_id, metadata) VALUES ($1,$2,'file.viewed_by_admin','seller_file',$3,$4,'{}')`,
      [row.seller_id, request.adminPrincipal!.userId, fileId, request.id]);
    return { url: await storage.presignedGetObject(row.storage_key, SIGNED_URL_SECONDS) };
  });
}
