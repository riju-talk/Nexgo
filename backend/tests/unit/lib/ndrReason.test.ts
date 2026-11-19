import { describe, expect, it } from 'vitest';
import { ndrReasonFrom } from '../../../src/lib/trackingIngest.js';

describe('ndrReasonFrom', () => {
  it('files "Code verified cancellation" as a customer cancellation, not a payment problem', () => {
    expect(ndrReasonFrom('Pending - Code verified cancellation')).toBe('refused_delivery');
  });
  it('still recognises real COD / payment wording', () => {
    expect(ndrReasonFrom('COD amount not ready')).toBe('payment_not_ready');
    expect(ndrReasonFrom('Customer asked to pay cod later')).toBe('payment_not_ready');
    expect(ndrReasonFrom('Cash not available with customer')).toBe('payment_not_ready');
  });
});
