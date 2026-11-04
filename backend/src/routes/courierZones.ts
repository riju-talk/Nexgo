/**
 * Courier Zone Management Routes
 *
 * Admin-only endpoints for managing courier service lanes.
 * Enables zone configuration, bulk imports, and serviceability management.
 *
 * All routes require admin authentication.
 *
 * @module routes/courierZones
 */
import type { FastifyInstance, FastifyReply } from 'fastify';

/** Loose request shape: handlers validate and coerce their own params/query/body. */
type Req = any;
import { db } from '../db/client.js';
import { createZoneManagementService } from '../services/ZoneManagementService.js';
import { requirePlatformAdmin } from '../lib/adminAuth.js';
import PaginationService from '../services/PaginationService.js';
// ============================================================================
// ROUTES
// ============================================================================
export default async function courierZonesRoutes(app: FastifyInstance) {
    const zoneService = createZoneManagementService(db);
    /**
     * GET /v1/admin/couriers/:courierId/zones/lanes
     *
     * List all lanes for a courier with optional filtering
     *
     * Query params:
     * - originPincode: Filter by origin pincode
     * - destinationPincode: Filter by destination pincode
     * - zone: Filter by zone
     * - serviceType: Filter by service type
     * - isServiceable: Filter by serviceability
     * - page: Page number (default: 1)
     * - pageSize: Items per page (default: 50, max: 200)
     */
    app.get('/v1/admin/couriers/:courierId/zones/lanes', { preHandler: requirePlatformAdmin }, async (request: Req, reply: FastifyReply) => {
        const { courierId } = request.params;
        const { originPincode, destinationPincode, zone, serviceType, isServiceable, page, pageSize } = request.query;
        try {
            const result = await zoneService.getLanes({
                courierProviderId: courierId,
                originPincode,
                destinationPincode,
                zone: zone,
                serviceType: serviceType,
                isServiceable: isServiceable === 'true' ? true : isServiceable === 'false' ? false : undefined,
                page: page ? parseInt(page, 10) : 1,
                pageSize: Math.min(pageSize ? parseInt(pageSize, 10) : 50, 200)
            });
            return reply.send(PaginationService.paginate(result.lanes, result.page, result.pageSize, result.total));
        }
        catch (error) {
            request.log.error(error, 'Failed to fetch courier lanes');
            return reply.status(500).send({
                error: 'Failed to fetch lanes',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    });
    /**
     * GET /v1/admin/couriers/:courierId/zones/lanes/stats
     *
     * Get lane statistics for a courier
     */
    app.get('/v1/admin/couriers/:courierId/zones/lanes/stats', { preHandler: requirePlatformAdmin }, async (request: Req, reply: FastifyReply) => {
        const { courierId } = request.params;
        try {
            const stats = await zoneService.getLaneStats(courierId);
            return reply.send(stats);
        }
        catch (error) {
            request.log.error(error, 'Failed to fetch lane stats');
            return reply.status(500).send({
                error: 'Failed to fetch stats',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    });
    /**
     * POST /v1/admin/couriers/:courierId/zones/lanes
     *
     * Create a new lane
     *
     * Note: courierId in URL is ignored; use courierProviderId in body
     * This maintains REST convention while allowing flexibility
     */
    app.post('/v1/admin/couriers/:courierId/zones/lanes', { preHandler: requirePlatformAdmin }, async (request: Req, reply: FastifyReply) => {
        const { courierProviderId, originPincode, destinationPincode, zone, serviceType, isServiceable, transitDays } = request.body;
        try {
            const lane = await zoneService.createLane({
                courierProviderId,
                originPincode,
                destinationPincode,
                zone: zone,
                serviceType: serviceType,
                isServiceable,
                transitDays,
                createdBy: request.adminPrincipal?.userId
            });
            return reply.status(201).send(lane);
        }
        catch (error) {
            request.log.error(error, 'Failed to create lane');
            // Handle duplicate lane error
            if (error instanceof Error && error.message.includes('duplicate key')) {
                return reply.status(409).send({
                    error: 'Lane already exists',
                    message: 'A lane with this origin and destination already exists for this courier'
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
                error: 'Failed to create lane',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    });
    /**
     * PATCH /v1/admin/couriers/:courierId/zones/lanes/:laneId
     *
     * Update an existing lane
     */
    app.patch('/v1/admin/couriers/:courierId/zones/lanes/:laneId', { preHandler: requirePlatformAdmin }, async (request: Req, reply: FastifyReply) => {
        const { laneId } = request.params;
        const { zone, serviceType, isServiceable, transitDays } = request.body;
        try {
            const lane = await zoneService.updateLane(laneId, {
                zone: zone,
                serviceType: serviceType,
                isServiceable,
                transitDays
            });
            return reply.send(lane);
        }
        catch (error) {
            request.log.error(error, 'Failed to update lane');
            // Handle not found
            if (error instanceof Error && error.message.includes('not found')) {
                return reply.status(404).send({
                    error: 'Lane not found',
                    message: 'The specified lane does not exist'
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
                error: 'Failed to update lane',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    });
    /**
     * DELETE /v1/admin/couriers/:courierId/zones/lanes/:laneId
     *
     * Delete a lane
     */
    app.delete('/v1/admin/couriers/:courierId/zones/lanes/:laneId', { preHandler: requirePlatformAdmin }, async (request: Req, reply: FastifyReply) => {
        const { laneId } = request.params;
        try {
            await zoneService.deleteLane(laneId);
            return reply.status(204).send();
        }
        catch (error) {
            request.log.error(error, 'Failed to delete lane');
            // Handle not found
            if (error instanceof Error && error.message.includes('not found')) {
                return reply.status(404).send({
                    error: 'Lane not found',
                    message: 'The specified lane does not exist'
                });
            }
            return reply.status(500).send({
                error: 'Failed to delete lane',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    });
    /**
     * POST /v1/admin/couriers/:courierId/zones/lanes/bulk-import
     *
     * Bulk import lanes from CSV data
     *
     * Body:
     * {
     *   "courierProviderId": "uuid",
     *   "lanes": [
     *     {
     *       "originPincode": "110001",
     *       "destinationPincode": "400001",
     *       "zone": "metro_to_metro",
     *       "serviceType": "surface",
     *       "transitDays": 3,
     *       "isServiceable": true
     *     },
     *     ...
     *   ]
     * }
     *
     * Uses ON CONFLICT to update existing lanes.
     * Returns success/failure counts and detailed errors.
     */
    app.post('/v1/admin/couriers/:courierId/zones/lanes/bulk-import', { preHandler: requirePlatformAdmin }, async (request: Req, reply: FastifyReply) => {
        const { courierProviderId, lanes } = request.body;
        if (!Array.isArray(lanes)) {
            return reply.status(400).send({
                error: 'Invalid request',
                message: 'lanes must be an array'
            });
        }
        if (lanes.length === 0) {
            return reply.status(400).send({
                error: 'Invalid request',
                message: 'lanes array cannot be empty'
            });
        }
        if (lanes.length > 10000) {
            return reply.status(400).send({
                error: 'Invalid request',
                message: 'Maximum 10,000 lanes per import'
            });
        }
        try {
            const result = await zoneService.bulkImportLanes(courierProviderId, lanes, request.adminPrincipal?.userId);
            return reply.status(200).send({
                success: result.success,
                failed: result.failed,
                total: lanes.length,
                errors: result.errors.slice(0, 100), // Limit error details to first 100
                hasMore: result.errors.length > 100
            });
        }
        catch (error) {
            request.log.error(error, 'Failed to bulk import lanes');
            // Handle courier not found
            if (error instanceof Error && error.message.includes('Courier provider not found')) {
                return reply.status(404).send({
                    error: 'Courier not found',
                    message: 'The specified courier provider does not exist'
                });
            }
            return reply.status(500).send({
                error: 'Failed to import lanes',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    });
}
