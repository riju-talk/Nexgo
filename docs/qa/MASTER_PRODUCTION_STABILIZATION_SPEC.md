# NEXGO — Master Production Stabilization & Quality Specification

**Specification version:** 1.0  
**Date:** 2026-11-25  
**Repository:** `riju-talk/Nexgo`  
**Implementation owner:** Claude Code  
**QA authority:** This document is the unified execution specification. The defect register and test matrix remain supporting evidence/artifacts.  
**Target:** Production-grade seller shipping operations, with a time-boxed 48-hour stabilization target.  
**Important:** “No errors” cannot be guaranteed by inspection or by a deadline. The release target is zero known release-blocking defects, verified critical journeys, robust recovery, honest feature availability, and explicit residual risks. Do not mark a feature verified without evidence.

---

# 0. Instructions to implementation agent

Claude Code: execute this specification against the actual current repository. Do not rely only on previous audit summaries. Start from current branch and HEAD; read repository instructions (`AGENTS.md`, `CLAUDE.md`), existing QA docs, package scripts, schema/migrations, API routes, frontend route map, service layer, provider adapters, workers, job queues, notifications, and tests. Build a traceable map of the running architecture before changing code.

## Mandatory work protocol

For each work item:
1. **Trace:** User control → component/state → API client → route/schema/auth → service/business rule → DB transaction/constraint → queue/worker → provider adapter/API → response/webhook/poll → UI state/notification.
2. **Evidence:** State file/line/endpoint, observed behavior, impact, severity, confidence. Separate confirmed defects from risks.
3. **Reproduce:** Write or execute a test demonstrating the defect. For non-reproducible cases, document exact missing prerequisite.
4. **Fix root cause:** Prefer minimal, coherent changes. Avoid broad rewrites, speculative architecture, or unrequested features.
5. **Verify:** Unit, route/API, DB integration, worker, provider-contract, UI/E2E tests as risk requires. Run exact commands and record results.
6. **Regression:** Test related workflows, state transitions, retries, concurrency, tenant isolation, stale data and partial failures.
7. **Document:** Update defect ID, status, evidence, files, test command/result, residual risk and release impact.
8. **Review:** Inspect diff for correctness, security, migrations, accidental API changes, UX and compatibility. Run build/typecheck/lint/test suites relevant to the changed area.
9. **Close:** A defect may be “Fixed” after code change; it is “Verified” only after the test is executed and passes. “Blocked” and “Not tested” must remain visible.

Do not do the following:
- Do not claim “all bugs fixed” or “production-ready” without release evidence.
- Do not suppress errors, loosen validation, or silently downgrade failed checks.
- Do not create fake carrier success, fake serviceability, fake labels, fake pickup confirmation, fake tracking or fake refunds.
- Do not blindly retry ambiguous booking, cancellation, NDR action, refund, wallet debit or pickup requests.
- Do not hide partial success, truncation, queued, paused, stale, pending, unknown or failed outcomes.
- Do not introduce incompatible migrations without migration/rollback plans and tests.
- Do not refactor large areas just to make code look cleaner if a focused fix is safer.
- Do not expose credentials, raw PII, stack traces, internal SQL or provider secrets in seller-facing errors.
- Do not enable provider/features lacking verified configuration/capability.
- Deadline does not justify skipping tests or unsafe release.

---

# 1. Product objective and definition

NEXGO is a multi-tenant courier/shipping operations platform for Indian merchants. The seller-facing product must provide dependable order intake, courier comparison, booking, shipment documents, pickup, tracking, delivery exceptions, NDR/RTO actions, cancellation, financial reconciliation and operational visibility. The admin/operations product must safely manage seller accounts, KYC/configuration, couriers, rate cards, COD/wallet, jobs, audit and support.

The standard is operational correctness and professional UX comparable to established shipping platforms. Do not copy competitor interface or branding. Meet familiar expectations: clear shipment states, accurate carrier details, transparent pricing/eligibility, complete histories, predictable actions, fast feedback, safe retries and human-readable recovery.

## Release outcome

A release candidate is acceptable only when:
- P0 and P1 release-blocking defects are closed and verified, or impacted functionality is explicitly disabled/limited with a safe alternative.
- Critical user journeys pass in automated tests and a controlled manual run.
- Booking/financial/idempotency invariants are demonstrated.
- Enabled provider capabilities are verified to the available level (contract tests, sandbox, live controlled transaction). The verification level is explicit per carrier.
- Security/tenant tests pass.
- Build, migration, deployment, health, rollback and monitoring gates pass.
- There are no known data-loss, false-success, duplicate financial/booking, cross-tenant or critical stuck-state defects.
- Remaining P2/P3 items are documented, accepted by an accountable owner and do not undermine core reliability.

# 2. Architecture and inventory — mandatory before implementation

Create/update an architecture map with:
- Frontend routes/page IDs and actual live components.
- API client conventions, auth/session/CSRF, validation and error normalization.
- Backend routes and schema validators.
- Domain services and state-transition owners.
- Database tables, constraints, indexes, migrations and transaction boundaries.
- Queue/job types, enqueue endpoints, worker processes, leases/locks, retry policy and dead-letter path.
- Provider adapters, capabilities, credential/configuration source, serviceability/quote/booking/pickup/cancel/NDR/tracking/document endpoints.
- Webhooks, signature/authentication, replay protection and polling/reconciliation.
- Notifications (in-app, email, SMS/WhatsApp if actually configured), preferences, delivery jobs and fallback.
- Storage and document lifecycle.
- Admin-only routes and permissions.
- Monitoring, logs, metrics, health endpoints and CI workflows.

