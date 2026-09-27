const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkUser() {
  const users = await prisma.user.findMany();
  console.log("Found users:");
  console.log(users);
}

checkUser()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
