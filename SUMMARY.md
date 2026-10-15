# Backend summary (Node, before the .NET rebuild)

What the current backend does, read from the code on `main` at `1785c39`. Every rule below has a
file reference so it can be checked. This is the contract the .NET services must keep.

## Stack

| Part | Choice | Where |
|---|---|---|
| Runtime | Node 22, TypeScript, ESM | `backend/package.json` |
| HTTP | Express 5, helmet, cors, cookie-parser, 100 kb JSON limit, `trust proxy 1` | `backend/src/app.ts` |
| Validation | Zod 4 schemas in the `@blotter/shared` workspace, imported by backend and frontend | `shared/src/schemas/` |
| Database | Postgres 17 via Prisma 7 (`@prisma/adapter-pg`), hand-written SQL migrations | `database/prisma/` |
| Cache and sessions | Redis 7 (ioredis): refresh-token families, login lockout counters, rate-limit counters | `backend/src/lib/auth/`, `backend/src/middleware/rate_limit.ts` |
| Real time | Socket.IO 4 on the same port as HTTP, path `/socket.io/` | `backend/src/realtime/` |
| Auth | HS256 JWT (jsonwebtoken), bcrypt passwords | `backend/src/lib/auth/` |
| Logs and metrics | pino + pino-http (JSON, `x-request-id` correlation), prom-client on `/metrics` | `backend/src/lib/logging/`, `backend/src/lib/metrics/` |
| Tests | Vitest + supertest; integration tier against real Postgres and Redis | `backend/src/**/*.test.ts`, `*.integration.test.ts` |
| Deploy | Docker Compose: `database`, `migrate` (one-shot), `redis`, `backend` (no published port), `frontend` (Next.js, proxies `/api`, `/socket.io`, `/health`, `/ready` to the backend) | `docker-compose.yaml`, `database/compose.yaml`, `frontend/src/lib/api/proxyRoutes.ts` |

One process does everything: REST, sockets, the simulated desk ("live feed") and the simulated
market marks.

## REST API

All JSON. Field names on the wire are camelCase except query parameters and list envelopes, which
are snake_case. Every error is RFC 9457 `application/problem+json`:

```json
{ "type": "/problems/validation-failed", "title": "Request validation failed", "status": 422,
  "detail": "One or more fields failed validation.", "instance": "/api/v1/trades",
  "code": "validation_failed", "errors": [{ "field": "quantity", "message": "Enter a quantity" }],
  "request_id": "..." }
```

`code` is one of `validation_failed` 422, `unauthenticated` 401, `forbidden` 403, `not_found` 404,
`conflict` 409, `rate_limited` 429, `locked_out` 429, `internal` 500. A 500 hides the message in
production. Unmatched routes answer a 404 problem. `x-request-id` is echoed or generated.
(`backend/src/middleware/error_handler.ts`, `shared/src/schemas/problem.ts`)

### Operational, outside `/api/v1`

| Route | Answer |
|---|---|
| `GET /health` | `200 {status:"ok", uptime_seconds}` |
| `GET /ready` | `200 {status:"ready", database:"up"}` or `503 {status:"not_ready", database:"down"}` |
| `GET /metrics` | Prometheus text. Not forwarded by the frontend proxy |

### Auth (`backend/src/routes/auth_routes.ts`)

| Route | Auth | Request | Response |
|---|---|---|---|
| `POST /api/v1/auth/login` | public, auth limit | `{username, password}` (username 1-64 of `[A-Za-z0-9._-]`, trimmed; password 1-200) | `200 AuthSession` + `Set-Cookie blotter_refresh` |
| `POST /api/v1/auth/refresh` | public, auth limit | cookie `blotter_refresh` | `200 AuthSession` + rotated cookie |
| `GET /api/v1/auth/me` | bearer | none | `200 AuthUser` |
| `POST /api/v1/auth/logout` | bearer | cookie | `204`, cookie cleared |

`AuthSession = {accessToken, expiresIn, user: AuthUser}`.
`AuthUser = {id, username, displayName, traderCode, role: VIEWER|TRADER|ADMIN, permissions[]}`.
The cookie is httpOnly, `SameSite=Lax`, `Path=/api/v1/auth`, `Max-Age` = refresh TTL, `Secure`
when `COOKIE_SECURE` or production.

### Trades and positions (`backend/src/routes/trade_routes.ts`, `position_routes.ts`)

