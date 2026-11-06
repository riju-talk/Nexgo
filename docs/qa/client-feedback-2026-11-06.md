# Client feedback and bug report: status and written answers (2026-11-06)

Sources: "Changes Required according to Seller & Admin.docx" and "Nexgo- Bugs to be solved.docx".
Legend: **Fixed** = changed in code and checked locally; **Answer** = explained below; **Open** = needs a decision or live data.

## 1. Changes required (seller)

| # | Item | Status |
|---|------|--------|
| 1 | New account goes straight into the panel | **Fixed.** `POST /v1/auth/signup` now opens the session; the sign-up page opens the dashboard. |
| 2 | No "Forgot password / Reset password" on the sign-up page | **Fixed.** The row of auth links is gone on every auth page; each page only shows the link that belongs to it. |
| 3 | Login page: remove "Platform staff? Sign in as admin", "sign in with email" | **Fixed.** The admin line is removed (admins use `/admin/login` directly); heading is "Sign in with email". |
| 4 | API to create admins | **Fixed.** `POST /v1/admin/accounts`, see section 4. |
| 5 | Longer access-token life | **Fixed.** Sign-in lasts 14 days (was 7); idle sign-out 12 h (was 2 h). Both stay configurable (`SESSION_TTL_DAYS`, `SESSION_IDLE_MINUTES`). |
| 6 | Welcome page: only Karun sir's agreement, other documents in the footer | **Fixed.** The welcome card shows one document (Seller Agreement = Terms of Service); Privacy, Shipping SOP, Refund, Cookie and API Terms are footer links. **Open:** if Karun sir's agreement is a different file from `/terms`, send it and it replaces the page text. |
| 7 | To ship: warehouse, business details, KYC documents (not verified yet), bank details; separate Submit buttons | **Fixed.** Settings > KYC has three sections (Business, PAN + identity, Banking), each with its own Save button and its own uploads; "Submit for verification" is only the last step. Nothing is verified automatically. |
| 8 | Welcome message on other pages: toast only | **Fixed.** The welcome card shows on the dashboard only. On other pages a not-yet-accepted seller gets one short toast per visit. |
| 9 | Track shipments: Refresh not working | **Fixed.** It now shows "Refreshing…" and a "Shipments refreshed" toast. The list still auto-refreshes every 30 s. |
| 9b | "In this page some buttons are not working" (screenshot = **MIS Report**) | **Checked, no code fault found.** In the browser the quick ranges (Today / 7 days / 30 days / This month / Last month) and Generate all work and the report period matches the dates. The screenshot shows a preview from an earlier run (07-10 to 05-11) under newer dates (01-10 to 31-10): the preview only changes when Generate is clicked. If a specific button still fails on the live site, send its name. |
| 10 | Weight management: blocked symbol on Prev / Next | **Answer.** See section 3. Changed so the pointer no longer shows the red "blocked" symbol. |
| 11 | Cannot open a ticket | **Fixed.** Click a ticket row to see message, status and NEXGO's reply. |
| 12 | "What is this? Don't give access for anything inside the panel to the browser" (screenshot = the browser's own "mynexgo.com says: Cancel 1 shipment?" box) | **Fixed.** Every native browser pop-up (confirm / prompt) is replaced by an in-app dialog: Cancel shipment(s) / orders, Dispute charges, Copy rate card, Delete SLA policy, and the bank reference on COD payouts. None are left (`window.confirm/prompt/alert` count is 0). |
| 12b | "Show me your console and the storage output" | **Answer.** Real output in section 3. |
| 13 | Wrong details / pincode accepted before the courier step | **Fixed.** The order form refuses an invalid mobile, short address, unknown pincode or missing city/state before saving; the server refuses a pincode that belongs to another state than the one typed. |
| 14 | "Look into this, it shows information" (screenshot of devtools showing the wallet response) | **Answer.** Section 3. |
| 14b | "Improve it…" (screenshot = Lighthouse **Performance 42** on Track shipments) | **Partly done.** Every page used to download the code of all ~45 screens; each screen now loads only when opened. Not yet re-measured with Lighthouse on the live site: **Open** until you re-run it after the deploy. |
| 15 | Reset password asks for no e-mail | **Fixed.** Opening `/reset-password` without the e-mailed link now asks for the e-mail address first. |
| 16 | Acceptance of agreement and policy | **Fixed** (see 6). A second document with extra policies has not arrived yet: **Open.** |
| 17 | GST optional | **Fixed** (already optional; now an unticked option in the business section). |
| 18 | Order creation / assignment failed for bulk orders (screenshots: "Assign a courier to 25 orders" and "Lorrigo: Order Id already exists. Please try with another Order Id.") | **Fixed, root cause found.** When a booking is retried, NEXGO must find the order it already sent to Lorrigo. It looked only at Lorrigo's first 10 orders (Lorrigo's `GET /orders` ignores filters and lists newest first), so any order that was not among the 10 newest failed with that message, and every later attempt for it failed too. It now searches page by page (checked read-only against the live account; regression test added). **After the deploy, re-run "Assign courier" on the Ready-to-ship orders.** |

