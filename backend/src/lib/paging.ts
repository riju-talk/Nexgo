/**
 * Keyset ("cursor") paging for long lists: instead of "skip 5,000 rows" (slow, and rows shift when new ones arrive) the next batch is
 * "everything older than the last row you got". The cursor is an opaque string holding that last row's sort time AND id (the id breaks ties
 * between rows created in the same instant, so no row is ever skipped or repeated).
 *
 * The time travels as the TEXT Postgres produced (`created_at::text`), never through a JavaScript Date: a Date keeps milliseconds, Postgres keeps
 * microseconds, and a rounded time would silently skip rows that sit between the two.
 */
const TS = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}(:?\d{2})?)$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type Cursor = { ts: string; id: string };

export const encodeCursor = (ts: string, id: string): string => Buffer.from(JSON.stringify([ts, id])).toString('base64url');

/** null when there is no cursor (first batch); throws a 400 for one that was not made by this server. */
export function decodeCursor(raw: string | undefined | null): Cursor | null {
  if (raw === undefined || raw === null || raw === '') return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (Array.isArray(parsed) && parsed.length === 2 && typeof parsed[0] === 'string' && typeof parsed[1] === 'string' && TS.test(parsed[0]) && UUID.test(parsed[1])) return { ts: parsed[0], id: parsed[1] };
  } catch { /* fall through */ }
  throw Object.assign(new Error('That list position is not valid. Reload the list.'), { statusCode: 400 });
}

/** Batch size from the query string: a whole number between 1 and `max`, otherwise the default. */
export function parseLimit(value: unknown, fallback = 50, max = 200): number {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 ? Math.min(n, max) : fallback;
}

/**
 * SQL for "older than the cursor" on columns `ts` and `id`, written as `(ts, id) < ($a::timestamptz, $b::uuid)`.
 * `params` is the query's parameter array: the two cursor values are pushed onto it and their placeholders are used.
 */
export function keysetBefore(cursor: Cursor | null, tsColumn: string, idColumn: string, params: unknown[]): string {
  if (!cursor) return 'TRUE';
  params.push(cursor.ts, cursor.id);
  return `(${tsColumn}, ${idColumn}) < ($${params.length - 1}::timestamptz, $${params.length}::uuid)`;
}

/** SQL expression for a column's time as fixed-width UTC text with microseconds ("2026-11-13T12:34:56.123456Z"): the cursor time, and sortable as plain text. */
export const tsText = (column: string): string => `to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;

/** Merges rows from several sources (each already newest first, times made with tsText) into one newest-first list of at most `limit`, ties broken by id. */
export function mergeNewestFirst<T extends { ts: string; id: string }>(sources: T[][], limit: number): T[] {
  return sources.flat().sort((a, b) => (a.ts === b.ts ? (a.id < b.id ? 1 : a.id > b.id ? -1 : 0) : a.ts < b.ts ? 1 : -1)).slice(0, limit);
}

/** For offset lists (back-office screens): ask the query for `limit + 1` rows, then this returns the first `limit` and whether more exist. */
export function pageRows<T>(rows: T[], limit: number): { items: T[]; hasMore: boolean } {
  return { items: rows.slice(0, limit), hasMore: rows.length > limit };
}
