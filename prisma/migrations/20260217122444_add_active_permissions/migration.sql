-- CreateTable: Raw events table for role events
CREATE TABLE "public"."role_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "block_number" INTEGER NOT NULL,
    "tx_index" INTEGER NOT NULL DEFAULT 0,
    "event_index" INTEGER NOT NULL DEFAULT 0,
    "tx_hash" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "contract_address" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "role_name" TEXT NOT NULL,
    "account" TEXT,
    "sender" TEXT,
    "previous_admin_role" TEXT,
    "previous_admin_role_name" TEXT,
    "new_admin_role" TEXT,
    "new_admin_role_name" TEXT,
    "timestamp" INTEGER NOT NULL,
    "_cursor" BIGINT,

    CONSTRAINT "role_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable: State table maintaining current contract roles
CREATE TABLE "public"."contract_roles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "contract_address" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "role_name" TEXT NOT NULL,
    "account" TEXT NOT NULL,
    "role_admin_id" TEXT NOT NULL DEFAULT '0x0000000000000000000000000000000000000000000000000000000000000000',
    "role_admin_name" TEXT NOT NULL DEFAULT 'DEFAULT_ADMIN_ROLE',
    "granted_at_block" INTEGER NOT NULL,
    "granted_at_timestamp" INTEGER NOT NULL,
    "last_modified_block" INTEGER NOT NULL,
    "last_modified_timestamp" INTEGER NOT NULL,

    CONSTRAINT "contract_roles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "role_events_block_number_tx_index_event_index_key" ON "public"."role_events"("block_number", "tx_index", "event_index");

-- CreateIndex
CREATE INDEX "role_events_contract_address_role_idx" ON "public"."role_events"("contract_address", "role");

-- CreateIndex
CREATE INDEX "role_events_contract_address_account_idx" ON "public"."role_events"("contract_address", "account");

-- CreateIndex
CREATE UNIQUE INDEX "contract_roles_contract_address_role_id_account_key" ON "public"."contract_roles"("contract_address", "role_id", "account");

-- CreateIndex
CREATE INDEX "contract_roles_contract_address_idx" ON "public"."contract_roles"("contract_address");

-- CreateIndex
CREATE INDEX "contract_roles_account_idx" ON "public"."contract_roles"("account");

-- CreateIndex
CREATE INDEX "contract_roles_role_admin_id_idx" ON "public"."contract_roles"("role_admin_id");

-- ============================================================================
-- MAIN TRIGGER FUNCTION TO ROUTE EVENTS
-- ============================================================================

CREATE OR REPLACE FUNCTION handle_role_event()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.event_type = 'RoleGranted' THEN
        -- Insert or update contract_roles table
        -- Role names are already decoded during indexing, just copy them!
        INSERT INTO "public"."contract_roles" (
            contract_address, role_id, role_name, account,
            role_admin_id, role_admin_name,
            granted_at_block, granted_at_timestamp,
            last_modified_block, last_modified_timestamp
        )
        VALUES (
            NEW.contract_address, 
            NEW.role, 
            NEW.role_name,  -- Already decoded during indexing!
            NEW.account,
            '0x0000000000000000000000000000000000000000000000000000000000000000',
            'DEFAULT_ADMIN_ROLE',
            NEW.block_number, 
            NEW.timestamp,
            NEW.block_number, 
            NEW.timestamp
        )
        ON CONFLICT (contract_address, role_id, account)
        DO UPDATE SET
            last_modified_block = EXCLUDED.last_modified_block,
            last_modified_timestamp = EXCLUDED.last_modified_timestamp;
            
    ELSIF NEW.event_type = 'RoleRevoked' THEN
        -- Delete from contract_roles table
        DELETE FROM "public"."contract_roles"
        WHERE contract_address = NEW.contract_address
          AND role_id = NEW.role
          AND account = NEW.account;
          
    ELSIF NEW.event_type = 'RoleAdminChanged' THEN
        -- Update all roles with this role_id to have new admin
        -- Admin role names are already decoded during indexing!
        UPDATE "public"."contract_roles"
        SET 
            role_admin_id = NEW.new_admin_role,
            role_admin_name = NEW.new_admin_role_name,  -- Already decoded during indexing!
            last_modified_block = NEW.block_number,
            last_modified_timestamp = NEW.timestamp
        WHERE contract_address = NEW.contract_address
          AND role_id = NEW.role;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- CREATE TRIGGERS
-- ============================================================================

-- Trigger for role events
CREATE TRIGGER role_events_insert_trigger
    AFTER INSERT ON "public"."role_events"
    FOR EACH ROW
    EXECUTE FUNCTION handle_role_event();

CREATE TRIGGER role_events_update_trigger
    AFTER UPDATE ON "public"."role_events"
    FOR EACH ROW
    EXECUTE FUNCTION handle_role_event();

CREATE TRIGGER role_events_delete_trigger
    AFTER DELETE ON "public"."role_events"
    FOR EACH ROW
    EXECUTE FUNCTION handle_role_event();
