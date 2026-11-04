import test from 'node:test';
import assert from 'node:assert/strict';
import { isBlocked, onboardingStep } from '../lib/onboarding.js';

const me = (agreementAccepted, kycStatus) => ({ onboarding: { agreementAccepted, kycStatus } });

test('the next step follows agreement then KYC', () => {
  assert.equal(onboardingStep(me(false, 'unsubmitted')), 'agreement');
  assert.equal(onboardingStep(me(true, 'unsubmitted')), 'kyc');
  assert.equal(onboardingStep(me(true, 'rejected')), 'kyc');
  assert.equal(onboardingStep(me(true, 'pending_review')), 'review');
  assert.equal(onboardingStep(me(true, 'verified')), 'done');
});

test('an API without onboarding data never locks anyone out', () => {
  assert.equal(onboardingStep({}), 'done');
  assert.equal(onboardingStep(null), 'done');
});

test('only agreement and KYC steps block pages, and KYC / profile / support stay open', () => {
  assert.equal(isBlocked('agreement', '/dashboard'), true);
  assert.equal(isBlocked('agreement', '/settings/kyc'), true); // agreement first, always
  assert.equal(isBlocked('kyc', '/orders'), true);
  assert.equal(isBlocked('kyc', '/settings/kyc'), false);
  assert.equal(isBlocked('kyc', '/support/tickets'), false);
  assert.equal(isBlocked('review', '/orders'), false);
  assert.equal(isBlocked('done', '/orders'), false);
});
