@AGENTS.md

# NEXGO — Project Memory

Multi-courier shipping/logistics aggregator (seller-facing console + platform admin panel). Think Shiprocket/Pickrr clone: sellers connect their storefronts (Amazon/Shopify/Woo/OpenCart/Magento), sync orders, compare courier rates, book shipments, and reconcile COD/wallet/GST. There's also a platform-wide admin panel for the NEXGO operator to manage all sellers/couriers/jobs.

**Status (2026-10-02): local-first full stack.** A Fastify/TypeScript API (`backend/`, port 4010) with PostgreSQL migrations, RLS, sessions, CSRF, admin TOTP and a DB-backed job worker is implemented and verified locally — see `docs/ENGINEERING_HANDOFF.md` for the item-by-item list. The frontend is **partly wired**: `components/Live*.jsx`, `AuthScreen` (seller auth), `DashboardContent`, `AdminLogin`, `AdminShell`, `AdminDashboard` and `AdminRateEditor` call the API through `lib/api.js` (`grep -l "lib/api'" components/*.jsx` is the current list); remaining `TablePage`/`FormPage` screens still render mock data from `lib/data.js`. Not yet live: real courier/channel/payment providers, AWS hosting, automated end-to-end tests. The entity map below is still the target domain model.

**Reports (2026-10-08):** seller MIS page is live (`components/LiveReports.jsx` ↔ `backend/src/routes/reports.ts`, table `report_runs`, CSV stored in DB, 20k-row cap); admin report screens `a-revenue`/`a-sla-report`/`a-analytics`/`a-gst` are live (`LiveAdminReports.jsx` ↔ `routes/adminReports.ts`). Vercel deploy: `docs/VERCEL_DEPLOYMENT.md` (`backend/api/index.js` + `backend/vercel.json`; frontend proxies `/v1/*` via `BACKEND_URL`). Verified 2026-10-08 against a throwaway Postgres 17: all 27 migrations apply from empty, and scripted API runs covered auth, booking (wallet overdraft refused, idempotent replay), courier webhooks (delivered/NDR/RTO), reports, recharge, NDR, invoices, COD, weight disputes, admin seller suspend. Fixed along the way: migrations 0022/0024/0025 could not apply on a fresh DB; booking had no wallet balance check; tracking webhook used a fake pool transaction, lost NDRs on retry and never set delivered_at; invoice/COD generation could double-bill overlapping periods and their approve/issue locks were no-ops outside a transaction. Not exercised: PDF/label jobs (need MinIO/S3), email, real couriers/Razorpay.

**Demo state (2026-10-08):** all seed scripts were deleted after loading the Neon demo DB (logins `demo@acmeexports.com`/`Demo@123`, `admin@nexgo.in`/`Admin@456`); deploys only run `npm run migrate`. Migration 0027 holds the pincode directory (462 rows), delivery windows, warehouse fields and the 5-products-per-order trigger. Backend root `/` is a Swagger UI built from the live route table. Pages added: NDR board, rate calculator, pincode serviceability, warehouse CRUD, courier comparison + book in create-order; every report exports CSV or Excel.

**Client feedback round (2026-10-09):** Seller panel — Reports = NDR Management, RTO Dashboard (`LiveRto`, `routes/rto.ts`), MIS Report, Weight Management; Tools = Rate Card (`LiveRateCard`, `GET /v1/shipping/rate-card`, read-only), Rate calculator, Pincode serviceability; Marketplace = `LiveMarketplace` (connect/sync/remove stores, `channel_connections.store_url`); Billing = one hub `LiveBillingHub` with tabs (price calculator, rate chart, COD remittance, wallet transactions with running balance, shipping charges, invoice, credit notes, TDS; endpoints in `routes/billing.ts`); Settings → KYC = `LiveKyc` (PAN, Aadhaar last-4 only, GST optional via `gst_applicable`, bank details; document upload UI notes the file but needs storage); Control Tower is a single item (printer/label/invoice/email-report/WhatsApp/SMS/order-confirmation/abandoned pages are reached from Account configuration cards). Create order has the courier comparison in the right column; bulk upload offers a re-upload-ready "failed orders" Excel. Shared UI in `components/Kit.jsx`; page width/centering in `PageContainer`. Admin panel owns what sellers only read: KYC review (shows Aadhaar last-4 / GST status), rate editing (Partners), COD settlements, Invoices, **Credit notes & TDS** (`LiveAdminNotes`, new), **Weight disputes** (`LiveAdminDisputes`, `routes/adminDisputes.ts`: won = no charge, lost = debit once), NDR/RTO centres. Migration 0028 = KYC + store_url columns.

