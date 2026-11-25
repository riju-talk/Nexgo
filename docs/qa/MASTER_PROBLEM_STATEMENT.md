# NEXGO Master Problem Statement — Production Readiness

**Target window:** 48-hour stabilization sprint  
**Date:** 2026-11-25  
**Target:** Reliable seller order-to-shipment workflow and defensible release decision  
**Not a promise:** A two-day deadline cannot override unresolved critical risk or missing live-provider verification.

## 1. Product and quality objective

NEXGO is a multi-courier shipping platform. A seller should be able to:

1. Register/sign in and complete required account setup.
2. Configure warehouse, account, courier access, rate card, and wallet readiness.
3. Create/import orders with validated address, contact, parcel, payment, and reference data.
4. See courier choices that are genuinely eligible and explainable.
5. Book manually or through auto-assignment without duplicate shipment creation or duplicate charges.
6. Receive truthful, durable booking outcomes, AWB, tracking, and carrier documents.
7. Monitor, cancel, manage NDR/RTO, and reconcile COD where supported.
8. Export and print complete, correctly scoped data.
9. Recover from provider/API/worker/storage failures without losing order state or misleading the user.

Quality objective: **correctness, reliability, data isolation, operational visibility, accessibility, and customer experience**. “Zero errors” is not a meaningful engineering guarantee; the target is zero known release-blocking defects, no silent data loss, robust recovery, and explicit residual risk.

## 2. User-impacting problem

The reported client symptom is inability to punch/book orders. Earlier code audits found mismatches between quote eligibility, order readiness, booking entry points, asynchronous queue processing, and carrier-provider execution. A seller can potentially be told an order is ready or a courier appears available, while the actual booking path rejects or stalls it.

The system must make these states distinct and never imply success before provider acceptance and durable local persistence:

- Order accepted
- Order data valid / ready
- Courier lane eligible
- Price/rate available
- Integration configured and healthy enough to attempt
- Booking request submitted
- Provider booking confirmed
- Local shipment persisted
- AWB available
- Carrier label available
- Pickup arranged
- Tracking updates received

## 3. Quality dimensions and scope

### Release-critical
- Order creation, validation, CSV bulk import, duplicate/idempotency semantics
- Courier quotes/serviceability and rate calculation
- Manual booking, synchronous autoassign, async bulk assign
- Provider adapters (Lorrigo and Shiprocket), credentials, refusal/pause/failover
- Queue/worker health, retries, dead letters, stale-job recovery
- Wallet debit/refund/ledger consistency
- Booking timeout reconciliation, duplicate booking prevention, concurrency control
- Shipment state and AWB integrity
- Actual carrier label retrieval, document jobs, manifests, storage failures
- Tracking/webhooks, NDR/RTO, cancellation
- Seller/admin permissions and cross-tenant isolation

### High-priority UX and operations
- Persistent per-order errors and recovery actions
- Bulk operation progress and final outcome reconciliation
- List/search/filter/pagination and selection completeness
- CSV/XLSX export completeness and correct data typing
- Admin setup/integration health, rate card consistency
- Responsive usability, keyboard navigation, accessible labels, loading/empty/error states
- Support diagnostics and safe logging/trace IDs

### Lower priority, only after release-critical work
- Cosmetic refinement, non-critical animations, new feature development, optional dashboards not needed for safe operations.

## 4. Core invariants (must always hold)

1. One order may not produce duplicate active bookings for the same booking intent.
2. One confirmed booking must not be debited more than once.
3. Cancellation/refund is applied at most once and tied to the confirmed shipment.
4. A booking timeout is **unknown**, not automatically failed. Reconcile before retry.
5. The API must not report booked until provider booking is confirmed and the local shipment/ledger state is durable.
6. Queue acceptance must not be presented as booking success.
7. No courier is offered as bookable unless service/rate/configuration/eligibility prerequisites are met; live provider serviceability must be clearly labeled if not checked.
8. Quote, readiness, booking, and assignment share consistent rules and parcel inputs.
9. Each bulk request produces one result per input row, including invalid, duplicate, skipped, queued, booked, and failed.
10. Any truncation, partial export, capped selection, or unreachable page is explicitly surfaced; no false completeness.
11. Sellers cannot access or mutate other sellers’ records or secrets.
12. Provider errors, worker errors, and document failures cannot silently disappear.
13. Shipment booking success and label/pickup/tracking status are separate states.
14. Admin action, money movement, and provider-facing operations have audit trails and request correlation.

## 5. Definition of production readiness

The release is eligible for sign-off only when:

- P0 defects are closed and regression tests pass.
- P1 defects affecting order booking, money, tenant isolation, queue recovery, or truthful user outcomes are closed or explicitly blocked from release with risk-owner approval.
- Required unit/integration/E2E tests are executed with results attached.
- Frontend production build, lint, backend checks, migration checks, and tests pass on the candidate commit.
- Real carrier transaction is verified in a controlled environment for each provider being enabled. If provider verification is unavailable, provider is disabled for production bookings or release is explicitly limited.
- Production worker, database, storage, environment, webhook, and secrets configuration are checked.
- Data isolation tests between two sellers pass.
- Rollback and incident recovery procedures are available.
- No unresolved critical security, financial, duplicate-booking, or data-loss issue remains.
- Release notes and client-facing operational limitations are documented.

## 6. System flow under test

`Seller UI → API/session/tenant validation → Order validation/readiness → Quote/eligibility → Booking intent/idempotency → Provider adapter → Provider confirmation/reconciliation → Local shipment + ledger transaction → Queue/status visibility → AWB/label/tracking`

Every boundary requires contract checks, timeouts, retries with backoff, correlation IDs, and observable failure states.

## 7. Known baseline concerns (not all reverified on current HEAD)

- Quote and booking eligibility may diverge (inactive/unknown pincodes, refusal memory, credentials/configuration).
- Assignment entry points may queue orders without enforcing complete readiness.
- Worker availability is critical; API can enqueue work while worker is stopped.
- Provider booking may succeed while response/local persistence fails; reconciliation/idempotency must be durable.
- Shiprocket adapter may create provider order before courier assignment/AWB; failed follow-up can leave orphan provider-side orders.
- Aggregator refusal/pause state update may be fire-and-forget, creating a race window.
- Generic NEXGO document may be emitted instead of the provider's carrier label.
- Selection, listing, and export caps can produce incomplete work/results if frontend handling is incorrect.
- Deep numbered pagination has a reachability ceiling.
- Manifest creation/storage and job failure feedback require consistency.
- Order readiness diagnostics and bulk outcomes need actionable, persistent per-row detail.
- Frontend coverage, live-provider behavior, production configuration, and deployment health are not yet certified.

## 8. Constraints and non-goals for the 48-hour sprint

- Do not introduce new courier providers or feature scope.
- Do not perform risky schema/data changes without migration review, backup/rollback, and tests.
- Do not enable a provider with unverified credentials/contracts.
- Do not make UI-only fixes to a backend correctness problem.
- Do not suppress errors, loosen validation, or auto-retry ambiguous booking requests merely to improve apparent success rate.
- Do not claim comprehensive production readiness without the release gates and evidence.

## 9. Required artifacts

- Master defect register with owner, severity, evidence, reproduction, fix, and test.
- Test matrix with status and evidence links.
- Two-day work plan with checkpoints and scope control.
- Release gate checklist.
- Updated architecture/workflow and operational docs as changes are made.
- Final summary of fixed, verified, blocked, and deferred items.
