/**
 * Pure onboarding-gate rules (no database), so they can be unit tested.
 *   level 'order' : agreement accepted AND KYC submitted (pending_review or verified)  -> may create orders
 *   level 'ship'  : agreement accepted AND KYC verified by an admin                     -> may book shipments
 */
export type OnboardingLevel = 'order' | 'ship';
export type OnboardingState = { agreementAccepted: boolean; kycStatus: string };

/** Current agreement text version. Bump it to make every seller accept again. */
export const AGREEMENT_VERSION = '2026-11';

export type OnboardingProblem = 'AGREEMENT_REQUIRED' | 'KYC_REQUIRED' | 'KYC_NOT_VERIFIED';

export const ONBOARDING_MESSAGES: Record<OnboardingProblem, string> = {
  AGREEMENT_REQUIRED: 'Accept the NEXGO seller agreement before continuing.',
  KYC_REQUIRED: 'Submit your KYC details before creating orders.',
  KYC_NOT_VERIFIED: 'Your KYC is still being verified. You can book shipments once it is approved.',
};

export function onboardingProblem(state: OnboardingState, level: OnboardingLevel): OnboardingProblem | null {
  if (!state.agreementAccepted) return 'AGREEMENT_REQUIRED';
  if (level === 'order' && !['pending_review', 'verified'].includes(state.kycStatus)) return 'KYC_REQUIRED';
  if (level === 'ship' && state.kycStatus !== 'verified') return state.kycStatus === 'pending_review' ? 'KYC_NOT_VERIFIED' : 'KYC_REQUIRED';
  return null;
}
