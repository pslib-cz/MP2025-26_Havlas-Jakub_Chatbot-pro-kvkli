# AI Context — Chatbot pro KVKLI

## Project Overview
A Next.js chatbot application for KVKLI (Krajská Veterinární a Kynologická Laboratoř Ivančice — but verify).  
Deployed on a VPS at `144.91.77.107` behind nginx, using Docker Compose.

## Architecture
- **Frontend**: Next.js (port 3000, behind nginx on port 80)
- **API**: GraphQL at `/api/graphql`
- **Database**: PostgreSQL 16 via Prisma ORM
- **Vector DB**: ChromaDB (for RAG / content embeddings)
- **Auth**: JWT-based admin login (username/password → token)

## Key Directories
```
app/
├── graphql/
│   ├── middleware/       # originGuard.ts, ipGuard (if exists)
│   ├── resolvers/        # auth.resolver.ts, etc.
│   ├── services/         # auth.service.ts, crawl.service.ts, compare.service.ts, prisma.service.ts
│   └── schema/           # GraphQL type definitions
├── lib/                  # chroma.ts (ChromaDB client), logger.ts
├── tests/
│   ├── unit/             # Jest unit tests
│   ├── smoke/            # Jest smoke tests (basic.smoke.test.ts)
│   └── integration/      # Jest integration tests (chroma.test.ts)
├── nginx/                # default.conf
├── docker-compose.prod.yml
└── Dockerfile
```

## Testing
- **Framework**: Jest (NOT vitest) — all tests use `@jest/globals`
- **Unit**: `npm run test:unit` — tests in `tests/unit/`
- **Smoke**: `npm run test:smoke` — tests in `tests/smoke/`
- **Integration**: `npm run test:integration` — tests in `tests/integration/` (requires running services)

## Logging Convention
- All services use a shared `log(service, message)` helper from `lib/logger.ts`
- Logs write to both `console.log` and `logs/<service>.log`
- Log dir: `<project>/logs/` (mounted as volume in Docker)

## Environment Variables
| Var | Purpose |
|-----|---------|
| `DATABASE_URL` | PostgreSQL connection string |
| `CHROMA_URL` | ChromaDB endpoint (default: `http://chromadb:8000`) |
| `ALLOWED_ORIGINS` | Comma-separated origins for origin guard |
| `ALLOWED_IPS` | Comma-separated IPs for IP guard |
| `JWT_SECRET` | Secret for signing JWT tokens |
| `API_SECRET` | Secret for API-to-API auth |
| `ADMIN_USERNAME` | Admin login username |
| `ADMIN_PASSWORD` | Admin login password |

## Deployment
- CI: GitHub Actions (`.github/workflows/deploy.yml`)
- Pipeline: test → deploy via SSH + rsync → docker compose up
- Smoke + unit tests run in CI before deploy

## Common Pitfalls
- `ALLOWED_ORIGINS` must include the server IP/domain the browser uses (e.g., `http://144.91.77.107`)
- ChromaDB healthcheck can be slow (up to 30s start period)
- originGuard runs on every non-exempt GraphQL operation
- Prisma client is singleton via `prisma.service.ts`
- The `tests/` folder has an 's' — not `test/`
