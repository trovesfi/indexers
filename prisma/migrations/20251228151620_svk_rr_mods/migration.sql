-- CreateTable: Raw event table for Subscribed events
CREATE TABLE "public"."svk_alt_redemptions_subscribed" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "block_number" INTEGER NOT NULL,
    "tx_index" INTEGER NOT NULL DEFAULT 0,
    "event_index" INTEGER NOT NULL DEFAULT 0,
    "tx_hash" TEXT NOT NULL,
    "contract_address" TEXT NOT NULL,
    "new_nft_id" NUMERIC(78,0) NOT NULL,
    "old_nft_id" NUMERIC(78,0) NOT NULL,
    "receiver" TEXT NOT NULL,
    "timestamp" INTEGER NOT NULL,
    "_cursor" BIGINT,

    CONSTRAINT "svk_alt_redemptions_subscribed_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Raw event table for Claimed events
CREATE TABLE "public"."svk_alt_redemptions_claimed" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "block_number" INTEGER NOT NULL,
    "tx_index" INTEGER NOT NULL DEFAULT 0,
    "event_index" INTEGER NOT NULL DEFAULT 0,
    "tx_hash" TEXT NOT NULL,
    "contract_address" TEXT NOT NULL,
    "new_nft_id" NUMERIC(78,0) NOT NULL,
    "old_nft_id" NUMERIC(78,0) NOT NULL,
    "receivable" NUMERIC(78,0) NOT NULL,
    "swap_id" NUMERIC(78,0) NOT NULL,
    "timestamp" INTEGER NOT NULL,
    "_cursor" BIGINT,

    CONSTRAINT "svk_alt_redemptions_claimed_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Raw event table for Unsubscribed events
CREATE TABLE "public"."svk_alt_redemptions_unsubscribed" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "block_number" INTEGER NOT NULL,
    "tx_index" INTEGER NOT NULL DEFAULT 0,
    "event_index" INTEGER NOT NULL DEFAULT 0,
    "tx_hash" TEXT NOT NULL,
    "contract_address" TEXT NOT NULL,
    "new_nft_id" NUMERIC(78,0) NOT NULL,
    "old_nft_id" NUMERIC(78,0) NOT NULL,
    "owner" TEXT NOT NULL,
    "is_old_nft_returned" BOOLEAN NOT NULL,
    "is_original_assets_returned" BOOLEAN NOT NULL,
    "original_assets_returned" NUMERIC(78,0) NOT NULL,
    "timestamp" INTEGER NOT NULL,
    "_cursor" BIGINT,

    CONSTRAINT "svk_alt_redemptions_unsubscribed_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Post-processed table maintaining final state
CREATE TABLE "public"."svk_alt_redemptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "block_number" INTEGER NOT NULL,
    "tx_index" INTEGER NOT NULL DEFAULT 0,
    "event_index" INTEGER NOT NULL DEFAULT 0,
    "tx_hash" TEXT NOT NULL,
    "contract_address" TEXT NOT NULL,
    "old_nft_id" NUMERIC(78,0) NOT NULL,
    "new_nft_id" NUMERIC(78,0) NOT NULL,
    "receiver" TEXT,
    "owner" TEXT,
    "receivable" NUMERIC(78,0),
    "swap_id" NUMERIC(78,0),
    "is_claimed" BOOLEAN NOT NULL DEFAULT false,
    "is_unsubscribed" BOOLEAN NOT NULL DEFAULT false,
    "is_old_nft_returned" BOOLEAN NOT NULL DEFAULT false,
    "is_original_assets_returned" BOOLEAN NOT NULL DEFAULT false,
    "original_assets_returned" NUMERIC(78,0),
    "timestamp" INTEGER NOT NULL,
    "_cursor" BIGINT,

    CONSTRAINT "svk_alt_redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "svk_alt_redemptions_subscribed_block_number_tx_index_event_index_key" ON "public"."svk_alt_redemptions_subscribed"("block_number", "tx_index", "event_index");

