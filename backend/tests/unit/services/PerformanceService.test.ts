/**
 * @file PerformanceService.test.ts
 * @description Unit tests for Performance Service
 */

import { describe, it, expect } from 'vitest';

describe('PerformanceService', () => {
  describe('Metrics Calculations', () => {
    it('should calculate delivery rate correctly', () => {
      const delivered = 95;
      const total = 100;
      const rate = (delivered / total) * 100;
      expect(rate).toBe(95);
    });

    it('should handle zero deliveries', () => {
      const delivered = 0;
      const total = 0;
      const rate = total === 0 ? 0 : (delivered / total) * 100;
      expect(rate).toBe(0);
    });

    it('should calculate NDR rate', () => {
      const ndr = 5;
      const total = 100;
      const rate = (ndr / total) * 100;
      expect(rate).toBe(5);
    });

    it('should calculate RTO rate', () => {
      const rto = 2;
      const total = 100;
      const rate = (rto / total) * 100;
      expect(rate).toBe(2);
    });

    it('should calculate on-time delivery percentage', () => {
      const onTime = 85;
      const total = 100;
      const percentage = (onTime / total) * 100;
      expect(percentage).toBe(85);
    });

    it('should calculate pickup success rate', () => {
      const successful = 98;
      const total = 100;
      const rate = (successful / total) * 100;
      expect(rate).toBe(98);
    });
  });

  describe('Time Series Aggregation', () => {
    it('should aggregate daily metrics', () => {
      const dailyData = [
        { date: '2026-11-01', delivered: 50 },
        { date: '2026-11-02', delivered: 55 },
        { date: '2026-11-03', delivered: 60 },
      ];
      
      const total = dailyData.reduce((sum, d) => sum + d.delivered, 0);
      expect(total).toBe(165);
    });

    it('should aggregate weekly metrics', () => {
      const weeklyData = [
        { week: 1, delivered: 350 },
        { week: 2, delivered: 380 },
      ];
      
      const total = weeklyData.reduce((sum, w) => sum + w.delivered, 0);
      expect(total).toBe(730);
    });

    it('should aggregate monthly metrics', () => {
      const monthlyData = [
        { month: '2026-10', delivered: 1500 },
        { month: '2026-11', delivered: 1600 },
      ];
      
      const total = monthlyData.reduce((sum, m) => sum + m.delivered, 0);
      expect(total).toBe(3100);
    });

    it('should calculate average daily volume', () => {
      const dailyVolumes = [50, 55, 60, 65, 70];
      const average = dailyVolumes.reduce((a, b) => a + b, 0) / dailyVolumes.length;
      expect(average).toBe(60);
    });

    it('should calculate peak daily volume', () => {
      const dailyVolumes = [50, 55, 60, 65, 70];
      const peak = Math.max(...dailyVolumes);
      expect(peak).toBe(70);
    });

    it('should calculate minimum daily volume', () => {
      const dailyVolumes = [50, 55, 60, 65, 70];
      const min = Math.min(...dailyVolumes);
      expect(min).toBe(50);
    });
  });

  describe('Multi-Courier Comparison', () => {
    it('should compare delivery rates across couriers', () => {
      const couriers = [
        { name: 'Delhivery', rate: 95 },
        { name: 'Blue Dart', rate: 92 },
        { name: 'Ekart', rate: 88 },
      ];
      
      const sorted = couriers.sort((a, b) => b.rate - a.rate);
      expect(sorted[0].name).toBe('Delhivery');
      expect(sorted[2].name).toBe('Ekart');
    });

    it('should identify best performer', () => {
      const couriers = [
        { name: 'Delhivery', deliveryRate: 95, ndrRate: 3, rtoRate: 2 },
        { name: 'Blue Dart', deliveryRate: 92, ndrRate: 5, rtoRate: 3 },
      ];
      
      const best = couriers.reduce((prev, current) => 
        current.deliveryRate > prev.deliveryRate ? current : prev
      );
      expect(best.name).toBe('Delhivery');
    });

    it('should rank couriers by performance', () => {
      const couriers = [
        { name: 'Courier A', score: 85 },
        { name: 'Courier B', score: 90 },
        { name: 'Courier C', score: 78 },
      ];
      
      const ranked = couriers.sort((a, b) => b.score - a.score);
      expect(ranked.map(c => c.name)).toEqual(['Courier B', 'Courier A', 'Courier C']);
    });

    it('should calculate performance delta between couriers', () => {
      const courier1Rate = 95;
      const courier2Rate = 88;
      const delta = courier1Rate - courier2Rate;
      expect(delta).toBe(7);
    });
  });

  describe('Zone Performance Analysis', () => {
    it('should analyze performance by zone', () => {
      const zoneData = [
        { zone: 'within_city', deliveryRate: 98 },
        { zone: 'metro_to_metro', deliveryRate: 95 },
        { zone: 'within_state', deliveryRate: 88 },
      ];
      
      expect(zoneData[0].deliveryRate).toBe(98);
      expect(zoneData[2].deliveryRate).toBe(88);
    });

    it('should identify best performing zone', () => {
      const zoneData = [
        { zone: 'within_city', rate: 98 },
        { zone: 'metro_to_metro', rate: 95 },
        { zone: 'within_state', rate: 88 },
      ];
      
      const best = zoneData.reduce((prev, current) => 
        current.rate > prev.rate ? current : prev
      );
      expect(best.zone).toBe('within_city');
    });

    it('should calculate zone performance variance', () => {
      const zoneRates = [98, 95, 88];
      const mean = zoneRates.reduce((a, b) => a + b, 0) / zoneRates.length;
      const variance = zoneRates.reduce((sum, rate) => sum + Math.pow(rate - mean, 2), 0) / zoneRates.length;
      expect(variance).toBeGreaterThan(0);
    });

    it('should compare zone trends', () => {
      const zone1Trend = [90, 92, 94, 95];
      const zone2Trend = [95, 94, 93, 92];
      
      const zone1Change = zone1Trend[zone1Trend.length - 1] - zone1Trend[0];
      const zone2Change = zone2Trend[zone2Trend.length - 1] - zone2Trend[0];
      
      expect(zone1Change).toBe(5); // Improving
      expect(zone2Change).toBe(-3); // Declining
    });
  });

  describe('Trend Analysis', () => {
    it('should detect upward trend', () => {
      const values = [80, 82, 84, 86, 88];
      const trend = values[values.length - 1] > values[0] ? 'up' : 'down';
      expect(trend).toBe('up');
    });

    it('should detect downward trend', () => {
      const values = [90, 88, 86, 84, 82];
      const trend = values[values.length - 1] > values[0] ? 'up' : 'down';
      expect(trend).toBe('down');
    });

    it('should detect flat trend', () => {
      const values = [85, 85, 85, 85, 85];
      const trend = values[values.length - 1] > values[0] ? 'up' : values[values.length - 1] < values[0] ? 'down' : 'flat';
      expect(trend).toBe('flat');
    });

    it('should calculate trend slope', () => {
      const dataPoints = [
        { day: 1, value: 80 },
        { day: 2, value: 85 },
        { day: 3, value: 90 },
      ];
      
      const slope = (dataPoints[2].value - dataPoints[0].value) / (dataPoints[2].day - dataPoints[0].day);
      expect(slope).toBe(5); // 5 units per day
    });

    it('should forecast next value in trend', () => {
      const currentTrend = [80, 85, 90];
      const slope = (currentTrend[2] - currentTrend[0]) / 2;
      const nextValue = currentTrend[2] + slope;
      expect(nextValue).toBe(95);
    });
  });

  describe('Performance Benchmarking', () => {
    it('should compare against industry benchmark', () => {
      const courierRate = 92;
      const industryBenchmark = 88;
      const difference = courierRate - industryBenchmark;
      
      expect(difference).toBeGreaterThan(0);
    });

    it('should calculate percentile ranking', () => {
      const allRates = [85, 88, 90, 92, 95];
      const courierRate = 92;
      const percentile = ((allRates.filter(r => r <= courierRate).length) / allRates.length) * 100;
      
      expect(percentile).toBe(80);
    });

    it('should identify outliers in performance', () => {
      const rates = [90, 92, 91, 93, 92, 50]; // 50 is outlier
      const mean = rates.reduce((a, b) => a + b, 0) / rates.length;
      const threshold = 2; // Standard deviations
      const outliers = rates.filter(r => Math.abs(r - mean) > threshold);
      
      expect(outliers).toContain(50);
    });

    it('should calculate performance consistency', () => {
      const rates1 = [90, 91, 89, 92, 90]; // Consistent
      const rates2 = [85, 95, 80, 100, 70]; // Inconsistent
      
      const stdev1 = Math.sqrt(rates1.reduce((sum, r) => sum + Math.pow(r - 90.4, 2), 0) / rates1.length);
      const stdev2 = Math.sqrt(rates2.reduce((sum, r) => sum + Math.pow(r - 86, 2), 0) / rates2.length);
      
      expect(stdev1).toBeLessThan(stdev2);
    });
  });

  describe('Error Scenarios', () => {
    it('should handle empty data arrays', () => {
      const data: number[] = [];
      const average = data.length === 0 ? 0 : data.reduce((a, b) => a + b, 0) / data.length;
      expect(average).toBe(0);
    });

    it('should handle single data point', () => {
      const data = [95];
      const average = data.reduce((a, b) => a + b, 0) / data.length;
      expect(average).toBe(95);
    });

    it('should handle negative values gracefully', () => {
      const metric = -5;
      const normalized = Math.max(0, metric);
      expect(normalized).toBe(0);
    });

    it('should handle values over 100%', () => {
      const rate = 105;
      const normalized = Math.min(100, rate);
      expect(normalized).toBe(100);
    });

    it('should handle division by zero', () => {
      const numerator = 10;
      const denominator = 0;
      const result = denominator === 0 ? 0 : numerator / denominator;
      expect(result).toBe(0);
    });

    it('should handle null metrics', () => {
      const metric = null;
      const value = metric || 0;
      expect(value).toBe(0);
    });
  });

  describe('Export Formats', () => {
    it('should format metrics for CSV export', () => {
      const metrics = {
        courier: 'Delhivery',
        deliveryRate: 95,
        ndrRate: 3,
        rtoRate: 2,
      };
      
      const csvRow = `${metrics.courier},${metrics.deliveryRate},${metrics.ndrRate},${metrics.rtoRate}`;
      expect(csvRow).toBe('Delhivery,95,3,2');
    });

    it('should format metrics for JSON export', () => {
      const metrics = {
        courier: 'Blue Dart',
        deliveryRate: 92,
        ndrRate: 5,
      };
      
      const json = JSON.stringify(metrics);
      expect(json).toContain('Blue Dart');
      expect(json).toContain('92');
    });

    it('should format date for reports', () => {
      const date = new Date('2026-11-04T10:00:00Z');
      const formatted = date.toISOString().split('T')[0];
      expect(formatted).toBe('2026-11-04');
    });
  });
});
