#!/usr/bin/env bash
# Zero-downtime deploy for ONE instance behind the ALB. Run it on instance 1, wait for it to finish, then on instance 2.
# Build first (old containers keep serving), drain this instance from the ALB, swap containers, rejoin.
# Migrations must stay backward compatible: instance 2 still runs the old code while instance 1 has migrated.
set -euo pipefail
cd "$(dirname "$0")/../.."
[ -f .env ] || { echo ".env is missing"; exit 1; }

git pull --ff-only
docker compose build

echo "Draining this instance from the load balancer (45 s)..."
sudo touch /etc/nginx/drain.flag
sleep 45

docker compose up -d --remove-orphans
for _ in $(seq 1 40); do curl -fsS http://127.0.0.1:4010/health >/dev/null 2>&1 && break; sleep 3; done
curl -fsS http://127.0.0.1:4010/health && echo
curl -fsS -o /dev/null -w "web /login -> %{http_code}\n" http://127.0.0.1:3021/login

sudo rm -f /etc/nginx/drain.flag
echo "Rejoining the load balancer (30 s)..."
sleep 30
docker compose ps
echo "Done. Check the target shows healthy in the console before deploying the next instance."
