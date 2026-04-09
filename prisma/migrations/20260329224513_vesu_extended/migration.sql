-- CreateTable
CREATE TABLE "public"."vesu_extended_usdc_transfers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "block_number" INTEGER NOT NULL,
    "tx_index" INTEGER NOT NULL,
    "event_index" INTEGER NOT NULL,
    "tx_hash" TEXT NOT NULL,
    "strategy_id" TEXT NOT NULL,
    "flow_type" TEXT NOT NULL,
    "from_address" TEXT NOT NULL,
    "to_address" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "timestamp" INTEGER NOT NULL,
    "_cursor" BIGINT,

    CONSTRAINT "vesu_extended_usdc_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."vesu_extended_modify_position" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "block_number" INTEGER NOT NULL,
    "tx_index" INTEGER NOT NULL,
    "event_index" INTEGER NOT NULL,
    "tx_hash" TEXT NOT NULL,
    "strategy_id" TEXT NOT NULL,
    "pool_contract" TEXT NOT NULL,
    "collateral_asset" TEXT NOT NULL,
    "debt_asset" TEXT NOT NULL,
    "user_address" TEXT NOT NULL,
    "collateral_delta" TEXT NOT NULL,
    "collateral_shares_delta" TEXT NOT NULL,
    "debt_delta" TEXT NOT NULL,
    "nominal_debt_delta" TEXT NOT NULL,
    "timestamp" INTEGER NOT NULL,
    "_cursor" BIGINT,

    CONSTRAINT "vesu_extended_modify_position_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."vesu_extended_core_deposits" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "block_number" INTEGER NOT NULL,
    "tx_index" INTEGER NOT NULL,
    "event_index" INTEGER NOT NULL,
    "tx_hash" TEXT NOT NULL,
    "strategy_id" TEXT NOT NULL,
    "vault_id_key" TEXT NOT NULL,
    "va_address" TEXT NOT NULL,
    "collateral_id" TEXT NOT NULL,
    "quantized_amount" TEXT NOT NULL,
    "unquantized_amount" TEXT NOT NULL,
    "salt" TEXT NOT NULL,
    "timestamp" INTEGER NOT NULL,
    "_cursor" BIGINT,

    CONSTRAINT "vesu_extended_core_deposits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."extended_trades" (
    "trade_id" TEXT NOT NULL,
    "strategy_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "external_id" TEXT,
    "side" TEXT NOT NULL,
    "price" TEXT NOT NULL,
    "qty" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "fee" TEXT NOT NULL,
    "trade_type" TEXT NOT NULL,
    "created_time" TEXT NOT NULL,
    "is_taker" BOOLEAN NOT NULL,
    "synced_at" INTEGER NOT NULL,

    CONSTRAINT "extended_trades_pkey" PRIMARY KEY ("trade_id")
);

-- CreateTable
CREATE TABLE "public"."extended_trades_poll_state" (
    "id" TEXT NOT NULL,
    "last_cursor" TEXT,
    "updated_at" INTEGER NOT NULL,

    CONSTRAINT "extended_trades_poll_state_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vesu_extended_usdc_transfers_block_number_tx_index_event_in_key" ON "public"."vesu_extended_usdc_transfers"("block_number", "tx_index", "event_index");

-- CreateIndex
CREATE UNIQUE INDEX "vesu_extended_modify_position_block_number_tx_index_event_i_key" ON "public"."vesu_extended_modify_position"("block_number", "tx_index", "event_index");

-- CreateIndex
CREATE UNIQUE INDEX "vesu_extended_core_deposits_block_number_tx_index_event_ind_key" ON "public"."vesu_extended_core_deposits"("block_number", "tx_index", "event_index");

-- CreateIndex
CREATE INDEX "extended_trades_strategy_id_idx" ON "public"."extended_trades"("strategy_id");
