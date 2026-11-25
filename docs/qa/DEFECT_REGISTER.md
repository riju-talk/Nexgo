# NEXGO Consolidated QA Defect Register

**Baseline:** Static repository review and prior QA notes as of 2026-11-25.  
**Status discipline:** The rows below are initial findings. Current-HEAD code inspection and runtime reproduction are required before changing status. IDs remain stable for traceability.

Severity:
- **P0 Critical:** Financial integrity, duplicate booking, tenant data breach, data loss, false confirmed shipment, or production outage. Release blocker.
- **P1 High:** Core order/booking flow fails, queue can stall without visibility, operational documents unusable, or major workflow/UX correctness defect. Release blocker unless formally risk-accepted and scope disabled.
- **P2 Medium:** Important functionality degraded, incomplete data visibility, support burden, or recoverable UX defect. Fix within sprint when feasible.
- **P3 Low:** Polish, minor edge case, or non-core issue.

## A. Order ingestion and readiness

| ID | Severity | Finding | Evidence / status | Required outcome |
|---|---|---|---|---|
| ORD-001 | P1 | Orders may be accepted with zero/missing weight or incomplete dimensions and later become unready | Confirmed prior code review; recheck current code | Validate on create/import; diagnostic response includes field/code/action |
| ORD-002 | P1 | Bulk duplicate fallback may misclassify duplicate order number/external reference | Confirmed prior code review; recheck | Same-order idempotency only; mismatched refs return explicit conflict |
| ORD-003 | P1 | Bulk upload chunking (50/request) and partial failures need UI contract validation | Backend cap confirmed; frontend not yet tested | Every CSV row has a durable result; chunks retry safely |
| ORD-004 | P1 | Assignment may accept orders failing readiness | Confirmed prior code review; recheck | Readiness validation enforced before any provider request |
| ORD-005 | P2 | Readiness is boolean/insufficiently diagnostic | Prior review | Structured blocking issues by field and remediation |
| ORD-006 | P2 | CSV/XLSX parser/mapping/validation UX not yet audited | Not tested | Preview, mapping, row errors, duplicate policy, encoding and chunk boundaries verified |

## B. Eligibility, quoting, and rate correctness

| ID | Severity | Finding | Evidence / status | Required outcome |
|---|---|---|---|---|
| ELG-001 | P1 | Quote/serviceability and booking checks differ | Confirmed prior review; recheck | Shared eligibility engine/contracts |
| ELG-002 | P1 | Unknown/inactive pincodes may receive optimistic eligibility | Confirmed concern prior review | Unknown state explicit; inactive lane blocked consistently |
| ELG-003 | P1 | Credentials/integration health not represented in bookable quote result | Confirmed prior review | Integration readiness shown and enforced |
| ELG-004 | P1 | Recent lane refusals may be ignored in booking path | Confirmed prior review | Refusal state consistent across quote and booking |
| ELG-005 | P2 | Quote may use incomplete dimensions while booking requires dimensions | Confirmed prior review | Same parcel inputs/volumetric calculation across quote and book |
| ELG-006 | P2 | Quote fallback zone may differ from booking-derived zone | Confirmed prior review | Require lane inputs; shared zone calculation |
| ELG-007 | P2 | Internal rules are not live provider serviceability | Architectural limitation | Label internal eligibility vs live check vs confirmed booking distinctly |
| ELG-008 | P2 | Auto-assignment priority is static/sequential rather than live optimization | Design limitation | Avoid overstating “best courier”; correctness first |

## C. Booking integrity and provider integrations

