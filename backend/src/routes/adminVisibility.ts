import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db/client.js';
import { requireAccountAdmin, requirePlatformAdmin } from '../lib/adminAuth.js';

export async function adminVisibilityRoutes(app: FastifyInstance) {
  app.get('/v1/admin/audit-events', { preHandler: requirePlatformAdmin }, async (request) => {
    const q = z.object({
      sellerId: z.string().uuid().optional(),
      action: z.string().trim().max(120).optional(),
      limit: z.coerce.number().int().min(1).max(200).default(100),
    }).parse(request.query);
    const result = await db.query(
      `SELECT a.id, a.action, a.target_type, a.target_id, a.metadata, a.created_at,
              s.legal_name AS seller_name, u.email AS actor_email
       FROM audit_events a
       LEFT JOIN sellers s ON s.id = a.seller_id
       LEFT JOIN users u ON u.id = a.actor_user_id
       WHERE ($1::uuid IS NULL OR a.seller_id = $1) AND ($2::text IS NULL OR a.action ILIKE '%' || $2 || '%')
       ORDER BY a.created_at DESC LIMIT $3`,
      [q.sellerId ?? null, q.action ?? null, q.limit],
    );
    return { items: result.rows };
  });

  app.get('/v1/admin/jobs', { preHandler: requirePlatformAdmin }, async (request) => {
    const q = z.object({
      state: z.enum(['queued', 'running', 'succeeded', 'failed', 'dead_letter']).optional(),
      jobType: z.string().trim().max(120).optional(),
      limit: z.coerce.number().int().min(1).max(200).default(100),
    }).parse(request.query);
    const result = await db.query(
      `SELECT j.id, j.job_type, j.state, j.attempts, j.error_summary, j.queued_at, j.started_at, j.completed_at, s.legal_name AS seller_name
       FROM job_runs j LEFT JOIN sellers s ON s.id = j.seller_id
       WHERE ($1::job_state IS NULL OR j.state = $1) AND ($2::text IS NULL OR j.job_type = $2)
       ORDER BY j.queued_at DESC LIMIT $3`,
      [q.state ?? null, q.jobType ?? null, q.limit],
    );
    return { items: result.rows };
  });

  // A dead-lettered or failed job is requeued, not silently discarded — it
  // goes back through the exact same worker path a fresh job would, so
  // whatever fixed the underlying issue (a since-corrected record, a
  // provider outage that ended) gets a real chance to succeed this time.
  app.post('/v1/admin/jobs/:jobId/retry', { preHandler: [requirePlatformAdmin, requireAccountAdmin] }, async (request, reply) => {
    const jobId = z.string().uuid().parse((request.params as { jobId: string }).jobId);
    const current = await db.query<{ state: string }>('SELECT state FROM job_runs WHERE id = $1 FOR UPDATE', [jobId]);
    if (!current.rows[0]) return reply.code(404).send({ error: 'JOB_NOT_FOUND' });
    if (!['failed', 'dead_letter'].includes(current.rows[0].state)) return reply.code(409).send({ error: 'JOB_NOT_RETRYABLE' });
    // next_attempt_at also resets to now(): an admin clicking "retry" means
    // try again immediately, not "wait out whatever backoff was already in
    // progress" (job_runs.next_attempt_at, added after this endpoint was
    // first written, is what the worker's claim query actually checks).
    const result = await db.query('UPDATE job_runs SET state=\'queued\', error_summary=NULL, started_at=NULL, completed_at=NULL, next_attempt_at=now() WHERE id=$1 RETURNING id, state', [jobId]);
    await db.query(
      `INSERT INTO audit_events (actor_user_id, action, target_type, target_id, request_id)
       VALUES ($1,'job.retried','job_run',$2,$3)`,
      [request.adminPrincipal!.userId, jobId, request.id],
    );
    return result.rows[0];
  });

  app.get('/v1/admin/webhook-deliveries', { preHandler: requirePlatformAdmin }, async (request) => {
    const q = z.object({
      providerCode: z.string().trim().max(64).optional(),
      onlyFailed: z.coerce.boolean().default(false),
      limit: z.coerce.number().int().min(1).max(200).default(100),
    }).parse(request.query);
    const result = await db.query(
      `SELECT id, provider_code, external_event_id, received_at, processed_at, processing_error
       FROM webhook_deliveries
       WHERE ($1::text IS NULL OR provider_code = $1) AND (NOT $2 OR processing_error IS NOT NULL)
       ORDER BY received_at DESC LIMIT $3`,
      [q.providerCode ?? null, q.onlyFailed, q.limit],
    );
    return { items: result.rows };
  });
}
