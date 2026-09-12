---
handoff_label: backend_server
session_id: UNKNOWN - not verified this session
agent: The backend server for the TP ICAP trade blotter. API, database, real time, authentication, Docker and CI. Does not own the interface.
working_dir: D:\My Folder\tp-icap-take-home-assessment
branch: worktree-blotter_phase_01
written: 2026-09-12 04:21 UTC
status: active
---

# Handoff: the blotter backend

**Written:** 2026-09-12 04:21 UTC
**Branch:** `worktree-blotter_phase_01`
**Last commit:** `45b8315 feat: add authentication, authorisation and session management`
**CI:** green. 221 tests.

This file lives in the repository, unusually, because it is being handed to a different agent as
their starting context rather than to a later session of the same one. Everything in it was
verified by running it, not recalled.

## Goal

Build the take-home exercise in `take-home-assessment.md`: a trade blotter with a React and
TypeScript interface, a TypeScript API, a database, real-time updates, and Docker. **The server is
finished. The interface has not been started.**

## The rule that governs this repository

**No agent decides anything about this system.** Every decision, a library, a schema, an endpoint
shape, a file layout, a trade-off, a scope cut, stops and goes to the repository owner as an
explicit question with options, saying for each whether it agrees with his skills in
`~/.claude/skills/` and his memory. Thirty-one decisions have been taken this way; none by an agent.

Carry this into any subagent you dispatch. It is recorded in the owner's memory as
`agent_never_decides` and it is not negotiable.

## What exists, and where

```
shared/          @blotter/shared. The contract both sides import.
  schemas/       trade, trade_event, auth, problem, broadcast. One canonical model each.
  reference/     instruments (the tradable universe), roles (permissions)
  events/        socket event names and payload types
backend/
  src/routes/    thin handlers: parse, call the service, answer
  src/services/  trade_service, auth_service. Every business rule lives here.
  src/repositories/  Prisma implementations, plus in-memory ones used by the tests
  src/interfaces/    the ports the services depend on
  src/middleware/    require_auth, rate_limit, error_handler
  src/lib/       auth, audit, paging, logging, metrics, seed, live_feed, mappers
  prisma/        schema and three hand-written migrations
frontend/        still `create-next-app`. Your work starts here.
```

## The API, as the interface will meet it

Base path `/api/v1`. Payloads are camelCase; query parameters are snake_case.

| Method | Path | Permission | Notes |
|---|---|---|---|
| `POST` | `/auth/login` | public | Returns access token plus user; sets the refresh cookie |
| `POST` | `/auth/refresh` | public | Rotates the cookie, returns a new access token |
| `GET` | `/auth/me` | authenticated | The user and their permissions |
| `POST` | `/auth/logout` | authenticated | 204, clears the cookie |
| `GET` | `/trades` | `trade.read` | Filtered, sorted, cursor-paged |
| `GET` | `/trades/:trade_id` | `trade.read` | One trade |
| `GET` | `/trades/:trade_id/events` | `trade.read` | History, oldest first |
| `POST` | `/trades` | `trade.create` | 201 |
| `PATCH` | `/trades/:trade_id` | `trade.amend` | Needs the version last seen |
| `POST` | `/trades/:trade_id/cancel` | `trade.cancel` | Optional version guard |

`/health`, `/ready` and `/metrics` sit outside the prefix and need no token.

**Everything under the prefix except login and refresh needs `Authorization: Bearer <token>`.** An
unauthenticated request to a path that does not exist answers 401, not 404, so the API cannot be
enumerated without credentials. If you get a 401 you did not expect, that is usually why.

Full request and response shapes are in the README's API section. Do not re-derive them from the
source; the README is current and was updated with the code.

## Nine things that will bite the interface if you do not know them

1. **A trade's `trader` is not on the create payload.** It comes from the access token. Sending one
   is ignored. This diverges from the brief's sample payload on purpose.
2. **An amendment may only change `quantity`, `price`, `counterparty` and `book`.** Symbol, side and
   the execution timestamp are refused, silently stripped by the schema. Re-pointing a trade at
   another instrument is a rebooking, not an amendment.
