# NEXGO — Local-first backend plan

## Purpose

Build the actual NEXGO product logic for the seller portal and platform admin portal **before AWS infrastructure is introduced**. The result must run locally and in a lightweight staging environment, but use interfaces that can later move unchanged to ECS, RDS, SQS, S3, Cognito, and EventBridge.

This is not a throwaway prototype backend. It is the production domain model and API, started with local infrastructure.

## Current implementation status — 13 September 2026

Completed locally: Docker infrastructure; PostgreSQL migrations; seller/admin sessions;
seller isolation; warehouses, products, customers and orders; platform courier services;
seller access and versioned rate cards; destination-pincode allow/block rules; quote and
idempotent booking; canonical tracking/webhook ingest; NDR; wallet-ledger foundation;
channel connection/job models; and a database-backed worker.

Not yet production-complete: real provider adapters, file/label generation, jobs beyond
the deterministic local channel-sync handler, payment/COD/invoices, KYC/admin operations,
team security, frontend API wiring, AWS deployment, and test/security gates. Read
`ENGINEERING_HANDOFF.md` before making changes: it contains ownership, constraints, and the two-week plan.

## Local development stack

| Concern | Build now | Replace or host later on AWS |
|---|---|---|
| API | TypeScript modular monolith, Fastify or NestJS | ECS Fargate API service |
| Database | PostgreSQL in Docker | RDS PostgreSQL |
| Database migrations | Prisma or Drizzle migrations | Same migrations against RDS |
| Async jobs | Redis + BullMQ in Docker | SQS + worker service, or managed Redis if retained |
| Files | MinIO locally, private bucket semantics | S3 + CloudFront signed URLs |
| Auth | Custom auth module with Argon2id + secure cookies | Cognito integration or retained custom auth, after decision |
| Email | Mailpit locally; SES sandbox when ready | SES |
| Observability | Structured JSON logs, Sentry development project | CloudWatch, X-Ray, Sentry |
| API contract | OpenAPI + generated/typed client | Same contract |

Run the API, Postgres, Redis, MinIO, and Mailpit with Docker Compose. No development feature may depend on a public AWS resource.

## Shared backend rules

1. Every seller-owned record contains `seller_id` and is protected by PostgreSQL row-level security from the first migration.
2. The API derives the active seller and role from the authenticated session; clients never send an authoritative `seller_id`.
3. Admin access is a separate `platform_admin` trust boundary, not an elevated seller role.
4. Every external event and money operation is idempotent and audited.
5. Every file is private. The browser receives an expiring upload/download URL, never a public bucket URL.
6. Every mutation validates input server-side, writes an audit event, and is covered by tenant-isolation tests.
7. Module boundaries are explicit: `identity`, `seller`, `orders`, `couriers`, `shipments`, `exceptions`, `money`, `files`, `jobs`, `admin`.

---

## Seller-side backend

### 1. Identity, business account, and team

**Build now**

- Seller signup, email verification, login, logout, password reset, session/device revocation.
- `Seller`, `User`, `SellerMembership`, `Role`, `Session`, and `AuditEvent` tables.
- Roles: Owner, Operations, Finance, Read-only.
- Seller profile, team invitation, recent sign-ins, and change-password APIs.
- MFA-ready design; implement TOTP for Owner/Finance before money workflows are live.

**Seller API surface**

- `POST /auth/signup`, `POST /auth/login`, `POST /auth/logout`
- `POST /auth/forgot-password`, `POST /auth/reset-password`
- `GET/PATCH /seller/profile`
- `GET/POST/PATCH /seller/team/*`
- `GET /seller/audit-events`

### 2. Warehouse, products, customers, and orders

**Build now**

- Warehouses, pickup contacts, cutoff settings, return addresses.
- Customer address book and products/SKUs.
- Manual B2C order creation, reverse order creation, cancellation, and bulk CSV import/export.
- Order state machine: Draft → New → Ready to ship → Booked → Cancelled / Returned.
- Order timeline and immutable audit events.

**Seller API surface**

- `GET/POST/PATCH /warehouses`
- `GET/POST/PATCH /orders`
- `POST /orders/imports`, `GET /orders/exports`
- `GET/POST/PATCH /products`
- `GET/POST/PATCH /customers`

