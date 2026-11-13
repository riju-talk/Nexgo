/**
 * Sellers must never learn which aggregator or API NEXGO books couriers through. Every message that can reach a seller
 * (API errors, assign/cancel batch results, NDR courier notes) goes through this function; the original text stays in the server log.
 */
export function sellerSafeMessage(input: unknown): string {
  let s = typeof input === 'string' ? input : input instanceof Error ? input.message : String(input ?? '');
  s = s.replace(/^\s*lorrigo:\s*/i, '');
  // The aggregator's own wording for a refused booking, with its internal vendor code ("SFX_0.5") removed.
  s = s.replace(/failed to create shipment with vendor\s+[A-Za-z0-9_.\-]+\s*:?\s*/i, 'Booking was refused: ');
  s = s.replace(/\bvendor\s+[A-Z0-9]+_[A-Za-z0-9_.\-]+/g, 'this courier');
  s = s.replace(/check the shipment in the lorrigo dashboard\.?/i, 'Contact support with the order number.');
  s = s.replace(/\(\s*lorrigo lists it as unavailable\s*\)/i, '(currently unavailable)');
  s = s.replace(/not mapped to a lorrigo courier/i, 'not set up for booking yet');
  s = s.replace(/\blorrigo(?:'s)?\b/gi, 'the courier network');
  s = s.replace(/\bcourier aggregators?\b/gi, 'courier network');
  s = s.replace(/\baggregators?\b/gi, 'courier network');
  s = s.replace(/\bthe courier network (is|did|rejected|created|does)/gi, (_m, w) => `The courier network ${w}`);
  return s.trim().slice(0, 300);
}

/** True when the text would reveal the aggregator (used by tests). */
export const revealsAggregator = (text: string) => /lorrigo|aggregator/i.test(text);

/** Shown when the courier network itself cannot take bookings (its prepaid balance is used up). Not the seller's wallet, not temporary-looking: queues must not retry it. */
export const BOOKING_PAUSED = 'Courier booking is paused right now. Please contact support and try again later.';
