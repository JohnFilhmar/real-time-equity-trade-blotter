-- Currency, the trade_event audit table, a composite index, and append-only enforcement.
--
-- Written by hand rather than generated, so the data corrections below are explicit and the
-- append-only trigger exists at all. Prisma's generator has no way to express either.

-- CreateEnum
CREATE TYPE "currency" AS ENUM ('USD', 'GBX');
CREATE TYPE "trade_event_action" AS ENUM ('AMENDED', 'CANCELLED');
CREATE TYPE "trade_event_source" AS ENUM ('API', 'LIVE_FEED');

-- Currency on the trade.
-- Backfilled from the ticker: a `.L` suffix is a London listing, which the LSE quotes in pence.
-- The default is temporary, only so existing rows can be made NOT NULL, and is dropped below so
-- the application must state the currency rather than inherit one silently.
ALTER TABLE "trade" ADD COLUMN "currency" "currency" NOT NULL DEFAULT 'USD';
UPDATE "trade" SET "currency" = 'GBX' WHERE "symbol" LIKE '%.L';

-- Existing London rows were priced in pounds by an earlier seed, against a market that quotes in
-- pence, so VOD.L read as 0.78 where a real blotter shows 78. Correct them once, here.
UPDATE "trade" SET "price" = "price" * 100 WHERE "currency" = 'GBX';

ALTER TABLE "trade" ALTER COLUMN "currency" DROP DEFAULT;

-- Filtering by symbol and sorting by time is the blotter's most common query. The single-column
-- symbol index made that a filter then a sort; this one serves both.
CREATE INDEX "trade_symbol_timestamp_idx" ON "trade"("symbol", "trade_timestamp" DESC);

-- The audit table becomes a trade event log.
-- It already recorded amendments; a cancellation is the same kind of fact, and an audit trail that
-- records amendments but not cancellations cannot answer who cancelled a trade. Renaming rather
-- than creating a new table keeps the existing rows.
ALTER TABLE "trade_amendment" RENAME TO "trade_event";
ALTER TABLE "trade_event" RENAME COLUMN "amended_by" TO "actor";
ALTER TABLE "trade_event" RENAME COLUMN "amended_at" TO "occurred_at";

ALTER INDEX "trade_amendment_trade_version_idx" RENAME TO "trade_event_trade_version_idx";
ALTER TABLE "trade_event" RENAME CONSTRAINT "trade_amendment_pkey" TO "trade_event_pkey";
ALTER TABLE "trade_event" RENAME CONSTRAINT "trade_amendment_trade_uuid_fkey" TO "trade_event_trade_uuid_fkey";

-- Every row that existed before this migration was an amendment made through the API.
ALTER TABLE "trade_event" ADD COLUMN "action" "trade_event_action" NOT NULL DEFAULT 'AMENDED';
ALTER TABLE "trade_event" ADD COLUMN "source" "trade_event_source" NOT NULL DEFAULT 'API';
ALTER TABLE "trade_event" ALTER COLUMN "action" DROP DEFAULT;
ALTER TABLE "trade_event" ALTER COLUMN "source" DROP DEFAULT;

-- Append-only, enforced rather than documented.
--
-- A trigger rather than a least-privilege role: it holds whichever role connects, including the
-- one that runs migrations, and it needs no second connection string. The exception surfaces as a
-- database error, so an accidental UPDATE fails loudly instead of quietly rewriting history.
--
-- Deleting a trade cascades to its events and is therefore also refused, which matches the rule
-- that a trade is never hard deleted: cancelling is a status transition.
CREATE OR REPLACE FUNCTION trade_event_is_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'trade_event is append-only, % is not permitted', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trade_event_append_only
  BEFORE UPDATE OR DELETE ON "trade_event"
  FOR EACH ROW EXECUTE FUNCTION trade_event_is_append_only();
