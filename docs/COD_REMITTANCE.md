# COD remittance: the rules

Code: `backend/src/lib/codCycles.ts` (rules, figures, daily cycle job), `routes/billing.ts` (`GET /v1/billing/cod`),
`routes/codRemittance.ts` (admin generate / approve / remit), test `backend/tests/e2e/cod.mjs`.

## Life of one COD parcel

1. **Delivered.** The parcel's COD amount is now owed to the seller. D = delivery day (India date).
2. **Due on D + N.** N = the seller's `remittance_days` (admin sets it, default 2).
   Delivered 18 Nov, N = 2 -> due 20 Nov.
3. **Cut into a cycle.** Every hour (and whenever the seller opens the COD page) the system collects each seller's parcels that are
   due and not yet in a cycle into ONE payout cycle (status `pending`) and links every parcel to it (`shipments.cod_cycle_id`).
   A parcel is therefore in exactly one cycle: never twice, and a late delivery scan is picked up by the next cycle instead of being missed.
4. **Approved, then paid.** A finance admin approves the cycle, then records the bank transfer reference. Paying is refused before the due date.
   If the seller's wallet is negative, the shortfall is recovered from the payout first (wallet -10,000, COD 1,00,000 -> pays 90,000, wallet 0).

## Amount owed

`COD collected` for the parcel. Freight is **not** taken again: it was already debited from the wallet when the parcel was booked.
Set `COD_DEDUCT_FREIGHT=true` to also deduct freight from the COD payout (only do that if the wallet is not debited at booking).
Prepaid parcels never appear. COD on parcels still in transit is not owed yet.

## The four figures on the seller's page

| Figure | Meaning |
| --- | --- |
| Total remittance due | Delivered COD not yet paid: cycles not remitted + parcels not yet in a cycle, due or not |
| Remitted till date | Money actually paid out (after any wallet recovery) |
| Last remittance | The most recent payout |
| Next remittance (expected) | What the next payout will be: everything already due; if nothing is due, what falls due first. Shown with its date (D + N of the oldest unpaid parcel) |

Under the cards, "Delivered COD waiting for its payout day" lists unpaid parcels by the day they fall due.
The dashboard's "COD pending" and the admin figures use the same function (`codPending` in `lib/metrics.ts` -> `unpaidItems` + `summarizeDue`).