## 2. Changes required (admin)

| # | Item | Status |
|---|------|--------|
| 1 | Air / Surface dropdown in the rate editor | **Fixed.** Each rate configuration has a Mode select (All / Surface / Air / Express) that narrows the courier list. |
| 2 | Same courier from two sources: which rate is assigned? | **Answer.** See section 3. The editor and the viewer now show "via <aggregator>". |
| 3 | COD settlement shows demo data; settlement / pending not working | **Fixed.** The sample table under the live one is gone. New: "Create a COD cycle" (seller + dates) creates the Pending cycle, then Approve, then Mark remitted with a real bank reference (the fake `NX-DEMO-…` reference is removed). |
| 4 | Special rate for 2 kg (screenshot = the courier list, which has no 2 kg entry) | **Answer.** See section 3. Lorrigo's account offers only 7 services (0.25 kg and 0.5 kg first-weight units); there is no "2 kg" service to pick. A 2 kg price is a weight band on a courier's rate card. A hint now sits in the editor. |
| 5 | Cannot create policy / export policies (SLA, Performance) | **Fixed.** SLA settings is now a live screen: pick a courier, Create / Edit / Turn off / Remove policy, Export policies (CSV or Excel). Zone mapping and Performance no longer show the sample table below the live one. |
| 6 | Page keeps falling back ("This page couldn't load") | **Fixed.** Cause: Courier Performance crashed (`isoDay` was given a `Date`; averages arrived as text). The other 24 admin pages were opened locally and none logged an error. |

## 3. Written answers

**Which courier's rate is assigned when two sources sell the same courier (for example "Amazon Surface" from two aggregators)?**
Rates belong to a courier *service*, and every service belongs to exactly one aggregator. Add the second source as its own courier service (Admin > Couriers > + Add courier, choose the aggregator), for example "Amazon Surface 0.5 kg" via Lorrigo and "Amazon Surface 0.5 kg" via the second aggregator. A seller's rate card has one set of prices per service, so the card itself says which source the seller uses: only the services in the card are offered to that seller. The editor and the viewer now show "via <aggregator>" next to each service, so two entries with the same courier name can be told apart. To move a seller from one source to the other, remove the first service from the card and add the second.

**How do I give a special rate for 2 kg?**
There is no "2 kg courier" to choose: Lorrigo's account lists only Amazon Surface 0.25 kg, Delhivery 250 gms, Delhivery Spcl 500 gm, Ekart 0.5 Kg, Shadowfax DR, Xpressbees 0.25 kg and Xpressbees 0.5 kg (the number is the first-weight unit, not a weight limit). If you want a separate 2 kg service (for example "Delhivery 2 kg"), ask Lorrigo to enable it on the account; it then appears under Admin > Couriers > + Add courier. Until then, use a weight band:
In Assign courier & rates, click "+ Add New Configuration", choose the same courier, set Weight (kg) to 2 and fill the zone prices. Open "COD charges and weight slab start" and set where the band begins (for example 1.5 kg). Parcels at or above that start weight use the new configuration; lighter parcels keep the earlier one. Save; the new card replaces the old one.

**Console / storage output (measured in the running app, signed in as a seller):**
```
cookies readable by JavaScript : nx_csrf   (the CSRF token; the session cookie is HttpOnly and invisible to scripts)
localStorage                   : empty
sessionStorage                 : nx_agreement_hint = 1   (the one-time welcome toast flag)
Cache Storage / service workers: none
API calls the page made        : /v1/seller/me, /v1/wallet, /v1/analytics/dashboard, /v1/reports...
console errors                 : none
```
The earlier theme / sidebar preferences live in localStorage only after the user changes them; no tokens or personal data are ever stored.

