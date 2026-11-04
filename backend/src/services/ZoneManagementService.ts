/**
 * Zone Management Service
 * 
 * Manages courier service lanes (origin → destination → zone mappings).
 * Used by admin panel to configure zone-based routing and serviceability.
 * 
 * Key Features:
 * • CRUD operations for courier lanes
 * • Bulk CSV import with validation
 * • Zone calculation from pincode pairs
 * • Service type filtering
 * • Transit time management
 * 
 * @module services/ZoneManagementService
 */

import type { Pool } from 'pg';
import { z } from 'zod';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Zone types matching database enum and rate_card_rates
 */
export type Zone = 
  | 'within_city'
  | 'within_state'
  | 'metro_to_metro'
  | 'rest_of_india'
  | 'ne_jk'
  | 'national';

export type ServiceType = 'surface' | 'air' | 'express' | 'hyperlocal';

export interface ServiceLane {
  id: string;
  courierProviderId: string;
  originPincode: string;
  destinationPincode: string;
  zone: Zone;
  serviceType: ServiceType | null;
  isServiceable: boolean;
  transitDays: number | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
}

export interface CreateLaneInput {
  courierProviderId: string;
  originPincode: string;
  destinationPincode: string;
  zone: Zone;
  serviceType?: ServiceType | null;
  isServiceable?: boolean;
  transitDays?: number | null;
  createdBy?: string;
}

export interface UpdateLaneInput {
  zone?: Zone;
  serviceType?: ServiceType | null;
  isServiceable?: boolean;
  transitDays?: number | null;
}

export interface LaneFilters {
  courierProviderId?: string;
  originPincode?: string;
  destinationPincode?: string;
  zone?: Zone;
  serviceType?: ServiceType;
  isServiceable?: boolean;
  page?: number;
  pageSize?: number;
}

export interface BulkImportRow {
  originPincode: string;
  destinationPincode: string;
  zone: Zone;
  serviceType?: ServiceType | null;
  transitDays?: number | null;
  isServiceable?: boolean;
}

export interface BulkImportResult {
  success: number;
  failed: number;
  errors: Array<{
    row: number;
    data: BulkImportRow;
    error: string;
  }>;
}

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const pincodeSchema = z.string().regex(/^\d{6}$/, 'Pincode must be exactly 6 digits');

const zoneSchema = z.enum([
  'within_city',
  'within_state',
  'metro_to_metro',
  'rest_of_india',
  'ne_jk',
  'national'
]);

const serviceTypeSchema = z.enum(['surface', 'air', 'express', 'hyperlocal']).nullable().optional();

const createLaneSchema = z.object({
  courierProviderId: z.string().uuid('Invalid courier provider ID'),
  originPincode: pincodeSchema,
  destinationPincode: pincodeSchema,
  zone: zoneSchema,
  serviceType: serviceTypeSchema,
  isServiceable: z.boolean().optional().default(true),
  transitDays: z.number().int().min(0).nullable().optional(),
  createdBy: z.string().uuid().optional()
});

const updateLaneSchema = z.object({
  zone: zoneSchema.optional(),
  serviceType: serviceTypeSchema,
  isServiceable: z.boolean().optional(),
  transitDays: z.number().int().min(0).nullable().optional()
}).refine(data => Object.keys(data).length > 0, {
  message: 'At least one field must be provided for update'
});

const bulkImportRowSchema = z.object({
  originPincode: pincodeSchema,
  destinationPincode: pincodeSchema,
  zone: zoneSchema,
  serviceType: serviceTypeSchema,
  transitDays: z.number().int().min(0).nullable().optional(),
  isServiceable: z.boolean().optional().default(true)
});

// ============================================================================
// SERVICE CLASS
// ============================================================================

export class ZoneManagementService {
  constructor(private pool: Pool) {}