| ID | Severity | Finding | Evidence / status | Required outcome |
|---|---|---|---|---|
| BOOK-001 | P0 | Ambiguous timeout/provider success/local persistence failure can orphan booking or duplicate on retry | Risk requiring proof | Durable booking intent, provider reference, reconciliation, safe retry |
| BOOK-002 | P0 | Concurrent manual/auto/batch requests may race for one order | Risk requiring proof | DB constraint/lock + idempotency; one active booking intent |
| BOOK-003 | P1 | Shiprocket provider order may be created before serviceability/AWB assignment; failures can orphan provider order | Confirmed from recent adapter inspection | Track provider order lifecycle; reconcile/cleanup before retry |
| BOOK-004 | P1 | Aggregator wallet refusal state update was fire-and-forget | Confirmed recent code review | Awaited/synchronous state transition; race test; cross-process durable state |
| BOOK-005 | P1 | Live API behavior for Shiprocket is not yet certified | Explicit code/test limitation | Controlled real-account test, or disable provider |
| BOOK-006 | P1 | Lorrigo/Shiprocket payload and status mappings need contract coverage | Coverage exists but runtime certification incomplete | Contract tests for success/refusal/timeout/invalid response |
| BOOK-007 | P1 | Provider credentials/configuration can be incomplete or invalid | Risk | Integration health gate; no false bookable state |
| BOOK-008 | P1 | Provider failover can retry a lane/provider without clearly distinguishing transient, permanent, and ambiguous errors | Needs deeper audit | Error taxonomy; safe failover only for eligible failures |
| BOOK-009 | P2 | Provider cancellation/refund/label/pickup capabilities vary | Capability mapping needs verification | Capability-driven UI and backend guardrails |

## D. Queue, worker, retries, and operations

| ID | Severity | Finding | Evidence / status | Required outcome |
|---|---|---|---|---|
| OPS-001 | P0 | Worker outage can leave accepted assignment jobs unprocessed | Confirmed architecture | Heartbeat/queue age alerts, stale state, clear UI, worker health gate |
| OPS-002 | P1 | Batch order-level results are not visible until completion in some flows | Confirmed prior review | Streaming/polling durable per-order results |
| OPS-003 | P1 | Retry/dead-letter/recovery paths require adversarial testing | Partial coverage; verify current | Retry bounded, backoff, idempotent, visible terminal state |
| OPS-004 | P1 | Batch may be accepted even when worker is unavailable | Architecture risk | Detect worker health before queue acceptance or return explicit degraded status |
| OPS-005 | P2 | Stale jobs/queue backlog lacks seller/admin actionable diagnostics | Verify current | Job age, attempt, next retry, correlation ID, recovery action |

## E. Shipment documents, pickup, tracking, NDR/RTO

| ID | Severity | Finding | Evidence / status | Required outcome |
|---|---|---|---|---|
| DOC-001 | P1 | Generic NEXGO PDF may be shown as label rather than genuine carrier label | Confirmed prior worker review | Provider label/barcode, or label unavailable state; never misrepresent |
| DOC-002 | P1 | Manifest route lacks consistent upfront storage availability guard | Confirmed prior review | Storage validation before job enqueue |
| DOC-003 | P1 | Label/document failure reasons and retry actions insufficient | Confirmed prior review | Durable job result and shipment-vs-document distinction |
| DOC-004 | P2 | Pickup may be internal record where provider lacks API | Existing audit noted | Clearly label scheduling mode and provider capability |
| TRK-001 | P1 | Tracking webhook/polling health and missing scans need observability | Prior audit/provider-dependent | Health, replay protection, stale tracking warnings |
| TRK-002 | P1 | NDR/RTO actions and charges require idempotency and real-provider testing | Not fully live-tested | Duplicate/replay/concurrency tests and charge/refund integrity |
| TRK-003 | P2 | Status mapping may vary by provider and need unknown-state fallback | Needs audit | Unknown statuses preserved and visible, not incorrectly mapped |

## F. Data access, selection, reports, and downloads

| ID | Severity | Finding | Evidence / status | Required outcome |
|---|---|---|---|---|
| DATA-001 | P1 | Legacy orders list limited to latest 100 | Confirmed prior review | Main order screen uses pagination/search, no hidden truncation |
| DATA-002 | P1 | Legacy shipments list capped at 2,000 | Confirmed prior review | UI uses full pagination endpoint; cap disclosed |
| DATA-003 | P1 | Shipment list numbered pagination has 10,000 depth ceiling/reachable-pages mismatch | Confirmed prior review | Accessible pages accurately reported; deep history via cursor |
| DATA-004 | P1 | ID-selection API capped at 5,000; assignment/cancel cap 2,000 | Confirmed prior review | Server-side selection or explicit batching; no silent partial selection |
| DATA-005 | P1 | Report export capped at 20,000 without strong file-level completeness contract | Confirmed prior review | Exported vs matched count; explicit partial warning; chunked async export |
| DATA-006 | P2 | Generated reports list limited to 20 without pagination | Confirmed prior review | Pagination or search/retention policy |
| DATA-007 | P2 | Bulk document fetch/print batching and browser popup/storage failures | New frontend audit required | Failure detection, retry, per-item outcome |
| DATA-008 | P2 | CSV/XLSX contract fragmented across implementations | Prior review | Consistent encoding, filename, columns, complete count, safe formulas, typed identifiers |
| DATA-009 | P2 | Filter changes may retain stale cursor/page/cache | Frontend risk, not verified | Reset state and test filter transitions |

