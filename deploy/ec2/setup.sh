#!/usr/bin/env bash
# One-time setup of a fresh Ubuntu 22.04/24.04 EC2 instance: Docker + the Compose plugin, nginx and certbot on the host.
# Usage: sudo bash deploy/ec2/setup.sh
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo "Run as root: sudo bash $0"; exit 1; }

apt-get update
apt-get install -y ca-certificates curl gnupg nginx certbot python3-certbot-nginx ufw git

if ! command -v docker >/dev/null; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
systemctl enable --now docker nginx

# Host firewall: SSH + web only. The containers publish on 127.0.0.1, so 3021/4010 are never reachable from outside anyway.
# (Also keep the EC2 security group to 22, 80, 443.)
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

# Let the login user run docker without sudo (log out and in once).
[ -n "${SUDO_USER:-}" ] && usermod -aG docker "$SUDO_USER" || true
rm -f /etc/nginx/sites-enabled/default
echo "Done. Next: copy .env into the repo root, install deploy/nginx/nexgo.conf, run deploy/ec2/deploy.sh"
