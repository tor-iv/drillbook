# syntax=docker/dockerfile:1

# ──────────────────────────────────────────
# Stage 1: deps — install all dependencies
# (native build tools required for better-sqlite3)
# ──────────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app

RUN apk add --no-cache python3 make g++
RUN corepack enable && corepack prepare pnpm@10.17.1 --activate

COPY package.json pnpm-lock.yaml ./
# --config.minimum-release-age=0 disables the "too new" safety check that
# fires in CI when lockfile packages were published within the last 24h.
RUN pnpm install --frozen-lockfile --config.minimum-release-age=0


# ──────────────────────────────────────────
# Stage 2: build — compile the Next.js app
# ──────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.17.1 --activate

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1

# Values read at module-init during `next build`; real values come from
# compose `environment:` at runtime.
ENV DB_PATH=/app/data/build-placeholder.db
ENV AUTH_COOKIE_SECRET=build-time-placeholder-not-used-in-prod
ENV APP_URL=http://localhost:3000
ENV RESEND_API_KEY=re_build_time_placeholder
ENV DEEPSEEK_API_KEY=build-time-placeholder
RUN mkdir -p /app/data

RUN pnpm build


# ──────────────────────────────────────────
# Stage 3: runner — minimal production image
# ──────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# ── Native module fixup ────────────────────────────────────────────────────
# Standalone tracing does not reliably include the better-sqlite3 binary.
# Wildcard version so a lockfile bump doesn't silently break this COPY
# (foe-finder hardcodes the version and it bit them).
COPY --from=builder --chown=nextjs:nodejs \
     /app/node_modules/.pnpm/better-sqlite3@*/node_modules/better-sqlite3 \
     ./node_modules/better-sqlite3

# ── Persistent data (DB + photos share one volume) ─────────────────────────
RUN mkdir -p /app/data/photos && chown -R nextjs:nodejs /app/data

EXPOSE 3000

USER nextjs

CMD ["node", "server.js"]
