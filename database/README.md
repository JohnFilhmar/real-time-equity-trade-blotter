# Database

PostgreSQL 17. Schema owned by Prisma; the source of truth is
[`../backend/prisma/schema.prisma`](../backend/prisma/schema.prisma) and the migration that
creates it is [`../backend/prisma/migrations/`](../backend/prisma/migrations/).

The migration is hand-authored rather than generated, so the trade-id sequence is created before
the table that depends on it, and so `prisma migrate deploy` is deterministic without a
development database ever having existed.

## Tables

### `trade`

| Column | Type | Notes |
|---|---|---|
| `id` | `UUID` PK | Internal key. Stable across amendments. |
| `trade_id` | `VARCHAR(24)` unique | Business key, `TRD-100001`, from the `trade_id_seq` sequence. |
| `symbol` | `VARCHAR(12)` | Indexed. |
| `side` | `trade_side` enum | `BUY` or `SELL`. |
| `quantity` | `INTEGER` | Positive. Round lots in seeded data. |
| `price` | `DECIMAL(18,6)` | Never a float. Six places leaves room for pence-denominated lines. |
| `trader` | `VARCHAR(32)` | Indexed. Desk code, not a user account. |
| `book` | `VARCHAR(64)` | Indexed. Free text, because books are data rather than code. |
| `counterparty` | `VARCHAR(128)` | |
| `trade_timestamp` | `TIMESTAMPTZ(3)` | When the trade happened. |
| `status` | `trade_status` enum | `ACTIVE` or `CANCELLED`, the only two the brief allows. |
| `version` | `INTEGER` | Optimistic concurrency. Incremented on every amendment. |
| `created_at` | `TIMESTAMPTZ(3)` | When the row was written. |
| `updated_at` | `TIMESTAMPTZ(3)` | |

### `trade_amendment`

One row per amendment, written in the same transaction as the update it describes, so an audit
trail cannot drift from the trade it belongs to.

| Column | Type | Notes |
|---|---|---|
| `id` | `UUID` PK | |
| `trade_uuid` | `UUID` FK | References `trade(id)`, cascading on delete. |
| `version` | `INTEGER` | The version this amendment produced. |
| `changes` | `JSONB` | Before and after, for the changed fields only. |
| `amended_by` | `VARCHAR(32)` | |
| `amended_at` | `TIMESTAMPTZ(3)` | |

The foreign key is named `trade_uuid` rather than `trade_id` on purpose: `trade.trade_id` is
already the business key, and reusing the name for a UUID foreign key is how the two get confused.

## Indexes

Chosen from the queries the blotter actually issues, not added by reflex.

| Index | Serves |
|---|---|
| `trade_status_timestamp_idx` on `(status, trade_timestamp DESC)` | The default view: active trades, newest first |
| `trade_symbol_idx` | Symbol filter |
| `trade_trader_idx` | Trader filter |
| `trade_book_idx` | Book filter |
| `trade_trade_id_key` (unique) | Lookup by business key |
| `trade_amendment_trade_version_idx` on `(trade_uuid, version)` | Audit history for one trade |

## Identifiers

`trade_id_seq` starts at 100001 and produces `TRD-100001`, `TRD-100002` and so on, matching the
brief's sample data. It is a database sequence rather than a counter in application memory so the
values stay unique if the API is ever run as more than one process.

## Seed data

On start, if `trade` is empty, the API inserts 500 generated trades. Generation is seeded, so the
dataset reproduces exactly between runs. What makes it realistic rather than merely random is
documented in [`../backend/src/lib/seed/generate_trades.ts`](../backend/src/lib/seed/generate_trades.ts)
and asserted in its test.

Set `SEED_ON_STARTUP=false` to skip it, or `SEED_TRADE_COUNT` to change the volume.
