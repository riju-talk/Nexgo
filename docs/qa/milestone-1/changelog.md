# Milestone 1 QA — admin change set (2026-10-15)

Source: `Milestone 1 QA (2).pdf` (text in `transcript.md`, page renders in `assets/`). Reference image (PDF p.6-7): seller profile card with Actions / Contact & Role / Account & Balance, then Address / Bank / Business / System info / COD remittance.

| QA item | Change | Where |
|---|---|---|
| Seller profile page | `/admin/sellers/:id`, opened from the table's View Details (replaces the old modal) | `components/AdminSellerProfile.jsx`, `GET /v1/admin/sellers/:id/profile` |
| Update password | Sets owner password, signs them out everywhere | `POST .../password` |
| Assign / view rate card | Copies another seller's active card as a new card (old shipments keep their price) | `GET .../rate-card`, `GET /v1/admin/rate-cards`, `POST .../assign-rate-card` |
| Wallet management | Credit note / debit note as ledger entries (`credit_note` / `debit_note`), idempotent, finance/super admin only | `POST .../wallet-notes` |
| Debit limit | `sellers.wallet_debit_limit_paise`; booking allows balance down to −limit | `routes/shipments.ts` |
| POC details | KAM, opened by, debit approval amount/by, remittance D+1..D+7 | `PATCH .../poc`, migration 0038 |
| Pincode access | Per-seller (optionally per-courier) block list, bulk paste/clear; enforced in quotes, auto-assign and booking | `seller_pincode_blocks`, `routes/shipping.ts`, `routes/shipments.ts` |
| Performance report | Packets, delivered, delivery % (delivered ÷ non-cancelled packets) with date filter | `GET .../performance` |
| Profitability | Σ(seller rate − courier rate) per packet; courier rate = platform cost card (Partners → "Courier cost") | `GET .../profitability`, `POST /v1/admin/sellers/platform/rate-cards` |
| View as seller | Admin gets a 2h seller session; red banner + Exit; writes audited; team/password/session changes blocked | `routes/adminSellerProfile.ts`, `components/ImpersonationBanner.jsx` |

Rollback: migration 0038 is additive (`DROP TABLE impersonation_sessions, seller_pincode_blocks; ALTER TABLE sellers DROP COLUMN ...`); revert the commit for code.

Open questions (assumed defaults in brackets): debit-approval amount is recorded only, not enforced [Q11]; who may impersonate [super/ops/support]; delivery % denominator [non-cancelled]; theme colour and invoice format still not supplied; "Rets will updated once Admin is half completed" unclear; uploaded-document files (needs storage); Teams & Roles and COD Order Confirmation were built afterwards (see CLAUDE.md); Export / View-customer permissions are stored but not enforced on the data.
