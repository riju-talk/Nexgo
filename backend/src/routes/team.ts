import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import argon2 from 'argon2';
import { withSellerTransaction, withTransaction } from '../db/client.js';
import { audit } from '../lib/audit.js';
import { hashSessionToken, newSessionToken } from '../lib/session.js';
import { sendMail } from '../lib/mailer.js';
import { config } from '../config.js';
import { sessionCookieOptions } from '../lib/cookies.js';
import { issueCsrfCookie } from '../lib/csrf.js';
import { requireSeller } from './seller.js';
import { PERMISSION_GROUPS, PERMISSION_KEYS } from '../lib/permissions.js';

function principal(request: FastifyRequest) {
  if (!request.principal) throw Object.assign(new Error('Authentication required'), { statusCode: 401 });
  return request.principal;
}

function requireOwner(request: FastifyRequest) {
  if (principal(request).role !== 'owner') throw Object.assign(new Error('Only the account owner can manage the team'), { statusCode: 403 });
}

const inviteInput = z.object({ email: z.string().email().max(254), role: z.enum(['owner', 'operations', 'finance', 'read_only']) });
const INVITE_TTL_HOURS = 72;
const permissionList = z.array(z.string()).min(1, 'Pick at least one permission').refine((l) => l.every((k) => PERMISSION_KEYS.includes(k)), 'Unknown permission');

