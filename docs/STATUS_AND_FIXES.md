# NEXGO: what works, what was fixed, what is left

Date: 2026-11-06. Tested on the live site (mynexgo.com) as an admin and as a seller.

## Index
1. Problems you reported and how they were fixed
2. What the test accounts were given
3. What was tested and works
4. Decisions taken
5. Bug list from the audit report
6. What is left

## 1. Problems you reported and how they were fixed

**Pushing orders to a courier was very slow (3 of 25 orders done in 10 minutes)**
- Why it was slow
  - One booking took about 8 seconds at the courier.
  - The app kept a database connection busy for the whole 8 seconds.
  - The browser sent bookings one at a time, and the server stopped any request that ran past 60 seconds.
- What we changed
  - A booking is now 3 short steps: check, ask the courier, save.
  - No database connection is held while the courier is working.
  - The wallet is locked only for the moment of saving, and the balance is checked again at that moment.
  - Orders are handed to a background queue. The page shows progress, and you can close it.
  - Fewer calls to the courier per booking.
- Result on the live site with the real courier (Shadowfax)
  - 70 orders created in 0.7 seconds.
  - 70 bookings done in 31.5 seconds. Before, it was about 0.5 per second. Now it is about 2.2 per second.
  - Every parcel was charged exactly the price quoted.
  - All 70 were cancelled afterwards and the wallet came back to the exact starting amount.
  - With the test courier, 70 orders are booked in about 2 seconds.

**"Order Id already exists" error from the courier**
- The app only looked at the courier's 10 newest orders. It now looks through all of them.

**Orders showed up in small batches**
- Orders are now saved 50 at a time. 4,639 orders were saved in under a second in a test.

**Admin activity log showed "System" for everything**
- It now shows who did it: admin, seller, API or system.
- It also shows the role, a request number, filters and an export.
- Every change made by an admin, and every admin sign-in, is recorded.

**Revenue numbers counted test credits**
- "Wallet recharges" now counts only real payments.

**Pages that crashed or showed made-up data**
- Fixed: Courier Performance, MIS, Track export, SLA settings, COD, Zone mapping.
- Sample tables no longer appear under the live pages.

**Other fixes**
- Browser pop-ups are replaced by in-app dialogs.
- KYC is saved in three parts.
- A pincode from the wrong state is refused.
- Clear messages for a wrong phone number (ready, goes out with the next deploy).
- The XpressZone rate card was rebuilt with return (RTO) prices.

## 2. What the test accounts were given
- ₹1,00,000 in the wallet, for each account.
- All 7 Lorrigo couriers, with a rate card, for each account.
- Agreement accepted, a courier priority list, and a warehouse.
- A test courier ("Sandbox") that an admin can switch on for one seller.
  - It costs ₹1 per parcel.
  - The admin can make it look picked up, delivered, undelivered (NDR) or returned (RTO).
- COD payout day set per seller (Starship: 2 days after delivery).
- The duplicate "XpressZone" account was left as it is.

## 3. What was tested and works
**Admin**
- Search.
- Block and unblock a pincode, for all sellers and for one seller.
- Wallet credit and debit notes. Sending the same note twice does not credit twice.
- Edit the account manager and the debit limit.
- Resolve a support ticket with a note.
- SLA: create, edit, switch off and on, remove.
- Zone lanes: add, edit, delete.
- Courier pincode rules: create, delete.
- COD payout: create a cycle, approve, pay. The amounts were correct.
- KYC list and filter.

**Seller**
- Create, edit and cancel orders. Duplicate orders and wrong-state pincodes are refused.
- Book a courier. Booking the same order again does not book twice.
- Cancel a shipment. The refund is exact and happens once.
- Tags, label and invoice data, tracking many AWBs at once.
- Undelivered (NDR): ask for a re-attempt, then return to origin (RTO). The RTO fee is charged once.
- The wallet history shows the AWB.
- Warehouse: add, change, remove. Raise a support ticket.

**Real courier:** 70 Shadowfax bookings, then 70 cancellations (see section 1).

## 4. Decisions taken
**KYC is switched off on purpose.**
- Sellers can book and ship without KYC.
- Reason: testing was being blocked. It will be switched on before real sellers start.

**Every admin sign-in is verified by email.**
- After the password, a 6-digit code goes to the admin's email, and the admin must enter it to get in.
- Status: built. EVERY admin sign-in needs a 6-digit code sent to the admin's email. A correct password alone never opens a session. A code is also emailed when an admin is registered through the API. The code works once, lasts 10 minutes and locks after 5 wrong tries.

**There is no fake payment mode.**
- Wallet recharge works only with real Razorpay keys.
- Without keys, the recharge shows "Online payments are not set up yet."
- The test wallets were topped up by the admin.

**The app uses one database role.**
- There is no separate limited role for the app.
- Seller data is kept apart by the queries and the database row rules.

## 5. Bug list from the audit report
| Bug | Status |
|---|---|
| 003 Admin sign-in without a second step | Done for every admin: email code at each sign-in (section 4) |
| 004 KYC does not block users | On purpose, switched off for testing (section 4) |
| 005 Payment amount not compared with the recharge | Not changed. Waiting for the client |
| 006 Fake payment mode | Removed |
| 007 Courier call inside a database transaction | Fixed |
| 008 Background jobs stuck forever | Fixed. A stuck job is picked up again after 10 minutes |
| 009 Document stays "pending" after a failure | Fixed. It is marked failed |
| 010 Rate card saved in pieces | Fixed. It is saved in one go |
| 011 Database role | One role, on purpose (section 4) |
| 012 Tests that seller A cannot see seller B | Not done. Waiting for the client |
| 013 Pages with made-up data | Mostly fixed. The rest say "coming soon" |
| 014 Unfinished features | Marked "coming soon": escalations, credit limits, live chat, system settings, API management, role permissions |
| 015 Admin forgot-password blocked by a security check | Fixed |
| 016 Shopify customer data request | Only logged and acknowledged. Not changed |
| 017 Log files in the repository | Removed |
| 019 Storage region setting | Not changed. Set the region on the server |

## 6. What is left
**Needs a decision or input from the client**
- Payment amount check on recharge (bug 005).
- Tests that one seller cannot see another seller's data (bug 012).
- Switching KYC on again, and when.

**Not built yet**
- A second courier company through its own API (the system is ready for one).
- Switching to a backup courier when one fails.
- Notifications to customers, seller webhooks, Shopify status updates.

**To confirm**
- Pincode rules and zone lanes can be added and edited. We have not confirmed that they change which couriers are offered at booking.
- Zone lanes CSV import was not tested.
- Parcels still waiting for pickup show no tracking yet, because the courier has not scanned them.
- Website speed (Lighthouse): home 86, login and signup 93 on mobile. Fixes are ready; we will measure again after the next deploy. Pages after sign-in were not measured.

**Test leftovers on the live site**
- 2 resolved test tickets.
- Some test orders and cancelled test shipments.
- 9 test orders at Lorrigo that Lorrigo does not allow us to delete.
