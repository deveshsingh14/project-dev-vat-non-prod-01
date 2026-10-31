// HISTORICAL — do not run. This one-off script renamed the original
// PascalCase tables to lowercase outside of Prisma migrations. That step is
// now captured by prisma/migrations/20260801000000_rename_tables_to_lowercase,
// so the migration history replays on an empty database on its own.
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const tables = [
    { old: 'User', new: 'user' },
    { old: 'Product', new: 'product' },
    { old: 'Category', new: 'category' },
    { old: 'ProductCategory', new: 'product_category' },
    { old: 'Cart', new: 'cart' },
    { old: 'Wishlist', new: 'wishlist' },
    { old: 'Order', new: 'order' },
    { old: 'OrderItem', new: 'order_item' }
  ];

  for (const table of tables) {
    try {
      await prisma.$executeRawUnsafe(`ALTER TABLE "${table.old}" RENAME TO "${table.new}";`);
      console.log(`Successfully renamed ${table.old} to ${table.new}`);
    } catch (e) {
      console.error(`Failed to rename ${table.old} (might already be renamed or missing): ${e.message}`);
    }
  }
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
