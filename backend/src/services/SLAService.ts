/**
 * SLA Management Service
 * 
 * Manages courier SLA configuration by zone and service type.
 * Used by admin panel to set delivery promises and breach thresholds.
 * 
 * Key Features:
 * • Zone-based SLA configuration per courier
 * • Service-type-specific overrides
 * • Breach detection and notification settings
 * • SLA coverage reporting
 * 
 * @module services/SLAService
 */

import type { Pool } from 'pg';
import { z } from 'zod';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export type Zone = 
  | 'within_city'
  | 'within_state'
  | 'metro_to_metro'
  | 'rest_of_india'
  | 'ne_jk'
  | 'national';

export type ServiceType = 'surface' | 'air' | 'express' | 'hyperlocal';

export interface SLAConfig {
  id: string;
  courierProviderId: string;
  zone: Zone;
  serviceType: ServiceType | null;
  promisedDays: number;
  breachThresholdHours: number;
  autoNotify: boolean;
  notifySeller: boolean;
  notifyAdmin: boolean;
  escalationHours: number | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
}

export interface CreateSLAConfigInput {
  courierProviderId: string;
  zone: Zone;
  serviceType?: ServiceType | null;
  promisedDays: number;
  breachThresholdHours?: number;
  autoNotify?: boolean;
  notifySeller?: boolean;
  notifyAdmin?: boolean;
  escalationHours?: number | null;
  createdBy?: string;
}

export interface UpdateSLAConfigInput {
  promisedDays?: number;
  breachThresholdHours?: number;
  autoNotify?: boolean;
  notifySeller?: boolean;
  notifyAdmin?: boolean;
  escalationHours?: number | null;
  isActive?: boolean;
}

export interface SLACoverage {
  courierProviderId: string;
  courierName: string;
  zonesConfigured: number;
  configuredZones: Zone[];
  coverageStatus: 'complete' | 'partial' | 'incomplete';
}

export interface SLAMetrics {
  totalShipments: number;
  breachedShipments: number;
  breachRate: number;
  averageDeliveryDays: number;
  onTimeDeliveryRate: number;
}

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const zoneSchema = z.enum([
  'within_city',
  'within_state',
  'metro_to_metro',
  'rest_of_india',
  'ne_jk',
  'national'
]);

const serviceTypeSchema = z.enum(['surface', 'air', 'express', 'hyperlocal']).nullable().optional();

const createSLAConfigSchema = z.object({
  courierProviderId: z.string().uuid('Invalid courier provider ID'),
  zone: zoneSchema,
  serviceType: serviceTypeSchema,
  promisedDays: z.number().int().min(1).max(30, 'Must be between 1 and 30 days'),
  breachThresholdHours: z.number().int().min(0).max(72).optional().default(24),
  autoNotify: z.boolean().optional().default(true),
  notifySeller: z.boolean().optional().default(true),
  notifyAdmin: z.boolean().optional().default(false),
  escalationHours: z.number().int().min(0).nullable().optional(),
  createdBy: z.string().uuid().optional()
});

const updateSLAConfigSchema = z.object({
  promisedDays: z.number().int().min(1).max(30).optional(),
  breachThresholdHours: z.number().int().min(0).max(72).optional(),
  autoNotify: z.boolean().optional(),
  notifySeller: z.boolean().optional(),
  notifyAdmin: z.boolean().optional(),
  escalationHours: z.number().int().min(0).nullable().optional(),
  isActive: z.boolean().optional()
}).refine(data => Object.keys(data).length > 0, {
  message: 'At least one field must be provided for update'
});

// ============================================================================
// SERVICE CLASS
// ============================================================================

export class SLAService {
  constructor(private pool: Pool) {}

