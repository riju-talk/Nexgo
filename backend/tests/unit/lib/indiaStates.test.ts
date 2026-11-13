import { describe, expect, it } from 'vitest';
import { normalizeState, sameState } from '../../../src/lib/indiaStates.js';

describe('indiaStates', () => {
  it('turns two-letter codes into the full name', () => {
    expect(normalizeState('WB')).toBe('West Bengal');
    expect(normalizeState('wb')).toBe('West Bengal');
    expect(normalizeState('MH')).toBe('Maharashtra');
    expect(normalizeState('DL')).toBe('Delhi');
    expect(normalizeState('TN')).toBe('Tamil Nadu');
    expect(normalizeState('KA')).toBe('Karnataka');
    expect(normalizeState('UP')).toBe('Uttar Pradesh');
    expect(normalizeState('JK')).toBe('Jammu and Kashmir');
    expect(normalizeState('TS')).toBe('Telangana');
    expect(normalizeState('OD')).toBe('Odisha');
    expect(normalizeState('PB')).toBe('Punjab');
    expect(normalizeState('PY')).toBe('Puducherry');
  });
  it('accepts every code used for the 36 states and territories', () => {
    for (const code of ['AN', 'AP', 'AR', 'AS', 'BR', 'CH', 'CG', 'DN', 'DL', 'GA', 'GJ', 'HR', 'HP', 'JK', 'JH', 'KA', 'KL', 'LA', 'LD', 'MP', 'MH', 'MN', 'ML', 'MZ', 'NL', 'OD', 'PY', 'PB', 'RJ', 'SK', 'TN', 'TS', 'TR', 'UP', 'UK', 'WB']) {
      expect(normalizeState(code).length, code).toBeGreaterThan(2);
    }
  });
  it('fixes spelling variants and old names', () => {
    expect(normalizeState('Orissa')).toBe('Odisha');
    expect(normalizeState('Pondicherry')).toBe('Puducherry');
    expect(normalizeState('Jammu & Kashmir')).toBe('Jammu and Kashmir');
    expect(normalizeState('NCT of Delhi')).toBe('Delhi');
    expect(normalizeState('new delhi')).toBe('Delhi');
    expect(normalizeState('Chattisgarh')).toBe('Chhattisgarh');
    expect(normalizeState('  west  bengal ')).toBe('West Bengal');
    expect(normalizeState('W.B.')).toBe('West Bengal');
    expect(normalizeState('J&K')).toBe('Jammu and Kashmir');
    expect(normalizeState('Andaman & Nicobar Islands')).toBe('Andaman and Nicobar Islands');
  });
  it('leaves unknown text alone', () => {
    expect(normalizeState('Atlantis')).toBe('Atlantis');
    expect(normalizeState('')).toBe('');
  });
  it('compares two spellings of one state', () => {
    expect(sameState('WB', 'West Bengal')).toBe(true);
    expect(sameState('MH', 'West Bengal')).toBe(false);
  });
});
