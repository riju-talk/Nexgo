/**
 * Shared brake for calls to a courier aggregator. Many bookings run at once (the queues start dozens), and the aggregator answers HTTP 429 when it is
 * asked for too much. This lets a lot of calls run side by side. When a burst of 429s comes, the allowance is halved ONCE for that burst (a burst
 * of eight 429s is one signal, not eight), and after a few quiet seconds it grows back quickly (x1.5 every few good calls) up to the ceiling.
 * So the platform goes as fast as the aggregator allows without hammering it, and one rate-limit blip does not slow the next hour of work.
 */
export class AdaptiveLimiter {
  private active = 0;
  private allowed: number;
  private okStreak = 0;
  private lastTooMany = 0;
  private readonly waiters: Array<() => void> = [];

  constructor(private readonly max: number, private readonly min = 4, start = 24, private readonly now: () => number = Date.now) {
    this.allowed = Math.max(min, Math.min(start, max));
  }

  /** Runs `fn` as soon as a slot is free (first come, first served). */
  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.allowed) await new Promise<void>((resolve) => this.waiters.push(resolve));
    else this.active += 1;
    try { return await fn(); }
    finally { this.active -= 1; this.drain(); }
  }

  /** The aggregator said "too many requests": halve the allowance (never below the floor), at most once per 1.5 s so a whole burst counts once. */
  tooMany() {
    const t = this.now();
    if (t - this.lastTooMany < 1500) return;
    this.lastTooMany = t;
    this.allowed = Math.max(this.min, Math.floor(this.allowed / 2));
    this.okStreak = 0;
  }

  /** A call went through: after a few good calls and a quiet pause since the last 429, grow by half again (never above the ceiling). */
  ok() {
    this.okStreak += 1;
    if (this.okStreak >= 5 && this.allowed < this.max && this.now() - this.lastTooMany > 3000) {
      this.allowed = Math.min(this.max, Math.ceil(this.allowed * 1.5));
      this.okStreak = 0;
      this.drain();
    }
  }

  get state() { return { allowed: this.allowed, active: this.active, waiting: this.waiters.length }; }

  // Hands freed slots to waiting calls. A slot is counted for the waiter here, so `run` does not count it twice.
  private drain() {
    while (this.active < this.allowed && this.waiters.length) { this.active += 1; this.waiters.shift()!(); }
  }
}