**Rating logic (2026-10-09):** ported from the sibling SwiftCourier (`idiotship`) project. `backend/src/lib/zone.ts` derives the lane zone (within_city / within_state / metro_to_metro / rest_of_india / ne_jk) from the pincode directory; `rate_card_rates` rows are keyed by that zone (fallback `national`). `calculateRate` (`lib/money.ts`): matched weight slab base + ceil(extra/additional slab) × additional price, COD = max(flat fee, % of order value), RTO price, GST 18% shown on top (wallet debit stays pre-GST; GST is invoiced). Booking and quotes use the same zone lookup. Rate Card page is information only; the Rate Calculator does the maths. Migration 0029 adds `cod_percent_bps`, `rto_*` and seeds zone rows.

**Client feedback round 2 (2026-10-09):** page names live in the top bar only (`PageHeader` renders just an action row; `AdminPageHeader` deleted, admin top bar shows the title). Create order: pick the pickup warehouse first (rates need the pickup pincode), length/breadth/height mandatory (also in bulk upload), courier chooser is a compact table (`CourierComparison`). Bulk upload: warehouse picker, failed-orders download as Excel or CSV (also lists orders with no serviceable courier). Orders have a generated unique `nexgo_order_id` (`NX` + YYMM + 7 digits, sequence) and a `channel`; shipments have `whatsapp_status` and `rto_status` (migrations 0030, 0031). Track page = Channel / Order ID / NEXGO order ID / Date / Payment+Method / Customer / Carrier / AWB / WhatsApp / Status, tabs incl. **Failed** (orders with no shipment, returned as `failed` by `GET /v1/shipments`). NDR + RTO share `ShipmentFilters` (backed by `lib/shipmentFilters.ts`); NDR Overview donut removed; RTO dashboard has tabs All / In transit / OFD / Delivered / Lost / Damaged / Undelivered plus Export and Manifest. Rate card is a zone A–E matrix (forward/RTO/add./COD charge/COD %). Global scrollbar: only `::-webkit-scrollbar` rules (never `scrollbar-color` on Chromium) and no full-viewport `position: fixed` layers over the scroller.

**Design rules (2026-10-09):** no gradients anywhere (solid colours only; donut/conic charts excepted); scrollbar = solid #1b9fd6. Shipment tags (`shipments.tags`, migration 0033): added/removed in bulk from Track (`POST /v1/shipments/tags`), listed by `GET /v1/shipments/tags`, filterable in Track, NDR and RTO via `tags`.

**Printable documents (2026-10-10):** shipping label (4×6 in thermal or 4-per-A4) and A4 tax invoice (IGST, or CGST+SGST when seller and buyer share a state) are React print pages at `/documents/label?ids=…` and `/documents/invoice?ids=…` (`components/documents/*`, barcodes via `react-barcode`, Print / Save as PDF through the browser). Data from `GET /v1/shipments/documents` (assigns the per-seller running invoice number, `orders.invoice_seq`, migration 0035). Opened from Track (row Label, detail panel Print label / Invoice, bulk Print labels / invoices).

