import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { withSellerTransaction } from '../db/client.js';
import { audit } from '../lib/audit.js';
import { requireSeller } from './seller.js';
import { randomBytes, createCipheriv, createDecipheriv } from 'crypto';
import { config } from '../config.js';

const uuid = z.string().uuid();

const bankAccountInput = z.object({
  accountHolderName: z.string().trim().min(2).max(120),
  accountNumber: z.string().trim().regex(/^\d{9,18}$/),
  ifscCode: z.string().trim().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/),
  bankName: z.string().trim().min(2).max(120),
  branchName: z.string().trim().max(120).optional(),
  accountType: z.enum(['savings', 'current', 'overdraft']).optional(),
  isPrimary: z.boolean().default(false),
});

const verifyAccountInput = z.object({
  verificationMethod: z.enum(['penny_drop', 'manual', 'document']),
  verificationReference: z.string().trim().max(200).optional(),
});

function principal(request: FastifyRequest) {
  if (!request.principal) throw Object.assign(new Error('Authentication required'), { statusCode: 401 });
  return request.principal;
}

// Simple encryption for account numbers (production should use AWS KMS, HashiCorp Vault, etc.)
function encryptAccountNumber(accountNumber: string): { encrypted: Buffer; keyReference: string } {
  const algorithm = 'aes-256-gcm';
  const key = Buffer.from(config.ENCRYPTION_KEY || randomBytes(32).toString('hex').substring(0, 64), 'hex');
  const iv = randomBytes(16);
  const cipher = createCipheriv(algorithm, key, iv);
  
  let encrypted = cipher.update(accountNumber, 'utf8');
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  const authTag = cipher.getAuthTag();
  
  // Store IV + authTag + encrypted data
  const combined = Buffer.concat([iv, authTag, encrypted]);
  
  return {
    encrypted: combined,
    keyReference: 'default-v1', // In production, reference to key in KMS
  };
}

function decryptAccountNumber(encryptedData: Buffer, keyReference: string): string {
  const algorithm = 'aes-256-gcm';
  const key = Buffer.from(config.ENCRYPTION_KEY || '', 'hex');
  
  // Extract IV (16 bytes), authTag (16 bytes), and encrypted data
  const iv = encryptedData.slice(0, 16);
  const authTag = encryptedData.slice(16, 32);
  const encrypted = encryptedData.slice(32);
  
  const decipher = createDecipheriv(algorithm, key, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encrypted);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  
  return decrypted.toString('utf8');
}

