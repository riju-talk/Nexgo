/**
 * Courier Performance Analytics Routes
 *
 * Admin-only endpoints for viewing courier performance metrics.
 * Enables comparison and historical trend analysis.
 *
 * @module routes/courierPerformance
 */
import type { FastifyInstance, FastifyReply } from 'fastify';

/** Loose request shape: handlers validate and coerce their own params/query/body. */
type Req = any;
import { db } from '../db/client.js';
import { createPerformanceService } from '../services/PerformanceService.js';
import { requirePlatformAdmin } from '../lib/adminAuth.js';
import PaginationService from '../services/PaginationService.js';
// ============================================================================
// ROUTES
// ============================================================================
export default async function courierPerformanceRoutes(app: FastifyInstance) {
    const performanceService = createPerformanceService(db);
    /**
     * GET /v1/admin/couriers/:courierId/performance
     *
     * Get performance metrics for a single courier
     *
     * Query params:
     * - from: Start date (YYYY-MM-DD)
     * - to: End date (YYYY-MM-DD)
     */
    app.get('/v1/admin/couriers/:courierId/performance', { preHandler: requirePlatformAdmin }, async (request: Req, reply: FastifyReply) => {
        const { courierId } = request.params;
        const { from, to } = request.query;
        try {
            const toDate = to ? new Date(to) : new Date();
            const fromDate = from ? new Date(from) : new Date(toDate.getTime() - 30 * 24 * 60 * 60 * 1000);
            const metrics = await performanceService.getCourierMetrics(courierId, fromDate, toDate);
            return reply.send({
                courierId,
                dateRange: { from: fromDate.toISOString(), to: toDate.toISOString() },
                metrics
            });
        }
        catch (error) {
            request.log.error(error);
            return reply.status(500).send({
                error: 'Failed to fetch performance metrics',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    });
    /**
     * GET /v1/admin/couriers/performance/compare
     *
     * Compare performance across multiple couriers
     *
     * Query params:
     * - courierIds: Comma-separated courier IDs
     * - from: Start date
     * - to: End date
     */
    app.get('/v1/admin/couriers/performance/compare', { preHandler: requirePlatformAdmin }, async (request: Req, reply: FastifyReply) => {
        const { courierIds, from, to, page: p, pageSize: ps } = request.query;
        const { page, pageSize } = PaginationService.parseParams({ page: p, pageSize: ps });
        try {
            const ids = courierIds
                ? courierIds.split(',').map((id: string) => id.trim())
                : [];
            if (ids.length === 0) {
                // Get all couriers with pagination
                const allMetrics = await performanceService.getAllCourierMetrics(new Date(from || new Date().getTime() - 30 * 24 * 60 * 60 * 1000), new Date(to || new Date()));
                const total = allMetrics.length;
                const paginatedMetrics = allMetrics.slice((page - 1) * pageSize, page * pageSize);
                return reply.send(PaginationService.paginate(paginatedMetrics.map(m => ({ couriers: [m], dateRange: { from: new Date(from || new Date().getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(), to: new Date(to || new Date()).toISOString() } })), page, pageSize, total));
            }
            const toDate = to ? new Date(to) : new Date();
            const fromDate = from ? new Date(from) : new Date(toDate.getTime() - 30 * 24 * 60 * 60 * 1000);
            const comparison = await performanceService.comparePerformance(ids, fromDate, toDate);
            return reply.send(PaginationService.paginate([comparison], 1, pageSize, 1));
        }
        catch (error) {
            request.log.error(error);
            return reply.status(500).send({
                error: 'Failed to compare performance',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    });
    /**
     * GET /v1/admin/couriers/:courierId/performance/zones
     *
     * Get zone-wise performance breakdown
     */
    app.get('/v1/admin/couriers/:courierId/performance/zones', { preHandler: requirePlatformAdmin }, async (request: Req, reply: FastifyReply) => {
        const { courierId } = request.params;
        const { from, to } = request.query;
        try {
            const toDate = to ? new Date(to) : new Date();
            const fromDate = from ? new Date(from) : new Date(toDate.getTime() - 30 * 24 * 60 * 60 * 1000);
            const zonePerformance = await performanceService.getZonePerformance(courierId, fromDate, toDate);
            return reply.send({
                courierId,
                dateRange: { from: fromDate.toISOString(), to: toDate.toISOString() },
                zones: zonePerformance
            });
        }
        catch (error) {
            request.log.error(error);
            return reply.status(500).send({
                error: 'Failed to fetch zone performance',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    });
    /**
     * GET /v1/admin/couriers/:courierId/performance/timeseries
     *
     * Get time-series performance data (daily/weekly/monthly aggregates)
     *
     * Query params:
     * - from: Start date
     * - to: End date
     * - interval: day|week|month (default: day)
     */
    app.get('/v1/admin/couriers/:courierId/performance/timeseries', { preHandler: requirePlatformAdmin }, async (request: Req, reply: FastifyReply) => {
        const { courierId } = request.params;
        const { from, to, interval } = request.query;
        try {
            const toDate = to ? new Date(to) : new Date();
            const fromDate = from ? new Date(from) : new Date(toDate.getTime() - 30 * 24 * 60 * 60 * 1000);
            const validInterval: 'day' | 'week' | 'month' = ['day', 'week', 'month'].includes(interval) ? interval : 'day';
            const timeseries = await performanceService.getTimeSeriesMetrics(courierId, fromDate, toDate, validInterval);
            return reply.send({
                courierId,
                dateRange: { from: fromDate.toISOString(), to: toDate.toISOString() },
                interval: validInterval,
                data: timeseries
            });
        }
        catch (error) {
            request.log.error(error);
            return reply.status(500).send({
                error: 'Failed to fetch timeseries data',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    });
    /**
     * GET /v1/admin/couriers/performance/all
     *
     * Get performance metrics for all active couriers
     */
    app.get('/v1/admin/couriers/performance/all', { preHandler: requirePlatformAdmin }, async (request: Req, reply: FastifyReply) => {
        const { from, to } = request.query;
        try {
            const toDate = to ? new Date(to) : new Date();
            const fromDate = from ? new Date(from) : new Date(toDate.getTime() - 30 * 24 * 60 * 60 * 1000);
            const metrics = await performanceService.getAllCourierMetrics(fromDate, toDate);
            return reply.send({
                dateRange: { from: fromDate.toISOString(), to: toDate.toISOString() },
                couriers: metrics,
                summary: {
                    totalCouriers: metrics.length,
                    avgDeliveryRate: metrics.length > 0
                        ? Math.round((metrics.reduce((sum, m) => sum + m.deliveryRate, 0) / metrics.length) * 100) / 100
                        : 0,
                    avgNDRRate: metrics.length > 0
                        ? Math.round((metrics.reduce((sum, m) => sum + m.ndrRate, 0) / metrics.length) * 100) / 100
                        : 0
                }
            });
        }
        catch (error) {
            request.log.error(error);
            return reply.status(500).send({
                error: 'Failed to fetch all courier metrics',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    });
}
