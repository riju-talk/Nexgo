import { describe, expect, it } from 'vitest';
import { revealsAggregator, sellerSafeMessage } from '../../../src/lib/sellerSafeError.js';
import { LorrigoError } from '../../../src/couriers/lorrigo.js';

describe('sellerSafeMessage', () => {
  const samples = [
    'Lorrigo: Failed to create shipment with vendor SFX_0.5: Invalid Delivery Pincode. Pincode 110001 is not serviceble; ',
    'Lorrigo is responding too slowly. Nothing was charged; try again in a moment.',
    'Lorrigo did not respond in time. Try again.',
    'Lorrigo is rate limiting requests right now. Try again in a minute.',
    'Lorrigo rejected the API key. Please contact support.',
    'Lorrigo did not return an AWB. Check the shipment in the Lorrigo dashboard.',
    'Delhivery 500gm is not mapped to a Lorrigo courier',
    'Unknown courier aggregator "x".',
    "Lorrigo's wallet is empty",
  ];
  it.each(samples)('never names the aggregator: %s', (text) => {
    const out = sellerSafeMessage(text);
    expect(revealsAggregator(out)).toBe(false);
    expect(out.length).toBeGreaterThan(5);
  });
  it('keeps the useful reason and drops the vendor code', () => {
    const out = sellerSafeMessage(samples[0]);
    expect(out).toContain('Invalid Delivery Pincode');
    expect(out).not.toMatch(/SFX_0\.5/);
  });
  it('keeps messages that need no change', () => {
    expect(sellerSafeMessage('Debit limit reached: you cannot push more orders until you recharge your wallet.')).toBe('Debit limit reached: you cannot push more orders until you recharge your wallet.');
  });
  it('LorrigoError shows sellers a scrubbed message but keeps the original for admins', () => {
    const e = new LorrigoError('Lorrigo: bad pincode', 422);
    expect(revealsAggregator(e.message)).toBe(false);
    expect(e.detail).toBe('Lorrigo: bad pincode');
  });
  it('still lets the retry logic recognise temporary failures', () => {
    expect(/did not respond|too slowly|rate limit/i.test(sellerSafeMessage('Lorrigo did not respond in time. Try again.'))).toBe(true);
    expect(/did not respond|too slowly|rate limit/i.test(sellerSafeMessage('Lorrigo is rate limiting requests right now.'))).toBe(true);
  });
});
