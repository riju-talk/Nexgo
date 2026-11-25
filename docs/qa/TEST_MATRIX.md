# NEXGO QA Regression and Acceptance Matrix

**Execution status at document creation:** Planned. No tests in this matrix have been executed in this QA branch yet.  
**Evidence format:** test ID + commit + environment + input/fixture + output + logs/screenshots + test result.

## Result values
- **PASS:** Executed, expected result observed, evidence recorded.
- **FAIL:** Executed and behavior incorrect.
- **BLOCKED:** Cannot execute due to missing environment/provider/account.
- **NOT RUN:** Not executed.

## 1. Order creation/readiness

| ID | Scenario | Expected |
|---|---|---|
| ORD-T01 | Valid prepaid order | Saved; correct normalized fields; readiness clear |
| ORD-T02 | Valid COD order | COD amount/payment fields validated |
| ORD-T03 | Missing customer name | Rejected with field-specific message |
| ORD-T04 | Invalid/short mobile | Rejected before provider call |
| ORD-T05 | Missing/short address | Rejected with actionable correction |
| ORD-T06 | Unknown pincode | Explicit unverified/blocked policy; not optimistic |
| ORD-T07 | Pincode suspended | Booking blocked in quote and booking |
| ORD-T08 | Pincode-city/state mismatch | Rejected or corrected from trusted directory |
| ORD-T09 | Missing weight/zero weight | Rejected or explicitly unready with diagnostic |
| ORD-T10 | Missing/partial dimensions | Consistent quote/order/book behavior |
| ORD-T11 | COD amount absent/negative/zero edge | Correct validation |
| ORD-T12 | Duplicate order number, same payload | Idempotent response, no second order |
| ORD-T13 | Duplicate order number, conflicting payload | Conflict; never mislabeled idempotent |
| ORD-T14 | Duplicate external reference, same order | Idempotent |
| ORD-T15 | Duplicate external reference, different order | Explicit conflict |
| ORD-T16 | Bulk 1/49/50/51/100 rows | Chunking correct, no lost/duplicated rows |
| ORD-T17 | Bulk mixed valid/invalid | One durable outcome per row |
| ORD-T18 | CSV BOM, quoted commas/newlines, delimiter variation | Correct parse or explicit error |
| ORD-T19 | Pincode/AWB leading zeros | Preserved as identifiers |
| ORD-T20 | Formula-like CSV values | Safe export; no spreadsheet formula injection |

## 2. Quote, serviceability, rates

| ID | Scenario | Expected |
|---|---|---|
| ELG-T01 | Valid known lane/service | Quote has source, inputs, price, conditions |
| ELG-T02 | Unknown pincode | Not represented as verified serviceable |
| ELG-T03 | Inactive pincode | Blocked consistently |
| ELG-T04 | Recent provider lane refusal | Excluded or explicitly blocked consistently |
| ELG-T05 | Missing/invalid integration credentials | Not bookable; clear admin action |
| ELG-T06 | Service disabled for seller | Not available |
| ELG-T07 | No rate card | No bookable quote |
| ELG-T08 | Weight band boundaries | Correct slab, extras, rounding, GST semantics |
| ELG-T09 | Partial dimensions | Same dimensional weight rule as booking |
| ELG-T10 | Zone/pickup fallback | No mismatched zone; explain missing lane inputs |
| ELG-T11 | COD unsupported | Prepaid-only explanation |
| ELG-T12 | ODA unsupported | Block or alternative service |
| ELG-T13 | Provider live serviceability unavailable | Distinguish internal estimate from live provider validation |

## 3. Booking/idempotency/finance

