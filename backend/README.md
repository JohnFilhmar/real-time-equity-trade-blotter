# backend

The blotter's API: Express 5 and Socket.IO over Prisma 7 and PostgreSQL 17, with Redis for
sessions, login lockouts and rate limits. It serves trades, positions and the audit trail over
HTTP, broadcasts every change to connected clients over a socket, and runs a simulated desk so the
blotter moves without anyone clicking. The whole stack is described in the
[repository README](../README.md).

## How it runs

Under compose, the `backend` service builds from `backend/Dockerfile` and starts with
`node dist/index.js`. It waits for the `database` and `redis` services to be healthy and for the
one-shot `migrate` service to exit 0. It has no published port. The web app's server forwards
`/api/*`, `/socket.io/`, `/health` and `/ready` to `http://backend:5000` on the internal network,
so the browser only ever talks to the web origin. `/metrics` is not forwarded. The container
healthcheck calls `/ready`, so it reports healthy only while the database answers.

On start the process seeds an empty database, listens on `PORT`, then starts the simulated desk
and the mark feed. `SIGTERM` and `SIGINT` stop both feeds and close the socket server, the HTTP
listener, Redis and the Prisma pool in that order. A shutdown that takes longer than
`SHUTDOWN_TIMEOUT_MS` exits with status 1.

To run it alone for development, from the repository root:

```bash
npm install
npm run dev:deps          # Postgres and Redis only, from compose
npm run db:migrate        # apply the migrations to DATABASE_URL
npm run dev:backend       # http://localhost:5000
```

`npm run dev:backend` builds the shared contract, generates the Prisma client and starts
`tsx watch`. Configuration comes from the `.env` at the repository root, which `src/config/env.ts`
loads by path. A variable already set in the environment wins over the file. The API needs at
least `DATABASE_URL`, `REDIS_URL`, `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`.

## Scripts

Run inside `backend/`, or from the root with `--workspace backend`.

| Script | Does |
|---|---|
| `npm run dev` | Builds `@blotter/shared`, generates the Prisma client, runs `src/index.ts` under `tsx watch` |
| `npm run build` | Generates the Prisma client, then compiles with `tsc` into `dist/` |
| `npm start` | Runs the compiled `dist/index.js` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | The unit and route tier with vitest, no database needed |
| `npm run test:watch` | The same tier in watch mode |
| `npm run test:integration` | The database and Redis tier, with `vitest.integration.config.ts` |
| `npm run prisma:generate` | `prisma generate` in `@blotter/database`, writing the client into `src/generated/prisma` |
| `npm run prisma:migrate` | `prisma migrate deploy` in `@blotter/database` |

## Source layout

```
src/index.ts                composition root: wiring, seed, listen, feeds, graceful shutdown
src/app.ts                  the Express app; the middleware order is the security model
src/config/                 env.ts, the zod-validated environment
src/db/                     the Prisma client and the lazily opened Redis client
src/generated/prisma/       the generated Prisma client, gitignored
src/interfaces/             ports: trade and user repositories, trade service, broadcaster, health probe
src/lib/audit/              the change set an amendment records
src/lib/auth/               bcrypt hashing, JWTs, the Redis refresh store and login lockout, in-memory twins
src/lib/errors/             AppError and the stable error codes
src/lib/http/               the HTTP server, created before Socket.IO attaches
src/lib/live_feed/          the simulated desk
src/lib/logging/            pino logger and the per-request logger with its correlation id
src/lib/mappers/            database rows to the published trade and event shapes
src/lib/marks/              simulated marks: an in-memory store and the feed that walks it
src/lib/metrics/            the prom-client registry and socket metrics
src/lib/paging/             opaque keyset cursors
src/lib/seed/               trade generation, the trade seed and the demo accounts
src/lib/testing/            build_test_app, an app over in-memory repositories for route tests
src/middleware/             require_auth, require_permission, rate limits, 404 and problem-document errors
src/realtime/               the Socket.IO server and the broadcaster behind the service
src/repositories/           Prisma and in-memory implementations of the ports, the Prisma health probe
src/routes/                 auth, health, metrics, position and trade routers
src/services/               auth_service, and trade_service with its pre-trade rules
src/types/                  the Express Request augmentation that carries the token claims
```