export async function teamRoutes(app: FastifyInstance) {
  app.get('/v1/seller/team', { preHandler: requireSeller }, async (request) => {
    const p = principal(request);
    return withSellerTransaction(p.sellerId, async (client) => {
      const members = await client.query('SELECT u.id AS user_id, u.full_name, u.email, u.phone, m.role, m.permissions, m.created_at FROM seller_memberships m JOIN users u ON u.id = m.user_id WHERE m.seller_id=$1 ORDER BY m.created_at', [p.sellerId]);
      const invitations = await client.query('SELECT id, email, role, status, expires_at, created_at FROM seller_invitations WHERE seller_id=$1 AND status=\'pending\' ORDER BY created_at DESC', [p.sellerId]);
      return { members: members.rows, pendingInvitations: invitations.rows, permissionGroups: PERMISSION_GROUPS };
    });
  });

  // Owner adds an employee directly (name, email, optional mobile, password) with chosen permissions.
  app.post('/v1/seller/team/employees', { preHandler: requireSeller }, async (request, reply) => {
    requireOwner(request);
    const p = principal(request);
    const input = z.object({
      fullName: z.string().trim().min(2).max(100), email: z.string().email().max(254),
      phone: z.string().trim().regex(/^[0-9+() -]{7,24}$/).optional().or(z.literal('').transform(() => undefined)),
      password: z.string().min(12).max(200), permissions: permissionList,
    }).parse(request.body);
    const email = input.email.toLowerCase();
    const row = await withSellerTransaction(p.sellerId, async (client) => {
      const existing = await client.query('SELECT 1 FROM users WHERE email=$1', [email]);
      if (existing.rows[0]) throw Object.assign(new Error('An account with this email already exists. Use Invite instead.'), { statusCode: 409 });
      const hash = await argon2.hash(input.password, { type: argon2.argon2id });
      const user = await client.query<{ id: string }>('INSERT INTO users (email, password_hash, full_name, phone) VALUES ($1,$2,$3,$4) RETURNING id', [email, hash, input.fullName, input.phone ?? null]);
      await client.query("INSERT INTO seller_memberships (seller_id, user_id, role, permissions) VALUES ($1,$2,'operations',$3)", [p.sellerId, user.rows[0].id, input.permissions]);
      await audit(client, { sellerId: p.sellerId, actorUserId: p.userId, action: 'team.employee_added', targetType: 'user', targetId: user.rows[0].id, requestId: request.id, metadata: { email, permissions: input.permissions } });
      return { userId: user.rows[0].id, email, permissions: input.permissions };
    });
    return reply.code(201).send(row);
  });

  app.put('/v1/seller/team/:userId/permissions', { preHandler: requireSeller }, async (request, reply) => {
    requireOwner(request);
    const p = principal(request);
    const userId = z.string().uuid().parse((request.params as { userId: string }).userId);
    const { permissions } = z.object({ permissions: permissionList }).parse(request.body);
    const updated = await withSellerTransaction(p.sellerId, async (client) => {
      const row = await client.query("UPDATE seller_memberships SET permissions=$3 WHERE seller_id=$1 AND user_id=$2 AND role <> 'owner' RETURNING user_id", [p.sellerId, userId, permissions]);
      if (row.rows[0]) await audit(client, { sellerId: p.sellerId, actorUserId: p.userId, action: 'team.permissions_updated', targetType: 'user', targetId: userId, requestId: request.id, metadata: { permissions } });
      return row.rows[0];
    });
    if (!updated) return reply.code(404).send({ error: 'MEMBER_NOT_FOUND' });
    return { ok: true, permissions };
  });

  app.post('/v1/seller/team/invite', { preHandler: requireSeller }, async (request, reply) => {
    requireOwner(request);
    const input = inviteInput.parse(request.body);
    const p = principal(request);
    const token = newSessionToken();
    const row = await withSellerTransaction(p.sellerId, async (client) => {
      const existingMember = await client.query('SELECT 1 FROM seller_memberships m JOIN users u ON u.id=m.user_id WHERE m.seller_id=$1 AND u.email=$2', [p.sellerId, input.email.toLowerCase()]);
      if (existingMember.rows[0]) throw Object.assign(new Error('This person is already on the team'), { statusCode: 409 });
      await client.query('UPDATE seller_invitations SET status=\'revoked\', revoked_at=now() WHERE seller_id=$1 AND email=$2 AND status=\'pending\'', [p.sellerId, input.email.toLowerCase()]);
      const result = await client.query(
        `INSERT INTO seller_invitations (seller_id, email, role, token_hash, invited_by, expires_at)
         VALUES ($1,$2,$3,$4,$5, now() + interval '${INVITE_TTL_HOURS} hours') RETURNING id, email, role, expires_at`,
        [p.sellerId, input.email.toLowerCase(), input.role, hashSessionToken(token), p.userId],
      );
      await audit(client, { sellerId: p.sellerId, actorUserId: p.userId, action: 'team.invited', targetType: 'seller_invitation', targetId: result.rows[0].id, requestId: request.id, metadata: { email: input.email, role: input.role } });
      return result.rows[0];
    });
    await sendMail(input.email, 'You’re invited to NEXGO', `You've been invited to join a NEXGO seller workspace as ${input.role}.\n\nAccept: ${config.FRONTEND_ORIGIN}/team/accept?token=${token}\n\nThis link expires in ${INVITE_TTL_HOURS} hours.`);
    return reply.code(201).send(row);
  });

  app.delete('/v1/seller/team/invitations/:invitationId', { preHandler: requireSeller }, async (request, reply) => {
    requireOwner(request);
    const p = principal(request);
    const invitationId = z.string().uuid().parse((request.params as { invitationId: string }).invitationId);
    const result = await withSellerTransaction(p.sellerId, async (client) => {
      const row = await client.query('UPDATE seller_invitations SET status=\'revoked\', revoked_at=now() WHERE id=$1 AND seller_id=$2 AND status=\'pending\' RETURNING id', [invitationId, p.sellerId]);
      if (row.rows[0]) await audit(client, { sellerId: p.sellerId, actorUserId: p.userId, action: 'team.invitation_revoked', targetType: 'seller_invitation', targetId: invitationId, requestId: request.id });
      return row.rows[0];
    });
    if (!result) return reply.code(404).send({ error: 'INVITATION_NOT_FOUND' });
    return reply.code(204).send();
  });

  app.delete('/v1/seller/team/:userId', { preHandler: requireSeller }, async (request, reply) => {
    requireOwner(request);
    const p = principal(request);
    const userId = z.string().uuid().parse((request.params as { userId: string }).userId);
    if (userId === p.userId) return reply.code(400).send({ error: 'CANNOT_REMOVE_SELF' });
    const removed = await withSellerTransaction(p.sellerId, async (client) => {
      const row = await client.query('DELETE FROM seller_memberships WHERE seller_id=$1 AND user_id=$2 RETURNING user_id', [p.sellerId, userId]);
      if (row.rows[0]) {
        await client.query('UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL', [userId]);
        await audit(client, { sellerId: p.sellerId, actorUserId: p.userId, action: 'team.member_removed', targetType: 'user', targetId: userId, requestId: request.id });
      }
      return row.rows[0];
    });
    if (!removed) return reply.code(404).send({ error: 'MEMBER_NOT_FOUND' });
    return reply.code(204).send();
  });

  // Public: the invitee has no session yet, only the token from the email.
  app.post('/v1/team/invitations/accept', async (request, reply) => {
    const { token, fullName, password } = z.object({ token: z.string().min(20), fullName: z.string().trim().min(2).max(100), password: z.string().min(12).max(200) }).parse(request.body);
    const session = await withTransaction(async (client) => {
      const invitation = await client.query<{ id: string; seller_id: string; email: string; role: string }>(
        'SELECT id, seller_id, email, role FROM seller_invitations WHERE token_hash=$1 AND status=\'pending\' AND expires_at > now() FOR UPDATE',
        [hashSessionToken(token)],
      );
      if (!invitation.rows[0]) return null;
      const inv = invitation.rows[0];
      const existingUser = await client.query<{ id: string }>('SELECT id FROM users WHERE email=$1', [inv.email]);
      let userId: string;
      if (existingUser.rows[0]) {
        userId = existingUser.rows[0].id;
      } else {
        const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
        const created = await client.query<{ id: string }>('INSERT INTO users (email, password_hash, full_name) VALUES ($1,$2,$3) RETURNING id', [inv.email, passwordHash, fullName]);
        userId = created.rows[0].id;
      }
      await client.query('INSERT INTO seller_memberships (seller_id, user_id, role) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [inv.seller_id, userId, inv.role]);
      await client.query('UPDATE seller_invitations SET status=\'accepted\', accepted_at=now() WHERE id=$1', [inv.id]);
      const token2 = newSessionToken();
      const createdSession = await client.query<{ expires_at: string }>('INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1,$2, now() + ($3 || \' days\')::interval) RETURNING expires_at', [userId, hashSessionToken(token2), String(config.SESSION_TTL_DAYS)]);
      await audit(client, { sellerId: inv.seller_id, actorUserId: userId, action: 'team.invitation_accepted', targetType: 'seller_invitation', targetId: inv.id, requestId: request.id });
      return { token: token2, expiresAt: createdSession.rows[0].expires_at, sellerId: inv.seller_id, role: inv.role };
    });
    if (!session) return reply.code(410).send({ error: 'INVITATION_INVALID_OR_EXPIRED' });
    reply.setCookie('nx_session', session.token, sessionCookieOptions());
    issueCsrfCookie(reply);
    return reply.code(201).send({ sellerId: session.sellerId, role: session.role, expiresAt: session.expiresAt });
  });
}
