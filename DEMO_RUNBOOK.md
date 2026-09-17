# NEXGO owner demo runbook

## Before joining the Meet (2 minutes)

Keep two browser tabs open:

1. Seller portal: `http://localhost:3021/login`
2. Admin portal: `http://localhost:3021/admin/login`

Confirm the local services are healthy:

```bash
curl http://localhost:4010/health
```

If the demo data needs refreshing, run this from `backend/`:

```bash
npm run seed:demo-seller
npm run seed:demo-data
npm run seed:demo-network
npm run seed:demo-admin
```

## Local demonstration accounts

| Workspace | Email | Password |
| --- | --- | --- |
| Seller | `demo-2026@nexgo.local` | `NexgoDemo2026!` |
| Platform admin | `demo-admin@nexgo.local` | `NexgoAdmin2026!` |

These are local demo-only accounts. Do not reuse them in a deployed environment.

## Presentation flow (12 minutes)

### 1. Seller workspace — 2 minutes

Sign in as the seller and show the dashboard:

- Five business KPIs: order volume, delivery rate, RTO, NDR, and shipping spend.
- Order pipeline and decision queue.
- Wallet balance and the responsive sidebar.
- Toggle light/dark mode from Settings if relevant to the discussion.

Talk track: *“This is the daily operating view for a seller. It prioritizes the orders and exceptions that need action, not just raw reporting.”*

### 2. Book an order — 4 minutes

Open **Orders management → Create order**.

1. Enter a six-digit pincode such as `560001`; city and state fill automatically.
2. Enter SKU `DEMO-KIT-01`; the product name, price, and weight populate from the catalog.
3. Keep the payment mode as prepaid, or switch to COD to demonstrate the COD amount field.
4. Show the rate choices from Delhivery, Blue Dart, and XpressBees.
5. Create the order and open **Shipments** to show the booking/tracking area.

Talk track: *“The seller sees only the courier services and prices their account is allowed to use. Those rates come from platform-admin controls.”*

### 3. Other seller workflows — 2 minutes

Use the sidebar to point out:

- **Bulk orders** — spreadsheet template, validation, and per-order courier choices.
- **Reverse orders** — return pickup to the active warehouse.
- **NDR / COD / wallet / reports** — the operational lifecycle after booking.

Do not attempt a live spreadsheet upload unless you have time; the preloaded order flow is the stronger proof point.

### 4. Admin workspace — 3 minutes

Open the already signed-out admin tab and sign in.

- Start at **Platform overview** for platform-level KPIs.
- Open **Orders**, **Sellers**, **Couriers**, **KYC**, and **COD** as distinct operational queues.
- Show courier/rate operations and explain that an admin controls seller-specific courier access, rate cards, zones, and operational states.

Talk track: *“Seller data is tenant-scoped. Admin operations are separate and give the platform team control over commercial rules and exceptions.”*

### 5. Close clearly — 1 minute

Say this precisely:

> “This is an end-to-end local prototype: seller actions write to the local backend and the admin workspace reads the resulting operational data. Courier partners, payments, marketplaces, and notifications are represented by integration-ready workflows; their live API credentials and production infrastructure are the next implementation phase.”

## Demo guardrails

- Do not describe mock courier responses as live Blue Dart/Delhivery integrations.
- Avoid opening API/webhook credential screens in a project-owner demo unless asked.
- If a page is slow after a code edit, reload once; both services must remain running.
- The Vercel site is a UI deployment. Use localhost for the full seller-to-admin backend story until the API is hosted permanently.

## Recovery

If the frontend is unavailable:

```bash
cd /Users/aryanarora/Desktop/nextgo
npm run dev -- -p 3021
```

If the API is unavailable:

```bash
cd /Users/aryanarora/Desktop/nextgo/backend
npm run dev
```
