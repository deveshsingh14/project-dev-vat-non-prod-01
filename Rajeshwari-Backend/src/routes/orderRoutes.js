const express = require("express");

const prisma = require("../config/db");

const authMiddleware = require("../middleware/authMiddleware");
const adminOrOwnerMiddleware = require("../middleware/adminOrOwnerMiddleware");

const router = express.Router();

// ---- PLACE ORDER (checkout) ----
// CHANGED: the whole checkout now runs inside ONE transaction that:
//   1. re-reads the cart,
//   2. verifies stock for every line (rejects with a clear message if not),
//   3. decrements stock,
//   4. creates the order (+ payment method),
//   5. clears the cart.
// If any step fails, nothing is committed — no oversell, no ghost orders.
router.post("/checkout", authMiddleware, async (req, res) => {

  try {

    const {
      fullName,
      phone,
      address,
      city,
      state,
      pincode,
      paymentMethod
    } = req.body;

    if (!fullName || !phone || !address || !city || !state || !pincode) {
      return res.status(400).json({
        message: "All delivery details are required"
      });
    }

    const method = paymentMethod === "UPI" ? "UPI" : "COD";

    const order = await prisma.$transaction(async (tx) => {

      const cartItems = await tx.cart.findMany({
        where: { userId: req.user.id },
        include: { product: true }
      });

      if (cartItems.length === 0) {
        throw { code: "EMPTY_CART" };
      }

      // stock check for every line, with a useful error
      for (const item of cartItems) {
        if (item.product.stock < item.quantity) {
          throw {
            code: "OUT_OF_STOCK",
            title: item.product.title,
            available: item.product.stock
          };
        }
      }

      // decrement stock
      for (const item of cartItems) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { decrement: item.quantity } }
        });
      }

      let totalAmount = 0;
      cartItems.forEach(item => {
        totalAmount += item.product.price * item.quantity;
      });

      const created = await tx.order.create({
        data: {
          totalAmount,
          userId: req.user.id,
          fullName,
          phone,
          address,
          city,
          state,
          pincode,
          paymentMethod: method,
          paymentStatus: "Pending",
          orderItems: {
            create: cartItems.map(item => ({
              quantity: item.quantity,
              price: item.product.price,
              productId: item.product.id
            }))
          }
        },
        include: { orderItems: { include: { product: true } } }
      });

      await tx.cart.deleteMany({
        where: { userId: req.user.id }
      });

      return created;
    });

    // Also remember these delivery details on the user profile,
    // so next checkout pre-fills. Best-effort — not part of the txn.
    prisma.user.update({
      where: { id: req.user.id },
      data: { phone, address, city, state, pincode }
    }).catch(() => {});

    res.json({
      message: "Order placed successfully",
      order
    });

  } catch (error) {

    if (error && error.code === "EMPTY_CART") {
      return res.status(400).json({ message: "Cart is empty" });
    }
    if (error && error.code === "OUT_OF_STOCK") {
      return res.status(409).json({
        message: `"${error.title}" only has ${error.available} left in stock. Please adjust your bag.`
      });
    }

    console.log(error);

    res.status(500).json({
      message: "Checkout failed"
    });

  }

});

// ---- GET MY ORDERS (logged-in user) ----
router.get("/", authMiddleware, async (req, res) => {

  try {

    const orders = await prisma.order.findMany({
      where: { userId: req.user.id },
      include: {
        orderItems: { include: { product: true } }
      },
      orderBy: { createdAt: "desc" }
    });

    res.json(orders);

  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Failed to fetch orders" });
  }

});

// ---- GET ALL ORDERS (admin) ----
router.get(
  "/admin/all",
  authMiddleware,
  adminOrOwnerMiddleware,
  async (req, res) => {

    try {

      const orders = await prisma.order.findMany({
        include: {
          user: {
            select: { id: true, name: true, email: true }
          },
          orderItems: { include: { product: true } }
        },
        orderBy: { createdAt: "desc" }
      });

      res.json(orders);

    } catch (error) {
      console.log(error);
      res.status(500).json({ message: "Failed to fetch all orders" });
    }

  }
);

// ---- UPDATE ORDER STATUS (admin) ----
// CHANGED: cancelling an order now RESTOCKS its items (in a transaction).
// Un-cancelling (Cancelled -> anything else) re-decrements, and refuses
// if stock has since run out.
router.put(
  "/:id/status",
  authMiddleware,
  adminOrOwnerMiddleware,
  async (req, res) => {

    try {

      const id = Number(req.params.id);
      const { status } = req.body;

      const allowed = ["Pending", "Shipped", "Delivered", "Cancelled"];
      if (!allowed.includes(status)) {
        return res.status(400).json({ message: "Invalid status value" });
      }

      const updatedOrder = await prisma.$transaction(async (tx) => {

        const order = await tx.order.findUnique({
          where: { id },
          include: { orderItems: true }
        });

        if (!order) throw { code: "NOT_FOUND" };

        const wasCancelled = order.status === "Cancelled";
        const willBeCancelled = status === "Cancelled";

        if (!wasCancelled && willBeCancelled) {
          // restock
          for (const item of order.orderItems) {
            await tx.product.update({
              where: { id: item.productId },
              data: { stock: { increment: item.quantity } }
            });
          }
        }

        if (wasCancelled && !willBeCancelled) {
          // taking it back out of stock — verify first
          for (const item of order.orderItems) {
            const product = await tx.product.findUnique({
              where: { id: item.productId }
            });
            if (!product || product.stock < item.quantity) {
              throw { code: "RESTOCK_FAIL", title: product ? product.title : "A product" };
            }
          }
          for (const item of order.orderItems) {
            await tx.product.update({
              where: { id: item.productId },
              data: { stock: { decrement: item.quantity } }
            });
          }
        }

        return tx.order.update({
          where: { id },
          data: { status }
        });
      });

      res.json(updatedOrder);

    } catch (error) {

      if (error && error.code === "NOT_FOUND") {
        return res.status(404).json({ message: "Order not found" });
      }
      if (error && error.code === "RESTOCK_FAIL") {
        return res.status(409).json({
          message: `Can't reactivate: "${error.title}" no longer has enough stock.`
        });
      }

      console.log(error);
      res.status(500).json({ message: "Failed to update order status" });
    }

  }
);

// ---- UPDATE PAYMENT STATUS (admin) ----
// ADDED: lets the admin mark an order's payment as received/refunded.
router.put(
  "/:id/payment",
  authMiddleware,
  adminOrOwnerMiddleware,
  async (req, res) => {

    try {

      const id = Number(req.params.id);
      const { paymentStatus } = req.body;

      const allowed = ["Pending", "Paid", "Refunded"];
      if (!allowed.includes(paymentStatus)) {
        return res.status(400).json({ message: "Invalid payment status" });
      }

      const order = await prisma.order.update({
        where: { id },
        data: { paymentStatus }
      });

      res.json(order);

    } catch (error) {
      console.log(error);
      res.status(500).json({ message: "Failed to update payment status" });
    }

  }
);

module.exports = router;
