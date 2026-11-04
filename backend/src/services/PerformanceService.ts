/**
 * Courier Performance Analytics Service
 * 
 * Calculates and aggregates performance metrics for couriers.
 * Enables comparison across couriers and historical trend analysis.
 * 
 * @module services/PerformanceService
 */

import type { Pool } from 'pg';
import { z } from 'zod';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface CourierMetrics {
  courierId: string;
  courierName: string;
  totalShipments: number;
  deliveredCount: number;
  ndrCount: number;
  rtoCount: number;
  cancelledCount: number;
  deliveryRate: number;
  ndrRate: number;
  rtoRate: number;
  avgDeliveryDays: number;
  onTimeDeliveryRate: number;
  pickupSuccessRate: number;
}

export interface ZonePerformance {
  zone: string;
  totalShipments: number;
  deliveryRate: number;
  avgDeliveryDays: number;
}

export interface PerformanceComparison {
  dateRange: { from: Date; to: Date };
  couriers: CourierMetrics[];
  comparison: {
    bestDeliveryRate: { courierId: string; courierName: string; rate: number };
    fastestDelivery: { courierId: string; courierName: string; days: number };
    lowestNDRRate: { courierId: string; courierName: string; rate: number };
  };
}

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const dateSchema = z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/));

const performanceFilterSchema = z.object({
  from: dateSchema.optional(),
  to: dateSchema.optional(),
  courierId: z.string().uuid().optional(),
  zone: z.string().optional()
});

// ============================================================================
// SERVICE CLASS
// ============================================================================

export class PerformanceService {
  constructor(private pool: Pool) {}

  /**
   * Calculate metrics for a single courier over a date range
   */
  async getCourierMetrics(
    courierId: string,
    fromDate: Date,
    toDate: Date
  ): Promise<CourierMetrics> {
    const result = await this.pool.query<{
      courier_id: string;
      courier_name: string;
      total_shipments: number;
      delivered_count: number;
      ndr_count: number;
      rto_count: number;
      cancelled_count: number;
      delivery_rate: number;
      ndr_rate: number;
      rto_rate: number;
      avg_delivery_days: number;
      on_time_delivery_rate: number;
      pickup_success_rate: number;
    }>(
      `SELECT
         s.provider_id as courier_id,
         cp.name as courier_name,
         COUNT(*) as total_shipments,
         COUNT(*) FILTER (WHERE s.state = 'delivered') as delivered_count,
         COUNT(*) FILTER (WHERE s.state = 'ndr') as ndr_count,
         COUNT(*) FILTER (WHERE s.state = 'rto') as rto_count,
         COUNT(*) FILTER (WHERE s.state = 'cancelled') as cancelled_count,
         ROUND(100.0 * COUNT(*) FILTER (WHERE s.state = 'delivered') / NULLIF(COUNT(*), 0), 2) as delivery_rate,
         ROUND(100.0 * COUNT(*) FILTER (WHERE s.state = 'ndr') / NULLIF(COUNT(*), 0), 2) as ndr_rate,
         ROUND(100.0 * COUNT(*) FILTER (WHERE s.state = 'rto') / NULLIF(COUNT(*), 0), 2) as rto_rate,
         ROUND(AVG(EXTRACT(EPOCH FROM (s.delivered_at - s.booked_at)) / 86400) FILTER (WHERE s.delivered_at IS NOT NULL), 2) as avg_delivery_days,
         ROUND(100.0 * COUNT(*) FILTER (WHERE s.delivered_at <= s.promised_delivery_at) / NULLIF(COUNT(*) FILTER (WHERE s.delivered_at IS NOT NULL), 0), 2) as on_time_delivery_rate,
         ROUND(100.0 * COUNT(*) FILTER (WHERE s.pickup_completed_at IS NOT NULL) / NULLIF(COUNT(*), 0), 2) as pickup_success_rate
       FROM shipments s
       JOIN courier_providers cp ON cp.id = s.provider_id
       WHERE s.provider_id = $1
         AND s.created_at >= $2
         AND s.created_at <= $3
       GROUP BY s.provider_id, cp.name`,
      [courierId, fromDate, toDate]
    );

    if (result.rows.length === 0) {
      return {
        courierId,
        courierName: '',
        totalShipments: 0,
        deliveredCount: 0,
        ndrCount: 0,
        rtoCount: 0,
        cancelledCount: 0,
        deliveryRate: 0,
        ndrRate: 0,
        rtoRate: 0,
        avgDeliveryDays: 0,
        onTimeDeliveryRate: 0,
        pickupSuccessRate: 0
      };
    }

    return this.mapRowToMetrics(result.rows[0]);
  }

