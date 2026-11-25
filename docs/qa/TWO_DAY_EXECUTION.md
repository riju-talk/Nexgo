# NEXGO 48-Hour Stabilization Plan

**Goal:** Reduce risk in the order-to-shipment workflow and produce an evidence-based release decision within two days.  
**Rule:** Scope is frozen to reliability, correctness, security, core UX, test evidence, and release documentation.

## Operating cadence

- Work in short reviewable commits on `qa/production-readiness-2day`.
- Each issue: reproduce/inspect → write failing test → fix → test → regression → document.
- Never bundle unrelated fixes.
- If a defect cannot be safely fixed and tested in this window, disable or constrain the affected capability and document the blocker.
- No deployment to production without owner approval and rollback plan.

## Day 1 — Diagnose, reproduce, repair critical booking path

### Block 1 — Baseline (first 1–2 hours)
- [ ] Confirm current branch/head and compare recent changes.
- [ ] Read architecture, agent instructions, existing QA reports, and package scripts.
- [ ] Install dependencies in clean environment if available.
- [ ] Run frontend lint/test/build and backend check/unit tests.
- [ ] Record failures before changes (baseline).
- [ ] Inspect Orders, Bulk Upload, Create Order, Ready-to-Ship, Track, courier quote, booking dialog, admin integrations.
- [ ] Reproduce reported “punch orders” symptom using safe test provider or mock. No live paid bookings until approved.

### Block 2 — P0 booking and integrity
- [ ] Read all booking entry points and adapter contracts.
- [ ] Establish a single booking state machine and invariant checklist.
- [ ] Add test for double-click/concurrent booking.
- [ ] Add durable idempotency/booking-intent test and ambiguous timeout reconciliation.
- [ ] Enforce order readiness before manual, auto, and batch assignment.
- [ ] Ensure quote/serviceability/book share validation and eligibility.
- [ ] Integration credentials/config health must block false bookability.
- [ ] Verify wallet debit, cancel refund, and ledger transaction boundaries.
- [ ] Review Shiprocket create-order → courier assignment → AWB lifecycle for orphan recovery.
- [ ] Fix refusal/pause race and safe failover classification.

### Block 3 — Queue and worker
- [ ] Verify worker process/health endpoint or heartbeat.
- [ ] Test worker unavailable, crash, restart, stale job, retries, dead letter.
- [ ] Ensure queue acceptance is not represented as booked.
- [ ] Ensure per-order results are durable and visible during processing.
- [ ] Test cancel/retry interactions with queued and processing jobs.

### Block 4 — End of Day 1 checkpoint
- [ ] P0 defects have tests and fixes or documented blockers.
- [ ] Regression suite passes.
- [ ] Code review for changed booking/financial paths.
- [ ] Update defect register and evidence.
- [ ] Freeze scope for Day 2; no feature work.

## Day 2 — Full flow, documents, data integrity, UX, release gate

### Block 5 — Orders and bulk
- [ ] Single create/edit/duplicate/order import.
- [ ] CSV/XLSX edge cases: malformed, missing columns, wrong headers, BOM, delimiter, quotes, newline, invalid UTF-8, formula cells, leading-zero pincode/AWB, duplicate order/reference.
- [ ] 49/50/51/100+ rows and chunk retry behavior.
- [ ] Per-row success, skipped, duplicate, conflict, validation, and booking results.
- [ ] Bulk assignment chunk sizes and selection limits.

### Block 6 — Documents, tracking, cancellation, COD
- [ ] Carrier label: provider label or explicit unavailable state; barcode scanability if label enabled.
- [ ] Manifest/pickup storage guard, failure/retry, no fake success.
- [ ] Bulk print/download: popup blocked, storage unavailable, expired URL, partial fetch, cancellation, progress.
- [ ] Tracking webhooks: signature/token, replay, duplicate, unknown status, stale scans.
- [ ] NDR retry/RTO/cancel: duplicate request, race, fee/refund at most once.
- [ ] COD order and remittance calculations/reconciliation where provider/test environment supports.

### Block 7 — Data, exports, UX, security
- [ ] Pagination boundaries and filters; no inaccessible pages shown.
- [ ] Select-all and 5,000/2,000 caps; no silent partial action.
- [ ] Report 19,999/20,000/20,001 and larger; completeness metadata.
- [ ] Two-seller isolation tests for reads, writes, IDs, exports, documents, jobs, admin.
- [ ] Permission denied, session expiry, CSRF, rate limits, CORS, storage and network errors.
- [ ] Responsive layouts, keyboard navigation, loading/empty/error states, persistent errors.
- [ ] Confirm no secrets, internal provider fields, or sensitive data in client bundles/logs.

### Block 8 — Release candidate
- [ ] Clean run of all checks on exact release commit.
- [ ] Clean DB migration and upgrade migration tested.
- [ ] Smoke test staging with provider sandbox/mock; real-provider test only with explicit approval and controlled test shipment.
- [ ] Verify API, worker, database, storage, webhook configuration, backup, rollback.
- [ ] Update release notes, known limitations, operational runbook, defect statuses.
- [ ] Apply release gates. If a P0 remains, do not release.

## Timebox and scope rule

The two-day target is a deadline for a release decision and a prioritized repair set, not an unconditional promise to deploy. If production-grade evidence cannot be achieved, provide a safe limited release (disable unverified integrations/features) or a no-go decision with exact blockers.