-- CreateIndex
CREATE UNIQUE INDEX "svk_alt_redemptions_claimed_block_number_tx_index_event_index_key" ON "public"."svk_alt_redemptions_claimed"("block_number", "tx_index", "event_index");

-- CreateIndex
CREATE UNIQUE INDEX "svk_alt_redemptions_unsubscribed_block_number_tx_index_event_index_key" ON "public"."svk_alt_redemptions_unsubscribed"("block_number", "tx_index", "event_index");

-- CreateIndex
CREATE UNIQUE INDEX "svk_alt_redemptions_contract_address_old_nft_id_key" ON "public"."svk_alt_redemptions"("contract_address", "old_nft_id");

-- CreateIndex
CREATE INDEX "svk_alt_redemptions_subscribed_contract_address_old_nft_id_idx" ON "public"."svk_alt_redemptions_subscribed"("contract_address", "old_nft_id");

-- CreateIndex
CREATE INDEX "svk_alt_redemptions_subscribed_contract_address_new_nft_id_idx" ON "public"."svk_alt_redemptions_subscribed"("contract_address", "new_nft_id");

-- CreateIndex
CREATE INDEX "svk_alt_redemptions_claimed_contract_address_old_nft_id_idx" ON "public"."svk_alt_redemptions_claimed"("contract_address", "old_nft_id");

-- CreateIndex
CREATE INDEX "svk_alt_redemptions_claimed_contract_address_new_nft_id_idx" ON "public"."svk_alt_redemptions_claimed"("contract_address", "new_nft_id");

-- CreateIndex
CREATE INDEX "svk_alt_redemptions_unsubscribed_contract_address_old_nft_id_idx" ON "public"."svk_alt_redemptions_unsubscribed"("contract_address", "old_nft_id");

-- CreateIndex
CREATE INDEX "svk_alt_redemptions_unsubscribed_contract_address_new_nft_id_idx" ON "public"."svk_alt_redemptions_unsubscribed"("contract_address", "new_nft_id");

-- CreateIndex
CREATE INDEX "svk_alt_redemptions_contract_address_new_nft_id_idx" ON "public"."svk_alt_redemptions"("contract_address", "new_nft_id");

-- CreateIndex
CREATE INDEX "svk_alt_redemptions_contract_address_is_claimed_idx" ON "public"."svk_alt_redemptions"("contract_address", "is_claimed");

-- CreateIndex
CREATE INDEX "svk_alt_redemptions_contract_address_is_unsubscribed_idx" ON "public"."svk_alt_redemptions"("contract_address", "is_unsubscribed");

-- ============================================================================
-- TRIGGER FUNCTIONS FOR SUBSCRIBED EVENTS
-- ============================================================================

-- Function to handle INSERT on subscribed events
CREATE OR REPLACE FUNCTION handle_subscribed_insert()
RETURNS TRIGGER AS $$
BEGIN
    -- Insert or update the post-processed table
    INSERT INTO "public"."svk_alt_redemptions" (
        block_number, tx_index, event_index, tx_hash,
        contract_address, old_nft_id, new_nft_id, receiver,
        is_claimed, is_unsubscribed, timestamp, _cursor
    )
    VALUES (
        NEW.block_number, NEW.tx_index, NEW.event_index, NEW.tx_hash,
        NEW.contract_address, NEW.old_nft_id, NEW.new_nft_id, NEW.receiver,
        false, false, NEW.timestamp, NEW._cursor
    )
    ON CONFLICT (contract_address, old_nft_id)
    DO UPDATE SET
        new_nft_id = EXCLUDED.new_nft_id,
        receiver = EXCLUDED.receiver,
        block_number = EXCLUDED.block_number,
        tx_index = EXCLUDED.tx_index,
        event_index = EXCLUDED.event_index,
        tx_hash = EXCLUDED.tx_hash,
        timestamp = EXCLUDED.timestamp,
        _cursor = EXCLUDED._cursor,
        -- Reset unsubscribed flags if resubscribed
        is_unsubscribed = false,
        is_old_nft_returned = false,
        is_original_assets_returned = false,
        original_assets_returned = NULL;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to handle UPDATE on subscribed events
