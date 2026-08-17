const upload = require("../middleware/uploadMiddleware");
const authMiddleware = require("../middleware/authMiddleware");
const adminOrOwnerMiddleware = require("../middleware/adminOrOwnerMiddleware");
const express = require("express");
const prisma = require("../config/db");

const router = express.Router();

const multer = require("multer");
const fs = require("fs");
const csv = require("csv-parser");

const csvUpload = multer({ dest: "uploads/csv/" });

// ---- BULK UPLOAD PRODUCTS (ETL) ----
router.post("/bulk-upload", authMiddleware, adminOrOwnerMiddleware, csvUpload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: "No CSV file uploaded" });

  const results = [];
  fs.createReadStream(req.file.path)
    .pipe(csv())
    .on("data", (data) => results.push(data))
    .on("end", async () => {
      try {
        let successCount = 0;
        let errors = [];

        for (const row of results) {
          try {
            const { title, description, price, image, stock, keywords, category } = row;
            // Ignore completely empty rows (e.g. from trailing commas in CSV)
            if (!title && !price && !category) {
              continue;
            }

            if (!title || !price) {
              errors.push(`Row missing required fields (title or price): ${title || "Unknown"}`);
              continue;
            }

            let catData = undefined;
            if (category) {
              // Create or find category
              const catName = category.trim();
              let catRecord = await prisma.category.findUnique({ where: { name: catName } });
              if (!catRecord) {
                catRecord = await prisma.category.create({ data: { name: catName } });
              }
              catData = { create: [{ categoryId: catRecord.id }] };
            }

            await prisma.product.create({
              data: {
                title,
                description: description || "",
                price: parseFloat(price) || 0,
                image,
                stock: parseInt(stock) || 0,
                keywords: keywords || "",
                categories: catData
              }
            });
            successCount++;
          } catch (rowErr) {
            errors.push(`Error processing ${row.title}: ${rowErr.message}`);
          }
        }
        
        fs.unlinkSync(req.file.path); // cleanup

        res.json({
          message: `Successfully uploaded ${successCount} products`,
          errors: errors.length ? errors : undefined
        });
      } catch (e) {
        console.error(e);
        res.status(500).json({ message: "Failed to process CSV" });
      }
    });
});

// ---- GET ALL PRODUCTS (public) ----
router.get("/", async (req, res) => {
  try {
    const products = await prisma.product.findMany({
      include: {
        categories: {
          include: {
            category: true
          }
        }
      }
    });

    res.json(products);
  } catch (error) {
    console.log(error);
    res.status(500).json({
      message: "Error fetching products"
    });
  }
});

// ---- GET SINGLE PRODUCT BY ID (public) ----
// FIXED: was registered as router.get("/", authMiddleware, adminMiddleware,...)
//   - wrong path: "/" instead of "/:id" (so it never worked as a lookup)
//   - wrongly locked behind admin auth (a single product should be public,
//     same as the list above)
router.get("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);

    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        categories: {
          include: {
            category: true
          }
        }
      }
    });

    if (!product) {
      return res.status(404).json({
        message: "Product not found"
      });
    }

    res.json(product);
  } catch (error) {
    console.log(error);
    res.status(500).json({
      message: "Error fetching product"
    });
  }
});

// ---- CREATE PRODUCT (admin) ----
router.post(
  "/",
  authMiddleware,
  adminOrOwnerMiddleware,
  async (req, res) => {
    try {
      const {
        title,
        description,
        price,
        image,
        stock,
        keywords,
        categoryIds
      } = req.body;

      const product = await prisma.product.create({
        data: {
          title,
          description,
          price: Number(price),
          image,
          stock: Number(stock),
          keywords,
          categories: {
            create: (categoryIds || []).map(id => ({
              category: {
                connect: { id }
              }
            }))
          }
        },
        include: {
          categories: {
            include: {
              category: true
            }
          }
        }
      });

      // FIXED: there were two res.json(product) calls here. The second
      // one would throw "Cannot set headers after they are sent".
      res.json(product);
    } catch (error) {
      console.log(error);
      res.status(500).json({
        message: "Something went wrong"
      });
    }
  }
);

// ---- UPDATE PRODUCT (admin) ----
// Confirmed against schema.prisma: Product has no scalar `category` field
// (categories are a many-to-many via the ProductCategory join table), so
// the old scalar `category` write is gone. If `categoryIds` is sent, we
// reset the product's category links to exactly that set, inside a
// transaction so a half-updated state can't be left behind.
router.put(
  "/:id",
  authMiddleware,
  adminOrOwnerMiddleware,
  async (req, res) => {
    try {
      const id = Number(req.params.id);

      const {
        title,
        description,
        price,
        image,
        stock,
        keywords,
        categoryIds
      } = req.body;

      const updatedProduct = await prisma.$transaction(async (tx) => {

        const product = await tx.product.update({
          where: { id },
          data: {
            title,
            description,
            price: price !== undefined ? Number(price) : undefined,
            image,
            stock: stock !== undefined ? Number(stock) : undefined,
            keywords
          }
        });

        // Only touch category links if the client actually sent an array.
        if (Array.isArray(categoryIds)) {

          // Clear existing links for this product...
          await tx.productCategory.deleteMany({
            where: { productId: id }
          });

          // ...then recreate them from the new set.
          if (categoryIds.length > 0) {
            await tx.productCategory.createMany({
              data: categoryIds.map(categoryId => ({
                productId: id,
                categoryId: Number(categoryId)
              }))
            });
          }
        }

        return tx.product.findUnique({
          where: { id },
          include: {
            categories: {
              include: { category: true }
            }
          }
        });
      });

      res.json(updatedProduct);
    } catch (error) {
      console.log(error);
      res.status(500).json({
        message: "Error updating product"
      });
    }
  }
);

// ---- DELETE PRODUCT (admin) ----
router.delete(
  "/:id",
  authMiddleware,
  adminOrOwnerMiddleware,
  async (req, res) => {
    try {
      const id = Number(req.params.id);

      await prisma.cart.deleteMany({ where: { productId: id } });
      await prisma.wishlist.deleteMany({ where: { productId: id } });
      await prisma.orderItem.deleteMany({ where: { productId: id } });

      await prisma.product.delete({ where: { id } });

      res.json({ message: "Product deleted" });
    } catch (error) {
      console.log(error);
      res.status(500).json({
        message: "Error deleting product"
      });
    }
  }
);

// ---- IMAGE UPLOAD (admin) ----
// CHANGED: multer errors (bad type / >5MB) now return a clean 400
// instead of falling through to a generic 500.
router.post(
  "/upload",
  authMiddleware,
  adminOrOwnerMiddleware,
  (req, res, next) => {
    upload.single("image")(req, res, (err) => {
      if (err) {
        return res.status(400).json({
          message: err.message || "Upload rejected"
        });
      }
      next();
    });
  },
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          message: "No image uploaded"
        });
      }

      // CHANGED: return a RELATIVE path. The frontend prefixes API_URL
      // itself (see imgSrc in store.js / admin), so images keep working
      // no matter where the API is deployed.
      res.json({
        message: "Image uploaded successfully",
        imageUrl: `/uploads/${req.file.filename}`
      });
    } catch (error) {
      console.log(error);
      res.status(500).json({
        message: "Upload failed"
      });
    }
  }
);

module.exports = router;
