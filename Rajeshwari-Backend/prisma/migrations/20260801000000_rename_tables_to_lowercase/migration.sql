-- Bridge migration: reproduces the table renames that were originally done
-- outside of migrations (rename_tables.js), so the full history replays on an
-- empty database. Every step is guarded: on a database that already has the
-- lowercase tables (production), this migration changes nothing.
--
-- Part 1: rename tables + their constraints, indexes and id sequences
-- ("User" -> "user", "User_pkey" -> "user_pkey", "User_id_seq" -> "user_id_seq", ...).
DO $$
DECLARE
  m   record;
  obj record;
BEGIN
  FOR m IN
    SELECT * FROM (VALUES
      ('User', 'user'), ('Product', 'product'), ('Category', 'category'),
      ('ProductCategory', 'product_category'), ('Cart', 'cart'), ('Wishlist', 'wishlist'),
      ('Order', 'order'), ('OrderItem', 'order_item')
    ) AS t(old_name, new_name)
  LOOP
    -- exact-case check (to_regclass('User') would fold to lowercase "user")
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = 'public' AND table_name = m.old_name)
       AND NOT EXISTS (SELECT 1 FROM information_schema.tables
                       WHERE table_schema = 'public' AND table_name = m.new_name) THEN

      EXECUTE format('ALTER TABLE public.%I RENAME TO %I', m.old_name, m.new_name);

      -- constraints (pkey / fkey / unique); renaming a pkey or unique constraint
      -- also renames its backing index
      FOR obj IN
        SELECT c.conname FROM pg_constraint c
        WHERE c.conrelid = format('public.%I', m.new_name)::regclass
          AND c.conname LIKE m.old_name || '\_%'
      LOOP
        EXECUTE format('ALTER TABLE public.%I RENAME CONSTRAINT %I TO %I',
                       m.new_name, obj.conname,
                       m.new_name || substr(obj.conname, length(m.old_name) + 1));
      END LOOP;

      -- remaining indexes (e.g. unique indexes created with CREATE UNIQUE INDEX)
      FOR obj IN
        SELECT i.indexname FROM pg_indexes i
        WHERE i.schemaname = 'public' AND i.tablename = m.new_name
          AND i.indexname LIKE m.old_name || '\_%'
      LOOP
        EXECUTE format('ALTER INDEX public.%I RENAME TO %I', obj.indexname,
                       m.new_name || substr(obj.indexname, length(m.old_name) + 1));
      END LOOP;

      -- id sequence
      IF EXISTS (SELECT 1 FROM pg_class WHERE relkind = 'S'
                 AND relnamespace = 'public'::regnamespace AND relname = m.old_name || '_id_seq') THEN
        EXECUTE format('ALTER SEQUENCE public.%I RENAME TO %I', m.old_name || '_id_seq', m.new_name || '_id_seq');
      END IF;
    END IF;
  END LOOP;
END $$;

-- Part 2: catch up schema changes that were applied directly to the database
-- (prisma db push) and never captured in a migration. Idempotent: production
-- already has all of this, so these statements change nothing there.
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "googleId" TEXT;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "resetPasswordToken" TEXT;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "resetPasswordExpires" TIMESTAMP(3);
ALTER TABLE "user" ALTER COLUMN "name" DROP NOT NULL;
ALTER TABLE "user" ALTER COLUMN "email" DROP NOT NULL;
ALTER TABLE "user" ALTER COLUMN "password" DROP NOT NULL;
ALTER TABLE "user" ALTER COLUMN "role" SET DEFAULT 'CUSTOMER';
CREATE UNIQUE INDEX IF NOT EXISTS "user_googleId_key" ON "user"("googleId");
CREATE UNIQUE INDEX IF NOT EXISTS "user_phone_key" ON "user"("phone");

ALTER TABLE "order" ADD COLUMN IF NOT EXISTS "deliveryPartnerId" INTEGER;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'order_deliveryPartnerId_fkey'
                   AND conrelid = 'public."order"'::regclass) THEN
    ALTER TABLE "order" ADD CONSTRAINT "order_deliveryPartnerId_fkey"
      FOREIGN KEY ("deliveryPartnerId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
