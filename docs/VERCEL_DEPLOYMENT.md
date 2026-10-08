# Deploying NEXGO to Vercel

Two Vercel projects from the same repo:

| Project | Root directory | What it is |
|---|---|---|
| `nexgo-api` | `backend` | Fastify API as one serverless function (`backend/api/index.js` → `dist/app.js`) |
| `nexgo-web` | `.` (repo root) | Next.js frontend |

The frontend never calls the API cross-origin. `next.config.mjs` proxies `/v1/*` to `BACKEND_URL`, so the session and CSRF cookies stay first-party on the frontend domain (no `SameSite=None` or CORS changes needed).

## Test-data deploy (no settings needed)

The demo is fully hardcoded: the API defaults to the Neon test database and the frontend defaults to `https://nexgo-zpcx.vercel.app` on Vercel, so **no environment variables are required**. Deploy `backend` and the repo root as two projects and open the frontend.

Demo logins (already in the Neon database; the seed scripts were removed after loading): seller `demo@acmeexports.com` / `Demo@123`, admin `admin@nexgo.in` / `Admin@456`. Label and invoice-PDF actions show a "coming soon" message.

The Neon connection string is committed in `backend/src/config.ts`. That is acceptable only for this throwaway demo: delete the Neon project after review. The sections below are the proper setup for real data.

## 1. Create the production database

Vercel does not host Postgres itself; use Neon, Supabase or any managed Postgres 14+ (needs the `pgcrypto` and `citext` extensions, which all of them provide).

1. Create a database and copy its **pooled** connection string (pgbouncer / "pooler" host) ending in `?sslmode=require`.
2. Run the migrations from your machine against it:
   ```bash
   cd backend
   DATABASE_URL="postgres://…pooled…?sslmode=require" LOCAL_ENCRYPTION_KEY=x npm run migrate
   ```
   (`0026_report_runs.sql` creates the table behind the Reports page.)
   If the provider's pooler rejects the migration (some run in transaction mode), use its **direct** connection string for this step only.
3. Create the first platform admin directly in SQL (insert a `users` row with an argon2id hash and a `platform_admins` row), or restore a seed script from git history.

## 2. Deploy the API (`nexgo-api`)

1. Vercel → **Add New → Project** → import the repo → set **Root Directory** to `backend`.
2. Framework preset **Other**. Leave the build command as in `backend/vercel.json` (`npm run build`, compiles TypeScript to `dist/`).
3. Add environment variables (Production):

   | Variable | Value |
   |---|---|
   | `NODE_ENV` | `production` |
   | `DATABASE_URL` | pooled connection string from step 1 |
   | `DB_POOL_MAX` | `3` (each serverless instance has its own pool) |
   | `FRONTEND_ORIGIN` | the frontend URL, e.g. `https://nexgo-web.vercel.app` (used for CORS and links in emails) |
   | `LOCAL_ENCRYPTION_KEY` | `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |
   | `ENCRYPTION_KEY` | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
   | `COURIER_WEBHOOK_SECRET` | 32+ random characters |
   | `RAZORPAY_WEBHOOK_SECRET` | random string (the boot check rejects the committed default in production) |
   | `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY` | S3-compatible credentials (must not be the committed `nexgo_local` defaults, or the API refuses to boot) |
   | `STORAGE_ENABLED` | leave unset (`false`). Label and invoice-PDF buttons then show a "coming soon" message; set `true` only after the `MINIO_*` bucket settings below are configured |
   | `SMTP_HOST`, `SMTP_PORT` | a real SMTP provider (password-reset and invite emails) |
   | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | optional; unset keeps the mock gateway |

   Keep the encryption keys stable; rotating them makes previously encrypted bank details unreadable.
4. **Deploy**, then check `https://<api>.vercel.app/health` → `{"status":"ok"}` and `/ready` → `{"status":"ready"}` (`/ready` proves the database connection works).

## 3. Deploy the frontend (`nexgo-web`)

1. **Add New → Project** → same repo → Root Directory `.` → framework **Next.js**.
2. Environment variable (Production **and** Preview if you use previews):

   | Variable | Value |
   |---|---|
   | `BACKEND_URL` | `https://<api>.vercel.app` (no trailing slash) |

   Do **not** set `NEXT_PUBLIC_API_BASE`; when `BACKEND_URL` is present the build forces same-origin requests.
3. Deploy. Then go back to the API project, make sure `FRONTEND_ORIGIN` equals the final frontend URL (custom domain if you add one), and redeploy the API.

## 4. Verify

1. Open the frontend → sign in → **Reports → MIS reports**. Pick a type and range, press **Generate**: a preview table appears, **Download CSV** saves the file, and it shows under *Recent reports*.
2. Admin: `/admin/revenue`, `/admin/sla-report`, `/admin/courier-analytics`, `/admin/gst-reports` load live figures.
3. In the browser devtools Network tab requests go to `<frontend>/v1/...` (same origin) and return 200 with `nx_session` set as a cookie on the frontend domain.

## Known limits on Vercel

- **Background jobs do not run.** `backend/src/worker.ts` is a long-running process. Without it, queued jobs (label/manifest PDFs, marketing sends, webhook retries, COD cycles) stay `queued`. Run `npm run build && npm run start:worker` on any always-on host (Railway, Fly, a small VM) with the same environment variables, or convert it to a Vercel Cron-triggered endpoint.
- **Function limits.** Each request has a 30 s ceiling (`maxDuration` in `backend/vercel.json`; raise per plan). Report generation is synchronous and capped at 20,000 rows to stay well within it.
- **Cold starts.** The first request after idle time loads argon2 and builds Fastify; expect a slower first login.
- **Auth rate limits** use in-memory counters, which are per instance on serverless, so they are softer than on a single server. Put Vercel Firewall rate limiting on `/v1/auth/*` for production.
- **Local file storage is not available**; document features need the S3-compatible store above.

## Local development is unchanged

`npm run dev` (frontend, port 3021) and `npm run dev` in `backend/` (port 4010) still talk directly, because `BACKEND_URL` is unset locally.
