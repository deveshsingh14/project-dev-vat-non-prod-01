const multer = require("multer");
const path = require("path");

// CHANGED: uploaded images now go straight to Cloudinary (see
// productRoutes.js), so multer just needs the file in memory rather
// than writing it to local disk — Render's disk is wiped on every
// restart/redeploy, which was silently losing every uploaded image.
const storage = multer.memoryStorage();

// ADDED: only allow real image types
const fileFilter = (req, file, cb) => {
  const allowedMime = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  const allowedExt = [".jpg", ".jpeg", ".png", ".webp", ".gif"];
  const ext = path.extname(file.originalname).toLowerCase();

  if (allowedMime.includes(file.mimetype) && allowedExt.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error("Only JPG, PNG, WEBP or GIF images are allowed"));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // ADDED: 5 MB max
  }
});

module.exports = upload;