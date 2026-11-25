import { afterEach, describe, expect, it, vi } from 'vitest';
import { LorrigoAdapter } from '../../../src/couriers/lorrigo.js';

vi.mock('../../../src/db/client.js', () => ({ db: { query: vi.fn(async () => ({ rows: [] })) }, withTransaction: vi.fn(), withSellerTransaction: vi.fn() }));
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

// Regression: the aggregator wallet ran out (it was at -6237 rupees) and every seller's bookings were refused ("Courier booking is paused"), and nobody
// knew until a client tested. The balance is now read and shown to admins, with a warning before it reaches zero.
describe('courier network wallet balance', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reads wallet_balance from GET /users/me however the answer is wrapped, including a negative balance', async () => {
    for (const body of [{ wallet_balance: -6237, is_active: true }, { user: { wallet_balance: -6237 } }, { data: { walletBalance: '-6237' } }]) {
      vi.stubGlobal('fetch', vi.fn(async () => json(body)));
      expect(await new LorrigoAdapter('key', 'https://lorrigo.test/api').balance()).toBe(-6237);
    }
  });

  it('says "unknown" (null) when the answer carries no balance, never 0', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ is_active: true })));
    expect(await new LorrigoAdapter('key', 'https://lorrigo.test/api').balance()).toBeNull();
  });

  // The balance is INFORMATION: Lorrigo books on a credit limit (it showed -19,105 rupees while bookings went through), so a negative number must never
  // be reported as "refusing" or stop a booking. Only a real refusal does that (aggregatorRefusals.ts).
  it('classifies the balance as information only: low under the warning level (negative included), otherwise ok', async () => {
    const { balanceStatus } = await import('../../../src/lib/aggregatorBalance.js');
    expect(balanceStatus(-19105, 3000)).toBe('low');
    expect(balanceStatus(0, 3000)).toBe('low');
    expect(balanceStatus(2999, 3000)).toBe('low');
    expect(balanceStatus(3000, 3000)).toBe('ok');
    expect(balanceStatus(null, 3000)).toBe('unknown');
    expect(balanceStatus(Number.NaN, 3000)).toBe('unknown');
    for (const n of [-19105, 0, 5, 1e9, null, Number.NaN]) expect(['ok', 'low', 'unknown']).toContain(balanceStatus(n as number | null, 3000)); // never 'refusing'
  });
});
