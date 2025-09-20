-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "shared";

-- CreateTable
CREATE TABLE "shared"."raw_price_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "block_number" INTEGER NOT NULL,
    "tx_index" INTEGER NOT NULL DEFAULT 0,
    "event_index" INTEGER NOT NULL DEFAULT 0,
    "tx_hash" TEXT NOT NULL,
    "timestamp" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "publisher" TEXT NOT NULL,
    "price" DECIMAL(65,30) NOT NULL,
    "pair_id" TEXT NOT NULL,
    "volume" DECIMAL(65,30) NOT NULL,

    CONSTRAINT "raw_price_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shared"."prices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "asset" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "price_sum" DOUBLE PRECISION NOT NULL,
    "sources_count" INTEGER NOT NULL,
    "timestamp" INTEGER NOT NULL,
    "block_number" INTEGER NOT NULL,
    "_cursor" BIGINT,

    CONSTRAINT "prices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "raw_price_events_block_number_tx_index_event_index_key" ON "shared"."raw_price_events"("block_number", "tx_index", "event_index");

-- CreateIndex
CREATE UNIQUE INDEX "prices_asset_timestamp_key" ON "shared"."prices"("asset", "timestamp");
