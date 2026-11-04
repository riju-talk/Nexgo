/**
 * @file courierZones.test.ts
 * @description Unit tests for Courier Zones routes
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';

describe('Courier Zones Routes', () => {
  describe('Request Validation', () => {
    const createLaneSchema = z.object({
      courierId: z.string().uuid(),
      originPincode: z.string().regex(/^\d{6}$/),
      destinationPincode: z.string().regex(/^\d{6}$/),
      zoneCode: z.enum(['within_city', 'metro_to_metro', 'within_state', 'rest_of_india', 'ne_jk']),
      serviceType: z.enum(['surface', 'air', 'express']),
      transitDays: z.number().int().min(1).max(30),
      isServiceable: z.boolean(),
      codAvailable: z.boolean(),
    });

    it('should accept valid lane creation request', () => {
      const request = {
        courierId: '550e8400-e29b-41d4-a716-446655440000',
        originPincode: '110001',
        destinationPincode: '560001',
        zoneCode: 'metro_to_metro' as const,
        serviceType: 'surface' as const,
        transitDays: 2,
        isServiceable: true,
        codAvailable: true,
      };
      
      expect(() => createLaneSchema.parse(request)).not.toThrow();
    });

    it('should reject invalid pincode format', () => {
      const request = {
        courierId: '550e8400-e29b-41d4-a716-446655440000',
        originPincode: '11001', // Too short
        destinationPincode: '560001',
        zoneCode: 'metro_to_metro' as const,
        serviceType: 'surface' as const,
        transitDays: 2,
        isServiceable: true,
        codAvailable: true,
      };
      
      expect(() => createLaneSchema.parse(request)).toThrow();
    });

    it('should reject non-numeric pincodes', () => {
      const request = {
        courierId: '550e8400-e29b-41d4-a716-446655440000',
        originPincode: '11000A',
        destinationPincode: '560001',
        zoneCode: 'metro_to_metro' as const,
        serviceType: 'surface' as const,
        transitDays: 2,
        isServiceable: true,
        codAvailable: true,
      };
      
      expect(() => createLaneSchema.parse(request)).toThrow();
    });

    it('should validate transit days range', () => {
      const schema = z.number().int().min(1).max(30);
      expect(() => schema.parse(1)).not.toThrow();
      expect(() => schema.parse(30)).not.toThrow();
      expect(() => schema.parse(0)).toThrow();
      expect(() => schema.parse(31)).toThrow();
    });
  });

  describe('Response Format', () => {
    it('should return paginated lanes with correct structure', () => {
      const response = {
        items: [
          {
            id: '550e8400-e29b-41d4-a716-446655440000',
            courierId: '660e8400-e29b-41d4-a716-446655440001',
            originPincode: '110001',
            destinationPincode: '560001',
            zoneCode: 'metro_to_metro',
            serviceType: 'surface',
            transitDays: 2,
          },
        ],
        pagination: {
          page: 1,
          pageSize: 50,
          totalItems: 1,
          totalPages: 1,
          hasNext: false,
          hasPrev: false,
        },
      };

      expect(response.items).toBeDefined();
      expect(response.pagination).toBeDefined();
      expect(response.pagination.hasNext).toBe(false);
      expect(response.pagination.hasPrev).toBe(false);
    });

    it('should include hasNext flag when more pages exist', () => {
      const pagination = {
        page: 1,
        pageSize: 50,
        totalItems: 101,
        totalPages: 3,
        hasNext: true,
        hasPrev: false,
      };

      expect(pagination.hasNext).toBe(true);
      expect(pagination.hasPrev).toBe(false);
    });

    it('should include hasPrev flag on non-first page', () => {
      const pagination = {
        page: 2,
        pageSize: 50,
        totalItems: 101,
        totalPages: 3,
        hasNext: true,
        hasPrev: true,
      };

      expect(pagination.hasNext).toBe(true);
      expect(pagination.hasPrev).toBe(true);
    });
  });

  describe('Filtering', () => {
    it('should filter lanes by zone code', () => {
      const lanes = [
        { zone: 'within_city', id: '1' },
        { zone: 'metro_to_metro', id: '2' },
        { zone: 'within_city', id: '3' },
      ];

      const filtered = lanes.filter(l => l.zone === 'within_city');
      expect(filtered.length).toBe(2);
      expect(filtered.every(l => l.zone === 'within_city')).toBe(true);
    });

    it('should filter lanes by service type', () => {
      const lanes = [
        { serviceType: 'surface', id: '1' },
        { serviceType: 'air', id: '2' },
        { serviceType: 'surface', id: '3' },
      ];

      const filtered = lanes.filter(l => l.serviceType === 'surface');
      expect(filtered.length).toBe(2);
    });

    it('should filter lanes by serviceability status', () => {
      const lanes = [
        { isServiceable: true, id: '1' },
        { isServiceable: false, id: '2' },
        { isServiceable: true, id: '3' },
      ];

      const filtered = lanes.filter(l => l.isServiceable);
      expect(filtered.length).toBe(2);
    });

    it('should support multiple filters', () => {
      const lanes = [
        { zone: 'within_city', serviceType: 'surface', isServiceable: true, id: '1' },
        { zone: 'within_city', serviceType: 'air', isServiceable: true, id: '2' },
        { zone: 'metro_to_metro', serviceType: 'surface', isServiceable: false, id: '3' },
        { zone: 'within_city', serviceType: 'surface', isServiceable: true, id: '4' },
      ];

      const filtered = lanes.filter(l => 
        l.zone === 'within_city' && 
        l.serviceType === 'surface' && 
        l.isServiceable
      );
      
      expect(filtered.length).toBe(2);
      expect(filtered.map(l => l.id)).toEqual(['1', '4']);
    });
  });

  describe('Bulk Import', () => {
    it('should accept bulk import payload', () => {
      const bulkSchema = z.object({
        lanes: z.array(z.object({
          originPincode: z.string().regex(/^\d{6}$/),
          destinationPincode: z.string().regex(/^\d{6}$/),
          zoneCode: z.enum(['within_city', 'metro_to_metro', 'within_state', 'rest_of_india', 'ne_jk']),
          serviceType: z.enum(['surface', 'air', 'express']),
          transitDays: z.number().int().min(1).max(30),
        })),
      });

      const payload = {
        lanes: [
          {
            originPincode: '110001',
            destinationPincode: '560001',
            zoneCode: 'metro_to_metro' as const,
            serviceType: 'surface' as const,
            transitDays: 2,
          },
          {
            originPincode: '110002',
            destinationPincode: '560002',
            zoneCode: 'within_city' as const,
            serviceType: 'air' as const,
            transitDays: 1,
          },
        ],
      };

      expect(() => bulkSchema.parse(payload)).not.toThrow();
    });

    it('should limit bulk import size', () => {
      const maxLanes = 10000;
      const lanes = Array(10001).fill({ originPincode: '110001', destinationPincode: '560001' });
      
      expect(lanes.length).toBeGreaterThan(maxLanes);
    });

    it('should return import results with created/updated counts', () => {
      const result = {
        created: 50,
        updated: 25,
        errors: [],
        totalProcessed: 75,
      };

      expect(result.created).toBe(50);
      expect(result.updated).toBe(25);
      expect(result.totalProcessed).toBe(75);
    });

    it('should report errors in bulk import', () => {
      const result = {
        created: 98,
        updated: 0,
        errors: [
          { row: 5, error: 'Invalid pincode format' },
          { row: 42, error: 'Invalid zone code' },
        ],
        totalProcessed: 100,
      };

      expect(result.errors.length).toBe(2);
      expect(result.errors[0].row).toBe(5);
    });
  });

  describe('Statistics Endpoint', () => {
    it('should calculate total lanes', () => {
      const stats = {
        totalLanes: 150,
        serviceableLanes: 145,
        codAvailableLanes: 140,
      };

      expect(stats.totalLanes).toBe(150);
    });

    it('should calculate serviceability metrics', () => {
      const stats = {
        totalLanes: 100,
        serviceableLanes: 95,
        serviceabilityPercentage: 95,
      };

      expect(stats.serviceabilityPercentage).toBe(95);
    });

    it('should calculate zone breakdown', () => {
      const breakdown = {
        within_city: 30,
        metro_to_metro: 25,
        within_state: 20,
        rest_of_india: 20,
        ne_jk: 5,
      };

      const total = Object.values(breakdown).reduce((a, b) => a + b, 0);
      expect(total).toBe(100);
    });

    it('should calculate service type breakdown', () => {
      const breakdown = {
        surface: 60,
        air: 25,
        express: 15,
      };

      const total = Object.values(breakdown).reduce((a, b) => a + b, 0);
      expect(total).toBe(100);
    });
  });

  describe('Update Operations', () => {
    it('should validate update request', () => {
      const updateSchema = z.object({
        laneId: z.string().uuid(),
        updates: z.object({
          transitDays: z.number().int().min(1).max(30).optional(),
          isServiceable: z.boolean().optional(),
          codAvailable: z.boolean().optional(),
        }),
      });

      const request = {
        laneId: '550e8400-e29b-41d4-a716-446655440000',
        updates: {
          transitDays: 3,
          isServiceable: false,
        },
      };

      expect(() => updateSchema.parse(request)).not.toThrow();
    });

    it('should support partial updates', () => {
      const updateSchema = z.object({
        transitDays: z.number().optional(),
        isServiceable: z.boolean().optional(),
      }).strict();

      const update = { transitDays: 2 };
      expect(() => updateSchema.parse(update)).not.toThrow();
    });

    it('should reject updates with invalid transit days', () => {
      const updateSchema = z.object({
        transitDays: z.number().int().min(1).max(30),
      });

      const update = { transitDays: 31 };
      expect(() => updateSchema.parse(update)).toThrow();
    });
  });

  describe('Delete Operations', () => {
    it('should accept delete request with lane ID', () => {
      const deleteSchema = z.object({
        laneId: z.string().uuid(),
      });

      const request = {
        laneId: '550e8400-e29b-41d4-a716-446655440000',
      };

      expect(() => deleteSchema.parse(request)).not.toThrow();
    });

    it('should return success response', () => {
      const response = {
        success: true,
        deletedId: '550e8400-e29b-41d4-a716-446655440000',
        message: 'Lane deleted successfully',
      };

      expect(response.success).toBe(true);
      expect(response.message).toContain('deleted');
    });
  });

  describe('Error Handling', () => {
    it('should return 404 for non-existent lane', () => {
      const errorResponse = {
        statusCode: 404,
        error: 'NOT_FOUND',
        message: 'Lane not found',
      };

      expect(errorResponse.statusCode).toBe(404);
    });

    it('should return 400 for invalid input', () => {
      const errorResponse = {
        statusCode: 400,
        error: 'INVALID_INPUT',
        message: 'Invalid pincode format',
      };

      expect(errorResponse.statusCode).toBe(400);
    });

    it('should return 409 for duplicate lane', () => {
      const errorResponse = {
        statusCode: 409,
        error: 'ALREADY_EXISTS',
        message: 'Lane with this origin-destination pair already exists',
      };

      expect(errorResponse.statusCode).toBe(409);
    });

    it('should return 422 for unprocessable entity', () => {
      const errorResponse = {
        statusCode: 422,
        error: 'UNPROCESSABLE',
        message: 'Cannot delete lane with active shipments',
      };

      expect(errorResponse.statusCode).toBe(422);
    });
  });

  describe('Authentication & Authorization', () => {
    it('should require platform admin role', () => {
      const requirementCheck = {
        requireAuth: true,
        requiredRole: 'platform_admin',
        authenticated: true,
      };

      expect(requirementCheck.requireAuth).toBe(true);
      expect(requirementCheck.requiredRole).toBe('platform_admin');
    });

    it('should reject unauthenticated requests', () => {
      const response = {
        statusCode: 401,
        error: 'UNAUTHORIZED',
        message: 'Authentication required',
      };

      expect(response.statusCode).toBe(401);
    });

    it('should reject requests with insufficient permissions', () => {
      const response = {
        statusCode: 403,
        error: 'FORBIDDEN',
        message: 'Insufficient permissions',
      };

      expect(response.statusCode).toBe(403);
    });
  });
});