For each subsystem, document authoritative data source, fallback, consistency expectation, owner, failure mode and test coverage. Identify duplicated business rules and consolidate them where safe. Never assume route/component names or provider capabilities: verify current code and contract.

# 3. Global business and technical invariants

These are always true regardless of workflow:

## 3.1 Truthful state
- Persisted state and carrier-authoritative events govern user-visible outcomes.
- “Request accepted”, “queued”, “processing”, “provider accepted”, “booked”, “AWB assigned”, “pickup confirmed”, “in transit”, “delivered”, “cancelled”, “RTO initiated” and “returned to origin” are distinct concepts.
- UI may not promote a state based only on optimistic response or HTTP 200 if the response means accepted/queued.
- Unknown provider statuses are preserved, displayed as “Status needs review/unknown” with timestamp/source, and do not map to success.
- Every state-changing action has actor, timestamp, correlation ID and relevant external reference.

## 3.2 Idempotency and financial integrity
- Use stable operation/idempotency keys for order create (where appropriate), booking intent, assignment, provider API calls, webhook events, cancellation, NDR actions, pickup and ledger operations.
- Enforce uniqueness/locking at DB level for concurrent requests; client disable/loading alone is not protection.
- Duplicate requests return the existing operation/result when safe, not a second booking/debit.
- Ambiguous external outcome enters `reconciliation_required`; reconcile provider by stable external reference before retry.
- Wallet, COD, charge, fee, debit, refund and adjustment are append-only ledger operations or equivalent immutable records with transaction references. Reversals link to original entry; apply at most once.
- Avoid external side effect inside a transaction that may roll back unless an outbox/saga/reconciliation design handles it.
- Ensure DB transaction and job enqueue semantics do not lose jobs. Use transactional outbox or equivalent proven consistency strategy where needed.
- Never silently mark a financial/shipping action complete when external confirmation or required local persistence is missing.

## 3.3 Tenant and authorization
- Tenant/seller scope is derived from authenticated server context, not trusted client IDs.
- Enforce tenant access in every detail, list, mutation, bulk, export, document, notification, webhook association, job and report path.
- Admin privileges are server-verified and least-privilege.
- Prevent IDOR/BOLA by testing guessed order/shipment/document/job IDs from another tenant.
- Redact secrets and minimize PII in logs/notifications.

## 3.4 Shared validation
Create or use one authoritative readiness/eligibility pipeline for create/import, quote, manual book, synchronous auto-assign, queued assign, bulk assign and retry. Avoid inconsistent validations across entry paths.

Validation should be explicit and field-level, including as applicable:
- Customer name and supported length/characters.
- Phone format and country assumptions; normalized phone.
- Address lines, landmark, city, state, postal code/pincode, valid destination/source.
- Origin warehouse/pickup address and configured pickup location.
- Parcel weight units, positive finite values, max limits.
- Dimensions and units, positive finite values, volumetric weight rules, incomplete dimension handling.
- Payment mode/prepaid/COD, COD amount and currency, COD capability, COD amount constraints.
- Product/SKU/item quantity/declared value/description limits.
- Duplicate external order IDs and idempotent behavior.
- Serviceability, active/suspended/unknown postal codes, ODA, lane, zone, rate, courier limits and provider capability.
- Credential/configuration readiness, provider health, seller wallet/debit limit and account state.
- Business-specific restrictions and blocked lists.

Every validation error must contain a stable code, field (when relevant), understandable explanation and resolution. Unknown pin/serviceability must not be optimistic “serviceable” unless documented policy allows and UI labels the assumption.

# 4. Order creation and import

## 4.1 Single order
- Preserve entered values on validation/API/network/provider failure.
- Clearly distinguish order saved from quote loaded from booking complete.
- If order creation succeeds but quote fails, show the saved order reference, quote unavailable reason, retry quote action, and link to resume. Quote retry must not create another order.
- Prevent double-submit at UI and API/domain levels.
- Display loading/progress and disable duplicate action while request is active.
- If request times out, check/reconcile using request idempotency key before inviting a retry.
- Field-level errors focus the first invalid input; all invalid fields remain visible.
- Use appropriate accessibility labels, keyboard navigation, and mobile layout.

## 4.2 Bulk CSV/XLSX
- Validate file type, size, encoding, sheet selection, header mapping and row count before submission.
- Parse quotes, embedded commas, newlines, escaped quotes, UTF-8 BOM, Unicode, leading-zero IDs and malformed rows robustly.
- Show preview, mapped columns, row numbers and validation issues before creation.
- Keep source row identity stable across chunking, concurrency, retries and result merging.
- No row disappears. Each source row receives a final/known status: invalid, duplicate, create_failed, created_unassigned, queued, paused, processing, booked, assignment_failed, reconciliation_required or another documented terminal state.
- Report total, valid, invalid, created, queued, booked, failed, duplicate, unresolved and truncated counts; counts must add up to the input population and explain exclusions.
- Chunking/concurrency are bounded and configurable safely. Tests cover chunk boundaries and race/error cases.
- Partial request failure does not discard already-created order IDs/results.
- Resume/retry only failed or safely retryable rows; do not recreate already-persisted orders or duplicate provider bookings.
- Bulk results persist on server and survive navigation, reload, session refresh and worker restart.
- Downloadable result CSV preserves original row data as appropriate and appends stable status, reference, error code, message and next action; sanitize CSV formula injection.
- Limits are clearly shown before submit. If a limit is exceeded, explicitly identify unprocessed rows and provide a split/continue workflow if safe.

