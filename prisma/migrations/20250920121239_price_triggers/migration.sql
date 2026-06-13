-- This is an empty migration.
-- Function to round timestamp to 15-minute intervals
CREATE OR REPLACE FUNCTION round_to_15min(timestamp_val INTEGER)
RETURNS INTEGER AS $$
BEGIN
    -- Round down to the nearest 15-minute interval
    -- 15 minutes = 900 seconds
    -- round down to the nearest 15-minute interval
    RETURN FLOOR(timestamp_val / 900) * 900;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_median_price(given_pair_id TEXT, timestamp_val INTEGER)
RETURNS DOUBLE PRECISION AS $$
DECLARE
    min_timestamp INTEGER := round_to_15min(timestamp_val);
    max_timestamp INTEGER := min_timestamp + 900;
    median_price DOUBLE PRECISION;
    total_count INTEGER;
    _pragma_decimals INTEGER;
BEGIN
    -- Get the count of price events in the time range
    SELECT COUNT(*) INTO total_count
    FROM "public"."raw_price_events"
    WHERE pair_id = given_pair_id
      AND timestamp >= min_timestamp
      AND timestamp < max_timestamp;
    
    -- If no data found, return NULL
    IF total_count = 0 THEN
        RETURN NULL;
    END IF;
    
    -- Calculate median using percentile_cont for better performance
    -- This uses a more efficient algorithm than sorting all values
    SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY price::DOUBLE PRECISION)
    INTO median_price
    FROM "public"."raw_price_events"
    WHERE pair_id = given_pair_id
      AND timestamp >= min_timestamp
      AND timestamp < max_timestamp;
    
    -- use pragma_decimals to convert to the correct decimals
    SELECT pragma_decimals INTO _pragma_decimals
    FROM "public"."token_metadata"
    WHERE pragma_pair_id = given_pair_id;

    RETURN median_price / 10 ^ _pragma_decimals;
END;
$$ LANGUAGE plpgsql;



-- Helper function to upsert prices for a token and its pegged assets
CREATE OR REPLACE FUNCTION upsert_price_for_asset_and_pegged_assets(
    token_address TEXT,
    token_price DOUBLE PRECISION,
    rounded_timestamp INTEGER,
    token_block_number INTEGER
)
RETURNS VOID AS $$
BEGIN
    INSERT INTO "public"."prices" (asset, price, timestamp, block_number, _cursor)
    SELECT price_assets.asset, token_price, rounded_timestamp, token_block_number, token_block_number
    FROM (
        SELECT token_address AS asset
        UNION
        SELECT tm.address AS asset
        FROM "public"."token_metadata" tm
        WHERE tm.pegged_asset = token_address
    ) price_assets
    WHERE token_price IS NOT NULL
    ON CONFLICT (asset, timestamp)
    DO UPDATE SET
        price = token_price,
        block_number = GREATEST("public"."prices".block_number, token_block_number),
        _cursor = GREATEST("public"."prices"._cursor, token_block_number);
END;
$$ LANGUAGE plpgsql;

-- Helper function to delete prices for a token and its pegged assets
CREATE OR REPLACE FUNCTION delete_price_for_asset_and_pegged_assets(
    token_address TEXT,
    rounded_timestamp INTEGER
)
RETURNS VOID AS $$
BEGIN
    DELETE FROM "public"."prices"
    WHERE timestamp = rounded_timestamp
      AND asset IN (
        SELECT token_address
        UNION
        SELECT tm.address
        FROM "public"."token_metadata" tm
        WHERE tm.pegged_asset = token_address
      );
END;
$$ LANGUAGE plpgsql;

-- Function to validate pair_id exists in token_metadata before insert
CREATE OR REPLACE FUNCTION validate_pair_id_exists()
RETURNS TRIGGER AS $$
DECLARE
    token_address TEXT;
BEGIN
    -- Check if pair_id exists in token_metadata and get the address
    SELECT address INTO token_address
    FROM "public"."token_metadata"
    WHERE pragma_pair_id = NEW.pair_id;
    
    -- If no matching token found, skip the insert
    IF token_address IS NULL THEN
        RETURN NULL; -- This skips the insert
    END IF;
    
    -- Allow the insert to proceed
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to handle INSERT operations
CREATE OR REPLACE FUNCTION handle_raw_price_events_insert()
RETURNS TRIGGER AS $$
DECLARE
    rounded_timestamp INTEGER;
    token_address TEXT;
    median_price DOUBLE PRECISION;
