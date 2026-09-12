# Real-time equity trade blotter

A trade blotter for a broker: view, create, amend and cancel equity trades, with changes made by
one client appearing on every other connected client without a refresh.

Built for the TP ICAP full stack take-home exercise.

## Status

The API is feature complete for the brief's five requirements: trades can be viewed, created,
amended and cancelled, and every change is broadcast to all connected clients. A simulated desk
feed keeps the blotter moving on its own. The React blotter UI is the remaining phase; see
[the build plan](docs/artifacts/blotter_build_plan.html) for the sequence.

| Area | State |
|---|---|
| Database schema, migration, seed generator | Done |
| Shared TypeScript contract | Done |
| API hardening, error handling, health and readiness | Done |
| Docker and compose | Done |
| Trade endpoints: list, read, create, amend, cancel | Done |
| Socket broadcast of every change | Done |
| Simulated live trade feed | Done |
| Audit trail (bonus) | Done |
| CI on push and pull request | Done |
| Blotter UI | Next |
| Net positions and P&L (bonus) | Deferred |

## Architecture

```
frontend/   Next.js 16 (App Router, React 19, Tailwind v4)
backend/    Express 5 API + Socket.IO, Prisma 7 over PostgreSQL 17
            (compose runs migrations as a separate one-shot service, so node is PID 1
             in the API container and handles SIGTERM)
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

## API

All payloads are camelCase, matching the brief's sample data. A trade is addressed by its business
identifier, `TRD-100001`, because that is the value a trader reads off the blotter.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/trades` | List, filtered, sorted and paged |
| `GET` | `/api/trades/:trade_id` | Read one trade |
| `POST` | `/api/trades` | Book a trade, answers 201 |
| `PATCH` | `/api/trades/:trade_id` | Amend, requires the version last seen |
| `POST` | `/api/trades/:trade_id/cancel` | Cancel, optional version guard |
| `GET` | `/api/trades/:trade_id/amendments` | Amendment history, oldest first |

`GET /api/trades` accepts `symbol`, `trader`, `book` and `counterparty` (case-insensitive
substring), `side`, `status`, `sort_by`, `sort_dir`, `limit` and `offset`, and answers an
envelope:

```json
{ "data": [ /* trades */ ], "total": 500, "limit": 100, "offset": 0 }
```

The total is the count before paging, so the grid can show a row count without a second call.

`sort_by` accepts every column the blotter displays, not a subset. A header that looks sortable
and is rejected by the API is worse than no sorting at all, so `trade_sort_columns` in the shared
package is the single list both sides read.

Amend and cancel are optimistically concurrent. The client echoes back the `version` it last saw;
if the trade has moved on, the answer is `409` naming the current version rather than a silent
overwrite. Cancel is a named action rather than a `DELETE`, because the row is not deleted: it
moves to `CANCELLED`. Amending is not a status, so the only two statuses are the brief's own.

Errors always take one shape:

```json
{ "error": { "code": "conflict", "message": "...", "details": [ /* optional */ ] } }
```

`validation_failed` is 422 with field-level detail, `not_found` 404, `conflict` 409,
`rate_limited` 429.

### Audit trail

Every amendment writes a row to `trade_amendment` in the same transaction as the update, so an
amendment cannot exist without its audit row and a failed version check leaves nothing behind.

The `changes` column records both sides of each field that actually moved, for example
`{"quantity": {"from": 5000, "to": 7500}}`. A field resent at the value it already held is not
recorded, so an amendment that changed one field never produces a row claiming it touched eight.
Reading the history is then one call, with no walking backwards through versions.

There is no authentication, so `amended_by` takes the trader from the amendment payload when one
is sent, and otherwise the trade's own trader. That is an assumption, recorded below rather than
hidden: a real system would take the authenticated user.

### Real-time

Socket.IO emits `trade.created`, `trade.amended` and `trade.cancelled`, each carrying the whole
trade rather than a patch, so a client that missed an event still converges on the right row.
Events are emitted from the service layer, not the route handlers, so anything that writes a trade
broadcasts it exactly once. Clients send nothing: mutations go over HTTP so they get the same
validation, error handling and rate limiting as any other write.

### The simulated desk feed

So the blotter is alive without someone clicking, the API simulates desk activity: it books new
trades, and amends and cancels existing ones, roughly 70/20/10, on a jittered three to eight second
interval. It writes through the same service as a human request, so it cannot drift from the real
write path, and it broadcasts the same three events.

