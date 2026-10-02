# NEXGO backend plan

**Purpose:** take NEXGO from a front-end prototype to a secure, multi-tenant logistics platform. This is an implementation sequence, not a promise to build every feature at once. A phase only closes once its acceptance and security gates pass.

## Recommended starting shape

Start as a **modular monolith**, not microservices: one TypeScript backend, one PostgreSQL database, Redis-backed job workers, and object storage. Keep modules isolated (`identity`, `orders`, `couriers`, `shipments`, `money`, `notifications`, `admin`) so they can be split later if scale requires it.

- API: REST first, documented with OpenAPI; webhooks for external events.
- Primary data: PostgreSQL with strict tenant scoping.
- Async work: Redis queue and dedicated workers for imports, courier syncs, tracking, exports, notifications, invoices, and retries.
- Files: private object storage with short-lived signed URLs only.
- Secrets: managed secret store/KMS; never browser storage, source control, database plaintext, or logs.
- Environments: local, preview/staging, production with isolated databases, credentials, and payment/courier accounts.

## Non-negotiable security rules

1. Every seller-owned query is tenant-scoped in code **and** enforced with PostgreSQL row-level security.
2. Every privileged action is authorized server-side; hiding a button is never authorization.
3. Ledger records, shipment events, webhook deliveries, admin actions, and security-sensitive changes are append-only/audited.
4. All external webhooks are signature-verified, timestamp-checked, idempotent, and queued before processing.
5. Credentials, KYC documents, payment data, and customer PII receive field-level protection, least-privilege access, and redacted logging.
6. No direct production database edits. Operational changes use controlled admin actions with audit trails.

---

## Phase 1 — Architecture, environments, and secure delivery

**Build**

- Create the backend repository/application, database schema migration workflow, queue worker, and OpenAPI contract.
- Provision local, staging, and production environments with independent data and secrets.
- Add CI: lint, tests, dependency checks, migrations, and deployment promotion.
- Define observability: structured logs, request IDs, error monitoring, health checks, metrics, and job monitoring.

**Security**

- Threat-model the platform before feature work: tenant escape, credential theft, webhook forgery, payment fraud, malicious file upload, and admin misuse.
- Enforce TLS, secure headers, CORS allow-lists, rate limiting, schema validation, secret scanning, dependency vulnerability scanning, and minimum IAM permissions.
- Establish backup, restore, incident response, and production-access policy.

**Exit gate:** a deployed empty API can authenticate service-to-service calls, run migrations safely, enqueue jobs, emit observable logs, and recover from a database backup in staging.

## Phase 2 — Identity, tenancy, sessions, and RBAC

**Build**

- Seller, user, organisation membership, roles, invitation, signup, login, password reset, sign-out, and session management.
- Roles: Owner, Operations, Finance, Read-only, Platform Admin, and Support (if needed).
- API middleware that resolves tenant + role before every protected request.
- Basic team/profile and recent sign-in APIs for the existing UI.

**Security**

- Passwords with Argon2id; reset tokens are one-time, hashed at rest, short-lived, and rate-limited.
- Secure, HTTP-only, SameSite cookies; session rotation; device/session revocation; CSRF protection for cookie-authenticated mutations.
- MFA required for platform admins and finance/payout actions; optional for seller owners initially.
- Add tenant-isolation tests that deliberately attempt cross-seller reads/writes.

**Exit gate:** a user from Seller A cannot access, search, export, or mutate Seller B data by changing a URL, ID, request body, or token claim.

## Phase 3 — Core seller operations and source-of-truth data model

**Build**

- Seller onboarding, warehouses, pickup contacts/cutoffs, customer addresses, products/SKUs, orders, order items, and manual B2C/reverse order creation.
- Versioned status/state transitions for orders; import/export domain contracts.
- Audit event model used by every later module.
- Replace a small, high-value slice of mock data in the UI: dashboard identity, warehouses, and manual order creation.

**Security**

- PII classification for customer phone/address/email; encrypt sensitive fields at rest where justified and redact them in logs/analytics.
- Validate Indian postal code, phone, and address input server-side; protect against mass assignment.
- Use UUID/opaque external identifiers where enumeration risk matters.