  /**
   * Create or update SLA configuration
   * 
   * Uses upsert pattern to handle zone + service_type combinations
   * 
   * @throws {Error} If validation fails or courier doesn't exist
   */
  async createOrUpdateConfig(input: CreateSLAConfigInput): Promise<SLAConfig> {
    // Validate input
    const validated = createSLAConfigSchema.parse(input);

    // Verify courier exists
    const courierCheck = await this.pool.query(
      'SELECT id FROM courier_providers WHERE id = $1',
      [validated.courierProviderId]
    );

    if (courierCheck.rows.length === 0) {
      throw new Error('Courier provider not found');
    }

    // Upsert config
    const result = await this.pool.query<{
      id: string;
      courier_provider_id: string;
      zone: Zone;
      service_type: ServiceType | null;
      promised_days: number;
      breach_threshold_hours: number;
      auto_notify: boolean;
      notify_seller: boolean;
      notify_admin: boolean;
      escalation_hours: number | null;
      is_active: boolean;
      created_at: Date;
      updated_at: Date;
      created_by: string | null;
      updated_by: string | null;
    }>(
      `INSERT INTO courier_sla_config 
        (courier_provider_id, zone, service_type, promised_days, 
         breach_threshold_hours, auto_notify, notify_seller, notify_admin,
         escalation_hours, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (courier_provider_id, zone, service_type)
       DO UPDATE SET
         promised_days = $4,
         breach_threshold_hours = $5,
         auto_notify = $6,
         notify_seller = $7,
         notify_admin = $8,
         escalation_hours = $9,
         updated_at = now()
       RETURNING *`,
      [
        validated.courierProviderId,
        validated.zone,
        validated.serviceType ?? null,
        validated.promisedDays,
        validated.breachThresholdHours,
        validated.autoNotify,
        validated.notifySeller,
        validated.notifyAdmin,
        validated.escalationHours ?? null,
        validated.createdBy ?? null
      ]
    );

    if (result.rows.length === 0) {
      throw new Error('Failed to create SLA configuration');
    }

    return this.mapRowToConfig(result.rows[0]);
  }

  /**
   * Get SLA configuration by ID
   */
  async getConfig(configId: string): Promise<SLAConfig> {
    const result = await this.pool.query(
      'SELECT * FROM courier_sla_config WHERE id = $1',
      [configId]
    );

    if (result.rows.length === 0) {
      throw new Error('SLA configuration not found');
    }

    return this.mapRowToConfig(result.rows[0]);
  }

