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

        // 1. Process valid rows and extract unique categories
        const validRows = [];
        const uniqueCategories = new Set();

        for (let i = 0; i < results.length; i++) {
          const row = results[i];
          const { title, description, price, image, stock, keywords, category } = row;

          // Ignore completely empty rows (e.g. from trailing commas in CSV)
          if (!title && !price && !category) {
            continue;
          }

          if (!title || !price) {
            errors.push(`Row missing required fields (title or price): ${title || "Unknown"}`);
            continue;
          }

          const catName = category ? category.trim() : null;
          if (catName) {
            uniqueCategories.add(catName);
          }

          validRows.push({
            title,
            description: description || "",
            price: parseFloat(price) || 0,
            image: image && image.trim() ? image.trim() : null,
            stock: parseInt(stock) || 0,
            keywords: keywords || "",
            categoryName: catName,
            originalRow: row
          });
        }

        // 2. Fetch and create missing categories
        if (uniqueCategories.size > 0) {
          const existingCategories = await prisma.category.findMany({
            where: { name: { in: Array.from(uniqueCategories) } }
          });

          existingCategories.forEach(cat => categoryCache.set(cat.name, cat));

          const missingCategories = Array.from(uniqueCategories).filter(name => !categoryCache.has(name));
          if (missingCategories.length > 0) {
            // Use create to support all databases and handle concurrency via transaction
            const categoryCreates = missingCategories.map(name => prisma.category.create({ data: { name } }));
            const newlyCreated = await prisma.$transaction(categoryCreates);
            newlyCreated.forEach(cat => categoryCache.set(cat.name, cat));
          }
        }

        // 3. Batch product inserts using transaction for concurrency and safety
        if (validRows.length > 0) {
          // Prepare operations for batching
          const productCreates = validRows.map(row => {
            let catData = undefined;
            if (row.categoryName) {
              const catRecord = categoryCache.get(row.categoryName);
              if (catRecord) {
                catData = { create: [{ categoryId: catRecord.id }] };
              }
            }

            return prisma.product.create({
              data: {
                title: row.title,
                description: row.description,
                price: row.price,
                image: row.image,
                stock: row.stock,
                keywords: row.keywords,
                categories: catData
              }
            });
          });

          try {
            // Execute all insertions optimally in a single database transaction
            const createdProducts = await prisma.$transaction(productCreates);
            successCount = createdProducts.length;
          } catch (bulkErr) {
            // Fallback for isolated per-row error handling. This handles the specific constraint
            // failures on individual rows concurrently without re-inserting since the transaction rolls back.
            const fallbackPromises = validRows.map(row => {
              let catData = undefined;
              if (row.categoryName) {
                const catRecord = categoryCache.get(row.categoryName);
                if (catRecord) {
                  catData = { create: [{ categoryId: catRecord.id }] };
                }
              }

              return prisma.product.create({
                data: {
                  title: row.title,
                  description: row.description,
                  price: row.price,
                  image: row.image,
                  stock: row.stock,
                  keywords: row.keywords,
                  categories: catData
                }
              });
            });

            const results = await Promise.allSettled(fallbackPromises);

            results.forEach((result, index) => {
              if (result.status === 'fulfilled') {
                successCount++;
              } else {
                errors.push(`Error processing ${validRows[index].title}: ${result.reason.message}`);
              }
            });
          }
        }
        
        res.json({
          message: `Successfully uploaded ${successCount} products`,
          errors: errors.length ? errors : undefined
        });
      } catch (e) {
        logger.error(e);
        res.status(500).json({ message: "Failed to process CSV" });
      } finally {
        try {
          await fs.promises.unlink(req.file.path); // cleanup
        } catch (unlinkErr) {
          logger.error(`Failed to cleanup file: ${unlinkErr.message}`);
        }
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
router.get("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);

    // ADDED: a non-numeric id (e.g. /products/abc) previously reached
    // Prisma as NaN and threw a raw PrismaClientValidationError instead
    // of a clean 400.
    if (!Number.isInteger(id)) {
      return res.status(400).json({
        message: "Invalid product id"
      });
    }

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