Route handlers parse input with the shared zod schemas and call a service. No handler touches
Prisma, and no business rule lives in a route.

## Configuration

Every variable is parsed once by `src/config/env.ts`. A missing or malformed value stops the boot
with a list of every problem, and the message never echoes a value.

| Variable | Default | Purpose |
|---|---|---|
| `NODE_ENV` | `development` | `development`, `test` or `production` |
| `PORT` | `5000` | Port the HTTP and socket server listens on |
| `DATABASE_URL` | required | Postgres connection string |
| `REDIS_URL` | required | Redis for refresh tokens, lockouts and rate-limit counters |
| `CORS_ORIGINS` | `http://localhost:3000` | Comma-separated origin allowlist, also checked on the socket handshake |
| `LOG_LEVEL` | `info` | pino level, or `silent` |
| `JWT_ACCESS_SECRET` | required | Access token signing key, at least 32 characters |
| `JWT_REFRESH_SECRET` | required | Refresh token signing key, at least 32 characters |
| `ACCESS_TOKEN_TTL_SECONDS` | `900` | Access token lifetime, at most 3600 |
| `REFRESH_TOKEN_TTL_SECONDS` | `604800` | Refresh token and cookie lifetime |
| `BCRYPT_ROUNDS` | `12` | bcrypt cost, from 10 to 15 |
| `COOKIE_SECURE` | `false` | Adds `Secure` to the refresh cookie; always on under `NODE_ENV=production` |
| `AUTH_RATE_LIMIT` | `10` | Requests a minute on login and refresh, per address |
| `READ_RATE_LIMIT` | `300` | Requests a minute behind the auth guard, per user |
| `WRITE_RATE_LIMIT` | `60` | Requests a minute on create, amend and cancel, per user |
| `LOGIN_MAX_ATTEMPTS` | `5` | Failed logins before an account locks, at most 100 |
| `LOGIN_LOCKOUT_SECONDS` | `900` | Lockout window; every further failure re-arms it |
| `SEED_ON_STARTUP` | `true` | Seed demo accounts and trades into empty tables |
| `SEED_USER_PASSWORD` | `blotter-demo-2026` | Password for the demo accounts, at least 8 characters |
| `SEED_TRADE_COUNT` | `500` | Trades generated into an empty table, from 0 to 5000 |
| `LIVE_FEED_ENABLED` | `true` | Runs the simulated desk and the mark feed |
| `LIVE_FEED_MIN_INTERVAL_MS` | `3000` | Shortest gap between simulated actions, from 250 to 600000 |
| `LIVE_FEED_MAX_INTERVAL_MS` | `8000` | Longest gap, same bounds; an inverted pair is sorted rather than refused |
| `LIVE_FEED_MAX_ACTIVE_TRADES` | `2000` | Soft size the simulated desk keeps its active book near |
| `MAX_NOTIONAL_USD` | `50000000` | Notional ceiling for USD names |
| `MAX_NOTIONAL_GBX` | `4000000000` | Notional ceiling for GBX names, in pence |
| `SHUTDOWN_TIMEOUT_MS` | `10000` | Time allowed for a graceful shutdown before a forced exit |

Compose sets its own development values for the required variables, so the stack runs with no
`.env`. See the `backend` service in `docker-compose.yaml` for which ones it sets.

## HTTP and socket surface

Resources live under `/api/v1`: login, refresh, me and logout under `/auth`, the trade list, one
trade, its history, the global audit feed, create, amend and cancel under `/trades`, and net
positions under `/positions`. Every failure is an RFC 9457 problem document with a stable `code`.
`/health` reports the process is up, `/ready` answers 503 when the database is down, and
`/metrics` serves Prometheus text. All three sit outside the prefix.