| Route | Permission | Request | Response |
|---|---|---|---|
| `GET /api/v1/trades` | `trade.read` | query below | `200 {data: Trade[], total, limit, next_cursor}` |
| `GET /api/v1/trades/events` | `trade.read` | `limit` 1-500 (default 100), `cursor` | `200 {data: TradeEvent[], total, limit, next_cursor}`, newest first |
| `GET /api/v1/trades/:trade_id` | `trade.read` | `trade_id` must match `^TRD-\d{6,}$` else 422 | `200 Trade` or 404 |
| `GET /api/v1/trades/:trade_id/events` | `trade.read` | | `200 TradeEvent[]` oldest first, 404 if no trade |
| `POST /api/v1/trades` | `trade.create`, write limit | `{symbol, side, quantity, price, book, counterparty, tradeTimestamp}` | `201 Trade` |
| `PATCH /api/v1/trades/:trade_id` | `trade.amend`, write limit | `{version, quantity?, price?, book?}`; `counterparty` refused | `200 Trade` |
| `POST /api/v1/trades/:trade_id/cancel` | `trade.cancel`, write limit | `{version?}` (body optional) | `200 Trade` |
| `GET /api/v1/positions` | `trade.read` | none | `200 Position[]` sorted by symbol |

List query: `symbol`, `trader`, `book`, `counterparty` (case-insensitive substring), `side`
(BUY/SELL), `status` (ACTIVE/CANCELLED), `date_from`, `date_to` (ISO datetime, inclusive, refused on
`date_from` when From is after To), `sort_by` (any of tradeId, symbol, side, quantity, price, trader,
book, counterparty, tradeTimestamp, status; default tradeTimestamp), `sort_dir` (asc/desc, default
desc), `limit` 1-1000 (default 100), `cursor`.

`Trade = {id (uuid), tradeId, symbol, side, quantity (int), price (JSON number), currency (USD|GBX),
trader, book, counterparty, tradeTimestamp, status, version, createdAt, updatedAt}`.

`TradeEvent = {id, tradeId, version, action (AMENDED|CANCELLED), source (API|LIVE_FEED),
changes: {field: {from, to}}, actor, occurredAt}`.

`Position = {symbol, currency, netQuantity, buyQuantity, sellQuantity, grossNotional, tradeCount,
averagePrice, realisedPnl}`.

Field limits and the exact user-facing messages live in `shared/src/schemas/trade.ts`. The frontend
shows those messages verbatim, so a 422 must carry the same strings.

### Rate limits (`backend/src/middleware/rate_limit.ts`)

Fixed 60 s windows in Redis, IETF draft-7 headers, 429 problem on breach.

| Tier | Default | Key | Applies to |
|---|---|---|---|
| auth | 10/min | IP | login, refresh |
| read | 300/min | user id | everything behind the guard |
| write | 60/min | user id | create, amend, cancel (on top of read) |

## Real-time events (`shared/src/events/socket_events.ts`, `backend/src/realtime/`)

Socket.IO, server to client only. The handshake must pass an Origin allowlist (a missing Origin is
allowed), carry a valid access token in `auth.token` or `Authorization: Bearer`, and the role must
hold `trade.read`.

| Event | Payload |
|---|---|
| `trade.created`, `trade.amended`, `trade.cancelled` | `{seq, emitted_at, trade: Trade}` |
| `trade_event.recorded` | `{seq, emitted_at, event: TradeEvent}` |
| `position.updated` | `{seq, emitted_at, position: Position}` |
| `mark.updated` | `{[symbol]: number}`, no envelope; sent on connect and every 900 ms |

`seq` is one counter for every enveloped event, per process, starting at 1 on boot. The client
treats a gap as a reason to refetch. After each write the order is: trade, then the audit event (on
amend and cancel), then the symbol's recomputed position. Broadcasts are fire-and-forget after the
commit.

## Data model (`database/prisma/schema.prisma`, `database/prisma/migrations/`)

| Table | Columns |
|---|---|
| `trade` | `id uuid pk`, `trade_id varchar(24) unique`, `symbol varchar(12)`, `side`, `quantity int`, `price numeric(18,6)`, `currency` (USD/GBX), `trader varchar(32)`, `book varchar(64)`, `counterparty varchar(128)`, `trade_timestamp timestamptz(3)`, `status` default ACTIVE, `version int` default 1, `created_at`, `updated_at` |
| `trade_event` | `id uuid pk`, `trade_uuid` fk to trade (cascade), `version int`, `action`, `source`, `changes jsonb`, `actor varchar(32)`, `occurred_at timestamptz(3)` |
| `app_user` | `id uuid pk`, `username varchar(64) unique`, `password_hash`, `display_name`, `trader_code varchar(32)` (indexed, not a foreign key), `role` default TRADER |

Sequence `trade_id_seq` starts at 100001 and formats as `TRD-` plus 6-digit zero padding. Indexes:
`(status, trade_timestamp desc)`, `(symbol, trade_timestamp desc)`, `symbol`, `trader`, `book`,
`trade_event (trade_uuid, version)`, `trade_event (occurred_at desc, id desc)`.

Reference data is code, not tables: 12 instruments (8 USD, 4 London names in GBX pence), 10
suggested counterparties (not an allowlist), roles to permissions (`shared/src/reference/`).

