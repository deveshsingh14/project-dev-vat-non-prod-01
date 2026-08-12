const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const prisma = require("../config/db");

const router = express.Router();

router.post("/register", async (req, res) => {

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
        password: hashedPassword
      }
    });

    // CHANGED: never send the (hashed) password back to the client
    const { password: _pw, ...safeUser } = user;

    res.json({
      message: "User registered successfully",
      user: safeUser
    });

  } catch (error) {

    console.log(error);

    res.status(500).json({
      message: "Registration failed"
    });

  }

});

router.post("/login", async (req, res) => {

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

    console.log(error);

    res.status(500).json({
      message: "Login failed"
    });

  }

});

module.exports = router;
