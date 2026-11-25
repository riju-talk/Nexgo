# Claude Code Engineering Handoff — NEXGO Production Stabilization

**Repository:** `riju-talk/Nexgo`  
**QA branch:** `qa/production-readiness-2day`  
**Deadline target:** Two days to reach a defensible release decision, not an unconditional promise of production certification.  
**Primary implementation owner:** Claude Code  
**QA specification source:** `docs/qa/`

## Mission

Perform a systematic, evidence-driven production-readiness audit and repair of NEXGO. Treat this as a shipping operations platform, not a demo. Stabilize the complete seller workflow from order entry through courier booking, pickup, tracking, delivery, NDR, RTO, cancellation, documents, financial reconciliation and support visibility.

Do not begin by making broad changes. First map the existing architecture, inspect the actual routes/components/database schemas/provider adapters/worker jobs, run baseline checks, and create a prioritized execution plan. Keep changes small, tested and reviewable.

## Mandatory execution protocol

For every defect:

1. Trace the user-facing action to its frontend handler, API route, service, DB transaction, worker/job, provider adapter and resulting state.
2. Record current behavior and evidence. Distinguish confirmed bugs from risks and assumptions.
3. Create a failing regression test before the fix whenever practical.
4. Implement the smallest robust change that addresses the root cause.
5. Add unit, API/integration, worker, and UI tests appropriate to the risk.
6. Run relevant tests and broader regression tests.
7. Review idempotency, race conditions, partial failures, stale data, retries, permissions and user messaging.
8. Update `docs/qa/DEFECT_REGISTER.md`, test matrix, and status/evidence.
9. Do not close as fixed until the test actually passes. Static review alone is not a verification result.

## Business invariants — must not be violated

- No duplicate active booking for a booking intent/order.
- No double wallet debit, refund, cancellation fee, RTO fee or COD ledger entry.
- Unknown provider outcome is not a definite failure. Reconcile before retrying.
- Queue accepted is not booked; booking confirmed is not label-ready; label-ready is not pickup-confirmed; pickup is not delivered.
- A seller-visible shipment status must be derived from persisted/provider-authoritative data, not optimistic UI assumptions.
- A courier/service is bookable only when required configuration, credentials, serviceability, rate, parcel and payment eligibility are satisfied.
- Quote, readiness, booking and batch assignment must share consistent business rules.
- Every bulk input row must have an outcome, even if invalid, duplicate, queued, paused, processing, failed or reconciliation-required.
- Partial success must be clearly represented and downloadable/recoverable.
- Provider calls and webhook processing must be idempotent or have replay protection.
- Seller tenant ownership must be enforced at every read/write/list/export/document/job endpoint.
- Secrets and raw provider credentials never appear in client payloads, logs or error text.
- Do not fake provider labels, status, serviceability, pickup or delivery.
- Preserve unknown provider statuses for investigation; never map unknown to delivered/failed without policy.

## Required workflow audits

### A. Order lifecycle and booking
Inspect create, edit, validation, import, duplicate/reference semantics, warehouse selection, quote, serviceability, courier configuration, manual booking, synchronous auto-assignment, queued bulk assignment, retries and order/shipment state transitions.

Must verify:
- Field-level validation for name, mobile, address, pincode, city/state, parcel weight/dimensions, payment mode, COD value, SKU/quantity.
- CSV/XLSX mapping, preview, malformed data, BOM, quotes, newlines, leading-zero identifiers, duplicates and row identity.
- Order create success followed by quote failure is recoverable without creating duplicate orders.
- Manual, automatic and bulk paths use the same eligibility and readiness checks.
- Provider booking is protected by DB idempotency and concurrency locks/constraints.
- Provider timeout/local persistence failure has durable reconciliation state and does not blind retry.
- Failover only occurs for safe, classified errors. Ambiguous provider outcome must reconcile first.
- Seller gets persistent per-order state, result, error code/message, safe retry eligibility and next action.

### B. Pickup and manifests
Inspect pickup scheduling, provider pickup requests, manifest generation, storage, status changes and cancellations.

Must verify:
- Provider-specific pickup capability is represented; distinguish provider request from internal/manual pickup record.
- Do not display pickup confirmed until confirmation is available.
- Storage availability is checked before queueing document jobs.
- Job failure is durable and actionable, with retry and correlation information.
- Manifest contains only the correct seller/provider/date/eligible shipment scope; duplicates and already-manifested shipments handled safely.

### C. Tracking
Inspect provider polling, webhook intake, authentication/signatures, replay handling, mapping, timestamps, stale-data detection and reconciliation.

Must verify:
- Provider webhook authenticity where supported, replay/idempotency, and tenant/provider reference validation.
- Event ordering, delayed events, duplicates, out-of-order events and unknown statuses.
- Preserve raw provider event safely for support/audit; sanitize secrets/PII.
- Display source/time and last update. Stale tracking has an explicit warning and refresh/reconciliation path.
- Do not allow a late event to regress terminal or more advanced state unless provider policy explicitly allows and an audit is recorded.