**What is in the browser console / storage, and is it a leak?**
Whatever the logged-in seller's own browser loaded is visible to that seller in Developer Tools (Network, "Fetch and XHR"). The screenshot shows the seller's own wallet balance (`balancePaise: 1000000`) in the seller's own session: this cannot be hidden from the person who is logged in, and is the same on every website. What must never be there: other sellers' data, internal fields, secrets or passwords. Checked: the API strips internal fields from shipment responses (done earlier), responses carry `Cache-Control: no-store`, the session cookie is HttpOnly (JavaScript and the console cannot read it), and the only things kept in browser storage are the sidebar state, the theme and a temporary order prefill; no tokens, no personal data. Nothing needs removing.

**Why the blocked symbol on Prev / Next in Weight management?**
When the first page is open, "Prev" is switched off (nothing before it); on the last page "Next" is switched off. Switched-off buttons showed the browser's red blocked cursor. The buttons stay switched off (that is correct) but the cursor is now a normal arrow.

## 4. Admin account API

`POST /v1/admin/accounts` creates a platform admin. Off until `ADMIN_API_SECRET` (at least 32 random characters) is set in the server environment.

```
curl -X POST https://mynexgo.com/v1/admin/accounts \
  -H "content-type: application/json" \
  -H "x-admin-api-secret: <ADMIN_API_SECRET>" \
  -d '{"email":"new.admin@example.com","password":"at-least-12-characters"}'
```

- Body: `email` and `password` (12 to 128 characters) only; anything else is refused.
- The password is hashed with argon2id; only the hash is stored.
- Answers: 201 `{id, email, role}`, 401 wrong or missing secret, 409 e-mail already used (an existing account is never changed), 400 invalid input, 503 secret not configured. 10 requests per minute.
- The new admin gets the `super_admin` role and signs in at `/admin/login` with e-mail and password. MFA is not required for accounts created this way (same as the built-in admin); see BUG-003 below.
- Keep the secret out of the browser and out of chat; rotate it by changing the environment value.

## 5. Bug report ("Nexgo- Bugs to be solved.docx")

| Bug | Status |
|-----|--------|
| 001 hardcoded bootstrap admin | **Fixed in code.** In production it is only created with `ENABLE_BOOTSTRAP_ADMIN=true` set explicitly. An existing account stays: **change its password or disable it after you create your own admin with the API above** (the hash is in the repository, so treat the password as public). |
| 002 developer super admin | **Fixed in code.** `DEV_SUPERADMIN_*` is ignored in production unless `ALLOW_DEV_SUPERADMIN_IN_PRODUCTION=true`; a warning is logged. Remove the variables from the production env. |
| 003 admin MFA enrolment bypass | **Open (decision).** Blocking login for an admin who needs MFA but has not enrolled needs a restricted enrolment session first; otherwise nobody could enrol. |
| 004, 005, 006 | **Left as is**, as instructed. |
| 007 courier calls inside DB transactions | **Open.** Needs the booking-intent redesign; today a slow courier holds a database connection. Planned as its own piece of work. |
| 008 abandoned worker jobs | **Fixed.** A job still "running" after 10 minutes goes back to the queue, or to dead-letter after 5 attempts. |
| 009 document stays pending when its job fails | **Fixed.** The document is marked failed when its job is dead-lettered. |
| 010 rate-card publish not atomic | **Fixed.** Card, rates, retirement of older cards, courier access and audit row are one transaction. |
| 011 RLS runtime role, 012 cross-seller tests | **Open.** Needs a restricted database role on RDS and a two-seller test suite. |
| 013, 014 static / unfinished screens | **Partly fixed.** Sample tables removed under the live admin pages (COD, Zones, SLA, Performance and the other live operations pages). The six "coming soon" admin pages stay labelled. |
| 015 admin forgot-password CSRF | **Fixed.** Exempt like the seller one. |
| 016 Shopify data-request export | **Open.** Process question, not code. |
| 017 generated logs in the repository | **Fixed.** `.api.log`, `.web.log`, `.playwright-mcp/` removed from git and ignored. |
| 019 storage region mismatch | **Fixed.** `.env.example` now matches the code default (`ap-southeast-2`); set `AWS_REGION` to the bucket's region. |