| ID | Scenario | Expected |
|---|---|---|
| BOOK-T01 | Valid manual booking | Provider confirms, local shipment persists, AWB and charges returned |
| BOOK-T02 | Valid synchronous autoassign | Correct fallback; result reflects actual booking |
| BOOK-T03 | Valid queued batch | Queue status, not false booked status |
| BOOK-T04 | Not-ready order submitted | Rejected before provider request |
| BOOK-T05 | Double click / repeated request | One booking intent/active shipment |
| BOOK-T06 | Two concurrent entry paths for same order | Lock/unique constraint prevents duplicate |
| BOOK-T07 | Provider timeout before request outcome | Unknown state; reconciliation before retry |
| BOOK-T08 | Provider succeeds but local save fails | Durable reconciliation recovers booking; no duplicate debit |
| BOOK-T09 | Provider rejects permanently | No unsafe retry; clear terminal result |
| BOOK-T10 | Transient provider error | Bounded backoff and retry; observable |
| BOOK-T11 | Wallet insufficient | No provider booking; amount and next step clear |
| BOOK-T12 | Debit limit exhausted | No provider booking; correct reason |
| BOOK-T13 | Provider balance refusal | Pause state durable; other providers safely considered |
| BOOK-T14 | Wallet charge exact quote | One debit, matching charge and ledger reference |
| BOOK-T15 | Cancellation accepted | Refund at most once; state reconciled |
| BOOK-T16 | Cancellation provider failure | No false cancelled state/refund |
| BOOK-T17 | Booking and cancellation race | Consistent final state and ledger |
| BOOK-T18 | Failover | Only safe eligible errors trigger failover; ambiguous outcome reconciled first |
| BOOK-T19 | Shiprocket external order created, AWB failure | Provider order tracked/reconciled; retry doesn't duplicate |
| BOOK-T20 | Shiprocket invalid credentials/payload | Actionable integration error; safe failure |

## 4. Worker/queue

| ID | Scenario | Expected |
|---|---|---|
| OPS-T01 | Worker healthy | Jobs progress and heartbeat visible |
| OPS-T02 | Worker stopped | Queue acceptance blocked or explicitly degraded; no indefinite pending |
| OPS-T03 | Worker crash mid-job | Lease/recovery; idempotent reprocessing |
| OPS-T04 | Restart worker | Pending work resumes safely |
| OPS-T05 | Job exceeds timeout | Recovery bounded; no duplicate provider booking |
| OPS-T06 | Retry exhaustion | Dead-letter status and reason visible |
| OPS-T07 | Backoff schedule | No retry storm |
| OPS-T08 | Large batch | Per-order progress/outcomes available while running |
| OPS-T09 | Seller closes page | Work remains durable; results accessible |
| OPS-T10 | Retry failed item | Only safe retryable items retried; history preserved |

## 5. Shipment documents/tracking/NDR/RTO

| ID | Scenario | Expected |
|---|---|---|
| DOC-T01 | Carrier label available | Real provider label; barcode/required fields verified |
| DOC-T02 | Provider label unavailable | No generic label misrepresented; clear state |
| DOC-T03 | Storage disabled | Job not queued or alternative explicitly used |
| DOC-T04 | Storage outage after job start | Failure state, retry guidance; shipment status remains booked |
| DOC-T05 | Label batch fetch 1/60/100/101/large | Correct chunks, no omissions |
| DOC-T06 | Popup blocked | UI detects; alternate download/action |
| DOC-T07 | Expired presigned URL | Refresh/reissue or clear error |
| DOC-T08 | Manifest failure | No false ready; job reason and retry visible |
| TRK-T01 | Valid tracking event | State mapping correct and timestamped |
| TRK-T02 | Duplicate webhook/replay | Idempotent; no duplicate charge/state side effects |
| TRK-T03 | Invalid webhook secret/signature | Rejected |
| TRK-T04 | Unknown provider status | Preserved/unknown, not falsely delivered |
| TRK-T05 | Stale tracking | Warning; polling/reconciliation path |
| TRK-T06 | NDR retry action | Accepted once, clear state |
| TRK-T07 | RTO action | State and return charge correct once |
| TRK-T08 | Delivered → RTO conflicting event | Policy applied, audit retained |
| TRK-T09 | Cancel delivered shipment | Blocked with clear reason |

## 6. Pagination, bulk actions, reports

| ID | Scenario | Expected |
|---|---|---|
| DATA-T01 | 0/1/page-size/page-size+1 | Correct count and page boundaries |
| DATA-T02 | Filter/search/sort/page change | State resets; no stale cursor |
| DATA-T03 | Page beyond reachable depth | Not offered or uses cursor; no empty false page |
| DATA-T04 | More than 100 orders | Older orders accessible |
| DATA-T05 | More than 2,000 shipments | Complete paginated listing |
| DATA-T06 | More than 5,000 selected | Selection token/batches or explicit complete count |
| DATA-T07 | Assignment above 2,000 | Bounded batches; all outcomes tracked |
| DATA-T08 | Cancellation above 2,000 | Safe chunking, confirm count, all results |
| DATA-T09 | Report 19,999/20,000/20,001 | Export count and truncation explicit |
| DATA-T10 | Report >20k/large | Async/streamed export, completeness manifest |
| DATA-T11 | Report list >20 | Paginated or documented retention/search |
| DATA-T12 | Export API failure midstream | No file falsely presented as complete |
| DATA-T13 | CSV/XLSX opening in Excel | Encoding, columns, identifiers, formulas correct |

