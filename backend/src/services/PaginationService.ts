/**
 * @file PaginationService.ts
 * @description Centralized pagination logic for consistent API responses
 * Handles page-based and cursor-based pagination patterns
 */

/**
 * Pagination parameters from request
 */
export interface PaginationParams {
  page?: number;
  pageSize?: number;
  cursor?: string;
}

/**
 * Pagination metadata in response
 */
export interface PaginationMeta {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

/**
 * Paginated response structure
 */
export interface PaginatedResponse<T> {
  items: T[];
  pagination: PaginationMeta;
}

/**
 * Default pagination configuration
 */
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 1000;
const MIN_PAGE_SIZE = 1;

export class PaginationService {
  /**
   * Parse and validate pagination parameters from request
   * 
   * @param query - Query parameters from request
   * @returns Validated pagination params
   */
  static parseParams(query: any): { page: number; pageSize: number; offset: number } {
    // Parse page number (1-indexed for user-facing API)
    let page = parseInt(query.page || '1', 10);
    if (isNaN(page) || page < 1) {
      page = 1;
    }
    
    // Parse page size with bounds checking
    let pageSize = parseInt(query.pageSize || query.limit || String(DEFAULT_PAGE_SIZE), 10);
    if (isNaN(pageSize) || pageSize < MIN_PAGE_SIZE) {
      pageSize = DEFAULT_PAGE_SIZE;
    }
    if (pageSize > MAX_PAGE_SIZE) {
      pageSize = MAX_PAGE_SIZE;
    }
    
    // Calculate offset for SQL OFFSET clause (0-indexed)
    const offset = (page - 1) * pageSize;
    
    return { page, pageSize, offset };
  }
  
  /**
   * Build pagination metadata from query results
   * 
   * @param page - Current page number
   * @param pageSize - Items per page
   * @param totalItems - Total number of items in dataset
   * @returns Pagination metadata
   */
  static buildMeta(page: number, pageSize: number, totalItems: number): PaginationMeta {
    const totalPages = Math.ceil(totalItems / pageSize);
    
    return {
      page,
      pageSize,
      totalItems,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    };
  }
  
  /**
   * Create a paginated response
   * 
   * @param items - Array of items for current page
   * @param page - Current page number
   * @param pageSize - Items per page
   * @param totalItems - Total number of items
   * @returns Paginated response object
   */
  static paginate<T>(
    items: T[],
    page: number,
    pageSize: number,
    totalItems: number
  ): PaginatedResponse<T> {
    return {
      items,
      pagination: this.buildMeta(page, pageSize, totalItems),
    };
  }
  
  /**
   * Execute a paginated database query
   * 
   * @param pool - Database connection pool
   * @param baseQuery - SQL query without LIMIT/OFFSET
   * @param countQuery - SQL query to get total count
   * @param params - Query parameters
   * @param paginationParams - Pagination settings
   * @returns Paginated result set
   */
  static async executeQuery<T>(
    pool: any,
    baseQuery: string,
    countQuery: string,
    params: any[],
    paginationParams: { page: number; pageSize: number; offset: number }
  ): Promise<PaginatedResponse<T>> {
    const { page, pageSize, offset } = paginationParams;
    
    // Execute count query and data query in parallel
    const [countResult, dataResult] = await Promise.all([
      pool.query(countQuery, params),
      pool.query(`${baseQuery} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [
        ...params,
        pageSize,
        offset,
      ]),
    ]);
    
    const totalItems = parseInt(countResult.rows[0]?.count || '0', 10);
    
    return this.paginate<T>(dataResult.rows, page, pageSize, totalItems);
  }
  
  /**
   * Generate SQL for cursor-based pagination
   * Useful for infinite scroll or real-time feeds
   * 
   * @param cursor - Last item's cursor value
   * @param cursorColumn - Column to use for cursor (e.g., 'id', 'created_at')
   * @param direction - 'next' or 'prev'
   * @returns SQL WHERE clause
   */
  static buildCursorClause(
    cursor: string | null,
    cursorColumn: string,
    direction: 'next' | 'prev' = 'next'
  ): { clause: string; params: any[] } {
    if (!cursor) {
      return { clause: '', params: [] };
    }
    
    const operator = direction === 'next' ? '>' : '<';
    return {
      clause: `${cursorColumn} ${operator} $1`,
      params: [cursor],
    };
  }
  
  /**
   * Validate page number is within bounds
   * 
   * @param page - Requested page
   * @param totalPages - Total available pages
   * @throws Error if page is out of bounds
   */
  static validatePageBounds(page: number, totalPages: number): void {
    if (page > totalPages && totalPages > 0) {
      throw new Error(`Page ${page} exceeds total pages ${totalPages}`);
    }
  }
}

/**
 * Helper function to build ORDER BY clause with pagination defaults
 * 
 * @param sortBy - Column to sort by
 * @param sortOrder - 'asc' or 'desc'
 * @param defaultSort - Default sort column
 * @returns SQL ORDER BY clause
 */
export function buildSortClause(
  sortBy?: string,
  sortOrder?: string,
  defaultSort = 'created_at DESC'
): string {
  if (!sortBy) {
    return `ORDER BY ${defaultSort}`;
  }
  
  // Whitelist of allowed sort columns (prevent SQL injection)
  const allowedColumns = [
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
  
  if (!allowedColumns.includes(sortBy)) {
    return `ORDER BY ${defaultSort}`;
  }
  
  const order = sortOrder?.toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  return `ORDER BY ${sortBy} ${order}`;
}

export default PaginationService;