BEGIN
    -- Get the token address from token_metadata
    SELECT address INTO token_address
    FROM "public"."token_metadata"
    WHERE pragma_pair_id = NEW.pair_id;
    
    -- Round timestamp to 15-minute interval
    rounded_timestamp := round_to_15min(NEW.timestamp);
    
    -- Calculate median price for this time window
    SELECT get_median_price(NEW.pair_id, NEW.timestamp) INTO median_price;
    
    -- Upsert into prices table for the token and any tokens pegged to it
    PERFORM upsert_price_for_asset_and_pegged_assets(
        token_address,
        median_price,
        rounded_timestamp,
        NEW.block_number
    );
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to handle UPDATE operations
CREATE OR REPLACE FUNCTION handle_raw_price_events_update()
RETURNS TRIGGER AS $$
DECLARE
    old_rounded_timestamp INTEGER;
    new_rounded_timestamp INTEGER;
    old_token_address TEXT;
    new_token_address TEXT;
    old_median_price DOUBLE PRECISION;
    new_median_price DOUBLE PRECISION;
BEGIN
    -- Get token addresses for old and new records
    SELECT address INTO old_token_address
    FROM "public"."token_metadata"
    WHERE pragma_pair_id = OLD.pair_id;
    
    SELECT address INTO new_token_address
    FROM "public"."token_metadata"
    WHERE pragma_pair_id = NEW.pair_id;
    
    -- If either token address is not found, skip the update
    IF old_token_address IS NULL OR new_token_address IS NULL THEN
        RETURN NEW;
    END IF;
    
    old_rounded_timestamp := round_to_15min(OLD.timestamp);
    new_rounded_timestamp := round_to_15min(NEW.timestamp);
    
    -- If the token or timestamp changed, update both old and new price windows
    IF old_rounded_timestamp != new_rounded_timestamp OR old_token_address != new_token_address THEN
        -- Calculate median price for old time period (without the updated record)
        SELECT get_median_price(OLD.pair_id, OLD.timestamp) INTO old_median_price;
        
        IF old_median_price IS NULL THEN
            PERFORM delete_price_for_asset_and_pegged_assets(
                old_token_address,
                old_rounded_timestamp
            );
        ELSE
            PERFORM upsert_price_for_asset_and_pegged_assets(
                old_token_address,
                old_median_price,
                old_rounded_timestamp,
                OLD.block_number
            );
        END IF;
        
        -- Calculate median price for new time period (with the updated record)
        SELECT get_median_price(NEW.pair_id, NEW.timestamp) INTO new_median_price;
        
        PERFORM upsert_price_for_asset_and_pegged_assets(
            new_token_address,
            new_median_price,
            new_rounded_timestamp,
            NEW.block_number
        );
    ELSE
        -- Same token and time period, recalculate median price
        SELECT get_median_price(NEW.pair_id, NEW.timestamp) INTO new_median_price;

        PERFORM upsert_price_for_asset_and_pegged_assets(
            new_token_address,
            new_median_price,
            new_rounded_timestamp,
            NEW.block_number
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to handle DELETE operations
CREATE OR REPLACE FUNCTION handle_raw_price_events_delete()
RETURNS TRIGGER AS $$
DECLARE
    rounded_timestamp INTEGER;
    token_address TEXT;
    median_price DOUBLE PRECISION;
BEGIN
    -- Get token address for the deleted record
    SELECT address INTO token_address
    FROM "public"."token_metadata"
    WHERE pragma_pair_id = OLD.pair_id;
    
    -- If token address not found, skip the delete operation
    IF token_address IS NULL THEN
        RETURN OLD;
    END IF;
    
    rounded_timestamp := round_to_15min(OLD.timestamp);
    
    -- Calculate median price for this time window (after deletion)
    SELECT get_median_price(OLD.pair_id, OLD.timestamp) INTO median_price;

    -- if median_price is NULL, delete the price records
    IF median_price IS NULL THEN
        PERFORM delete_price_for_asset_and_pegged_assets(
            token_address,
            rounded_timestamp
        );
        RETURN OLD;
    END IF;
    
    -- Update the prices table with new median price
    PERFORM upsert_price_for_asset_and_pegged_assets(
        token_address,
        median_price,
        rounded_timestamp,
        OLD.block_number
    );
    
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Create triggers
CREATE TRIGGER raw_price_events_validate_trigger
    BEFORE INSERT ON "public"."raw_price_events"
    FOR EACH ROW
    EXECUTE FUNCTION validate_pair_id_exists();

CREATE TRIGGER raw_price_events_insert_trigger
    AFTER INSERT ON "public"."raw_price_events"
    FOR EACH ROW
    EXECUTE FUNCTION handle_raw_price_events_insert();

CREATE TRIGGER raw_price_events_update_trigger
    AFTER UPDATE ON "public"."raw_price_events"
    FOR EACH ROW
    EXECUTE FUNCTION handle_raw_price_events_update();

CREATE TRIGGER raw_price_events_delete_trigger
    AFTER DELETE ON "public"."raw_price_events"
    FOR EACH ROW
    EXECUTE FUNCTION handle_raw_price_events_delete();
