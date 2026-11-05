/**
 * Seller onboarding gate (shared by the gate, the agreement page and the KYC form).
 *   agreement accepted -> KYC submitted -> app opens (orders)  ->  KYC verified -> shipments can be booked
 */
export const ONBOARDING_EVENT = 'nx:onboarding-changed';

/** Pages that stay reachable while KYC is outstanding (after the agreement): the KYC form, profile and support. */
export const ONBOARDING_OPEN_PATHS = ['/settings/kyc', '/settings/profile', '/support/tickets'];

/**
 * What the seller must do next. `me` is the `/v1/seller/me` answer.
 * Returns 'agreement' | 'kyc' | 'review' | 'done'.
 *   'review' means KYC is submitted and waiting for an admin: the app is open but shipping is not.
 */
export function onboardingStep(me) {
  const state = me?.onboarding;
  if (!state) return 'done'; // older API without the gate: do not lock anybody out
  if (!state.agreementAccepted) return 'agreement';
  if (!state.kycEnforced) return 'done'; // gate switched off on the server: KYC is only a reminder (see kycProgress)
  if (state.kycStatus === 'verified') return 'done';
  if (state.kycStatus === 'pending_review') return 'review';
  return 'kyc';
}

/**
 * The KYC checklist shown on top of every seller page until verification is complete.
 * Returns { steps: [{ id, label, hint, state: 'done' | 'current' | 'todo' }], done, total }, or null when nothing is left to show.
 */
export function kycProgress(me) {
  const state = me?.onboarding;
  if (!state || state.kycStatus === 'verified' && state.agreementAccepted) return null;
  const submitted = ['pending_review', 'verified'].includes(state.kycStatus);
  const flags = [!!state.agreementAccepted, submitted, state.kycStatus === 'verified'];
  const firstOpen = flags.indexOf(false);
  const text = [
    ['Accept agreement', 'Seller terms and policies'],
    ['Submit KYC', state.kycStatus === 'rejected' ? 'Rejected: fix and resubmit' : 'PAN, ID proof and bank details'],
    ['Verification', submitted ? 'Under review by NEXGO' : 'Needed to book shipments'],
  ];
  const steps = text.map(([label, hint], i) => ({ id: ['agreement', 'kyc', 'verified'][i], label, hint, state: flags[i] ? 'done' : i === firstOpen ? 'current' : 'todo' }));
  return { steps, done: flags.filter(Boolean).length, total: flags.length };
}

/** True when the page at `pathname` must be replaced by the onboarding screen for this step. */
export function isBlocked(step, pathname) {
  if (step === 'done' || step === 'review') return false;
  if (step === 'agreement') return true; // the agreement comes first, so no page (not even the KYC form) is open yet
  return !ONBOARDING_OPEN_PATHS.some((open) => pathname === open || pathname.startsWith(`${open}/`));
}
