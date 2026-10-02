# NEXGO engineering handoff

Read this before changing backend code. The project is a multi-tenant Indian shipping
platform with a seller portal and a separate platform-admin portal. It is a local-first
production build, not an MVP mock.

## Current state

- Branch: `main` (`backend/seller-admin-foundation` has been fully merged).
- API: Fastify/TypeScript in `backend/`, local port 4010.
- Local services: PostgreSQL 16, Redis, MinIO, Mailpit in `compose.backend.yml`.
- Start: `docker compose -f compose.backend.yml up -d`; `cd backend && npm run migrate`;
  run `npm run dev` and `npm run worker` in separate terminals.
- Main database is PostgreSQL; AWS target is RDS PostgreSQL. Never replace it with a
  frontend mock database.
- An admin account with TOTP enrolled needs a code at login, not just the password.
  Enrol through `/v1/admin/mfa` (see `src/lib/totp.ts`). To return a local admin to
  password-only, clear the three `totp_*` columns on its `platform_admins` row.
  Never commit TOTP secrets to the repo, local or otherwise.
- Every mutating request (POST/PUT/PATCH/DELETE, except `/v1/webhooks/*`) now
  needs an `x-csrf-token` header matching the `nx_csrf` cookie issued at login —
  the frontend's fetch wrapper needs to read that cookie and attach the header,
  or every write from the UI will 403 once it's wired to this API.

## Implemented and verified

1. Seller sign-up/login/logout and separate admin login.
2. Tenant-scoped seller data: warehouse, customer, product, order, order item.
3. Admin courier service catalogue, seller eligibility, COD controls, rate cards.
4. Admin destination-pincode allow/block rules. Quote and booking enforce these rules.
5. Quote calculation, shipment booking idempotency, AWB, tracking state/event timeline.
6. HMAC-signed courier webhook ingestion and duplicate-event prevention.
7. NDR reattempt/RTO actions and append-only wallet-ledger schema.
8. Channel connection/job records and a Postgres-backed worker.
9. **(Engineer B)** Seller KYC: submission (GSTIN/PAN/entity/bank details, bank
   account number AES-256-GCM encrypted at rest, never returned to any client
   including the submitting seller), admin review queue, approve/reject with
   audit trail. `src/routes/kyc.ts`, `src/lib/crypto.ts`, migration `0010`.
10. **(Engineer B)** Admin seller lifecycle: paginated/filterable seller list
    with KYC-status join, seller detail (KYC + members + wallet balance +
    shipment breakdown), and state transitions (onboarding→active requires
    KYC `verified` first — enforced server-side, not just in the UI).
    `src/routes/adminOperations.ts`.
11. **(Engineer B)** Courier zone mapping: destination-pincode-prefix → zone
    reference table backing the admin "Zone mapping" screen. Migration `0011`.
12. **(Engineer B)** Platform-wide shipment and NDR queues (cross-tenant,
    admin-only, filterable by state/seller) — same file as #10.
13. **(Engineer B)** Admin role gating beyond the single platform-admin check:
    `requireCommercialAdmin` (couriers/rates/zones — super_admin/ops_admin
    only) and new `requireAccountAdmin` (seller state + KYC decisions —
    super_admin/ops_admin/finance_admin). Verified against a real
    `support_admin` account: read access stays open, writes 403 correctly.
    `src/lib/adminAuth.ts` (extracted from `admin.ts` so both new route files
    and the original share one guard implementation instead of three).
14. **(Engineer B)** Wallet recharge: `src/lib/razorpay.ts` mirrors the mock
    courier adapter pattern — no live keys means a deterministic mock order
    and a self-signed webhook, so the full recharge → HMAC-verified webhook
    → idempotent ledger credit flow is tested end to end without a real
    Razorpay account (verified: balance credits once, replay is a no-op, bad
    signature is 401). Migration `0013`, `src/routes/walletRecharge.ts`.
15. **(Engineer B)** Invoices: gapless sequential numbering (`NX/FY/000001`,
    counter increments in the same transaction as the insert so a failed
    invoice never leaves a gap), 18% GST computed from real shipment
    charges, admin generate/issue, worker renders a real PDF via pdfkit into
    MinIO (verified: 1669-byte PDF actually produced). `src/routes/
    invoices.ts`, `worker.ts` `invoice.generate` handler.
16. **(Engineer B)** COD reconciliation: three-step cycle (generate → approve
    → remit), each step audited and role-gated, remit refuses to run before
    approve (verified: 409). COD cash is tracked in its own table, not
    folded into `wallet_entries`, since courier-collected COD never actually
    enters the prepaid wallet. `src/routes/codRemittance.ts`.
17. **(Engineer B)** Team invitations: owner-only invite/revoke/remove, real
    email delivery via Mailpit (verified: email actually arrives, accept
    link works, token is single-use — 410 on replay). `src/routes/team.ts`.
18. **(Engineer B)** Password reset: never confirms/denies whether an email
    is registered, single-use 60-minute token, resetting revokes every
    existing session for that user (verified: old session 401s immediately
    after reset). `src/routes/passwordReset.ts`.
19. **(Engineer B)** Session visibility + revocation for both seller and
    admin users: device/IP now captured on every session row, `GET .../
    sessions` lists them with a `current: true` flag, `DELETE .../sessions/
    :id` and `.../revoke-others` work. `src/routes/sessions.ts`.