**Exit gate:** an authorised seller can create an order and warehouse, view only their own data, and retrieve an immutable audit timeline for the changes.

## Phase 4 — Channel integrations and dependable order sync

**Build**

- Connector framework for Shopify, Amazon, WooCommerce, Magento, and OpenCart, beginning with a mock adapter and one real provider.
- OAuth/API credential connection flow, per-channel sync settings, sync jobs, sync history, de-duplication, and reconciliation.
- Inbound orders, cancellations, fulfilment updates, and per-channel error reporting.

**Security**

- Encrypt provider tokens with envelope encryption; rotate/revoke them cleanly and never return raw tokens to the UI.
- Verify provider webhooks; process asynchronously; make all inbound events idempotent using provider event IDs.
- Rate-limit outbound provider calls and use retry/backoff with dead-letter queues.

**Exit gate:** reconnecting or replaying a provider event never creates duplicate orders; token leakage tests and webhook signature tests pass.

## Phase 5 — Courier gateway, serviceability, and rate engine

**Build**

- A provider-neutral courier interface: `serviceability`, `quote`, `book`, `cancel`, `label`, and `track`.
- Pincode coverage, zones, chargeable-weight calculation, seller rate-card versions, rate calculator, and courier allocation rules.
- Start with a deterministic mock courier adapter, then integrate one live courier end-to-end.

**Security**

- Courier API credentials are isolated per provider/environment; outbound requests are constrained and audited.
- All rate calculations preserve inputs, rate-card version, quote validity, and resulting decision for later disputes.
- Protect high-volume pincode and quote endpoints with rate limits, quotas, and bulk-upload validation.

**Exit gate:** the same booking inputs produce an explainable quote result; expired/altered quotes cannot be booked; provider failures degrade safely without losing an order.

## Phase 6 — Shipment booking, labels, manifests, and tracking

**Build**

- The Ship Now flow: quote selection, booking confirmation, AWB assignment, labels, manifests, pickup scheduling, cancellation, and shipment detail.
- Tracking event ingestion through webhook/polling, a canonical shipment state machine, scan-event timeline, and promised-date logic.
- Async PDF generation and private download links for labels/manifests.

**Security**

- Booking uses idempotency keys so double-clicks, retries, and network timeouts do not create duplicate shipments or charges.
- Persist raw courier payloads separately from normalised events; verify source, record provenance, and prevent status regression.
- Private files are virus-scanned where uploads exist, access-checked, and downloaded via expiring signed URLs.

**Exit gate:** a shipment can be booked exactly once, its label can only be accessed by the owning tenant, and repeated tracking events do not corrupt its current state.

## Phase 7 — Exceptions, automation, and customer communication

**Build**

- NDR workflow, delivery attempts, SLA clocks, reattempt/RTO decisions, weight discrepancies, evidence uploads, and courier dispute lifecycle.
- Notification policy engine for seller alerts and customer messages; WhatsApp/SMS/email adapters begin with staging/sandbox accounts.
- Scheduled automation: NDR escalation, SLA warnings, auto-RTO, retry queues, and exception dashboards.

**Security**

- Make automation actions explainable and reversible where possible; record who/what triggered every resolution.
- Require explicit authorisation for bulk exception actions; preview impact and provide a short undo window where operationally safe.
- Consent, template approval, opt-out, and delivery logs are enforced for customer communication.

**Exit gate:** no exception action can silently change a shipment state; every automated or manual transition is visible in its audit history.

## Phase 8 — Money, payments, COD, invoices, and compliance

**Build**

- Append-only wallet ledger, shipment charge breakdowns, recharge flow, payment-gateway webhooks, COD payout cycles, holds/releases, GST invoices, and finance exports.
- Finance roles and approval workflow for high-risk operations; payout reconciliation jobs.
- Integrate payment gateway in sandbox first, then production after reconciliation controls pass.

**Security**

