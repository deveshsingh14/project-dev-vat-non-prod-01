-- Marks a category as jewellery (Jewellery & Bangles page) vs the main feed.
-- Additive and backward-compatible: existing rows default to false.
ALTER TABLE "category" ADD COLUMN "isJewellery" BOOLEAN NOT NULL DEFAULT false;