20. **(Engineer B)** TOTP for platform admins: self-contained RFC 6238
    implementation (`src/lib/totp.ts`, no third-party TOTP package — cross-
    checked against an independent Python reference implementation during
    testing, not just unit-tested against itself). Two-step login once
    enrolled (password → short-lived challenge → code), challenges are
    single-use, secret encrypted at rest via the same AES-256-GCM helper
    KYC uses. Verified end-to-end including wrong-code rejection and
    challenge replay rejection. `src/routes/adminMfa.ts`.
21. **(Engineer B)** CSRF: double-submit cookie (`nx_csrf`, non-httpOnly)
    issued alongside every session cookie, required as `x-csrf-token` on
    every mutating request; webhook routes are exempt (HMAC-authenticated,
    no session to forge). Verified: missing/wrong token 403s, correct token
    passes through to normal route validation, GETs are unaffected.
    `src/lib/csrf.ts`.
22. **(Engineer B)** Rate limiting: global 300 req/min via `@fastify/rate-
    limit`, tighter per-route limits (10/min) on every login, signup, and
    MFA-verify endpoint, 5/min on password-reset requests.

Known pre-existing issue, not introduced by this work and not fixed here
since it's in shared infra (`minio` dependency, Engineer A's): `npm audit`
shows 4 moderate transitive vulnerabilities in `minio`'s own dependency
tree. Fixing requires a breaking `minio` downgrade — worth a deliberate
decision by whoever owns that file, not a silent side effect of this task.

23. **(Engineer B)** Audit/job/webhook admin visibility: `GET /v1/admin/
    audit-events` (cross-tenant, filterable), `GET /v1/admin/jobs` +
    `POST /v1/admin/jobs/:id/retry` (verified: a dead-lettered job requeues
    and correctly refuses a second retry while still queued), `GET /v1/
    admin/webhook-deliveries` (couriers and Razorpay both log here now —
    the Razorpay webhook handler was extended to log every delivery to the
    same table couriers use, for parity). `src/routes/adminVisibility.ts`.
24. **(Engineer B)** Real backup/restore drill — not a checklist line, an
    actual `pg_dump` → scratch database → `pg_restore` → row-count diff
    across 13 tables, all matching exactly, plus a byte-for-byte content
    spot-check on one row. Documented with the real numbers in
    `STAGING_CHECKLIST.md`.
25. **(Engineer B)** `STAGING_CHECKLIST.md`: every item is either checked
    with what was actually verified and when, or explicitly left open with
    what it's blocked on (mostly: an AWS environment existing) — no
    unchecked boxes without a stated reason.
26. **(Engineer B)** Admin frontend wiring — **scoped, not exhaustive.**
    `lib/api.js` is a shared fetch client (credentials + CSRF header
    handling) any admin screen can use. `AdminLogin.jsx` is fully wired to
    the real API including the MFA step, and was verified end-to-end
    through an actual browser session: real password check against the
    live database → real MFA challenge → TOTP verified → real session
    cookie → landed on the dashboard, zero console errors. The dashboard
    itself and the sellers/KYC/zones list screens are **still rendering
    mock data** — wiring those needs either accepting their mocked
    analytics (revenue trend, NDR trend, API usage) as out of scope, or
    building aggregation endpoints for them first, which wasn't in the
    Days 9-10 brief as written. Flagging this explicitly rather than
    claiming more than what's actually wired.

## Non-negotiable rules

- Every seller-owned record needs `seller_id`, server-side ownership checks, and RLS.
- Do not trust seller IDs, prices, courier credentials, shipment status, or roles from UI.
- Monetary data is append-only. Never update a wallet balance directly.
- Bookings and all external webhooks must be idempotent.
- Do not log secrets, PII, passwords, raw payment data, or courier credentials.
- Provider credentials must be encrypted; use AWS KMS/Secrets Manager in production.
- Never deploy local `.env` values or the Docker database to production.

## Two engineers / two-week execution plan

### Engineer A — integrations and seller operations

Days 1–3: real courier adapter interface, one company/Delhivery sandbox adapter,
serviceability, provider booking confirmation lookup, label/manifest jobs.

Days 4–6: MinIO private-file layer, Shopify OAuth/webhook/sync adapter, worker retries
and dead-letter handling.

Days 7–8: seller frontend wiring for login, orders, quotes, booking, shipments, NDR.

Days 9–10: integration tests for duplicate orders, duplicate booking, webhook replay,
and cross-seller access.

### Engineer B — admin, money, and hardening

Days 1–3: admin seller lifecycle, KYC, courier pincode/zone UI/API, platform shipment
and NDR queues. **Done 2026-09-13** — see items 9–13 above. Pincode allow/block rules
were already covered by Engineer A's earlier admin.ts work; zone *mapping* (the
reference table a rate card's `zone_code` should resolve against) was the piece
still missing and is now in migration `0011`.

Days 4–6: wallet recharge architecture, Razorpay sandbox webhook, COD reconciliation,
invoice metadata and finance approvals. **Done 2026-09-13** — see items 14–16 above.

Days 7–8: team invitations, password reset, session revocation, TOTP for admin/finance,
CSRF and rate limiting. **Done 2026-09-13** — see items 17–22 above.

Days 9–10: admin UI wiring, audit/job/webhook visibility, staging checklist and restore
test. **Done 2026-09-13** — see items 23–26 above. Admin UI wiring is scoped to login +
a shared API client, not every screen; see item 26 for exactly what's real vs. still mock.

## Day-10 acceptance target

A seller can sign up, create/sync an order, receive a real sandbox quote, book exactly
once, download a private label, track shipment, resolve NDR, and view a reproducible
ledger. An admin can approve sellers, control rates/services/pincodes, inspect platform
operations, and audit privileged actions. Production payment/courier credentials remain
client-controlled until AWS staging is ready.