- Treat money as a double-entry/append-only accounting domain; never edit a balance directly. Corrections are compensating entries.
- Payment and payout webhooks are signature-verified, idempotent, and reconciled against expected amounts.
- Step-up MFA plus dual approval for payout release, bank-account changes, and large manual adjustments; immutable audit trail with before/after values.
- Do not store card data; use gateway-hosted payment flows. KYC/bank documents are access-restricted and retention-controlled.

**Exit gate:** wallet balance can be recomputed exactly from the ledger; a payout cannot be approved by the requester alone; invoice numbering is unique and immutable.

## Phase 9 — Reporting, admin control plane, and operational resilience

**Build**

- Dashboard/KPIs from read models, scheduled/on-demand MIS reports, CSV/XLSX/PDF exports, saved views, full-text search, and signed file delivery.
- Admin panel for sellers, courier health, job runs, support investigations, KYC review, and payout approvals.
- Back-office tools for retrying failed jobs and viewing integration/webhook delivery history.

**Security**

- Separate admin domain/permissions from seller RBAC; platform support has just-in-time, time-limited, audited tenant impersonation only if truly needed.
- Export permissions, row limits, watermarked/audited sensitive exports, short-lived download links, and DLP-aware logs.
- Read models never become a bypass for tenant scoping; admin queries require explicit platform roles.

**Exit gate:** an admin can resolve a failed job without direct database access, and every cross-tenant lookup/export leaves an auditable trail.

## Phase 10 — Security hardening, scale testing, and launch readiness

**Build**

- End-to-end tests for critical flows: signup → order sync → quote → booking → tracking → NDR → wallet/COD → invoice.
- Load tests for order sync, tracking spikes, queue backlogs, reporting, and webhook replay.
- Security review, accessibility review of new authenticated flows, runbooks, support playbooks, and staged rollout/feature flags.

**Security**

- Independent penetration test before handling live money/KYC at scale; fix critical/high findings before launch.
- OWASP ASVS-aligned review, SAST/DAST, dependency/SBOM review, secret rotation exercise, backup-restore drill, and incident simulation.
- Define RPO/RTO, alert thresholds, on-call ownership, breach-response procedure, retention/deletion policy, and vendor-risk records.

**Exit gate:** production launch checklist passes, critical security findings are closed, recovery drill succeeds, and a limited seller cohort can operate with monitoring and rollback capability.

---

## Decisions for the three-way discussion

These are the choices to settle with Claude before implementation starts:

1. **Backend stack:** TypeScript/NestJS or Fastify, versus another team-preferred framework.
2. **Database isolation:** PostgreSQL row-level security as baseline; decide whether enterprise customers ever need dedicated databases.
3. **Auth provider:** managed identity service versus self-hosted sessions; decide MFA/provider requirements now.
4. **First integrations:** choose one storefront, one courier, one payment provider, and one notification provider for the MVP.
5. **Money scope:** decide whether NEXGO will initiate payouts or begin with reconciliation + human-approved external transfers.
6. **Compliance scope:** identify legal/KYC/GST obligations and the markets in which launch is planned before Phase 8.
7. **Data residency and retention:** decide India-region hosting, PII retention, document retention, and delete/export rights.
8. **Admin model:** whether support impersonation is needed; if yes, require explicit justification, time limit, and audit trail.

## Claude's recommendations

I drafted this same ten-phase sequence independently before seeing this document, and the two line up almost exactly — same phase order, same "security in every phase, not bolted on at the end" stance, same exit-gate discipline. That's a good sign neither of us is missing an obvious step, so rather than re-litigate phase order, here's where I'd land on each open decision, with the reasoning so it's arguable rather than just asserted:

1. **Backend stack — Next.js Route Handlers for the API, a separate plain Node worker for async jobs.** Skip NestJS: its DI/decorator ceremony buys you little at this team size and this is a modular monolith, not a microservice mesh — Fastify's discipline without the framework overhead is the right weight class. But I'd go further and ask whether a *separate* API framework is even needed yet: the frontend is already Next.js, and colocating the API as Route Handlers in the same repo removes a whole deployment/CORS/auth-cookie-sharing surface for a small team. The one thing that can't live there is the queue worker — BullMQ workers need a long-running process, which Vercel's serverless functions aren't built for — so that's the one piece I'd split out as its own lightweight Node service from day one, talking to the same Postgres.

