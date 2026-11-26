import { Pool, type PoolClient } from 'pg';
import { config } from '../config.js';

// Serverless functions each hold their own pool, so keep it small in production
// and point DATABASE_URL at the provider's pooled (pgbouncer) connection string.
// keepAlive stops idle connections being dropped by the network between the API and the database (a dropped one costs a full reconnect on the next request).
export const db = new Pool({ connectionString: config.DATABASE_URL, max: config.DB_POOL_MAX, keepAlive: true, keepAliveInitialDelayMillis: 10_000 });

async function runTransaction<T>(begin: string, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await db.connect();
  try {
    await client.query(begin);
    const value = await work(client);
    await client.query('COMMIT');
    return value;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export const withTransaction = <T>(work: (client: PoolClient) => Promise<T>): Promise<T> => runTransaction('BEGIN', work);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** BEGIN and the seller scope go to the database in ONE round trip (the id is a checked UUID, so it is safe to put in the text). */
export function withSellerTransaction<T>(sellerId: string, work: (client: PoolClient) => Promise<T>): Promise<T> {
  if (!UUID.test(sellerId)) return withTransaction(async (client) => { await client.query("SELECT set_config('app.seller_id', $1, true)", [sellerId]); return work(client); });
  return runTransaction(`BEGIN; SELECT set_config('app.seller_id', '${sellerId}', true)`, work);
}
