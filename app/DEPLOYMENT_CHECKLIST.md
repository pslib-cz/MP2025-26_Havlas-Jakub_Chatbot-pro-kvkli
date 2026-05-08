# Production Deployment Checklist — chatbot.kvkli.cz

## Server: /var/www/apollo/

---

## 1. Pre-Deployment (One-Time Server Setup)

### Ubuntu Server
- [ ] Apache2 installed: `sudo apt install apache2`
- [ ] Enable Apache modules: `sudo a2enmod proxy proxy_http proxy_wstunnel rewrite headers ssl`
- [ ] Docker + Docker Compose installed
- [ ] Certbot installed + SSL cert obtained: `sudo certbot certonly --apache -d chatbot.kvkli.cz`
- [ ] App directory created: `sudo mkdir -p /var/www/apollo && sudo chown $USER:$USER /var/www/apollo`

### Apache Config
- [ ] Copy `chatbot.kvkli.cz.conf` to `/etc/apache2/sites-available/`
- [ ] Enable site: `sudo a2ensite chatbot.kvkli.cz`
- [ ] Disable default site: `sudo a2dissite 000-default`
- [ ] Test config: `sudo apache2ctl configtest`
- [ ] Reload: `sudo systemctl reload apache2`

### Environment File
- [ ] Create `/var/www/apollo/.env` with ALL required variables:

```env
# ── Database ──────────────────────────────────
POSTGRES_USER=kvkli
POSTGRES_PASSWORD=<strong-random-password>
POSTGRES_DB=chatbot

# ── Auth (CRITICAL — generate with: openssl rand -base64 32) ──
JWT_SECRET=<random-64-char-string>
ADMIN_USERNAME=<admin-username>
ADMIN_PASSWORD=<strong-password>

# ── OpenAI ────────────────────────────────────
OPENAI_API_KEY=sk-...

# ── CORS (comma-separated allowed origins) ────
ALLOWED_ORIGINS=https://chatbot.kvkli.cz,https://www.kvkli.cz

# ── Optional ──────────────────────────────────
LOG_LEVEL=info
ENABLE_WEEKLY_UPDATES=true
```

- [ ] Verify `.env` file permissions: `chmod 600 /var/www/apollo/.env`
- [ ] Verify `JWT_SECRET` is NOT the fallback value

---

## 2. Deploy

```bash
cd /var/www/apollo

# Pull latest image
docker compose -f docker-compose.kvkli.yml pull

# Start all services
docker compose -f docker-compose.kvkli.yml up -d

# Watch logs until healthy
docker compose -f docker-compose.kvkli.yml logs -f app
```

---

## 3. Post-Deployment Verification

- [ ] App container healthy: `docker compose -f docker-compose.kvkli.yml ps`
- [ ] PostgreSQL healthy: `docker exec kvkli-postgres pg_isready`
- [ ] ChromaDB healthy: `curl -s http://localhost:8000/api/v1/heartbeat`
- [ ] GraphQL responds: `curl -s https://chatbot.kvkli.cz/api/graphql -X POST -H 'Content-Type: application/json' -d '{"query":"{heartbeat}"}'`
- [ ] Public /graphql alias works: `curl -s https://chatbot.kvkli.cz/graphql -X POST -H 'Content-Type: application/json' -d '{"query":"{heartbeat}"}'`
- [ ] Backoffice login works: open `https://chatbot.kvkli.cz/` → should redirect to `/backoffice`
- [ ] robots.txt accessible: `curl -s https://chatbot.kvkli.cz/robots.txt`
- [ ] Security headers present: `curl -sI https://chatbot.kvkli.cz/ | grep -i x-robots`
- [ ] SSL valid: `curl -vI https://chatbot.kvkli.cz 2>&1 | grep "SSL certificate verify ok"`
- [ ] No ports exposed externally: `sudo ss -tlnp | grep -E '3000|5432|8000'` → only 127.0.0.1

---

## 4. Rollback Procedure

```bash
cd /var/www/apollo

# Stop current
docker compose -f docker-compose.kvkli.yml down

# Pull previous known-good image tag
docker pull ghcr.io/pslib-cz/kvkli-app:<previous-tag>

# Edit compose to use specific tag (or set via env var)
# Then restart
docker compose -f docker-compose.kvkli.yml up -d

# If database migration failed — restore from backup:
# docker exec kvkli-postgres pg_restore -U $POSTGRES_USER -d $POSTGRES_DB /backup/dump.sql
```

---

## 5. Maintenance Commands

```bash
# View logs
docker compose -f docker-compose.kvkli.yml logs -f --tail=100 app

# Restart app only
docker compose -f docker-compose.kvkli.yml restart app

# Database backup
docker exec kvkli-postgres pg_dump -U kvkli chatbot > backup-$(date +%F).sql

# Update to latest
docker compose -f docker-compose.kvkli.yml pull app
docker compose -f docker-compose.kvkli.yml up -d app

# Renew SSL (certbot auto-renews, but manual):
sudo certbot renew
sudo systemctl reload apache2
```

---

## 6. Security Checklist

- [ ] `.env` has `chmod 600`
- [ ] `JWT_SECRET` is a random 32+ byte string
- [ ] `ADMIN_PASSWORD` is strong (16+ chars)
- [ ] `ALLOWED_ORIGINS` lists only your domains
- [ ] No database ports exposed externally
- [ ] No ChromaDB ports exposed externally
- [ ] App port bound to `127.0.0.1` only
- [ ] GraphQL introspection disabled in production
- [ ] GET method disabled for GraphQL in production
- [ ] Crawl/admin resolvers require authentication
- [ ] X-Robots-Tag header present on all responses
- [ ] robots.txt blocks all crawlers
