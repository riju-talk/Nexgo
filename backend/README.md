# NEXGO backend

The local-first API foundation for both seller and platform-admin domains.

## Run locally

```bash
docker compose -f compose.backend.yml up -d
cp backend/.env.example backend/.env
cd backend && npm install
npm run migrate
npm run seed:admin
npm run dev
```

In a second terminal, start the local worker:

```bash
cd backend && npm run worker
```

Health check: `http://localhost:4010/health`.

## Current scope

- Seller identity: signup, login, logout, encrypted session tokens, owner membership.
- Tenant-safe seller identity endpoint: `GET /v1/seller/me`.
- Separate platform-admin guard with `GET /v1/admin/me` and an initial seller
  lifecycle list route. Creating/promoting an admin is intentionally an
  audited operations task, not a public signup flow.
- Platform commercial controls: create courier providers/services, enable a
  service per seller, and publish an auditable seller rate card.
- Seller shipping APIs: `GET /v1/shipping/courier-options` and
  `POST /v1/shipping/quotes`. Quote output only includes services the seller
  is explicitly allowed to book and prices the currently effective rate-card
  version in paise, returned as INR amounts.
- Supports both company-contracted (`platform`) and seller-owned courier
  account modes. Seller-owned courier secrets have a dedicated encrypted
  storage model; the credentials-entry and KMS implementation comes next.
- Seller operations: warehouses, customer addresses, product/SKU catalog,
  manual orders with immutable line items, and audited order-state changes.
- Shipment lifecycle: idempotent booking, canonical AWBs, price snapshots,
  booking events, shipment lists, and tracking timelines. Booking only accepts
  a courier service that is enabled and priced for that seller at booking time.
- PostgreSQL schema migrations, audit events, seller RLS policies.
- Local PostgreSQL, Redis, MinIO, and Mailpit services.
- A database-backed worker that safely claims jobs using `FOR UPDATE SKIP LOCKED`.
  It already processes channel-sync jobs and is the execution boundary for labels,
  tracking polls, exports, notifications, and integration retries.

## Local admin access

Set a strong `LOCAL_ADMIN_PASSWORD` in `backend/.env`, then run `npm run
seed:admin`. The command is deliberately blocked in production. It creates or
updates a local `super_admin` and can sign in through `POST /v1/admin/auth/login`.

This file covers the original foundation. Later work (KYC, wallet recharge,
invoices, COD remittance, team invitations, password reset, sessions, admin
TOTP, CSRF, rate limiting, manifests, audit/job/webhook visibility) is listed
item by item in `docs/ENGINEERING_HANDOFF.md`, which is the source of truth
for what is implemented and verified.

In production (`NODE_ENV=production`) the API refuses to start while MinIO
keys or the Razorpay webhook secret are still the committed development
defaults.
