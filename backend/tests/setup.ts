/**
 * Test Setup - Shared utilities for all tests
 */

import { Pool } from 'pg';
import { randomUUID } from 'crypto';

// Create connection pool for tests
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost/nexgo_test'
});

/**
 * Reset database for tests
 */
export async function resetDatabase() {
  const client = await pool.connect();
  try {
    // For unit tests, we just clear the test tables
    // Don't actually reset - just skip for unit tests that need mocking
    return;
  } finally {
    client.release();
  }
}

/**
 * Create a test seller
 */
export async function createTestSeller(
  pool: Pool,
  overrides: Partial<{ name: string; email: string }> = {}
) {
  const client = await pool.connect();
  try {
    const sellerId = randomUUID();
    const result = await client.query(
      `INSERT INTO sellers (id, legal_name, email, gst_applicable)
       VALUES ($1, $2, $3, $4)
       RETURNING id, legal_name as name, email`,
      [
        sellerId,
        overrides.name || 'Test Seller',
        overrides.email || `seller-${randomUUID()}@test.local`,
        false
      ]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

/**
 * Create a test courier
 */
export async function createTestCourier(
  pool: Pool,
  overrides: Partial<{ name: string; code: string }> = {}
) {
  const client = await pool.connect();
  try {
    const courierId = randomUUID();
    const result = await client.query(
      `INSERT INTO courier_providers (id, code, name, aggregator, integration_state)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, code`,
      [
        courierId,
        overrides.code || `TEST-${randomUUID().substring(0, 8)}`,
        overrides.name || 'Test Courier',
        'internal',
        'active'
      ]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}
