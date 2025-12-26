-- CreateTable
CREATE TABLE "public"."lst_price_sync_progress" (
    "id" TEXT NOT NULL DEFAULT 'lst_price_sync',
    "last_processed_block" INTEGER,

    CONSTRAINT "lst_price_sync_progress_pkey" PRIMARY KEY ("id")
);
