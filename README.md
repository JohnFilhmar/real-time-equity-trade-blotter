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
| Audit trail on an append-only table (bonus) | Done |
| Keyset paging, currency, pre-trade limits, request logging, metrics | Done |
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
amendment increments `version` and writes a `trade_event` row rather than inventing a third
state.

## API

Everything lives under `/api/v1`. Payloads are camelCase, matching the brief's sample data, while
query parameters are snake_case. A trade is addressed by its business identifier, `TRD-100001`,
because that is the value a trader reads off the blotter.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/v1/trades` | List, filtered, sorted and cursor-paged |
| `GET` | `/api/v1/trades/:trade_id` | Read one trade |
| `POST` | `/api/v1/trades` | Book a trade, answers 201 |
| `PATCH` | `/api/v1/trades/:trade_id` | Amend, requires the version last seen |
| `POST` | `/api/v1/trades/:trade_id/cancel` | Cancel, optional version guard |
| `GET` | `/api/v1/trades/:trade_id/events` | Full history, oldest first |

`/health`, `/ready` and `/metrics` sit outside the prefix on purpose. They are operational
surfaces for a probe and a scraper, not part of the contract a client depends on, and versioning
them would tie an orchestrator's configuration to an API lifecycle it has nothing to do with.

### Listing

`GET /api/v1/trades` accepts `symbol`, `trader`, `book` and `counterparty` (case-insensitive
substring), `side`, `status`, `date_from`, `date_to`, `sort_by`, `sort_dir`, `limit` and
`cursor`, and answers an envelope:

```json
{ "data": [ /* trades */ ], "total": 500, "limit": 100, "next_cursor": "M2YyNTA0ZTAt..." }
```

The total is the count before paging, so the grid can show a row count without a second call.
`next_cursor` is `null` on the last page.

**Paging is keyset, not offset.** A blotter inserts rows all day, so an offset computed on one
request no longer points at the same place on the next: page two re-serves rows already seen and
skips others. That is a correctness problem rather than a performance one. A cursor names a row, and
every sort carries `id` as its tiebreaker so the row stays put, which means inserts above it change
nothing. A cursor that does not decode is treated as absent and returns the first page, so a stale
one degrades rather than failing.

`sort_by` accepts every column the blotter displays, not a subset. A header that looks sortable and
is rejected by the API is worse than no sorting at all, so `trade_sort_columns` in the shared
package is the single list both sides read.

### Writing

Amend and cancel are optimistically concurrent. The client echoes back the `version` it last saw;
if the trade has moved on, the answer is `409` naming the current version rather than a silent
overwrite. Cancel is a named action rather than a `DELETE`, because the row is not deleted: it
moves to `CANCELLED`. Amending is not a status, so the only two statuses are the brief's own.

**An amendment may change quantity, price, counterparty and book, and nothing else.** Re-pointing a
trade at another symbol, flipping its side, or rewriting when it executed are rebookings rather than
corrections, so the amend schema omits them. The simulated feed restricts itself to the same set.

Three pre-trade rules run server-side:

| Rule | Behaviour |
|---|---|
| Symbol allowlist | Only the twelve names in the shared instrument universe book. A regex would let `ZZZZ` through |
| Future trade date | Refused, with a minute of tolerance for a client clock running fast |
| Notional ceiling | `quantity x price` above the desk limit for that currency is refused |

### Currency

The blotter quotes in two currencies and says which. The London names are priced in GBX, pence
sterling, because that is what the London Stock Exchange quotes: HSBA.L prints around 982, not 9.82.
Currency belongs to the instrument rather than the ticket, so a client cannot send one, and a trade
whose currency disagrees with its own symbol cannot exist.

The notional ceiling is therefore per currency. Normalising through an FX rate is the real answer
and is deliberately out of scope: inventing a rate would be inventing a financial convention.

### Errors

Every failure is an RFC 9457 problem document on `application/problem+json`:

```json
{
  "type": "/problems/conflict",
  "title": "Conflict",
  "status": 409,
  "detail": "Trade TRD-100001 has changed since you loaded it...",
  "instance": "/api/v1/trades/TRD-100001",
  "code": "conflict",
  "request_id": "70a13d66-cb49-4a73-8823-65ca2bbcc950"
}
```

`code`, `errors` and `request_id` are extension members, which the RFC permits: `code` keeps a
stable value clients branch on without parsing a URI, `errors` carries field-level detail on a
validation failure, and `request_id` matches the log line, so a user can quote one string and have
it found. `validation_failed` is 422, `not_found` 404, `conflict` 409, `rate_limited` 429.

### Real-time

Socket.IO emits `trade.created`, `trade.amended` and `trade.cancelled`, each carrying an envelope:

```json
{ "seq": 42, "emitted_at": "2026-09-12T03:19:47.881Z", "trade": { /* the whole trade */ } }
```

`seq` is monotonic for the life of the process, so a client that sees 41 then 43 knows it missed
one and can refetch instead of silently diverging. The sequence restarts when the process does, and
that is why the client needs a resync path rather than a guarantee. The whole row travels rather
than a patch, so a client that did miss an event still converges once it refetches. Events are
emitted from the service layer, not the route handlers, so anything that writes a trade broadcasts
it exactly once. Clients send nothing: mutations go over HTTP so they get the same validation, error
handling and rate limiting as any other write.

Origin is checked twice, because the two checks cover different things. The `cors` option governs
the HTTP long-polling handshake, which is a normal cross-origin request. A connection middleware
governs the WebSocket upgrade, which is not subject to CORS at all: a browser will open a WebSocket
to any host, so without that check the allowlist protects only the transport nobody ends up using.

### Audit trail

Every amendment and every cancellation writes a row to `trade_event` in the same transaction as the
change, so a change cannot exist without its record and a failed version check leaves nothing
behind. Each row carries what happened (`action`), where it came from (`source`, so a simulated
trade is distinguishable from a human one even though both go through the same service), who did it
(`actor`) and what moved:

```json
{ "quantity": { "from": 5000, "to": 7500 } }
```

A field resent at the value it already held is not recorded, so a one-field amendment never produces
a row claiming it touched four. A cancellation records its status transition in the same shape, so
reading the history needs one shape rather than two.

**The table is append-only, enforced rather than documented.** A trigger raises on `UPDATE` and on
`DELETE`, which holds whichever role connects, including the one that runs migrations. An audit
trail the application can rewrite is not an audit trail. Deleting a trade cascades to its events and
is therefore also refused, which matches the rule that a trade is never hard deleted.

There is no authentication, so `actor` is the trade's own trader. That is an assumption, recorded
below rather than hidden: a real system would use the authenticated user.

### Logging and metrics

One structured JSON line per request, carrying a correlation id taken from an incoming
`x-request-id` or generated, echoed on the response header and included in every error body.

`GET /metrics` exposes Prometheus text. Three numbers say whether the blotter is actually
real-time rather than merely claiming to be: `blotter_socket_clients_connected`,
`blotter_broadcasts_emitted_total`, and `blotter_broadcast_lag_seconds`, which measures the
distance between a change committing and its broadcast leaving the server.

### The simulated desk feed

So the blotter is alive without someone clicking, the API simulates desk activity: it books new
trades, and amends and cancels existing ones, roughly 70/20/10, on a jittered three to eight second
interval. It writes through the same service as a human request, so it cannot drift from the real
write path, and its rows are marked `LIVE_FEED` in the audit trail.

| Variable | Default | Purpose |
|---|---|---|
| `LIVE_FEED_ENABLED` | `true` | Set false to silence the feed while demonstrating manually |
| `LIVE_FEED_MIN_INTERVAL_MS` | `3000` | Shortest gap between actions |
| `LIVE_FEED_MAX_INTERVAL_MS` | `8000` | Longest gap between actions |
| `MAX_NOTIONAL_USD` | `50000000` | Desk notional ceiling for USD names |
| `MAX_NOTIONAL_GBX` | `4000000000` | Desk notional ceiling for GBX names |
| `LOG_LEVEL` | `info` | pino level |

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

`socket_broadcast.test.ts` is the one worth reading. It boots the real HTTP server and Socket.IO on
an ephemeral port, connects two Socket.IO clients standing in for two browser tabs, creates a trade
over the network, and asserts the second tab sees it without asking. That is the brief's real-time
requirement stated as an assertion rather than a claim, and it also covers the envelope, sequence
monotonicity, and the rejection of a socket from an origin that is not on the allowlist.

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

Since that run the API gained keyset paging, currency, the trade event log, problem+json errors,
request logging, metrics and the Origin check, on a machine with no Docker engine available. CI
covers the gap: 152 tests pass there, 23 of them against a real Postgres service container,
including the append-only trigger and the currency migration. The compose stack itself has not been
re-run since, so one `docker compose up -d --wait` is worth doing before the UI work.

The audit trail and the widened query surface were added after that run, on a machine with no
Docker engine available. CI covered the gap: its Postgres service container ran all 15
database-backed tests, the seven new audit ones included, and they pass. The Prisma transaction
that writes the amendment row, and the JSONB round trip through the shared schema, are therefore
verified against a real database, just not against the compose stack on this machine.

CI also caught a defect in the test wiring on its first run. `npm test` matched the integration
suffix, and the job sets `TEST_DATABASE_URL`, so the skip guard never fired and the
database-backed tests ran before the migrations had been applied. The two tiers now sit behind
separate vitest configs, which is what the suffix was there for.

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
- Changes are attributed to the trade's own trader. With no authentication and no actor field on
  the payload there is no better answer, and a constant actor would make the audit trail
  unreadable. A real system would use the authenticated user.
- Notional ceilings are per currency rather than normalised through an FX rate. A rate would have
  to be invented, and inventing a financial convention is worse than naming the limit.
- The seed skips weekends but not exchange holidays. A real calendar is per venue and this universe
  spans two.
- The event sequence on broadcasts restarts when the process does. A client cannot tell a restart
  from a gap on sequence alone, which is why the client needs a resync path rather than a promise.
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
