const express = require("express");

const prisma = require("../config/db");

const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/", authMiddleware, async (req, res) => {

  try {

    const {
      productId
    } = req.body;

    if (!productId) {
      return res.status(400).json({
        message: "productId is required"
      });
    }

    const existingWishlistItem =
      await prisma.wishlist.findFirst({
        where: {
          userId: req.user.id,
          productId
        }
      });

    if (existingWishlistItem) {
      return res.status(400).json({
        message: "Already in wishlist"
      });
    }

    const wishlistItem =
      await prisma.wishlist.create({
        data: {
          userId: req.user.id,
          productId
        }
      });

    res.json(wishlistItem);

  } catch (error) {

    console.log(error);

    res.status(500).json({
      message: "Failed to add to wishlist"
    });

  }

});

router.get("/", authMiddleware, async (req, res) => {

  try {

    const wishlistItems =
      await prisma.wishlist.findMany({
        where: {
          userId: req.user.id
        },
        include: {
          product: true
        }
      });

    res.json(wishlistItems);

  } catch (error) {

    console.log(error);

    res.status(500).json({
      message: "Failed to fetch wishlist"
    });

  }

});

router.delete("/:id", authMiddleware, async (req, res) => {

  try {

    const id = Number(req.params.id);

    // CHANGED: match on id AND userId so a user can only remove
    // their own wishlist items (previously any user could delete
    // any wishlist row by id).
    const result = await prisma.wishlist.deleteMany({
      where: {
        id,
        userId: req.user.id
      }
    });

    if (result.count === 0) {
      return res.status(404).json({
        message: "Wishlist item not found"
      });
    }

    res.json({
      message: "Wishlist item removed"
    });

  } catch (error) {

    console.log(error);

    res.status(500).json({
      message: "Failed to remove wishlist item"
    });

  }

});

module.exports = router;
