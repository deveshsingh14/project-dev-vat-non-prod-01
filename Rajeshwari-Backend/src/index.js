require("dotenv").config();

// ADDED: fail loudly at boot if a required env var is missing, instead
// of failing cryptically later — e.g. a missing CLOUDINARY_* var used
// to mean uploads silently threw "Upload failed" until you noticed the
// var was never set. Checked before requiring anything below, since
// several of those (e.g. config/cloudinary.js) read process.env at
// import time.
const REQUIRED_ENV_VARS = [
  "DATABASE_URL",
  "JWT_SECRET",
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET"
];

const missingEnvVars = REQUIRED_ENV_VARS.filter((name) => !process.env[name]);

if (missingEnvVars.length > 0) {
  console.error(
    `Missing required environment variable(s): ${missingEnvVars.join(", ")}. ` +
    `Set them in .env (locally) or in the Render dashboard (production) before starting the server.`
  );
  process.exit(1);
}

const express = require("express");
const cors = require("cors");

const productRoutes = require("./routes/productRoutes");
const authRoutes = require("./routes/authRoutes");
const categoryRoutes = require("./routes/categoryRoutes");
const cartRoutes = require("./routes/cartRoutes");
const wishlistRoutes = require("./routes/wishlistRoutes");
const orderRoutes = require("./routes/orderRoutes");
const userRoutes = require("./routes/userRoutes");
const pincodeRoutes = require("./routes/pincodeRoutes");


const app = express();

// CHANGED: cors() with no options reflected every origin. Restricted to
// the actual deployed frontend + local dev server. `!origin` covers
// non-browser clients (curl, server-to-server, mobile apps) that don't
// send an Origin header at all — those were never something CORS could
// protect against anyway.
const ALLOWED_ORIGINS = [
  "https://deveshsingh14.github.io",
  "http://localhost:5500",
  "http://127.0.0.1:5500"
];

app.use(cors({
  // CHANGED: reject with `false`, not an Error — an Error here reaches
  // Express's default error handler and returns a 500 (with a stack
  // trace outside production), when a disallowed origin should just
  // get no CORS headers and let the browser block it client-side.
  origin: (origin, callback) => {
    callback(null, !origin || ALLOWED_ORIGINS.includes(origin));
  }
}));
app.use(express.json());

app.use("/uploads", express.static("uploads"));

app.use("/products", productRoutes);
app.use("/auth", authRoutes);
app.use("/categories", categoryRoutes);
app.use("/cart", cartRoutes);
app.use("/wishlist", wishlistRoutes);
app.use("/orders", orderRoutes);
app.use("/users", userRoutes);
app.use("/pincode-restrictions", pincodeRoutes);


app.get("/", (req, res) => {
  res.send("Backend Working");
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});