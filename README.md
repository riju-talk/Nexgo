# NEXGO

Multi-courier shipping and logistics platform for Indian sellers: a seller workspace (orders, courier rating and booking, shipments, NDR, wallet, COD, invoices) and a separate platform-admin workspace (sellers, KYC, couriers and rate cards, COD payouts, jobs, audit).

## Repository layout

| Path | What it is |
| --- | --- |
| `app/`, `components/`, `lib/` | Next.js 16 (App Router, React 19) frontend. Screens marked `Live*` call the API; the rest still render from `lib/data.js`. |
| `backend/` | Fastify + TypeScript API and job worker, PostgreSQL migrations, seed scripts. See `backend/README.md`. |
| `compose.backend.yml` | Local PostgreSQL, Redis, MinIO and Mailpit. |
| `docs/` | Plans, handoff notes, staging checklist and demo runbook (index below). |

## Run locally

Requires Node 20+ and Docker.

```bash
# 1. Infrastructure
docker compose -f compose.backend.yml up -d

# 2. API (port 4010) and worker
cp backend/.env.example backend/.env      # then set LOCAL_ENCRYPTION_KEY and LOCAL_ADMIN_PASSWORD
cd backend && npm install && npm run migrate && npm run seed:admin
npm run dev                               # second terminal: npm run worker

# 3. Frontend (port 3021 — the API's CORS allow-list expects this origin)
cd .. && cp .env.example .env.local
npm install && npm run dev
```

Open http://localhost:3021 (seller) or http://localhost:3021/admin/login (admin). Demo fixtures: `npm run seed:demo-seller`, `seed:demo-data`, `seed:demo-network` and `seed:demo-admin` in `backend/`.

## Checks

```bash
npm run lint && npm run build             # frontend
cd backend && npm run check               # API type-check
```

## Documentation

- `docs/ENGINEERING_HANDOFF.md` — current state, what is implemented and verified, non-negotiable rules. Read before changing backend code.
- `docs/BACKEND_PLAN.md` — phased build plan and security gates.
- `docs/LOCAL_BACKEND_BUILD_PLAN.md` — local-first execution plan for seller and admin modules.
- `docs/AWS_BACKEND_PLAN.md` — mapping of the same architecture onto AWS.
- `docs/STAGING_CHECKLIST.md` — what has been verified and what blocks staging.
- `docs/DEMO_RUNBOOK.md` — scripted owner demo.
