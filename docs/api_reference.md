# API reference

Everything lives under `/api/v1`. Payloads are camelCase, matching the brief's sample data, while
query parameters are snake_case. A trade is addressed by its business identifier, `TRD-100001`,
because that is the value a trader reads off the blotter.

Three services sit behind one origin. nginx, the only published port, sends `/api/*`, `/health`
and `/ready` to the gateway and `/hubs/*` to the realtime service over the internal network, so
every request and the live link are same-origin. The gateway serves this contract and calls the
trades service over gRPC; `/metrics` is not forwarded from any of them.

| Method | Path | Permission | Purpose |
|---|---|---|---|
| `POST` | `/api/v1/auth/login` | public | Exchange credentials for a session |
| `POST` | `/api/v1/auth/refresh` | public | Rotate the refresh cookie for a new session |
| `GET` | `/api/v1/auth/me` | any token | The signed-in user and their permissions |
| `POST` | `/api/v1/auth/logout` | any token | End the session |
| `GET` | `/api/v1/trades` | `trade.read` | List, filtered, sorted and cursor-paged |
| `GET` | `/api/v1/trades/events` | `trade.read` | The whole audit log, newest first, cursor-paged |
| `GET` | `/api/v1/trades/:trade_id` | `trade.read` | Read one trade |
| `GET` | `/api/v1/trades/:trade_id/events` | `trade.read` | One trade's history, oldest first |
| `POST` | `/api/v1/trades` | `trade.create` | Book a trade, answers 201 |
| `PATCH` | `/api/v1/trades/:trade_id` | `trade.amend` | Amend, requires the version last seen |
| `POST` | `/api/v1/trades/:trade_id/cancel` | `trade.cancel` | Cancel, optional version guard |
| `GET` | `/api/v1/positions` | `trade.read` | Net position per symbol from active trades |

Everything except login and refresh needs `Authorization: Bearer <token>`. Protection is the
default rather than an opt-in: the guard is mounted across the whole prefix and the only public
routes are the two mounted above it. An unauthenticated request to a path that does not exist
answers 401 rather than 404, so the API cannot be enumerated without credentials.

`/health`, `/ready` and `/metrics` sit outside the prefix. They are operational surfaces for a
probe and a scraper, not part of the contract a client depends on.

## Listing

`GET /api/v1/trades` accepts `symbol`, `trader`, `book` and `counterparty` (case-insensitive
substring), `side`, `status`, `date_from`, `date_to`, `sort_by`, `sort_dir`, `limit` and
`cursor`, and answers an envelope:

```json
{ "data": [ /* trades */ ], "total": 500, "limit": 100, "next_cursor": "M2YyNTA0ZTAt..." }
```

The total is the count before paging. `next_cursor` is `null` on the last page.

Paging is keyset, not offset. A blotter inserts rows all day, so an offset computed on one request
no longer points at the same place on the next: page two re-serves rows already seen and skips
others. A cursor names a row, and every sort carries `id` as its tiebreaker so the row stays put. A
cursor that does not decode is treated as absent and returns the first page.

`sort_by` accepts every column the blotter displays. `trade_sort_columns` in the shared package is
the single list both sides read, so a header that looks sortable is never rejected by the API.

`date_from` and `date_to` are ISO datetimes and either may be left out. A `date_from` later than
`date_to` answers `422` with "From must be on or before To" on `date_from`; equal values are
allowed. The blotter's date inputs hold back the same pair before any request is sent, so the grid
keeps showing the last range that made sense.

## Writing

Amend and cancel are optimistically concurrent. The client echoes back the `version` it last saw;
if the trade has moved on, the answer is `409` naming the current version rather than a silent
overwrite. Cancel is a named action rather than a `DELETE`, because the row is not deleted: it
moves to `CANCELLED`.

An amendment may change quantity, price and book, and nothing else. Moving a trade to another
symbol or counterparty, flipping its side, or rewriting when it executed is a rebooking rather than
a correction. The desk cancels the trade and books it again, so both stay on the record. Symbol,
side and execution time are dropped from an amend payload. A counterparty is refused with a `422`
telling the trader to cancel and rebook, because dropping it would answer `200` for a counterparty
that never moved. The simulated feed restricts itself to the same set.

A payload that breaks a rule answers `422` with an `errors` array of `{ field, message }`. Each
message is the sentence the ticket shows beside the input, such as "Enter a counterparty", written
once on the rule in the shared schema.

