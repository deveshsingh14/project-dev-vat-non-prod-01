const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const crypto = require("crypto");

const prisma = require("../config/db");
const logger = require("../config/logger");
const { sendEmail } = require("../utils/email");

const authMiddleware = require("../middleware/authMiddleware");
const adminOrOwnerMiddleware = require("../middleware/adminOrOwnerMiddleware");
const { loginLimiter, registerLimiter, forgotPasswordLimiter, resetPasswordLimiter } = require("../middleware/authRateLimiter");

const router = express.Router();

const { OAuth2Client } = require('google-auth-library');
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);


router.post("/register", registerLimiter, async (req, res) => {

  try {

    const {
      name,
      email,
      password
    } = req.body;

    // --- basic validation (added) ---
    if (!name || !email || !password) {
      return res.status(400).json({
        message: "Name, email and password are required"
      });
    }

    const existingUser = await prisma.user.findUnique({
      where: {
        email
      }
    });

    if (existingUser) {
      return res.status(400).json({
        message: "User already exists"
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: "CUSTOMER"
      }
    });

    // CHANGED: never send the (hashed) password back to the client
    const { password: _pw, ...safeUser } = user;

    res.json({
      message: "User registered successfully",
      user: safeUser
    });

  } catch (error) {

    logger.error(error);

    res.status(500).json({
      message: "Registration failed"
    });

  }

});

router.post("/login", loginLimiter, async (req, res) => {

  try {

    const {
      email,
      password
    } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password are required"
      });
    }

    const user = await prisma.user.findUnique({
      where: {
        email
      }
    });

    if (!user) {
      logger.info(`Login failed: user not found for email ${email}`);
      // CHANGED: same generic message for "no user" and "wrong password"
      // so you don't leak which emails are registered.
      return res.status(400).json({
        message: "Invalid credentials"
      });
    }

    const isPasswordCorrect = await bcrypt.compare(
      password,
      user.password
    );

    if (!isPasswordCorrect) {
      logger.info(`Login failed: wrong password for email ${email}`);
      return res.status(400).json({
        message: "Invalid credentials"
      });
    }

    const token = jwt.sign(
      {
        id: user.id,
        role: user.role
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "7d"
      }
    );

    // CHANGED: strip password out of the returned user object
    const { password: _pw, ...safeUser } = user;

    res.json({
      message: "Login successful",
      token,
      user: safeUser
    });

  } catch (error) {

    logger.error(error);

    res.status(500).json({
      message: "Login failed"
    });

  }

});

router.post("/forgot-password", forgotPasswordLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      // Return 200 to prevent email enumeration
      return res.status(200).json({ message: "If an account with that email exists, we sent a password reset link." });
    }

    // Generate token
    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetTokenHash = crypto.createHash("sha256").update(resetToken).digest("hex");

    // Set expiry to 1 hour from now
    const resetTokenExpires = new Date(Date.now() + 3600000);

    await prisma.user.update({
      where: { email },
      data: {
        resetPasswordToken: resetTokenHash,
        resetPasswordExpires: resetTokenExpires,
      }
    });

    // Frontend URL format for resetting password
    const resetUrl = `${req.protocol}://${req.get("host")}/reset-password.html?token=${resetToken}`;
    const message = `
      <h1>You requested a password reset</h1>
      <p>Please go to this link to reset your password:</p>
      <a href="${resetUrl}" target="_blank">Reset Password</a>
    `;

    await sendEmail({
      to: user.email,
      subject: "Password Reset Request",
      html: message,
    });

    res.status(200).json({ message: "If an account with that email exists, we sent a password reset link." });
  } catch (error) {
    logger.error("Forgot password error: ", error);
    res.status(500).json({ message: "Email could not be sent" });
  }
});

router.post("/reset-password/:token", resetPasswordLimiter, async (req, res) => {
  try {
    const { token } = req.params;
    const { newPassword } = req.body;

    if (!newPassword) {
      return res.status(400).json({ message: "New password is required" });
    }

    const resetTokenHash = crypto.createHash("sha256").update(token).digest("hex");

    const user = await prisma.user.findFirst({
      where: {
        resetPasswordToken: resetTokenHash,
        resetPasswordExpires: {
          gt: new Date(),
        }
      }
    });

    if (!user) {
      return res.status(400).json({ message: "Invalid or expired token" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        resetPasswordToken: null,
        resetPasswordExpires: null,
      }
    });

    res.status(200).json({ message: "Password updated successfully" });
  } catch (error) {
    logger.error("Reset password error: ", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/change-password", authMiddleware, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ message: "Old and new password are required" });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id }
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Incorrect old password" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id: req.user.id },
      data: { password: hashedPassword }
    });

    res.status(200).json({ message: "Password changed successfully" });
  } catch (error) {
    logger.error("Change password error: ", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/google", async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ message: "No token provided" });

    // Verify token with Google
    const ticket = await googleClient.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const { email, name, sub: googleId } = payload;

    if (!email) return res.status(400).json({ message: "No email in Google profile" });
    if (!payload.email_verified) return res.status(400).json({ message: "Google email not verified" });

    // Find or create user
    let user = await prisma.user.findFirst({
      where: {
        OR: [
          { googleId },
          { email }
        ]
      }
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          name,
          googleId,
          role: "CUSTOMER", // default
        }
      });
    } else {
      // If user exists but doesn't have googleId linked, link it now
      if (!user.googleId) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { googleId }
        });
      }
    }

    const jwtToken = jwt.sign(
      { id: user.id, role: user.role, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({ token: jwtToken, user: { name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    logger.error("Google login error: ", err);
    res.status(500).json({ message: "Google login failed" });
  }
});

// ==== GET GOOGLE CLIENT ID FOR FRONTEND ====
router.get("/google-client-id", (req, res) => {
  res.json({ clientId: process.env.GOOGLE_CLIENT_ID });
});

module.exports = router;
