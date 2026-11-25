import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { isAmbiguous } from '../../../src/lib/bookingAttempts.js';
import { BOOKING_PAUSED } from '../../../src/lib/sellerSafeError.js';
import { LorrigoError } from '../../../src/couriers/lorrigo.js';

describe('isAmbiguous: could the courier hold the parcel although this error came back? (BOOK-001)', () => {
  const yes: [string, unknown][] = [
    ['timeout', new LorrigoError('Lorrigo did not respond in time. Try again.', 502)],
    ['HTTP 500 at the courier', new LorrigoError('Lorrigo: Internal error', 502, 500)],
    ['HTTP 502 at the courier', new LorrigoError('Lorrigo: Bad gateway', 502, 502)],
    ['booked but no AWB in the answer', new LorrigoError('Lorrigo did not return an AWB for this shipment.', 502)],
    ['a bug in our own code', new TypeError('x is undefined')],
    ['something that is not an error', undefined],
  ];
  const no: [string, unknown][] = [
    ['lane refusal', new LorrigoError('This courier does not serve this pincode', 422)],
    ['validation error at the courier', new LorrigoError('Lorrigo: Invalid phone', 422, 400)],
    ['API key rejected', new LorrigoError('Lorrigo rejected the API key.', 502, 401)],
    ['rate limited after retries', new LorrigoError('Lorrigo is rate limiting requests', 502, 429)],
    ['out of balance', new LorrigoError(BOOKING_PAUSED, 503, 402)],
    ['aggregator not configured', Object.assign(new Error('not configured'), { statusCode: 503 })],
  ];
  it.each(yes)('%s: unknown, must be looked up', (_n, e) => expect(isAmbiguous(e)).toBe(true));
  it.each(no)('%s: definitely not booked', (_n, e) => expect(isAmbiguous(e)).toBe(false));
});

describe('the stored booking context must come back byte for byte', () => {
  it('is a json column: jsonb reorders keys, which changes the order reference sent to the courier and makes a real booking look missing', () => {
    const sql = readFileSync(new URL('../../../src/db/migrations/0076_booking_attempts_worker_heartbeat.sql', import.meta.url), 'utf8');
    expect(sql).toMatch(/^\s*context json,/m);
  });
});
