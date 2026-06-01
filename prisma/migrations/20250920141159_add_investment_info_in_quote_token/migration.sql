-- AlterTable
ALTER TABLE "public"."investment_flows" ADD COLUMN     "quote_amount" DECIMAL(65,30) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "public"."position_updated" ADD COLUMN     "quote_amount" DECIMAL(65,30) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "public"."strategy_metadata" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "strategy_address" TEXT NOT NULL,
    "strategy_name" TEXT NOT NULL,
    "quote_asset" TEXT NOT NULL,

    CONSTRAINT "strategy_metadata_pkey" PRIMARY KEY ("id")
);

CREATE OR REPLACE FUNCTION calculate_quote_amount(_asset TEXT, _quote_asset TEXT, amount DECIMAL, _timestamp INTEGER)
RETURNS DECIMAL AS $$
DECLARE
    asset_price DOUBLE PRECISION;
    asset_price_timestamp INTEGER;
    quote_price DOUBLE PRECISION;
    quote_price_timestamp INTEGER;
    token_decimals INTEGER;
BEGIN
    -- Get token decimals for the asset of investment
    SELECT tm.decimals INTO token_decimals
    FROM "public"."token_metadata" tm
    WHERE tm.address = _asset;

    -- If no token metadata found, raise exception
    IF token_decimals IS NULL THEN
        RAISE EXCEPTION 'No token metadata found for asset %', _asset;
        RETURN NULL;
    END IF;

    -- if v2 usdc, use price of v1 usdc
    -- swaped - use usdc for usdc.e
    -- ! to make it dynamic later
    IF _quote_asset = '0x53c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8' THEN
        _quote_asset = '0x33068f6539f8e6e6b131e6b2b814e6c34a5224bc66947c47dab9dfee93b35fb';
    END IF;

    IF _quote_asset = '0x47751b3532fabca89b0f2e35ca1cb45e5a7b11d5e3d3663dfa1f4406b45fd88' THEN
        _quote_asset = '0x3fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac';
    END IF;

    IF _quote_asset = '0x787150e306e6eae6e3f79dea881770e8bbff2c1b8eb490f969669ee945b3135' THEN
        _quote_asset = '0x3fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac';
    END IF;

    -- if v2 usdc, use price of v1 usdc
    -- swaped - use usdc for usdc.e
    IF _asset = '0x53c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8' THEN
        _asset = '0x33068f6539f8e6e6b131e6b2b814e6c34a5224bc66947c47dab9dfee93b35fb';
    END IF;

    IF _asset = '0x47751b3532fabca89b0f2e35ca1cb45e5a7b11d5e3d3663dfa1f4406b45fd88' THEN
        _asset = '0x3fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac';
    END IF;

    IF _asset = '0x787150e306e6eae6e3f79dea881770e8bbff2c1b8eb490f969669ee945b3135' THEN
        _asset = '0x3fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac';
    END IF;

    IF _asset = _quote_asset THEN
        RETURN amount / 10^token_decimals;
    END IF;
    

    SELECT p.price, p.timestamp INTO asset_price, asset_price_timestamp
    FROM "public"."prices" p
    WHERE p.asset = _asset
    AND p.timestamp <= _timestamp
    ORDER BY p.timestamp DESC
    LIMIT 1;

    SELECT p.price, p.timestamp INTO quote_price, quote_price_timestamp
    FROM "public"."prices" p
    WHERE p.asset = _quote_asset
    AND p.timestamp <= _timestamp
    ORDER BY p.timestamp DESC
    LIMIT 1;

    IF asset_price IS NULL THEN
        RAISE EXCEPTION 'No price found for asset %, timestamp %', _asset, _timestamp;
        RETURN NULL;
    END IF;

    IF quote_price IS NULL THEN
        RAISE EXCEPTION 'No price found for quote asset %, timestamp %', _quote_asset, _timestamp;
        RETURN NULL;
    END IF;


    IF asset_price_timestamp < _timestamp - 3600 THEN
        RAISE EXCEPTION 'Asset price is older than 1hr for asset %, timestamp %', _asset, _timestamp;
        RETURN NULL;
    END IF;

    IF quote_price_timestamp < _timestamp - 3600 THEN
        RAISE EXCEPTION 'Quote price is older than 1hr for quote asset %, timestamp %', _quote_asset, _timestamp;
        RETURN NULL;
    END IF;

    RETURN amount * asset_price / (10^token_decimals / quote_price);