### 3. Store channels and order sync

**Build now**

- Channel connection model, sync settings, sync-history screen data, and connector status.
- Mock channel adapter first, then Shopify sandbox/live integration when credentials are available.
- Inbound webhook endpoint, signature verification, deduplication, queued processing, retries, and sync error visibility.
- Token encryption abstraction, even while local keys are stored in `.env`/local secret tooling.

**Seller API surface**

- `GET/POST/PATCH /channels`
- `POST /channels/:id/sync`
- `GET /channels/:id/sync-runs`
- `POST /webhooks/channels/:provider`

### 4. Courier gateway, rate engine, and booking

**Build now**

- Provider-neutral adapter interface: `serviceability`, `quote`, `book`, `cancel`, `label`, `track`.
- Deterministic mock courier adapter for all developer/test flows.
- Chargeable-weight calculation, pincode coverage, zones, rate-card versions, rate calculator, and courier-rule engine.
- Ship Now workflow: request quote → select valid quote → create shipment once.
- Delhivery sandbox/live adapter only after the mock flow is fully tested.

**Seller API surface**

- `POST /quotes`
- `POST /serviceability/check`
- `GET/POST/PATCH /rate-cards`
- `GET/POST/PATCH /courier-rules`
- `POST /shipments/book`, `POST /shipments/:id/cancel`

### 5. Shipments, labels, manifests, and tracking

**Build now**

- `Shipment`, `ShipmentQuote`, `ScanEvent`, `Manifest`, and `PickupRequest` tables.
- Canonical shipment-status state machine; courier-specific values are mapped at the adapter boundary.
- Label/manifest generation jobs, persisted locally in MinIO, delivered via expiring URLs.
- Tracking ingest endpoint and polling job model using mock events first.
- Shipment list, shipment detail, and dashboard KPIs driven from the real database.

**Seller API surface**

- `GET /shipments`, `GET /shipments/:id`
- `GET /shipments/:id/tracking`
- `POST /shipments/:id/label`, `POST /manifests`
- `POST /webhooks/couriers/:provider`

### 6. Exceptions, notifications, and preferences

**Build now**

- NDR queue, delivery attempts, NDR action choices, SLA timers, RTO transitions.
- Weight-discrepancy workflow, evidence upload, and seller response.
- Notification preference matrix and email event log.
- BullMQ scheduled/retry jobs for auto-RTO, SLA warnings, and failed tasks.

**Seller API surface**

- `GET/PATCH /ndr`
- `GET/PATCH /weight-discrepancies`
- `POST /files/upload-url`, `GET /files/:id/download-url`
- `GET/PATCH /notification-preferences`

### 7. Wallet, billing, COD, and invoices

**Build now**

- Append-only wallet ledger and derived balance; no editable balance column.
- Shipment charge calculations, holds/releases, recharge records, COD reconciliation model, invoices, and finance exports.
- Razorpay sandbox checkout + verified webhook path when ready.
- Invoice-numbering service and PDF job, with immutable invoice metadata from the start.
- Begin COD as reconciliation and human-approved transfers; do not automate bank payouts yet.

**Seller API surface**

- `GET /wallet`, `GET /wallet/ledger`
- `POST /wallet/recharges`, `POST /webhooks/razorpay`
- `GET /cod/reconciliations`
- `GET /invoices`, `GET /invoices/:id/download-url`

---

## Admin-side backend

Admin APIs operate on the same core data, but only a `platform_admin` session can use them. Every admin query/action must be audited with actor, target seller, before/after state, request ID, and timestamp.

### 1. Platform identity and access

**Build now**

- Separate platform-admin user/membership model or a strongly isolated `platform_admin` role domain.
- Admin login, TOTP MFA, session revocation, role permissions, and audit history.
- Roles: Super Admin, Operations Admin, Finance Admin, Support Admin, Analyst.

**Admin API surface**

- `POST /admin/auth/login`, `POST /admin/auth/logout`
- `GET/PATCH /admin/users`, `GET/PATCH /admin/roles`
- `GET /admin/audit-events`

### 2. Seller lifecycle and KYC operations

**Build now**

