# syntax=docker/dockerfile:1.7
#
# Multi-stage build for the FunWithFlights routes aggregation service.
#
# Stage 1 (builder): install all deps (incl. dev), compile TS → dist/.
# Stage 2 (runner):  copy only dist/ + production node_modules into a
#                    clean image. ~150 MB final, runs as non-root, no
#                    build toolchain shipped to production.
#
# Build for AWS Fargate from any host (incl. Apple Silicon):
#   docker build --platform linux/amd64 -t funwithflights-routes .
#
# --platform is important: Fargate runs linux/amd64, and Docker Desktop
# on M-series Macs defaults to linux/arm64. A mismatched image fails to
# start on Fargate with "exec format error".

# ─── Stage 1: builder ──────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Manifests first — keeps `npm ci` cached across source changes.
COPY package.json package-lock.json ./

# Deterministic install. devDeps included — we need typescript +
# @nestjs/cli to build.
RUN npm ci --no-audit --no-fund

# Copy sources and build.
COPY tsconfig*.json nest-cli.json ./
COPY src ./src

RUN npm run build

# Drop devDeps so the next stage can copy a lean node_modules/.
RUN npm prune --omit=dev


# ─── Stage 2: runner ───────────────────────────────────────────────────────
FROM node:20-alpine AS runner

# tini as PID 1 so SIGTERM/SIGINT propagate cleanly. Node handles signals
# itself, but tini also reaps zombies if any child process gets spawned.
RUN apk add --no-cache tini

WORKDIR /app

# node:20-alpine ships a `node` user (uid 1000). Use it — never root.
USER node

# Copy only what the runtime needs.
COPY --chown=node:node --from=builder /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/dist ./dist
COPY --chown=node:node --from=builder /app/package.json ./package.json

# Defaults — overridable from the ECS task definition.
ENV NODE_ENV=production
ENV PORT=3000
ENV LOG_LEVEL=info

EXPOSE 3000

# Container-level health check. ECS / ALB have their own at the service
# level; this one helps when running `docker ps` / `docker run` locally.
HEALTHCHECK --interval=20s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT||3000) + '/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/main.js"]