**Milestone 1 QA round (2026-10-11):** dashboard is live-data end to end: `GET /v1/analytics/dashboard?days=` (today's volume + range volume, IST day boundaries, state-wise delivery, courier mix, `queue` with open NDR / weight disputes / missed pickups / COD figures); the header date filter (`dashDays` in AppStateContext) drives every card; vertical bar charts (`BarChartV`) for Top NDR reasons and State wise delivery; queue actions go to NDR / Weight pages, `POST /v1/analytics/dashboard/reschedule-pickups` -> "Re-scheduled for tomorrow"; Bulk reattempt / Change courier / Change payout account / Download statement / queue filter tabs removed. Admin dashboard: Shipping spend + System health removed, date filter added (`?days=`). Rate card has a global weight-slab filter (0.25-20 kg). COD remittance (migration 0036): per-seller `sellers.remittance_days` (D+N, admin sets it on the COD settlements page), cycle `due_date`, remit refused before due date, and a negative wallet balance is recovered from the COD first (`wallet_offset_paise`, `payout_paise`; wallet -10,000 + COD 1,00,000 pays 90,000, wallet 0). `POST /v1/shipments/:id/cancel` cancels before pickup and credits the exact booking debit back once (ledger type "Cancellation refund"). Courier rules = priority 1-6 (settings area `courier-rules`); `POST /v1/shipments/auto-assign` books each order with the first serviceable courier in that order (bulk upload calls it; Track > Failed has "Assign courier(s)"; wallet-short orders come back with the reason). Control Tower: printer format (A4 / 4x6 / 3x5), label size, invoice settings (hide company name, prefix, page format, logo/signature links, custom fields) are applied by the document pages; Support & Tickets page (`support`, `/support/tickets`) with the QA category list. Not done (needs input): theme colours, WhatsApp-shared label sample, monthly invoice format, TDS rules, single-order courier chooser (removed earlier at the client's request, QA 3.1 asks for it back).

**Docs (all in `docs/`):** `ENGINEERING_HANDOFF.md` (current state + non-negotiable rules — read before backend changes), `BACKEND_PLAN.md` (phases + security gates), `LOCAL_BACKEND_BUILD_PLAN.md` (local-first execution plan), `AWS_BACKEND_PLAN.md` (AWS mapping), `STAGING_CHECKLIST.md`, `DEMO_RUNBOOK.md`. `AGENTS.md` at the root is generated by `next dev` — leave it alone.

**Checks before committing:** `npm run lint && npm run build` (root) and `npm run check` (in `backend/`). Lint is clean as of 2026-10-02 — keep it that way; the few `eslint-disable` lines each carry a reason.

## Stack & structure
- Next.js 16 (App Router), React 19, JS (no TS). `npm run dev` serves on port 3021 — the API's `FRONTEND_ORIGIN`/CORS expects that origin, so don't change one without the other.
- `backend/` — Fastify 5 + TypeScript API, `src/routes/*` per domain, `src/db/migrations/*.sql` (numbered, applied by `npm run migrate`), `src/worker.ts` job runner. Local infra in `compose.backend.yml`.
- `lib/api.js` — the only fetch client: sends credentials and the `x-csrf-token` header (from the `nx_csrf` cookie) on mutations; always surfaces failures as `ApiError`.
- `app/(app)/**` — authenticated shell routes (sidebar + topbar), each `page.js` is a one-liner rendering `<AppPage id="...">`.
- `app/{login,signup,forgot-password,reset-password}` — auth routes outside the shell, render `<AuthScreen>`.
- `lib/routes.js` — screen-id ↔ URL path map (`PATHS`, `pathFor`, `idForPath`). Screen ids are the real join key to `lib/data.js`.
- `lib/data.js` — the entire mock dataset: `METRICS` (KPI cards), `SPINE`/`SECONDARY` (nav), `PAGES` (breadcrumb/title), `TABLES` (list-view screens: search/tabs/filters/stats/cols/rows), `FORMS` (settings/detail/wizard screens: sectioned fields + aside panels), `CONNECTORS` (channel integration cards), `ACTIONS`, `RESOLUTIONS`, `DRAWER_SCANS`, `PALETTE_GROUPS` (⌘K command palette), `WALLET_BALANCE`.
- `components/AppPage.jsx` dispatches per screen id: has a `TABLES` entry → `TablePage`; has `FORMS`/`CONNECTORS` entry → `FormPage`; `isDashboard` → `DashboardContent`.
- `lib/AppStateContext.jsx` — client-only UI state (nav/palette/drawer open, selected KPIs, active tab per screen). Viewport width and the persisted sidebar state are `useSyncExternalStore` stores, not effects. Theme is fixed to light on load by design (commit 4161b36). Server data is fetched per screen inside the `Live*` components, not here.

