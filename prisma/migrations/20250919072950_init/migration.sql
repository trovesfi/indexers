-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "airfoil";

-- CreateTable
CREATE TABLE "public"."investment_flows" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "block_number" INTEGER NOT NULL,
    "tx_index" INTEGER NOT NULL DEFAULT 0,
    "event_index" INTEGER NOT NULL DEFAULT 0,
    "tx_hash" TEXT NOT NULL,
    "sender" TEXT NOT NULL,
    "receiver" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "shares" TEXT NOT NULL,
    "asset" TEXT NOT NULL,
    "contract" TEXT NOT NULL,
    "epoch" INTEGER NOT NULL DEFAULT 0,
    "request_id" INTEGER NOT NULL DEFAULT 0,
    "type" TEXT NOT NULL,
    "timestamp" INTEGER NOT NULL,
    "_cursor" BIGINT,

    CONSTRAINT "investment_flows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."harvests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "block_number" INTEGER NOT NULL,
    "tx_index" INTEGER NOT NULL DEFAULT 0,
    "event_index" INTEGER NOT NULL DEFAULT 0,
    "tx_hash" TEXT NOT NULL,
    "user" TEXT NOT NULL,
    "contract" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "timestamp" INTEGER NOT NULL,
    "_cursor" BIGINT,

    CONSTRAINT "harvests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."position_fees_collected" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "block_number" INTEGER NOT NULL,
    "tx_index" INTEGER NOT NULL DEFAULT 0,
    "event_index" INTEGER NOT NULL DEFAULT 0,
    "tx_hash" TEXT NOT NULL,
    "token0" TEXT NOT NULL,
    "token1" TEXT NOT NULL,
    "amount0" TEXT NOT NULL,
    "amount1" TEXT NOT NULL,
    "vault_address" TEXT NOT NULL,
    "timestamp" INTEGER NOT NULL,
    "_cursor" BIGINT,

    CONSTRAINT "position_fees_collected_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."position_updated" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "block_number" INTEGER NOT NULL,
    "tx_index" INTEGER NOT NULL DEFAULT 0,
    "event_index" INTEGER NOT NULL DEFAULT 0,
    "tx_hash" TEXT NOT NULL,
    "locker" TEXT NOT NULL,
    "token0" TEXT NOT NULL,
    "token1" TEXT NOT NULL,
    "fee" TEXT NOT NULL,
    "tick_spacing" TEXT NOT NULL,
    "extension" TEXT NOT NULL,
    "salt" TEXT NOT NULL,
    "lower_bound" TEXT NOT NULL,
    "upper_bound" TEXT NOT NULL,
    "liquidity_delta" TEXT NOT NULL,
    "amount0" TEXT NOT NULL,
    "amount1" TEXT NOT NULL,
    "vault_address" TEXT NOT NULL,
    "user_address" TEXT NOT NULL,
    "timestamp" INTEGER NOT NULL,
    "_cursor" BIGINT,

    CONSTRAINT "position_updated_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "investment_flows_block_number_tx_index_event_index_key" ON "public"."investment_flows"("block_number", "tx_index", "event_index");

-- CreateIndex
CREATE UNIQUE INDEX "harvests_block_number_tx_index_event_index_key" ON "public"."harvests"("block_number", "tx_index", "event_index");

-- CreateIndex
CREATE UNIQUE INDEX "position_fees_collected_block_number_tx_index_event_index_key" ON "public"."position_fees_collected"("block_number", "tx_index", "event_index");

-- CreateIndex
CREATE UNIQUE INDEX "position_updated_block_number_tx_index_event_index_key" ON "public"."position_updated"("block_number", "tx_index", "event_index");