  /**
   * Compare multiple couriers over a date range
   */
  async comparePerformance(
    courierIds: string[],
    fromDate: Date,
    toDate: Date
  ): Promise<PerformanceComparison> {
    if (courierIds.length === 0) {
      throw new Error('At least one courier ID required');
    }

    const couriers: CourierMetrics[] = [];

    for (const courierId of courierIds) {
      const metrics = await this.getCourierMetrics(courierId, fromDate, toDate);
      if (metrics.totalShipments > 0) {
        couriers.push(metrics);
      }
    }

    // Calculate comparisons
    const comparison = {
      bestDeliveryRate: couriers.reduce((best, current) =>
        current.deliveryRate > best.deliveryRate ? current : best
      ) || couriers[0],
      fastestDelivery: couriers.reduce((best, current) =>
        current.avgDeliveryDays > 0 && (best.avgDeliveryDays === 0 || current.avgDeliveryDays < best.avgDeliveryDays)
          ? current
          : best
      ) || couriers[0],
      lowestNDRRate: couriers.reduce((best, current) =>
        current.ndrRate < best.ndrRate ? current : best
      ) || couriers[0]
    };

    return {
      dateRange: { from: fromDate, to: toDate },
      couriers,
      comparison: {
        bestDeliveryRate: {
          courierId: comparison.bestDeliveryRate.courierId,
          courierName: comparison.bestDeliveryRate.courierName,
          rate: comparison.bestDeliveryRate.deliveryRate
        },
        fastestDelivery: {
          courierId: comparison.fastestDelivery.courierId,
          courierName: comparison.fastestDelivery.courierName,
          days: comparison.fastestDelivery.avgDeliveryDays
        },
        lowestNDRRate: {
          courierId: comparison.lowestNDRRate.courierId,
          courierName: comparison.lowestNDRRate.courierName,
          rate: comparison.lowestNDRRate.ndrRate
        }
      }
    };
  }

  /**
   * Get zone-wise performance breakdown for a courier
   */
  async getZonePerformance(
    courierId: string,
    fromDate: Date,
    toDate: Date
  ): Promise<ZonePerformance[]> {
    const result = await this.pool.query<{
      zone: string;
      total_shipments: number;
      delivery_rate: number;
      avg_delivery_days: number;
    }>(
      `SELECT
         csc.zone,
         COUNT(*) as total_shipments,
         ROUND(100.0 * COUNT(*) FILTER (WHERE s.state = 'delivered') / NULLIF(COUNT(*), 0), 2) as delivery_rate,
         ROUND(AVG(EXTRACT(EPOCH FROM (s.delivered_at - s.booked_at)) / 86400) FILTER (WHERE s.delivered_at IS NOT NULL), 2) as avg_delivery_days
       FROM shipments s
       LEFT JOIN courier_sla_config csc ON csc.courier_provider_id = s.provider_id
       WHERE s.provider_id = $1
         AND s.created_at >= $2
         AND s.created_at <= $3
       GROUP BY csc.zone
       ORDER BY csc.zone`,
      [courierId, fromDate, toDate]
    );

    return result.rows.map(row => ({
      zone: row.zone || 'unknown',
      totalShipments: row.total_shipments || 0,
      deliveryRate: row.delivery_rate || 0,
      avgDeliveryDays: row.avg_delivery_days || 0
    }));
  }