## Backend build order (recommended)
1. **Auth + tenancy** — nothing else is safe to build without a seller_id to scope data by.
2. **Channels & order sync** — orders are the root entity; everything downstream (shipments, NDR, COD, invoices) derives from an order.
3. **Rating + booking** (Ship Now, Rate Calculator/Card, Pincode Serviceability) — needs a courier-aggregator abstraction before shipments can exist.
4. **Shipments + tracking** — courier webhook/polling ingestion, status machine.
5. **Money** (wallet, charges, COD reconciliation, recharges, invoices/GST) — depends on shipments existing and being priced.
6. **Exceptions** (NDR, weight disputes) — depends on shipment tracking events.
7. **Settings** (warehouse, KYC, courier rules, label/printer, webhook, notifications, profile) — mostly independent CRUD, needed to make booking/money correct.
8. **Reports/MIS, Marketing** — read-model aggregation + third-party sends, can come last.
9. **Admin panel** — same entities as above but cross-tenant + approval workflows; needs RBAC (platform-admin role) first.

## Entities implied by the UI

**Tenancy / auth**
- `Seller` (business entity) — legal name, GSTIN, PAN, entity type, category, registered address, plan (Starter/Growth/Enterprise), KYC status, wallet balance.
- `User` — belongs to a seller, role (Owner/Operations/Finance/Read-only per `settings/profile` team table), email/password, sessions, sign-in history.
- Auth flows: login, signup, forgot-password (email/OTP), reset-password, change-password. No 2FA UI shown but "2FA: Enabled" appears as a read-only stat on `settings/profile` — decide whether to build it or just display.

**Channels (`channels/*`, `CONNECTORS` in data.js)**
- `Channel` per seller: type (amazon/shopify/woocommerce/opencart/magento), connection status, external store identifier, API credentials (OAuth tokens or REST keys), sync frequency, last sync timestamp, order-count synced.
- Needs: OAuth app registration with each platform (Amazon SP-API/MWS, Shopify Admin API, WooCommerce REST, Magento Adobe Commerce, OpenCart REST extension), webhook or polling ingestion, per-channel sync job (see Jobs below).

**Orders (`orders`, `orders/b2c`, `orders/reverse`, `orders/dropshipping`, `orders/ship-now`)**
- `Order`: id, external order ref, channel, customer (name, address, phone), line items (SKU, qty, product name), payment mode (COD/Prepaid), order value, status (New/Ready to ship/Pickup scheduled/Cancelled...), created_at.
- Sub-types: B2C order (manual single-customer creation form), Reverse order (return pickup booking from customer address), Dropshipping order (partner storefront orders — needs a `Partner` entity: Nestasia/Pepperfry/Tata CLiQ-style partners, payout per order).
- `Ship Now` is a 4-step booking wizard against an existing order: pickup/delivery confirm → package+payment details → courier selection (rate comparison) → charge breakdown/confirm. This is the core state machine: **Order → (rate quotes) → Shipment**.
- Bulk import (CSV) and CSV export needed on most table screens.

**Rating & serviceability (`tools/*`)**
- `Rate Calculator`: input (pickup pincode, delivery pincode, weight, dimensions, payment mode) → output ranked list of courier quotes. Needs volumetric-vs-dead-weight billing logic (seen explicitly: "billed weight = max(dead, volumetric/divisor)").
- `Rate Card`: seller's negotiated slab rates per courier per zone, versioned by effective date, tied to a volume tier that triggers renegotiation.
- `Pincode Serviceability`: single lookup + bulk CSV upload (up to 50k pincodes) → per-courier serviceability matrix. Needs a maintained pincode→zone→courier-coverage reference table (refreshed from courier partner APIs).
- Zone model: zones A–D (or similar) drive both rating and transit-time estimates.

**Shipments (`shipments`, `shipments/detail`)**
- `Shipment`: AWB (courier-assigned tracking number), order_id, courier, service type (Surface/Air/Express/Hyperlocal), route (pickup pincode → delivery pincode), chargeable weight, mode (COD/Prepaid), charge, status (Pickup pending/In transit/Out for delivery/Delivered/NDR/RTO in transit/RTO/Cancelled), promised date, attempts.
- `ScanEvent` (tracking history): shipment_id, timestamp, location/hub, status, raw courier payload. Populated by courier webhook push or scheduled polling per courier's tracking API.
- Manifest generation (batch label + pickup manifest per warehouse/courier) and label printing (see Settings → Label/Printer).