Three pre-trade rules run server-side:

| Rule | Behaviour |
|---|---|
| Symbol allowlist | Only the twelve names in the shared instrument universe book |
| Future trade date | Refused, with a minute of tolerance for a client clock running fast |
| Notional ceiling | Refused with a `422` when quantity times price is over the desk limit for that currency. The quantity message asks for a lower quantity or price, and the detail gives the trade's worth and the limit in dollars or pounds, such as "This trade is worth £41,000,000, over the £40,000,000 limit for London names." |

## Positions

`GET /api/v1/positions` answers one row per symbol with active trades, sorted by symbol:

```json
{ "symbol": "AAPL", "currency": "USD", "netQuantity": 184100, "buyQuantity": 582300,
  "sellQuantity": 398200, "grossNotional": 222215816.74, "tradeCount": 196,
  "averagePrice": 227.91, "realisedPnl": 12480.5 }
```

Every figure is in the instrument's own quote currency, so a London name reports pence and the
interface divides by a hundred to show pounds. `averagePrice` and `realisedPnl` come from an
average-cost walk over the symbol's active trades in execution order; the walk lives once, in
`shared/src/positions/position_book.ts`, and the client runs the same code. Unrealised P&L is not
served: the client multiplies the open size by the latest mark from the socket as marks move.

## Authentication

Sign in with `POST /api/v1/auth/login` and a `{ "username", "password" }` body. The response
carries a short-lived access token (15 minutes) for the `Authorization` header and the signed-in
user; the long-lived refresh token goes into an httpOnly cookie scoped to `/api/v1/auth`, so no
script on the page can read the credential that matters and it never rides along with an
ordinary trade request.

Refresh rotates on every use. A refresh token is spent the moment it is exchanged. If a spent
token comes back, the entire session family is destroyed and both the thief and the legitimate
holder are signed out. The compare and the write are one Lua script in Redis.

Passwords are bcrypt at `BCRYPT_ROUNDS`, 12 by default. A login for an account that does not exist
is still compared against a dummy hash the API makes at that same cost when it starts, so response
time does not reveal which usernames are real at any configured cost. A correct password whose
stored hash was made at another cost is rehashed at the current one, so existing accounts follow a
change to `BCRYPT_ROUNDS` as their owners sign in. Failures are
counted per account in Redis. The fifth failure locks the account for `LOGIN_LOCKOUT_SECONDS`, 15
minutes by default, and is itself answered with `429` and code `locked_out`, so the person learns
at once rather than on a sixth attempt. Unknown usernames count and lock the same way. The
per-address rate limit answers `429` with code `rate_limited`. Both carry a `Retry-After` header in
seconds; the sign-in form counts down from it and remembers an account lock per username across a
reload.

The SignalR hub verifies the same access token. Browsers cannot set headers on a WebSocket, so the
client sends it as the `access_token` query value, which the hub accepts on its own path only and
which nginx leaves out of its access log. The hub refuses anyone without `trade.read` or from an
origin outside `CORS_ORIGINS`.

## Roles and permissions

| Role | Can |
|---|---|
| `VIEWER` | Read trades, positions and the audit trail |
| `TRADER` | Read, book, and amend or cancel **their own** trades |
| `ADMIN` | All of the above, plus amend or cancel **anyone's** trade |

Routes require the permission, never the role. The ownership rule depends on the row rather than
the request, so it lives in the service: a trader amending another trader's trade answers 403.
The interface receives the permission list so it can hide what the person cannot do; the server
re-checks every time.

A trade's trader comes from the token, not the payload. You book as yourself.

### Demo accounts

Seeded into an empty database. They share a password, which is configuration
(`SEED_USER_PASSWORD`, default `FusionDemo!2026`) rather than source.

| Username | Role | Desk |
|---|---|---|
| `jsmith` | TRADER | JSMITH |
| `abrown` | TRADER | ABROWN |
| `mjones` | ADMIN | MJONES |
| `viewer` | VIEWER | VIEWER |

## Currency

The blotter quotes in two currencies and says which. The London names are priced in GBX, pence
sterling, because that is what the London Stock Exchange quotes: HSBA.L prints around 982, not
9.82. Currency belongs to the instrument rather than the ticket, so a client cannot send one.

## Errors

Every failure is an RFC 9457 problem document on `application/problem+json`:

