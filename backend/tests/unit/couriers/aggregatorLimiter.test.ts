import { describe, expect, it } from 'vitest';
import { AdaptiveLimiter } from '../../../src/couriers/aggregatorLimiter.js';

const clock = () => { let t = 1_000_000; return { now: () => t, advance: (ms: number) => { t += ms; } }; };
const gate = () => { let release!: () => void; const p = new Promise<void>((r) => { release = r; }); return { p, release }; };

describe('AdaptiveLimiter', () => {
  it('runs up to the allowance at once and makes the rest wait their turn, in order', async () => {
    const limiter = new AdaptiveLimiter(10, 2, 3);
    const gates = [gate(), gate(), gate(), gate(), gate()];
    const started: number[] = [];
    const runs = gates.map((g, i) => limiter.run(async () => { started.push(i); await g.p; }));
    await Promise.resolve(); await Promise.resolve();
    expect(started).toEqual([0, 1, 2]);
    expect(limiter.state).toMatchObject({ active: 3, waiting: 2 });
    gates[0].release(); await new Promise((r) => setTimeout(r, 0));
    expect(started).toEqual([0, 1, 2, 3]); // first come, first served
    gates.forEach((g) => g.release()); await Promise.all(runs);
    expect(limiter.state).toEqual({ allowed: 3, active: 0, waiting: 0 });
  });

  it('halves ONCE for a whole burst of 429s, never below the floor', () => {
    const c = clock(); const limiter = new AdaptiveLimiter(40, 4, 24, c.now);
    for (let i = 0; i < 8; i++) limiter.tooMany(); // eight 429s inside the same burst
    expect(limiter.state.allowed).toBe(12);
    c.advance(2000); limiter.tooMany(); expect(limiter.state.allowed).toBe(6);
    c.advance(2000); limiter.tooMany(); expect(limiter.state.allowed).toBe(4);
    c.advance(2000); limiter.tooMany(); expect(limiter.state.allowed).toBe(4);
  });

  it('does not grow while 429s are recent, then recovers quickly and stops at the ceiling', () => {
    const c = clock(); const limiter = new AdaptiveLimiter(40, 4, 24, c.now);
    limiter.tooMany(); // 12
    for (let i = 0; i < 20; i++) limiter.ok();
    expect(limiter.state.allowed).toBe(12); // still inside the 3 s pause
    c.advance(3500);
    for (let i = 0; i < 5; i++) limiter.ok(); expect(limiter.state.allowed).toBe(18);
    for (let i = 0; i < 5; i++) limiter.ok(); expect(limiter.state.allowed).toBe(27);
    for (let i = 0; i < 5; i++) limiter.ok(); expect(limiter.state.allowed).toBe(40);
    for (let i = 0; i < 50; i++) limiter.ok(); expect(limiter.state.allowed).toBe(40);
  });

  it('lets waiting calls in at once when the allowance grows', async () => {
    const c = clock(); const limiter = new AdaptiveLimiter(10, 1, 1, c.now);
    const g1 = gate(); const g2 = gate(); const started: number[] = [];
    const a = limiter.run(async () => { started.push(1); await g1.p; });
    const b = limiter.run(async () => { started.push(2); await g2.p; });
    await Promise.resolve(); expect(started).toEqual([1]);
    c.advance(5000); for (let i = 0; i < 5; i++) limiter.ok(); // 1 -> 2
    await Promise.resolve(); await Promise.resolve();
    expect(started).toEqual([1, 2]);
    g1.release(); g2.release(); await Promise.all([a, b]);
  });
});