### D. NDR — Non-Delivery Report workflow
Treat NDR as a business workflow with provider-authoritative events and explicit seller/customer actions.

Inspect current provider capabilities and existing behavior before defining actions. Do not invent a supported carrier action where the adapter lacks it.

Required:
- NDR state includes provider event/reason, event timestamp, current attempt, deadline/next-action window where provider supplies it, and action history.
- Reason codes are normalized to categories (e.g. customer unavailable, address/phone issue, refused, access issue, other) while retaining the original provider code/text safely.
- Action options are capability- and reason-dependent: contact customer/update delivery instructions/address where provider supports it, request reattempt, or accept RTO. Do not show impossible actions.
- Before submission, confirm the affected shipment and requested action. Validate new phone/address and require a meaningful change when needed.
- Action request uses idempotency, records actor/time/request, sends through correct provider API, and does not show accepted until API confirms. “Request submitted” and “provider accepted” are distinct states.
- Provider refusal/timeout is actionable; timeout is unknown and reconciled before resubmission.
- Notify seller of NDR promptly; show due date/deadline only when source data exists; escalate overdue cases.
- Prevent duplicate reattempt/RTO requests and conflicting actions.
- Track outcome after action: action requested → provider accepted → reattempt in progress → delivery result / subsequent NDR / RTO.
- Seller can inspect history and export/filter NDR shipments.
- Test duplicate webhooks, duplicate clicks, action races, invalid contact changes, unsupported action, provider timeout, provider refusal, late delivery, second NDR and RTO transition.

### E. RTO — Return to Origin
RTO is a lifecycle, not a single boolean. Use carrier/provider-authoritative events and preserve transitions.

Required:
- Define and audit states based on actual provider contract: RTO initiated/accepted, pickup/return in transit, return delivery attempt, returned to origin/warehouse, exception/unknown. Use only statuses the provider supports; map unknown statuses safely.
- Distinguish **RTO initiated** from **RTO delivered back to origin**. Never mark returned-to-seller at initiation.
- Keep forward shipment and return leg references/status where provider exposes them.
- Track RTO reason and provider event chronology.
- Show relevant costs/charges only from authoritative provider data or clearly labeled estimates; avoid duplicate charge application.
- RTO state must not trigger a duplicate shipment booking or unintended wallet debit/refund.
- Seller/warehouse receipt confirmation may be a separate operational step if the provider status does not prove physical receipt.
- Notify seller on RTO initiation, major return milestones, exceptions, and final return status.
- Test event ordering, duplicate events, webhook/poll overlap, return delays, missing return AWB, provider status gaps, and delivered-to-origin semantics.

### F. Cancellation
Inspect cancellation for orders, shipment booking, pickup, manifests, NDR/RTO actions and any related financial operations. Define separate cancellation semantics; do not treat them as one generic cancel endpoint.

Required:
- Eligibility is based on persisted state and provider capability/cutoff, not frontend visibility alone.
- Clearly distinguish cancel order (not booked), cancel booking request, provider cancellation pending, provider cancellation accepted, cancellation rejected, and already handed-over/in-transit states.
- Confirmation modal identifies shipment/order, AWB, courier, consequence and possible fees/refund timing where known.
- Server validates and locks state to prevent cancellation/booking races.
- Provider cancellation uses correct endpoint and idempotency. API accepted/pending must not be represented as completed.
- Refund/charge reversal is linked to original ledger transaction and applied at most once after policy/provider confirmation. Unknown provider outcome must reconcile.
- Cancellation failure leaves the shipment in a truthful state and offers a safe next action.
- Test double click, concurrent booking/cancel, provider timeout, provider refusal, pickup already arranged, in-transit, delivered, already cancelled, and refund idempotency.

### G. Notifications and messages
Build a consistent notification/error contract rather than scattered toast text.

Notification channels currently supported must be inspected. Do not assume email/SMS/WhatsApp/in-app capabilities without checking configured providers. Where a channel is not configured, in-app notifications and persistent operation history remain the fallback.

Notification matrix must cover:
- Order created/imported/validation failed
- Quote unavailable/configuration missing
- Booking started/queued/paused/booked/failed/reconciliation required
- Wallet/aggregator funds issue and booking pause
- Pickup request/confirmation/failure
- Label/manifest/document ready/failure
- Tracking stale/exception
- NDR created/action deadline/action submission result
- Reattempt accepted/result
- RTO initiated/milestones/returned/exception
- Cancellation requested/accepted/rejected/completed/refund status
- Bulk job progress, partial completion, final result
- Worker/queue degradation affecting seller operation

