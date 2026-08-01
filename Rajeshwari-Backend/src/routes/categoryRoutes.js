const express = require("express");

const prisma = require("../config/db");

const authMiddleware =
  require("../middleware/authMiddleware");

const adminMiddleware =
  require("../middleware/adminMiddleware");

const router = express.Router();



// CREATE CATEGORY
router.post(
  "/",
  authMiddleware,
  adminMiddleware,
  async (req, res) => {

    try {

      const { name } = req.body;

      const existingCategory =
        await prisma.category.findUnique({

          where: { name }

        });

      if (existingCategory) {

        return res.status(400).json({

          message:
            "Category already exists"

        });

      }

      const category =
        await prisma.category.create({

          data: { name }

        });

      res.json(category);

    } catch (error) {

      console.log(error);

      res.status(500).json({

        message:
          "Failed to create category"

      });

    }

  }
);



// GET ALL CATEGORIES
router.get(
  "/",
  async (req, res) => {

    try {

      const categories =
        await prisma.category.findMany({

          orderBy: {
            createdAt: "desc"
          }

        });

      res.json(categories);

    } catch (error) {

      console.log(error);

      res.status(500).json({

        message:
          "Failed to fetch categories"

      });

    }

  }
);



// DELETE CATEGORY
router.delete(
  "/:id",
  authMiddleware,
  adminMiddleware,
  async (req, res) => {

    try {

      const id =
        Number(req.params.id);

      await prisma.productCategory.deleteMany({

        where: {
          categoryId: id
        }

      });

      await prisma.category.delete({

        where: { id }

      });

      res.json({

        message:
          "Category deleted"

      });

    } catch (error) {

      console.log(error);

      res.status(500).json({

        message:
          "Failed to delete category"

      });

    }

  }
);

module.exports = router;