2. **Database isolation — agree, RLS baseline, no dedicated databases yet.** Per-tenant databases are a real feature, but building for a hypothetical enterprise customer before one exists is exactly the kind of premature abstraction that costs more than it saves. Revisit only when a contract actually requires it.

3. **Auth — self-hosted sessions, not a managed identity provider.** NEXGO's login/signup/role UI is already fully custom-designed; bolting on Auth0/Clerk means fighting their opinions on flows we've already designed, for a login system that isn't actually hard to build correctly (Argon2id + rotating sessions + rate limiting covers most of the real risk). MFA: TOTP, not SMS — SMS OTP is vulnerable to SIM-swap and India's DLT SMS rules add friction for no security benefit here. Required for Platform Admin and Finance roles at launch per this doc's own Phase 2 rule; optional for Owners initially, as written.

4. **First integrations — Shopify, Delhivery, Razorpay, and email-only (defer WhatsApp/SMS).** Shopify has the best-documented API and sandbox of the five storefronts, so it de-risks Phase 4 fastest. Delhivery has the broadest pincode coverage of the courier list, making it the most representative single courier to validate the Phase 5 abstraction against. Razorpay is the default Indian gateway with a real sandbox. For notifications, I'd cut WhatsApp and SMS from the MVP entirely, not just sequence them later: WhatsApp template approval and SMS DLT registration are bureaucratic processes with lead times outside engineering's control, and transactional email covers every MVP notification need (order confirmed, NDR raised, invoice ready) without waiting on a third party's approval queue. Start that registration process in parallel, in the background, so it's ready by the time Phase 7 needs it — but don't block MVP on it.

5. **Money scope — reconciliation + human-approved payouts, not NEXGO-initiated automated disbursement.** This is the one place I'd be firm rather than just lean: in India, a platform that automatically moves money out to third parties on its own initiative starts brushing up against RBI Payment Aggregator/Payment Gateway authorization requirements, which is a legal registration process, not an engineering task. Automating payouts before that's resolved isn't a technical risk, it's a regulatory one. Human-approved external transfer for v1, full stop, and revisit automation only after Phase 8's legal review names it as clear.

6. **Compliance scope — India only for launch.** Multi-market compliance (different tax regimes, different KYC rules, different data-residency law) multiplies Phase 8's real work for zero MVP benefit if there's no committed non-Indian seller yet. Scope GST/KYC/RBI rules to India, and treat "which other market" as a phase-11-and-beyond question if and when it's actually asked for.

7. **Data residency — India-region hosting (ap-south-1 or equivalent), retention tied to two different clocks, not one.** GST invoices carry their own statutory retention period (multi-year, set by tax law, non-negotiable) independent of whatever account-retention policy applies to customer PII — don't let one policy accidentally govern both. Customer PII: purge within a defined window after account closure unless a specific invoice/KYC record legally requires it to persist, in which case only that record survives, not the whole customer profile.

8. **Admin model — no impersonation in the MVP.** It's a significant trust and audit surface to build correctly, and early-stage support volume doesn't need it yet — a support agent can ask a seller to reproduce an issue or share a screenshot for the first several months. If it becomes a real bottleneck later, build it then, with the time-limited/justified/audited constraints this doc already specifies.

**One addition this document doesn't cover: sequencing versus team size.** Phases 1–3 are strictly sequential — nothing after tenancy exists is safe to build. But once Phase 3 (orders) is real, Phase 4 (channels) and the *mock-adapter* half of Phase 5 (courier abstraction) can run in parallel if more than one person is building this — they don't depend on each other, only on orders existing. Worth deciding now whether this is a solo build or has a second engineer, since it changes whether that parallel lane is worth planning around.

## Suggested definition of “backend MVP complete”

NEXGO is MVP-functional when a seller can securely sign up, create or sync an order, obtain a courier quote, book a shipment, download a label, see tracking, resolve an NDR, and view an accurately computed wallet ledger. Live payouts, multi-provider integrations, marketing, advanced reporting, and the full admin control plane can follow in controlled increments.