## 4.3 Order edit and duplicate semantics
- Identify which fields are editable before booking, after booking, after pickup, in transit and terminal.
- Editing a booked shipment must not silently mutate carrier booking details. Use provider-supported amendment or require cancel/rebook with consequences.
- External order reference and idempotency semantics are documented and tested.
- Duplicate import must show existing match vs conflict, never silently treat arbitrary unique conflict as successful idempotency.

# 5. Quote, serviceability, courier selection and pricing

- Quote data must come from intended API/domain source, not stale UI cache or hardcoded assumptions.
- Quote request includes normalized parcel/address/payment data and identifies source, time, applicable seller rate card and limitations.
- Quote result contains courier/service name, estimated delivery (only if sourced), charge breakdown/total, COD, ODA, volumetric/actual weight basis where applicable, and serviceability reason.
- Pricing uses integer minor units or exact decimal strategy; no binary float money errors. Document rounding rules and GST/fee components.
- Quote and booking use same readiness, postal code normalization, zone/lane, weight calculation, rate card version and COD/ODA eligibility. Revalidate booking against current conditions.
- Distinguish: not configured, credential invalid, provider unavailable, lane not serviceable, rate missing, suspended pin, ODA unsupported, COD unsupported, wallet/debit limit, booking paused, provider refusal and unknown.
- Never show an unconfigured or unverified courier as bookable. If a verified alternative exists, present it with truthful price/capability; otherwise save order and provide next step.
- Quote cache must have explicit TTL and invalidation; never use stale cached quote for booking without revalidation.
- Provider health should be reflected, but health check success is not proof of serviceability or booking success.

# 6. Booking, auto-assignment, failover and reconciliation

## 6.1 State model
Define and validate an explicit booking/assignment lifecycle, for example:
`not_ready → ready → assignment_queued → assigning → booked`
with branches `assignment_paused`, `assignment_failed`, `provider_refused`, `booking_unknown/reconciliation_required`, and terminal or subsequent shipment states. Adapt names to current schema and compatibility constraints; do not invent parallel statuses without migration plan.

## 6.2 Booking boundary
- Validate seller/order ownership, readiness, parcel, payment, rate, serviceability, courier capabilities/configuration, wallet/debit policy and current state.
- Acquire idempotency/lock and create durable booking intent before external call.
- Persist provider request correlation/reference and attempt metadata.
- External response parsing is schema-validated; malformed response is not success.
- AWB/tracking number, courier, provider IDs and label references must be persisted atomically with local shipment state as far as possible.
- Provider success followed by local DB failure must enter reconciliation; do not rebook.
- Timeout/connection reset is outcome-unknown until reconciliation.
- Failover is allowed only when first provider outcome is definitively safe to retry and policy supports failover. Never failover after possible booking without reconciliation.
- Classify provider errors; permanent business refusals are not retry-looped. Rate limits respect Retry-After. Transient retry uses bounded exponential backoff + jitter and attempt cap.
- Booking pause/refusal state update must be synchronous enough to prevent parallel attempts, shared across API and worker instances and durable; avoid fire-and-forget state mutation races.
- Seller receives a per-order result and stable batch/operation ID. Queue accepted is not booking success.
- Batch result API must expose totals and per-order states; paused/queued items remain visible and recoverable.
- Resume and worker restart are safe and idempotent.

## 6.3 Courier failover
- Maintain a verified capability matrix by provider/service (quote, book, cancel, pickup, label, manifest, tracking, NDR action, RTO, COD, webhook).
- Failover only on classified errors and policy-safe outcomes. Preserve first attempt detail and selected final carrier.
- Avoid sending an order to two carriers because first provider response was ambiguous.
- Provider wallet/account refusal pauses provider appropriately; no unrelated seller wallet logic should trigger provider-wide pause.
- Admin can see provider health, pause reason, last successful operation, config completeness and verification level without revealing secret values.

## 6.4 Reconciliation
Provide scheduled/on-demand reconciliation for:
- booking intents with unknown provider outcomes;
- provider-created orders without local shipment/AWB;
- local booked shipments missing provider references/documents;
- duplicate provider external refs/AWBs;
- wallet/ledger debit vs provider charge;
- cancellations pending/unknown;
- pickup requests pending/unknown;
- NDR action pending/unknown;
- return tracking inconsistencies;
- webhook/poll mismatches.
Reconciliation must be idempotent, audit its decisions and avoid automatic destructive corrections. Manual review queue should show source, references, mismatch, safe actions and history.

# 7. Pickup, manifests, labels and documents

## 7.1 Pickup
- Validate eligible shipment(s), pickup address, provider capability, date/time window where provider supports it.
- Distinguish pickup requested, provider accepted, pickup scheduled/confirmed, pickup attempted, picked up, exception and cancelled.
- Do not show confirmed when only request accepted or local job queued.
- Prevent duplicate pickup requests and conflicting cancellation/manifest actions.
- Record provider reference, request/result, time and actor. Timeout becomes reconciliation state.
- Support bulk pickup with explicit per-shipment outcome and partial results.

