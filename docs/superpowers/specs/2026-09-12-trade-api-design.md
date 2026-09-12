# Trade API design

**Date:** 2026-09-12
**Status:** approved, not yet implemented
**Branch:** `worktree-trade-api`

## Why this exists

`frontend/` is a bare `create-next-app` scaffold and `backend/src/app.ts` mounts only the health
router, so there is no trade API for a frontend to call. The request was to start the frontend; the
decision was to build the API first, because the brief scores frontend and backend interaction at
20% and a UI built against a mock cannot demonstrate it.

Every choice below was put to the repository owner as an explicit question with options and a
recommendation, per the `agent-never-decides` memory. The skill each option was checked against is
named with the decision.

## Decisions

| # | Decision | Chosen | Checked against |
|---|---|---|---|
| 1 | Build order | Backend trade API first, then the frontend against it | `testing-stance`, integration over mocks |
| 2 | API surface | Business id in the path, cancel as a named action | `ts-house-style`, Zod at every boundary |
| 3 | Scope | Audit trail, positions and P&L, virtualised grid, login, all in | brief's bonus list |
| 4 | Audit model | Rename `TradeAmendment` to `TradeEvent`, add action and source | closes audit D4 and D5 |
| 5 | Marks | In-memory random walk, broadcast, never persisted | closes audit D2 |
| 6 | Auth | Access plus rotated refresh, families in Postgres | `backend-security-baseline` |
| 7 | Positions | Server computes, client recomputes unrealised from marks | `project-structure-conventions` |
| 8 | Test datastore | The docker-compose Postgres, separate `blotter_test` database | `testing-stance` |
| 9 | Roles and permissions | None. Token presence is the only gate | `backend-security-baseline`, simplified knowingly |
| 10 | Guest access | None. Only `/health` and `/auth/login` are public | domain confidentiality, against the research's ranking |
| 11 | Registration | None. Six seeded desk accounts | a trader code is issued, never self-claimed |
| 12 | Trade ownership | Any authenticated trader may amend or cancel any trade | the audit trail records the actor |
| 13 | Account control | Password change only | deletion would break audit attribution |

Two deviations are deliberate and named rather than silent:

- **vitest, not Jest.** `testing-stance` says Jest, but `backend/package.json` already has vitest with
  two committed suites. The same skill says to read `package.json` before applying advice.
- **Postgres, not Redis, for refresh-token families and rate limiting.**
  `backend/src/middleware/rate_limit.ts:17` already records this trade-off for a single-container
  exercise. `docker-compose.yaml` has no Redis service and this design does not add one.

## Data model

Three changes to `backend/prisma/schema.prisma`. One migration.

### TradeAmendment becomes TradeEvent

```prisma
enum TradeEventAction { CREATE  AMEND  CANCEL  @@map("trade_event_action") }
enum TradeEventSource { UI  API  SEED           @@map("trade_event_source") }

model TradeEvent {
  id        String           @id @default(uuid()) @db.Uuid
  tradeUuid String           @map("trade_uuid") @db.Uuid
  version   Int
  action    TradeEventAction
  source    TradeEventSource
  changes   Json             @db.JsonB
  actor     String           @db.VarChar(32)
  createdAt DateTime         @default(now()) @map("created_at") @db.Timestamptz(3)

  trade Trade @relation(fields: [tradeUuid], references: [id], onDelete: Cascade)

  @@index([tradeUuid, version], map: "trade_event_trade_version_idx")
  @@index([createdAt(sort: Desc)], map: "trade_event_created_idx")
  @@map("trade_event")
}
```

`amendedBy` becomes `actor` and `amendedAt` becomes `createdAt`, because the row no longer describes
only amendments. A row is written on create, amend and cancel, inside the same transaction as the
change it records.

### Trader

Credentials need somewhere to live. `Trade.trader` is a free `VarChar(32)` today, which is fine for
a trade record but cannot hold a password.

```prisma
model Trader {
  id           String   @id @default(uuid()) @db.Uuid
  code         String   @unique @db.VarChar(32)
  displayName  String   @map("display_name") @db.VarChar(64)
  passwordHash String   @map("password_hash") @db.VarChar(97)
  createdAt    DateTime @default(now()) @map("created_at") @db.Timestamptz(3)

  @@map("trader")
}
```

`code` is the `JSMITH` form already used across the seed and the design. `Trade.trader` stays a
plain string rather than a foreign key, so a trade booked by a trader who is later removed keeps its
attribution, which is what an audit trail is for. The seed creates the six traders the generator
already picks from.

### Refresh token families