CREATE OR REPLACE FUNCTION handle_subscribed_update()
RETURNS TRIGGER AS $$
BEGIN
    -- Update the post-processed table
    UPDATE "public"."svk_alt_redemptions"
    SET
        new_nft_id = NEW.new_nft_id,
        receiver = NEW.receiver,
        block_number = NEW.block_number,
        tx_index = NEW.tx_index,
        event_index = NEW.event_index,
        tx_hash = NEW.tx_hash,
        timestamp = NEW.timestamp,
        _cursor = NEW._cursor
    WHERE contract_address = NEW.contract_address
      AND old_nft_id = NEW.old_nft_id;
    
    -- If old_nft_id changed, we need to handle the old record
    IF OLD.old_nft_id != NEW.old_nft_id OR OLD.contract_address != NEW.contract_address THEN
        -- Delete old record if it exists
        DELETE FROM "public"."svk_alt_redemptions"
        WHERE contract_address = OLD.contract_address
          AND old_nft_id = OLD.old_nft_id;
        
        -- Insert new record
        INSERT INTO "public"."svk_alt_redemptions" (
            block_number, tx_index, event_index, tx_hash,
            contract_address, old_nft_id, new_nft_id, receiver,
            is_claimed, is_unsubscribed, timestamp, _cursor
        )
        VALUES (
            NEW.block_number, NEW.tx_index, NEW.event_index, NEW.tx_hash,
            NEW.contract_address, NEW.old_nft_id, NEW.new_nft_id, NEW.receiver,
            false, false, NEW.timestamp, NEW._cursor
        )
        ON CONFLICT (contract_address, old_nft_id)
        DO UPDATE SET
            new_nft_id = EXCLUDED.new_nft_id,
            receiver = EXCLUDED.receiver,
            block_number = EXCLUDED.block_number,
            tx_index = EXCLUDED.tx_index,
            event_index = EXCLUDED.event_index,
            tx_hash = EXCLUDED.tx_hash,
            timestamp = EXCLUDED.timestamp,
            _cursor = EXCLUDED._cursor;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to handle DELETE on subscribed events
CREATE OR REPLACE FUNCTION handle_subscribed_delete()
RETURNS TRIGGER AS $$
BEGIN
    -- Only delete from post-processed table if no other events exist for this redemption
    -- Check if there are claimed or unsubscribed events
    IF NOT EXISTS (
        SELECT 1 FROM "public"."svk_alt_redemptions_claimed"
        WHERE contract_address = OLD.contract_address
          AND old_nft_id = OLD.old_nft_id
    ) AND NOT EXISTS (
        SELECT 1 FROM "public"."svk_alt_redemptions_unsubscribed"
        WHERE contract_address = OLD.contract_address
          AND old_nft_id = OLD.old_nft_id
    ) THEN
        DELETE FROM "public"."svk_alt_redemptions"
        WHERE contract_address = OLD.contract_address
          AND old_nft_id = OLD.old_nft_id;
    ELSE
        -- this shouldnt happen bcz claim and unsub are always called after subscribe
        RAISE EXCEPTION 'Claim or unsubscribed event shouldnt have existed';
    END IF;
    
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TRIGGER FUNCTIONS FOR CLAIMED EVENTS
-- ============================================================================

