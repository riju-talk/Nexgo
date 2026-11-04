/**
 * Courier SLA Configuration Routes
 *
 * Admin-only endpoints for managing SLA configuration.
 * Enables delivery promise and breach threshold management.
 *
 * All routes require admin authentication.
 *
 * @module routes/courierSLA
 */
import type { FastifyInstance, FastifyReply } from 'fastify';

/** Loose request shape: handlers validate and coerce their own params/query/body. */
type Req = any;
import { db } from '../db/client.js';
import { createSLAService } from '../services/SLAService.js';
import { requirePlatformAdmin } from '../lib/adminAuth.js';
import PaginationService from '../services/PaginationService.js';
// ============================================================================
// ROUTES
// ============================================================================
export default async function courierSLARoutes(app: FastifyInstance) {
    const slaService = createSLAService(db);
    /**
     * GET /v1/admin/couriers/:courierId/sla
     *
     * Get all SLA configurations for a courier with optional filtering
     */
    app.get('/v1/admin/couriers/:courierId/sla', { preHandler: requirePlatformAdmin }, async (request: Req, reply: FastifyReply) => {
        const { courierId } = request.params;
        const { zone, serviceType, isActive, page: p, pageSize: ps } = request.query;
        const { page, pageSize, offset } = PaginationService.parseParams({ page: p, pageSize: ps });
        try {
            const configs = await slaService.getConfigsByCourier(courierId, {
                zone: zone,
                serviceType: serviceType,
                isActive: isActive === 'true' ? true : isActive === 'false' ? false : undefined
            });
            const total = configs.length;
            const paginatedConfigs = configs.slice(offset, offset + pageSize);
            return reply.send(PaginationService.paginate(paginatedConfigs, page, pageSize, total));
        }
        catch (error) {
            request.log.error(error, 'Failed to fetch SLA configs');
            return reply.status(500).send({
                error: 'Failed to fetch SLA configurations',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    });
    /**
     * GET /v1/admin/couriers/:courierId/sla/:configId
     *
     * Get a specific SLA configuration
     */
    app.get('/v1/admin/couriers/:courierId/sla/:configId', { preHandler: requirePlatformAdmin }, async (request: Req, reply: FastifyReply) => {
        const { configId } = request.params;
        try {
            const config = await slaService.getConfig(configId);
            return reply.send(config);
        }
        catch (error) {
            request.log.error(error, 'Failed to fetch SLA config');
            if (error instanceof Error && error.message.includes('not found')) {
                return reply.status(404).send({
                    error: 'Configuration not found',
                    message: 'The specified SLA configuration does not exist'
                });
            }
            return reply.status(500).send({
                error: 'Failed to fetch configuration',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    });
    /**
     * POST /v1/admin/couriers/:courierId/sla
     *
     * Create or update SLA configuration for a zone
     * Uses upsert pattern (creates if new, updates if exists)
     */
    app.post('/v1/admin/couriers/:courierId/sla', { preHandler: requirePlatformAdmin }, async (request: Req, reply: FastifyReply) => {
        const { courierProviderId, zone, serviceType, promisedDays, breachThresholdHours, autoNotify, notifySeller, notifyAdmin, escalationHours } = request.body;
        try {
            const config = await slaService.createOrUpdateConfig({
                courierProviderId,
                zone: zone,
                serviceType: serviceType,
                promisedDays,
                breachThresholdHours,
                autoNotify,
                notifySeller,
                notifyAdmin,
                escalationHours,
                createdBy: request.adminPrincipal?.userId
            });
            return reply.status(201).send(config);
        }
        catch (error) {
            request.log.error(error, 'Failed to save SLA config');
            // Handle courier not found
            if (error instanceof Error && error.message.includes('Courier provider not found')) {
                return reply.status(404).send({
                    error: 'Courier not found',
                    message: 'The specified courier provider does not exist'
                });
            }
            // Handle validation errors
            if (error instanceof Error && error.name === 'ZodError') {
                return reply.status(400).send({
                    error: 'Validation failed',
                    message: error.message
                });
            }
            return reply.status(500).send({
                error: 'Failed to save configuration',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    });
    /**
     * PATCH /v1/admin/couriers/:courierId/sla/:configId
     *
     * Update an SLA configuration
     */
    app.patch('/v1/admin/couriers/:courierId/sla/:configId', { preHandler: requirePlatformAdmin }, async (request: Req, reply: FastifyReply) => {
        const { configId } = request.params;
        const { promisedDays, breachThresholdHours, autoNotify, notifySeller, notifyAdmin, escalationHours, isActive } = request.body;
        try {
            const config = await slaService.updateConfig(configId, {
                promisedDays,
                breachThresholdHours,
                autoNotify,
                notifySeller,
                notifyAdmin,
                escalationHours,
                isActive
            });
            return reply.send(config);
        }
        catch (error) {
            request.log.error(error, 'Failed to update SLA config');
            if (error instanceof Error && error.message.includes('not found')) {
                return reply.status(404).send({
                    error: 'Configuration not found',
                    message: 'The specified SLA configuration does not exist'
                });
            }
            if (error instanceof Error && error.name === 'ZodError') {
                return reply.status(400).send({
                    error: 'Validation failed',
                    message: error.message
                });
            }
            return reply.status(500).send({
                error: 'Failed to update configuration',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    });
    /**
     * DELETE /v1/admin/couriers/:courierId/sla/:configId
     *
     * Deactivate an SLA configuration (soft delete)
     */
    app.delete('/v1/admin/couriers/:courierId/sla/:configId', { preHandler: requirePlatformAdmin }, async (request: Req, reply: FastifyReply) => {
        const { configId } = request.params;
        try {
            await slaService.deactivateConfig(configId);
            return reply.status(204).send();
        }
        catch (error) {
            request.log.error(error, 'Failed to deactivate SLA config');
            if (error instanceof Error && error.message.includes('not found')) {
                return reply.status(404).send({
                    error: 'Configuration not found',
                    message: 'The specified SLA configuration does not exist'
                });
            }
            return reply.status(500).send({
                error: 'Failed to deactivate configuration',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    });
    /**
     * GET /v1/admin/sla/coverage
     *
     * Get SLA configuration coverage across all couriers
     * Shows which couriers have complete/partial/incomplete SLA setup
     */
    app.get('/v1/admin/sla/coverage', { preHandler: requirePlatformAdmin }, async (request: Req, reply: FastifyReply) => {
        try {
            const coverage = await slaService.getSLACoverage();
            return reply.send({ coverage });
        }
        catch (error) {
            request.log.error(error, 'Failed to fetch SLA coverage');
            return reply.status(500).send({
                error: 'Failed to fetch coverage',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    });
    /**
     * GET /v1/admin/couriers/:courierId/sla/metrics
     *
     * Get SLA performance metrics for a courier over a date range
     *
     * Query params:
     * - from: Start date (YYYY-MM-DD)
     * - to: End date (YYYY-MM-DD)
     */
    app.get('/v1/admin/couriers/:courierId/sla/metrics', { preHandler: requirePlatformAdmin }, async (request: Req, reply: FastifyReply) => {
        const { courierId } = request.params;
        const { from, to } = request.query;
        try {
            // Default to last 30 days
            const toDate = to ? new Date(to) : new Date();
            const fromDate = from ? new Date(from) : new Date(toDate.getTime() - 30 * 24 * 60 * 60 * 1000);
            const metrics = await slaService.calculateMetrics(courierId, fromDate, toDate);
            return reply.send({
                courierId,
                dateRange: { from: fromDate.toISOString(), to: toDate.toISOString() },
                metrics
            });
        }
        catch (error) {
            request.log.error(error, 'Failed to calculate metrics');
            return reply.status(500).send({
                error: 'Failed to calculate metrics',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    });
}