## 7.2 Labels
- Use genuine carrier label documents when the carrier API supplies them. Do not present a generic NEXGO label as carrier label or operational barcode.
- If only internal placeholder label is possible, mark clearly as internal/non-carrier and do not claim carrier acceptance; disable unsupported workflow or require operational override.
- Verify barcode/AWB correctness, address formatting, parcel/payment information, dimensions, printer scaling and label page sizes.
- Document retrieval is scoped and authorized; protect signed URLs and storage.
- Document generation/download jobs have durable status, retries, expiry and failure reason.
- Popup blocking, localStorage/session storage failure, browser download restrictions and large selections must have reliable alternative path and message.

## 7.3 Manifest
- Verify manifest scope (seller/provider/pickup date/eligible shipments), provider capability and state transitions.
- Manifest generation is idempotent or explicitly creates versioned manifests.
- Storage availability is checked before queueing where required; a queued job must not be guaranteed to fail from known unavailable storage.
- Manifest errors are persistent and actionable; generated documents include correct shipments and references.

# 8. Tracking, webhook and event processing

- Use provider-authoritative API/webhook/poll data and retain source and timestamps.
- Verify webhook signature/secret or provider authentication, provider identity, AWB/reference match, seller association, replay/idempotency and rate limits. If signature cannot be verified, do not trust event.
- Event ingestion is durable before acknowledgment where required.
- Duplicate events are harmless; out-of-order events are handled by chronology and provider policy.
- Normalize statuses while retaining original raw status/code and safely stored event payload.
- Never map unknown status to delivered, cancelled, RTO complete or other success.
- Status transition policy prevents accidental regression; permitted corrections must be audited.
- Display last carrier update, last sync, data source and stale/degraded badge.
- Polling has bounded concurrency, rate limits, backoff and jitter; avoid N+1 storms.
- Manual refresh is throttled and does not block page; support safe reconcile.
- If API is unavailable, show last known state and age, explicit stale warning and retry timestamp/action.
- Tracking timeline includes event time, received time, source, location (if valid) and reason. Normalize timezone; display local time consistently.
- Shipment list/detail and report use consistent state mapping.

# 9. NDR — Non-Delivery Report management

NDR is a controlled workflow. Inspect actual provider API contracts/capabilities and support only actions verified for the relevant carrier.

## 9.1 Data/state
Capture: shipment/AWB, provider, NDR event/source, original reason code/text, normalized reason category, event time, attempt number (if supplied), action window/deadline (only if provider supplies), current NDR state, action history, provider action reference and result.

Suggested state distinctions: `ndr_detected`, `action_required`, `action_submitted`, `provider_accepted`, `action_rejected`, `reattempt_in_progress`, `resolved_delivered`, `another_ndr`, `rto_initiated`, `action_unknown/reconciliation_required`. Align to existing schema; plan migration if necessary.

## 9.2 UX and supported actions
- Notify seller promptly and persist notification.
- Group/filter NDR by actionable, due, overdue, provider, reason and status.
- Explain the original reason and data source. Do not invent deadline or action.
- Show only provider-supported actions for shipment's current state and reason: reattempt, contact/address/instruction update, customer contact, or RTO initiation as applicable. If not supported through API, clearly explain the manual route or disable action.
- Validate changed phone/address and meaningful changes; keep previous values in audit history.
- Confirmation displays shipment/AWB, action, changed data, consequence and whether provider request is immediate.
- Request submission, provider acceptance and outcome are separate states. No optimistic success.
- Actions are idempotent; prevent duplicate clicks and conflicting actions.
- Timeout/refusal is shown with safe retry eligibility. Reconcile ambiguous provider result before retry.
- Track subsequent delivery attempt, new NDR, RTO and final outcome.
- Preserve action history with actor, time, request/response safe fields and provider reference.
- Provide bulk actions only if API and business semantics support safe per-row results. Partial result is explicit.

## 9.3 NDR acceptance tests
- New NDR from webhook and poll, duplicate event, invalid signature, unknown reason, late event, out-of-order event.
- Supported action success/refusal, unsupported action, validation error, timeout unknown, duplicate action click, concurrent conflicting actions.
- Action window absent/past/near deadline; do not invent deadline.
- Reattempt delivered, another NDR, RTO initiated.
- Seller notification creation/delivery failure and retry.
- Tenant isolation and action authorization.

# 10. RTO — Return to Origin

RTO must be represented as a return lifecycle; do not use a single boolean as a substitute.

- Distinguish RTO decision/initiated, provider acceptance, return in-transit, return attempt, exception, return delivered to origin, and seller/warehouse receipt if separate.
- Use actual provider event/capability; preserve unknown events.
- Keep forward AWB and return-leg AWB/reference where available. Do not invent a return AWB.
- Capture provider reason and event chronology. Display source, timestamp, last sync and stale state.
- RTO initiated is not return delivered; return delivered is not seller physically reconciled if the operational process requires receipt scan.
- Do not automatically create a new forward shipment or apply duplicate charge/refund on RTO event.
- Fees/costs are authoritative only when confirmed; estimated cost is labeled estimate.
- Notify on initiation, return movement milestones, exception and completion; notification delivery failure is separate from shipment state.
- Provide RTO filter/history and reconciliation path.
- Ensure late forward-delivery event vs RTO events are handled by provider-specific transition rules and audited.

## RTO acceptance tests
Initiation, acceptance, return AWB present/missing, return in transit, delayed return, return exception, return attempted, return delivered, seller receipt separate, duplicates, out-of-order forward and return events, polling/webhook overlap, provider outage, unknown status, charge reconciliation, tenant isolation and notification failures.