-- Function to handle INSERT on claimed events
CREATE OR REPLACE FUNCTION handle_claimed_insert()
RETURNS TRIGGER AS $$
BEGIN
    -- Update the post-processed table
    INSERT INTO "public"."svk_alt_redemptions" (
        block_number, tx_index, event_index, tx_hash,
        contract_address, old_nft_id, new_nft_id,
        receivable, swap_id, is_claimed, timestamp, _cursor
    )
    VALUES (
        NEW.block_number, NEW.tx_index, NEW.event_index, NEW.tx_hash,
        NEW.contract_address, NEW.old_nft_id, NEW.new_nft_id,
        NEW.receivable, NEW.swap_id, true, NEW.timestamp, NEW._cursor
    )
    ON CONFLICT (contract_address, old_nft_id)
    DO UPDATE SET
        new_nft_id = COALESCE(EXCLUDED.new_nft_id, "svk_alt_redemptions".new_nft_id),
        receivable = EXCLUDED.receivable,
        swap_id = EXCLUDED.swap_id,
        is_claimed = true,
        block_number = EXCLUDED.block_number,
        tx_index = EXCLUDED.tx_index,
        event_index = EXCLUDED.event_index,
        tx_hash = EXCLUDED.tx_hash,
        timestamp = EXCLUDED.timestamp,
        _cursor = EXCLUDED._cursor;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to handle UPDATE on claimed events
CREATE OR REPLACE FUNCTION handle_claimed_update()
RETURNS TRIGGER AS $$
BEGIN
    -- Update the post-processed table
    UPDATE "public"."svk_alt_redemptions"
    SET
        new_nft_id = COALESCE(NEW.new_nft_id, new_nft_id),
        receivable = NEW.receivable,
        swap_id = NEW.swap_id,
        is_claimed = true,
        block_number = NEW.block_number,
        tx_index = NEW.tx_index,
        event_index = NEW.event_index,
        tx_hash = NEW.tx_hash,
        timestamp = NEW.timestamp,
        _cursor = NEW._cursor
    WHERE contract_address = NEW.contract_address
      AND old_nft_id = NEW.old_nft_id;
    
    -- If old_nft_id or contract_address changed, handle migration
    IF OLD.old_nft_id != NEW.old_nft_id OR OLD.contract_address != NEW.contract_address THEN
        -- Update old record
        UPDATE "public"."svk_alt_redemptions"
        SET is_claimed = false
        WHERE contract_address = OLD.contract_address
          AND old_nft_id = OLD.old_nft_id;
        
        -- Insert/update new record
        INSERT INTO "public"."svk_alt_redemptions" (
            block_number, tx_index, event_index, tx_hash,
            contract_address, old_nft_id, new_nft_id,
            receivable, swap_id, is_claimed, timestamp, _cursor
        )
        VALUES (
            NEW.block_number, NEW.tx_index, NEW.event_index, NEW.tx_hash,
            NEW.contract_address, NEW.old_nft_id, NEW.new_nft_id,
            NEW.receivable, NEW.swap_id, true, NEW.timestamp, NEW._cursor
        )
        ON CONFLICT (contract_address, old_nft_id)
        DO UPDATE SET
            new_nft_id = COALESCE(EXCLUDED.new_nft_id, "svk_alt_redemptions".new_nft_id),
            receivable = EXCLUDED.receivable,
            swap_id = EXCLUDED.swap_id,
            is_claimed = true,
            block_number = EXCLUDED.block_number,
            tx_index = EXCLUDED.tx_index,
            event_index = EXCLUDED.event_index,
            tx_hash = EXCLUDED.tx_hash,
            timestamp = EXCLUDED.timestamp,
            _cursor = EXCLUDED._cursor;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to handle DELETE on claimed events
CREATE OR REPLACE FUNCTION handle_claimed_delete()
RETURNS TRIGGER AS $$
BEGIN
    -- Update the post-processed table to mark as not claimed
    UPDATE "public"."svk_alt_redemptions"
    SET
        is_claimed = false,
        receivable = NULL,
        swap_id = NULL
    WHERE contract_address = OLD.contract_address
      AND old_nft_id = OLD.old_nft_id;
    
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TRIGGER FUNCTIONS FOR UNSUBSCRIBED EVENTS
-- ============================================================================

