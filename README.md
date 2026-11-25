# NEXGO

Multi-courier shipping and logistics platform for Indian sellers: a seller workspace (orders, courier rating and booking, shipments, NDR, wallet, COD, invoices) and a separate platform-admin workspace (sellers, KYC, couriers and rate cards, COD payouts, jobs, audit).

## Repository layout

| Path | What it is |
| --- | --- |
| `app/`, `components/`, `lib/` | Next.js 16 (App Router, React 19) frontend. Screens marked `Live*` call the API; the rest still render from `lib/data.js`. |
| `backend/` | Fastify + TypeScript API and job worker, PostgreSQL migrations, seed scripts. See `backend/README.md`. |
| `compose.yml`, `Dockerfile`, `backend/Dockerfile` | Docker: frontend, API, worker and one-shot migrations; local Postgres/Mailpit/MinIO under `--profile local`. |
| `.env.example` | The single env file for everything. Copy to `.env`. |
| `docs/` | Plans, handoff notes, staging checklist and demo runbook (index below). |

## Run locally

Requires Node 20+ and either Docker or a local PostgreSQL.

```bash
cp .env.example .env        # the ONLY env file; fill in the REQUIRED secrets (see comments inside)
npm install && (cd backend && npm install && npm run migrate)
(cd backend && npm run dev)  # API on :4010, second terminal: npm run worker
npm run dev                  # web on :3021 (the API's CORS allow-list expects this origin)
```

Or the whole stack in Docker (production images, throwaway Postgres + Mailpit + MinIO):

```bash
docker compose --profile local up --build      # http://localhost:3021, mail at http://localhost:8025
```

Deploying: `bash deploy/ec2/deploy.sh` on the EC2 host (runs the migrations, then the API, worker and web containers).

**Development logins** are fixed in the backend (`backend/src/lib/devAccounts.ts`) and created at startup, only when `NODE_ENV=development` and `DATABASE_URL` points at this machine. The UI never shows or pre-fills them.

| Panel | URL | Email | Password |
| --- | --- | --- | --- |
| Admin | `/admin/login` | `admin@nexgo.in` | `Admin@456` |
| Seller | `/login` | `demo@acmeexports.com` | `Demo@123` |

New sellers register at `/signup`, wait for an admin to approve them under **Admin > Registrations** (the decision is e-mailed), then sign in.

## Checks

```bash
npm run lint && npm run build             # frontend
cd backend && npm run check               # API type-check
```

## Documentation

- `docs/ADD_AN_AGGREGATOR.md` — how a courier aggregator (Lorrigo, Shiprocket) is plugged in.
- `docs/SHIPROCKET_SETUP.md` — connecting a Shiprocket account.
- `docs/qa/` — QA specification, defect register, test matrix and release gates.
