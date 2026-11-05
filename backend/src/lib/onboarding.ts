import type { FastifyRequest } from 'fastify';
import { db } from '../db/client.js';
import { AGREEMENT_VERSION, ONBOARDING_MESSAGES, onboardingProblem, type OnboardingLevel, type OnboardingState } from './onboardingRules.js';

export { AGREEMENT_VERSION } from './onboardingRules.js';

/** Loads the seller's onboarding progress and builds the route guard on top of the pure rules in onboardingRules.ts. */
export async function loadOnboardingState(sellerId: string): Promise<OnboardingState> {
  const result = await db.query<{ accepted: boolean; kyc_status: string | null }>(
    `SELECT (s.agreement_accepted_at IS NOT NULL AND s.agreement_version = $2) AS accepted, k.status::text AS kyc_status
       FROM sellers s LEFT JOIN seller_kyc k ON k.seller_id = s.id WHERE s.id = $1`,
    [sellerId, AGREEMENT_VERSION]);
  const row = result.rows[0];
  return { agreementAccepted: !!row?.accepted, kycStatus: row?.kyc_status ?? 'unsubmitted' };
}

/** Fastify preHandler factory: put it after `requireSeller`. Answers 403 with a stable `error` code the UI keys on. */
export function requireOnboarded(level: OnboardingLevel) {
  return async (request: FastifyRequest) => {
    if (!request.principal) throw Object.assign(new Error('Authentication required'), { statusCode: 401 });
    const problem = onboardingProblem(await loadOnboardingState(request.principal.sellerId), level);
    if (problem) throw Object.assign(new Error(ONBOARDING_MESSAGES[problem]), { statusCode: 403, code: problem }); // readable text for the seller, stable code for the UI
  };
}