3. **Paging is a cursor, not an offset.** `GET /trades` answers
   `{ data, total, limit, next_cursor }`. `next_cursor` is `null` on the last page. There is no
   `offset` parameter. An unreadable cursor returns the first page rather than an error.
4. **Broadcasts are wrapped.** Socket events carry `{ seq, emitted_at, trade }`, not a bare trade.
   `seq` is monotonic per server process, so a client that sees 41 then 43 has missed one and should
   refetch. It restarts when the process does, so treat a decrease as a restart and resync.
5. **The socket handshake needs the access token**, passed as `auth: { token }` in the Socket.IO
   client options. A socket without one is refused. So is one from an origin outside
   `CORS_ORIGINS`.
6. **Prices are in the instrument's own currency**, and `currency` is on every trade. The London
   names are GBX, pence sterling: `VOD.L` prints around 78, `SHEL.L` around 2814. A price column
   that formats everything as dollars will be wrong for a third of the universe.
7. **Errors are RFC 9457 problem documents** on `application/problem+json`. Branch on the `code`
   extension member (`validation_failed`, `unauthenticated`, `forbidden`, `not_found`, `conflict`,
   `rate_limited`, `internal`), not on the `type` URI. Field-level detail is in `errors`.
8. **409 means the trade moved.** The message names the current version. The right response is a
   reload and a diff shown to the user, never an automatic retry, which would silently overwrite
   whatever the other person did.
9. **A trader may only amend or cancel their own trades.** Someone else's answers 403. An
   administrator may act on anyone's. `GET /auth/me` returns the permission list so the interface
   can hide what the person cannot do; the server re-checks regardless.

## Decisions already taken. Do not re-open these.

The owner chose every one of these. Options and costs were put to him each time.

- Keyset cursor paging, not offset.
- A wrapped broadcast envelope with `seq` and `emitted_at`.
- A `currency` field, with London names priced in GBX.
- Amendments narrowed to the four economic and booking fields.
- `trade_event` as the audit log, with `action` and `source`, recording before-and-after pairs, and
  no per-version snapshot.
- RFC 9457 problem+json for errors.
- The two-client broadcast test in the cheap tier, backed by the in-memory repository.
- The instrument universe as a shared constant rather than a database table.
- Future-date rejection, a per-currency notional ceiling, and a symbol allowlist.
- pino and pino-http for request logging.
- Append-only audit enforced by a database trigger rather than a role.
- A composite index, the socket Origin check, and the `/v1` prefix.
- Prometheus text format for metrics.
- A weekday-only seed and a trade-date range filter.
- Real authentication, to the full `backend-security-baseline` shape including Redis.
- bcrypt, `jsonwebtoken`, refresh families in Redis, three roles mapped to named permissions.
- `trader` from the token; access token in a header, refresh token in an httpOnly cookie.

Declined, and worth not re-proposing: a filter-values endpoint, a single free-text search
parameter, lint scripts for backend and shared, a dedicated rate-limit unit test.

## Decisions the owner has already made about your work

- **Grid:** TanStack Table, headless. Not AG Grid, not hand-rolled.
- **Server state:** TanStack Query, with socket events patching the cache through `setQueryData`
  rather than triggering a refetch.
- **P&L:** not real P&L. Notional by symbol, labelled notional, with one README line saying a real
  figure needs a mark price and a cost-basis convention and both are out of scope.
- **Authentication in the interface:** it is real and it is built. There is a login to wire up.

Everything else about the interface is unasked and therefore undecided. Ask.

## Verification state

Every line here was observed, not assumed.

- `npm test`: **PASS, 188** (30 shared + 158 backend), no skips.
- `npm run test:integration --workspace backend`: **PASS, 33**, run in CI against real Postgres and
  Redis. Not run locally.
- `npm run typecheck`: **PASS**. `npm run lint`: **PASS**, though see the gaps below.
- **CI: PASS**, every step, run 34672651572.
- **Docker: NOT RUN since 2026-09-11.** The engine was unreachable for this whole session:
  `open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified.`
  The stack has since gained a Redis service and a native build stage for bcrypt, neither of which
  has been built or run. **Run `docker compose up -d --wait` before anything else.** If bcrypt fails
  to compile in the Alpine image, the toolchain lines are at `backend/Dockerfile` in the `deps` and
  `prod-deps` stages.