## G. UX, errors, onboarding, and support

| ID | Severity | Finding | Evidence / status | Required outcome |
|---|---|---|---|---|
| UX-001 | P1 | Transient toast is insufficient for persistent booking failure | Confirmed API helper; frontend audit pending | Persistent row/panel with code, reason, action, retry state |
| UX-002 | P1 | Batch failures and partial success are not uniformly presented per order | Prior review | One final result per input order, live updates |
| UX-003 | P1 | Queued/processing/booked states may be conflated | Risk | Precise state language and timestamp |
| UX-004 | P2 | Setup prerequisites (warehouse, courier, rate, wallet, agreement) can block users without guided checklist | Prior audit | Setup checklist and blocking explanation |
| UX-005 | P2 | Empty/loading/error/permission/offline states need systematic review | Not tested | Consistent state design, retry affordances |
| UX-006 | P2 | Accessibility/responsive/keyboard checks not performed | Not tested | WCAG-oriented baseline, keyboard and small-screen smoke tests |
| UX-007 | P2 | Generic error handling needs stable codes and localization-ready messages | Prior review | Error contract and seller-safe messages |

## H. Security, privacy, tenancy, and configuration

| ID | Severity | Finding | Evidence / status | Required outcome |
|---|---|---|---|---|
| SEC-001 | P0 | Cross-seller data access must be verified across API, list, export, documents, jobs, and mutations | Existing QA noted not done comprehensively | Two-seller automated authorization suite |
| SEC-002 | P0 | Secrets/logs/config exposure and credential handling require review | Not fully tested | No secrets in client/logs/repo; rotation if exposed |
| SEC-003 | P1 | Admin/seller authorization and role boundary coverage incomplete | Existing audit scope gap | Deny-by-default and route coverage |
| SEC-004 | P1 | Production security settings (cookies, CSRF, CORS, rate limits, headers) need configuration validation | Existing audit partial | Automated config checks and runtime evidence |
| SEC-005 | P1 | Sensitive exports/documents must be tenant-scoped and access-controlled | Risk | Access tests, short-lived links, no-store |
| SEC-006 | P2 | Audit trail for admin, money, provider and retries may be incomplete | Needs review | Actor, action, request ID, timestamp, outcome |

## I. Build, migrations, deployment, and observability

| ID | Severity | Finding | Evidence / status | Required outcome |
|---|---|---|---|---|
| DEP-001 | P0 | Worker/API deployment health and process topology not verified | Not verified | Production health checklist and worker heartbeat |
| DEP-002 | P1 | CI/test suite/build/lint/typecheck/migrations not run on candidate | Not run in this session | Candidate checks all green with artifacts |
| DEP-003 | P1 | Migration ordering/rollback/data compatibility needs review | Not tested | Clean DB + upgrade DB + backup/rollback |
| DEP-004 | P1 | Provider env/config mismatch can silently disable or break booking | Risk | Env validation and health status |
| DEP-005 | P1 | No complete observability evidence for errors/queue/provider calls | Not tested | Request IDs, metrics, structured logs, alerting |
| DEP-006 | P2 | Deployment rollback/runbook and support triage need completion | Not verified | Documented rollback and incident procedures |

## Status fields to add during execution

For every defect: `Status`, `Owner`, `Evidence link`, `Reproduction steps`, `Fix commit`, `Test case IDs`, `Verification environment`, `Residual risk`.

Do not close a defect solely because code was changed. Close only after the relevant test is run and evidence is attached.