## Business rules

**Booking** (`backend/src/services/trade_service/index.ts`). The trader comes from the access token,
never the body. Currency comes from the instrument. `tradeTimestamp` may be at most 60 s in the
future. Notional `quantity * price` must not exceed the per-currency desk limit (USD 50,000,000; GBX
4,000,000,000 pence), else 422 with a sentence in dollars or pounds and a field error on `quantity`
(`rules.ts`). Status ACTIVE, version 1, `tradeId` from the sequence. Booking writes no audit row.

**Amendment.** Only `quantity`, `price` and `book` can change; sending `counterparty` is a 422 and
other unknown keys are dropped. An empty change is a 422. A trader may amend their own trades; other
people's need `trade.amend.any` (ADMIN), else 403. The notional limit is re-checked on the merged
values. One transaction reads the row, requires ACTIVE and a matching version, runs a conditional
update that bumps `version`, and inserts a `trade_event` whose `changes` hold only the fields whose
value really moved (`backend/src/lib/audit/build_change_set.ts`). If the update matches nothing, a
re-read decides the answer: 404 if gone, 409 "is cancelled", or 409 "has changed since you loaded
it. It is now at version N".

**Cancellation.** A status change, never a delete. `version` is optional; when sent it must match.
Ownership works like amendment with `trade.cancel.any`. Bumps `version` and writes an event with
`changes = {status: {from: ACTIVE, to: CANCELLED}}`. Cancelling a cancelled trade is a 409.

**Decimal prices.** Stored as `numeric(18,6)`. The API takes and returns a JSON number; the
repository writes `price.toFixed(6)` and reads `Decimal.toNumber()`
(`backend/src/lib/mappers/trade_mapper.ts`, `backend/src/repositories/prisma_trade_repository/writes.ts`).
The notional check and the position maths run in IEEE doubles, with a rounding guard in the limit
message.

**Audit trail.** `trade_event` is append-only, enforced by a Postgres trigger that raises on any
UPDATE or DELETE, which also blocks deleting a trade with history (migration
`20260912020000`). Every event records `actor` (desk code) and `source` (API or LIVE_FEED).

**Optimistic concurrency.** The integer `version` column, checked inside the conditional update's
WHERE clause, so two writers cannot both win.

**Pagination.** Keyset. The cursor is base64url of the last row's uuid; the next page is "after
that row" in `(sort column, id)` order with both in the requested direction (Prisma `cursor` plus
`skip: 1`). A cursor that is not a uuid is ignored and gives page one. `next_cursor` is null when
the page came back short. `total` counts every match ignoring the window. The event feed pages on
`(occurred_at desc, id desc)` (`backend/src/lib/paging/cursor.ts`, `backend/src/repositories/prisma_trade_repository/`).

**Positions** (`shared/src/positions/position_book.ts`). Average-cost walk over ACTIVE trades in
`(tradeTimestamp, id)` order, per symbol. The same code runs in the browser.

**Authentication** (`backend/src/services/auth_service.ts`, `backend/src/lib/auth/`). bcrypt cost 12,
passwords over 72 bytes refused, a dummy hash for unknown usernames so timing matches, rehash on
login when the cost setting changed. Lockout after 5 failures per lower-cased username for 900 s,
re-armed on each failure, answered with `locked_out` and `Retry-After`. Access token: HS256, issuer
`blotter-api`, audience `blotter-client`, 900 s, claims `sub, username, trader_code, role`. Refresh
token: separate secret, 7 days, claims `sub, family, jti`. Redis holds one active `jti` per family
and rotates it in a Lua script; presenting an old `jti` deletes the family (reuse detection).

**Simulation.** On an empty database the API seeds 4 demo users (`jsmith`, `abrown` TRADER, `mjones`
ADMIN, `viewer`) with one shared password from config, and 500 trades over the last 5 weekday
sessions from a fixed faker seed. The live feed then writes through the same service every 3-8 s as
an ADMIN actor with source LIVE_FEED: 70% create, 20% amend, 10% cancel, turning creates into
cancels as the active book nears 2,000, leaning the side against the symbol's net position. The mark
feed walks each symbol's mark by at most 0.11% (0.18% below 20) every 900 ms, in memory only.

## Tests worth porting

About 5,000 lines across 30 files. The behaviour-carrying ones: `trade_routes.test.ts` (690),
`trade_service.test.ts` (598), `prisma_trade_repository.integration.test.ts` (525),
`socket_broadcast.test.ts` (470), `shared/src/schemas/trade.test.ts` (374),
`auth_service.test.ts` (309), `auth_routes.test.ts` (220), `live_feed.test.ts` (227),
`refresh_store.integration.test.ts` (135), `position_book.test.ts` (97), plus the small rule tests
for cursor, change set, lean side, choose action and marks.
