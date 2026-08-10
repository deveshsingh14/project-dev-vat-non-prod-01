require("dotenv").config();
const bcrypt = require("bcrypt");
const prisma = require("./src/config/db");

async function resetAdminPassword() {

  try {

    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminEmail || !adminPassword) {
      console.error("❌ Missing ADMIN_EMAIL or ADMIN_PASSWORD in .env");
      process.exit(1);
    }

    const hashedPassword =
      await bcrypt.hash(adminPassword, 10);

    await prisma.user.update({

      where: {
        email: adminEmail
      },

      data: {
        password: hashedPassword
      }

    });

    console.log("✅ Admin password reset successfully.");
    console.log(`Email: ${adminEmail}`);
    console.log("Password: [SECURELY STORED IN .ENV]");

  } catch (error) {

    console.log(error);

  } finally {

    await prisma.$disconnect();

  }

}

resetAdminPassword();