export async function bankAccountRoutes(app: FastifyInstance) {
  // Get all bank accounts for seller
  app.get('/v1/bank-accounts', { preHandler: requireSeller }, async (request) => {
    const p = principal(request);

    return withSellerTransaction(p.sellerId, async (client) => {
      const accounts = await client.query(`
        SELECT 
          id,
          account_holder_name,
          ifsc_code,
          bank_name,
          branch_name,
          account_type,
          verification_status,
          verified_at,
          is_primary,
          is_active,
          created_at,
          updated_at
        FROM bank_accounts
        WHERE seller_id = $1
        ORDER BY is_primary DESC, is_active DESC, created_at DESC
      `, [p.sellerId]);

      // Mask account numbers for security (show last 4 digits only)
      const maskedAccounts = accounts.rows.map(account => ({
        ...account,
        accountNumberMasked: '****', // In real implementation, decrypt and mask
      }));

      return { items: maskedAccounts };
    });
  });

  // Get bank account by ID (with full details for authorized operations)
  app.get('/v1/bank-accounts/:accountId', { preHandler: requireSeller }, async (request) => {
    const p = principal(request);
    const accountId = uuid.parse((request.params as { accountId: string }).accountId);

    return withSellerTransaction(p.sellerId, async (client) => {
      const account = await client.query(`
        SELECT 
          id,
          account_holder_name,
          account_number_encrypted,
          key_reference,
          ifsc_code,
          bank_name,
          branch_name,
          account_type,
          verification_status,
          verified_at,
          verification_method,
          verification_reference,
          is_primary,
          is_active,
          notes,
          created_at,
          updated_at
        FROM bank_accounts
        WHERE id = $1 AND seller_id = $2
      `, [accountId, p.sellerId]);

      if (!account.rows[0]) {
        throw Object.assign(new Error('Bank account not found'), { statusCode: 404 });
      }

      // Decrypt account number for authorized user
      let accountNumber = '****';
      try {
        accountNumber = decryptAccountNumber(
          account.rows[0].account_number_encrypted,
          account.rows[0].key_reference
        );
        // Mask for display (show last 4 digits)
        accountNumber = '****' + accountNumber.slice(-4);
      } catch (error) {
        app.log.error('Failed to decrypt account number', error);
      }

      return {
        ...account.rows[0],
        accountNumberMasked: accountNumber,
        account_number_encrypted: undefined, // Don't send encrypted data to client
        key_reference: undefined,
      };
    });
  });

  // Add new bank account
  app.post('/v1/bank-accounts', { preHandler: requireSeller }, async (request, reply) => {
    const p = principal(request);
    const input = bankAccountInput.parse(request.body);

    return withSellerTransaction(p.sellerId, async (client) => {
      // Check if setting as primary and unset existing primary
      if (input.isPrimary) {
        await client.query(`
          UPDATE bank_accounts 
          SET is_primary = false, updated_at = now()
          WHERE seller_id = $1 AND is_primary = true
        `, [p.sellerId]);
      }

      // Encrypt account number
      const { encrypted, keyReference } = encryptAccountNumber(input.accountNumber);

      const result = await client.query(`
        INSERT INTO bank_accounts (
          seller_id,
          account_holder_name,
          account_number_encrypted,
          key_reference,
          ifsc_code,
          bank_name,
          branch_name,
          account_type,
          is_primary,
          verification_status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending')
        RETURNING id, account_holder_name, ifsc_code, bank_name, is_primary, verification_status, created_at
      `, [
        p.sellerId,
        input.accountHolderName,
        encrypted,
        keyReference,
        input.ifscCode.toUpperCase(),
        input.bankName,
        input.branchName || null,
        input.accountType || null,
        input.isPrimary,
      ]);

      await audit(client, {
        sellerId: p.sellerId,
        actorUserId: p.userId,
        action: 'bank_account.created',
        targetType: 'bank_account',
        targetId: result.rows[0].id,
        requestId: request.id,
        metadata: { ifscCode: input.ifscCode, isPrimary: input.isPrimary },
      });

      return reply.code(201).send(result.rows[0]);
    });
  });

  // Update bank account
  app.patch('/v1/bank-accounts/:accountId', { preHandler: requireSeller }, async (request) => {
    const p = principal(request);
    const accountId = uuid.parse((request.params as { accountId: string }).accountId);
    const updates = z.object({
      accountHolderName: z.string().trim().min(2).max(120).optional(),
      branchName: z.string().trim().max(120).optional(),
      isPrimary: z.boolean().optional(),
      isActive: z.boolean().optional(),
      notes: z.string().trim().max(1000).optional(),
    }).parse(request.body);

    return withSellerTransaction(p.sellerId, async (client) => {
      // Verify account exists and belongs to seller
      const current = await client.query(`
        SELECT id FROM bank_accounts
        WHERE id = $1 AND seller_id = $2
        FOR UPDATE
      `, [accountId, p.sellerId]);

      if (!current.rows[0]) {
        throw Object.assign(new Error('Bank account not found'), { statusCode: 404 });
      }

      // If setting as primary, unset existing primary
      if (updates.isPrimary) {
        await client.query(`
          UPDATE bank_accounts 
          SET is_primary = false, updated_at = now()
          WHERE seller_id = $1 AND is_primary = true AND id <> $2
        `, [p.sellerId, accountId]);
      }

      const setClauses: string[] = [];
      const values: any[] = [];
      let paramIdx = 1;

      if (updates.accountHolderName !== undefined) {
        setClauses.push(`account_holder_name = $${paramIdx}`);
        values.push(updates.accountHolderName);
        paramIdx++;
      }

      if (updates.branchName !== undefined) {
        setClauses.push(`branch_name = $${paramIdx}`);
        values.push(updates.branchName);
        paramIdx++;
      }

      if (updates.isPrimary !== undefined) {
        setClauses.push(`is_primary = $${paramIdx}`);
        values.push(updates.isPrimary);
        paramIdx++;
      }

      if (updates.isActive !== undefined) {
        setClauses.push(`is_active = $${paramIdx}`);
        values.push(updates.isActive);
        paramIdx++;
      }

      if (updates.notes !== undefined) {
        setClauses.push(`notes = $${paramIdx}`);
        values.push(updates.notes);
        paramIdx++;
      }

      if (setClauses.length === 0) {
        throw Object.assign(new Error('No updates provided'), { statusCode: 400 });
      }

      setClauses.push('updated_at = now()');
      values.push(accountId, p.sellerId);

      const result = await client.query(`
        UPDATE bank_accounts 
        SET ${setClauses.join(', ')}
        WHERE id = $${paramIdx} AND seller_id = $${paramIdx + 1}
        RETURNING id, account_holder_name, ifsc_code, bank_name, is_primary, is_active, updated_at
      `, values);

      await audit(client, {
        sellerId: p.sellerId,
        actorUserId: p.userId,
        action: 'bank_account.updated',
        targetType: 'bank_account',
        targetId: accountId,
        requestId: request.id,
        metadata: { updates: Object.keys(updates) },
      });

      return result.rows[0];
    });
  });

  // Verify bank account (typically done via penny drop or manual verification)
  app.post('/v1/bank-accounts/:accountId/verify', { preHandler: requireSeller }, async (request) => {
    const p = principal(request);
    const accountId = uuid.parse((request.params as { accountId: string }).accountId);
    const input = verifyAccountInput.parse(request.body);

    return withSellerTransaction(p.sellerId, async (client) => {
      const current = await client.query<{ verification_status: string }>(`
        SELECT verification_status
        FROM bank_accounts
        WHERE id = $1 AND seller_id = $2
        FOR UPDATE
      `, [accountId, p.sellerId]);

      if (!current.rows[0]) {
        throw Object.assign(new Error('Bank account not found'), { statusCode: 404 });
      }

      if (current.rows[0].verification_status === 'verified') {
        throw Object.assign(new Error('Account already verified'), { statusCode: 409 });
      }

      const result = await client.query(`
        UPDATE bank_accounts 
        SET 
          verification_status = 'verified',
          verified_at = now(),
          verification_method = $1,
          verification_reference = $2,
          updated_at = now()
        WHERE id = $3
        RETURNING id, verification_status, verified_at, verification_method
      `, [input.verificationMethod, input.verificationReference || null, accountId]);

      await audit(client, {
        sellerId: p.sellerId,
        actorUserId: p.userId,
        action: 'bank_account.verified',
        targetType: 'bank_account',
        targetId: accountId,
        requestId: request.id,
        metadata: { method: input.verificationMethod },
      });

      return result.rows[0];
    });
  });

  // Delete bank account
  app.delete('/v1/bank-accounts/:accountId', { preHandler: requireSeller }, async (request, reply) => {
    const p = principal(request);
    const accountId = uuid.parse((request.params as { accountId: string }).accountId);

    return withSellerTransaction(p.sellerId, async (client) => {
      // Check if account is linked to any COD cycles
      const linkedCycles = await client.query(`
        SELECT COUNT(*) AS count
        FROM cod_remittance_cycles
        WHERE bank_account_id = $1
      `, [accountId]);

      if (parseInt(linkedCycles.rows[0].count) > 0) {
        throw Object.assign(
          new Error('Cannot delete bank account that has associated COD remittance cycles'),
          { statusCode: 409 }
        );
      }

      const result = await client.query(`
        DELETE FROM bank_accounts
        WHERE id = $1 AND seller_id = $2
        RETURNING id
      `, [accountId, p.sellerId]);

      if (!result.rows[0]) {
        throw Object.assign(new Error('Bank account not found'), { statusCode: 404 });
      }

      await audit(client, {
        sellerId: p.sellerId,
        actorUserId: p.userId,
        action: 'bank_account.deleted',
        targetType: 'bank_account',
        targetId: accountId,
        requestId: request.id,
      });

      return reply.code(204).send();
    });
  });
}
