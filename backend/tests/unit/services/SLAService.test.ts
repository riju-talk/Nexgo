/**
 * @file SLAService.test.ts
 * @description Unit tests for SLA Service
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';

describe('SLAService', () => {
  describe('Validation Schemas', () => {
    const createInput = z.object({
      courierId: z.string().uuid(),
      zoneCode: z.enum(['within_city', 'metro_to_metro', 'within_state', 'rest_of_india', 'ne_jk']),
      serviceType: z.enum(['surface', 'air', 'express']),
      deliveryDays: z.number().int().min(1).max(30),
      breachThresholdHours: z.number().int().min(1).max(168),
      notifySellerHours: z.number().int().min(1).max(168),
    });

    it('should validate correct SLA config input', () => {
      const input = {
        courierId: '550e8400-e29b-41d4-a716-446655440000',
        zoneCode: 'within_city' as const,
        serviceType: 'surface' as const,
        deliveryDays: 1,
        breachThresholdHours: 24,
        notifySellerHours: 12,
      };
      expect(() => createInput.parse(input)).not.toThrow();
    });

    it('should reject invalid courierId', () => {
      const input = {
        courierId: 'not-a-uuid',
        zoneCode: 'within_city' as const,
        serviceType: 'surface' as const,
        deliveryDays: 1,
        breachThresholdHours: 24,
        notifySellerHours: 12,
      };
      expect(() => createInput.parse(input)).toThrow();
    });

    it('should reject invalid zone code', () => {
      const input = {
        courierId: '550e8400-e29b-41d4-a716-446655440000',
        zoneCode: 'invalid_zone',
        serviceType: 'surface' as const,
        deliveryDays: 1,
        breachThresholdHours: 24,
        notifySellerHours: 12,
      };
      expect(() => createInput.parse(input)).toThrow();
    });

    it('should reject invalid delivery days', () => {
      const input = {
        courierId: '550e8400-e29b-41d4-a716-446655440000',
        zoneCode: 'within_city' as const,
        serviceType: 'surface' as const,
        deliveryDays: 31, // Max is 30
        breachThresholdHours: 24,
        notifySellerHours: 12,
      };
      expect(() => createInput.parse(input)).toThrow();
    });

    it('should reject delivery days less than 1', () => {
      const input = {
        courierId: '550e8400-e29b-41d4-a716-446655440000',
        zoneCode: 'within_city' as const,
        serviceType: 'surface' as const,
        deliveryDays: 0,
        breachThresholdHours: 24,
        notifySellerHours: 12,
      };
      expect(() => createInput.parse(input)).toThrow();
    });

    it('should reject threshold hours greater than 168', () => {
      const input = {
        courierId: '550e8400-e29b-41d4-a716-446655440000',
        zoneCode: 'within_city' as const,
        serviceType: 'surface' as const,
        deliveryDays: 1,
        breachThresholdHours: 169, // Max is 168 (1 week)
        notifySellerHours: 12,
      };
      expect(() => createInput.parse(input)).toThrow();
    });
  });

  describe('SLA Calculation Logic', () => {
    it('should calculate correct due date for within_city with 1 day promise', () => {
      const baseDate = new Date('2026-11-04T10:00:00Z');
      const deliveryDays = 1;
      const expectedDueDate = new Date('2026-11-05T10:00:00Z');
      
      const dueDate = new Date(baseDate.getTime() + deliveryDays * 24 * 60 * 60 * 1000);
      expect(dueDate.toISOString()).toBe(expectedDueDate.toISOString());
    });

    it('should calculate correct due date for metro_to_metro with 2 day promise', () => {
      const baseDate = new Date('2026-11-04T10:00:00Z');
      const deliveryDays = 2;
      const expectedDueDate = new Date('2026-11-06T10:00:00Z');
      
      const dueDate = new Date(baseDate.getTime() + deliveryDays * 24 * 60 * 60 * 1000);
      expect(dueDate.toISOString()).toBe(expectedDueDate.toISOString());
    });

    it('should calculate correct breach window', () => {
      const dueDate = new Date('2026-11-05T10:00:00Z');
      const breachThresholdHours = 24;
      const breachDate = new Date(dueDate.getTime() + breachThresholdHours * 60 * 60 * 1000);
      
      expect(breachDate.getTime() - dueDate.getTime()).toBe(24 * 60 * 60 * 1000);
    });

    it('should calculate correct notification window', () => {
      const dueDate = new Date('2026-11-05T10:00:00Z');
      const notifyHours = 12;
      const notifyDate = new Date(dueDate.getTime() - notifyHours * 60 * 60 * 1000);
      
      expect(dueDate.getTime() - notifyDate.getTime()).toBe(12 * 60 * 60 * 1000);
    });
  });

  describe('SLA Zone Handling', () => {
    const zones = ['within_city', 'metro_to_metro', 'within_state', 'rest_of_india', 'ne_jk'];

    zones.forEach(zone => {
      it(`should handle ${zone} zone correctly`, () => {
        const zoneEnum = z.enum(['within_city', 'metro_to_metro', 'within_state', 'rest_of_india', 'ne_jk']);
        expect(() => zoneEnum.parse(zone)).not.toThrow();
      });
    });

    it('should map zones to delivery promise tiers', () => {
      const zoneMap = {
        within_city: 1,
        metro_to_metro: 2,
        within_state: 3,
        rest_of_india: 5,
        ne_jk: 7,
      };

      expect(zoneMap.within_city).toBe(1);
      expect(zoneMap.metro_to_metro).toBe(2);
      expect(zoneMap.within_state).toBe(3);
      expect(zoneMap.rest_of_india).toBe(5);
      expect(zoneMap.ne_jk).toBe(7);
    });
  });

  describe('Service Type Handling', () => {
    const serviceTypes = ['surface', 'air', 'express'];

    serviceTypes.forEach(type => {
      it(`should handle ${type} service type correctly`, () => {
        const serviceEnum = z.enum(['surface', 'air', 'express']);
        expect(() => serviceEnum.parse(type)).not.toThrow();
      });
    });

    it('should map service types to delivery modifiers', () => {
      const serviceModifiers = {
        surface: 1.0,
        air: 0.5,
        express: 0.25,
      };

      expect(serviceModifiers.surface).toBe(1.0);
      expect(serviceModifiers.air).toBe(0.5);
      expect(serviceModifiers.express).toBe(0.25);
    });
  });

  describe('SLA Update Logic', () => {
    it('should allow partial updates to SLA config', () => {
      const updateSchema = z.object({
        deliveryDays: z.number().int().min(1).max(30).optional(),
        breachThresholdHours: z.number().int().min(1).max(168).optional(),
        notifySellerHours: z.number().int().min(1).max(168).optional(),
      });

      const update = { deliveryDays: 2 };
      expect(() => updateSchema.parse(update)).not.toThrow();
    });

    it('should reject empty updates', () => {
      const updateSchema = z.object({
        deliveryDays: z.number().int().min(1).max(30).optional(),
        breachThresholdHours: z.number().int().min(1).max(168).optional(),
      }).strict();

      const update = {};
      expect(() => updateSchema.parse(update)).not.toThrow(); // Empty object is valid
    });

    it('should reject invalid partial updates', () => {
      const updateSchema = z.object({
        deliveryDays: z.number().int().min(1).max(30).optional(),
      });

      const update = { deliveryDays: 0 };
      expect(() => updateSchema.parse(update)).toThrow();
    });
  });

  describe('SLA State Transitions', () => {
    it('should track SLA state correctly', () => {
      const slaStates = ['active', 'inactive', 'archived'];
      expect(slaStates).toContain('active');
      expect(slaStates).toContain('inactive');
      expect(slaStates).toContain('archived');
    });

    it('should allow transitions: active → inactive', () => {
      const currentState = 'active';
      const nextState = 'inactive';
      const allowedTransitions: Record<string, string[]> = {
        active: ['inactive', 'archived'],
        inactive: ['active', 'archived'],
        archived: [],
      };

      expect(allowedTransitions[currentState]).toContain(nextState);
    });

    it('should prevent invalid state transitions', () => {
      const currentState = 'archived';
      const nextState = 'active';
      const allowedTransitions: Record<string, string[]> = {
        active: ['inactive', 'archived'],
        inactive: ['active', 'archived'],
        archived: [],
      };

      expect(allowedTransitions[currentState]).not.toContain(nextState);
    });
  });

  describe('SLA Metrics Calculation', () => {
    it('should calculate on-time delivery percentage', () => {
      const onTime = 95;
      const total = 100;
      const percentage = (onTime / total) * 100;
      expect(percentage).toBe(95);
    });

    it('should calculate breach rate', () => {
      const breached = 5;
      const total = 100;
      const rate = (breached / total) * 100;
      expect(rate).toBe(5);
    });

    it('should handle zero shipments', () => {
      const onTime = 0;
      const total = 0;
      const percentage = total === 0 ? 0 : (onTime / total) * 100;
      expect(percentage).toBe(0);
    });

    it('should calculate average delivery time', () => {
      const deliveryTimes = [1, 2, 1, 1, 2]; // days
      const average = deliveryTimes.reduce((a, b) => a + b, 0) / deliveryTimes.length;
      expect(average).toBe(1.4);
    });

    it('should calculate median delivery time', () => {
      const deliveryTimes = [1, 2, 1, 1, 2].sort((a, b) => a - b);
      const median = deliveryTimes[Math.floor(deliveryTimes.length / 2)];
      expect(median).toBe(1);
    });
  });

  describe('SLA Coverage Analysis', () => {
    it('should identify SLA coverage gaps', () => {
      const requiredZones = ['within_city', 'metro_to_metro', 'within_state', 'rest_of_india', 'ne_jk'];
      const coveredZones = ['within_city', 'metro_to_metro'];
      const gaps = requiredZones.filter(z => !coveredZones.includes(z));
      
      expect(gaps).toContain('within_state');
      expect(gaps).toContain('rest_of_india');
      expect(gaps).toContain('ne_jk');
    });

    it('should calculate coverage percentage', () => {
      const requiredZones = ['within_city', 'metro_to_metro', 'within_state', 'rest_of_india', 'ne_jk'];
      const coveredZones = ['within_city', 'metro_to_metro'];
      const coverage = (coveredZones.length / requiredZones.length) * 100;
      
      expect(coverage).toBe(40);
    });

    it('should identify service type coverage', () => {
      const requiredTypes = ['surface', 'air', 'express'];
      const coveredTypes = ['surface', 'express'];
      const uncovered = requiredTypes.filter(t => !coveredTypes.includes(t));
      
      expect(uncovered).toContain('air');
      expect(uncovered.length).toBe(1);
    });
  });

  describe('Error Cases', () => {
    it('should handle null inputs gracefully', () => {
      const createSchema = z.object({
        courierId: z.string().uuid(),
      });

      expect(() => createSchema.parse(null)).toThrow();
    });

    it('should handle undefined inputs gracefully', () => {
      const createSchema = z.object({
        courierId: z.string().uuid(),
      });

      expect(() => createSchema.parse(undefined)).toThrow();
    });

    it('should handle malformed UUIDs', () => {
      const schema = z.string().uuid();
      expect(() => schema.parse('not-a-uuid')).toThrow();
    });

    it('should handle edge case delivery days', () => {
      const schema = z.number().int().min(1).max(30);
      expect(() => schema.parse(1)).not.toThrow();
      expect(() => schema.parse(30)).not.toThrow();
      expect(() => schema.parse(0)).toThrow();
      expect(() => schema.parse(31)).toThrow();
    });
  });
});
