-- CreateTable
CREATE TABLE "public"."manage_roots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "manager_address" TEXT NOT NULL,
    "strategist_address" TEXT NOT NULL,
    "merkle_root" TEXT NOT NULL,
    "last_modified_block" INTEGER NOT NULL,
    "last_modified_timestamp" INTEGER NOT NULL,
    "tx_hash" TEXT NOT NULL,
    "_cursor" BIGINT,

    CONSTRAINT "manage_roots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "manage_roots_manager_address_idx" ON "public"."manage_roots"("manager_address");

-- CreateIndex
CREATE INDEX "manage_roots_strategist_address_idx" ON "public"."manage_roots"("strategist_address");

-- CreateIndex
CREATE UNIQUE INDEX "manage_roots_manager_address_strategist_address_key" ON "public"."manage_roots"("manager_address", "strategist_address");
