-- CreateTable
CREATE TABLE "public"."strategy_apy" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "strategy_id" TEXT NOT NULL,
    "strategy_address" TEXT NOT NULL,
    "net_apy" DOUBLE PRECISION,
    "timestamp" INTEGER NOT NULL,
    "block_number" INTEGER,

    CONSTRAINT "strategy_apy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "strategy_apy_strategy_id_idx" ON "public"."strategy_apy"("strategy_id");

-- CreateIndex
CREATE INDEX "strategy_apy_timestamp_idx" ON "public"."strategy_apy"("timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "strategy_apy_strategy_id_timestamp_key" ON "public"."strategy_apy"("strategy_id", "timestamp");
