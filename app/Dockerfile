# deps
FROM node:20-bookworm-slim AS deps
WORKDIR /app
ARG CACHEBUST=1
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci

# builder
FROM node:20-bookworm-slim AS builder
WORKDIR /app
ARG CACHEBUST=1
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npx prisma generate
RUN npm run build

# runner
FROM node:20-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN apt-get update -y && apt-get install -y --no-install-recommends openssl curl && rm -rf /var/lib/apt/lists/*

# Non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy only what Next.js needs
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Copy full node_modules so prisma CLI + all transitive deps are available
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma

# Create logs and crawler-output dirs and set ownership
RUN mkdir -p /app/logs /app/crawler-output && chown -R nextjs:nodejs /app/logs /app/crawler-output

USER nextjs

EXPOSE 3000
CMD ["sh", "-c", "echo 'Running prisma migrate deploy...' && node ./node_modules/prisma/build/index.js migrate deploy && echo 'Migration done.' && node server.js"]