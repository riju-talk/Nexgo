import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { withSellerTransaction } from '../db/client.js';
import { audit } from '../lib/audit.js';
import { requireSeller } from './seller.js';

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5][05]$/, 'Times use 24-hour HH:mm with minutes in steps of 5');
const emails = z.array(z.string().trim().toLowerCase().email().max(254)).max(20);
const scheduleInput = z.object({
  reportType: z.enum(['pickup_pending', 'delivery', 'delivery_failed']),
  frequency: z.enum(['daily', 'weekly', 'monthly']),
  runTimes: z.array(hhmm).min(1).max(6),
  fromDaysAgo: z.number().int().min(0).max(365).nullable().optional(),
  toDaysAgo: z.number().int().min(0).max(365).nullable().optional(),
  toEmails: emails.min(1, 'Add at least one recipient'),
  ccEmails: emails.default([]),
  bccEmails: emails.default([]),
  statusFilter: z.array(z.string().trim().min(2).max(40)).max(20).default([]),
}).refine((v) => v.fromDaysAgo == null || v.toDaysAgo == null || v.fromDaysAgo >= v.toDaysAgo, { message: 'From days ago must be the same as or more than To days ago', path: ['fromDaysAgo'] });

const columns = 'id, report_type, frequency, run_times, from_days_ago, to_days_ago, to_emails, cc_emails, bcc_emails, status_filter, created_at, updated_at';
function principal(request: FastifyRequest) {
  if (!request.principal) throw Object.assign(new Error('Authentication required'), { statusCode: 401 });
  return request.principal;
}
const values = (i: z.infer<typeof scheduleInput>) => [i.reportType, i.frequency, [...new Set(i.runTimes)].sort(), i.fromDaysAgo ?? null, i.toDaysAgo ?? null, i.toEmails, i.ccEmails, i.bccEmails, i.statusFilter];

export async function emailScheduleRoutes(app: FastifyInstance) {
  app.get('/v1/email-schedules', { preHandler: requireSeller }, async (request) => {
    const p = principal(request);
    return withSellerTransaction(p.sellerId, async (client) => ({ items: (await client.query(`SELECT ${columns} FROM email_schedules WHERE seller_id = $1 ORDER BY created_at`, [p.sellerId])).rows }));
  });

  app.post('/v1/email-schedules', { preHandler: requireSeller }, async (request, reply) => {
    const p = principal(request);
    const input = scheduleInput.parse(request.body);
    const row = await withSellerTransaction(p.sellerId, async (client) => {
      const count = await client.query<{ n: number }>('SELECT count(*)::int AS n FROM email_schedules WHERE seller_id = $1', [p.sellerId]);
      if (count.rows[0].n >= 20) throw Object.assign(new Error('You can keep up to 20 schedules'), { statusCode: 409 });
      const result = await client.query(
        `INSERT INTO email_schedules (seller_id, report_type, frequency, run_times, from_days_ago, to_days_ago, to_emails, cc_emails, bcc_emails, status_filter) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING ${columns}`,
        [p.sellerId, ...values(input)]);
      await audit(client, { sellerId: p.sellerId, actorUserId: p.userId, action: 'email_schedule.created', targetType: 'email_schedule', targetId: result.rows[0].id, requestId: request.id });
      return result.rows[0];
    });
    return reply.code(201).send(row);
  });

  app.put('/v1/email-schedules/:scheduleId', { preHandler: requireSeller }, async (request, reply) => {
    const p = principal(request);
    const id = z.string().uuid().parse((request.params as { scheduleId: string }).scheduleId);
    const input = scheduleInput.parse(request.body);
    const row = await withSellerTransaction(p.sellerId, async (client) => (await client.query(
      `UPDATE email_schedules SET report_type=$3, frequency=$4, run_times=$5, from_days_ago=$6, to_days_ago=$7, to_emails=$8, cc_emails=$9, bcc_emails=$10, status_filter=$11, updated_at=now()
       WHERE id=$1 AND seller_id=$2 RETURNING ${columns}`, [id, p.sellerId, ...values(input)])).rows[0]);
    if (!row) return reply.code(404).send({ error: 'SCHEDULE_NOT_FOUND' });
    return row;
  });

  app.delete('/v1/email-schedules/:scheduleId', { preHandler: requireSeller }, async (request, reply) => {
    const p = principal(request);
    const id = z.string().uuid().parse((request.params as { scheduleId: string }).scheduleId);
    const row = await withSellerTransaction(p.sellerId, async (client) => (await client.query('DELETE FROM email_schedules WHERE id=$1 AND seller_id=$2 RETURNING id', [id, p.sellerId])).rows[0]);
    if (!row) return reply.code(404).send({ error: 'SCHEDULE_NOT_FOUND' });
    return reply.code(204).send();
  });
}
