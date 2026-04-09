-- Vesu multiply lever + Ekubo Swapped (vault ops enrichment)

CREATE TABLE "public"."vesu_extended_multiply_lever" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "block_number" INTEGER NOT NULL,
    "tx_index" INTEGER NOT NULL,
    "event_index" INTEGER NOT NULL,
    "tx_hash" TEXT NOT NULL,
    "strategy_id" TEXT NOT NULL,
    "lever_kind" TEXT NOT NULL,
    "pool_id" TEXT NOT NULL,
    "collateral_asset" TEXT NOT NULL,
    "debt_asset" TEXT NOT NULL,
    "user_address" TEXT NOT NULL,
    "margin" TEXT NOT NULL,
    "collateral_delta" TEXT NOT NULL,
    "debt_delta" TEXT NOT NULL,
    "timestamp" INTEGER NOT NULL,
    "_cursor" BIGINT,
    CONSTRAINT "vesu_extended_multiply_lever_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "vesu_ext_multiply_lever_event_id" ON "public"."vesu_extended_multiply_lever"("block_number", "tx_index", "event_index");

CREATE TABLE "public"."vesu_extended_ekubo_swapped" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "block_number" INTEGER NOT NULL,
    "tx_index" INTEGER NOT NULL,
    "event_index" INTEGER NOT NULL,
    "tx_hash" TEXT NOT NULL,
    "strategy_id" TEXT NOT NULL,
    "locker" TEXT NOT NULL,
    "token0" TEXT NOT NULL,
    "token1" TEXT NOT NULL,
    "fee" TEXT NOT NULL,
    "tick_spacing" TEXT NOT NULL,
    "extension" TEXT NOT NULL,
    "swap_amount_signed" TEXT NOT NULL,
    "is_token1" TEXT NOT NULL,
    "sqrt_ratio_limit" TEXT NOT NULL,
    "skip_ahead" TEXT NOT NULL,
    "delta0_signed" TEXT NOT NULL,
    "delta1_signed" TEXT NOT NULL,
    "sqrt_ratio_after" TEXT NOT NULL,
    "tick_after_signed" TEXT NOT NULL,
    "liquidity_after" TEXT NOT NULL,
    "timestamp" INTEGER NOT NULL,
    "_cursor" BIGINT,
    CONSTRAINT "vesu_extended_ekubo_swapped_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "vesu_ext_ekubo_swap_event_id" ON "public"."vesu_extended_ekubo_swapped"("block_number", "tx_index", "event_index");