```json
{
  "type": "/problems/conflict",
  "title": "Conflict",
  "status": 409,
  "detail": "Trade TRD-100001 has changed since you loaded it. It is now at version 2. Reload and try again.",
  "instance": "/api/v1/trades/TRD-100001",
  "code": "conflict",
  "request_id": "70a13d66-cb49-4a73-8823-65ca2bbcc950"
}
```

`code` is the stable value clients branch on. `errors` carries field-level detail on a validation
failure. `request_id` matches the log line. `validation_failed` is 422, `unauthenticated` 401,
`forbidden` 403, `not_found` 404, `conflict` 409, `rate_limited` 429 for a request limit, and
`locked_out` 429 for an account locked by failed logins. Both 429s send `Retry-After`.

A body that is not JSON answers 400 and one over 100 kB answers 413, both with code
`validation_failed`. If the trades service cannot be reached, a trade route answers 503 with code
`internal`. Optional members (`detail`, `instance`, `errors`, `request_id`) are left out rather than
sent as `null`.

## Real-time

The realtime service's SignalR hub at `/hubs/blotter` emits `trade.created`, `trade.amended` and
`trade.cancelled`, each carrying an envelope:

```json
{ "seq": 42, "emitted_at": "2026-09-12T03:19:47.881Z", "trade": { /* the whole trade */ } }
```

The trades service writes every change to an outbox in the same transaction as the change, and a
dispatcher publishes it to RabbitMQ; the realtime service consumes it and broadcasts through a Redis
backplane, so every replica reaches every client. `seq` is a Redis counter shared by the replicas,
so a client that sees 41 then 43 knows it missed one and refetches. The counter restarts if Redis
does, and the client treats a decrease the same way. The whole row travels rather than a patch.
Clients send nothing: mutations go over HTTP so they get the same validation, error handling and
rate limiting as any other write.

Three further events share the same sequence and the same envelope shape:

| Event | Payload | When |
|---|---|---|
| `trade_event.recorded` | `{ seq, emitted_at, event }`, the audit row | After every amend and cancel, right after the trade broadcast |
| `position.updated` | `{ seq, emitted_at, position }`, the symbol's recomputed position | After every create, amend and cancel |
| `mark.updated` | `{ "AAPL": 227.91, ... }`, every symbol's mark, no envelope | Every 900ms while the simulated feed runs, and once on connect |

The audit event is the row the audit endpoints serve, so a client places it in the feed and in the
trade's history without a request. The position is the whole recomputed row for one symbol, so a
client replaces rather than derives. Marks are idempotent snapshots: a missed one is superseded by
the next, which is why they carry no sequence. All three, like the trade events, are silenced by
`LIVE_FEED_ENABLED=false` only where they come from the simulation; a real user's write still
broadcasts.

## Audit trail

Every amendment and every cancellation writes a row to `trade_event` in the same transaction as
the change. Each row carries `action`, `source` (`API` or `LIVE_FEED`), `actor`, `version` and
the fields that moved with both sides:

```json
{ "quantity": { "from": 5000, "to": 7500 } }
```

The table is append-only, enforced by a database trigger that raises on `UPDATE` and `DELETE`.
The foreign key from an event to its trade does not cascade, so a trade with history cannot be
deleted either. The trades service connects as a login whose role can insert events but not update,
delete or truncate them, or switch the trigger off.

## Logging and metrics

One structured JSON line per request from each service, carrying a correlation id taken from an
incoming `x-request-id` or generated at the edge, echoed on the response header, included in every
error body, and forwarded from the gateway to the trades service on the gRPC call.

Each service exports traces, metrics and logs over OTLP to the Aspire dashboard in the compose
stack, and serves `GET /metrics` in Prometheus text for a scraper on the internal network. The
realtime service's scrape keeps the Node API's names: `blotter_socket_clients_connected`,
`blotter_broadcasts_emitted_total`, and `blotter_broadcast_lag_seconds`, the distance between a
change committing and its broadcast leaving the server. nginx answers `/metrics` with 404.

## Configuration

Each service reads its own environment once at start, validates it, and refuses to start with a
list of what is wrong, naming the setting but never its value. `docker-compose.yml` fills these in
from `.env`, with development fallbacks.

Shared by all three services:

| Variable | Default | Purpose |
|---|---|---|
| `JWT_ACCESS_SECRET` | none, required | Signs access tokens at the gateway, verifies them everywhere. Refused under 32 characters |
| `HTTP_PORT` | `8080` | Port for the service's HTTP listener: the API or hub, health, readiness and metrics |
| `LOG_LEVEL` | `info` | `trace`, `debug`, `info`, `warn`, `error`, `fatal` or `silent`, the Node API's names. Framework logs stay at `warn` or quieter |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | unset | Where traces, metrics and logs go over OTLP. Unset sends none |