-- Function to handle INSERT on unsubscribed events
CREATE OR REPLACE FUNCTION handle_unsubscribed_insert()
RETURNS TRIGGER AS $$
BEGIN
    -- Update the post-processed table
    INSERT INTO "public"."svk_alt_redemptions" (
        block_number, tx_index, event_index, tx_hash,
        contract_address, old_nft_id, new_nft_id, owner,
        is_unsubscribed, is_old_nft_returned, is_original_assets_returned,
        original_assets_returned, timestamp, _cursor
    )
    VALUES (
        NEW.block_number, NEW.tx_index, NEW.event_index, NEW.tx_hash,
        NEW.contract_address, NEW.old_nft_id, NEW.new_nft_id, NEW.owner,
        true, NEW.is_old_nft_returned, NEW.is_original_assets_returned,
        NEW.original_assets_returned, NEW.timestamp, NEW._cursor
    )
    ON CONFLICT (contract_address, old_nft_id)
    DO UPDATE SET
        new_nft_id = COALESCE(EXCLUDED.new_nft_id, "svk_alt_redemptions".new_nft_id),
        owner = EXCLUDED.owner,
        is_unsubscribed = true,
        is_old_nft_returned = EXCLUDED.is_old_nft_returned,
        is_original_assets_returned = EXCLUDED.is_original_assets_returned,
        original_assets_returned = EXCLUDED.original_assets_returned,
        block_number = EXCLUDED.block_number,
        tx_index = EXCLUDED.tx_index,
        event_index = EXCLUDED.event_index,
        tx_hash = EXCLUDED.tx_hash,
        timestamp = EXCLUDED.timestamp,
        _cursor = EXCLUDED._cursor;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to handle UPDATE on unsubscribed events
CREATE OR REPLACE FUNCTION handle_unsubscribed_update()
RETURNS TRIGGER AS $$
BEGIN
    -- Update the post-processed table
    UPDATE "public"."svk_alt_redemptions"
    SET
        new_nft_id = COALESCE(NEW.new_nft_id, new_nft_id),
        owner = NEW.owner,
        is_unsubscribed = true,
        is_old_nft_returned = NEW.is_old_nft_returned,
        is_original_assets_returned = NEW.is_original_assets_returned,
        original_assets_returned = NEW.original_assets_returned,
        block_number = NEW.block_number,
        tx_index = NEW.tx_index,
        event_index = NEW.event_index,
        tx_hash = NEW.tx_hash,
        timestamp = NEW.timestamp,
        _cursor = NEW._cursor
    WHERE contract_address = NEW.contract_address
      AND old_nft_id = NEW.old_nft_id;
    
    -- If old_nft_id or contract_address changed, handle migration
    IF OLD.old_nft_id != NEW.old_nft_id OR OLD.contract_address != NEW.contract_address THEN
        -- Update old record
        UPDATE "public"."svk_alt_redemptions"
        SET is_unsubscribed = false
        WHERE contract_address = OLD.contract_address
          AND old_nft_id = OLD.old_nft_id;
        
        -- Insert/update new record
        INSERT INTO "public"."svk_alt_redemptions" (
            block_number, tx_index, event_index, tx_hash,
            contract_address, old_nft_id, new_nft_id, owner,
            is_unsubscribed, is_old_nft_returned, is_original_assets_returned,
            original_assets_returned, timestamp, _cursor
        )
        VALUES (
            NEW.block_number, NEW.tx_index, NEW.event_index, NEW.tx_hash,
            NEW.contract_address, NEW.old_nft_id, NEW.new_nft_id, NEW.owner,
            true, NEW.is_old_nft_returned, NEW.is_original_assets_returned,
            NEW.original_assets_returned, NEW.timestamp, NEW._cursor
        )
        ON CONFLICT (contract_address, old_nft_id)
        DO UPDATE SET
            new_nft_id = COALESCE(EXCLUDED.new_nft_id, "svk_alt_redemptions".new_nft_id),
            owner = EXCLUDED.owner,
            is_unsubscribed = true,
            is_old_nft_returned = EXCLUDED.is_old_nft_returned,
            is_original_assets_returned = EXCLUDED.is_original_assets_returned,
            original_assets_returned = EXCLUDED.original_assets_returned,
            block_number = EXCLUDED.block_number,
            tx_index = EXCLUDED.tx_index,
            event_index = EXCLUDED.event_index,
            tx_hash = EXCLUDED.tx_hash,
            timestamp = EXCLUDED.timestamp,
            _cursor = EXCLUDED._cursor;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to handle DELETE on unsubscribed events