  /**
   * Create a new service lane
   * 
   * @throws {Error} If validation fails or duplicate lane exists
   */
  async createLane(input: CreateLaneInput): Promise<ServiceLane> {
    // Validate input
    const validated = createLaneSchema.parse(input);

    // Insert into database
    const result = await this.pool.query<{
      id: string;
      courier_provider_id: string;
      origin_pincode: string;
      destination_pincode: string;
      zone: Zone;
      service_type: ServiceType | null;
      is_serviceable: boolean;
      transit_days: number | null;
      created_at: Date;
      updated_at: Date;
      created_by: string | null;
    }>(
      `INSERT INTO courier_service_lanes 
        (courier_provider_id, origin_pincode, destination_pincode, zone, 
         service_type, is_serviceable, transit_days, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        validated.courierProviderId,
        validated.originPincode,
        validated.destinationPincode,
        validated.zone,
        validated.serviceType ?? null,
        validated.isServiceable ?? true,
        validated.transitDays ?? null,
        validated.createdBy ?? null
      ]
    );

    if (result.rows.length === 0) {
      throw new Error('Failed to create service lane');
    }

    return this.mapRowToLane(result.rows[0]);
  }

  /**
   * Get a service lane by ID
   * 
   * @throws {Error} If lane not found
   */
  async getLane(laneId: string): Promise<ServiceLane> {
    const result = await this.pool.query(
      'SELECT * FROM courier_service_lanes WHERE id = $1',
      [laneId]
    );

    if (result.rows.length === 0) {
      throw new Error('Service lane not found');
    }

    return this.mapRowToLane(result.rows[0]);
  }

  /**
   * Get lanes with optional filtering and pagination
   */
  async getLanes(filters: LaneFilters = {}): Promise<{
    lanes: ServiceLane[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const {
      courierProviderId,
      originPincode,
      destinationPincode,
      zone,
      serviceType,
      isServiceable,
      page = 1,
      pageSize = 50
    } = filters;

    // Build WHERE clause dynamically
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (courierProviderId) {
      conditions.push(`courier_provider_id = $${paramIndex++}`);
      params.push(courierProviderId);
    }

    if (originPincode) {
      conditions.push(`origin_pincode = $${paramIndex++}`);
      params.push(originPincode);
    }

    if (destinationPincode) {
      conditions.push(`destination_pincode = $${paramIndex++}`);
      params.push(destinationPincode);
    }

    if (zone) {
      conditions.push(`zone = $${paramIndex++}`);
      params.push(zone);
    }

    if (serviceType !== undefined) {
      if (serviceType === null) {
        conditions.push('service_type IS NULL');
      } else {
        conditions.push(`service_type = $${paramIndex++}`);
        params.push(serviceType);
      }
    }

    if (isServiceable !== undefined) {
      conditions.push(`is_serviceable = $${paramIndex++}`);
      params.push(isServiceable);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count
    const countResult = await this.pool.query(
      `SELECT COUNT(*) FROM courier_service_lanes ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count, 10);

    // Get paginated data
    const offset = (page - 1) * pageSize;
    const dataResult = await this.pool.query(
      `SELECT * FROM courier_service_lanes 
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, pageSize, offset]
    );

    const lanes = dataResult.rows.map(row => this.mapRowToLane(row));

    return {
      lanes,
      total,
      page,
      pageSize
    };
  }

  /**
   * Update an existing service lane
   * 
   * @throws {Error} If validation fails or lane not found
   */
  async updateLane(laneId: string, input: UpdateLaneInput): Promise<ServiceLane> {
    // Validate input
    const validated = updateLaneSchema.parse(input);

    // Build SET clause dynamically
    const setClauses: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (validated.zone !== undefined) {
      setClauses.push(`zone = $${paramIndex++}`);
      params.push(validated.zone);
    }

    if (validated.serviceType !== undefined) {
      setClauses.push(`service_type = $${paramIndex++}`);
      params.push(validated.serviceType);
    }

    if (validated.isServiceable !== undefined) {
      setClauses.push(`is_serviceable = $${paramIndex++}`);
      params.push(validated.isServiceable);
    }

    if (validated.transitDays !== undefined) {
      setClauses.push(`transit_days = $${paramIndex++}`);
      params.push(validated.transitDays);
    }

    // Add updated_at (handled by trigger, but explicit is good)
    setClauses.push(`updated_at = now()`);

    params.push(laneId);

    const result = await this.pool.query(
      `UPDATE courier_service_lanes 
       SET ${setClauses.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      throw new Error('Service lane not found');
    }

    return this.mapRowToLane(result.rows[0]);
  }

  /**
   * Delete a service lane
   * 
   * @throws {Error} If lane not found
   */
  async deleteLane(laneId: string): Promise<void> {
    const result = await this.pool.query(
      'DELETE FROM courier_service_lanes WHERE id = $1',
      [laneId]
    );

    if (result.rowCount === 0) {
      throw new Error('Service lane not found');
    }
  }

  /**
   * Bulk import lanes from CSV data
   * 
   * Validates each row and inserts valid ones.
   * Returns success/failure counts and detailed errors.
   * 
   * Uses ON CONFLICT to update existing lanes instead of failing.
   */
  async bulkImportLanes(
    courierProviderId: string,
    rows: BulkImportRow[],
    createdBy?: string
  ): Promise<BulkImportResult> {
    const result: BulkImportResult = {
      success: 0,
      failed: 0,
      errors: []
    };

    // Validate courier exists
    const courierCheck = await this.pool.query(
      'SELECT id FROM courier_providers WHERE id = $1',
      [courierProviderId]
    );

    if (courierCheck.rows.length === 0) {
      throw new Error('Courier provider not found');
    }

    // Process each row
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      
      try {
        // Validate row schema
        const validated = bulkImportRowSchema.parse(row);

        // Insert or update lane
        await this.pool.query(
          `INSERT INTO courier_service_lanes 
            (courier_provider_id, origin_pincode, destination_pincode, zone, 
             service_type, is_serviceable, transit_days, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (courier_provider_id, origin_pincode, destination_pincode)
           DO UPDATE SET
             zone = EXCLUDED.zone,
             service_type = EXCLUDED.service_type,
             is_serviceable = EXCLUDED.is_serviceable,
             transit_days = EXCLUDED.transit_days,
             updated_at = now()`,
          [
            courierProviderId,
            validated.originPincode,
            validated.destinationPincode,
            validated.zone,
            validated.serviceType ?? null,
            validated.isServiceable ?? true,
            validated.transitDays ?? null,
            createdBy ?? null
          ]
        );

        result.success++;
      } catch (error) {
        result.failed++;
        result.errors.push({
          row: i + 1,  // 1-indexed for user display
          data: row,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return result;
  }

  /**
   * Get lane statistics for a courier
   */
  async getLaneStats(courierProviderId: string): Promise<{
    totalLanes: number;
    serviceableLanes: number;
    zoneBreakdown: Record<Zone, number>;
    serviceTypeBreakdown: Record<string, number>;
  }> {
    const result = await this.pool.query(
      `SELECT 
         COUNT(*) as total_lanes,
         COUNT(*) FILTER (WHERE is_serviceable = true) as serviceable_lanes,
         zone,
         service_type,
         COUNT(*) as count
       FROM courier_service_lanes
       WHERE courier_provider_id = $1
       GROUP BY zone, service_type`,
      [courierProviderId]
    );

    const stats = {
      totalLanes: 0,
      serviceableLanes: 0,
      zoneBreakdown: {} as Record<Zone, number>,
      serviceTypeBreakdown: {} as Record<string, number>
    };

    for (const row of result.rows) {
      stats.totalLanes += parseInt(row.count, 10);
      stats.serviceableLanes += parseInt(row.serviceable_lanes, 10);

      // Zone breakdown
      const zone = row.zone as Zone;
      stats.zoneBreakdown[zone] = (stats.zoneBreakdown[zone] || 0) + parseInt(row.count, 10);

      // Service type breakdown
      const serviceType = row.service_type || 'all';
      stats.serviceTypeBreakdown[serviceType] = 
        (stats.serviceTypeBreakdown[serviceType] || 0) + parseInt(row.count, 10);
    }

    return stats;
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  /**
   * Map database row to ServiceLane interface
   */
  private mapRowToLane(row: any): ServiceLane {
    return {
      id: row.id,
      courierProviderId: row.courier_provider_id,
      originPincode: row.origin_pincode,
      destinationPincode: row.destination_pincode,
      zone: row.zone,
      serviceType: row.service_type,
      isServiceable: row.is_serviceable,
      transitDays: row.transit_days,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      createdBy: row.created_by
    };
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a new ZoneManagementService instance
 */
export function createZoneManagementService(pool: Pool): ZoneManagementService {
  return new ZoneManagementService(pool);
}

