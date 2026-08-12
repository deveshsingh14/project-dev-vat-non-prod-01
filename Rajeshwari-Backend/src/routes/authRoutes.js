const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const prisma = require("../config/db");
const admin = require("../config/firebase");

const router = express.Router();

// ---- LEGACY EMAIL LOGIN (SUPERADMIN ONLY) ----
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    // Only allow the Superadmin to login via email/password
    if (email !== "devesh141singh@gmail.com") {
      return res.status(403).json({ message: "Email login is disabled for regular users. Please use phone login." });
    }

    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const isPasswordCorrect = await bcrypt.compare(password, user.password);

    if (!isPasswordCorrect) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    const { password: _pw, ...safeUser } = user;

    res.json({
      message: "Login successful",
      token,
      user: safeUser
    });

  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Login failed" });
  }
});

// ---- PHONE OTP LOGIN (REGULAR USERS) ----
router.post("/phone-login", async (req, res) => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({ message: "Firebase ID Token is required" });
    }

    // 1. Verify the Firebase token
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const phoneNumber = decodedToken.phone_number;

    if (!phoneNumber) {
      return res.status(400).json({ message: "No phone number found in token" });
    }

    // 2. Find or Create the user in our database
    let user = await prisma.user.findUnique({
      where: { phone: phoneNumber }
    });

    let isNewUser = false;
    if (!user) {
      user = await prisma.user.create({
        data: {
          phone: phoneNumber,
          name: "User_" + phoneNumber.slice(-4), // Default name
          role: "CUSTOMER"
        }
      });
      isNewUser = true;
    }

    // 3. Issue our own standard JWT so the rest of the app works seamlessly
    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    const { password: _pw, ...safeUser } = user;

    res.json({
      message: isNewUser ? "Account created successfully" : "Login successful",
      token,
      user: safeUser
    });

  } catch (error) {
    console.error("Phone login error:", error);
    res.status(401).json({ message: "Authentication failed. Invalid or expired token." });
  }
});

module.exports = router;