# 11. Cancellation

Cancellation semantics must be specific to the entity and lifecycle. Do not use one generic cancellation behavior for order, shipment booking, pickup, manifest, NDR action, return or payment.

- Validate cancellation eligibility against current persisted state, provider capability, pickup/handover/transit cutoff and business policy on server.
- Lock against concurrent booking, pickup, cancellation, NDR/RTO action and state update.
- Confirmation explains what will be cancelled, courier/AWB, current state, potential charges, refund implications and expected timing only when supported.
- Distinguish cancel requested, pending provider, accepted, rejected, completed and unknown.
- API response accepted does not equal completed. Unknown outcome reconciles before retry.
- Preserve order; shipment cancellation may leave the order available for rebooking only under explicit policy and after definitive outcome.
- Rebooking must not duplicate booking or ledger operation.
- Refund/fee reversals are linked to original transaction, applied once, and reconciled against provider/account.
- Late carrier events after cancellation are handled and audited, not silently overwritten.
- Provide persistent history and actionable failure state.

## Cancellation acceptance tests
Before booking, booked before pickup, pickup requested, pickup confirmed, manifest created, handed over, in-transit, delivered, RTO, already cancelled, provider refusal, timeout unknown, double-click, concurrent booking/cancel, duplicate webhook, cancellation late events, fee/refund ledger once, tenant isolation.

# 12. Wallet, COD, charges, billing and reconciliation

- Use exact monetary representation and documented rounding/tax rules.
- Ledger entries are immutable and reference order/shipment/provider transaction and original entry for reversal.
- Wallet balance is derived or reconciled consistently; concurrent debit checks are atomic.
- Debit limit, seller balance, aggregator wallet and provider refusal are distinct conditions.
- No double debit on retry, queue retry, provider timeout, worker restart or duplicate webhook.
- COD expected, remitted, received, pending, disputed and reconciled are distinct; do not mark remitted based only on delivered status.
- Reconciliation shows differences and source, permits authorized adjustment with reason/audit, never silently overwrites ledger.
- Charges, estimated fees and final provider charges are differentiated.
- Seller-visible financial errors include amount/currency, transaction reference and safe action. Do not leak other seller or aggregator credentials.
- Test concurrent debits, booking/refund/cancel races, duplicate provider settlement, negative balance policy, COD mismatch, charge discrepancy and exports.

# 13. Notifications, messaging and operation history

Implement a central message/error contract. Toasts are supplementary; critical operations must have persistent inline/row/job state and operation history.

## 13.1 Notification record
Where feasible, persist: ID, tenant, user/role recipient, category, severity, title, message, operation/entity reference, state, source, created/updated time, read/unread, action/deep link, channel, delivery state, attempt count, next retry, last failure safe code, correlation ID, dedupe key.

## 13.2 Message format
Each user-facing message should answer:
1. What happened?
2. What is the current state?
3. What is affected?
4. Why (safe, understandable reason)?
5. What should the user do next?
6. Can the user safely retry? If not, why?
7. What reference can support use?

Use short plain language; avoid internal code/stack traces. Stable error code may be available under details/support copy. Field errors belong next to fields. Long-running operations have status/progress. Destructive/financial actions require clear confirmation.

## 13.3 Notification matrix
Cover:
- Order created, validation blocked, import partial/complete.
- Quotes unavailable, no service, rate/configuration missing.
- Booking queued, started, paused, booked, failed, unknown/reconciliation.
- Provider degraded, account/wallet refusal, recovery/resume.
- Pickup requested/confirmed/failed/unknown.
- Label/manifest/document ready, failed, retrying.
- Tracking update, stale tracking, exception.
- NDR detected, reason, action deadline (source-provided), action submitted/accepted/rejected, reattempt result, another NDR.
- RTO initiated, movement, exception, returned to origin.
- Cancellation requested/accepted/rejected/completed, refund pending/complete/failed/reconciliation.
- Wallet/COD and reconciliation discrepancies.
- Bulk operation progress and partial result.
- Worker/queue degradation impacting seller operations.

## 13.4 Channel policy and fallback
Inspect currently configured channels. Never claim SMS/WhatsApp/email integration is available unless actually configured and verified. In-app notification and durable operation history are minimum fallback. Notification sending is its own job; failure does not roll back booking/action, but delivery state retries with bounded policy and deduplication. Critical events must remain visible if channel delivery fails. Preferences must not suppress essential security/financial/operational notices contrary to policy.

## 13.5 Notification QA
Test duplicate events, dedupe, preferences, user permissions, deep links, channel failure, retry/backoff, provider outage, notification worker restart, unread/read persistence, pagination, tenant scope, escaping/sanitization and mobile/accessibility.

# 14. API contract, network resilience and fallback

Audit all frontend-consumed endpoints. Maintain or create a contract table: route/method, auth, tenant, schema, success response, errors, pagination, idempotency, rate limits, retry safety, source of truth, test.

## 14.1 Response and error shape
Standardize success/error envelopes without breaking existing clients unnecessarily. Use stable machine code, safe message, field errors, operation/request ID, retryability, retry-after where relevant, current state, partial results and next action. Avoid inconsistent response formats and raw errors.

