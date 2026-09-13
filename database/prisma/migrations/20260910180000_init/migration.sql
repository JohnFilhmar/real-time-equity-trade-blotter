-- CreateEnum
CREATE TYPE "trade_side" AS ENUM ('BUY', 'SELL');

-- CreateEnum
CREATE TYPE "trade_status" AS ENUM ('ACTIVE', 'CANCELLED');

-- CreateSequence
-- Business trade identifiers (TRD-100001) come from a sequence rather than an in-process counter,
-- so they stay unique if the API is ever run as more than one replica.
CREATE SEQUENCE "trade_id_seq" START WITH 100001 INCREMENT BY 1;

-- CreateTable
CREATE TABLE "trade" (
    "id" UUID NOT NULL,
    "trade_id" VARCHAR(24) NOT NULL,
    "symbol" VARCHAR(12) NOT NULL,
    "side" "trade_side" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "price" DECIMAL(18,6) NOT NULL,
    "trader" VARCHAR(32) NOT NULL,
    "book" VARCHAR(64) NOT NULL,
    "counterparty" VARCHAR(128) NOT NULL,
    "trade_timestamp" TIMESTAMPTZ(3) NOT NULL,
    "status" "trade_status" NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "trade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trade_amendment" (
    "id" UUID NOT NULL,
    "trade_uuid" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "changes" JSONB NOT NULL,
    "amended_by" VARCHAR(32) NOT NULL,
    "amended_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trade_amendment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "trade_trade_id_key" ON "trade"("trade_id");

-- CreateIndex
CREATE INDEX "trade_status_timestamp_idx" ON "trade"("status", "trade_timestamp" DESC);

-- CreateIndex
CREATE INDEX "trade_symbol_idx" ON "trade"("symbol");

-- CreateIndex
CREATE INDEX "trade_trader_idx" ON "trade"("trader");

-- CreateIndex
CREATE INDEX "trade_book_idx" ON "trade"("book");

-- CreateIndex
CREATE INDEX "trade_amendment_trade_version_idx" ON "trade_amendment"("trade_uuid", "version");

-- AddForeignKey
ALTER TABLE "trade_amendment" ADD CONSTRAINT "trade_amendment_trade_uuid_fkey" FOREIGN KEY ("trade_uuid") REFERENCES "trade"("id") ON DELETE CASCADE ON UPDATE CASCADE;