## 7. Security/tenant boundaries

| ID | Scenario | Expected |
|---|---|---|
| SEC-T01 | Seller A requests Seller B order/shipment by ID | 404/403; no data leakage |
| SEC-T02 | Seller A modifies Seller B record | Denied; no side effect |
| SEC-T03 | Cross-seller bulk selection | IDs filtered/denied; no partial unauthorized work |
| SEC-T04 | Cross-seller document/presigned URL | Denied |
| SEC-T05 | Cross-seller report/export | Denied |
| SEC-T06 | Admin-only endpoint as seller | Denied |
| SEC-T07 | Expired/invalid session | Reauth; no data cache leak |
| SEC-T08 | CSRF and cross-origin request | Protected |
| SEC-T09 | Rate limit/auth abuse | Limit and log without secret disclosure |
| SEC-T10 | Client bundle/source/log inspection | No secrets, provider credentials, internal fields |
| SEC-T11 | SQL/HTML injection and formula injection | Safely handled |
| SEC-T12 | Audit sensitive action | Actor, request ID, action, result recorded |

## 8. UX/accessibility/resilience

| ID | Scenario | Expected |
|---|---|---|
| UX-T01 | Loading state | No duplicate action; progress feedback |
| UX-T02 | Empty state | Explains why empty and next step |
| UX-T03 | API/network/500 failure | Persistent, actionable, retry-safe message |
| UX-T04 | Validation failure | Field-level errors and focus |
| UX-T05 | Partial bulk success | Counts plus per-row outcomes; export results |
| UX-T06 | Session expiry during action | Safe recovery; no duplicate submission |
| UX-T07 | Keyboard-only workflow | All core controls reachable and operable |
| UX-T08 | Mobile viewport | Core booking/list/forms usable without clipping |
| UX-T09 | Disabled button | Reason clear; no misleading blocked cursor |
| UX-T10 | Confirmation dialog | Destructive actions clearly scoped/count displayed |
| UX-T11 | Repeated clicks | Buttons prevent duplicate requests; server still idempotent |
| UX-T12 | Browser storage blocked | Core workflow remains functional or graceful fallback |

## 9. Release/build/deployment

| ID | Scenario | Expected |
|---|---|---|
| REL-T01 | Frontend lint | Clean or reviewed baseline exceptions |
| REL-T02 | Frontend build | Success |
| REL-T03 | Frontend tests | Pass |
| REL-T04 | Backend typecheck | Pass |
| REL-T05 | Backend unit/integration | Pass |
| REL-T06 | Migration clean DB | Success |
| REL-T07 | Migration existing DB | Success; no data loss |
| REL-T08 | Docker build/compose health | All required services healthy |
| REL-T09 | API/worker process | Correct versions/config; heartbeat |
| REL-T10 | Provider credentials | Verified, not exposed; provider disabled if unverified |
| REL-T11 | Backup/rollback | Tested or owner-approved procedure |
| REL-T12 | Smoke test | Critical user journey passes |

## 10. Execution results (2026-11-25, local throwaway DB + fake providers)

Commands (from `backend/` unless stated): `npx tsc --noEmit`; `npx vitest run`; `node tests/e2e/<name>.mjs` against the API started as described in each file's header. From the repo root: `npm run lint`, `npm run build`, `npm test`.

| Suite | Result |
|---|---|
| Backend typecheck | PASS |
| Backend unit (vitest) | **PASS 511 / 511** (28 files) |
| Frontend lint / production build / unit (`npm test`) | PASS / PASS / **PASS 53 / 53** |
| `e2e/readiness.mjs` | **PASS 38 / 38** |
| `e2e/concurrency.mjs` | **PASS 10 / 10** |
| `e2e/speed.mjs` (queue, pause, resume, 429, 502, negative-balance incident) | **PASS 33 / 33** |
| `e2e/cancel.mjs`, `e2e/actions.mjs`, `e2e/tracking.mjs`, `e2e/notifications.mjs` | PASS 11/11, 22/22, 26/26, 20/20 |
| `e2e/shiprocket.mjs` (Shiprocket-only API) / `e2e/failover.mjs` (both aggregators) | **PASS 26 / 26** and **PASS 8 / 8** (fake providers only) |

Scenario status (IDs from sections 1 to 9). PASS = executed and passed in the environment above. Everything not listed is **NOT RUN**.