## 14.2 Error classes
- Validation/business-rule (4xx): do not auto-retry; show field/action.
- Auth/session/permission: safe re-auth or access explanation; preserve draft.
- Not found/wrong tenant: generic non-disclosing message.
- Rate limit: honor retry-after; throttle UI.
- Network/offline: preserve input; show offline/connection state.
- Timeout: operation-specific. Read-only may retry; side effect is unknown and reconciled.
- Provider 5xx/unavailable: bounded retry only if safe; circuit breaker/degraded provider state.
- Internal 5xx: correlation ID, safe error, support diagnostics.
- Storage/worker unavailable: operation status and safe fallback; do not queue knowingly doomed work.

## 14.3 Retry rules
- Bounded retries, exponential backoff + jitter, attempt cap and time budget.
- Respect Retry-After and provider rate limits.
- Retry only idempotent or proven safe requests.
- No retry for invalid data, permission, permanent business refusal.
- No blind retry for booking, cancellation, refund, pickup, NDR action, COD remittance or ambiguous outcome.
- Retry jobs have durable attempt history, dedupe, timeout, lease, restart behavior and dead-letter/manual recovery.

## 14.4 Fallback principles
Fallback preserves correctness and user control:
- Provider unavailable → only verified alternate provider, or save order and retry later.
- Quotes fail → preserve order; retry quote.
- Booking uncertain → reconcile; no blind duplicate.
- Worker down → show queued/stalled and health; provide safe resume/recovery.
- Tracking unavailable → last known status + age/source + retry.
- Label unavailable → booked shipment with separate document failure; retry or supported alternative, never fake carrier label.
- Storage unavailable → fail fast or explicit pending state, no false download.
- Notification provider unavailable → durable in-app history, retry channel.
- Pagination/API partial → clearly disclose incomplete data; use cursor/load-more or safe query continuation.
- Export capped → show scope, count, truncation and continuation.
- Session expired → preserve draft, safely refresh/re-auth, reconcile side effect first.
- Offline → preserve local form/import and warn before any action requiring connectivity.
- No fallback should silently change price, courier, shipment details, or state.

# 15. Frontend UX quality specification

For every page/form/action/table/job, review all states:
- Initial/loading/skeleton.
- Empty/no data.
- Success.
- Partial success.
- Validation errors.
- Permission/access errors.
- Offline.
- Timeout/unknown.
- Provider unavailable/degraded.
- Stale data.
- Queued/processing/paused/stalled.
- Failed/retryable.
- Failed/non-retryable.
- Reconciliation/manual review.
- Destructive confirmation.
- Long-running progress and completion.

## Interaction standards
- Loading state and duplicate-submit prevention.
- Clear button labels and disabled reason.
- Preserve user inputs/drafts after error or navigation where safe.
- Field-level validation and focus first invalid field.
- Inline/persistent errors for critical actions; toast does not replace them.
- No unhandled promise rejection or silent catch.
- Status labels reflect server states exactly enough to be truthful.
- Empty state explains how to get started, not just “No data”.
- Tables support sensible filtering/sorting/pagination and retain query state.
- Bulk selection counts reflect actual selected items and disclose limits/truncation.
- Long tasks have operation ID, progress where available, and can be revisited.
- Confirmation is required for irreversible/destructive/financial actions and includes consequences.
- Accessible keyboard/focus/contrast/screen-reader labels; no modal traps.
- Responsive behavior for supported mobile/tablet/desktop widths.
- Avoid unexplained internal terms; message hierarchy: title, explanation, next action, details/support reference.
- Avoid visual inconsistency; use shared status, error, loading, empty, notification and confirmation components where feasible.

## UX acceptance
A seller can always answer: “What is the current state? Is it complete? What failed? Is retry safe? What do I do? Where can I see the result?” If not, the UX is not complete.

# 16. Data integrity, pagination, downloads, reports and bulk operations

- Use stable pagination (cursor where appropriate) and deterministic sort tie-breakers. Deep history must be accessible; page totals must not advertise unreachable pages.
- Avoid offset pagination instability under updates. Test page navigation while records change.
- Filter/query validation and tenant scope on server.
- List/detail state mappings must match.
- Bulk select-all must clarify whether selection is current page, filtered result, or all matching; support server-side selection or transparently cap and explain.
- Bulk assign/cancel/print/export must return per-record outcomes and totals. Partial success is first-class.
- Documents/downloads must authorize each entity; IDs cannot cross tenants.
- Export completeness: counts, filters, generated time, source, truncation and continuation. Never silently export a subset.
- CSV formula injection defense; encoding/BOM/Unicode; correct delimiter/quote/newline handling.
- PDF labels/manifests verified against required content, page size, orientation, barcode quality and print behavior.
- Popup blocking, browser storage unavailable, file download restrictions and large selections tested with alternatives.
- Reports are not used as financial source-of-truth unless defined; reconcile totals to source queries.

# 17. Security, privacy and abuse

Run focused threat review and tests:
- Tenant isolation/BOLA/IDOR for orders, shipments, documents, jobs, reports, notifications, NDR/RTO/cancel and admin.
- Role escalation and admin endpoints.
- CSRF/session refresh/auth expiry.
- Webhook signature, replay, secret rotation and provider identity.
- Rate limits and abuse protection on expensive endpoints/actions.
- SQL injection/query parameterization; safe file parsing and path handling.
- XSS/HTML injection in customer names/address/provider messages/notification content.
- CSV formula injection, SSRF and unsafe URL handling where applicable.
- Secrets in logs, error responses, frontend bundle, source maps and configuration.
- PII minimization, retention, access audit and safe support exports.
- Secure file upload validation, size limits, malware/unsafe content policy where relevant.
- Dependency vulnerability and lockfile review.
- Security tests must prove access denied for another seller, not merely test the happy path.

