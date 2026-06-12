# Production Deployment Guide — chatbot.kvkli.cz

## Target Server

| Item               | Value                                                             |
| ------------------ | ----------------------------------------------------------------- |
| **Host**           | VPS (Ubuntu 20.04)                                                |
| **SSH user**       | `jakub`                                                           |
| **SSH port**       | `2222` (non-standard)                                             |
| **Docker**         | 26.1.3 (requires `sudo`)                                          |
| **Docker Compose** | v2.23.1 (`docker-compose` — hyphenated, NOT `docker compose`)     |
| **Web server**     | Apache2 (reverse proxy)                                           |
| **Domain**         | `chatbot.kvkli.cz` (DNS pending)                                  |
| **Backend path**   | `/var/www/apollo`                                                 |
| **Widget path**    | `/var/www/kvkli` (existing Drupal site, widget deployed manually) |

### Docker permissions

`jakub` is **not** in the `docker` group — all docker commands require `sudo`.
To avoid this, the admin can run:

```bash
sudo usermod -aG docker jakub
# then logout/login
```

Until then, the CI/CD pipeline uses `sudo docker-compose`.

---

## Architecture

```
Internet
  │
  ▼
Apache (port 80/443)  ──  SSL termination + reverse proxy
  │
  ▼
127.0.0.1:3000  ←──  Next.js container (kvkli-chatbot)
                       │
                       ├── PostgreSQL container (kvkli-postgres)  [internal only]
                       └── ChromaDB container (kvkli-chromadb)    [internal only]
```

All three containers run in a Docker bridge network (`kvkli-internal`).
Only the app container exposes port 3000, bound to `127.0.0.1` only.

---

## CI/CD Pipeline

### Workflow: `.github/workflows/deploy-production.yml`

**Trigger:** Push/merge to `production` branch (only when `app/**` or the workflow file changes).

**Steps:**

1. Run unit + smoke tests
2. Build Docker image and push to GHCR (`ghcr.io/pslib-cz/kvkli-app:latest` + commit SHA tag)
3. SSH to VPS, copy `docker-compose.kvkli.yml`
4. Pull new image and restart containers with `sudo docker-compose`

### Branch strategy

```
main (development) ──PR──▶ production (deploys to VPS)
```

- Develop on `main` (or feature branches merged to `main`)
- When ready to deploy, create a PR from `main` → `production` and merge
- The merge triggers the deployment workflow
- Widget is deployed manually (not part of this pipeline)

### Creating the `production` branch (one-time)

```bash
git checkout main
git pull origin main
git checkout -b production
git push -u origin production
```

---

## GitHub Repository Secrets

Set these in **GitHub → Settings → Secrets and variables → Actions**:

| Secret         | Description                           | Example          |
| -------------- | ------------------------------------- | ---------------- |
| `PROD_HOST`    | Server IP or hostname                 | `123.45.67.89`   |
| `PROD_USER`    | SSH user                              | `jakub`          |
| `PROD_SSH_KEY` | Private SSH key (ed25519) for `jakub` | Full PEM content |

`GITHUB_TOKEN` is provided automatically by GitHub Actions.

### Generating SSH key (if needed)

```bash
# On your local machine
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/ghactions_deploy

# Copy public key to server (note: port 2222)
ssh-copy-id -p 2222 -i ~/.ssh/ghactions_deploy.pub jakub@<VPS_HOST>

# The PRIVATE key content goes into the PROD_SSH_KEY secret
cat ~/.ssh/ghactions_deploy
```

---

## Environment Variables

### Server `.env` file: `/var/www/apollo/.env`

Create this file **manually** on the server before first deploy:

```env
# ══════════════════════════════════════════════════════════════════
# chatbot.kvkli.cz — Production Environment
# ══════════════════════════════════════════════════════════════════

# ── Database ──────────────────────────────────────────────────────
POSTGRES_USER=kvkli
POSTGRES_PASSWORD=<GENERATE: openssl rand -base64 32>
POSTGRES_DB=chatbot

# ── Authentication ────────────────────────────────────────────────
JWT_SECRET=<GENERATE: openssl rand -base64 48>
ADMIN_USERNAME=admin
ADMIN_PASSWORD=<CHOOSE STRONG PASSWORD, 16+ chars>

# ── OpenAI ────────────────────────────────────────────────────────
OPENAI_API_KEY=sk-...

# ── CORS / Allowed Origins ────────────────────────────────────────
# Comma-separated list of origins allowed to call the API.
# Include the chatbot domain AND any sites embedding the widget.
ALLOWED_ORIGINS=https://chatbot.kvkli.cz,https://www.kvkli.cz

# ── Logging ───────────────────────────────────────────────────────
LOG_LEVEL=info

# ── Weekly Book Updates (cron schedule) ───────────────────────────
BOOK_UPDATE_SCHEDULE=0 2 * * 0
ENABLE_WEEKLY_UPDATES=true
```