Message contract:
- Title: concise status.
- Body: human-readable reason, no internal stack trace.
- State: current persisted status.
- Impact: what is blocked or incomplete.
- Action: clear next step, safe retry or contact support.
- Reference: order ID/AWB/job ID/request ID as appropriate.
- Timestamp and source.
- Severity/priority.
- Deduplicate repeated events and support notification preferences; critical operational notifications must not be silently suppressed.
- Notifications must be created from durable events/state changes, not merely a frontend optimistic callback.
- Failures to send a secondary notification channel must not roll back a successful shipment action; record and retry notification delivery separately.

### H. API correctness and resilience
For every endpoint used by the frontend:
- Verify endpoint, request schema, response schema, auth, seller scoping, pagination, sorting, filtering, and errors.
- Validate payloads at API boundaries.
- Avoid frontend state being treated as authoritative.
- Distinguish 4xx validation/configuration/business errors, 429 throttling, 5xx, network errors, timeout/unknown outcomes.
- Use request correlation IDs and durable operation IDs.
- Retry only safe/idempotent requests. Use bounded exponential backoff and jitter for transient failures; do not retry permanent validation errors.
- Respect provider rate limits and Retry-After where applicable.
- Add circuit breaker/health/degraded state where repeated failures can cause cascading outages; fallback must never claim success or create a duplicate.
- Cache only data with a clear TTL/invalidation contract; do not use stale cache for cancellation/booking/payment decisions.
- If a provider is down, disable/mark affected action and show a safe fallback (other verified courier, saved order, retry later, support).
- Never hide a partial result.

### I. UX and accessibility
For each screen, review loading, empty, success, partial success, validation, API error, offline, timeout/unknown, permission, stale data, retry and destructive confirmation states.

- Persistent inline/row error for important operations; toast supplements, never replaces.
- Button loading and duplicate-submit protection.
- Clear disabled reason.
- Field-level errors and focus/scroll to first invalid field.
- Preserve user input after network failure.
- Use status labels and accessible keyboard/focus behavior.
- Responsive seller operations on supported viewport sizes.
- Avoid modal traps; accessible confirmation and close behavior.
- Bulk results downloadable and available after refresh.
- Avoid confusing “success” for queued, accepted, completed, provider-confirmed or reconciled states.

### J. Security and operations
- Tenant isolation on every route, object, document, export, job and provider event.
- Role/permission enforcement server-side.
- Secrets validation and rotation guidance.
- Redacted structured logs, correlation IDs, metrics, error reporting.
- Worker heartbeat, queue age, retry count, dead-letter and stale job monitoring.
- Database constraints and transaction boundaries for financial/booking integrity.
- Migration/backup/rollback and deployment health checks.
- No sensitive PII or credential leakage in notification text/logs.
- Audit trail for admin, provider, cancellation, NDR/RTO, financial and retry actions.

## Required test strategy

Add/run tests at all levels:
- Unit tests for state transitions, business rules, mapping, pricing and eligibility.
- API contract/authorization tests.
- DB integration tests for idempotency, uniqueness, transaction rollback and races.
- Worker tests for retry, lease/restart, pause, stale jobs and dead letters.
- Provider adapter contract tests with realistic success, refusal, malformed response, timeout, rate-limit and unknown status.
- E2E critical seller journey and negative/partial-failure journeys.
- Two-tenant security tests.
- Bulk boundary tests (1, 49, 50, 51, 100+, 5,000 and beyond limits).
- Regression tests for every defect fixed.

## Workflow acceptance criteria

A seller can:
1. Create/import an order and know if it is saved.
2. See actionable readiness blockers and fix them.
3. See quote/serviceability provenance and correct bookability.
4. Book once, without duplicates, with truthful provider/AWB state.
5. Know whether assignment is queued, paused, processing, booked, failed or needs reconciliation.
6. Download correct carrier documents or understand why unavailable.
7. Request pickup and see the actual confirmation state.
8. Track shipment and receive actionable stale/exception notifications.
9. Respond to NDR with supported actions and know provider submission/result.
10. See RTO initiation and return milestones separately from return receipt.
11. Cancel only when permitted, see provider result and refund/fee state truthfully.
12. Recover from network/provider/worker failures without losing input or duplicating operations.
13. Review and export complete operation history and results.
14. Never see another seller’s data.

## Time and release policy

Prioritize P0 financial, booking, data isolation, false-success and data-loss defects first, then core P1 workflow failures. In two days, prefer a safe limited release with unverified providers/features disabled over claiming full production readiness.

If the environment or credentials prevent verification, report BLOCKED and the exact evidence needed. Do not fabricate test results or live API confirmation.

## Final Claude Code report must include

- Branch and exact commit(s).
- Baseline checks/results.
- Defect IDs fixed, with root cause and file/line references.
- Tests added and exact test commands/results.
- Tests not run and why.
- Provider verification status per enabled provider.
- Migration/deployment/rollback notes.
- Known risks, disabled features and limitations.
- Release recommendation: GO / LIMITED GO / NO-GO.