# 18. Observability, support and operational readiness

- Structured logs include timestamp, environment, request/operation/job/correlation ID, tenant ID (non-sensitive), component, provider, attempt, state and safe error code.
- Do not log secrets, full address/phone, raw credentials or sensitive payload by default.
- Metrics: API latency/error rate, provider latency/failure/rate limits, booking success/refusal/unknown, queue depth/age, retries/dead letters, worker heartbeat, document jobs, webhook lag, tracking freshness, notification delivery, reconciliation backlog, wallet/COD discrepancy.
- Alerts actionable and thresholded; avoid alert storms.
- Health endpoints distinguish process liveness from readiness (DB, queue, worker, storage, required provider configuration).
- Admin status exposes configuration readiness and health without secret disclosure.
- Support diagnostics include operation ID, order/shipment/AWB, provider, safe error code, timestamps, current state, retry safety, recent attempts and relevant correlation references.
- Create incident playbooks for provider outage, queue stuck, booking unknown, wallet mismatch, webhook failure, storage outage and rollback.
- Backup/restore and migration rollback are documented and tested at appropriate level.

# 19. Testing strategy and required suites

## 19.1 Unit
Validation, status mapping, pricing/rounding, eligibility, error classification, retry/backoff, state transitions, idempotency-key generation, notification templates/dedupe, RTO/NDR/cancellation rules, pagination boundary and CSV sanitization.

## 19.2 API/contract
Every route: schema, auth, tenant, status/error envelope, pagination, rate limiting, idempotency, response correctness. Provider adapters contract-test real-shaped fixtures for success, refusal, malformed payload, timeout, rate limit, auth failure and unknown status.

## 19.3 Database/integration
Transactions, constraints, unique keys, concurrent booking/cancel, duplicate ledger entries, queue/outbox atomicity, webhook event dedupe, reconciliation, tenant access and migrations.

## 19.4 Worker/queue
Queue accepted, lease, retry, backoff, pause/resume, provider circuit breaker, worker stop/restart, stale job, dead letter, duplicate enqueue, partial batch, result persistence and manual retry.

## 19.5 Browser/E2E
Critical workflows from real UI/API through persisted result. Verify visible message, button state, refresh persistence, navigation, accessibility basics, browser storage/popups and responsive layouts. Use deterministic mock/sandbox provider for automation; separately document live carrier tests.

## 19.6 Required scenario matrix
At minimum test:
- Order single: valid, invalid each required field, quote error after persistence, double click, timeout, duplicate external reference.
- Bulk: 1/49/50/51/100+, max and above max, malformed file, BOM, Unicode, quoted newline, invalid rows, duplicate rows, create partial failure, assignment pause, worker down, resume, reupload, row result export.
- Quote: valid, unknown/suspended pincode, ODA, COD unsupported, rate absent, config missing, credential invalid, provider unavailable, stale cache.
- Booking: success, refusal, timeout unknown, malformed provider response, local persistence failure, parallel clicks, duplicate API calls, provider failover, refusal race, wallet/limit, worker restart.
- Pickup: request, confirmed, refusal, unknown, duplicate, unsupported carrier, cancellation and partial bulk.
- Labels/manifest: genuine provider label, missing label, generic label distinction, storage off, job failure, retry, popup blocked, localStorage failure, unauthorized document, bulk boundary.
- Tracking: normal, stale, outage, unknown status, duplicate webhook, invalid signature, replay, out-of-order events, late terminal event, poll/webhook conflict.
- NDR: all provider-supported action variants, unsupported action, invalid contact/address, deadline, duplicate, timeout unknown, refusal, reattempt delivered, second NDR, RTO.
- RTO: initiated, return reference, transit, exception, attempt, returned, receipt separate, delayed, duplicate/out-of-order, fee reconciliation.
- Cancellation: state-specific eligibility, concurrent booking, provider acceptance/rejection/unknown, pickup/in-transit/delivered, late event, refund exactly once.
- Finance/COD: duplicate settlement, concurrent debit, refunds, adjustment, mismatch, negative-balance policy, export reconciliation.
- Notifications: dedupe, channel outage, retry, preferences, deep link, persistence, tenant, critical notices.
- Pagination/export: > page limits, deep history, unstable sort, changing records, selection caps, truncation, CSV safety, report caps.
- Security: cross-seller IDs, role abuse, CSRF, XSS, webhook replay, upload abuse, rate limit, secrets.
- Deployment: build, migration up/down or documented rollback, readiness, worker health, smoke test, rollback.

# 20. Severity and priority

- **P0:** Financial/data integrity, security/tenant leakage, duplicate external bookings/debits, data loss, false success on core operation, no safe recovery. Release blocker.
- **P1:** Core order/booking/pickup/tracking/NDR/RTO/cancellation workflow broken or materially misleading; critical stuck operations; no usable recovery. Release blocker unless affected functionality is safely disabled.
- **P2:** Significant UX/accessibility/reliability problem, partial workflow issue with safe workaround.
- **P3:** Cosmetic, low-impact or non-critical refinement.

Severity must reflect impact and exploitability, not implementation difficulty.

# 21. Two-day execution order

