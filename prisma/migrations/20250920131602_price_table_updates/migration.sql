/*
  Warnings:

  - You are about to drop the column `price_sum` on the `prices` table. All the data in the column will be lost.
  - You are about to drop the column `sources_count` on the `prices` table. All the data in the column will be lost.
  - Added the required column `pragma_decimals` to the `token_metadata` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "shared"."prices" DROP COLUMN "price_sum",
DROP COLUMN "sources_count";

-- AlterTable
ALTER TABLE "shared"."token_metadata" ADD COLUMN     "pragma_decimals" INTEGER NOT NULL;

-- CreateIndex
CREATE INDEX "raw_price_events_pair_id_timestamp_idx" ON "shared"."raw_price_events"("pair_id", "timestamp");

-- CreateIndex
CREATE INDEX "raw_price_events_timestamp_pair_id_idx" ON "shared"."raw_price_events"("timestamp", "pair_id");