The socket shares the HTTP port. The handshake needs an allowed origin and an access token with
`trade.read`, passed as `auth: { token }` or a bearer header. Clients send nothing. The server
emits `trade.created`, `trade.amended`, `trade.cancelled`, `trade_event.recorded` and
`position.updated` inside a sequenced envelope, and a bare `mark.updated` snapshot every 900ms and
once on connect.

Paths, payloads, filters, paging and error codes are in
[`docs/api_reference.md`](../docs/api_reference.md).

## Auth, roles and rate limits

Login returns a short-lived access token for the `Authorization` header. The refresh token goes
into the httpOnly `blotter_refresh` cookie, scoped to `/api/v1/auth`. Refresh rotates on every
use, and a replayed token destroys its whole session family in Redis.

`require_auth` is mounted across `/api/v1` with only login and refresh above it, so any route added
later is protected by default. Routes then require a permission, never a role:

| Role | Permissions |
|---|---|
| `VIEWER` | `trade.read` |
| `TRADER` | `trade.read`, `trade.create`, `trade.amend`, `trade.cancel` |
| `ADMIN` | all of the above, plus `trade.amend.any` and `trade.cancel.any` |

The ownership check depends on the row, so it lives in the trade service: a trader acting on
another trader's trade gets a 403. The trader code on a new trade comes from the token, not the
body.

Three limiters in `src/middleware/rate_limit.ts` count in Redis over a one-minute window. The auth
limiter keys by address. The read and write limiters key by user once the token is verified.
Failed logins are also counted per account in `src/lib/auth/login_attempts.ts`. Under
`NODE_ENV=test` the limiters use the library's in-process store.

## The simulated desk and the seed

With `SEED_ON_STARTUP` on, `src/lib/seed/` creates four demo accounts if `app_user` is empty, then
`SEED_TRADE_COUNT` generated trades if `trade` is empty. Trade ids come from the Postgres
`trade_id_seq` sequence. The accounts are `jsmith` and `abrown` as traders, `mjones` as admin and
`viewer` as read only, all with `SEED_USER_PASSWORD`.

`src/lib/live_feed/` books, amends and cancels at a jittered interval between the two
`LIVE_FEED_*_INTERVAL_MS` bounds. It writes through the trade service, so a simulated trade gets
the same validation, audit row and broadcast as a user's, recorded with source `LIVE_FEED`. As the
active book nears `LIVE_FEED_MAX_ACTIVE_TRADES` it cancels more often than it books, and each new
ticket leans against its symbol's net position. A conflict with a user's edit is swallowed. Any
other error is logged and the loop carries on. `src/lib/marks/` walks each symbol's mark from its
reference price and broadcasts the set.

The seed and the generator are covered in more depth in
[`database/README.md`](../database/README.md#seed-strategy).

## Tests

Tests sit beside the code they cover. Files ending `.test.ts` form the unit tier, and files ending
`.integration.test.ts` form the integration tier.

**Unit tier.** `npm test` runs service, route, auth, feed, mapper and paging suites. Route tests
drive the real Express app over in-memory repositories through `build_test_app`.
`src/realtime/socket_broadcast.test.ts` boots the HTTP server and Socket.IO, connects two clients
and checks a trade created by one reaches the other. `vitest.config.ts` supplies its own
environment, so no `.env`, Postgres or Redis is needed.

**Integration tier.** Covers the Prisma trade repository, including the append-only trigger, and
the Redis refresh store and login lockout. It needs a migrated Postgres and a running Redis. The
suites read `TEST_DATABASE_URL` and `TEST_REDIS_URL`, and skip when those are unset. Files run one
at a time. From the repository root:

```bash
npm run dev:deps
npm run db:migrate
npm run test:integration
```

The root script points both variables at the compose services on `localhost` unless they are
already set. Running `npm run test:integration` inside `backend/` does not set them.

## Related

- [Repository README](../README.md): architecture decisions, installation, the full test table
- [`docs/api_reference.md`](../docs/api_reference.md): endpoints, payloads, errors, events, metrics
- [`database/README.md`](../database/README.md): schema, indexes, migrations, the append-only trigger
- [`frontend/README.md`](../frontend/README.md): the web app that forwards to this service
