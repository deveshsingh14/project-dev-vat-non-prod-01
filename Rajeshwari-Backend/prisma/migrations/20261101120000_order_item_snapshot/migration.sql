-- Keep order history when a product is deleted.
-- Before: order_item.productId -> product ON DELETE CASCADE, so deleting a
-- product silently deleted it from every past order (e.g. orders #1 and #8
-- lost a ₹299 line). After: order lines keep a title/image snapshot and the
-- link is set to NULL instead.

-- 1. snapshot columns
ALTER TABLE "order_item" ADD COLUMN "title" TEXT,
ADD COLUMN "image" TEXT;

-- 2. backfill existing lines from the product as it is today
--    (the best information available; prices were already stored per line)
UPDATE "order_item" oi
SET "title" = p."title", "image" = p."image"
FROM "product" p
WHERE oi."productId" = p."id" AND oi."title" IS NULL;

-- 3. product deletion now unlinks instead of deleting history
ALTER TABLE "order_item" ALTER COLUMN "productId" DROP NOT NULL;
ALTER TABLE "order_item" DROP CONSTRAINT "order_item_productId_fkey";
ALTER TABLE "order_item" ADD CONSTRAINT "order_item_productId_fkey" FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
