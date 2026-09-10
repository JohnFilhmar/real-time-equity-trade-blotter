# Real-time equity trade blotter

A trade blotter for a broker: view, create, amend and cancel equity trades, with changes made by
one client appearing on every other connected client without a refresh.

Built for the TP ICAP full stack take-home exercise.

## Status

Foundation complete. The API serves liveness and readiness, the database schema and migration are
in place, the shared contract is published to both apps, and the whole stack builds and runs under
Docker. Trade endpoints, the blotter UI and the live broadcast are the next phases; see
[the build plan](docs/artifacts/blotter_build_plan.html) for the sequence.

| Area | State |
|---|---|
| Database schema, migration, seed generator | Done |
| Shared TypeScript contract | Done |
| API hardening, error handling, health and readiness | Done |
| Docker and compose | Done |
| Trade CRUD endpoints | Next |
| Socket broadcast | Next |
| Blotter UI | Next |

## Architecture

```
frontend/   Next.js 16 (App Router, React 19, Tailwind v4)
backend/    Express 5 API + Socket.IO, Prisma 7 over PostgreSQL 17
shared/     @blotter/shared - one zod schema per model, shared by both
database/   schema documentation
```

### Decisions, and what was rejected

**PostgreSQL over SQLite.** The API container runs with a read-only root filesystem, which a
SQLite file cannot survive. Postgres also lets the schema carry real enum types, a decimal price
column and indexes chosen for the blotter's actual queries.

**`DECIMAL(18,6)` for price, not a float.** Binary floating point cannot represent a price
exactly. On a trading system that is the first thing worth getting right. Prisma returns a
`Decimal`, which is converted to a JSON number at the boundary so responses match the payload
shape in the brief.

**One shared contract package.** `@blotter/shared` holds a single canonical zod schema per model.
Every other shape is derived from it with `.omit()`, `.partial()` and `.pick()`, and every
TypeScript type is inferred from it with `z.infer`. Nothing is hand-written twice, so the request
shape, the response type and the socket payload cannot drift apart. This is why the repository is
an npm workspace.

**Socket.IO over raw WebSocket or SSE.** Reconnection with backoff comes for free, rooms leave
room for per-book scoping later, and the event map is typed through
`Server<ClientToServerEvents, ServerToClientEvents>`, so emitting an unknown event will not
compile. Raw `ws` would have meant hand-rolling reconnection; SSE is one-way and would still have
needed HTTP for every mutation.

**Mutations travel over HTTP, not over the socket.** They get the same validation, error handling
and rate limiting as any other write. The socket carries broadcasts only, which is why
`ClientToServerEvents` is deliberately empty.

**Liveness and readiness are separate endpoints.** `/health` reports that the process is up.
`/ready` reports that it can serve traffic, which requires the database. Collapsing them is how a
container reports healthy while every request fails, and compose gates the frontend on `/ready`
for exactly that reason.

**camelCase on the wire, snake_case everywhere else.** The brief supplies the payload in camelCase
and a reviewer comparing a response against their own sample should see identical keys. Database
columns, filenames and variables stay snake_case, bridged once by Prisma's `@map`.

### The trade model

The brief states the model twice and the statements disagree: the `Trade` interface has `id` and
`tradeDate`, while the sample payload has `tradeId` and `tradeTimestamp` plus `book` and
`counterparty`. Since the interface is described as a minimum and the sample as the data the
blotter consumes, the model carries every field from both. Full table in
[`database/README.md`](database/README.md).

Two fields go beyond the brief: `version`, for optimistic concurrency so two traders amending at
once cannot silently overwrite each other, and `createdAt`/`updatedAt`, which record when the row
was written as distinct from when the trade happened.

Amending is deliberately not a status. The brief allows only `ACTIVE` and `CANCELLED`, so an
amendment increments `version` and writes a `trade_amendment` row rather than inventing a third
state.

## Running it

### With Docker (recommended)

Requires Docker with Compose v2. Nothing else, and no `.env` file.

```bash
docker compose up --build
```

- Web app: <http://localhost:3000>
- API: <http://localhost:5000/health> and <http://localhost:5000/ready>
- Postgres: `localhost:5432`, user/password/database `blotter`

Migrations run automatically on API start. If the trade table is empty, 500 realistic randomised
trades are generated and inserted.

Stop and keep data with `docker compose down`, or discard it with `docker compose down -v`.

### Locally, without Docker

Requires Node 22 or newer and a reachable PostgreSQL 17.

```bash
npm install
npm run build:shared

# Point the API at your database. The repository never writes to your .env for you.
# backend/.env needs at minimum:
#   DATABASE_URL=postgresql://blotter:blotter@localhost:5432/blotter?schema=public

npm run dev:backend    # http://localhost:5000
npm run dev:frontend   # http://localhost:3000
```

`npm run build:shared` is not optional on a fresh clone: both apps import `@blotter/shared` from
its built output.

## Testing

```bash
npm test          # every workspace
npm run typecheck # every workspace
```

Contract tests live with the schema in `shared/`, and cover the derived shapes rather than
restating the model. API tests use supertest against the real app, with collaborators injected as
doubles, so no framework internals are mocked. The seed generator is tested for the properties
that make its output realistic: round lots, prices near each instrument's own level, timestamps
inside a trading session, and determinism for a given seed.

Integration tests against a real Postgres arrive with the trade endpoints, per
[the testing stance](docs/artifacts/blotter_build_plan.html).

## Assumptions

- No authentication. The brief does not ask for it, and a half-built login is worth less than a
  clear statement of what production would need: short-lived access tokens with rotating refresh
  tokens, a global auth guard, and permission checks in the service layer.
- `trader` is a free-text desk code, not a user account.
- All prices are quoted in the instrument's own currency. There is no currency column, because the
  brief's payload has none, and a single-currency blotter is the smaller lie than an unpopulated
  field.
- One API process. Rate limits are in-process and would need a shared Redis store across replicas.

## Trade-offs accepted

- **In-process rate limiting.** Correct for one container, wrong for a cluster. Noted rather than
  built.
- **`prisma` ships as a production dependency** so `prisma migrate deploy` can run at container
  start. It costs image size and buys a stack that comes up correctly from `docker compose up`
  with no manual migration step.
- **No path aliases in the backend.** Under ESM with `nodenext`, TypeScript path aliases are not
  rewritten at emit and break at runtime without an extra build step. The source tree is shallow
  enough that relative imports never exceed one level.
- **Five high-severity `npm audit` findings remain**, all reached through the Prisma 7 toolchain
  via `@prisma/config`. The suggested fix downgrades Prisma to 6.x, a breaking change, and the
  vulnerable paths are build-time rather than runtime.
- **The frontend page is still the scaffold.** It is replaced wholesale by the blotter UI in the
  next phase, so styling it now would be work thrown away.

## AI usage

AI-assisted development was used throughout. See [`docs/ai_usage_report.md`](docs/ai_usage_report.md)
for how, and [`docs/prompt_log/`](docs/prompt_log/index.md) for the prompts themselves.
