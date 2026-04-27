# AGENTS.md — guidance for AI coding assistants (GitHub Copilot, Claude, etc.)

This file is the canonical brief for any AI assistant contributing to this
repo. Read it before suggesting or generating code. Human developers should
read `README.md`.

---

## Project in one sentence

A NestJS/TypeScript backend middleware that fetches flight routes from N
configurable upstream providers, merges and deduplicates them, and exposes a
single `GET /routes` endpoint. PoC for the FunWithFlights presale case.

## Why this project exists (context)

- Presale PoC, but must be **production-quality** code (logging, error
  handling, env-driven config, tests, OpenAPI, Dockerfile) — not a
  throwaway sketch.
- Must be **defensible on live-coding**: no "magic", every choice has a
  reason.
- Scope explicitly narrowed: **aggregation only, no UI**.

## Tech stack (locked — do not change without asking)

| Layer           | Choice                                                     |
| --------------- | ---------------------------------------------------------- |
| Language        | TypeScript (strict)                                        |
| Framework       | NestJS 11                                                  |
| Runtime         | Node.js 20 LTS                                             |
| HTTP client     | `@nestjs/axios` + `axios`                                  |
| Logger          | `nestjs-pino`                                              |
| Validation      | `zod` (env), `class-validator` (DTO via `ValidationPipe`)  |
| Tests           | Jest + `supertest` + `nock`                                |
| Package manager | **npm** (not pnpm / yarn)                                  |
| Deploy          | AWS ECS Express Mode (Docker → ECR → ECS on Fargate + ALB) |

## Architectural ground rules

1. **No UI code.** This service is backend-only. API client / Swagger is the
   only interface.
2. **Providers are generic.** A new upstream = a new entry in `PROVIDERS` env
   var + a URL. Do **not** create per-provider classes. One `HttpProviderAdapter`
   handles all JSON-over-HTTP providers. (If a future provider needs a different
   wire format, add a per-provider `Mapper`, not a per-provider adapter class.)
3. **Merge strategy = first-provider-wins + equipment-union** (locked):
   - Group by key `(airline, sourceAirport, destinationAirport, stops)`.
     `stops` is part of identity (matches the OpenFlights / IATA SSIM
     model — a non-stop and a 1-stop service between the same airports
     are distinct schedule entries), not an attribute to merge.
   - For the remaining scalar (`codeShare`) the **first occurrence wins**.
     Provider order in `PROVIDERS` is the priority order.
   - `equipment`: parse each as space-separated tokens, **union** the
     sets across providers (insertion order preserved), serialize back
     as a space-joined string at the HTTP boundary.
   - Output order = order of first occurrence (deterministic, matches
     `PROVIDERS` priority).
4. **Pure functions where possible.** `mergeRoutes` is pure: takes
   `Route[][]`, returns `Route[]`, no DI / logger / IO. The orchestrator
   `RoutesAggregator` is `@Injectable` and owns the registry + logger
   fan-out, but delegates the actual merge to the pure function. Keep
   that split.
5. **Env-driven config.** No hardcoded URLs, ports, timeouts. All validated
   with zod at startup — fail fast.
6. **Log everything at the seams.** Incoming request (via `pino-http`),
   outgoing provider calls, aggregation stats (counts per provider, duplicates
   merged). No logs inside pure functions.
7. **Graceful degradation.** If one provider fails or times out, serve results
   from the others with a warning log. Do not propagate 5xx to the client
   unless ALL providers fail.

## File layout conventions

```
src/
├── main.ts                   # bootstrap only
├── app.module.ts             # only imports other modules — no providers/controllers here
│
├── config/                   # env loading, validation, typed access
├── common/                   # cross-cutting: logging, health, errors
│
├── providers/                # generic HTTP adapter + registry (one module)
└── routes/                   # the only domain module of the PoC
    ├── routes.module.ts
    ├── routes.controller.ts  # ONLY HTTP-layer concerns
    ├── routes.service.ts     # internal Route[] → public RouteResponseDto[]
    ├── routes.aggregator.ts  # orchestrator (registry fan-out + parser + merge)
    ├── route.dto.ts          # internal Route DTO (class-validator)
    ├── route-response.dto.ts # public DTO (@ApiProperty)
    ├── route.merge.ts        # pure merge function
    └── route.parser.ts       # provider-body → Route[]
```

**Rules of thumb:**

- Files in `src/routes/` are flat (no `dto/`, `aggregator/` subfolders).
  Co-locate by feature, not by kind.
- Unit tests live next to the code: `foo.ts` ↔ `foo.spec.ts`.
- Controllers are thin — delegate to services, no business logic.
- Services depend on injectable classes (`ProvidersRegistry`,
  `RoutesAggregator`); no `IFoo` interfaces or DI tokens are used today.
  If a future seam needs a token, export it from a `*.token.ts` next to
  the consumer.

## Naming conventions

- Files: `kebab-case.ts` (Nest default).
- Classes: `PascalCase` suffixed by role — `RoutesService`, `HttpProviderAdapter`,
  `RoutesAggregator`, `ProvidersRegistry`.
- Interfaces: no `I` prefix. `ProviderAdapter`, not `IProviderAdapter`.
- DI tokens (when needed): `SCREAMING_SNAKE_CASE` exported from a
  `*.token.ts` file next to the consumer. None exist today.
- Env vars: `UPPER_SNAKE_CASE`.

## Code style

- Prettier + ESLint enforced. Run `npm run format && npm run lint` before
  committing.
- `strict: true` in `tsconfig.json`. No `any` without a comment explaining why.
- Explicit return types on public methods — reads better in review.
- Prefer `async/await` over `.then()`. Avoid `Observable` unless an API returns
  one (e.g. `HttpService.get` — unwrap with `firstValueFrom`).

## Error handling

- Domain errors live in `src/common/errors/domain.errors.ts`:
  - `ProviderUnavailableError` → mapped to `502 Bad Gateway` at filter.
  - `ProviderTimeoutError` → `504 Gateway Timeout`.
  - `ProviderParseError` → `502` (upstream returned garbage).
- Global exception filter in `src/common/errors/app.exception.filter.ts` maps
  domain errors → HTTP responses with a consistent `{ code, message, requestId }`
  body.
- Never `throw new HttpException` from services. Services throw domain errors;
  only the filter knows about HTTP status codes.

## Testing rules

- **Every merge-strategy branch must have a test.** This is the piece most
  likely to get questioned on live-coding.
- HTTP is mocked with `nock` in adapter unit tests. No real network calls
  in `npm test`.
- Target ~80% coverage on `src/routes/**`. Don't obsess over `main.ts` or
  config glue.

## What NOT to add

Out of scope for the PoC: auth, payments, persistence, caching, UI,
loyalty / margin / currency / notifications / analytics, or any business
logic outside the routes-aggregation slice. If a prompt asks for one of
these, check in with the user first.

## If you're generating code in this repo

- Follow the file layout above. Don't create files outside `src/` unless
  asked.
- Small focused changes; one concern per commit.
- When adding a new module, add (1) module file, (2) unit test, (3) update
  `README.md` if user-facing, (4) update `.env.example` if it reads new
  env vars.
- Don't add dependencies without a one-line justification.
