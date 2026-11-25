import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

// Defects BOOK-004 (refusal state must be written before the booking reports failure, shared across processes) and the 2026-11-25 production incident
// (Lorrigo's wallet read -19,105 rupees but it books on a credit limit, so bookings were held back although the aggregator accepted them).
const q = vi.hoisted(() => vi.fn());
vi.mock('../../../src/db/client.js', () => ({ db: { query: q } }));
import { isBalanceRefusal, markRefused, markWorking, refusingAggregators, resetRefusalCache } from '../../../src/lib/aggregatorRefusals.js';

const rowsFor = (r: Date | null, o: Date | null) => ({ rows: [{ code: 'lorrigo', r, o }, { code: 'shiprocket', r: null, o: null }] });

describe('isBalanceRefusal: only a real "wallet / credit used up" message pauses an aggregator', () => {
  it.each([
    'Insufficient balance. Please recharge your wallet to continue.',
    'Insufficient wallet balance',
    'insufficient funds',
    'Your wallet balance is low, please recharge',
    'Low wallet balance',
    'Please recharge your wallet',
    'Not enough balance to create the shipment',
  ])('refusal: %s', (m) => expect(isBalanceRefusal(m)).toBe(true));

  it.each([
    'Insufficient address details',
    'Insufficient information for pickup',
    'The wallet icon is not required',
    'Order Id already exists. Please try with another Order Id.',
    'Rate information not available',
    'Pincode not serviceable',
    'Invalid mobile number',
    'Failed to create shipment with vendor SFX_0.5: pickup pincode not serviceable',
    '',
  ])('NOT a refusal: %s', (m) => expect(isBalanceRefusal(m)).toBe(false));
});

describe('shared refusal state', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-25T10:00:00Z')); q.mockReset(); resetRefusalCache(); });
  afterEach(() => { vi.useRealTimers(); });

  it('a negative balance on its own never pauses anything: nothing is refusing until the aggregator really refuses', async () => {
    q.mockResolvedValue(rowsFor(null, null));
    expect([...await refusingAggregators()]).toEqual([]);
  });

  it('markRefused WRITES the shared state before it resolves (an awaited write, not fire-and-forget)', async () => {
    q.mockResolvedValue(rowsFor(null, null));
    let writeFinished = false;
    q.mockImplementation(async (sql: string) => {
      if (/UPDATE courier_aggregators SET last_refused_at/.test(sql)) { await Promise.resolve(); await Promise.resolve(); writeFinished = true; return { rows: [] }; }
      return rowsFor(null, null);
    });
    await markRefused('lorrigo');
    expect(writeFinished).toBe(true);
    expect((await refusingAggregators()).has('lorrigo')).toBe(true);
    expect((await refusingAggregators()).has('shiprocket')).toBe(false);
  });

  it('another process sees the refusal through the database', async () => {
    q.mockResolvedValue(rowsFor(new Date(Date.now() - 30_000), null)); // refused 30 s ago by the API process; this is the worker
    expect((await refusingAggregators()).has('lorrigo')).toBe(true);
  });

  it('a later successful booking clears it', async () => {
    q.mockResolvedValue(rowsFor(null, null));
    await markRefused('lorrigo');
    expect((await refusingAggregators()).has('lorrigo')).toBe(true);
    vi.setSystemTime(new Date(Date.now() + 1000));
    markWorking('lorrigo');
    expect((await refusingAggregators()).has('lorrigo')).toBe(false);
    expect(q.mock.calls.some((c) => /last_ok_at = now\(\)/.test(String(c[0])))).toBe(true);
  });

  it('a success that predates the refusal does not clear it (the refusal is newer)', async () => {
    q.mockResolvedValue(rowsFor(new Date(Date.now() - 20_000), new Date(Date.now() - 60_000)));
    expect((await refusingAggregators()).has('lorrigo')).toBe(true);
  });

  it('a refusal older than ten minutes is no longer trusted: the next attempt finds out again', async () => {
    q.mockResolvedValue(rowsFor(new Date(Date.now() - 11 * 60_000), null));
    expect((await refusingAggregators()).has('lorrigo')).toBe(false);
  });

  it('if the database cannot be read nothing is blocked (and nothing throws)', async () => {
    q.mockRejectedValue(new Error('connection refused'));
    expect([...await refusingAggregators()]).toEqual([]);
  });

  it('if the refusal cannot be written this process still protects itself and does not throw', async () => {
    q.mockImplementation(async (sql: string) => { if (/UPDATE/.test(sql)) throw new Error('read-only'); return rowsFor(null, null); });
    await expect(markRefused('lorrigo')).resolves.toBeUndefined();
    expect((await refusingAggregators()).has('lorrigo')).toBe(true);
  });
});
