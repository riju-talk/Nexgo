import { createHash } from 'node:crypto';
import type { CourierAdapter, CourierBookingRequest, CourierBookingResult } from './types.js';

// Deterministic local adapter. A production provider adapter implements this
// exact contract and is selected only after its credentials pass verification.
export class MockCourierAdapter implements CourierAdapter {
  constructor(readonly providerCode: string) {}
  async book(request: CourierBookingRequest): Promise<CourierBookingResult> {
    // Test-only: MOCK_COURIER_DELAY_MS makes the sandbox courier as slow as a real aggregator, to measure throughput. Ignored in production.
    const delay = process.env.NODE_ENV === 'production' ? 0 : Number(process.env.MOCK_COURIER_DELAY_MS ?? 0);
    if (delay > 0) await new Promise((resolve) => { setTimeout(resolve, delay); });
    const digest = createHash('sha256').update(`${this.providerCode}:${request.reference}`).digest('hex').toUpperCase();
    return { providerShipmentId: `mock_${digest.slice(0, 16)}`, awb: `NXG${digest.slice(0, 12)}`, labelAvailable: true };
  }
  async cancel(): Promise<void> {}
}
