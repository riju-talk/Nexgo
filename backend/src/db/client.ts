import { Pool, type PoolClient } from 'pg';
import { config } from '../config.js';

// Serverless functions each hold their own pool, so keep it small in production
// and point DATABASE_URL at the provider's pooled (pgbouncer) connection string.
export const db = new Pool({ connectionString: config.DATABASE_URL, max: config.DB_POOL_MAX });

export async function withTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const value = await work(client);
    await client.query('COMMIT');
    return value;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function withSellerTransaction<T>(sellerId: string, work: (client: PoolClient) => Promise<T>): Promise<T> {
  return withTransaction(async (client) => {
    await client.query("SELECT set_config('app.seller_id', $1, true)", [sellerId]);
    return work(client);
  });
}
