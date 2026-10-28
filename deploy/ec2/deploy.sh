#!/usr/bin/env bash
# Build and (re)start the containers, then check them through the host nginx.
# Usage (from the repo root, after .env exists):  bash deploy/ec2/deploy.sh [--with-db]
#   --with-db  also run Postgres in a container on this machine (skip it when DATABASE_URL points at RDS).
set -euo pipefail
cd "$(dirname "$0")/../.."
[ -f .env ] || { echo ".env is missing. cp .env.example .env and fill in the REQUIRED values."; exit 1; }

profile=()
[ "${1:-}" = "--with-db" ] && profile=(--profile db)

git pull --ff-only || true
docker compose "${profile[@]}" up -d --build --remove-orphans      # runs `migrate` first, then api, worker, web
docker compose ps

echo "Waiting for the API..."
for _ in $(seq 1 30); do curl -fsS http://127.0.0.1:4010/health >/dev/null 2>&1 && break; sleep 2; done
curl -fsS http://127.0.0.1:4010/health && echo
curl -fsS -o /dev/null -w "web /login -> %{http_code}\n" http://127.0.0.1:3021/login
sudo nginx -t && sudo systemctl reload nginx
echo "Deployed. Open your FRONTEND_ORIGIN and sign in at /admin/login."
