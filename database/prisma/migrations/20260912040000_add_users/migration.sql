-- Users, so there is something to authenticate against.

-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('VIEWER', 'TRADER', 'ADMIN');

-- CreateTable
-- Named app_user because "user" is reserved in Postgres. Quoting a reserved word in every query
-- forever is a worse trade than one unusual table name.
CREATE TABLE "app_user" (
    "id" UUID NOT NULL,
    "username" VARCHAR(64) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "display_name" VARCHAR(128) NOT NULL,
    "trader_code" VARCHAR(32) NOT NULL,
    "role" "user_role" NOT NULL DEFAULT 'TRADER',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "app_user_pkey" PRIMARY KEY ("id")
);

-- Login looks a user up by username, so the lookup must be indexed and the column must be unique.
CREATE UNIQUE INDEX "app_user_username_key" ON "app_user"("username");

-- A trade's trader is a desk code rather than a foreign key, because trades outlive accounts and a
-- deleted user must not take their trades with them. This index is what makes the join possible
-- when someone does want to go from a trade back to the person.
CREATE INDEX "app_user_trader_code_idx" ON "app_user"("trader_code");