## J. First-pass frontend order/booking findings (2026-11-25)

| ID | Severity | Finding | Evidence / status | Required outcome |
|---|---|---|---|---|
| UX-008 | P1 | Bulk upload can report orders as successfully created/assigned when assignment results are absent (e.g. paused queued items) | **Confirmed by static inspection** of `LiveBulkOrderImport.jsx` and `lib/assignBatches.js`: paused batch polling exits early; paused orders are not in `batch.results`; importer maps only returned results to `unassigned`; final “created” count includes `created && !unassigned`. No runtime reproduction yet. | Represent queued/paused separately from booked/assigned; reconcile each order against durable batch state; never count as assigned without confirmed result/AWB. Test provider pause/resume and worker outage. |
| UX-009 | P2 | Bulk import assignment results are returned/merged only after the assignment polling helper exits; queued paused orders are not durable results in the importer | Same code path; static inspection | Show per-order states (created, queued, paused, booked, failed) and let seller see final outcomes later; preserve batch ID and result file. |
| UX-010 | P2 | Print/document popup blocking is not detected reliably | **Confirmed by static inspection** in `LiveTrack.jsx`: `openDocs()` returns `window.open()`; browser may return null for blocked windows and for noopener behavior; caller only checks `=== false`, so null is not surfaced as failure. | Detect popup-blocked/hand-off failure reliably, provide same-tab/explicit download fallback and user message. |
| BOOK-010 | P1 | Assignment queue eligibility query and `assignOneOrder` do not enforce full order readiness before courier booking | **Confirmed by static inspection**: queue route filters by order state and absence of shipment; `assignOneOrder` transitions `new` to `ready_to_ship` and chooses couriers; `prepareBooking` does not apply `READY_SQL` (customer/address/phone/weight/dimensions/COD readiness) in the inspected path. Runtime tests not yet executed. | Validate readiness before queueing and again at booking boundary. Invalid orders must not be changed to ready or call provider; return blocking field diagnostics. |
| DATA-010 | P2 | Bulk shipment select-all caps IDs at 5,000; UI warning exists, but operation is not complete select-all | Static inspection of `LiveTrack.jsx`: endpoint limit=5000 and explicit truncation toast. This is disclosed, not silent, but selection UX should make selected count vs total explicit and offer chunked/server selection for larger sets. | Confirm user understands subset; implement server-side selection or chunked action if needed; tests at 5,000 and >5,000. |

### Frontend scope inspected

- `AppPage.jsx`: route/page IDs dynamically map to live components; order and shipment pages are mostly wrapper routes, so QA must test the actual live component mapping rather than route files alone.
- `LiveCreateOrder.jsx`: single-order creation persists order before requesting quotes; if quote call fails, order still exists. UX must clearly retain and explain created order/quote failure to avoid duplicate submission. Idempotency and recovery tests required.
- `LiveBulkOrderImport.jsx`: imports up to 5,000 orders, resolves missing location metadata in concurrent chunks, creates orders in chunks of 50 (four concurrent workers), and then runs courier assignment. This is throughput-oriented but requires partial-result, pause, worker-down, retry and row-identity tests.
- `LiveTrack.jsx`: numbered page controls; select-all is capped at 5,000 with warning; document opening uses popup windows and large selections use localStorage handoff. Popup/storage failure cases need explicit UX tests.

**No frontend runtime or browser tests were executed in this pass.** These are code-inspection findings only.

## K. Execution log, 2026-11-26 (branch `main`, local throwaway Postgres 17 with all 75 migrations, fake Lorrigo / Shiprocket servers)

Status words: **Verified** = a test that reproduces or guards the defect was executed and passed (command and result given). **Fixed** = code changed, only partly tested. **Open** = not fixed. **Not tested** = no evidence either way.
Environment limit that applies to EVERY row: no live Lorrigo / Shiprocket / RapidShyp transaction, no production database, no real browser pop-up test, no separate worker process. Provider behaviour was checked against fakes written from observed live responses (Lorrigo) or documentation (Shiprocket).

### K.1 Defects found and closed in this run

