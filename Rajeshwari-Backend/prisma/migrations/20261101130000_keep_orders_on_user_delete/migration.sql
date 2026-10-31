-- Orders are business records: deleting a customer account must not
-- delete their orders. Before: order.userId -> user ON DELETE CASCADE.
-- After: the order is unlinked (userId NULL) and keeps an email snapshot
-- alongside the delivery details it already stores.

-- 1. email snapshot, backfilled from the current account
ALTER TABLE "order" ADD COLUMN "customerEmail" TEXT;

UPDATE "order" o
SET "customerEmail" = u."email"
FROM "user" u
WHERE o."userId" = u."id" AND o."customerEmail" IS NULL;

-- 2. deleting the user now unlinks instead of deleting
ALTER TABLE "order" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "order" DROP CONSTRAINT "order_userId_fkey";
ALTER TABLE "order" ADD CONSTRAINT "order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
