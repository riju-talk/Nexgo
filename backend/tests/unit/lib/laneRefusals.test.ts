import { describe, it, expect } from 'vitest';
import { laneRefusalOf } from '../../../src/lib/laneRefusals.js';

describe('laneRefusalOf', () => {
  it('reads the lane the booking code attached to a refusal', () => {
    const lane = { serviceId: '11111111-1111-1111-1111-111111111111', pickup: '400001', destination: '700001' };
    expect(laneRefusalOf(Object.assign(new Error('x'), { lane }))).toEqual(lane);
  });
  it('ignores ordinary errors and half-filled lanes', () => {
    expect(laneRefusalOf(new Error('Insufficient wallet balance'))).toBeNull();
    expect(laneRefusalOf(null)).toBeNull();
    expect(laneRefusalOf(Object.assign(new Error('x'), { lane: { serviceId: 'a', pickup: '400001' } }))).toBeNull();
  });
});