| ID | Sev | Finding | Root cause (file) | Fix | Evidence | Status |
|---|---|---|---|---|---|---|
| BOOK-011 (new) | P0 | **Production incident 2026-11-25:** bookings were held back although Lorrigo accepted them. Lorrigo's wallet read -19,105 rupees but it books on a credit limit. | A negative balance was treated as "empty": `allBookingPaused()` / `pauseGate()` in `lib/aggregatorBalance.ts`, `lib/assignQueue.ts` closed the queue to one trial order every few minutes. | The pause is decided by what the aggregator DID: a refusal for balance is recorded (`courier_aggregators.last_refused_at`, migration 0075, `lib/aggregatorRefusals.ts`) and cleared by the next successful booking. The balance is information only (shown, warns, never blocks). | `tests/e2e/speed.mjs` section 10 (wallet -19,105, aggregator accepts: 20/20 booked, none paused, no refusal recorded); unit `aggregatorBalance.test.ts`, `aggregatorRefusals.test.ts`. speed.mjs 33/33, vitest 511/511 | **Verified** |
| BOOK-004 | P1 | Provider-wide refusal state written fire-and-forget (`void markRefused`) in the Shiprocket adapter. | `couriers/shiprocket.ts` `outOfBalance()`. | `async`, awaited before the booking reports failure. Lorrigo already awaited. | `shiprocketAdapter.test.ts` "records the aggregator refusal BEFORE the booking fails". Cross-process visibility is by database row; exercised in one API process, not with a separate worker | **Verified** (single process); cross-process **Not tested** |
| BOOK-012 (new) | P1 | Over-broad refusal classifier: any message containing "wallet", "insufficient" or "recharge" paused EVERY seller's bookings on that provider (e.g. "Insufficient address"). | `OUT_OF_BALANCE` regex in `couriers/shiprocket.ts`. | Narrow shared classifier `isBalanceRefusal()` (`lib/aggregatorRefusals.ts`), used by both adapters. | `aggregatorRefusals.test.ts` (7 true / 9 false cases), `shiprocketAdapter.test.ts` "Insufficient address does NOT pause the provider" | **Verified** |
| BOOK-010 / ORD-004 | P1 | Booking path never checked order readiness: zero dead weight booked at the courier as 0.001 kg, missing dimensions replaced by 10 cm, and an incomplete order was moved to `ready_to_ship` before any check. | `prepareBooking`, `assignOneOrder` (`routes/shipments.ts`); adapters' silent defaults. | One gate, `assertOrderReady()` (`lib/orderReadiness.ts`, SQL rule `READY_SQL` decides, TypeScript explains with field-level issues, code `ORDER_NOT_READY`, HTTP 422). Applied in manual booking, synchronous auto-assign (before state change), and the assign queue (returns `notReady`). | `tests/e2e/readiness.mjs` 38/38: every incomplete case refused by all three paths, ZERO calls to the courier network, wallet unchanged, order state unchanged; unit `orderReadiness.test.ts` 25/25 | **Verified** |
| ORD-007 (new) | P0 | **A seller could mark an order `booked` or `returned` by hand** (`PATCH /v1/orders/:id/state`): no courier, no AWB, no debit, and the order then disappeared from every list. | `routes/operations.ts` state endpoint allowed the full order state machine. | Seller-settable states limited to draft/new/ready_to_ship/cancelled (`ORDER_STATE_SYSTEM_ONLY`, 409); ready requires the readiness gate; cancelling an order that has a shipment is refused (`ORDER_HAS_SHIPMENT`). Reproduced first with a probe script (200 booked, 0 shipments). | `readiness.mjs` (booked/returned refused, no shipment, no debit, order still ready and cancellable) | **Verified** |
| ORD-008 (new) | P2 | UI swallowed every error from the "mark ready" call (`.catch(() => {})`), hiding real problems. | `CourierChooser.jsx`, `LiveCreateOrder.jsx`. | Only the harmless "already ready" 409 is ignored. | `eslint` clean; behaviour covered by the API test above; **no browser test** | **Fixed** |
| BOOK-002 | P0 | Concurrent booking of one order through several paths. | (risk, no defect found) | n/a | `tests/e2e/concurrency.mjs` 10/10: 6 identical requests, 6 with different keys, manual + auto-assign + queue + manual at once, already-booked order via 3 paths, 12 orders at once: always exactly one shipment, one AWB, one debit; wallet equals start minus charges; no 5xx | **Verified** |
| BOOK-002b (new) | P2 | Losers of a booking race were told "This record already exists (a duplicate name or reference)". | generic 23505 handler. | `ORDER_ALREADY_BOOKED` 409: names the AWB and courier and says nothing was charged twice. | `concurrency.mjs` | **Verified** |
| UX-008 / UX-009 | P1 | Bulk upload reported paused/queued orders as "created and assigned". | `LiveBulkOrderImport.jsx` merged only returned results. | Pure module `lib/bulkOutcome.js`: a sent order with no answer is `queued` (saved, waiting), counted apart from `booked`; per-row label, persistent banner, honest toast. | `tests/bulkOutcome.test.mjs` 7/7 (paused batch -> 0 booked, 4 queued; counts add up to the input). **No browser run** | **Verified** (logic); UI **Not tested** in a browser |
| UX-010 | P2 | Blocked print pop-up undetectable: `window.open(..., 'noopener')` always returns `null`; storage failure reported as "too many". | `LiveTrack.jsx` `openDocs`. | `lib/openDocs.js`: opens without `noopener`, cuts the opener by hand, returns `opened` / `blocked` / `storage_failed` / `too_many` / `empty`; blocked leaves a persistent clickable link. | `tests/openDocs.test.mjs` 10/10. **No real browser pop-up blocker test** | **Verified** (logic); browser **Not tested** |
| TRK-001 | P1 | Shiprocket tracking poll asked about a fixed 60 parcels per round: a fleet of 1,000 live parcels needed ~170 minutes to refresh without webhooks. | `aggregators/shiprocket/index.ts`. | `TRACKING_POLL_BATCH` (default 200, max 5,000), rotating so every AWB is covered. | `shiprocketAdapter.test.ts` rotation test (450 AWBs, 3 rounds, no repeats, none missed); `shiprocket.mjs` poll check | **Fixed**; residual: still bounded by `TRACKING_POLL_MINUTES`, webhooks remain the primary path |

