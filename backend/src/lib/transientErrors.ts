/**
 * Is this failure worth trying again a moment later? Used by the assign and cancel queues. A slow or briefly failing courier network is; a refusal
 * (bad pincode, empty balance, "booking is paused") is not. The text is what the seller-safe message says, e.g. "the courier network error 502".
 */
const TEMPORARY = /did not respond|too slowly|rate limit|temporarily unavailable|timed out|aborted due to timeout|timeout|ECONNRESET|fetch failed|error 50[0-9]|bad gateway|gateway time-?out|service unavailable|try again in a (moment|minute)/i;

export function isTemporaryError(message: string | null | undefined): boolean {
  return !!message && TEMPORARY.test(message);
}
