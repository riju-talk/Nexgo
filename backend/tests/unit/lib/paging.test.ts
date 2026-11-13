import { describe, expect, it } from 'vitest';
import { decodeCursor, encodeCursor, keysetBefore, mergeNewestFirst, parseLimit, tsText } from '../../../src/lib/paging.js';

const ID_A = '11111111-1111-4111-8111-111111111111';
const ID_B = '22222222-2222-4222-8222-222222222222';

describe('cursor', () => {
  it('round-trips the time text and id', () => {
    const c = encodeCursor('2026-11-13T12:34:56.123456Z', ID_A);
    expect(decodeCursor(c)).toEqual({ ts: '2026-11-13T12:34:56.123456Z', id: ID_A });
  });
  it('treats missing as the first batch', () => { expect(decodeCursor(undefined)).toBeNull(); expect(decodeCursor('')).toBeNull(); expect(decodeCursor(null)).toBeNull(); });
  it('refuses anything this server did not make, with a 400', () => {
    for (const bad of ['garbage', Buffer.from('{"a":1}').toString('base64url'), Buffer.from(JSON.stringify(['2026-11-13', ID_A])).toString('base64url'),
      Buffer.from(JSON.stringify(['2026-11-13T12:34:56Z', "x'; DROP TABLE shipments;--"])).toString('base64url'), Buffer.from(JSON.stringify(['2026-11-13T12:34:56Z', ID_A, 'extra'])).toString('base64url')]) {
      expect(() => decodeCursor(bad), bad).toThrow(/not valid/);
      try { decodeCursor(bad); } catch (e) { expect((e as { statusCode: number }).statusCode).toBe(400); }
    }
  });
});

describe('parseLimit', () => {
  it('uses the default for anything unusable and caps the rest', () => {
    expect(parseLimit(undefined)).toBe(50); expect(parseLimit('abc')).toBe(50); expect(parseLimit('0')).toBe(50); expect(parseLimit('-5')).toBe(50); expect(parseLimit('2.5')).toBe(50);
    expect(parseLimit('25')).toBe(25); expect(parseLimit('1000')).toBe(200); expect(parseLimit('1000', 50, 500)).toBe(500);
  });
});

describe('keysetBefore', () => {
  it('is TRUE for the first batch and adds the two parameters otherwise', () => {
    const none: unknown[] = ['seller']; expect(keysetBefore(null, 's.created_at', 's.id', none)).toBe('TRUE'); expect(none).toEqual(['seller']);
    const params: unknown[] = ['seller'];
    const sql = keysetBefore({ ts: '2026-11-13T12:34:56.123456Z', id: ID_A }, 's.created_at', 's.id', params);
    expect(sql).toBe('(s.created_at, s.id) < ($2::timestamptz, $3::uuid)');
    expect(params).toEqual(['seller', '2026-11-13T12:34:56.123456Z', ID_A]);
  });
});

describe('mergeNewestFirst', () => {
  it('interleaves sources newest first, breaks equal times by id and keeps only the limit', () => {
    const a = [{ ts: '2026-11-13T12:00:05.000000Z', id: ID_A }, { ts: '2026-11-13T12:00:01.000000Z', id: ID_A }];
    const b = [{ ts: '2026-11-13T12:00:05.000000Z', id: ID_B }, { ts: '2026-11-13T12:00:03.000000Z', id: ID_B }];
    expect(mergeNewestFirst([a, b], 3)).toEqual([{ ts: '2026-11-13T12:00:05.000000Z', id: ID_B }, { ts: '2026-11-13T12:00:05.000000Z', id: ID_A }, { ts: '2026-11-13T12:00:03.000000Z', id: ID_B }]);
  });
  it('compares microseconds, not just milliseconds', () => {
    const rows = mergeNewestFirst([[{ ts: '2026-11-13T12:00:00.000100Z', id: ID_A }], [{ ts: '2026-11-13T12:00:00.000900Z', id: ID_B }]], 2);
    expect(rows.map((r) => r.id)).toEqual([ID_B, ID_A]);
  });
});

describe('tsText', () => {
  it('wraps the column in a fixed-width UTC format with microseconds', () => { expect(tsText('s.created_at')).toContain("AT TIME ZONE 'UTC'"); expect(tsText('s.created_at')).toContain('US'); });
});