### K.2 Findings that stay open (not fixed in this run)

| ID | Sev | What is known | Why open |
|---|---|---|---|
| BOOK-001 | **P0** | Provider success followed by a local database failure, and an ambiguous timeout, are mitigated (a retry reuses the provider order through `aggregator_orders` / reference lookup; the booking key makes the local write idempotent) but there is **no durable booking-intent record and no reconciliation job**. Not proven by a test that kills the local write after a provider success. | Needs a schema change (booking intent + outbox) and a reconciliation worker. Release blocker. |
| OPS-001 / DEP-001 | **P0** | No worker heartbeat / queue-age alert visible to sellers; a stopped worker leaves accepted batches pending. (Admin dashboard has queue depth and p95 booking time; not a heartbeat.) | Not built. Production topology not verified. |
| SEC-001 | **P0** | Cross-seller isolation: spot checks exist inside several suites (batch, notifications, bulk tracking, a foreign order id in `readiness.mjs`). **No complete two-seller suite across every route, export, document and job.** | Not built. |
| BOOK-005 | P1 | Shiprocket has never run against a live account. | No API user available. Provider stays disabled until one controlled live booking passes. |
| RapidShyp | n/a | An API key was pasted in chat. **It is not stored anywhere in the repository** (checked). There is no RapidShyp adapter. The key should be treated as exposed and rotated. | Needs the provider's API documentation and a sandbox; no capability will be invented. |
| ORD-009 (new) | P2 | Customers are shared between orders with the same phone: editing one order's customer changes the others'. Found because it contaminated a test. | Needs a design decision (copy-on-write customer per order). |
| ORD-001 | P1 | Booking is now blocked for incomplete orders, but order **creation / import** validation was not re-audited. | Not reviewed. |
| ELG-001..007, DOC-001..004, NDR/RTO capability audit, cancellation fee/refund races, wallet/COD reconciliation, notification channel fallback, DATA-003/004/005 export completeness | P1/P2 | Not investigated in this run. | Time. They remain as listed in sections B to I. |
