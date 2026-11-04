/**
 * Verifiable identity documents accepted at KYC and the number format each must match.
 * Mirrors backend/src/lib/idProof.ts so people see what to fix before anything is uploaded.
 * Only the last 4 characters of the number are stored by the server; the scan goes to the private bucket.
 */
export const ID_PROOFS = [
  { id: 'aadhaar', label: 'Aadhaar card', placeholder: 'XXXX XXXX XXXX', pattern: /^[2-9][0-9]{11}$/, message: 'Enter a valid 12-digit Aadhaar number', backRequired: false },
  { id: 'passport', label: 'Passport', placeholder: 'A1234567', pattern: /^[A-PR-WY][0-9]{7}$/, message: 'Enter a valid passport number (for example A1234567)', backRequired: false },
  { id: 'voter_id', label: 'Voter ID (EPIC)', placeholder: 'ABC1234567', pattern: /^[A-Z]{3}[0-9]{7}$/, message: 'Enter a valid voter ID number (for example ABC1234567)', backRequired: false },
  { id: 'driving_licence', label: 'Driving licence', placeholder: 'MH1220110012345', pattern: /^[A-Z]{2}[0-9]{2}[0-9A-Z]{9,13}$/, message: 'Enter a valid driving licence number (for example MH1220110012345)', backRequired: false },
];

export const idProofLabel = (id) => ID_PROOFS.find((p) => p.id === id)?.label || 'ID proof';

/** Removes spaces and dashes and upper-cases, matching the server's normalisation. */
export const normalizeIdNumber = (value = '') => value.replace(/[\s-]/g, '').toUpperCase();

/** Returns an error message, or '' when the number matches the chosen document's format. */
export function idNumberProblem(type, raw) {
  const proof = ID_PROOFS.find((p) => p.id === type);
  if (!proof) return 'Choose an identity document';
  return proof.pattern.test(normalizeIdNumber(raw)) ? '' : proof.message;
}

/** What the "Submitted details" card shows for the ID proof: type plus the last 4 characters. */
export function maskedIdProof(type, last4) {
  return last4 ? `${idProofLabel(type)} ••••${last4}` : '—';
}