**Exceptions**
- `NDR` (non-delivery report): shipment_id, reason (customer unavailable/address incomplete/refused/payment not ready), attempt count (n of 3), SLA countdown to auto-RTO, status (Unactioned/Actioned/RTO), resolution action taken (reattempt with new slot / mark RTO / WhatsApp address confirmation). Needs a scheduled job that auto-converts unactioned NDRs to RTO after the SLA window.
- `WeightDiscrepancy`: shipment_id, declared weight, courier-charged weight, difference, amount held, status (Open/Disputed/Accepted/Won), evidence (packing photos upload), dispute window deadline. Needs courier dispute-API integration or manual ops workflow, plus wallet-hold/release side effects.

**Money**
- `WalletLedger`: append-only entries (debit/credit), narration, reference, running balance. Every shipment charge, RTO charge, dispute hold/release, and recharge is a ledger entry — **this must be the single source of truth for the wallet balance shown everywhere** (topbar, dashboard, settings).
- `Recharge`: payment gateway reference (Razorpay refs seen — `RZP-...`), method (NEFT/UPI/card/auto-recharge), amount, status (Success/Failed), auto-recharge threshold + toggle. Needs real payment gateway integration (Razorpay or similar) with webhook confirmation, not just a status flag.
- `ShippingCharge`: per-shipment freight/COD-fee/GST breakdown line, forward vs RTO type. GST at 18% — must be computed and reconciled against `Invoice`.
- `CODReconciliation` (payout cycle): cycle date range, shipment count, COD collected, charges deducted, net remitted, bank account, status (Pending/Remitted). Needs a scheduled payout-cycle job and bank transfer integration (NEFT/IMPS) or manual ops approval (see Admin → COD, which has an "Approve payouts" action).
- `Invoice`: GST tax invoice per billing cycle, sequential numbering (`NX/26-27/00418` pattern — configurable prefix/series in Settings → Invoice Settings), PDF generation, filed status. Real compliance surface — GST invoice numbering/sequencing rules must be correct (no gaps, no reuse).

**Marketing**
- `Campaign` (WhatsApp/Email): template, audience segment, schedule, send stats (sent/delivered/opened/clicked). Needs WhatsApp Business API (Cloud API, template approval flow) and an email ESP (SendGrid/SES-style) integration.

**Reports & MIS (`mis`)**
- Scheduled reports (recurring, emailed to team) + on-demand generation, multiple export formats (CSV/XLSX/PDF) per report type (shipment register, order register, COD remittance, courier scorecard, NDR ageing, weight disputes, wallet ledger). This is a read-model/aggregation layer over the entities above — likely needs a job queue + file storage (S3-style) + signed download links, not synchronous generation for large exports.

**Settings**
- `Warehouse`: pickup location(s), address, contact, pickup cutoff time, reverse-pickup toggle, separate return-address toggle. One seller can have multiple; one is primary.
- `KYC`: GSTIN/PAN verification (third-party verification API), bank account for COD remittance (penny-drop verification), document upload (cancelled cheque), signatory Aadhaar OTP verification. Real KYC compliance surface.
- `CourierRules`: allocation strategy config (default = cheapest serviceable, fallback = highest delivery rate) — an ordered rule engine, not just two dropdowns; "4 of 6 rules active" implies a rule list with enable/disable + reordering.
- `Label` / `Printer` settings: label size/format, printer profiles, integration with a locally-running "print helper" desktop agent (v2.4.1 mentioned) — this is a separate local service, not a web backend concern, but the web app needs to detect/communicate with it.
- `InvoiceSettings`: tax invoice numbering series and defaults.
- `Webhook`: outbound webhook endpoint + secret, subscribed event types, delivery log (success/fail counts, latency, retries). Needs an outbound webhook dispatcher with retry/backoff and a delivery-log table.
- `Notifications`: per-event toggle matrix (which customer-facing and internal-team alerts fire on which channel).
- `Profile`: account/business details, team members + roles (RBAC), recent sign-ins (session/device log).

