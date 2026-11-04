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
  if (state.kycStatus === 'verified') return 'done';
  if (state.kycStatus === 'pending_review') return 'review';
  return 'kyc';
}

/** True when the page at `pathname` must be replaced by the onboarding screen for this step. */
export function isBlocked(step, pathname) {
  if (step === 'done' || step === 'review') return false;
  if (step === 'agreement') return true; // the agreement comes first, so no page (not even the KYC form) is open yet
  return !ONBOARDING_OPEN_PATHS.some((open) => pathname === open || pathname.startsWith(`${open}/`));
}
