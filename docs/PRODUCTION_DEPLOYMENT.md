# Production deployment (Docker / AWS)

## Images

| Image | Built from | Runs |
| --- | --- | --- |
| `nexgo-web` | `./Dockerfile` | Next.js standalone server on 3021 |
| `nexgo-api` | `./backend/Dockerfile` | `node dist/local.js` (API, 4010), `node dist/worker.js` (job runner), `node dist/db/migrate.js` (migrations) |

`docker compose up --build` starts `migrate` (once) -> `backend` + `worker` -> `frontend`. Add `--profile local` for a throwaway Postgres, Mailpit and MinIO.

No secret is baked into an image: `.dockerignore` excludes `.env`, and the only build arguments (`BACKEND_URL`, `NEXT_PUBLIC_API_BASE`) are routing, not secrets.

## One env file

`.env.example` lists every variable. Locally it is the root `.env` (git-ignored), read by the backend, the frontend build and compose. On AWS the same names go into Secrets Manager / SSM Parameter Store and are injected as container environment variables (real environment variables win over any file). The backend refuses to start in production if a required secret is missing and names the missing variables (never the values). There are no secret defaults in code.

## AWS mapping

- **ECS Fargate (or EKS)**: three services from two images: `web`, `api`, `worker`; run `migrate` as a one-off task before each deploy (`node dist/db/migrate.js`).
- **ALB** in front: `/v1/*` -> `api`, everything else -> `web`. Same domain, so cookies stay first-party. Build `web` with `NEXT_PUBLIC_API_BASE=` (empty) in that case, or leave the Next server to proxy with `BACKEND_URL=http://api:4010`. Health checks: `GET /health` (api), `GET /login` (web).
- Set `TRUST_PROXY=true` on the api (real client IPs for rate limits and session logs), `FRONTEND_ORIGIN=https://your.domain`, terminate TLS at the ALB. Cookies are `Secure` in production.
- **RDS PostgreSQL 14+** (`pgcrypto`, `citext`): `DATABASE_URL=...?sslmode=require`. **S3** for files: use the task IAM role (leave `AWS_ACCESS_KEY_ID/SECRET` empty), `STORAGE_ENABLED=true`. **SES** over SMTP for mail: `SMTP_HOST=email-smtp.<region>.amazonaws.com`, `SMTP_PORT=587`, `SMTP_USER/SMTP_PASSWORD`, verified `MAIL_FROM`.

## Authentication model

- **Cookies**: `nx_session` is HttpOnly, `Secure` (production), `SameSite=Lax`, server-side revocable (only a SHA-256 of the token is stored). Logging in revokes the session the browser already had.
- **CSRF**: double-submit cookie `nx_csrf` + `x-csrf-token` header on every POST/PUT/PATCH/DELETE, and the token is HMAC-signed to the session it was issued for (`CSRF_SECRET`), so a token copied from another login or planted by a sibling subdomain is rejected. A stale token (for example from before a deploy) is repaired by the heartbeat; the web client retries once automatically.
- **Heartbeat**: `POST /v1/auth/heartbeat {active}` once a minute from the app (`components/SessionHeartbeat.jsx`). It reports whether the session is alive, extends the idle timer only when the user really was active, and re-issues the CSRF cookie. `SESSION_IDLE_MINUTES` (default 120) signs out an untouched tab; `SESSION_TTL_DAYS` (default 7) is the absolute limit. Any 401 anywhere in the app sends the user to the sign-in page.
- **Registration and approval**: `POST /v1/auth/signup` creates a *pending* seller and issues no session; admins (`ADMIN_NOTIFY_EMAIL`, else every platform admin) get an e-mail. **Admin > Registrations** (`/admin/registrations`) approves or rejects; the owner is e-mailed the decision and can sign in only after approval. Login answers `ACCOUNT_PENDING_APPROVAL` / `ACCOUNT_REJECTED` only after the correct password, so it does not reveal which e-mails exist. Mail is best effort: if SES is down the decision is still saved and the admin sees "email could not be sent".
- **Dev logins**: fixed in `backend/src/lib/devAccounts.ts`, created only when `NODE_ENV=development` **and** the database host is local. Never in production, never in the UI, hidden from the API docs outside development. They never overwrite an existing account.

## Before the first real deploy (checklist)

1. **Rotate the Neon database password.** The old connection string was committed in `backend/src/config.ts` and is in git history. Removing it from the file does not un-leak it.
2. **Delete or re-password the demo accounts** in any database that holds real data (`demo@acmeexports.com`, `admin@nexgo.in`): their passwords were public in the repo and on the login page.
3. Generate fresh `CSRF_SECRET`, `LOCAL_ENCRYPTION_KEY`, `RAZORPAY_WEBHOOK_SECRET`, `COURIER_WEBHOOK_SECRET`.
4. `ENCRYPTION_KEY` (bank account numbers): the value the app silently used before is public. If real bank data already exists, re-encrypt it with a new key (a small script; not written yet). With no real data yet, just generate a new key.
5. Set up admin MFA (TOTP) for every platform admin before go-live.
6. Add a real SMTP/SES sender and send a test registration through approve and reject.