  /**
   * Get all active couriers' performance
   */
  async getAllCourierMetrics(
    fromDate: Date,
    toDate: Date
  ): Promise<CourierMetrics[]> {
    const result = await this.pool.query<{
      courier_id: string;
      courier_name: string;
      total_shipments: number;
      delivered_count: number;
      ndr_count: number;
      rto_count: number;
      cancelled_count: number;
      delivery_rate: number;
      ndr_rate: number;
      rto_rate: number;
      avg_delivery_days: number;
      on_time_delivery_rate: number;
      pickup_success_rate: number;
    }>(
      `SELECT
         s.provider_id as courier_id,
         cp.name as courier_name,
         COUNT(*) as total_shipments,
         COUNT(*) FILTER (WHERE s.state = 'delivered') as delivered_count,
         COUNT(*) FILTER (WHERE s.state = 'ndr') as ndr_count,
         COUNT(*) FILTER (WHERE s.state = 'rto') as rto_count,
         COUNT(*) FILTER (WHERE s.state = 'cancelled') as cancelled_count,
         ROUND(100.0 * COUNT(*) FILTER (WHERE s.state = 'delivered') / NULLIF(COUNT(*), 0), 2) as delivery_rate,
         ROUND(100.0 * COUNT(*) FILTER (WHERE s.state = 'ndr') / NULLIF(COUNT(*), 0), 2) as ndr_rate,
         ROUND(100.0 * COUNT(*) FILTER (WHERE s.state = 'rto') / NULLIF(COUNT(*), 0), 2) as rto_rate,
         ROUND(AVG(EXTRACT(EPOCH FROM (s.delivered_at - s.booked_at)) / 86400) FILTER (WHERE s.delivered_at IS NOT NULL), 2) as avg_delivery_days,
         ROUND(100.0 * COUNT(*) FILTER (WHERE s.delivered_at <= s.promised_delivery_at) / NULLIF(COUNT(*) FILTER (WHERE s.delivered_at IS NOT NULL), 0), 2) as on_time_delivery_rate,
         ROUND(100.0 * COUNT(*) FILTER (WHERE s.pickup_completed_at IS NOT NULL) / NULLIF(COUNT(*), 0), 2) as pickup_success_rate
       FROM shipments s
       JOIN courier_providers cp ON cp.id = s.provider_id
       WHERE s.created_at >= $1
         AND s.created_at <= $2
         AND cp.integration_state NOT IN ('disabled', 'maintenance')
       GROUP BY s.provider_id, cp.name
       ORDER BY delivery_rate DESC`,
      [fromDate, toDate]
    );

    return result.rows.map(row => this.mapRowToMetrics(row));
  }

  /**
   * Get time-series performance data (daily aggregates)
   */
  async getTimeSeriesMetrics(
    courierId: string,
    fromDate: Date,
    toDate: Date,
    interval: 'day' | 'week' | 'month' = 'day'
  ): Promise<Array<{
    date: Date;
    totalShipments: number;
    deliveryRate: number;
    ndrRate: number;
  }>> {
    const dateFormat = interval === 'day' ? 'YYYY-MM-DD' : interval === 'week' ? 'YYYY-W' : 'YYYY-MM';
    const groupBy = interval === 'day' ? 'DATE' : interval === 'week' ? 'DATE_TRUNC' : 'DATE_TRUNC';

    const result = await this.pool.query<{
      metric_date: string;
      total_shipments: number;
      delivery_rate: number;
      ndr_rate: number;
    }>(
      `SELECT
         DATE_TRUNC($3::text, s.created_at)::date as metric_date,
         COUNT(*) as total_shipments,
         ROUND(100.0 * COUNT(*) FILTER (WHERE s.state = 'delivered') / NULLIF(COUNT(*), 0), 2) as delivery_rate,
         ROUND(100.0 * COUNT(*) FILTER (WHERE s.state = 'ndr') / NULLIF(COUNT(*), 0), 2) as ndr_rate
       FROM shipments s
       WHERE s.provider_id = $1
         AND s.created_at >= $2
         AND s.created_at <= $4
       GROUP BY DATE_TRUNC($3::text, s.created_at)
       ORDER BY metric_date`,
      [courierId, fromDate, interval, toDate]
    );

    return result.rows.map(row => ({
      date: new Date(row.metric_date),
      totalShipments: row.total_shipments || 0,
      deliveryRate: row.delivery_rate || 0,
      ndrRate: row.ndr_rate || 0
    }));
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  private mapRowToMetrics(row: any): CourierMetrics {
    return {
      courierId: row.courier_id,
      courierName: row.courier_name,
      totalShipments: parseInt(row.total_shipments, 10),
      deliveredCount: parseInt(row.delivered_count, 10),
      ndrCount: parseInt(row.ndr_count, 10),
      rtoCount: parseInt(row.rto_count, 10),
      cancelledCount: parseInt(row.cancelled_count, 10),
      deliveryRate: row.delivery_rate || 0,
      ndrRate: row.ndr_rate || 0,
      rtoRate: row.rto_rate || 0,
      avgDeliveryDays: row.avg_delivery_days || 0,
      onTimeDeliveryRate: row.on_time_delivery_rate || 0,
      pickupSuccessRate: row.pickup_success_rate || 0
    };
  }
}

/**
 * Create a new PerformanceService instance
 */
export function createPerformanceService(pool: Pool): PerformanceService {
  return new PerformanceService(pool);
}
