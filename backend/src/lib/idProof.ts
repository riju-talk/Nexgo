/**
 * Verifiable identity documents accepted at KYC, with the number format each one must match.
 * Only the last 4 characters of the number are ever stored; the scan itself goes to the bucket.
 */
export const ID_PROOF_TYPES = ['aadhaar', 'passport', 'voter_id', 'driving_licence'] as const;
export type IdProofType = (typeof ID_PROOF_TYPES)[number];

const FORMATS: Record<IdProofType, { pattern: RegExp; message: string }> = {
  aadhaar: { pattern: /^[2-9][0-9]{11}$/, message: 'Enter a valid 12-digit Aadhaar number' },
  passport: { pattern: /^[A-PR-WY][0-9]{7}$/, message: 'Enter a valid passport number (for example A1234567)' },
  voter_id: { pattern: /^[A-Z]{3}[0-9]{7}$/, message: 'Enter a valid voter ID (EPIC) number (for example ABC1234567)' },
  driving_licence: { pattern: /^[A-Z]{2}[0-9]{2}[0-9A-Z]{9,13}$/, message: 'Enter a valid driving licence number (for example MH1220110012345)' },
};

/** Removes spaces and dashes and upper-cases, so "abcd-1234 5" and "ABCD12345" compare equal. */
export const normalizeIdNumber = (value: string) => value.replace(/[\s-]/g, '').toUpperCase();

/** Returns an error message, or null when the number matches the document's format. */
export function idNumberProblem(type: IdProofType, raw: string): string | null {
  return FORMATS[type].pattern.test(normalizeIdNumber(raw)) ? null : FORMATS[type].message;
}

export const idLast4 = (raw: string) => normalizeIdNumber(raw).slice(-4);
