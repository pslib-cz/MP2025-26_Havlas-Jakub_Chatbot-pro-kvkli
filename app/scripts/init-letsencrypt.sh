#!/bin/bash
# scripts/init-letsencrypt.sh
#
# Run this ONCE on the server before starting the stack for the first time.
# It bootstraps Let's Encrypt certificates so nginx can start with SSL.
#
# Prerequisites:
#   1. DNS: chatbot.kvkli.cz  →  this server's public IP
#   2. Port 80 is open and not used by anything else (Apache must NOT bind :80
#      if running on the same machine – see note at bottom)
#   3. Docker + docker compose installed
#   4. You are in /var/www/apollo (the directory containing this compose file)
#
# Usage:
#   chmod +x scripts/init-letsencrypt.sh
#   sudo ./scripts/init-letsencrypt.sh

set -e

DOMAIN="chatbot.kvkli.cz"
EMAIL="it@kvkli.cz"           # ← change to a real admin e-mail
COMPOSE_FILE="docker-compose.prod.kvkli.yml"

echo "==> Creating directories..."
mkdir -p ./certbot/conf ./certbot/www

# ── Step 1: start nginx with HTTP-only config so the ACME challenge works ──
echo "==> Writing temporary HTTP-only nginx config..."
cat > ./nginx/apollo.conf << 'TMPCONF'
server {
    listen 80;
    server_name chatbot.kvkli.cz;
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }
    location / {
        return 200 'ok';
        add_header Content-Type text/plain;
    }
}
TMPCONF

echo "==> Starting nginx (HTTP only)..."
docker compose -f "$COMPOSE_FILE" up -d nginx

# ── Step 2: obtain the certificate via webroot challenge ───────────────────
echo "==> Requesting certificate for $DOMAIN..."
docker compose -f "$COMPOSE_FILE" run --rm certbot \
    certonly \
    --webroot \
    --webroot-path /var/www/certbot \
    --email "$EMAIL" \
    --agree-tos \
    --no-eff-email \
    -d "$DOMAIN"

# ── Step 3: download the recommended nginx SSL parameters ─────────────────
echo "==> Downloading recommended TLS parameters..."
if [ ! -f ./certbot/conf/options-ssl-nginx.conf ]; then
    curl -s https://raw.githubusercontent.com/certbot/certbot/master/certbot-nginx/certbot_nginx/_internal/tls_configs/options-ssl-nginx.conf \
        -o ./certbot/conf/options-ssl-nginx.conf
fi
if [ ! -f ./certbot/conf/ssl-dhparams.pem ]; then
    openssl dhparam -out ./certbot/conf/ssl-dhparams.pem 2048
fi

# ── Step 4: restore full nginx config (HTTP + HTTPS) ─────────────────────
echo "==> Restoring full nginx config (HTTPS)..."
cat > ./nginx/apollo.conf << FULLCONF
server {
    listen 80;
    server_name $DOMAIN;
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }
    location / {
        return 301 https://\$host\$request_uri;
    }
}
server {
    listen 443 ssl;
    server_name $DOMAIN;
    ssl_certificate     /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
    include             /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam         /etc/letsencrypt/ssl-dhparams.pem;

    proxy_connect_timeout 600;
    proxy_send_timeout    600;
    proxy_read_timeout    600;
    send_timeout          600;

    location / {
        proxy_pass         http://app:3000;
        proxy_set_header   Host              \$host;
        proxy_set_header   X-Real-IP         \$remote_addr;
        proxy_set_header   X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade    \$http_upgrade;
        proxy_set_header   Connection "upgrade";
    }
}
FULLCONF

# ── Step 5: start everything ──────────────────────────────────────────────
echo "==> Starting full stack..."
docker compose -f "$COMPOSE_FILE" up -d

echo ""
echo "✓ Done!  https://$DOMAIN is now live."
echo ""
echo "NOTE: If Apache on this machine also listens on port 80,"
echo "  you need to change it to a different port OR use an Apache reverse"
echo "  proxy (see README for details). Port 80 and 443 must be free for"
echo "  the Docker nginx container."