CREATE OR REPLACE FUNCTION handle_unsubscribed_delete()
RETURNS TRIGGER AS $$
BEGIN
    -- Update the post-processed table to mark as not unsubscribed
    UPDATE "public"."svk_alt_redemptions"
    SET
        is_unsubscribed = false,
        is_old_nft_returned = false,
        is_original_assets_returned = false,
        original_assets_returned = NULL
    WHERE contract_address = OLD.contract_address
      AND old_nft_id = OLD.old_nft_id;
    
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- CREATE TRIGGERS
-- ============================================================================

-- Triggers for subscribed events
CREATE TRIGGER svk_alt_redemptions_subscribed_insert_trigger
    AFTER INSERT ON "public"."svk_alt_redemptions_subscribed"
    FOR EACH ROW
    EXECUTE FUNCTION handle_subscribed_insert();

CREATE TRIGGER svk_alt_redemptions_subscribed_update_trigger
    AFTER UPDATE ON "public"."svk_alt_redemptions_subscribed"
    FOR EACH ROW
    EXECUTE FUNCTION handle_subscribed_update();

CREATE TRIGGER svk_alt_redemptions_subscribed_delete_trigger
    AFTER DELETE ON "public"."svk_alt_redemptions_subscribed"
    FOR EACH ROW
    EXECUTE FUNCTION handle_subscribed_delete();

-- Triggers for claimed events
CREATE TRIGGER svk_alt_redemptions_claimed_insert_trigger
    AFTER INSERT ON "public"."svk_alt_redemptions_claimed"
    FOR EACH ROW
    EXECUTE FUNCTION handle_claimed_insert();

CREATE TRIGGER svk_alt_redemptions_claimed_update_trigger
    AFTER UPDATE ON "public"."svk_alt_redemptions_claimed"
    FOR EACH ROW
    EXECUTE FUNCTION handle_claimed_update();

CREATE TRIGGER svk_alt_redemptions_claimed_delete_trigger
    AFTER DELETE ON "public"."svk_alt_redemptions_claimed"
    FOR EACH ROW
    EXECUTE FUNCTION handle_claimed_delete();

-- Triggers for unsubscribed events
CREATE TRIGGER svk_alt_redemptions_unsubscribed_insert_trigger
    AFTER INSERT ON "public"."svk_alt_redemptions_unsubscribed"
    FOR EACH ROW
    EXECUTE FUNCTION handle_unsubscribed_insert();

CREATE TRIGGER svk_alt_redemptions_unsubscribed_update_trigger
    AFTER UPDATE ON "public"."svk_alt_redemptions_unsubscribed"
    FOR EACH ROW
    EXECUTE FUNCTION handle_unsubscribed_update();

CREATE TRIGGER svk_alt_redemptions_unsubscribed_delete_trigger
    AFTER DELETE ON "public"."svk_alt_redemptions_unsubscribed"
    FOR EACH ROW
    EXECUTE FUNCTION handle_unsubscribed_delete();


