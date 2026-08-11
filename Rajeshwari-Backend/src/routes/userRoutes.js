const express = require("express");

const prisma = require("../config/db");

const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");
const adminOrOwnerMiddleware = require("../middleware/adminOrOwnerMiddleware");
const bcrypt = require("bcrypt");

const router = express.Router();

// In-memory toggle for owner promotions, defaults to env var or true
let ownerPromotionsEnabled = process.env.ENABLE_OWNER_PROMOTION !== "false";

// ---- MY PROFILE (any logged-in user) ----
// ADDED: lets a customer read their own profile + saved delivery details.
// Defined before "/:id/orders" so "me" is never treated as an id.
router.get("/me", authMiddleware, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true, name: true, email: true, role: true,
        phone: true, address: true, city: true, state: true, pincode: true,
        createdAt: true
      }
    });
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Failed to fetch profile" });
  }
});

// ---- UPDATE MY PROFILE ----
// ADDED: name + delivery details only. Email, role and password are
// deliberately NOT updatable here (role for security; email/password
// deserve their own verified flows later).
router.put("/me", authMiddleware, async (req, res) => {
  try {
    const { name, phone, address, city, state, pincode } = req.body;

    if (name !== undefined && !String(name).trim()) {
      return res.status(400).json({ message: "Name cannot be empty" });
    }

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: { name, phone, address, city, state, pincode },
      select: {
        id: true, name: true, email: true, role: true,
        phone: true, address: true, city: true, state: true, pincode: true
      }
    });
    res.json(user);
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Failed to update profile" });
  }
});

// ---- LIST CUSTOMERS (admin) ----
// Returns every user (without password) plus a few aggregates the admin
// panel needs: how many orders they've placed and how much they've spent
// (cancelled orders excluded from the spend total).
router.get(
  "/",
  authMiddleware,
  adminOrOwnerMiddleware,
  async (req, res) => {
    try {
      const users = await prisma.user.findMany({
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          createdAt: true,
          orders: {
            select: {
              totalAmount: true,
              status: true,
              createdAt: true
            }
          }
        },
        orderBy: { createdAt: "desc" }
      });

      const customers = users.map(u => {
        const orders = u.orders || [];

        const totalSpent = orders
          .filter(o => o.status !== "Cancelled")
          .reduce((sum, o) => sum + o.totalAmount, 0);

        const lastOrder = orders.length
          ? orders.reduce((a, b) =>
              new Date(a.createdAt) > new Date(b.createdAt) ? a : b
            )
          : null;

        return {
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
          createdAt: u.createdAt,
          orderCount: orders.length,
          totalSpent,
          lastOrderAt: lastOrder ? lastOrder.createdAt : null
        };
      });

      res.json(customers);
    } catch (error) {
      console.log(error);
      res.status(500).json({
        message: "Failed to fetch customers"
      });
    }
  }
);

// ---- ONE CUSTOMER'S ORDERS (admin) ----
router.get(
  "/:id/orders",
  authMiddleware,
  adminOrOwnerMiddleware,
  async (req, res) => {
    try {
      const userId = Number(req.params.id);

      const orders = await prisma.order.findMany({
        where: { userId },
        include: {
          orderItems: {
            include: { product: true }
          }
        },
        orderBy: { createdAt: "desc" }
      });

      res.json(orders);
    } catch (error) {
      console.log(error);
      res.status(500).json({
        message: "Failed to fetch customer orders"
      });
    }
  }
);

// ---- GET PROMOTION STATUS (admin only) ----
router.get(
  "/promotion-status",
  authMiddleware,
  adminMiddleware,
  (req, res) => {
    res.json({ enabled: ownerPromotionsEnabled });
  }
);

// ---- TOGGLE PROMOTION STATUS (admin only) ----
router.put(
  "/promotion-status",
  authMiddleware,
  adminMiddleware,
  (req, res) => {
    if (typeof req.body.enabled !== "boolean") {
      return res.status(400).json({ message: "Invalid payload, expected boolean 'enabled'" });
    }
    ownerPromotionsEnabled = req.body.enabled;
    res.json({ message: "Promotion status updated", enabled: ownerPromotionsEnabled });
  }
);

// ---- PROMOTE CUSTOMER TO OWNER (admin only) ----
router.put(
  "/:id/promote",
  authMiddleware,
  adminMiddleware,
  async (req, res) => {
    try {
      if (!ownerPromotionsEnabled) {
        return res.status(403).json({ message: "Owner promotion feature is disabled" });
      }

      const id = Number(req.params.id);
      const user = await prisma.user.update({
        where: { id },
        data: { role: "OWNER" },
        select: { id: true, name: true, email: true, role: true }
      });
      res.json({ message: "User promoted to OWNER successfully", user });
    } catch (error) {
      console.log(error);
      res.status(500).json({ message: "Failed to promote user" });
    }
  }
);

// ---- CREATE NEW OWNER ACCOUNT (admin only) ----
router.post(
  "/create-owner",
  authMiddleware,
  adminMiddleware,
  async (req, res) => {
    try {
      const { name, email, password } = req.body;

      if (!name || !email || !password) {
        return res.status(400).json({ message: "Name, email and password are required" });
      }

      const existingUser = await prisma.user.findUnique({ where: { email } });
      if (existingUser) {
        return res.status(400).json({ message: "User already exists" });
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      const user = await prisma.user.create({
        data: {
          name,
          email,
          password: hashedPassword,
          role: "OWNER"
        }
      });

      const { password: _pw, ...safeUser } = user;
      res.json({ message: "Owner created successfully", user: safeUser });
    } catch (error) {
      console.log(error);
      res.status(500).json({ message: "Failed to create owner account" });
    }
  }
);

module.exports = router;
