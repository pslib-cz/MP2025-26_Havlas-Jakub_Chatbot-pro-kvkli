# Project Guidelines

AI chatbot for the Krajská vědecká knihovna v Liberci (KVKLI) — a Czech regional library. The system answers user questions about library services, books, events, and contacts using OpenAI with tool-calling against a vector database of library catalog records.

## Repository Structure

| Directory | Tech | Purpose |
|-----------|------|---------|
| `app/` | Next.js 15 + TypeScript | Backend (GraphQL API, backoffice admin UI) |
| `widget/` | React 19 + esbuild | Embeddable chat widget (single-file IIFE bundle) |
| `harvester/` | C# / .NET | OAI-PMH harvester that crawls IPAC catalog → `complete_records.csv` |
| `model/` | Python | Cleans CSV data, generates OpenAI embeddings, populates ChromaDB |

## Architecture

```
Widget (IIFE bundle) ──→ /api/graphql ──→ Apollo Server ──→ Resolvers ──→ Services
                                                                            │
                                                           ┌────────────────┼────────────────┐
                                                           │                │                │
                                                      AgentRuntime     Prisma (PG)     ChromaDB
                                                      (gpt-4o loop)                   (vectors)
```

- **AgentRuntime** (`app/graphql/services/agent/AgentRuntime.ts`): Iterative tool-calling loop (max 10 iterations). Tools are registered in `app/graphql/services/agent/tools/registry.ts`.
- **8 tools**: `searchCatalog`, `recommendBooks`, `findBookByPlot`, `getOpeningHours`, `getOfficeInfo`, `getContact`, `getEvents`, `searchWebsite`
- **Prisma models**: `Prompt` and `Conversation` — see `app/prisma/schema.prisma`
- **GraphQL schema**: `app/graphql/schema.ts` — resolvers use `withAuth()` HOF from `app/graphql/utils/resolver.utils.ts`
- **Middleware**: Origin guard (`ALLOWED_ORIGINS` env) + per-IP rate limiter (20 req/hour)

## Build & Test

Root-level orchestration scripts (run from repo root):

```bash
npm run install:all   # Install deps for both app/ and widget/
npm run dev           # Start Docker (PG + Chroma) + Next.js dev server
npm run dev:app       # Next.js dev server only (assumes Docker running)
npm run dev:docker    # Start only Docker services (PG + ChromaDB)
npm run build:widget  # Bundle widget → widget/widget.js
npm test              # Jest tests (app)
npm run test:unit     # Unit tests only
npm run test:smoke    # Smoke tests only
```

App-specific commands (run from `app/`):

```bash
npm run dev          # Next.js dev server (port 3000)
npm run build        # Production build (standalone output)
npm test             # Jest (ts-jest, jsdom env)
```

Widget commands (run from `widget/`):

```bash
npm run build        # Bundle via esbuild → widget.js
```

Root-level Jest config exists for `tests/services/` (run from repo root with `npx jest`).

### Docker

```bash
docker-compose up    # Starts: PostgreSQL 16, ChromaDB, App
```

Dockerfile is multi-stage: deps → build (prisma generate + next build) → runner (non-root `nextjs` user). Prisma migrations auto-deploy on container start.

## Conventions

- **Path alias**: `@/*` maps to `app/src/*` (tsconfig)
- **Types**: All shared types in `app/types/`, barrel-exported via `app/types/index.ts`
- **Services pattern**: Business logic in `app/graphql/services/`, resolvers are thin wrappers
- **Auth**: JWT HS256, 8-hour expiry. Protected resolvers use `withAuth(resolver)` or `requireAuth(context)`
- **Input validation**: `sanitizeInput()` and `isInputTooLong()` (8000 char limit) in AI service
- **Output validation**: `validateOutput()` filters harmful AI responses
- **Lib singletons**: `app/lib/prisma.ts`, `app/lib/chroma.ts`, `app/lib/openAI.ts` — all lazy-initialized singletons
- **Logging**: Structured logging via pino (`app/graphql/services/logger.service.ts`)
- **Widget**: Self-contained React IIFE in `widget/index.tsx`; built with esbuild; backend URL set via `window.CHATBOT_BACKEND_URL` or `data-backend` attribute

## Environment Variables

Key variables (see `docker-compose.yml` for full list):

- `DATABASE_URL` — PostgreSQL connection string
- `CHROMA_URL` — ChromaDB endpoint (default `http://localhost:8000`)
- `OPENAI_API_KEY` — OpenAI API key
- `JWT_SECRET` — JWT signing secret
- `ALLOWED_ORIGINS` — Comma-separated CORS origins
- `BOOK_UPDATE_SCHEDULE` — Cron expression for weekly book updates (default `0 2 * * 0`)

## Testing

- Unit tests: `app/tests/unit/` (13 files covering resolvers, auth, rate limiter, origin guard, preprocessing, crawl)
- Integration/smoke tests: `app/tests/integration/`, `app/tests/smoke/`
- Test setup mocks env vars and polyfills `structuredClone` — see `tests/setup.ts`
- App-level jest config: `app/jest.config.js` (coverage: `graphql/**`, `lib/**`)

## CI/CD

GitHub Actions workflow (`.github/workflows/deploy.yml`):
- Triggers on push to `main` when `app/**`, `widget/**`, or the workflow itself changes
- Runs unit + smoke tests → builds Docker image → pushes to GHCR → deploys to VPS
- Widget is built separately and SCP'd to `/var/www/widget/` on the VPS

## Known Design Decisions

- AI tool coordination: The system favors code-level safeguards over prompt-only instructions for multi-step tool flows — see [fix-prompt.md](fix-prompt.md)
- Conversation context: Last 5 prompts are included in AI context window
- Info tools (hours, contacts, events) do live scraping rather than cached data
- Book search uses ASCII normalization for Czech diacritics handling
