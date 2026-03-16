#!/bin/bash
# scripts/init-letsencrypt-vps.sh
#
# One-time Let's Encrypt bootstrap for the VPS using sslip.io.
# No domain registration needed — sslip.io auto-resolves 144-91-77-107.sslip.io
# to IP 144.91.77.107.
#
# Prerequisites:
#   - Port 80 and 443 open on the VPS firewall (ufw allow 80; ufw allow 443)
#   - Docker + docker compose installed
#   - Run inside the deployed app project directory (for example /var/www/myapp)
#
# Usage:
#   chmod +x scripts/init-letsencrypt-vps.sh
#   sudo ./scripts/init-letsencrypt-vps.sh

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT=""

# Support both layouts:
# 1) <project>/scripts/init-letsencrypt-vps.sh
# 2) <repo>/app/scripts/init-letsencrypt-vps.sh
for candidate in "$SCRIPT_DIR/.." "$SCRIPT_DIR/../app"; do
    if [ -f "$candidate/docker-compose.prod.vps.yml" ] && [ -d "$candidate/nginx" ]; then
        PROJECT_ROOT="$(cd "$candidate" && pwd)"
        break
    fi
done

if [ -z "$PROJECT_ROOT" ]; then
    echo "ERROR: Could not locate project root with docker-compose.prod.vps.yml and nginx/."
    echo "Checked: $SCRIPT_DIR/.. and $SCRIPT_DIR/../app"
    echo "Tip: run this script from the deployed app directory (for example /var/www/myapp)."
    exit 1
fi

cd "$PROJECT_ROOT"
echo "==> Using project root: $PROJECT_ROOT"

DOMAIN="144-91-77-107.sslip.io"
WIDGET_DOMAIN="widget.144-91-77-107.sslip.io"
EMAIL="jakub.havlas.022@pslib.cz"   # ← replace with a real address
COMPOSE_FILE="docker-compose.prod.vps.yml"

echo "==> Creating required directories..."
mkdir -p ./certbot/conf ./certbot/www ./widget

# Clear stale named containers before first compose up.
# This makes the bootstrap rerunnable after partial/failed attempts.
echo "==> Pre-cleaning old containers (if any)..."
docker compose -f "$COMPOSE_FILE" down --remove-orphans 2>/dev/null || true
docker rm -f vps_chromadb vps_postgres vps_app vps_nginx vps_certbot 2>/dev/null || true

# ── Step 1: start nginx with HTTP-only stub so the ACME challenge can proceed ─
echo "==> Writing temporary HTTP-only nginx config..."
cat > ./nginx/vps.conf << 'TMPCONF'
server {
    listen 80;
    server_name 144-91-77-107.sslip.io widget.144-91-77-107.sslip.io;
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }
    location / {
        return 200 'waiting for cert...';
        add_header Content-Type text/plain;
    }
}
TMPCONF

echo "==> Starting nginx (HTTP only)..."
docker compose -f "$COMPOSE_FILE" up -d --no-deps nginx

sleep 3  # Give nginx a moment to start

echo "==> Verifying ACME challenge path over HTTP..."
mkdir -p ./certbot/www/.well-known/acme-challenge
echo "acme-probe" > ./certbot/www/.well-known/acme-challenge/ping
HTTP_STATUS="$(curl -s -o /tmp/acme-probe.out -w '%{http_code}' "http://$DOMAIN/.well-known/acme-challenge/ping" || true)"
if [ "$HTTP_STATUS" != "200" ]; then
    echo "ERROR: ACME probe failed (HTTP $HTTP_STATUS)."
    echo "Response body:"
    cat /tmp/acme-probe.out 2>/dev/null || true
    echo "Nginx logs (last 80 lines):"
    docker logs vps_nginx --tail 80 2>/dev/null || true
    exit 1
fi
echo "==> ACME probe OK"

# ── Step 2: obtain the certificate ────────────────────────────────────────────
echo "==> Requesting certificate for $DOMAIN and $WIDGET_DOMAIN..."
set +e
timeout 600 docker compose -f "$COMPOSE_FILE" run --rm certbot-init certonly \
  --webroot \
  --webroot-path /var/www/certbot \
  --email "$EMAIL" \
  --agree-tos \
  --no-eff-email \
  --non-interactive \
  -d "$DOMAIN" \
  -d "$WIDGET_DOMAIN"
