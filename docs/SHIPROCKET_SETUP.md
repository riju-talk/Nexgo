# Shiprocket: set-up and first test

Shiprocket is a second courier aggregator next to Lorrigo (`backend/src/couriers/shiprocket.ts`, `backend/src/couriers/aggregators/shiprocket/index.ts`). Sellers never see its name. It was built from Shiprocket's public documentation and tested against a fake Shiprocket server (26 + 8 end-to-end checks, about 40 unit tests). **It has not yet been run against a live Shiprocket account**, so book ONE test order first (step 7) before sellers use it.

## 1. Create the API user (Shiprocket panel)
Settings > API > Configure > **Create an API User**. The e-mail must be different from your Shiprocket login e-mail (and not registered on Shiprocket); choose a password. NEXGO logs in with this API user, not with your normal login. Recharge the Shiprocket wallet: it pays for every booking, including tests.

## 2. Save the credentials (NEXGO)
Admin > **Integrations** > Shiprocket: API user e-mail, API user password, and a **webhook token** (any random text of at least 24 characters). Press Save, then **Test connection** (it lists courier services, so it also proves the login and serviceability). The card also shows the Shiprocket wallet balance. (Or set `SHIPROCKET_EMAIL`, `SHIPROCKET_PASSWORD`, `SHIPROCKET_WEBHOOK_TOKEN` in `.env`.)

## 3. Tracking webhook (Shiprocket panel)
Settings > API > Webhooks: URL = the one shown on the NEXGO Integrations card (`https://<your domain>/v1/webhooks/carrier-events`; Shiprocket refuses URLs containing "shiprocket", "sr" or "kr", which is why it has its own path), token = the webhook token from step 2. NEXGO accepts the token in the `x-api-key` header (or `Authorization: Bearer`). Without a working webhook tracking still arrives: the worker asks Shiprocket for a slice of the live AWBs every `TRACKING_POLL_MINUTES` (default 10).

## 4. Add the couriers (NEXGO)
Admin > Couriers > **+ Add courier** > "Books through Shiprocket": pick the services Shiprocket offers (the list comes from Shiprocket's serviceability answer on a few sample lanes, so a service that serves none of them may be missing: its id, `courier_company_id`, can be typed instead). Then **Assign courier & rates** per seller: prices always come from NEXGO rate cards.

## 5. How a booking works
login (token cached) > pickup location `NX-<warehouse>` (created once per warehouse) > create order (`/orders/create/adhoc`) > serviceability check > assign AWB > request pickup. A retry reuses the order already created (`aggregator_orders`), never creating it twice. Cancel = `/orders/cancel` with the Shiprocket order id (kept in `shipments.provider_shipment_id`); the wallet refund still happens once, by NEXGO.

## 6. Failover and empty wallets
Each aggregator has its own wallet. With both configured: a courier on an empty aggregator is skipped without a call and the next courier (on the other aggregator) is tried; only when every aggregator with a live courier is empty do orders wait and book by themselves after a top-up. Admins are e-mailed and see the balances on the dashboard.

## 7. First live test (do this before going live)
Book one prepaid order with one courier, then: check the AWB shows in NEXGO and in the Shiprocket panel; check the wallet moved on both sides; watch the first tracking event arrive (webhook or poll); cancel it and check both wallets. If the pickup address is refused ("needs verification"), open the pickup location `NX-...` in Shiprocket and verify it once.

## Known gaps (unverified against the live API)
- The wallet balance endpoint (`/account/details/wallet-balance`), the exact webhook authentication header, and status ids 6/7/9/10/12/17/18/21/42 were taken from documentation and memory; unknown statuses are reported as "unmapped" in the delivery log, never guessed.
- NDR actions are not pushed to Shiprocket (the NDR is recorded and shown in NEXGO; the seller's decision stays in NEXGO). Needs the exact NDR action endpoint.
- Token lifetime is documented as both 24 h and 240 h: NEXGO refreshes it after 20 h and on any 401.
