import { describe, expect, it } from 'vitest';
import { isTemporaryError } from '../../../src/lib/transientErrors.js';
import { BOOKING_PAUSED, sellerSafeMessage } from '../../../src/lib/sellerSafeError.js';

describe('isTemporaryError', () => {
  it('retries what a short wait can fix, including the 502 seen in production', () => {
    for (const m of ['the courier network error 502', 'the courier network error 503', 'Lorrigo error 504', 'Bad Gateway', 'Gateway Timeout', 'Service Unavailable',
      'The courier did not respond in time. Try again.', 'responding too slowly', 'is rate limiting requests right now', 'The operation was aborted due to timeout', 'fetch failed', 'ECONNRESET']) {
      expect(isTemporaryError(m), m).toBe(true);
    }
  });
  it('the seller-safe form of a Lorrigo 502 is still recognised', () => {
    expect(isTemporaryError(sellerSafeMessage('Lorrigo error 502'))).toBe(true);
  });
  it('does not retry refusals', () => {
    for (const m of [BOOKING_PAUSED, 'Insufficient wallet balance. Recharge your wallet to book this shipment.', 'Debit limit reached: you cannot push more orders until you recharge your wallet.',
      'This courier does not serve this pickup/delivery pincode.', 'Pincode 711101 belongs to West Bengal, not Maharashtra', 'No courier is enabled for this account', 'Order not found']) {
      expect(isTemporaryError(m), m).toBe(false);
    }
  });
  it('handles empty input', () => { expect(isTemporaryError('')).toBe(false); expect(isTemporaryError(null)).toBe(false); expect(isTemporaryError(undefined)).toBe(false); });
});
