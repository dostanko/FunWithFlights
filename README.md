# FunWithFlights — Routes Aggregation Service

A backend middleware that fetches flight routes from multiple upstream providers,
aggregates and deduplicates them, and exposes a single unified endpoint:

```
GET /routes -> Route[]
```

Backend only — no UI, no auth, no persistence. Aggregation is the whole job.

---

## Prerequisites

- **Node.js 20 LTS** + npm (NestJS 11 requires Node 20+).
- **Docker** and **AWS CLI v2** — only for deploying to AWS ECS Express Mode.
  Not needed for local dev.

---

## Quick start

```bash
# 1. Install dependencies
npm install

# 2. Wire env vars (provider URLs etc.)
cp .env.example .env

# 3. Run in watch mode
npm run start:dev

# 4. Open Swagger UI
open http://localhost:3000/api
```

## Environment variables

Full list lives in `.env.example`. Summary:

- `PORT` — HTTP port (default `3000`).
- `NODE_ENV` — `development` | `production` | `test`.
- `LOG_LEVEL` — `trace` | `debug` | `info` | `warn` | `error` | `fatal`.
- `PROVIDERS` — comma-separated provider names (e.g. `provider1,provider2`).
  Adding a new upstream = add a name here + a matching `PROVIDER_<NAME>_URL`.
  No code changes.
- `PROVIDER_<NAME>_URL` — upstream URL per provider (validated as a real URL
  at startup; missing / malformed values fail fast).
- `HTTP_TIMEOUT_MS` — upstream request timeout (default `5000`).

---

## Architecture snapshot

- **Generic provider adapter + factory**: adding a new upstream data source is
  a config change (new entry in `PROVIDERS` + a URL env var), not a code change.

- **Merge strategy = `first-provider-wins` + `equipment-union`**. Dedup key is
  `(airline, sourceAirport, destinationAirport, stops)` — matching how
  OpenFlights / IATA SSIM model a schedule record: a non-stop and a 1-stop
  service between the same airports are different entries, so `stops` is
  part of identity, not an attribute to merge. "Best for the customer" is
  underspecified in the exposed model (no price / availability / SLA
  signals), so we don't invent a scoring heuristic. Instead we use the one
  piece of priority that **is** defined: the order of providers in
  `PROVIDERS`. The scalar `codeShare` takes the value from the first listed
  provider; `equipment` tokens are unioned so we never silently drop
  aircraft info reported by a lower-priority source. Output order = order
  of first occurrence, so the result is deterministic and trivially
  debuggable against `PROVIDERS`. Re-prioritising = changing one env var,
  no code change. Once "best" gets a real definition (cheapest, fastest,
  highest SLA, …) the policy lives in one pure function —
  [`route.merge.ts`](src/routes/route.merge.ts) — and nothing else moves.

  _Scale assumption:_ in-memory O(N) merge, sized for **up to ~100k routes
  per provider per request** — comfortable headroom over the full
  OpenFlights public dataset (~67k). If we ever outgrow that, the fix is
  topology, not this function: streaming JSON parse or a scheduled
  pre-merge snapshot in S3/Redis.

- **No caching in PoC** — noted as a next step (in-memory cache + TTL).

- **Deployment target**: AWS ECS Express Mode (Dockerfile + `scripts/deploy.sh`)
  — ECS on Fargate + ALB provisioned in one command. Production would be the
  same ECS Fargate + ALB behind CloudFront + WAF, managed by IaC.

---

## Running against live providers

The two provider URLs used for the PoC are wired into `.env.example`.

---

## Deploy to AWS ECS Express Mode

A Dockerfile and `scripts/deploy.sh` are included: the script builds the
image, pushes it to ECR, and triggers `ecs update-service`.
