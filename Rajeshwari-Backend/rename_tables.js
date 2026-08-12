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