### Where each variable is used

| Variable                | Used by                          | File(s)                                                              |
| ----------------------- | -------------------------------- | -------------------------------------------------------------------- |
| `POSTGRES_USER`         | PostgreSQL container + Prisma    | `docker-compose.kvkli.yml`, constructed into `DATABASE_URL`          |
| `POSTGRES_PASSWORD`     | PostgreSQL container + Prisma    | `docker-compose.kvkli.yml`, constructed into `DATABASE_URL`          |
| `POSTGRES_DB`           | PostgreSQL container + Prisma    | `docker-compose.kvkli.yml`, constructed into `DATABASE_URL`          |
| `DATABASE_URL`          | Prisma ORM                       | Auto-constructed in compose: `postgresql://$USER:$PASS@db:5432/$DB`  |
| `CHROMA_URL`            | ChromaDB client                  | Auto-set in compose to `http://chromadb:8000`; `app/lib/chroma.ts`   |
| `OPENAI_API_KEY`        | OpenAI API calls                 | `app/lib/openAI.ts`, `app/graphql/services/addWeeklyBook.service.ts` |
| `JWT_SECRET`            | JWT token signing/verification   | `app/graphql/services/auth.service.ts`                               |
| `ADMIN_USERNAME`        | Backoffice login                 | `app/graphql/services/auth.service.ts`                               |
| `ADMIN_PASSWORD`        | Backoffice login                 | `app/graphql/services/auth.service.ts`                               |
| `ALLOWED_ORIGINS`       | CORS origin guard middleware     | `app/graphql/middleware/originGuard.ts`                              |
| `LOG_LEVEL`             | Pino logger level                | `app/graphql/services/logger.service.ts`                             |
| `BOOK_UPDATE_SCHEDULE`  | Cron schedule for weekly updates | `app/graphql/services/weeklyBookScheduler.ts`                        |
| `ENABLE_WEEKLY_UPDATES` | Toggle weekly book updates       | `app/graphql/services/weeklyBookScheduler.ts`                        |

### Variables set automatically by Docker Compose

These are set in `docker-compose.kvkli.yml` and do NOT need to be in `.env`:

- `NODE_ENV=production`
- `NEXT_TELEMETRY_DISABLED=1`
- `PORT=3000`
- `HOSTNAME=0.0.0.0`
- `DATABASE_URL` (constructed from `POSTGRES_*` vars)
- `CHROMA_URL=http://chromadb:8000`

---

## Server Setup (One-Time)

### 1. Apache modules

Already enabled: `rewrite`, `ssl`, `deflate`, `php7`, `mpm_prefork`
Need to enable: `proxy`, `proxy_http`, `headers`

```bash
sudo a2enmod proxy proxy_http headers
sudo systemctl restart apache2
```

### 2. Application directory

```bash
sudo mkdir -p /var/www/apollo
sudo chown jakub:jakub /var/www/apollo
```

### 3. Docker network

```bash
# Not needed — docker-compose.kvkli.yml creates its own bridge network (kvkli-internal)
```

### 4. Environment file

```bash
nano /var/www/apollo/.env
# Paste the contents from above, fill in real values
chmod 600 /var/www/apollo/.env
```

### 5. DNS record

The server admin needs to create:

```
chatbot.kvkli.cz  →  A record  →  <VPS IP address>
```

### 6. SSL certificate (after DNS is live)

```bash
sudo certbot certonly --apache -d chatbot.kvkli.cz
```

### 7. Apache VirtualHost

```bash
sudo cp /var/www/apollo/chatbot.kvkli.cz.conf /etc/apache2/sites-available/
sudo a2ensite chatbot.kvkli.cz
sudo apache2ctl configtest
sudo systemctl reload apache2
```

The Apache config file is at `app/chatbot.kvkli.cz.conf` in this repo and gets copied during setup.

---

## Apache Configuration

File: `app/chatbot.kvkli.cz.conf`

Required Apache modules:

- `proxy` — reverse proxy support
- `proxy_http` — HTTP backend proxying
- `proxy_wstunnel` — WebSocket proxying (for dev, future use)
- `rewrite` — HTTP → HTTPS redirect
- `headers` — security headers + X-Forwarded-\*
- `ssl` — TLS termination

Key features:

- HTTP (port 80) → 301 redirect to HTTPS
- HTTPS (port 443) → reverse proxy to `127.0.0.1:3000`
- 600s proxy timeout (for long-running GraphQL crawl operations)
- `X-Robots-Tag: noindex, nofollow, noarchive` (prevents search engine indexing)
- Security headers: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, etc.
- SSL config: TLS 1.2+ only, modern cipher suite

### Commands the admin needs to provide/verify

Verified on 2026-05-15:

- Apache2 is running with `mpm_prefork` + `php7` (existing Drupal site)
- `rewrite`, `ssl` already enabled
- `proxy`, `proxy_http`, `headers` need enabling (see setup steps above)
- Certbot v5.6.0 is installed
- Existing sites: `000-default.conf`, `kvkli.conf`, `znakokniha.conf`
- The chatbot VirtualHost will be added alongside these (no conflicts)

---

## Deployment Commands

### First deployment

```bash
# On the VPS
cd /var/www/apollo

# Login to GHCR (one-time, or use CI/CD)
echo "<GITHUB_PAT>" | sudo docker login ghcr.io -u <github-username> --password-stdin

# Pull and start
sudo docker-compose -f docker-compose.kvkli.yml pull
sudo docker-compose -f docker-compose.kvkli.yml up -d

# Check status
sudo docker-compose -f docker-compose.kvkli.yml ps
sudo docker-compose -f docker-compose.kvkli.yml logs -f app
```

### Subsequent deployments (automated)

Merge `main` → `production` branch. The GitHub Actions workflow handles everything.

### Manual update

```bash
cd /var/www/apollo
sudo docker-compose -f docker-compose.kvkli.yml pull app
sudo docker-compose -f docker-compose.kvkli.yml up -d app
```

---

## Post-Deployment Verification

```bash
# Container health
sudo docker-compose -f docker-compose.kvkli.yml ps

# GraphQL heartbeat (internal)
curl -s http://127.0.0.1:3000/api/graphql -X POST \
  -H 'Content-Type: application/json' \
  -d '{"query":"{heartbeat}"}'

# GraphQL heartbeat (external, after DNS + SSL)
curl -s https://chatbot.kvkli.cz/api/graphql -X POST \
  -H 'Content-Type: application/json' \
  -d '{"query":"{heartbeat}"}'

# Security headers check
curl -sI https://chatbot.kvkli.cz/ | grep -iE 'x-robots|x-frame|x-content'

# Verify no external port exposure
sudo ss -tlnp | grep -E '3000|5432|8000'
# Expected: only 127.0.0.1:3000, nothing on 0.0.0.0
```

---

## Rollback

```bash
cd /var/www/apollo

# Stop current
sudo docker-compose -f docker-compose.kvkli.yml down

# Pull specific version (use commit SHA tag)
sudo docker pull ghcr.io/pslib-cz/kvkli-app:<commit-sha>

# Edit compose to use that tag, or:
sudo docker tag ghcr.io/pslib-cz/kvkli-app:<commit-sha> ghcr.io/pslib-cz/kvkli-app:latest

# Restart
sudo docker-compose -f docker-compose.kvkli.yml up -d
```

---

## Maintenance

```bash
# View logs
sudo docker-compose -f docker-compose.kvkli.yml logs -f --tail=100 app

# Restart app only
sudo docker-compose -f docker-compose.kvkli.yml restart app

# Database backup
sudo docker exec kvkli-postgres pg_dump -U kvkli chatbot > backup-$(date +%F).sql

# Renew SSL (usually auto, but manual)
sudo certbot renew
sudo systemctl reload apache2

# Disk usage check
sudo docker system df
```

---

## Known Issues & Notes

1. **DNS not yet configured** — `chatbot.kvkli.cz` DNS record is pending from the admin. Until DNS resolves, SSL cert cannot be obtained and Apache VirtualHost won't serve traffic. The backend can still be tested internally via `curl http://127.0.0.1:3000/...`.

2. **Docker requires sudo** — The `jakub` user is not in the `docker` group. All docker commands in CI/CD use `sudo`. If the admin adds `jakub` to the `docker` group, remove `sudo` from the workflow.

3. **Widget is deployed manually** — The widget (`widget.js`) is an IIFE bundle that gets placed on the Drupal site at `/var/www/kvkli/`. It is not part of this automated pipeline. Build it with `cd widget && npm ci && node build-widget.mjs`, then SCP to the server.

4. **ChromaDB data** — The vector database must be populated separately using the Python scripts in `model/`. The initial data load is a manual step after first deployment.

5. **`docker-compose` vs `docker compose`** — The server has `docker-compose` (v2.23.1) as a standalone binary, NOT the `docker compose` plugin. The workflow uses the hyphenated form.

6. **GHCR image visibility** — The repo is under `pslib-cz` org. Ensure the GHCR package is accessible (either public, or the deploy token has `read:packages` scope). The `GITHUB_TOKEN` in Actions automatically has this scope.

7. **Proxy timeout** — Apache `ProxyTimeout` is set to 600s (10 min) to accommodate long-running GraphQL operations like website crawling. This is intentional.


 <script type="text/javascript" src="{"$_SITE/js/widget.js"|fileversion}" data-backend="https://chatbot.kvkli.cz/api/graphql"></script>
