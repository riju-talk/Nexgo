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
