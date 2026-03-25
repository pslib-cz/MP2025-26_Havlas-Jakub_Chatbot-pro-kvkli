# deps
FROM node:20-bookworm-slim AS deps
WORKDIR /app
ARG CACHEBUST=1
COPY package*.json ./
RUN npm ci

# builder
FROM node:20-bookworm-slim AS builder
WORKDIR /app
ARG CACHEBUST=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npx prisma generate
RUN npm run build
RUN npm run build:widget

# runner
FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

# Copy only what Next.js needs
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3001
CMD ["node", "server.js"]