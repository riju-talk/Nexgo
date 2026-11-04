import { describe, it, expect } from 'vitest';
import { idLast4, idNumberProblem, normalizeIdNumber } from '../../../src/lib/idProof.js';

describe('identity proof formats', () => {
  it('accepts a valid number for each document type', () => {
    expect(idNumberProblem('aadhaar', '2345 6789 0123')).toBeNull();
    expect(idNumberProblem('passport', 'a1234567')).toBeNull();
    expect(idNumberProblem('voter_id', 'abc-1234567')).toBeNull();
    expect(idNumberProblem('driving_licence', 'MH12 2011 0012345')).toBeNull();
  });

  it('rejects numbers in the wrong format', () => {
    expect(idNumberProblem('aadhaar', '1234 5678 9012')).toMatch(/12-digit Aadhaar/); // cannot start with 0 or 1
    expect(idNumberProblem('aadhaar', '2345')).not.toBeNull();
    expect(idNumberProblem('passport', 'Q1234567')).toMatch(/passport/);
    expect(idNumberProblem('voter_id', '12345')).toMatch(/voter ID/);
    expect(idNumberProblem('driving_licence', 'XX')).toMatch(/driving licence/);
  });

  it('keeps only the last 4 characters of any number', () => {
    expect(normalizeIdNumber(' ab-12 34 ')).toBe('AB1234');
    expect(idLast4('2345 6789 0123')).toBe('0123');
    expect(idLast4('a1234567')).toBe('4567');
  });
});
