const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function updateRoles() {
  await prisma.$executeRawUnsafe(`UPDATE "user" SET role = 'CUSTOMER' WHERE role = 'customer';`);
  await prisma.$executeRawUnsafe(`UPDATE "user" SET role = 'ADMIN' WHERE role = 'admin';`);
  await prisma.$executeRawUnsafe(`UPDATE "user" SET role = 'OWNER' WHERE role = 'owner';`);
  console.log("Updated roles to uppercase");
}

updateRoles()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
