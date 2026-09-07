const upload = require("../middleware/uploadMiddleware");
const authMiddleware = require("../middleware/authMiddleware");
const adminOrOwnerMiddleware = require("../middleware/adminOrOwnerMiddleware");
const express = require("express");
const prisma = require("../config/db");
const logger = require("../config/logger");
const cloudinary = require("../config/cloudinary");
const { z } = require("zod");
const { validateBody } = require("../middleware/validate");

const router = express.Router();

// Product.description is a required (non-nullable) String in the
// schema, but a blank one is fine — only title/price/stock actually
// need to reject bad input; those were previously ungated, so
// title:undefined or price:"abc" silently created a broken row
// (empty title, price: NaN) instead of a clean 400.
const productCreateSchema = z.object({
  title: z.string().trim().min(1, "Title is required"),
  description: z.string().default(""),
  price: z.coerce.number().positive("Price must be a positive number"),
  stock: z.coerce.number().int("Stock must be a whole number").nonnegative("Stock must not be negative"),
  image: z.string().nullish(),
  keywords: z.string().nullish(),
  categoryIds: z.array(z.coerce.number().int()).optional()
});

// Same shape, every field optional — PUT /:id only updates what's sent.
// `description` needs its `.default("")` stripped back out here: Zod
// applies a field's default whenever it's absent, even on a .partial()
// schema, which was silently clobbering an existing description to ""
// on any partial update that didn't include it.
const productUpdateSchema = productCreateSchema.partial().extend({
  description: z.string().optional()
});

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
        const categoryCache = new Map();

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
              let catRecord = categoryCache.get(catName);
              if (!catRecord) {
                catRecord = await prisma.category.findUnique({ where: { name: catName } });
                if (!catRecord) {
                  catRecord = await prisma.category.create({ data: { name: catName } });
                }
                categoryCache.set(catName, catRecord);
              }
              catData = { create: [{ categoryId: catRecord.id }] };
            }

            await prisma.product.create({
              data: {
                title,
                description: description || "",
                price: parseFloat(price) || 0,
                image: image && image.trim() ? image.trim() : null,
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
        logger.error(e);
        res.status(500).json({ message: "Failed to process CSV" });
      }
    });
});

// ---- GET ALL PRODUCTS (public) ----
// CHANGED: paginated — an unbounded findMany was returning the entire
// catalog (with nested categories) on every request, which was the
// single biggest scalability landmine as the catalog grows. Defaults
// (page=1, limit=50) are chosen generously so existing callers that
// don't pass these params yet keep working unchanged for a catalog
// this size; a caller that wants a specific page passes ?page=&limit=.
router.get("/", async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        include: {
          categories: {
            include: {
              category: true
            }
          }
        },
        orderBy: { id: "asc" },
        skip: (page - 1) * limit,
        take: limit
      }),
      prisma.product.count()
    ]);

    res.json({
      items: products,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    });
  } catch (error) {
    logger.error(error);
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
    logger.error(error);
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
  validateBody(productCreateSchema),
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
          price,
          image: image && image.trim() ? image.trim() : null,
          stock,
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
      logger.error(error);
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
  validateBody(productUpdateSchema),
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
            price,
            image: image !== undefined ? (image && image.trim() ? image.trim() : null) : undefined,
            stock,
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
      logger.error(error);
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

      // CHANGED: cart/wishlist/orderItem/productCategory rows for this
      // product now cascade-delete at the DB level (onDelete: Cascade
      // in schema.prisma) — no need to manually delete them first.
      await prisma.product.delete({ where: { id } });

      res.json({ message: "Product deleted" });
    } catch (error) {
      logger.error(error);
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

      // CHANGED: images now go to Cloudinary instead of local disk —
      // Render's filesystem is ephemeral, so anything written to local
      // disk at runtime was being wiped on every backend restart/
      // redeploy. Cloudinary's URL is absolute and survives restarts;
      // the frontend's imgSrc() already passes absolute URLs through
      // unchanged.
      const b64 = req.file.buffer.toString("base64");
      const dataUri = `data:${req.file.mimetype};base64,${b64}`;

      const result = await cloudinary.uploader.upload(dataUri, {
        folder: "radha-products"
      });

      res.json({
        message: "Image uploaded successfully",
        imageUrl: result.secure_url
      });
    } catch (error) {
      logger.error(error);
      res.status(500).json({
        message: "Upload failed"
      });
    }
  }
);

module.exports = router;
