const express = require("express");

const prisma = require("../config/db");

const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/", authMiddleware, async (req, res) => {

  try {

    const {
      productId,
      quantity
    } = req.body;

    // --- validation (added) ---
    const qty = Number(quantity);
    if (!productId || !Number.isInteger(qty) || qty < 1) {
      return res.status(400).json({
        message: "Valid productId and quantity (>= 1) are required"
      });
    }

    const existingCartItem = await prisma.cart.findFirst({
      where: {
        userId: req.user.id,
        productId
      }
    });

    if (existingCartItem) {

      const updatedCart = await prisma.cart.update({
        where: {
          id: existingCartItem.id
        },
        data: {
          quantity: existingCartItem.quantity + qty
        }
      });

      return res.json(updatedCart);
    }

    const cartItem = await prisma.cart.create({
      data: {
        quantity: qty,
        userId: req.user.id,
        productId
      }
    });

    res.json(cartItem);

  } catch (error) {

    console.log(error);

    res.status(500).json({
      message: "Failed to add to cart"
    });

  }

});

router.get("/", authMiddleware, async (req, res) => {

  try {

    const cartItems = await prisma.cart.findMany({

      where: {
        userId: req.user.id
      },

      include: {
        product: true
      }

    });

    res.json(cartItems);

  } catch (error) {

    console.log(error);

    res.status(500).json({
      message: "Failed to fetch cart"
    });

  }

});

router.delete("/:id", authMiddleware, async (req, res) => {

  try {

    const cartItemId = parseInt(req.params.id);

    // CHANGED: scope the delete to the logged-in user.
    // deleteMany lets us match on BOTH id and userId, so one user
    // can never delete another user's cart item by guessing an id.
    const result = await prisma.cart.deleteMany({
      where: {
        id: cartItemId,
        userId: req.user.id
      }
    });

    if (result.count === 0) {
      return res.status(404).json({
        message: "Cart item not found"
      });
    }

    res.json({
      message: "Cart item removed"
    });

  } catch (error) {

    console.log(error);

    res.status(500).json({
      message: "Failed to remove cart item"
    });

  }

});

router.put("/:id", authMiddleware, async (req, res) => {

  try {

    const cartItemId = parseInt(req.params.id);

    const quantity = Number(req.body.quantity);

    if (!Number.isInteger(quantity) || quantity < 1) {
      return res.status(400).json({
        message: "Quantity must be an integer >= 1"
      });
    }

    // CHANGED: ownership check via updateMany (matches id + userId).
    const result = await prisma.cart.updateMany({
      where: {
        id: cartItemId,
        userId: req.user.id
      },
      data: {
        quantity
      }
    });

    if (result.count === 0) {
      return res.status(404).json({
        message: "Cart item not found"
      });
    }

    res.json({
      message: "Quantity updated"
    });

  } catch (error) {

    console.log(error);

    res.status(500).json({
      message: "Failed to update quantity"
    });

  }

});

module.exports = router;