- Cross-seller search, seller state (active/suspended/onboarding), plan, wallet, and volume data.
- KYC verification queue, document review decisions, reason codes, reviewer assignment, and seller notification events.
- Credit-limit review and wallet-hold review queue.

**Admin API surface**

- `GET /admin/sellers`, `GET /admin/sellers/:id`
- `POST /admin/sellers/:id/suspend`, `POST /admin/sellers/:id/activate`
- `GET/PATCH /admin/kyc-reviews`
- `GET/PATCH /admin/credit-limits`, `GET /admin/wallets`

### 3. Courier network operations

**Build now**

- Courier partner records, service modes, pincode/zone mappings, SLA policy, performance snapshots, API-health events, and rate-card sync history.
- Manual partner operations first; provider-health polling later plugs into the same data model.

**Admin API surface**

- `GET/POST/PATCH /admin/couriers`
- `GET/POST/PATCH /admin/courier-zones`
- `GET/POST/PATCH /admin/sla-policies`
- `GET /admin/courier-performance`

### 4. Cross-tenant operational queues

**Build now**

- Platform-wide shipments, NDR, RTO, pickups, support tickets, escalations, live-chat case records, and courier disputes.
- Assignment, priority, SLA clock, internal notes, and resolution actions.
- Explicit seller context is always visible in an admin result.

**Admin API surface**

- `GET /admin/shipments`, `GET/PATCH /admin/ndr`, `GET/PATCH /admin/rto`
- `GET/PATCH /admin/pickups`
- `GET/POST/PATCH /admin/tickets`, `/admin/escalations`, `/admin/disputes`

### 5. Finance approval and compliance control

**Build now**

- Cross-seller COD reconciliation view, payout approval requests, invoice/tax review, and revenue reporting.
- Two-person approval model: requester cannot approve their own payout/adjustment.
- Step-up MFA hook before payout and manual wallet-adjustment approvals.

**Admin API surface**

- `GET/PATCH /admin/cod-reconciliations`
- `GET /admin/invoices`, `GET /admin/gst-reports`
- `GET /admin/revenue`

### 6. Jobs, integrations, and platform controls

**Build now**

- Job-run table linked to BullMQ jobs: status, attempts, duration, payload reference, error summary, and retry.
- API key registry, webhook delivery history, rate-limit configuration, feature flags, platform-control settings, and system-health data.
- Admin reporting/export jobs with download links and explicit audit records.

**Admin API surface**

- `GET/PATCH /admin/jobs`, `POST /admin/jobs/:id/retry`
- `GET/PATCH /admin/api-keys`, `GET /admin/webhook-deliveries`
- `GET/PATCH /admin/system-settings`
- `GET /admin/reports/*`, `POST /admin/reports/*/exports`

---

## Build order without AWS

1. Docker Compose, API skeleton, migrations, structured logs, OpenAPI, test harness.
2. Seller + admin identity, sessions, RBAC, RLS, audit events.
3. Warehouses, manual orders, seller dashboard data.
4. Mock courier adapter, quotes, Ship Now booking, shipments, tracking.
5. Admin seller/KYC/courier/shipment queues against the same real data.
6. Shopify + Delhivery sandbox adapters, queued sync/tracking.
7. NDR, RTO, labels/manifests, private MinIO file flows.
8. Wallet ledger, Razorpay sandbox, COD reconciliation, invoice generation.
9. Reports, exports, admin jobs/API/audit controls.
10. Replace local infrastructure adapters with AWS services; run staging, security, load, restore, and deployment gates.

## What must wait for AWS or production providers

- Multi-AZ database availability, WAF, CloudFront, real KMS/Secrets Manager rotation, and cloud-scale monitoring.
- Production payment credentials and real-money payouts.
- Production courier/store credentials and their commercial onboarding.
- Production KYC/bank-verification contracts and retention rules.
- Public launch, penetration testing, disaster-recovery targets, and high-scale load validation.

## Definition of local-first completion

The local backend is ready to move to AWS when a test seller can sign in, create an order, get a mock courier quote, book a mock shipment, retrieve a private label, receive tracking scans, resolve an NDR, and see a ledger balance computed from append-only entries; while an admin can safely review KYC, inspect cross-tenant operations, retry a job, and audit every privileged action.