| ID | Status | Evidence |
|---|---|---|
| ORD-T09 weight zero | PASS | readiness.mjs: refused by book, auto-assign and queue; no courier call |
| ORD-T10 missing dimensions | PASS | readiness.mjs (all three missing; a partial set cannot exist: DB constraint `orders_package_dimensions_complete`) |
| ORD-T04 invalid mobile, ORD-T11 COD amount | PASS (unit) / DB-enforced | `orderReadiness.test.ts`; table constraints `customers_phone_check`, `orders_check` refuse the state |
| ORD-T05 short address, customer city | PASS | readiness.mjs |
| BOOK-T04 not-ready order submitted | PASS | readiness.mjs: 422 ORDER_NOT_READY, no provider request |
| BOOK-T05 double click / repeated request | PASS | concurrency.mjs (6 identical requests: 1 shipment, 1 debit) |
| BOOK-T06 two concurrent entry paths | PASS | concurrency.mjs (manual + auto-assign + queue + manual) |
| BOOK-T13 provider balance refusal | PASS | speed.mjs sections 4, 5, 7, 9: orders kept, resumed by themselves, no duplicate |
| BOOK-T14 exact charge, one debit | PASS | concurrency.mjs wallet = start minus charges |
| BOOK-T15 cancellation refunds once | PASS | cancel.mjs, speed.mjs |
| BOOK-T18 failover | PASS | failover.mjs |
| BOOK-T19/T20 Shiprocket | PASS against fake only | shiprocket.mjs; **no live account** |
| BOOK-T07 timeout unknown, BOOK-T08 provider success + local save failure | **NOT RUN** | no injection test written (BOOK-001 open) |
| BOOK-T11/T12 wallet / debit limit, BOOK-T16/T17 | NOT RUN in this run | covered by earlier suites only |
| OPS-T02 worker stopped, OPS-T03 crash mid-job, OPS-T05/T06 | **NOT RUN** | needs a separate worker process |
| OPS-T04 restart resumes, OPS-T09 page closed | PASS (queue persisted in DB) | speed.mjs sections 4, 5, 9 |
| DOC-T06 popup blocked | PASS (unit logic only) | openDocs.test.mjs; **real browser NOT RUN** |
| DOC-T05 label batch 60/61/100/5000 | PASS (unit boundary) | openDocs.test.mjs |
| TRK-T02 duplicate webhook, TRK-T04 unknown status | PASS | tracking.mjs, shiprocketPlugin.test.ts |
| TRK-T03 invalid webhook secret | PASS | shiprocket.mjs |
| TRK-T06 NDR retry accepted once | PASS (state only) | tracking.mjs; **provider NDR action NOT sent for Shiprocket** |
| SEC-T01..T05 | PARTIAL | foreign order id, foreign batch, foreign notification checks inside existing suites; **no full suite** |
| UX-T05 partial bulk success | PASS (logic) | bulkOutcome.test.mjs; browser NOT RUN |
| UX-T01..T04, T06..T12 | NOT RUN | no browser or accessibility run |
| REL-T01..T04 | PASS | see above |
| REL-T06 migration clean DB | PASS | all 75 migrations applied from empty on a throwaway database |
| REL-T07 migration existing DB, REL-T08 Docker, REL-T09, REL-T11 backup / rollback | **NOT RUN** | |

## 11. Second run, 2026-11-25 (isolated runner; supersedes section 10 where they differ)

Command: `cd backend && npm run test:e2e` (needs a throwaway Postgres on 127.0.0.1:5544). Each suite: fresh database, own API process, no real provider keys.

| Check | Result |
|---|---|
| Backend typecheck / build, unit tests | PASS / PASS, **524 / 524** |
| Frontend lint / production build, unit tests | PASS / PASS, **66 / 66** |
| Migrations: empty database / copy with data | PASS (76) / PASS (75 -> 76) |
| readiness 38, orders 21, concurrency 10, reconcile 21, heartbeat 17, tenancy 16, speed 33, cancel 11, actions 22, tracking 26, notifications 20, webhooks 31, shiprocket 26, failover 8, cod 20, metrics 27, manifests 20, states-otp 10, lazy 43, adminLists 32, limits 9, platform 21 | **22 / 22 suites, 482 checks, all PASS** |

Newly covered: BOOK-T07, BOOK-T08, BOOK-T09 (lost answer, our database failing, crash), BOOK-T19 (undo retried), OPS-T02, OPS-T03, OPS-T05 (worker stopped, killed, restarted), SEC-T01 to SEC-T05, ORD duplicate / repeat-buyer cases, TRK NDR / RTO requests, DATA limits.
NOT RUN: anything in a browser, live couriers, Docker images, backup / rollback, production configuration.
