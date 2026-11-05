import { describe, it, expect } from 'vitest';
import { onboardingProblem } from '../../../src/lib/onboardingRules.js';

const state = (agreementAccepted: boolean, kycStatus: string) => ({ agreementAccepted, kycStatus, kycEnforced: true });

describe('onboarding gate', () => {
  it('blocks everything until the agreement is accepted', () => {
    for (const kyc of ['unsubmitted', 'pending_review', 'verified']) {
      expect(onboardingProblem(state(false, kyc), 'order')).toBe('AGREEMENT_REQUIRED');
      expect(onboardingProblem(state(false, kyc), 'ship')).toBe('AGREEMENT_REQUIRED');
    }
  });

  it('lets a seller create orders once KYC is submitted, not before', () => {
    expect(onboardingProblem(state(true, 'unsubmitted'), 'order')).toBe('KYC_REQUIRED');
    expect(onboardingProblem(state(true, 'rejected'), 'order')).toBe('KYC_REQUIRED');
    expect(onboardingProblem(state(true, 'pending_review'), 'order')).toBeNull();
    expect(onboardingProblem(state(true, 'verified'), 'order')).toBeNull();
  });

  it('only lets a seller book shipments after an admin verified KYC', () => {
    expect(onboardingProblem(state(true, 'pending_review'), 'ship')).toBe('KYC_NOT_VERIFIED');
    expect(onboardingProblem(state(true, 'unsubmitted'), 'ship')).toBe('KYC_REQUIRED');
    expect(onboardingProblem(state(true, 'rejected'), 'ship')).toBe('KYC_REQUIRED');
    expect(onboardingProblem(state(true, 'verified'), 'ship')).toBeNull();
  });

  it('does not block on KYC when the gate is switched off (ENFORCE_KYC_GATE=false)', () => {
    for (const kyc of ['unsubmitted', 'pending_review', 'rejected', 'verified']) for (const level of ['order', 'ship'] as const) {
      expect(onboardingProblem({ agreementAccepted: true, kycStatus: kyc, kycEnforced: false }, level)).toBeNull();
      expect(onboardingProblem({ agreementAccepted: false, kycStatus: kyc, kycEnforced: false }, level)).toBe('AGREEMENT_REQUIRED');
    }
  });
});