  /**
   * Get SLA config for a specific courier, zone, and service type
   * Falls back to zone-only config if service-type-specific doesn't exist
   */
  async getConfigForCourier(
    courierId: string,
    zone: Zone,
    serviceType?: ServiceType
  ): Promise<SLAConfig | null> {
    // Try service-type-specific first
    if (serviceType) {
      const result = await this.pool.query(
        `SELECT * FROM courier_sla_config 
         WHERE courier_provider_id = $1 AND zone = $2 AND service_type = $3 AND is_active = true`,
        [courierId, zone, serviceType]
      );

      if (result.rows.length > 0) {
        return this.mapRowToConfig(result.rows[0]);
      }
    }

    // Fall back to zone-only config
    const result = await this.pool.query(
      `SELECT * FROM courier_sla_config 
       WHERE courier_provider_id = $1 AND zone = $2 AND service_type IS NULL AND is_active = true`,
      [courierId, zone]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToConfig(result.rows[0]);
  }

  /**
   * Get all SLA configs for a courier with optional filtering
   */
  async getConfigsByCourier(
    courierId: string,
    filters?: {
      zone?: Zone;
      serviceType?: ServiceType;
      isActive?: boolean;
    }
  ): Promise<SLAConfig[]> {
    const conditions: string[] = ['courier_provider_id = $1'];
    const params: any[] = [courierId];
    let paramIndex = 2;

    if (filters?.zone) {
      conditions.push(`zone = $${paramIndex++}`);
      params.push(filters.zone);
    }

    if (filters?.serviceType) {
      conditions.push(`service_type = $${paramIndex++}`);
      params.push(filters.serviceType);
    }

    if (filters?.isActive !== undefined) {
      conditions.push(`is_active = $${paramIndex++}`);
      params.push(filters.isActive);
    }

    const result = await this.pool.query(
      `SELECT * FROM courier_sla_config 
       WHERE ${conditions.join(' AND ')}
       ORDER BY zone, service_type`,
      params
    );

    return result.rows.map(row => this.mapRowToConfig(row));
  }

  /**
   * Update SLA configuration
   */
  async updateConfig(configId: string, input: UpdateSLAConfigInput): Promise<SLAConfig> {
    // Validate input
    const validated = updateSLAConfigSchema.parse(input);

    const setClauses: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (validated.promisedDays !== undefined) {
      setClauses.push(`promised_days = $${paramIndex++}`);
      params.push(validated.promisedDays);
    }

    if (validated.breachThresholdHours !== undefined) {
      setClauses.push(`breach_threshold_hours = $${paramIndex++}`);
      params.push(validated.breachThresholdHours);
    }

    if (validated.autoNotify !== undefined) {
      setClauses.push(`auto_notify = $${paramIndex++}`);
      params.push(validated.autoNotify);
    }

    if (validated.notifySeller !== undefined) {
      setClauses.push(`notify_seller = $${paramIndex++}`);
      params.push(validated.notifySeller);
    }

    if (validated.notifyAdmin !== undefined) {
      setClauses.push(`notify_admin = $${paramIndex++}`);
      params.push(validated.notifyAdmin);
    }

    if (validated.escalationHours !== undefined) {
      setClauses.push(`escalation_hours = $${paramIndex++}`);
      params.push(validated.escalationHours);
    }

    if (validated.isActive !== undefined) {
      setClauses.push(`is_active = $${paramIndex++}`);
      params.push(validated.isActive);
    }

    setClauses.push(`updated_at = now()`);

    params.push(configId);

    const result = await this.pool.query(
      `UPDATE courier_sla_config 
       SET ${setClauses.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      throw new Error('SLA configuration not found');
    }

    return this.mapRowToConfig(result.rows[0]);
  }

  /**
   * Deactivate SLA configuration
   */
  async deactivateConfig(configId: string): Promise<void> {
    const result = await this.pool.query(
      `UPDATE courier_sla_config SET is_active = false, updated_at = now() WHERE id = $1`,
      [configId]
    );

    if (result.rowCount === 0) {
      throw new Error('SLA configuration not found');
    }
  }

  /**
   * Get SLA coverage for all couriers
   */
  async getSLACoverage(): Promise<SLACoverage[]> {
    const result = await this.pool.query<{
      courier_provider_id: string;
      courier_name: string;
      zones_configured: number;
      configured_zones: Zone[];
      coverage_status: 'complete' | 'partial' | 'incomplete';
    }>('SELECT * FROM courier_sla_coverage');

    return result.rows.map(row => ({
      courierProviderId: row.courier_provider_id,
      courierName: row.courier_name,
      zonesConfigured: row.zones_configured,
      configuredZones: row.configured_zones,
      coverageStatus: row.coverage_status
    }));
  }

  /**
   * Calculate SLA metrics for a courier over a date range
   */
  async calculateMetrics(
    courierId: string,
    fromDate: Date,
    toDate: Date
  ): Promise<SLAMetrics> {
    const result = await this.pool.query<{
      total_shipments: number;
      breached_count: number;
      breach_rate: number;
      avg_delivery_days: number;
      on_time_rate: number;
    }>(
      `SELECT
         COUNT(*) as total_shipments,
         COUNT(*) FILTER (WHERE sb.id IS NOT NULL) as breached_count,
         ROUND(100.0 * COUNT(*) FILTER (WHERE sb.id IS NOT NULL) / NULLIF(COUNT(*), 0), 2) as breach_rate,
         ROUND(AVG(EXTRACT(EPOCH FROM (s.delivered_at - s.booked_at)) / 86400), 2) as avg_delivery_days,
         ROUND(100.0 * COUNT(*) FILTER (WHERE s.delivered_at <= s.promised_delivery_at) / NULLIF(COUNT(*) FILTER (WHERE s.delivered_at IS NOT NULL), 0), 2) as on_time_rate
       FROM shipments s
       LEFT JOIN sla_breaches sb ON sb.shipment_id = s.id
       WHERE s.provider_id = $1
         AND s.created_at >= $2
         AND s.created_at <= $3
         AND s.state = 'delivered'`,
      [courierId, fromDate, toDate]
    );

    if (result.rows.length === 0) {
      return {
        totalShipments: 0,
        breachedShipments: 0,
        breachRate: 0,
        averageDeliveryDays: 0,
        onTimeDeliveryRate: 0
      };
    }

    const row = result.rows[0];
    return {
      totalShipments: row.total_shipments || 0,
      breachedShipments: row.breached_count || 0,
      breachRate: row.breach_rate || 0,
      averageDeliveryDays: row.avg_delivery_days || 0,
      onTimeDeliveryRate: row.on_time_rate || 0
    };
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  private mapRowToConfig(row: any): SLAConfig {
    return {
      id: row.id,
      courierProviderId: row.courier_provider_id,
      zone: row.zone,
      serviceType: row.service_type,
      promisedDays: row.promised_days,
      breachThresholdHours: row.breach_threshold_hours,
      autoNotify: row.auto_notify,
      notifySeller: row.notify_seller,
      notifyAdmin: row.notify_admin,
      escalationHours: row.escalation_hours,
      isActive: row.is_active,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      createdBy: row.created_by,
      updatedBy: row.updated_by
    };
  }
}

/**
 * Create a new SLAService instance
 */
export function createSLAService(pool: Pool): SLAService {
  return new SLAService(pool);
}
