-- CreateTable
CREATE TABLE "shared"."token_metadata" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "address" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "decimals" INTEGER NOT NULL,
    "pragma_pair_id" TEXT NOT NULL,

    CONSTRAINT "token_metadata_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "token_metadata_address_key" ON "shared"."token_metadata"("address");