/*
  Warnings:

  - You are about to alter the column `new_nft_id` on the `svk_alt_redemptions_claimed` table. The data in that column could be lost. The data in that column will be cast from `Decimal(78,0)` to `Integer`.
  - You are about to alter the column `old_nft_id` on the `svk_alt_redemptions_claimed` table. The data in that column could be lost. The data in that column will be cast from `Decimal(78,0)` to `Integer`.
  - You are about to alter the column `swap_id` on the `svk_alt_redemptions_claimed` table. The data in that column could be lost. The data in that column will be cast from `Decimal(78,0)` to `Integer`.
  - You are about to alter the column `new_nft_id` on the `svk_alt_redemptions_subscribed` table. The data in that column could be lost. The data in that column will be cast from `Decimal(78,0)` to `Integer`.
  - You are about to alter the column `old_nft_id` on the `svk_alt_redemptions_subscribed` table. The data in that column could be lost. The data in that column will be cast from `Decimal(78,0)` to `Integer`.
  - You are about to alter the column `new_nft_id` on the `svk_alt_redemptions_unsubscribed` table. The data in that column could be lost. The data in that column will be cast from `Decimal(78,0)` to `Integer`.
  - You are about to alter the column `old_nft_id` on the `svk_alt_redemptions_unsubscribed` table. The data in that column could be lost. The data in that column will be cast from `Decimal(78,0)` to `Integer`.
  - A unique constraint covering the columns `[strategy_address]` on the table `strategy_metadata` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "public"."svk_alt_redemptions" ALTER COLUMN "old_nft_id" SET DATA TYPE TEXT,
ALTER COLUMN "new_nft_id" SET DATA TYPE TEXT,
ALTER COLUMN "receivable" SET DATA TYPE TEXT,
ALTER COLUMN "swap_id" SET DATA TYPE TEXT,
ALTER COLUMN "original_assets_returned" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "public"."svk_alt_redemptions_claimed" ALTER COLUMN "new_nft_id" SET DATA TYPE INTEGER,
ALTER COLUMN "old_nft_id" SET DATA TYPE INTEGER,
ALTER COLUMN "receivable" SET DATA TYPE TEXT,
ALTER COLUMN "swap_id" SET DATA TYPE INTEGER;

-- AlterTable
ALTER TABLE "public"."svk_alt_redemptions_subscribed" ALTER COLUMN "new_nft_id" SET DATA TYPE INTEGER,
ALTER COLUMN "old_nft_id" SET DATA TYPE INTEGER;

-- AlterTable
ALTER TABLE "public"."svk_alt_redemptions_unsubscribed" ALTER COLUMN "new_nft_id" SET DATA TYPE INTEGER,
ALTER COLUMN "old_nft_id" SET DATA TYPE INTEGER,
ALTER COLUMN "original_assets_returned" SET DATA TYPE TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "strategy_metadata_strategy_address_key" ON "public"."strategy_metadata"("strategy_address");

-- RenameIndex
ALTER INDEX "public"."svk_alt_redemptions_claimed_block_number_tx_index_event_index_k" RENAME TO "svk_alt_redemptions_claimed_block_number_tx_index_event_ind_key";

-- RenameIndex
ALTER INDEX "public"."svk_alt_redemptions_subscribed_block_number_tx_index_event_inde" RENAME TO "svk_alt_redemptions_subscribed_block_number_tx_index_event__key";

-- RenameIndex
ALTER INDEX "public"."svk_alt_redemptions_unsubscribed_block_number_tx_index_event_in" RENAME TO "svk_alt_redemptions_unsubscribed_block_number_tx_index_even_key";

-- RenameIndex
ALTER INDEX "public"."svk_alt_redemptions_unsubscribed_contract_address_new_nft_id_id" RENAME TO "svk_alt_redemptions_unsubscribed_contract_address_new_nft_i_idx";

-- RenameIndex
ALTER INDEX "public"."svk_alt_redemptions_unsubscribed_contract_address_old_nft_id_id" RENAME TO "svk_alt_redemptions_unsubscribed_contract_address_old_nft_i_idx";
