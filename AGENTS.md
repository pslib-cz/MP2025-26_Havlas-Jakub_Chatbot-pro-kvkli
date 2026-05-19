# AGENTS.md — kvkli Chatbot

AI-powered chatbot for the Czech library KVKLI (Krajská vědecká knihovna v Liberci). Next.js 15 fullstack app with GraphQL API, OpenAI agentic loop, ChromaDB vector search, PostgreSQL via Prisma, and an embeddable React widget.

## Quick Commands

```bash
# Development (starts Docker containers + Next.js dev server)
npm run dev              # from repo root

# Individual
npm run dev:docker       # PostgreSQL + ChromaDB only
npm run dev:app          # Next.js only (port 3000)

# Testing
npm run test             # all tests
npm run test:unit        # unit tests only
npm run test:smoke       # smoke tests only

# Build
npm run build:widget     # build embeddable widget (esbuild)
cd app && npm run build  # production Next.js build

# Linting
npm run lint
```

## Architecture

```
repo root/
├── app/                    # Next.js 15 fullstack (App Router)
│   ├── src/app/            # Pages & API routes (backoffice dashboard)
│   ├── graphql/
│   │   ├── schema.ts       # GraphQL type definitions
│   │   ├── resolvers/      # Query/Mutation resolvers (prompt, conversation, crawl, auth)
│   │   ├── services/       # Business logic layer
│   │   │   ├── agent/      # ★ AI Agent Runtime (agentic loop with tool calling)
│   │   │   │   ├── AgentRuntime.ts
│   │   │   │   ├── OpenAIClient.ts
│   │   │   │   ├── ToolRegistry.ts
│   │   │   │   └── tools/  # 8 tools: searchCatalog, recommendBooks, findBookByPlot,
│   │   │   │               #   getOpeningHours, getOfficeInfo, getContact, getEvents, searchWebsite
│   │   │   ├── ai.service.ts
│   │   │   ├── book.service.ts
│   │   │   ├── crawl.service.ts
│   │   │   └── prisma.service.ts
│   │   ├── middleware/      # originGuard (CORS/JWT), rateLimiter
│   │   └── utils/
│   ├── lib/                # Singleton clients: prisma, chroma, openAI, apolloClient
│   ├── prisma/             # schema.prisma + migrations (PostgreSQL)
│   ├── types/              # All TypeScript types (one file per type, re-exported via index.ts)
│   └── tests/              # unit/, integration/, smoke/
├── widget/                 # Embeddable React chat widget (standalone JS bundle)
└── deploy.md               # Production deployment guide
```

## Key Conventions

- **TypeScript strict** — all code is TypeScript. Types live in `app/types/`, one file per type, all re-exported from `app/types/index.ts`.
- **GraphQL API** at `/api/graphql` (Apollo Server 5). Schema defined in `app/graphql/schema.ts`. Resolvers organized by domain.
- **Prisma** — schema at `app/prisma/schema.prisma`, client generated to `app/generated/prisma/`. Migrations auto-run on Docker startup. Singleton client in `app/lib/prisma.ts`.
- **Agent Runtime** — agentic loop in `app/graphql/services/agent/`. Tools have three files: `specs.ts` (OpenAI JSON Schema), `schemas.ts` (Zod validation), handlers (`bookHandlers.ts`, `infoHandlers.ts`). New tools must be registered in `tools/registry.ts`.
- **ChromaDB** — vector store for website content (RAG). Client in `app/lib/chroma.ts`. Data persisted in `app/chroma_db/`.
- **Testing** — Jest with ts-jest. Tests in `app/tests/{unit,integration,smoke}/`. Coverage targets `graphql/**/*.ts` and `lib/**/*.ts`.
- **Widget** — standalone React bundle built with esbuild (`widget/build-widget.mjs`). Embedded on `kvkli.cz` via `<script>` tag.

## Deployment

- **Branch strategy**: `main` (dev) → PR → `production` (triggers CI/CD)
- **CI/CD**: GitHub Actions builds Docker image → pushes to GHCR → deploys to VPS via SSH
- **Production stack**: Docker Compose (`docker-compose.kvkli.yml`) with PostgreSQL 16, ChromaDB, Next.js on internal bridge network. Apache reverse proxy with SSL.
- **Details**: See [deploy.md](deploy.md) and [app/DEPLOYMENT_CHECKLIST.md](app/DEPLOYMENT_CHECKLIST.md)

## Environment Variables

Required in `.env` (see deployment docs for production values):

| Variable                            | Purpose                                             |
| ----------------------------------- | --------------------------------------------------- |
| `DATABASE_URL`                      | PostgreSQL connection string                        |
| `OPENAI_API_KEY`                    | OpenAI API key                                      |
| `CHROMA_URL`                        | ChromaDB endpoint (default `http://localhost:8000`) |
| `JWT_SECRET`                        | JWT signing secret                                  |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | Backoffice login                                    |
| `ALLOWED_ORIGINS`                   | Comma-separated CORS origins                        |
| `LOG_LEVEL`                         | Pino log level (default `info`)                     |

## Pitfalls

- Docker commands on VPS require `sudo` (user `jakub` not in docker group).
- Prisma client is generated to `app/generated/prisma/` — run `npx prisma generate` after schema changes.
- The widget is deployed manually to the library's Drupal site, not via CI/CD.
- `docker-compose` (hyphenated) is used on VPS, not `docker compose`.