Gateway:

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_CONNECTION` | none, required | SQL Server connection string for the identity database |
| `REDIS_CONNECTION` | none, required | Redis for sessions, lockouts and rate-limit windows |
| `TRADES_GRPC_URL` | none, required | The trades service's gRPC address, such as `http://trades:8081` |
| `JWT_REFRESH_SECRET` | none, required | Signs refresh tokens. Refused under 32 characters, and refused when equal to the access secret |
| `ACCESS_TOKEN_TTL_SECONDS` | `900` | Access token lifetime, at most an hour |
| `REFRESH_TOKEN_TTL_SECONDS` | `604800` | Refresh token lifetime, and the life of a session family |
| `BCRYPT_ROUNDS` | `12` | bcrypt cost, from 10 to 15 |
| `COOKIE_SECURE` | `false` | Marks the refresh cookie `Secure`. Always on in the Production environment |
| `CORS_ORIGINS` | `http://localhost:3000` | Comma-separated origin allowlist for credentialed calls |
| `AUTH_RATE_LIMIT` | `10` | Requests a minute on the credential endpoints, per address |
| `READ_RATE_LIMIT` | `300` | Requests a minute on guarded routes, per user |
| `WRITE_RATE_LIMIT` | `60` | Writes a minute, per user, on top of the read limit |
| `LOGIN_MAX_ATTEMPTS` | `5` | Failures before an account locks |
| `LOGIN_LOCKOUT_SECONDS` | `900` | How long a lock lasts, re-armed by every further failure |
| `SEED_ON_STARTUP` | `true` | Create the demo accounts in an empty identity database |
| `SEED_USER_PASSWORD` | `FusionDemo!2026` | Password given to the demo accounts |

Trades service:

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_CONNECTION` | none, required | SQL Server connection string for the trades database |
| `RABBITMQ_URL` | none, required while the outbox dispatches | AMQP URL of the broker trade changes are published to |
| `OUTBOX_DISPATCH_ENABLED` | `true` | Publish the outbox to RabbitMQ. Off only in tests |
| `GRPC_PORT` | `8081` | Port for the gRPC listener, HTTP/2 without TLS on the internal network |
| `SEED_ON_STARTUP` | `true` | Seed trades into an empty trades database |
| `SEED_TRADE_COUNT` | `500` | Trades generated on first start |
| `LIVE_FEED_ENABLED` | `true` | Set false to silence the simulated desk while demonstrating manually |
| `LIVE_FEED_MIN_INTERVAL_MS` | `3000` | Shortest gap between simulated actions |
| `LIVE_FEED_MAX_INTERVAL_MS` | `8000` | Longest gap between simulated actions |
| `LIVE_FEED_MAX_ACTIVE_TRADES` | `2000` | Active trades the simulated desk keeps near. From 90% of this it increasingly cancels instead of booking, and at or over it still books one ticket in seven. A soft limit: trades people book count toward it, and cancelled trades and audit rows still accumulate |
| `MAX_NOTIONAL_USD` | `50000000` | Desk notional ceiling for USD names |
| `MAX_NOTIONAL_GBX` | `4000000000` | Desk notional ceiling for GBX names, in pence |

Realtime service:

| Variable | Default | Purpose |
|---|---|---|
| `RABBITMQ_URL` | none, required | AMQP URL of the broker trade changes arrive from |
| `REDIS_CONNECTION` | none, required | Redis for the SignalR backplane, the broadcast sequence and the marks |
| `CORS_ORIGINS` | `http://localhost:3000` | Comma-separated origin allowlist; the hub refuses any other origin, so the public address in front of the stack has to be listed |
| `MARK_FEED_ENABLED` | `true` | Run the simulated marks |
| `MARK_INTERVAL_MS` | `900` | How often the marks move |

Web app, at build time:

| Variable | Default | Purpose |
|---|---|---|
| `API_INTERNAL_URL` | `http://localhost`, `http://gateway:8080` in compose | Where the web server forwards the API's paths, compiled into its rewrites |
| `REALTIME_INTERNAL_URL` | the API address, `http://realtime:8080` in compose | Where the web server forwards `/hubs/*` |