| Variable | Default | Purpose |
|---|---|---|
| `LIVE_FEED_ENABLED` | `true` | Set false to silence the feed while demonstrating manually |
| `LIVE_FEED_MIN_INTERVAL_MS` | `3000` | Shortest gap between actions |
| `LIVE_FEED_MAX_INTERVAL_MS` | `8000` | Longest gap between actions |

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

## Continuous integration

`.github/workflows/ci.yml` runs on every push and pull request: install, build the shared
contract, generate the Prisma client, typecheck, lint, the unit and route suites, then the
migrations and the integration tier against a real Postgres service container. The integration
step is the reason the service exists in the workflow; without it those tests skip and a green run
would prove less than it appears to.

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

The service and route tests run against `in_memory_trade_repository.ts`, a second real
implementation of the repository port, rather than a mock. A test that passes there is asserting
behaviour, not that a spy was called, and the same suite would pass against Postgres.

The database-backed repository tier is separate. It is excluded from `npm test` by the default
vitest config and lives behind `vitest.integration.config.ts`, so the cheap tier runs identically
everywhere instead of quietly changing shape when TEST_DATABASE_URL happens to be set. Run it by
pointing it at a database:

```bash
TEST_DATABASE_URL=postgresql://blotter:blotter@localhost:5432/blotter npm run test:integration --workspace backend
```

Without `TEST_DATABASE_URL` it skips rather than fails, so a developer with no Postgres running
still gets a green suite. It creates its rows inside a run-scoped `book` and deletes them
afterwards.

### What has been verified against the running containers

On 2026-09-11, against `docker compose up`:

- 70 unit and route tests pass; the 8 database-backed repository tests pass against the containerised
  Postgres.
- 28 end-to-end checks pass against the running API, including two Socket.IO clients standing in for
  two browser tabs: a trade created over HTTP reaches both without a refresh, and so do the amend and
  cancel events.
- Optimistic concurrency holds: a stale `PATCH` is refused with 409 naming the current version, a
  cancelled trade cannot be amended, and a second cancel is refused.
- A cold start on an empty volume applies the migration and seeds 500 trades: 12 symbols, 8 traders,
  4 books, 10 counterparties, 5.8% cancelled, AAPL priced 219.00 to 236.24 against the brief's 227.45
  anchor.
- The live feed books, amends and cancels trades on its own, and connected clients receive those
  events.
- Hardening holds at runtime: the backend runs as non-root `node`, the root filesystem is read-only
  and rejects writes, all capabilities are dropped, and `no-new-privileges` is set.
- Data survives a container restart, and the seed does not re-run when the table is populated.
- `docker compose stop` logs `SIGTERM received, shutting down` then `shutdown complete` and exits
  0 in about a second, rather than waiting out the SIGKILL timeout.

The audit trail and the widened query surface were added after that run, and the Docker engine was
unavailable when they landed. Their 15 integration tests are written and **have not been executed**:
the audit trail is proven against the in-memory repository and through the routes, but the Prisma
transaction that writes the row, and the JSONB round trip, are unverified until someone runs
`npm run test:integration --workspace backend` against a live Postgres. CI does exactly that on
the next push.

Two defects were found by running the containers rather than reasoning about them, and both are
fixed:

- The API's graceful shutdown never ran. PID 1 was `npm run start`, and npm does not forward
  SIGTERM to its child, so `shutdown()` in `backend/src/index.ts` was dead code inside Docker.
  Migrations now run as their own one-shot compose service, which lets node be PID 1.
- With the handler finally running, it exited 1 on every stop. `io.close()` also closes the HTTP
  server it is attached to, so the following `http_server.close()` answered
  `ERR_SERVER_NOT_RUNNING` and the shutdown reported failure. That specific code is now treated as
  the expected path.

## Assumptions

- No authentication. The brief does not ask for it, and a half-built login is worth less than a
  clear statement of what production would need: short-lived access tokens with rotating refresh
  tokens, a global auth guard, and permission checks in the service layer.
- `trader` is a free-text desk code, not a user account.
- Amendments are attributed to the trader on the payload, or to the trade's own trader when the
  amendment does not touch it. With no authentication there is no better answer, and a constant
  actor would make the audit trail unreadable. A real system would use the authenticated user.
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
