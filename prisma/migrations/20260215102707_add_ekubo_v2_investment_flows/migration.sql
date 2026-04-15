-- CreateTable
CREATE TABLE "public"."ekubo_v2_investment_flows" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "block_number" INTEGER NOT NULL,
    "tx_index" INTEGER NOT NULL DEFAULT 0,
    "event_index" INTEGER NOT NULL DEFAULT 0,
    "tx_hash" TEXT NOT NULL,
    "sender" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "receiver" TEXT NOT NULL,
    "shares" TEXT NOT NULL,
    "amount0" TEXT NOT NULL,
    "amount1" TEXT NOT NULL,
    "token0" TEXT NOT NULL,
    "token1" TEXT NOT NULL,
    "vault_address" TEXT NOT NULL,
    "user_address" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "timestamp" INTEGER NOT NULL,
    "_cursor" BIGINT,
    "quote_amount" DECIMAL(65,30) NOT NULL DEFAULT 0,

    CONSTRAINT "ekubo_v2_investment_flows_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ekubo_v2_investment_flows_block_number_tx_index_event_index_key" ON "public"."ekubo_v2_investment_flows"("block_number", "tx_index", "event_index");

-- Create trigger for ekubo_v2_investment_flows insert/update
CREATE TRIGGER ekubo_v2_investment_flows_calculate_quote_amount_trigger
    BEFORE INSERT OR UPDATE ON "public"."ekubo_v2_investment_flows"
    FOR EACH ROW
    EXECUTE FUNCTION calculate_position_quote_amount();