END;
$$ LANGUAGE plpgsql;


-- Function to calculate quote_amount on investment_flows insert
CREATE OR REPLACE FUNCTION calculate_investment_quote_amount()
RETURNS TRIGGER AS $$
DECLARE
    quote_asset_address TEXT;
    asset_price DOUBLE PRECISION;
    price_timestamp INTEGER;
    quote_price DOUBLE PRECISION;
    quote_price_timestamp INTEGER;
    token_decimals INTEGER;
    calculated_quote_amount DECIMAL(65,30);
BEGIN
    -- Only proceed if asset is defined (not null and not empty string)
    IF NEW.asset IS NULL OR NEW.asset = '' THEN
        RETURN NEW;
    END IF;
    
    -- Get quote_asset from strategy_metadata using the contract address
    SELECT sm.quote_asset INTO quote_asset_address
    FROM "public"."strategy_metadata" sm
    WHERE sm.strategy_address = NEW.contract;
    
    -- If no strategy metadata found, return without calculating
    IF quote_asset_address IS NULL THEN
        RETURN NEW;
    END IF;

    -- Calculate quote_amount
    calculated_quote_amount := calculate_quote_amount(NEW.asset, quote_asset_address, NEW.amount::DECIMAL, NEW.timestamp);
    
    -- Set the calculated quote_amount
    NEW.quote_amount := calculated_quote_amount;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate quote_amount on position_updated insert/update
CREATE OR REPLACE FUNCTION calculate_position_quote_amount()
RETURNS TRIGGER AS $$
DECLARE
    quote_asset_address TEXT;
    token0_price DOUBLE PRECISION;
    token1_price DOUBLE PRECISION;
    token0_price_timestamp INTEGER;
    token1_price_timestamp INTEGER;
    token0_decimals INTEGER;
    token1_decimals INTEGER;
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
    
    -- Calculate quote amounts for both tokens
    token0_address = NEW.token0;
    IF token0_address = '0x28d709c875c0ceac3dce7065bec5328186dc89fe254527084d1689910954b0a' THEN
        token0_address = '0x4718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d';
    END IF;

    token1_address = NEW.token1;
    IF token1_address = '0x28d709c875c0ceac3dce7065bec5328186dc89fe254527084d1689910954b0a' THEN
        token1_address = '0x4718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d';
    END IF;

    token0_quote_amount := calculate_quote_amount(token0_address, quote_asset_address, NEW.amount0::DECIMAL, NEW.timestamp);
    token1_quote_amount := calculate_quote_amount(token1_address, quote_asset_address, NEW.amount1::DECIMAL, NEW.timestamp);
    
    -- Calculate total quote amount (sum of both tokens)
    total_quote_amount := token0_quote_amount + token1_quote_amount;
    
    -- Set the calculated quote_amount
    NEW.quote_amount := total_quote_amount;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for investment_flows insert/update
CREATE TRIGGER investment_flows_calculate_quote_amount_trigger
    BEFORE INSERT OR UPDATE ON "public"."investment_flows"
    FOR EACH ROW
    EXECUTE FUNCTION calculate_investment_quote_amount();

-- Create trigger for position_updated insert/update
CREATE TRIGGER position_updated_calculate_quote_amount_trigger
    BEFORE INSERT OR UPDATE ON "public"."position_updated"
    FOR EACH ROW
    EXECUTE FUNCTION calculate_position_quote_amount();