```prisma
model RefreshToken {
  id        String   @id @default(uuid()) @db.Uuid
  familyId  String   @map("family_id") @db.Uuid
  tokenHash String   @unique @map("token_hash") @db.VarChar(64)
  trader    String   @db.VarChar(32)
  expiresAt DateTime @map("expires_at") @db.Timestamptz(3)
  consumedAt DateTime? @map("consumed_at") @db.Timestamptz(3)
  revokedAt  DateTime? @map("revoked_at") @db.Timestamptz(3)
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(3)

  @@index([familyId], map: "refresh_token_family_idx")
  @@map("refresh_token")
}
```

Only the hash is stored. Presenting a token whose row is already `consumedAt` revokes every row in
that `familyId`, which is the replay detection the baseline requires.

### Trade

Unchanged. The committed `trade_schema` stays exactly as it is: two-valued status, `version` for
optimistic concurrency, no `cancel_reason` column. Cancellation reason was removed from the design
on 2026-09-11 and must not come back.

## API surface

All routes under `/api`. Every handler parses a schema from `@blotter/shared`; none defines its own
shape.

| Method | Path | Body | Success | Failure |
|---|---|---|---|---|
| GET | `/trades` | `trade_query_schema` as query | 200 `{ data, total, limit, offset }` | 400 |
| GET | `/trades/:trade_id` | | 200 `Trade` | 404 |
| POST | `/trades` | `create_trade_schema` | 201 `Trade` | 400 |
| PATCH | `/trades/:trade_id` | `amend_trade_schema` | 200 `Trade` | 400, 404, 409 |
| POST | `/trades/:trade_id/cancel` | `{ version }` | 200 `Trade` | 404, 409, 422 |
| GET | `/positions` | | 200 `Position[]` | |
| POST | `/auth/login` | `{ trader, password }` | 200 `{ access, refresh }` | 401 |
| POST | `/auth/refresh` | `{ refresh }` | 200 `{ access, refresh }` | 401 |
| POST | `/auth/logout` | `{ refresh }` | 204 | |
| POST | `/auth/password` | `{ current, next }` | 204 | 400, 401 |

Only `/health` and `/auth/login` are public. Every other route in this table, including
`GET /trades`, requires a valid access token.

The path parameter is `:trade_id` in snake_case per the global naming rule, and binds to the
`tradeId` field, which stays camelCase because `shared/src/schemas/trade.ts:20` documents that the
model mirrors the brief's own payload.

`trade_query_schema` gains two optional ISO datetime parameters, `from` and `to`, decided as C4 on
2026-09-12. They derive from the canonical schema rather than being hand-written, and the existing
`trade_status_timestamp_idx` already covers the range scan. There is no desk parameter: C5 dropped
that chip because no desk field exists and `book` is a different concept.

409 means the client sent a `version` that is no longer current. The response carries the current
version so the client can show what changed rather than guess. 422 on cancel means the trade is
already cancelled.

`status` is never client-settable. `create_trade_schema` omits it and `amend_trade_schema` derives
from that omission, so the server assigns it on both paths.

## Realtime

`trade_events` already declares `trade.created`, `trade.amended` and `trade.cancelled`. One event is
added to `shared/src/events/socket_events.ts`:

```ts
'mark.updated': (marks: Record<string, number>) => void;
```

The whole mark set goes in one payload rather than one event per symbol, because eight symbols on a
900ms interval is one small message and the client wants them applied together.

`ClientToServerEvents` stays empty. The committed file already explains why: mutations travel over
HTTP so they get the same validation, error handling and rate limiting, and the socket carries
broadcasts only.

A mutation broadcasts only after its transaction commits. Broadcasting inside the transaction would
show clients a trade that a later rollback erases.

## Marks and positions

`lib/marks/mark_feed.ts` holds a reference price per symbol, walks each on a 900ms interval and
broadcasts. Nothing is persisted, so a restart re-seeds from the reference price. Marks are
transient market data and a `symbol_mark` table would add a write loop for data nobody reads back.

`GET /positions` returns, per symbol, what trades alone can support:

```ts
{ symbol, netQty, avgPrice, realisedPnl, buyQty, sellQty, tradeCount }
```

Average cost basis. Realised P&L accrues when a trade closes against an opposing position.
Unrealised P&L is not in the payload: the client multiplies `(mark - avgPrice) * netQty` as each
`mark.updated` arrives, so a tick costs no HTTP call. The formula lives once in `shared/` and both
sides import it, which is what keeps the duplication honest.

## Auth

Settled 2026-09-12. Six decisions, all taken by the repository owner.

### No roles, no permissions

There is no `role` column, no `role` claim and no permission matrix. The only gate is whether a
request carries a valid access token. Authenticated means may read and may act; unauthenticated
means may do neither.

This is a genuine simplification rather than a shortcut past `backend-security-baseline`. That skill
asks for RBAC on coarse gates and PBAC for the actual decision because a system with several kinds
of user needs to distinguish them. This system has one kind. A permission matrix with a single row
in it is ceremony, and a `role` claim that is always `TRADER` carries no information. Every other
line of the baseline still applies in full.

