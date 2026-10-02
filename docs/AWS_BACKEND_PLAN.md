# NEXGO backend plan — AWS build-out

**Purpose:** map the phase structure and security rules already agreed in `BACKEND_PLAN.md` onto concrete AWS services. Same ten phases, same exit gates, same non-negotiable security rules — this document answers *which AWS service does each job*, not whether the job needs doing.

**Assumed topology:** the frontend stays on Vercel (it already works, deploys automatically from `main`, and there's no reason to move it). The backend — API, workers, database, queues, storage — lives on AWS. The Next.js app calls the AWS API over HTTPS the same way it would call any external API; this is not a monorepo-deploy-to-one-place setup.

---

## Architecture at a glance

| Concern | AWS service | Why this one |
|---|---|---|
| API compute | **ECS Fargate** behind an **Application Load Balancer** | Always-warm containers, no cold starts on the booking/checkout path, no 15-minute execution ceiling to design around |
| Worker compute | **ECS Fargate** (separate service, same cluster) | Long-running SQS consumers for sync/tracking/invoice/export jobs — the one thing that can't be serverless |
| Queue | **Amazon SQS** (standard + FIFO where order matters, e.g. wallet ledger writes) | Native, no Redis cluster to operate; DLQ per queue for failed-job visibility |
| Scheduled jobs | **Amazon EventBridge Scheduler** | Replaces cron for NDR auto-RTO sweeps, payout cycles, invoice generation |
| Database | **Amazon RDS for PostgreSQL** (Multi-AZ from the start) | Native row-level security support — the tenant-isolation backbone from `BACKEND_PLAN.md` rule 1 |
| Object storage | **Amazon S3** (private buckets, versioning on) | Labels, manifests, invoices, KYC docs, dispute evidence — all behind presigned URLs, never public |
| CDN for file delivery | **CloudFront** in front of S3 | Signed URLs/cookies for the same private files at lower latency |
| Secrets | **AWS Secrets Manager** + **KMS** | Rotation support for DB creds and payment/courier API keys; KMS envelope-encrypts channel OAuth tokens before they touch Postgres |
| Auth backing store | **Amazon Cognito User Pools** (API-only, no Hosted UI) | AWS-native password storage, breach-password checks, and TOTP MFA — called from our own custom login/signup screens via `InitiateAuth`, so the UI NEXGO already designed stays exactly as it is |
| Email | **Amazon SES** | Matches the earlier decision to launch with email-only notifications and defer WhatsApp/SMS — SES is the natural AWS-native fit for that scope |
| Edge protection | **AWS WAF** + **Shield Standard** (free tier) in front of the ALB | Rate-based rules on auth and webhook endpoints |
| Observability | **CloudWatch** (Logs, Metrics, Alarms) + **X-Ray** | Baseline tracing/metrics; layer **Sentry** on top for app-level error grouping — CloudWatch alone doesn't group errors well |
| CI/CD | **GitHub Actions** → **ECR** → ECS rolling deploy | Migrations run as a one-off Fargate task against RDS through the same VPC, never from a developer's machine |
| Infra-as-code | **AWS CDK (TypeScript)** | Same language as the backend — no context-switching into HCL for a small team |
| Networking | **VPC**: RDS and both ECS services in private subnets; only the ALB sits in a public subnet | RDS is never reachable from the internet, full stop |

Payments (Razorpay) and couriers/channels (Delhivery, Shopify, etc.) stay third-party — AWS doesn't have a domestic equivalent, and there's no reason to build one.

---

## Phase-by-phase AWS mapping

### Phase 1 — Architecture, environments, and secure delivery
- **VPC** with public/private subnets across 2 AZs; **NAT Gateway** for outbound-only traffic from private subnets.
- **RDS PostgreSQL** provisioned per environment (`dev`/`staging`/`prod`), each with its own credentials in **Secrets Manager** — never a shared instance across environments.
- **ECR** repositories for the API and worker images; **CDK** stacks for VPC, RDS, ECS cluster, ALB, and IAM roles, one stack per environment.
- **GitHub Actions**: lint/test/dependency-audit on every PR, `cdk deploy` gated behind a manual approval for `prod`.
- **CloudWatch Alarms** wired to a notification channel from day one (SNS → email/Slack) — not an afterthought once something breaks.

**Exit gate (AWS-specific addition):** `cdk deploy` can stand up a brand-new environment from zero with one command, and an RDS snapshot restore into a scratch instance has actually been tested once.

### Phase 2 — Identity, tenancy, sessions, and RBAC
- **Cognito User Pool** holds credentials and MFA state; backend calls `AdminInitiateAuth`/`RespondToAuthChallenge` so the login/signup screens stay fully custom.
- Session tokens: Cognito-issued JWTs, verified per-request in the ECS API via a JWKS check — no server-side session store needed for this part.
- **RBAC and tenant resolution** happen in application middleware reading `seller_id`/role claims, backed by **Postgres RLS** as the enforcement floor (rule 1) — Cognito authenticates, Postgres authorizes.
- MFA: Cognito's built-in **TOTP**, required at the Cognito-group level for Platform Admin and Finance roles.

**Exit gate (AWS-specific addition):** a Cognito-issued token for Seller A's user is rejected by RLS if the application layer is bypassed and the query is run directly — the database, not just the API, refuses cross-tenant reads.

### Phase 3 — Core seller operations and source-of-truth data model
- Schema/migrations run via **Prisma** (or Drizzle) against RDS, applied through a one-off **Fargate task**, never from a laptop with a VPN tunnel.
- Audit event table lives in the same RDS instance for transactional consistency with the rows it describes.
- PII fields (customer phone/address) encrypted at the application layer before insert, using a **KMS** data key — not relying on RDS-at-rest encryption alone for the specific fields that matter most.

**Exit gate:** unchanged from `BACKEND_PLAN.md` — this phase is mostly schema and doesn't lean heavily on AWS-specific choices beyond where it's hosted.

### Phase 4 — Channel integrations and dependable order sync
- Inbound webhooks (Shopify etc.) hit the **ALB → ECS API**, which does signature verification synchronously, then drops the raw event onto **SQS** for the worker to process — the webhook responder never blocks on the actual sync logic.
- OAuth tokens per channel: encrypted with a **KMS** data key, stored in Postgres (not Secrets Manager — that's for infra credentials, not the growing set of per-seller, per-channel tokens).
- Sync jobs scheduled via **EventBridge Scheduler** as a polling fallback for channels without reliable webhooks.
- DLQ per channel's SQS queue — a channel with a broken integration doesn't block the queue for every other seller.

**Exit gate:** replaying the same SQS message twice (simulating an at-least-once delivery) does not create a duplicate order — verified with an actual replay test, not just the code review.

### Phase 5 — Courier gateway, serviceability, and rate engine
- Courier adapters run as regular application code inside the ECS API/worker — no separate compute needed here, this is an abstraction layer, not infrastructure.
- Per-courier API keys in **Secrets Manager**, one secret per courier per environment, rotated independently.
- Bulk pincode uploads (up to 50k rows) processed via SQS-backed worker jobs, not synchronously in the request — the UI already implies this should be async.

**Exit gate:** unchanged — this phase is mostly business logic, not infrastructure.

### Phase 6 — Shipment booking, labels, manifests, and tracking
- Label/manifest PDFs generated by the worker service, written to **S3**, served only via **CloudFront signed URLs** with a short expiry (minutes, not hours).
- Booking idempotency keys stored in Postgres with a unique constraint — belt-and-suspenders alongside SQS's own at-least-once semantics.
- Raw courier tracking payloads stored in S3 (cheap, append-friendly) with the parsed `ScanEvent` in Postgres — keeps the audit trail without bloating the transactional database.

**Exit gate:** a label's S3 object key is never guessable or listable — confirmed by attempting to enumerate a bucket with public tooling and getting nothing back.

### Phase 7 — Exceptions, automation, and customer communication
- **EventBridge Scheduler** drives the NDR auto-RTO sweep and SLA-warning checks on a fixed cadence.
- Evidence-photo uploads (weight disputes) go straight to **S3** via presigned `PUT` URLs from the browser — the backend never proxies file bytes through itself.
- Email via **SES** for every customer/seller notification in this phase, per the earlier decision to defer WhatsApp/SMS.

**Exit gate:** unchanged — this phase's exit gate is about auditability of automated actions, which is a data-model concern, not an AWS one.

### Phase 8 — Money, payments, COD, invoices, and compliance
- Payment/payout webhooks (Razorpay) land on the same **ALB → ECS API → SQS** pattern as channel webhooks — signature-verify synchronously, process asynchronously.
- Wallet ledger writes use a **FIFO SQS queue** per seller (or a Postgres advisory lock) to guarantee ledger entries apply in order — this is the one place message ordering actually matters.
- GST invoice PDFs generated by the worker, stored in **S3** with **Object Lock** (WORM) enabled on that bucket — makes "no gaps, no reuse" a storage-level guarantee, not just an application promise.
- Step-up MFA for payout approval enforced via a fresh Cognito re-auth challenge before the approval endpoint accepts the request.

**Exit gate:** an attempt to overwrite or delete an already-generated invoice PDF in S3 fails at the bucket-policy level, independent of what the application code does.

### Phase 9 — Reporting, admin control plane, and operational resilience
- Report generation (MIS exports) runs on the worker service, writes to **S3**, delivered via short-lived **CloudFront signed URLs** — the admin panel scaffolded on the frontend already expects exactly this shape (job status, retry, signed download).
- Admin-panel API routes sit behind a **separate Cognito group** (`platform-admin`), checked independently of seller RBAC — never an elevated seller permission.
- Background-job dashboard reads directly from SQS queue depth/DLQ metrics (via CloudWatch) plus the application's own job-run table, so "retry" in the UI is a real SQS redrive, not a fake button.

**Exit gate:** unchanged — the trust-boundary requirement (admin access is its own thing, not inherited) is an application/IAM concern that AWS enables but doesn't automate for you.

### Phase 10 — Security hardening, scale testing, and launch readiness
- Load testing targets the **ALB** directly (via a tool like k6 or Artillery run from a separate CI job), specifically against the webhook and booking endpoints named in earlier phases as the highest-traffic paths.
- **AWS WAF** rate-based rules and **Shield Standard** are already live from Phase 1 — this phase is where their thresholds get tuned against real load-test numbers, not where they're switched on for the first time.
- Backup/restore drill: an actual **RDS snapshot restore** into an isolated environment, timed, with the result written down — not a checkbox.
- Secret rotation exercise: rotate the RDS master credential via **Secrets Manager**'s built-in rotation Lambda and confirm the running ECS services pick up the new credential without a restart.

**Exit gate:** unchanged from `BACKEND_PLAN.md` — this phase's bar is a passed pen-test and a proven recovery drill, and AWS is the substrate those get proven on, not a substitute for doing them.

---

## Decisions specific to going with AWS

1. **ECS Fargate vs. Lambda for the API.** Recommending Fargate: booking/checkout latency shouldn't have to account for cold starts, and the API needs to hold connections open for things like SSE-style live sync status later. Lambda remains a fine choice for small, bursty, independent pieces (e.g., a presigned-URL generator) if one comes up — it's not an all-or-nothing choice.
2. **Cognito vs. fully self-managed sessions in Postgres.** Recommending Cognito for credential storage and MFA specifically, while keeping every screen the UI already has — this is a narrower use of Cognito than its Hosted UI, and avoids reimplementing password-breach checks and TOTP from scratch. If the team would rather own 100% of this layer (no AWS lock-in on auth), self-managed sessions from `BACKEND_PLAN.md`'s original recommendation still works fine on this same infrastructure — this is the one place the two documents' defaults actually diverge, worth a real yes/no before Phase 2 starts.
3. **CDK vs. Terraform.** Recommending CDK in TypeScript for language consistency with the backend. Terraform is the right call instead if anyone on the team already has deeper Terraform experience than CDK/CloudFormation — this is a preference call, not a correctness one.
4. **SQS vs. keeping Redis/BullMQ.** Recommending SQS to stay AWS-native and avoid operating a Redis cluster. The trade-off: BullMQ's dashboard/UI tooling is more mature than SQS's; if job-queue observability tooling matters enough, ElastiCache for Redis is a reasonable substitute for the queue (not the database).
5. **Single AWS account vs. multi-account.** Not addressed above — for a team this size, one AWS account with strict IAM boundaries between `dev`/`staging`/`prod` is simpler to operate than AWS Organizations with separate accounts per environment. Multi-account is the more "correct" enterprise pattern but adds real operational overhead; worth revisiting only once there's a second engineer or a compliance requirement that specifically demands it.

---

## What doesn't change

Every non-negotiable security rule, every phase's exit gate, and the ten-phase order from `BACKEND_PLAN.md` still stand — this document only answers *which button gets clicked in AWS* for each of them. If the three-way discussion changes the phase plan itself, this document follows that change, not the other way around.