**Admin panel (`admin/*`)** — platform-operator view, cross-tenant:
- `a-overview` / `a-sellers`: all sellers, plan, shipment volume, wallet float, KYC/status, platform GMV. Needs seller suspend/activate actions.
- `a-shipments` / `a-ndr`: platform-wide versions of the seller tables, filterable by seller.
- `a-couriers`: courier partner config — service types, pincode coverage, live SLA/uptime metrics, health status (Healthy/Degraded/Suspended), rate-card sync, "+ Add courier" onboarding.
- `a-cod`: cross-seller payout approval queue ("Approve payouts" action — this is where real money moves out, needs strong authz + audit trail).
- `a-jobs`: background job run history (channel sync, courier scan pull, manifest generation, COD reconciliation, weight-discrepancy import, webhook delivery, invoice generation) with status (Running/Success/Failed/Queued), retry action, duration, record counts. **This view implies the backend itself is job/queue-driven** (e.g. BullMQ/Sidekiq-style) — worth building the job system early since almost every module above (sync, tracking, payouts, invoices, exports) is async by nature.

## Cross-cutting concerns
- **Multi-tenancy**: every table above except courier/platform config is scoped by `seller_id`. Get row-level scoping right before building features on top.
- **RBAC**: seller-level roles (Owner/Operations/Finance/Read-only) seen in `settings/profile`; platform-level admin role for `/admin/*`. Two separate authz layers.
- **Courier aggregation**: a single internal interface (`quote(origin, dest, weight, dims, mode) -> [ratedQuotes]`, `book(shipmentDraft) -> awb`, `track(awb) -> events[]`, `cancel(awb)`) behind which real Delhivery/Blue Dart/Ekart/XpressBees/Ecom Express/Shadowfax APIs get plugged in one at a time. Build against a fake/mock courier adapter first so the rest of the stack doesn't wait on partner API access.
- **Payment gateway**: recharges need Razorpay (or similar) checkout + webhook; COD payouts need a bank transfer rail (NEFT/IMPS) or manual-approval-then-external-transfer flow.
- **Notification providers**: WhatsApp Cloud API, an SMS DLT-registered provider (MSG91-style, seen in mock data), an email ESP.
- **Compliance**: GST invoice sequencing, GSTIN/PAN verification, KYC document handling — treat as real compliance surfaces even in early builds, not mock-able forever.
- **File storage + exports**: label PDFs, manifests, invoice PDFs, dispute evidence photos, bulk CSV imports/exports — needs object storage + async job + signed URLs.
- **Command palette (`⌘K`)**: cross-entity search (shipments, orders by AWB/customer) + fuzzy action list — needs a search index (Postgres full-text or a dedicated search service) once data is real, not just a static list.

## Motion system (apple-design pass, 2026-09-05)
The app-shell chrome (Sidebar, TopBar, CommandPalette, KpiDropdown, NdrDrawer, MobileOverlay) uses the `motion` package (`motion/react`) applying Apple's fluid-interface rules from the `apple-design` skill:
- **NdrDrawer** is the flagship: a real drag-to-dismiss sheet — 1:1 tracking via a left-edge grab handle (`useDragControls`, `dragListener={false}` so it doesn't fight the scrollable content), rubber-band resistance past the open position (`dragElastic`), and the release velocity is handed off into the exit spring so a fast flick keeps its momentum. Dismisses to the same right edge it entered from.
- **Mobile Sidebar** mirrors the same pattern (drag left to dismiss, rubber-band at both travel limits), replacing the old fixed-duration CSS transition.
- **CommandPalette / KpiDropdown** use spring scale-in anchored to their trigger (`transformOrigin`), critically damped (no bounce — they open from a click, not a gesture with momentum).
- All scrims/panels use `backdrop-filter: blur()` for translucency, with `lib/useReducedTransparency.js` (`prefers-reduced-transparency`) falling back to a near-solid background.
- Every mount/exit respects `useReducedMotion()` — reduced-motion users get opacity cross-fades instead of slides/springs.
- Primary buttons use `whileTap` for instant press feedback (fires on pointer-down, not release).
- **Not yet covered**: the many plain `onClick` divs across `TablePage`/`FormPage`/individual page content — same `whileTap` pattern should be applied there as those get touched.

## Working agreement
- This file is the source of truth for backend scope — **update it every session** as decisions get made or the mock data model changes, the same pattern used in `ai-technical-decomposer`.
- When wiring a mock screen to the API, replace it with a `Live*` component end to end (loading, empty, 401 → sign-in states) rather than mixing live and mock data on one screen — half-wired screens break the demo.