### Everything is behind auth

The public list holds exactly two routes: `/health` and `/auth/login`. Nothing else, including
`GET /trades`, is readable without a token. Guests do not read the blotter.

The reason is domain correctness, not the rubric. A blotter carries counterparty names, sizes and
prices, which is precisely the data a firm does not publish, and no desk serves one to anonymous
readers. The MVP research does not make this argument: it ranks authentication 27th of 28 and scores
it 1.5 out of 10, and its stated reason every time is that the rubric has no security line. It cites
17 CFR 240.17a-3 and 17a-4 only for what a blotter is as a record and how long it is kept, which is
retention rather than access control. The confidentiality argument stands on its own and was the
owner's, taken with the research's contrary ranking in view.

The README publishes a working trader code and password, which is normal for a take-home and removes
the only real cost of locking the app down: a reviewer can still open it and watch it run.

### No registration

Accounts are the six trader codes the seed already uses, created with hashed passwords. There is no
sign-up endpoint and no sign-up button. A trader code is issued by the desk, never self-claimed, and
a "Sign up" control on a blotter reads as a misunderstanding of who uses one.

### Tokens

- Access token: 15 minutes, `{ sub: trader_code }`. No role claim.
- Refresh token: 7 days, rotated on every use, stored as a SHA-256 hash.
- Reuse of a consumed refresh token revokes the whole family.
- `middleware/require_auth.ts` is mounted before every router but the public two, so routes are
  protected by default. Never an opt-in allowlist of guarded routes.
- Login and password change each get a strict `express-rate-limit` tier, separate from the existing
  read and write tiers.
- Failures return one message. No distinction between an unknown trader and a wrong password.
- Passwords are hashed with argon2id.

### Trade ownership

Any authenticated trader may amend or cancel any trade, including one booked by someone else. This
is how a desk works, since trades are amended by whoever is covering, and it is the reason the audit
trail records an actor on every event. There is no ownership check in the repository layer, because
there is no ownership rule to enforce.

### Account control

Password change and nothing else. No profile edit, no deletion. Deleting a trader whose code is
stamped on historical trades would break attribution, which is the one thing an audit trail may
never do, and the brief's bonus asks only for simple login capability.

## Module layout

Follows `project-structure-conventions` and the pattern the repo already uses. Route handlers parse,
delegate and map; they hold no business rules.

```
backend/src/
  routes/        trade_routes.ts  position_routes.ts  auth_routes.ts
  services/      trade_service.ts  position_service.ts  auth_service.ts
  interfaces/    trade_repository.ts  trade_event_repository.ts
                 refresh_token_repository.ts
  repositories/  prisma_trade_repository.ts  prisma_trade_event_repository.ts
                 prisma_refresh_token_repository.ts
  realtime/      broadcast.ts
  lib/marks/     mark_feed.ts
  lib/auth/      tokens.ts  passwords.ts
  middleware/    require_auth.ts
```

Every file stays under the split thresholds: about 3 exported functions or 250 lines.

## Error handling

Reuses the committed `lib/errors/app_error.ts` and `middleware/error_handler.ts`. Two codes are
added: `version_conflict` for 409 and `invalid_transition` for 422. Responses carry a code and a
message and never a stack trace, per the baseline's closing check.

## Testing

vitest, colocated `<subject>.test.ts`, one test file per source file. Integration tier marked
`<subject>.integration.test.ts` so the cheap tier runs on every push.

| Change | Test |
|---|---|
| New repository method | Integration against `blotter_test`, not a mocked client |
| New service method with branching | One case per branch that can produce a wrong answer |
| New route | supertest: auth, happy path, one rejection |
| `require_auth` middleware | Unit, allow and deny |
| Position maths in `shared/` | Unit, including a position that flips long to short |
| New DTO or pass-through mapper | Nothing |

The integration tier needs the compose Postgres up and a migrated `blotter_test` database. The
script says so rather than failing with a connection error.

## Out of scope

- Redis, for either rate limiting or token storage.
- Registration, password reset, or any auth endpoint beyond login, refresh and logout.
- Persisted marks.
- A `cancel_reason` column. Removed from the design on purpose.
- `AMENDED` as a status. The enum stays two-valued and an amendment is a `version` increment.

## Frontend

Interface behaviour is specified separately in
[Interface behaviour design](2026-09-12-interface-behaviour-design.md), which records the decisions
taken against the MVP gap analysis: TanStack Table headless for the grid, the live-update and
connection-state behaviour, the ARIA grid and keyboard model, and the seven table states.

Still undecided and due their own questions once this API lands: the App Router layout, whether the
design system becomes its own workspace package, the TanStack Query and Zustand boundaries, and how
the prototype's token block is ported into `globals.css`.
