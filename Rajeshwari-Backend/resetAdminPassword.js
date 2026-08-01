const bcrypt = require("bcrypt");
const prisma = require("./src/config/db");

async function resetAdminPassword() {

  try {

    const hashedPassword =
      await bcrypt.hash("Admin@123", 10);

    await prisma.user.update({

      where: {
        email: "admin@gmail.com"
      },

      data: {
        password: hashedPassword
      }

    });

    console.log("✅ Admin password reset successfully.");
    console.log("Email: admin@gmail.com");
    console.log("Password: btslpatwa");

  } catch (error) {

    console.log(error);

  } finally {

    await prisma.$disconnect();

  }

}

resetAdminPassword();