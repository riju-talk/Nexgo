/**
 * @file PaginationService.test.ts
 * @description Unit tests for PaginationService
 * Tests pagination logic, bounds checking, and SQL generation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import PaginationService, { buildSortClause } from '../../../src/services/PaginationService.js';

describe('PaginationService', () => {
  describe('parseParams', () => {
    it('should return default values for empty query', () => {
      const result = PaginationService.parseParams({});
      
      expect(result).toEqual({
        page: 1,
        pageSize: 50,
        offset: 0,
      });
    });
    
    it('should parse valid page and pageSize', () => {
      const result = PaginationService.parseParams({
        page: '3',
        pageSize: '25',
      });
      
      expect(result).toEqual({
        page: 3,
        pageSize: 25,
        offset: 50, // (3-1) * 25
      });
    });
    
    it('should handle invalid page numbers', () => {
      const testCases = [
        { page: '0' },
        { page: '-1' },
        { page: 'invalid' },
        { page: 'NaN' },
      ];
      
      testCases.forEach(query => {
        const result = PaginationService.parseParams(query);
        expect(result.page).toBe(1);
      });
    });
    
    it('should enforce maximum page size', () => {
      const result = PaginationService.parseParams({
        pageSize: '9999',
      });
      
      expect(result.pageSize).toBe(1000); // MAX_PAGE_SIZE
    });
    
    it('should enforce minimum page size', () => {
      const result = PaginationService.parseParams({
        pageSize: '0',
      });
      
      expect(result.pageSize).toBe(50); // Falls back to default
    });
    
    it('should calculate correct offset', () => {
      const testCases = [
        { page: 1, pageSize: 50, expectedOffset: 0 },
        { page: 2, pageSize: 50, expectedOffset: 50 },
        { page: 5, pageSize: 20, expectedOffset: 80 },
        { page: 10, pageSize: 100, expectedOffset: 900 },
      ];
      
      testCases.forEach(({ page, pageSize, expectedOffset }) => {
        const result = PaginationService.parseParams({
          page: String(page),
          pageSize: String(pageSize),
        });
        
        expect(result.offset).toBe(expectedOffset);
      });
    });
    
    it('should accept "limit" as alias for pageSize', () => {
      const result = PaginationService.parseParams({
        limit: '75',
      });
      
      expect(result.pageSize).toBe(75);
    });
  });
  
  describe('buildMeta', () => {
    it('should calculate correct total pages', () => {
      const testCases = [
        { pageSize: 50, totalItems: 100, expectedPages: 2 },
        { pageSize: 50, totalItems: 101, expectedPages: 3 },
        { pageSize: 50, totalItems: 0, expectedPages: 0 },
        { pageSize: 25, totalItems: 63, expectedPages: 3 },
      ];
      
      testCases.forEach(({ pageSize, totalItems, expectedPages }) => {
        const meta = PaginationService.buildMeta(1, pageSize, totalItems);
        expect(meta.totalPages).toBe(expectedPages);
      });
    });
    
    it('should correctly set hasNext flag', () => {
      // Page 1 of 3 - should have next
      let meta = PaginationService.buildMeta(1, 50, 150);
      expect(meta.hasNext).toBe(true);
      
      // Page 3 of 3 - should not have next
      meta = PaginationService.buildMeta(3, 50, 150);
      expect(meta.hasNext).toBe(false);
      
      // Single page - should not have next
      meta = PaginationService.buildMeta(1, 50, 25);
      expect(meta.hasNext).toBe(false);
    });
    
    it('should correctly set hasPrev flag', () => {
      // Page 1 - should not have prev
      let meta = PaginationService.buildMeta(1, 50, 150);
      expect(meta.hasPrev).toBe(false);
      
      // Page 2 - should have prev
      meta = PaginationService.buildMeta(2, 50, 150);
      expect(meta.hasPrev).toBe(true);
      
      // Page 3 - should have prev
      meta = PaginationService.buildMeta(3, 50, 150);
      expect(meta.hasPrev).toBe(true);
    });
    
    it('should return complete metadata object', () => {
      const meta = PaginationService.buildMeta(2, 25, 100);
      
      expect(meta).toEqual({
        page: 2,
        pageSize: 25,
        totalItems: 100,
        totalPages: 4,
        hasNext: true,
        hasPrev: true,
      });
    });
  });
  
  describe('paginate', () => {
    it('should combine items and metadata', () => {
      const items = [
        { id: 1, name: 'Item 1' },
        { id: 2, name: 'Item 2' },
      ];
      
      const result = PaginationService.paginate(items, 1, 50, 100);
      
      expect(result.items).toEqual(items);
      expect(result.pagination).toEqual({
        page: 1,
        pageSize: 50,
        totalItems: 100,
        totalPages: 2,
        hasNext: true,
        hasPrev: false,
      });
    });
    
    it('should handle empty result set', () => {
      const result = PaginationService.paginate([], 1, 50, 0);
      
      expect(result.items).toEqual([]);
      expect(result.pagination.totalPages).toBe(0);
      expect(result.pagination.hasNext).toBe(false);
    });
  });
  
  describe('buildCursorClause', () => {
    it('should return empty clause for null cursor', () => {
      const result = PaginationService.buildCursorClause(null, 'id', 'next');
      
      expect(result.clause).toBe('');
      expect(result.params).toEqual([]);
    });
    
    it('should build "next" cursor clause', () => {
      const result = PaginationService.buildCursorClause('123', 'id', 'next');
      
      expect(result.clause).toBe('id > $1');
      expect(result.params).toEqual(['123']);
    });
    
    it('should build "prev" cursor clause', () => {
      const result = PaginationService.buildCursorClause('123', 'id', 'prev');
      
      expect(result.clause).toBe('id < $1');
      expect(result.params).toEqual(['123']);
    });
    
    it('should work with timestamp cursors', () => {
      const timestamp = '2026-11-04T10:30:00Z';
      const result = PaginationService.buildCursorClause(timestamp, 'created_at', 'next');
      
      expect(result.clause).toBe('created_at > $1');
      expect(result.params).toEqual([timestamp]);
    });
  });
  
  describe('validatePageBounds', () => {
    it('should not throw for valid page number', () => {
      expect(() => {
        PaginationService.validatePageBounds(1, 5);
      }).not.toThrow();
      
      expect(() => {
        PaginationService.validatePageBounds(5, 5);
      }).not.toThrow();
    });
    
    it('should throw for page exceeding total pages', () => {
      expect(() => {
        PaginationService.validatePageBounds(6, 5);
      }).toThrow('Page 6 exceeds total pages 5');
    });
    
    it('should allow any page when total pages is 0', () => {
      expect(() => {
        PaginationService.validatePageBounds(10, 0);
      }).not.toThrow();
    });
  });
});

describe('buildSortClause', () => {
  it('should return default sort when no params provided', () => {
    const result = buildSortClause();
    expect(result).toBe('ORDER BY created_at DESC');
  });
  
  it('should return custom default sort', () => {
    const result = buildSortClause(undefined, undefined, 'id ASC');
    expect(result).toBe('ORDER BY id ASC');
  });
  
  it('should build valid sort clause', () => {
    const result = buildSortClause('name', 'asc');
    expect(result).toBe('ORDER BY name ASC');
  });
  
  it('should default to DESC when order not specified', () => {
    const result = buildSortClause('email');
    expect(result).toBe('ORDER BY email DESC');
  });
  
  it('should reject non-whitelisted columns', () => {
    const result = buildSortClause('malicious_column; DROP TABLE users;', 'asc');
    expect(result).toBe('ORDER BY created_at DESC'); // Falls back to default
  });
  
  it('should handle case-insensitive sort order', () => {
    expect(buildSortClause('name', 'ASC')).toBe('ORDER BY name ASC');
    expect(buildSortClause('name', 'asc')).toBe('ORDER BY name ASC');
    expect(buildSortClause('name', 'DESC')).toBe('ORDER BY name DESC');
    expect(buildSortClause('name', 'desc')).toBe('ORDER BY name DESC');
  });
  
  it('should support all whitelisted columns', () => {
    const whitelistedColumns = [
      'id',
      'created_at',
      'updated_at',
      'name',
      'email',
      'status',
      'order_number',
      'awb',
      'total_paise',
      'state',
    ];
    
    whitelistedColumns.forEach(column => {
      const result = buildSortClause(column, 'asc');
      expect(result).toBe(`ORDER BY ${column} ASC`);
    });
  });
});