## Day 1 — Integrity and core operations
1. Establish baseline: install/dependencies, build, lint/typecheck, backend tests, migrations, CI status. Record exact commands and failures.
2. Trace order create/import → readiness → quote → booking → provider → DB → response.
3. Reproduce and fix shared readiness/eligibility gaps.
4. Fix false success, bulk per-row state, queue pause/stall and resume semantics.
5. Booking idempotency/concurrency/timeout reconciliation; provider failover safety and refusal race.
6. Worker health/queue visibility, job persistence, dead-letter/recovery.
7. Wallet/COD/charge integrity.
8. Ship focused tests and regression.

## Day 2 — Lifecycle, UX, security and release candidate
1. Pickup, labels, manifests and storage/document failure.
2. Tracking, webhook/poll, stale/unknown status and event ordering.
3. NDR actions and provider capability; RTO lifecycle correctness.
4. Cancellation, race safety, fee/refund and reconciliation.
5. Notifications, persistent errors, actionable UX, offline/stale/loading/partial states.
6. Pagination, bulk limits, export completeness, print/download.
7. Tenant/security/permissions and data privacy.
8. Build/test/regression, controlled provider tests where available, deploy/rollback/smoke and final release decision.

Prioritize work by risk and dependency. If time is insufficient, disable/limit unverified high-risk capability and document safe fallback. Do not pretend the two-day schedule guarantees complete certification.

# 22. Feature verification matrix

Maintain per feature/provider:
- Capability implemented? (yes/no/partial)
- Provider contract/source verified?
- Credential/configuration validated?
- Unit tests passed?
- API/contract tests passed?
- Integration tests passed?
- Browser/E2E passed?
- Sandbox transaction verified?
- Live controlled transaction verified?
- Fallback and recovery verified?
- Tenant/security verified?
- Monitoring/alerting ready?
- Known limitations?
- Release enabled/disabled and why?

A feature can be enabled only at a verification level appropriate to its operational risk. Mark any missing evidence.

# 23. Final QA report format

Claude Code must provide a concise but evidence-backed report:

## Release candidate
- Branch, commit SHA, date/environment.
- Build artifacts/version.
- Migrations and deployment instructions.

## Baseline
- Exact commands, pass/fail, failures, environment limitation.

## Defects
For each ID: severity, root cause, file(s), fix, test evidence, state (Fixed/Verified/Blocked).

## Workflow certification
Order, import, quote, booking, failover, pickup, documents, tracking, NDR, RTO, cancellation, finance, notifications, reports, security — status with evidence.

## Testing
- Tests added.
- Exact test commands/results.
- CI checks.
- E2E results.
- Provider contract/sandbox/live level.
- Not run/blocked and reason.

## Operations
Health, worker/queue, monitoring, alerts, backup/restore, rollback, incident playbooks.

## Known limitations
Feature disabled/limited, residual risks, owner, safe workaround.

## Recommendation
GO / LIMITED GO / NO-GO with explicit rationale and criteria.

# 24. Release gates — no exceptions

**GO** only when all:
- No known P0/P1 defects in enabled core workflows.
- Core seller journey and high-risk regression suite pass.
- No duplicate booking/debit/refund or false-success defect known.
- Tenant/security checks pass.
- State truthfulness and recovery are verified.
- Critical APIs/workers/providers are healthy and appropriately monitored.
- Enabled carrier capabilities are verified at the stated level.
- Build, migration, smoke, rollback and support readiness are complete.
- Residual risks are accepted by accountable owner.

**LIMITED GO** only if:
- Core order/booking integrity is verified.
- Unverified features/providers are disabled or constrained.
- User-visible limitation, safe fallback, support and rollback are in place.
- No P0/P1 defect remains in enabled functionality.

**NO-GO** if:
- Financial or tenant integrity risk remains.
- Booking outcome can be duplicated/unknown without reconciliation.
- Core operation can report false success.
- Critical workflow has no safe fallback.
- Security, migration, worker, or release checks are failing/unverified in a way that creates material risk.

# 25. Required artifact updates

Keep these in sync:
- `docs/qa/DEFECT_REGISTER.md`: defect status, severity, evidence, fix, tests, residual risk.
- `docs/qa/TEST_MATRIX.md`: scenario status and evidence.
- `docs/qa/RELEASE_GATES.md`: current gate status and evidence.
- `docs/qa/FRONTEND_ORDER_FLOW_AUDIT.md`: new frontend findings.
- Architecture/workflow map as discovered.
- This specification: changes to requirements only with explicit rationale.

**Do not use this document to claim a defect is fixed. It defines the work and verification bar.**

---

# Execution instruction (copy as the task prompt)

Claude Code, read this entire specification and repository instructions before changing code. Start by inspecting the current main/working branch and verifying that the QA documents are merged. Build a real architecture map and baseline. Execute the prioritized audit and fixes across the full shipping lifecycle. For each defect, prove/reproduce it, create regression coverage, implement a root-cause fix, run the tests, inspect the diff and update QA evidence. Work in small commits. Protect financial integrity, tenant isolation, state truthfulness and idempotency above convenience. Implement fallback, notifications and clear UX for every failure and partial state. Audit NDR, RTO and cancellation against actual carrier APIs/capabilities and correct persisted states. Never invent or claim API capabilities. Never blindly retry ambiguous side effects. Never present queue acceptance or request acceptance as completion. Do not skip tests or release gates due to deadline. If any requirement is blocked, state exactly why, keep it marked blocked, and disable or limit affected feature if necessary. Finish with the full QA report format in section 23 and release decision from section 24.