# API reference

Everything lives under `/api/v1`. Payloads are camelCase, matching the brief's sample data, while
query parameters are snake_case. A trade is addressed by its business identifier, `TRD-100001`,
because that is the value a trader reads off the blotter.

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

## Writing

Amend and cancel are optimistically concurrent. The client echoes back the `version` it last saw;
if the trade has moved on, the answer is `409` naming the current version rather than a silent
overwrite. Cancel is a named action rather than a `DELETE`, because the row is not deleted: it
moves to `CANCELLED`.

An amendment may change quantity, price, counterparty and book, and nothing else. Re-pointing a
trade at another symbol, flipping its side, or rewriting when it executed are rebookings rather
than corrections, so the amend schema omits them. The simulated feed restricts itself to the same
set.

Three pre-trade rules run server-side:

| Rule | Behaviour |
|---|---|
| Symbol allowlist | Only the twelve names in the shared instrument universe book |
| Future trade date | Refused, with a minute of tolerance for a client clock running fast |
| Notional ceiling | `quantity x price` above the desk limit for that currency is refused |

## Positions

`GET /api/v1/positions` answers one row per symbol with active trades, sorted by symbol:

```json
{ "symbol": "AAPL", "currency": "USD", "netQuantity": 184100, "buyQuantity": 582300,
  "sellQuantity": 398200, "grossNotional": 222215816.74, "tradeCount": 196 }
```

Gross notional is in the instrument's own quote currency, so a London name reports pence and the
interface divides by a hundred to show pounds. There is no P&L: that needs a mark price and a
cost-basis convention, and the brief supplies neither.

## Authentication

Sign in with `POST /api/v1/auth/login` and a `{ "username", "password" }` body. The response
carries a short-lived access token (15 minutes) for the `Authorization` header and the signed-in
user; the long-lived refresh token goes into an httpOnly cookie scoped to `/api/v1/auth`, so no
script on the page can read the credential that matters and it never rides along with an
ordinary trade request.

Refresh rotates on every use. A refresh token is spent the moment it is exchanged. If a spent
token comes back, the entire session family is destroyed and both the thief and the legitimate
holder are signed out. The compare and the write are one Lua script in Redis.

Passwords are bcrypt at cost 12. A login for an account that does not exist is still compared
against a dummy hash, so response time does not reveal which usernames are real. Failures are
counted per account in Redis and lock it out after five, alongside the per-address rate limit.

The socket handshake verifies the same access token, passed as `auth: { token }`, and refuses
anyone without `trade.read` or from an origin outside `CORS_ORIGINS`.

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
(`SEED_USER_PASSWORD`, default `blotter-demo-2026`) rather than source.

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
`forbidden` 403, `not_found` 404, `conflict` 409, `rate_limited` 429.

## Real-time

Socket.IO emits `trade.created`, `trade.amended` and `trade.cancelled`, each carrying an envelope:

```json
{ "seq": 42, "emitted_at": "2026-09-12T03:19:47.881Z", "trade": { /* the whole trade */ } }
```

`seq` is monotonic for the life of the process, so a client that sees 41 then 43 knows it missed
one and refetches. The sequence restarts when the process does, and the client treats a decrease
the same way. The whole row travels rather than a patch. Clients send nothing: mutations go over
HTTP so they get the same validation, error handling and rate limiting as any other write.

## Audit trail

Every amendment and every cancellation writes a row to `trade_event` in the same transaction as
the change. Each row carries `action`, `source` (`API` or `LIVE_FEED`), `actor`, `version` and
the fields that moved with both sides:

```json
{ "quantity": { "from": 5000, "to": 7500 } }
```

The table is append-only, enforced by a database trigger that raises on `UPDATE` and `DELETE`.
Deleting a trade cascades to its events and is therefore also refused.

## Logging and metrics

One structured JSON line per request, carrying a correlation id taken from an incoming
`x-request-id` or generated, echoed on the response header and included in every error body.

`GET /metrics` exposes Prometheus text: `blotter_socket_clients_connected`,
`blotter_broadcasts_emitted_total`, and `blotter_broadcast_lag_seconds`, the distance between a
change committing and its broadcast leaving the server.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | none, required | Postgres connection string |
| `REDIS_URL` | none, required | Redis for sessions, lockouts and rate limits |
| `CORS_ORIGINS` | `http://localhost:3000` | Comma-separated origin allowlist for HTTP and the socket |
| `JWT_ACCESS_SECRET` | none, required | Signing key, refused under 32 characters |
| `JWT_REFRESH_SECRET` | none, required | Signing key, refused under 32 characters |
| `ACCESS_TOKEN_TTL_SECONDS` | `900` | Access token lifetime |
| `REFRESH_TOKEN_TTL_SECONDS` | `604800` | Refresh token lifetime |
| `SEED_ON_STARTUP` | `true` | Seed accounts and trades into an empty database |
| `SEED_TRADE_COUNT` | `500` | Trades generated on first start |
| `SEED_USER_PASSWORD` | `blotter-demo-2026` | Password given to the demo accounts |
| `LIVE_FEED_ENABLED` | `true` | Set false to silence the simulated desk while demonstrating manually |
| `LIVE_FEED_MIN_INTERVAL_MS` | `3000` | Shortest gap between simulated actions |
| `LIVE_FEED_MAX_INTERVAL_MS` | `8000` | Longest gap between simulated actions |
| `MAX_NOTIONAL_USD` | `50000000` | Desk notional ceiling for USD names |
| `MAX_NOTIONAL_GBX` | `4000000000` | Desk notional ceiling for GBX names, in pence |
| `AUTH_RATE_LIMIT` | `10` | Requests a minute on the credential endpoints, per address |
| `READ_RATE_LIMIT` | `300` | Reads a minute, per user |
| `WRITE_RATE_LIMIT` | `60` | Writes a minute, per user |
| `LOGIN_MAX_ATTEMPTS` | `5` | Failures before an account locks |
| `LOG_LEVEL` | `info` | pino level |
| `NEXT_PUBLIC_API_URL` | `http://localhost:5000` | Where the browser reaches the API; baked into the web build |