CERTBOT_EXIT=$?
set -e

if [ "$CERTBOT_EXIT" -ne 0 ]; then
    if [ "$CERTBOT_EXIT" -eq 124 ]; then
        echo "ERROR: certbot timed out after 10 minutes."
    else
        echo "ERROR: certbot failed with exit code $CERTBOT_EXIT."
    fi
    echo "Nginx logs (last 100 lines):"
    docker logs vps_nginx --tail 100 2>/dev/null || true
    exit 1
fi

# ── Step 3: download recommended nginx TLS parameters ────────────────────────
echo "==> Downloading TLS parameters..."
if [ ! -f ./certbot/conf/options-ssl-nginx.conf ]; then
    curl -s https://raw.githubusercontent.com/certbot/certbot/master/certbot-nginx/certbot_nginx/_internal/tls_configs/options-ssl-nginx.conf \
        -o ./certbot/conf/options-ssl-nginx.conf
fi
if [ ! -f ./certbot/conf/ssl-dhparams.pem ]; then
    echo "==> Generating DH params (takes ~30s)..."
    openssl dhparam -out ./certbot/conf/ssl-dhparams.pem 2048
fi

# ── Step 4: restore the full nginx config (HTTP redirect + HTTPS) ────────────
echo "==> Writing full nginx config (HTTP + HTTPS)..."
cat > ./nginx/vps.conf << 'SSLCONF'
server {
    listen 80;
    server_name 144-91-77-107.sslip.io widget.144-91-77-107.sslip.io;
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }
    location / {
        return 301 https://$host$request_uri;
    }
}
server {
    listen 443 ssl;
    server_name 144-91-77-107.sslip.io;
    ssl_certificate     /etc/letsencrypt/live/144-91-77-107.sslip.io/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/144-91-77-107.sslip.io/privkey.pem;
    include             /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam         /etc/letsencrypt/ssl-dhparams.pem;

    proxy_connect_timeout 600;
    proxy_send_timeout    600;
    proxy_read_timeout    600;
    send_timeout          600;

    location = /widget.js {
        root /var/www/widget;
        add_header Cache-Control "public, max-age=3600";
        add_header Access-Control-Allow-Origin "*";
    }

    location = /widget-test.html {
        root /var/www/widget;
        add_header Cache-Control "no-store";
    }

    location / {
        proxy_pass         http://app:3000;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade    $http_upgrade;
        proxy_set_header   Connection "upgrade";
    }
}
server {
    listen 443 ssl;
    server_name widget.144-91-77-107.sslip.io;

    ssl_certificate     /etc/letsencrypt/live/144-91-77-107.sslip.io/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/144-91-77-107.sslip.io/privkey.pem;
    include             /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam         /etc/letsencrypt/ssl-dhparams.pem;

    root /var/www/widget;
    index widget-test.html;

    location / {
        try_files $uri $uri/ =404;
    }

    location = /widget.js {
        add_header Cache-Control "public, max-age=3600";
        add_header Access-Control-Allow-Origin "*";
    }

    location = /widget-test.html {
        add_header Cache-Control "no-store";
    }
}
SSLCONF

# ── Step 5: start the full stack ──────────────────────────────────────────────
echo "==> Cleaning up previous containers (if any)..."
docker compose -f "$COMPOSE_FILE" down --remove-orphans 2>/dev/null || true
docker rm -f vps_chromadb vps_postgres vps_app vps_nginx vps_certbot 2>/dev/null || true

echo "==> Starting full stack..."
docker compose -f "$COMPOSE_FILE" up -d

# Reload nginx so it picks up the SSL config (it may have been running with the HTTP-only stub)
echo "==> Reloading nginx..."
docker exec vps_nginx nginx -s reload 2>/dev/null || docker compose -f "$COMPOSE_FILE" restart nginx

echo ""
echo "✓ Done!  Your backend is live at https://$DOMAIN"
echo ""
echo "Next steps:"
echo "  1. Run Prisma migrations:"
echo "       docker compose -f $COMPOSE_FILE exec app npx prisma migrate deploy"
echo "  2. Copy widget.js to the static folder:"
echo "       cp widget.js widget/widget.js"
echo "  3. Open the test page:"
echo "       https://$DOMAIN/widget-test.html"
echo "  4. Open the backoffice:"
echo "       https://$DOMAIN/backoffice"
