# backend

The blotter's API. Express 5 and Socket.IO over Prisma 7 and PostgreSQL 17, with Redis for sessions,
login lockouts and rate limits. It serves trades, positions and the audit trail over HTTP, broadcasts
every change to connected clients over a socket, and runs a simulated desk so the blotter moves
without anyone clicking.

The whole stack is described in the [repository README](../README.md).

## How it runs

Under compose the `backend` service builds from `backend/Dockerfile` and starts `node dist/index.js`.
It waits for `database` and `redis` to be healthy and for the one-shot `migrate` service to exit 0.
It has no published port: the web app's server forwards `/api/*`, `/socket.io/`, `/health` and
`/ready` to `http://backend:5000` on the internal network. `/metrics` is not forwarded. The container
healthcheck calls `/ready`, so it reports healthy only while the database answers.

On start the process seeds an empty database, listens on `PORT`, then starts the simulated desk and
the mark feed. On `SIGTERM` or `SIGINT` it stops both feeds and closes the socket server, the HTTP
listener, Redis and the Prisma pool in that order, forcing an exit after `SHUTDOWN_TIMEOUT_MS`.

To run it alone, from the repository root:

```bash
npm install
npm run dev:deps          # Postgres and Redis only, from compose
npm run db:migrate
npm run dev:backend       # http://localhost:5000
```

`npm run dev:backend` builds the shared contract, generates the Prisma client and starts `tsx watch`.
Configuration comes from the root `.env`, and a variable already set in the environment wins over
the file.

## Source layout

```
src/index.ts          composition root: wiring, seed, listen, feeds, graceful shutdown
src/app.ts            the Express app; the middleware order is the security model
src/config/           env.ts, the zod-validated environment
src/db/               the Prisma client and the lazily opened Redis client
src/interfaces/       ports: trade and user repositories, trade service, broadcaster, health probe
src/repositories/     Prisma and in-memory implementations of those ports
src/routes/           auth, health, metrics, position and trade routers
src/services/         auth_service, and trade_service with its pre-trade rules
src/middleware/       require_auth, require_permission, rate limits, problem-document errors
src/realtime/         the Socket.IO server and the broadcaster behind the service
src/lib/auth/         bcrypt hashing, JWTs, the Redis refresh store and login lockout
src/lib/audit/        the change set an amendment records
src/lib/live_feed/    the simulated desk
src/lib/marks/        simulated marks: an in-memory store and the feed that walks it
src/lib/paging/       opaque keyset cursors
src/lib/seed/         trade generation, the trade seed and the demo accounts
src/lib/mappers/      database rows to the published trade and event shapes
src/lib/errors/       AppError and the stable error codes
src/lib/http/         the HTTP server, created before Socket.IO attaches
src/lib/logging/      pino logger and the per-request logger with its correlation id
src/lib/metrics/      the prom-client registry and socket metrics
src/lib/testing/      build_test_app, an app over in-memory repositories for route tests
```

One rule holds the shape together: a route parses input with the shared zod schemas and calls a
service. No handler touches Prisma, and no business rule lives in a route.

## HTTP and socket surface

Resources live under `/api/v1`. Login, refresh, me and logout under `/auth`. The trade list, one
trade, its history, the global audit feed, create, amend and cancel under `/trades`. Net positions
under `/positions`. Every failure is an RFC 9457 problem document with a stable `code`.

`/health`, `/ready` and `/metrics` sit outside the prefix. `/ready` answers 503 when the database is
down.

The socket shares the HTTP port. The handshake needs an allowed origin and an access token carrying
`trade.read`. Clients send nothing. The server emits `trade.created`, `trade.amended`,
`trade.cancelled`, `trade_event.recorded` and `position.updated` inside a sequenced envelope, so a
client can detect a gap, plus a `mark.updated` snapshot every 900ms and once on connect.

Paths, payloads, filters, paging and error codes are in
[`docs/api_reference.md`](../docs/api_reference.md).

## Auth, roles and rate limits

Login returns a short-lived access token for the `Authorization` header. The refresh token goes into
the httpOnly `blotter_refresh` cookie, scoped to `/api/v1/auth`. Refresh rotates on every use, and a
replayed token destroys its whole session family in Redis.

`require_auth` is mounted across `/api/v1` with only login and refresh above it, so any route added
later is protected by default. Routes then require a permission, never a role:

| Role | Permissions |
|---|---|
| `VIEWER` | `trade.read` |
| `TRADER` | `trade.read`, `trade.create`, `trade.amend`, `trade.cancel` |
| `ADMIN` | the above, plus `trade.amend.any` and `trade.cancel.any` |

The ownership check depends on the row, so it lives in the trade service: a trader acting on another
trader's trade gets a 403. The trader code on a new trade comes from the token, not the body.

