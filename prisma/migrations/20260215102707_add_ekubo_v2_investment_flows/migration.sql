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

-- Function to calculate quote_amount on ekubo_v2_investment_flows insert/update
CREATE OR REPLACE FUNCTION calculate_ekubo_v2_quote_amount()
RETURNS TRIGGER AS $$
DECLARE
    quote_asset_address TEXT;
    token0_quote_amount DECIMAL(65,30);
    token1_quote_amount DECIMAL(65,30);
    total_quote_amount DECIMAL(65,30);
    token0_address TEXT;
    token1_address TEXT;
BEGIN
    -- Get quote_asset from strategy_metadata using the vault_address
    SELECT sm.quote_asset INTO quote_asset_address
    FROM "public"."strategy_metadata" sm
    WHERE sm.strategy_address = NEW.vault_address;
    
    -- If no strategy metadata found, raise exception
    IF quote_asset_address IS NULL THEN
        RAISE EXCEPTION 'No strategy metadata found for vault address %', NEW.vault_address;
        RETURN NULL;
    END IF;
    
    token0_address = NEW.token0;
    token1_address = NEW.token1;

    -- Calculate quote amounts for both tokens using existing helper function
    token0_quote_amount := calculate_quote_amount(token0_address, quote_asset_address, NEW.amount0::DECIMAL, NEW.timestamp);
    token1_quote_amount := calculate_quote_amount(token1_address, quote_asset_address, NEW.amount1::DECIMAL, NEW.timestamp);
    
    -- Calculate total quote amount (sum of both tokens)
    total_quote_amount := token0_quote_amount + token1_quote_amount;
    
    -- Set the calculated quote_amount
    NEW.quote_amount := total_quote_amount;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for ekubo_v2_investment_flows insert/update
CREATE TRIGGER ekubo_v2_investment_flows_calculate_quote_amount_trigger
    BEFORE INSERT OR UPDATE ON "public"."ekubo_v2_investment_flows"
    FOR EACH ROW
    EXECUTE FUNCTION calculate_ekubo_v2_quote_amount();

