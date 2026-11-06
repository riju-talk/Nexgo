import { describe, expect, it } from 'vitest';
import { z } from 'zod';

// Mirrors the customer phone rule in routes/operations.ts (kept in sync by hand: the schema is not exported).
const mobile = z.string().trim().regex(/^[0-9+() -]{7,24}$/, 'Enter a valid phone number (digits only, 7 to 24 characters)')
  .refine((v) => /^[6-9][0-9]{9}$/.test(v.replace(/\D/g, '').slice(-10)), 'Enter a valid 10-digit Indian mobile number (it starts with 6, 7, 8 or 9)');

describe('customer mobile number rule', () => {
  it.each(['9876543210', '+91 98765 43210', '09876543210', '(91) 9876-543210', '6000000000'])('accepts %s', (v) => expect(mobile.safeParse(v).success).toBe(true));
  it.each(['12345', '1234567890', '5876543210', 'abcdefghij', '98765', ''])('refuses %s with a readable message', (v) => {
    const r = mobile.safeParse(v);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toMatch(/valid/);
  });
});
