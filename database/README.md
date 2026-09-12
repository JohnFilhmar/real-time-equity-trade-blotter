# Database

PostgreSQL 17. The schema is owned by Prisma; the source of truth is
[`../backend/prisma/schema.prisma`](../backend/prisma/schema.prisma) and the migrations that build
it live under [`../backend/prisma/migrations/`](../backend/prisma/migrations/).

The migrations are hand-written rather than generated, so the trade-id sequence exists before the
table that depends on it, the append-only trigger is expressed in SQL, and `prisma migrate deploy`
is deterministic without a development database ever having existed. Compose runs them as a
one-shot service before the API starts.

| Migration | Adds |
|---|---|
| `20260910180000_init` | `trade`, `trade_id_seq`, the first indexes |
| `20260912020000_trade_events_currency_and_append_only` | `trade_event`, the `currency` column and enum, the append-only trigger |
| `20260912040000_add_users` | `app_user` and the role enum |
| `20260912070000_trade_event_occurred_idx` | The index the global event feed pages on |

## Tables

### `trade`

| Column | Type | Notes |
|---|---|---|
| `id` | `UUID` PK | Internal key, stable across amendments |
| `trade_id` | `VARCHAR(24)` unique | Business key, `TRD-100001`, from `trade_id_seq` |
| `symbol` | `VARCHAR(12)` | One of the twelve names in the shared instrument universe |
| `side` | `trade_side` enum | `BUY` or `SELL` |
| `quantity` | `INTEGER` | Positive |
| `price` | `DECIMAL(18,6)` | Never a float. In the instrument's own quote currency |
| `currency` | `currency` enum | `USD` or `GBX` (pence), derived from the symbol by the server |
| `trader` | `VARCHAR(32)` | Desk code from the access token. A plain string rather than a foreign key, so a trade keeps its attribution if the account goes |
| `book` | `VARCHAR(64)` | |
| `counterparty` | `VARCHAR(128)` | |
| `trade_timestamp` | `TIMESTAMPTZ(3)` | When the trade happened |
| `status` | `trade_status` enum | `ACTIVE` or `CANCELLED`, the only two the brief allows |
| `version` | `INTEGER` | Optimistic concurrency; incremented by every amendment and by the cancellation |
| `created_at`, `updated_at` | `TIMESTAMPTZ(3)` | When the row was written and last changed |

### `trade_event`

One row per amendment or cancellation, written in the same transaction as the change it
describes, so the audit trail cannot disagree with the trade. Booking is not an event: the trade
row itself records it.

| Column | Type | Notes |
|---|---|---|
| `id` | `UUID` PK | |
| `trade_uuid` | `UUID` FK | References `trade(id)`. Named `trade_uuid` because `trade_id` is the business key |
| `version` | `INTEGER` | The version this event produced |
| `action` | `trade_event_action` enum | `AMENDED` or `CANCELLED` |
| `source` | `trade_event_source` enum | `API` for a person, `LIVE_FEED` for the simulated desk |
| `changes` | `JSONB` | `{ "quantity": { "from": 5000, "to": 7500 } }`, changed fields only, both sides |
| `actor` | `VARCHAR(32)` | The trader code of whoever made the change |
| `occurred_at` | `TIMESTAMPTZ(3)` | |

The table is append-only, enforced by the trigger `trade_event_is_append_only`, which raises on
`UPDATE` and `DELETE` for every role including the one that runs migrations. Deleting a trade would
cascade into its events and is therefore refused as well.

### `app_user`

| Column | Type | Notes |
|---|---|---|
| `id` | `UUID` PK | |
| `username` | `VARCHAR(64)` unique | Sign-in name |
| `password_hash` | `VARCHAR(255)` | bcrypt, cost 12 |
| `display_name` | `VARCHAR(128)` | |
| `trader_code` | `VARCHAR(32)` | The desk code stamped on every trade this person books |
| `role` | `user_role` enum | `VIEWER`, `TRADER` or `ADMIN`; the shared package maps each to permissions |
| `created_at`, `updated_at` | `TIMESTAMPTZ(3)` | |

Named `app_user` because `user` is reserved in Postgres.

Sessions are not a table. Refresh-token families, login lockouts and rate-limit counters live in
Redis, without persistence, because losing them on a restart means everyone signs in again and
nothing else.

## Indexes

Chosen from the queries the blotter issues, not added by reflex.

| Index | Serves |
|---|---|
| `trade_status_timestamp_idx` on `(status, trade_timestamp DESC)` | The default view and the date-range filter |
| `trade_symbol_timestamp_idx` on `(symbol, trade_timestamp DESC)` | Symbol filter sorted by time |
| `trade_symbol_idx`, `trade_trader_idx`, `trade_book_idx` | Single-column filters |
| `trade_trade_id_key` (unique) | Lookup by business key |
| `trade_event_trade_version_idx` on `(trade_uuid, version)` | One trade's history |
| `trade_event_occurred_idx` on `(occurred_at DESC, id DESC)` | The global event feed, newest first, keyset-paged |
| `app_user_trader_code_idx` | Lookup by desk code |

The text filters match case-insensitive substrings, which forgoes the btree indexes on those
columns. That is acceptable at the dataset size the brief describes and is recorded as a trade-off
in the README.

## Identifiers

`trade_id_seq` starts at 100001 and produces `TRD-100001`, `TRD-100002` and so on, matching the
brief's sample data. It is a database sequence rather than a counter in application memory so the
values stay unique if the API is ever run as more than one process.

## Seed data

On start, if `trade` is empty, the API inserts 500 generated trades and four demo accounts.
Generation is seeded, so the dataset reproduces between runs. What makes it realistic is
documented in [`../backend/src/lib/seed/generate_trades.ts`](../backend/src/lib/seed/generate_trades.ts)
and asserted in its test. A simulated desk then keeps booking, amending and cancelling every three
to eight seconds.

Set `SEED_ON_STARTUP=false` to skip the seed, `SEED_TRADE_COUNT` to change the volume, and
`LIVE_FEED_ENABLED=false` to silence the desk.
