-- AlterTable
ALTER TABLE "public"."token_metadata" ALTER COLUMN "pragma_pair_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "public"."token_metadata" ADD COLUMN "pegged_asset" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "token_metadata_pragma_pair_id_key" ON "public"."token_metadata"("pragma_pair_id");

-- CreateIndex
CREATE INDEX "token_metadata_pegged_asset_idx" ON "public"."token_metadata"("pegged_asset");

-- AddForeignKey
ALTER TABLE "public"."token_metadata"
ADD CONSTRAINT "token_metadata_pegged_asset_fkey"
FOREIGN KEY ("pegged_asset") REFERENCES "public"."token_metadata"("address")
ON DELETE SET NULL ON UPDATE CASCADE;
