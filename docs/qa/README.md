# NEXGO QA & Production Readiness

**Purpose:** One authoritative QA entry point for the two-day stabilization effort.  
**Baseline:** Repository `main` as inspected on 2026-11-25.  
**Working branch:** `qa/production-readiness-2day`  
**Status:** Audit and test planning started; no application code has been modified by this QA branch yet.

## Primary execution specification

- [Master production stabilization specification — unified requirements, workflows, test strategy, two-day execution and release gates](./MASTER_PRODUCTION_STABILIZATION_SPEC.md)

Use this document as the single primary instruction to Claude Code. The other QA documents are supporting defect/test/evidence registers.

## Documents

- [Master problem statement and production-readiness objectives](./MASTER_PROBLEM_STATEMENT.md)
- [Consolidated defect register](./DEFECT_REGISTER.md)
- [Two-day execution plan](./TWO_DAY_EXECUTION.md)
- [Regression and acceptance test matrix](./TEST_MATRIX.md)
- [Release gates and sign-off](./RELEASE_GATES.md)
- [Frontend order-flow audit](./FRONTEND_ORDER_FLOW_AUDIT.md)

## Working principles

1. **No unsupported green status.** A test is Pass only with evidence from an execution. Code inspection alone is not a runtime pass.
2. **Protect money and shipment integrity.** Avoid duplicate bookings, duplicate wallet debits/refunds, lost jobs, and false shipment states.
3. **No silent partial success.** Bulk operations and exports must disclose every skipped, failed, retried, truncated, or incomplete item.
4. **Actionable user experience.** Persistent order-level results, clear next actions, and safe retry behavior take precedence over transient toast messages.
5. **One authoritative validation pipeline.** Quote, manual booking, synchronous auto-assignment, queued assignment, and bulk upload must share business eligibility rules.
6. **Scope is risk-led.** P0/P1 defects, high-risk regressions, and release blockers first. Cosmetic work cannot displace reliability.
7. **Two-day target is not a guarantee of full certification.** If live carrier access, infrastructure, or client decisions are unavailable, record blockers and do not claim verified production readiness.

## Status vocabulary

- **Confirmed defect:** Supported by code inspection or reproducible behavior.
- **Risk / needs verification:** Plausible failure requiring runtime or deeper code proof.
- **Not tested:** No evidence yet.
- **Fixed:** Code change exists.
- **Verified:** Relevant test executed and evidence recorded.
- **Blocked:** Verification or fix cannot proceed because an external prerequisite is missing.

## Baseline limitations

This baseline is based on repository review and prior audit notes. The QA team has not yet run the full application, test suites, browser automation, live carrier transactions, production deployment checks, or inspected production logs in this session. Frontend review has now become possible through repository tree access, but components still need to be inspected systematically.