## Gotchas that cost real time here

- **`tsconfig.json` excludes `src/**/*.test.ts`**, so `npm run typecheck` does not check test types
  at all. Tests can be type-broken and still appear clean. To check them, run tsc against a config
  that drops that exclude. This gap is open and was flagged, not fixed.
- **`exactOptionalPropertyTypes: true`.** You cannot pass `{ store: undefined }` to a library that
  types the property as required-if-present. Spread a conditional object instead.
- **Redis connects lazily** via `get_redis()` in `backend/src/db/redis_client.ts`. It used to
  connect at import time, which made every unit test need a live Redis to do nothing with.
- **The rate limiters are module-level singletons**, so their counters are shared across every test
  in a process. The limits are configuration (`AUTH_RATE_LIMIT`, `READ_RATE_LIMIT`,
  `WRITE_RATE_LIMIT`) and the test configs set them absurdly high for that reason.
- **The append-only trigger blocks the integration suite's own cleanup**, including the cascade from
  deleting a trade. The suite disables the trigger for the length of `afterAll` and re-enables it.
  Any new suite that writes trades must do the same.
- **A default parameter treats an explicit `undefined` as absent.** A test meaning "no token at all"
  has to pass `null`, not `undefined`. This cost a confusing failure.
- **`main` moves under you.** It advanced twice in one session. `docs/prompt_log/main_session.md`
  conflicts every time because several agents append to it; both sides are always additive, so keep
  both and sort by timestamp.
- Most files are CRLF. A text-replacement script must normalise first.

## Known gaps, flagged and deliberately not fixed

- `backend` and `shared` have no `lint` script, so the root lint command covers the frontend only.
- Test files are not typechecked.
- No FX normalisation, so notional ceilings are per currency.
- The seed skips weekends but not exchange holidays.
- Broadcast `seq` restarts with the process.
- Sessions live in Redis with no persistence, so a Redis restart signs everybody out.
- The demo accounts share a documented password, set by `SEED_USER_PASSWORD`. See the README.
- `npm audit` reports high-severity findings through the Prisma 7 toolchain, all build-time paths.

## Not started

1. **The blotter interface.** `socket.io-client`, `@tanstack/react-query` and
   `@tanstack/react-table` are not frontend dependencies yet.
2. **A Playwright pass.** The two-client broadcast test uses the same transport as a browser but is
   not one.
3. **Notional by symbol**, per the P&L decision above.
4. **`docs/ai_usage_report.md`** is unfinished.

## The design material already in the repository

`main` carries work from two other agents. Read it before designing anything:

- `docs/artifacts/mvp_requirements_and_gap_analysis.html` is the plan of record. Its interface
  sections are untouched and list eighteen interface musts with whether the design already answers
  them. It was built by reading code, not handoffs. Do not re-derive it.
- `docs/artifacts/fusion_blotter_prototype.html` is an 85KB working UI reference.
- `docs/artifacts/design_data_shape_conformance.html` is the design-versus-schema audit.
- `docs/superpowers/specs/` holds the trade API and interface behaviour specs.

The analysis names the interface gaps its own reference does not cover: no tick-arrow glyphs, so
direction is carried by colour alone; no `role="grid"`, `aria-sort` or `aria-live`; one keydown
handler in 85KB, so the grid is mouse-only. It rates that the weakest part of an otherwise strong
design, and the cheapest to fix.

## Resume here

1. Run `docker compose up -d --wait` and confirm four services come up healthy. Nothing has been
   run against the current compose file.
2. Sign in as `jsmith` and call `GET /api/v1/trades` with the token, to see the shape for yourself.
3. Read the interface sections of `docs/artifacts/mvp_requirements_and_gap_analysis.html`.
4. Ask the owner what to build and how, per the rule at the top of this file. He has decided the
   grid, the server-state library, the P&L treatment and that authentication is real. Everything
   else is yours to ask about, not to assume.

Types come from `@blotter/shared`: `Trade`, `TradeList`, `TradeEvent`, `BroadcastEnvelope`,
`Problem`, `AuthUser`, `AuthSession`, `Permission`, `instruments`, `ServerToClientEvents` and
`trade_events` are all published and current.
