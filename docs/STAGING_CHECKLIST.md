# NEXGO staging readiness checklist

**Purpose:** the gate between "works on my machine" and "a real seller cohort touches this." Every item below is either checked with a date and what was actually done, or explicitly left open with what's blocking it — no unchecked boxes without a reason.

## Environment & infrastructure

- [x] Local dev stack reproducible from a clean checkout: `docker compose -f compose.backend.yml up -d` → `npm run migrate` → `npm run dev` + `npm run worker`. Verified 2026-09-13 by running the full sequence against a fresh set of containers.
- [ ] Staging environment provisioned on AWS per `AWS_BACKEND_PLAN.md` (RDS Postgres, ECS Fargate, S3, Secrets Manager). **Not started** — this checklist is written to be run again once that environment exists, not a substitute for provisioning it.
- [ ] Staging environment uses its own database, MinIO/S3 bucket, and Razorpay/courier sandbox credentials — never the values in `backend/.env`. **Blocked on the above.**

## Database — backup & restore

- [x] **Restore drill actually run, not just documented.** 2026-09-13: `pg_dump -F c` the local database (134KB), created a scratch database, `pg_restore` into it, compared row counts across 13 tables (sellers, users, orders, shipments, wallet_entries, audit_events, invoices, cod_remittance_cycles, seller_kyc, courier_zones, sessions, job_runs, webhook_deliveries) — every table matched exactly, source to restored. Spot-checked one invoice row's content (number + total) survived byte-for-byte. Total time: under a second at this data volume. Scratch database and dump file cleaned up afterward.
- [ ] Same drill repeated against an actual RDS automated snapshot once staging exists — local Postgres proves the mechanism works, not RDS-specific snapshot/restore timing at real data volume.
- [ ] Define and document actual RPO/RTO targets once real usage volume is known.

## Security

- [x] Row-level security enabled on every seller-owned table, verified by direct cross-seller access attempts (see `ENGINEERING_HANDOFF.md` items 10, 13).
- [x] CSRF double-submit cookie enforced on every mutating request, verified with a real 403-then-201 test (`ENGINEERING_HANDOFF.md` item 21).
- [x] Rate limiting live on every auth endpoint (`ENGINEERING_HANDOFF.md` item 22).
- [x] TOTP MFA for platform admins, verified end-to-end including wrong-code and challenge-replay rejection (`ENGINEERING_HANDOFF.md` item 20).
- [x] Provider credentials and KYC bank details encrypted at rest with AES-256-GCM (local key) — **must move to AWS KMS envelope encryption before production**, per `AWS_BACKEND_PLAN.md` phase 1/3. Local key is explicitly documented as dev-only in `src/lib/crypto.ts`.
- [ ] Independent penetration test. **Not started** — per `AWS_BACKEND_PLAN.md` phase 10, this happens once staging is live with realistic data, not against a local dev database.
- [ ] Dependency vulnerability scan resolved: `minio` package has 4 moderate transitive vulnerabilities (see `ENGINEERING_HANDOFF.md` "Known pre-existing issue"). Needs a deliberate decision by whoever owns that dependency, not a silent downgrade.
- [ ] Secrets rotation exercise (rotate `LOCAL_ENCRYPTION_KEY` equivalent in AWS Secrets Manager, confirm no downtime). Requires AWS environment.

## Application correctness

- [x] Idempotent booking, verified: retried booking requests don't create duplicate shipments.
- [x] Idempotent webhooks, verified for both courier tracking events and Razorpay payment webhooks: identical replayed payloads are no-ops, not double-applied.
- [x] Append-only wallet ledger — no code path updates a balance directly, every credit/debit is a `wallet_entries` row; verified the full recharge → webhook → credit chain produces exactly one ledger entry even under a replayed webhook.
- [x] Gapless invoice numbering, verified by inspecting the sequence logic and confirming a generated invoice's number matches the expected series position.
- [ ] Load test against the webhook and booking endpoints specifically (courier scan volume, payment webhook bursts) — not run yet; needs to happen against staging, not a laptop.
- [ ] End-to-end test suite (signup → sync → quote → book → track → NDR → ledger) automated, not just manually verified per-feature during development. Currently every flow above was verified manually against the running stack during its own build session — real verification, but not a regression-proof automated suite yet.

## Operational visibility

- [x] Admin audit-event log, cross-tenant, filterable — verified against real data.
- [x] Background job visibility + retry, verified: a dead-lettered job was retried and correctly refused a second retry attempt while still queued.
- [x] Webhook delivery visibility (couriers and Razorpay both log to the same table) — verified real deliveries appear.
- [ ] Alerting on job failure rate / webhook failure rate / auth failure spikes. No alerting exists yet — `job_runs`/`webhook_deliveries` are queryable but nothing pages anyone. Needs CloudWatch Alarms (or equivalent) once on AWS.

## What this checklist is not

Not a launch approval, and not a substitute for the phase-by-phase build order in `BACKEND_PLAN.md`. It's the list of "did we actually check this, and how" for the parts of the local-first build that are done, so staging setup starts from a known-true baseline instead of re-verifying everything from zero.
