# NEXGO Release Gates and Sign-off

This document defines a decision, not a checklist that can be bypassed because of a deadline.

## Gate 0 — Scope and candidate

- [ ] Candidate commit and environment are identified.
- [ ] Release scope/provider capabilities are defined.
- [ ] Changes are code-reviewed.
- [ ] No untracked or accidental secrets/artifacts are included.
- [ ] Database backup and rollback plan reviewed.

## Gate 1 — Build and automated quality

- [ ] Frontend lint passes.
- [ ] Frontend production build passes.
- [ ] Frontend unit tests pass.
- [ ] Backend typecheck passes.
- [ ] Backend unit/integration tests pass.
- [ ] API contract tests pass.
- [ ] E2E critical path passes.
- [ ] Migrations tested on clean and existing schema.
- [ ] No unexplained test skips/failures.

## Gate 2 — Security and data isolation

- [ ] Two-seller isolation suite passes across API, IDs, exports, documents, jobs, and mutations.
- [ ] Admin privilege checks verified.
- [ ] Session/CSRF/CORS/rate-limit/cookie configuration verified.
- [ ] No credentials/secrets in repo, browser bundles, logs, or error responses.
- [ ] Sensitive documents and exports are scoped and protected.
- [ ] Audit records exist for sensitive actions.

## Gate 3 — Order and booking correctness

- [ ] Create order/readiness validation.
- [ ] CSV bulk import boundary tests.
- [ ] Quote, serviceability, rate, and booking parity.
- [ ] Credentials and provider health gates.
- [ ] Manual, synchronous autoassign, and async batch flows.
- [ ] Concurrent/double booking prevention.
- [ ] Timeout reconciliation before retry.
- [ ] Provider failover classification.
- [ ] Wallet debit/cancel refund/COD/RTO integrity.
- [ ] No false booking success state.

## Gate 4 — Operations and user experience

- [ ] Worker heartbeat and queue health verified.
- [ ] Stale jobs and dead-letter handling tested.
- [ ] Per-order progress/failure/retryability visible.
- [ ] Carrier labels are genuine or explicitly unavailable.
- [ ] Manifest/pickup and storage failure handling.
- [ ] Tracking webhook/polling and NDR/RTO recovery.
- [ ] Pagination, select-all, caps, reports, and exports are complete or explicit.
- [ ] Loading, empty, error, offline, session expiry, and partial-success states verified.
- [ ] Responsive and keyboard smoke tests completed.

## Gate 5 — Provider verification

For every enabled provider:

- [ ] Credentials validated and scoped.
- [ ] Controlled test shipment booked.
- [ ] Provider order reference reconciled.
- [ ] AWB confirmed and unique.
- [ ] Provider label fetched and barcode/format checked.
- [ ] Pickup action/limitations checked.
- [ ] Tracking event received and mapped.
- [ ] Cancellation/refund behavior checked, where supported.
- [ ] Provider failure, timeout, and reconciliation behavior tested.

If a provider is not verified, disable booking with that provider and clearly document the limitation. Mock tests are not substitutes for real-provider certification.

## Gate 6 — Release decision

### GO
All P0 closed, release-critical P1 closed, tests pass, provider and deployment evidence complete, rollback ready.

### LIMITED GO
Only if remaining risks are isolated and affected feature/provider is disabled or constrained. Document scope, owner, deadline, and acceptance.

### NO-GO
Any unresolved P0, duplicate booking/debit risk, tenant isolation failure, false booking state, unrecoverable queue failure, data-loss risk, failed critical test, or missing mandatory live verification without safe feature disablement.

## Sign-off record

| Role | Name | Decision | Date | Evidence / notes |
|---|---|---|---|---|
| Engineering owner |  |  |  |  |
| QA owner |  |  |  |  |
| Product/client owner |  |  |  |  |
| Operations/deployment owner |  |  |  |  |

## Known limitations and risk acceptance

Record each item with: defect ID, risk, impact, mitigation/feature disablement, owner, expiry/revisit date, approver. No blanket risk acceptance.
