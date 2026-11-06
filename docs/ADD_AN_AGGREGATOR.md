# Adding a courier aggregator

NEXGO books couriers through **aggregators** (Lorrigo today). Each one is a **plugin**: one folder, one registry line, credentials pasted on an admin page. Nothing else in the code names an aggregator.

## What you need from the aggregator
- API documentation and a sandbox/test key.
- How a booking works (create order, rates/serviceability, create shipment) and what it returns (AWB, shipment id).
- How to cancel, and whether a cancelled order can be re-sent.
- How tracking arrives: **webhook** (URL + token/signature + payload) and/or an API to read tracking.
- Their status names (to map to NEXGO's) and whether they offer NDR actions.
- A real **recorded response** for each call (save them as fixtures: see `backend/tests/unit/couriers/lorrigoPlugin.test.ts`).

## Steps
1. `cd backend && npm run new:aggregator -- <id> "<Label>"` creates `src/couriers/aggregators/<id>/index.ts`.
2. Add the plugin to `src/couriers/aggregators/index.ts` (the command prints the two lines).
3. Fill in the TODOs: `book`, `cancel`, optionally `listServices`, `ndrAction`, the webhook `verify` / `parse`, and `poll` if the aggregator can be asked for tracking.
4. Set the `capabilities` to what is really implemented (`false` hides the feature).
5. `npx vitest run tests/unit/couriers`: `aggregatorContract.test.ts` checks every plugin automatically (ids, secrets never shown, refuses to run without credentials, webhook rejects wrong tokens, garbage payloads parse to nothing). Add tests with recorded real payloads for your mapping.
6. Start the app. The plugin gets its row in `courier_aggregators` on start-up (no migration).
7. **Admin > Integrations:** paste the API key and webhook token, press **Test connection**, copy the webhook URL into the aggregator's dashboard.
8. **Admin > Couriers > + Add courier:** choose the aggregator, pick its services (`listServices`), then **Assign courier & rates** for sellers. Prices always come from NEXGO rate cards.
9. Book one real test order and cancel it; check the wallet before and after.

## Rules every adapter keeps
- **Never fake a booking.** Missing credentials throw a readable 503, never a made-up AWB (the in-process mock is only for the sandbox courier).
- **Idempotent.** A retry of the same order must reuse what was already created or shipped, never book twice.
- **Errors:** 422 = this courier cannot take this parcel (add `laneRefusal: true` for a lane problem so it is remembered for 24 h); 5xx / timeouts = 502.
- **Cancel:** do not treat "not found" as success.
- **Tracking:** map the aggregator's statuses to `in_transit`, `out_for_delivery`, `delivered`, `ndr`, `rto` (with `rto` sub-status), `lost`. A cancellation made at the aggregator is deliberately not applied (it must go through NEXGO's cancel so the wallet refund happens once); return it as `unmappedStatus` so support sees it.
- **Never store or log secrets.** Credentials are encrypted (`aggregator_credentials`) and the Integrations page never shows them back.

## Where things live
| Piece | File |
|-------|------|
| Plugin contract | `backend/src/couriers/aggregators/types.ts` |
| Plugin list | `backend/src/couriers/aggregators/index.ts` |
| Adapter lookup | `backend/src/couriers/registry.ts` (`courierAdapter`, `aggregatorAdapter`) |
| Saved credentials | `backend/src/couriers/credentials.ts`, table `aggregator_credentials` |
| Webhooks | `POST /v1/webhooks/aggregators/:id` (`routes/aggregatorWebhooks.ts`); Lorrigo's old URL `/v1/webhooks/lorrigo` still works |
| Shared tracking logic | `backend/src/lib/trackingIngest.ts` |
| Tracking poll (safety net) | `backend/src/lib/trackingPoll.ts` (`TRACKING_POLL_MINUTES`, default 10) |
| Admin API | `routes/adminAggregators.ts`; screen `components/AdminIntegrations.jsx` |
