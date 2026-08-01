const express = require("express");

const prisma = require("../config/db");

const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");

const router = express.Router();

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
  adminMiddleware,
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
  adminMiddleware,
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

module.exports = router;
