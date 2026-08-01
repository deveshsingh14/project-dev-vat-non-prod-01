const multer = require("multer");
const path = require("path");
const fs = require("fs");

// ADDED: make sure the uploads folder exists — multer does NOT create
// it, and a missing folder makes every upload fail with ENOENT.
const UPLOAD_DIR = "uploads/";
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({

  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },

  filename: (req, file, cb) => {
    // CHANGED: don't trust the original filename. Keep only its
    // extension (whitelisted below) and generate our own name, so
    // weird characters or path tricks in the upload name can't matter.
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueName =
      Date.now() + "-" + Math.round(Math.random() * 1e6) + ext;
    cb(null, uniqueName);
  }

});

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