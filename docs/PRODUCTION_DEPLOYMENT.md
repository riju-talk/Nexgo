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

## EC2 with nginx on the host (the setup we use)

Only the app runs in Docker (`web`, `api`, `worker`, one-shot `migrate`). nginx, certbot and the firewall live on the host. Compose publishes the containers on `127.0.0.1` only, so nginx is the single public entrance.

1. **Instance**: Ubuntu 22.04/24.04, t3.small or larger, security group open on 22, 80, 443 only. Point a DNS A record at its Elastic IP.
2. **Once**: `git clone` the repo, then `sudo bash deploy/ec2/setup.sh` (Docker + Compose plugin, nginx, certbot, ufw). Log out and in so your user can run docker.
3. **Config**: `cp .env.example .env` and fill it in. For this setup: `NODE_ENV=production`, `FRONTEND_ORIGIN=https://your.domain`, `TRUST_PROXY=true`, `DATABASE_URL` (RDS, or `postgres://USER:PASS@postgres:5432/DB` with `--with-db` below), `BACKEND_URL=http://backend:4010`, fresh `CSRF_SECRET` / `LOCAL_ENCRYPTION_KEY` / `ENCRYPTION_KEY` / `RAZORPAY_WEBHOOK_SECRET`, and the SMTP settings (SES) so approval emails are delivered. `chmod 600 .env`.
4. **nginx**: `sudo cp deploy/nginx/nexgo.conf /etc/nginx/conf.d/`, replace `app.example.com` with your domain, `sudo certbot --nginx -d your.domain`, `sudo nginx -t && sudo systemctl reload nginx`. (IP only, no domain: use the commented plain-http block and set `COOKIE_SECURE=false`, `FRONTEND_ORIGIN=http://<ip>`.)
5. **Deploy**: `bash deploy/ec2/deploy.sh` (add `--with-db` for a Postgres container with a named volume; back it up). It builds, runs migrations, starts everything and checks `/health`. Redeploy the same way after `git pull`.
6. **First sign-in**: `https://your.domain/admin/login` with the built-in admin below, change the password, then approve sellers under Admin > Registrations.

## Built-in admin

`nexgo201@gmail.com` is created at every API start (`backend/src/lib/bootstrapAdmin.ts`, only an argon2id hash is stored in code and in the database, never the password; the initial password was given to the client). An existing account keeps its password, so changing it sticks; `BOOTSTRAP_ADMIN_RESET=true` for one start puts the built-in one back (and signs that admin out everywhere). Because this repo holds the hash of a known password, change it right after the first sign-in and set `ENABLE_BOOTSTRAP_ADMIN=false` once real admins exist. Registration emails go to every platform admin unless `ADMIN_NOTIFY_EMAIL` is set.

## Other AWS pieces

- **RDS PostgreSQL 14+** (`pgcrypto`, `citext`): `DATABASE_URL=...?sslmode=require`. **S3** for files: use the instance IAM role (leave `AWS_ACCESS_KEY_ID/SECRET` empty), `STORAGE_ENABLED=true`. **SES** over SMTP: `SMTP_HOST=email-smtp.<region>.amazonaws.com`, `SMTP_PORT=587`, `SMTP_USER/SMTP_PASSWORD`, verified `MAIL_FROM`.
- ECS/ALB works too: same images, `/v1/*` to the api, the rest to web.

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