Three limiters in `src/middleware/rate_limit.ts` count in Redis over a one-minute window. The auth
limiter keys by address; the read and write limiters key by user once the token is verified. Failed
logins are counted per account in `src/lib/auth/login_attempts.ts`. The attempt that reaches
`LOGIN_MAX_ATTEMPTS` is itself answered with 429, code `locked_out` and a `Retry-After` header, as is
every attempt until the lock expires. The auth limiter's own 429 carries code `rate_limited`, which
is how the sign-in form tells a locked account from a busy address.

## Configuration

`src/config/env.ts` parses every variable once. A missing or malformed value stops the boot with a
list of every problem, and the message never echoes a value. Compose sets development values for the
required ones, so the stack runs with no `.env`.

The variables worth knowing while reviewing:

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | required | Postgres connection string |
| `REDIS_URL` | required | Refresh tokens, lockouts and rate-limit counters |
| `JWT_ACCESS_SECRET` | required | Access token key, at least 32 characters |
| `JWT_REFRESH_SECRET` | required | Refresh token key, at least 32 characters |
| `CORS_ORIGINS` | `http://localhost:3000` | Origin allowlist, also checked on the socket handshake |
| `BCRYPT_ROUNDS` | `12` | bcrypt cost, 10 to 15 |
| `LOGIN_MAX_ATTEMPTS` | `5` | Failed logins that lock an account |
| `LOGIN_LOCKOUT_SECONDS` | `900` | Lockout window; a further failure re-arms it |
| `SEED_ON_STARTUP` | `true` | Seed demo accounts and trades into empty tables |
| `SEED_TRADE_COUNT` | `500` | Trades generated into an empty table |
| `LIVE_FEED_ENABLED` | `true` | Runs the simulated desk and the mark feed |
| `LIVE_FEED_MIN_INTERVAL_MS` | `3000` | Shortest gap between simulated actions, floor 250 |
| `LIVE_FEED_MAX_INTERVAL_MS` | `8000` | Longest gap; an inverted pair is sorted rather than refused |
| `MAX_NOTIONAL_USD` | `50000000` | Notional ceiling for USD names |
| `MAX_NOTIONAL_GBX` | `4000000000` | Notional ceiling for GBX names, in pence |

The remaining variables, including the token lifetimes, the three rate limits, logging and the
shutdown timeout, are listed in [`docs/api_reference.md`](../docs/api_reference.md).

## The seed and the simulated desk

With `SEED_ON_STARTUP` on, `src/lib/seed/` creates the four demo accounts if `app_user` is empty,
then `SEED_TRADE_COUNT` generated trades if `trade` is empty. Trade ids come from the Postgres
`trade_id_seq` sequence rather than a counter in memory. The accounts are `jsmith` and `abrown` as
traders, `mjones` as admin and `viewer` as read only, all with `SEED_USER_PASSWORD`.

Seeding only ever fills an empty table. It will not reset a password or overwrite trades that
already exist, so a changed `SEED_USER_PASSWORD` reaches a new database and not an existing one. The
skip is logged.

`src/lib/live_feed/` books, amends and cancels at a jittered interval between the two
`LIVE_FEED_*_INTERVAL_MS` bounds. It writes through the trade service, so a simulated trade gets the
same validation, audit row and broadcast as a user's, recorded with source `LIVE_FEED`. It keeps the
active book near `LIVE_FEED_MAX_ACTIVE_TRADES` and leans each ticket against its symbol's net
position, so the book stays near flat. A conflict with a user's edit is swallowed; any other error is
logged and the loop carries on. `src/lib/marks/` walks each symbol's mark from its reference price
and broadcasts the set.

Generation detail is in
[`database/README.md`](../database/README.md#seed-strategy).

## Tests

Tests sit beside the code they cover. `.test.ts` is the unit tier, `.integration.test.ts` the
integration tier.

**Unit tier,** `npm test`. Service, route, auth, feed, mapper and paging suites. Route tests drive
the real Express app over in-memory repositories through `build_test_app`.
`src/realtime/socket_broadcast.test.ts` boots the HTTP server and Socket.IO, connects two clients and
checks a trade created by one reaches the other. `vitest.config.ts` supplies its own environment, so
no `.env`, Postgres or Redis is needed.

**Integration tier,** `npm run test:integration` from the root. Covers the Prisma trade repository
including the append-only trigger, and the Redis refresh store and login lockout. It needs a migrated
Postgres and a running Redis, reads `TEST_DATABASE_URL` and `TEST_REDIS_URL`, skips when those are
unset, and runs one file at a time. The root script points both at the compose services unless they
are already set; running it inside `backend/` does not.

## Related

- [Repository README](../README.md): architecture decisions, installation, the full test table
- [`docs/api_reference.md`](../docs/api_reference.md): endpoints, payloads, errors, events, metrics
- [`database/README.md`](../database/README.md): schema, indexes, migrations, the append-only trigger
- [`shared/README.md`](../shared/README.md): the contract this service validates against
