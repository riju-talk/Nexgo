# NEXGO Release Gates and Sign-off

This document defines a decision, not a checklist that can be bypassed because of a deadline.

## Gate 0 — Scope and candidate

- [ ] Candidate commit and environment are identified.
- [ ] Release scope/provider capabilities are defined.
- [ ] Changes are code-reviewed.
- [ ] No untracked or accidental secrets/artifacts are included.
- [ ] Database backup and rollback plan reviewed.

## Gate 1 — Build and automated quality

- [x] Frontend lint passes. (`npm run lint`, exit 0, 2026-11-25)
- [x] Frontend production build passes. (`npm run build`, exit 0)
- [x] Frontend unit tests pass. (`npm test`: 66 / 66)
- [x] Backend typecheck passes. (`npm run check`, exit 0)
- [x] Backend unit/integration tests pass. (vitest 524 / 524; e2e suites in TEST_MATRIX section 10)
- [ ] API contract tests pass.
- [ ] E2E critical path passes. **API-level e2e PASS; browser e2e NOT RUN.**
- [ ] Migrations tested on clean and existing schema. **Clean: PASS (76). Copy with 2,688 orders: PASS. Production-sized data: NOT RUN.**
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
- [x] Timeout reconciliation before retry. (reconcile.mjs 21 / 21)
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

## Sign-off record, 2026-11-25 (second run)

| Gate | Status | Basis |
|---|---|---|
| 1 Build and automated quality | **PASS** | TEST_MATRIX section 11 |
| 2 Security and data isolation | **PASS with conditions** | two-seller sweep passed; exposed credentials must be rotated, production configuration not inspected |
| 3 Order and booking correctness | **PASS against fakes** | BOOK-001, BOOK-002, ORD-010 closed with failure injection; no live courier |
| 4 Operations and UX | **PARTIAL** | worker health verified; no browser run |
| 5 Provider verification | **NOT PASSED** | no live booking; Shiprocket off |

### Recommendation: LIMITED GO, Lorrigo only, after the five conditions. Unrestricted release: NO-GO.

1. Rotate every credential pasted in chat (Shiprocket API user password; the other pasted value wherever it belongs).
2. Deploy, then check: `/health/worker` answers 200, migration 0076 is applied, Admin > System settings shows the worker running.
3. One controlled Lorrigo booking, label and cancel, with the wallet debit and refund checked. Then one small bulk batch (10 orders).
4. Open in a browser: create order, bulk upload, Track > Book now, print label, NDR board.
5. Keep Shiprocket courier services inactive until the same single booking passes there (recharge its wallet first).

Changes sellers will notice: asking for RTO no longer shows "RTO" or charges return freight until the courier confirms; reusing an order number with other details is now an error row; while a courier answer is unconfirmed the order cannot be edited, cancelled or booked elsewhere (normally under a minute).
Rollback: the code can go back to `c75667f` without touching the database (0076 only adds tables). First make sure no row in `booking_attempts` is still `started`, `unknown`, `accepted` or `cancel_needed`.
