import { describe, expect, it } from 'vitest';
import { cached, invalidateMetrics, metricsCacheSize, optWindowSql, pct, pickupMissedSql, pickupPendingSql, windowSql } from '../../../src/lib/metrics.js';

describe('pct', () => {
  it('is null when there is nothing to divide by, never a made-up 0%', () => { expect(pct(0, 0)).toBeNull(); expect(pct(3, 0)).toBeNull(); });
  it('rounds to one decimal', () => { expect(pct(1, 3)).toBe(33.3); expect(pct(2, 4)).toBe(50); });
});

describe('windows', () => {
  it('are sargable: the column is compared directly, with no cast on it', () => {
    const sql = windowSql('sh.created_at', 2, 3, 4);
    expect(sql).toContain('sh.created_at >=');
    expect(sql).toContain('sh.created_at <');
    expect(sql).not.toMatch(/sh\.created_at\s+AT TIME ZONE/);
    expect(sql).not.toMatch(/\(sh\.created_at[^)]*\)::date/);
  });
  it('use India midnight for both ends', () => { expect((windowSql('c', 1, 2, 3).match(/Asia\/Kolkata/g) ?? []).length).toBeGreaterThanOrEqual(2); });
  it('the optional window is open ended when a date is missing', () => { expect(optWindowSql('c', 1, 2)).toContain('$1::date IS NULL'); });
});

describe('pickup definitions', () => {
  it('pending excludes shipments cancelled at the courier', () => { expect(pickupPendingSql('s.')).toContain('s.courier_cancelled_at IS NULL'); });
  it('missed is pending plus a 24 hour deadline', () => { const m = pickupMissedSql('s.'); expect(m).toContain(pickupPendingSql('s.')); expect(m).toContain("interval '24 hours'"); });
});

describe('cached', () => {
  it('computes once for concurrent callers and serves the stored value until it expires', async () => {
    let calls = 0; const compute = async () => { calls += 1; await new Promise((r) => setTimeout(r, 20)); return { n: calls }; };
    const [a, b] = await Promise.all([cached('seller:s1:t1', 1000, compute), cached('seller:s1:t1', 1000, compute)]);
    expect(calls).toBe(1); expect(a).toBe(b);
    await cached('seller:s1:t1', 1000, compute); expect(calls).toBe(1);
  });
  it('is cleared for one seller by invalidateMetrics, and for nobody else', async () => {
    let c1 = 0, c2 = 0;
    await cached('seller:s2:x', 1000, async () => ++c1); await cached('seller:s3:x', 1000, async () => ++c2);
    invalidateMetrics('s2');
    await cached('seller:s2:x', 1000, async () => ++c1); await cached('seller:s3:x', 1000, async () => ++c2);
    expect(c1).toBe(2); expect(c2).toBe(1);
  });
  it('does not keep a failed computation', async () => {
    await expect(cached('seller:s4:x', 1000, async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    expect(await cached('seller:s4:x', 1000, async () => 7)).toBe(7);
    expect(metricsCacheSize()).toBeGreaterThan(0);
  });
  it('re-computes after the time to live', async () => {
    let n = 0; await cached('seller:s5:x', 5, async () => ++n); await new Promise((r) => setTimeout(r, 15)); await cached('seller:s5:x', 5, async () => ++n); expect(n).toBe(2);
  });
});
