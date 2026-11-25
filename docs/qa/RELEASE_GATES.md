# NEXGO Release Gates and Sign-off

This document defines a decision, not a checklist that can be bypassed because of a deadline.

## Gate 0 — Scope and candidate

- [ ] Candidate commit and environment are identified.
- [ ] Release scope/provider capabilities are defined.
- [ ] Changes are code-reviewed.
- [ ] No untracked or accidental secrets/artifacts are included.
- [ ] Database backup and rollback plan reviewed.

## Gate 1 — Build and automated quality

- [x] Frontend lint passes. (`npm run lint`, exit 0, 2026-11-26)
- [x] Frontend production build passes. (`npm run build`, exit 0)
- [x] Frontend unit tests pass. (`npm test`: 53 / 53)
- [x] Backend typecheck passes. (`npm run check`, exit 0)
- [x] Backend unit/integration tests pass. (vitest 511 / 511; e2e suites in TEST_MATRIX section 10)
- [ ] API contract tests pass.
- [ ] E2E critical path passes. **API-level e2e PASS; browser e2e NOT RUN.**
- [ ] Migrations tested on clean and existing schema. **Clean: PASS (75 migrations on an empty database). Existing / production-sized data: NOT RUN.**
- [ ] No unexplained test skips/failures.

## Gate 2 — Security and data isolation

- [ ] Two-seller isolation suite passes across API, IDs, exports, documents, jobs, and mutations.
- [ ] Admin privilege checks verified.
- [ ] Session/CSRF/CORS/rate-limit/cookie configuration verified.
- [ ] No credentials/secrets in repo, browser bundles, logs, or error responses.
- [ ] Sensitive documents and exports are scoped and protected.
- [ ] Audit records exist for sensitive actions.

## Gate 3 — Order and booking correctness

- [x] Create order/readiness validation. (booking gate verified; creation / import validation not re-audited, ORD-001)
- [ ] CSV bulk import boundary tests.
- [ ] Quote, serviceability, rate, and booking parity.
- [ ] Credentials and provider health gates.
- [ ] Manual, synchronous autoassign, and async batch flows.
- [x] Concurrent/double booking prevention. (concurrency.mjs 10 / 10)
- [ ] Timeout reconciliation before retry. **OPEN: BOOK-001 (P0). No durable booking intent, no reconciliation job.**
- [ ] Provider failover classification.
- [ ] Wallet debit/cancel refund/COD/RTO integrity.
- [ ] No false booking success state. **ORD-007 (seller could mark an order booked) fixed and verified; UX-008 (bulk reported queued as assigned) fixed, logic verified, browser not run.**

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

## Sign-off record, 2026-11-26 run

| Gate | Status | Basis |
|---|---|---|
| 1 Build and automated quality | **PASS** with the two exceptions above | commands in TEST_MATRIX section 10 |
| 2 Security and data isolation | **NOT PASSED** | SEC-001 / SEC-002 / SEC-003 / SEC-004 not completed; no full two-seller suite |
| 3 Order and booking correctness | **NOT PASSED** | BOOK-001 (P0) open |
| 4 Operations and UX | **NOT PASSED** | OPS-001 / DEP-001 (P0) open; no browser run |
| 5 Provider verification | **NOT PASSED** | no live Lorrigo test certified in this run; Shiprocket never run live; RapidShyp not integrated |
| 6 Decision | **NO-GO** for an unrestricted release | see criteria below |

### Recommendation: NO-GO (unrestricted). Conditional LIMITED GO is possible once the criteria below are met.

Closed in this run (with evidence): the 2026-11-25 booking-hold incident (BOOK-011), the false-"booked" order state (ORD-007), unready orders reaching couriers (BOOK-010), refusal-state race and over-broad classifier (BOOK-004 / BOOK-012), bulk upload reporting queued orders as assigned (UX-008), undetectable blocked print window (UX-010), concurrent double booking (BOOK-002 verified safe).

To move to LIMITED GO: (1) close BOOK-001 with a durable booking intent, reconciliation job and a fault-injection test; (2) a worker heartbeat with a visible degraded state and a test that stops the worker (OPS-001); (3) the two-seller isolation suite (SEC-001); (4) one controlled live Lorrigo booking, label and cancel, with its evidence attached; (5) keep Shiprocket and any RapidShyp integration **disabled** until each has one controlled live booking; (6) one browser run of the order-to-AWB journey.
