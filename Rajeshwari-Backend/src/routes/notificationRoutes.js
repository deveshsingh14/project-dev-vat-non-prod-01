const express = require("express");
const { z } = require("zod");

const prisma = require("../config/db");
const logger = require("../config/logger");
const authMiddleware = require("../middleware/authMiddleware");
const { validateBody } = require("../middleware/validate");
const { getPublicKey } = require("../utils/push");

const router = express.Router();

// Browser PushSubscription.toJSON() shape.
const subscribeSchema = z.object({
  endpoint: z.string().url().max(2048).startsWith("https://", "Push endpoint must be https"),
  keys: z.object({
    p256dh: z.string().min(1).max(512),
    auth: z.string().min(1).max(512)
  }),
  expirationTime: z.number().nullable().optional()
});

const unsubscribeSchema = z.object({
  endpoint: z.string().url().max(2048)
});

// ---- PUBLIC KEY (the browser needs it to subscribe) ----
// 503 when push isn't configured on the server, so the UI can hide itself.
router.get("/vapid-public-key", (req, res) => {
  const publicKey = getPublicKey();
  if (!publicKey) return res.status(503).json({ enabled: false, message: "Notifications are not available" });
  res.json({ enabled: true, publicKey });
});

// ---- SUBSCRIBE this device for the logged-in user ----
// Upsert by endpoint: re-subscribing the same browser (or a different
// account logging in on it) re-binds the device to the current user.
router.post("/subscribe", authMiddleware, validateBody(subscribeSchema), async (req, res) => {
  try {
    const { endpoint, keys } = req.body;
    const userAgent = String(req.headers["user-agent"] || "").slice(0, 300) || null;
    await prisma.pushSubscription.upsert({
      where: { endpoint },
      update: { userId: req.user.id, p256dh: keys.p256dh, auth: keys.auth, userAgent },
      create: { endpoint, userId: req.user.id, p256dh: keys.p256dh, auth: keys.auth, userAgent }
    });
    res.status(201).json({ subscribed: true });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: "Couldn't enable notifications" });
  }
});

// ---- UNSUBSCRIBE this device (only the caller's own row) ----
router.delete("/subscribe", authMiddleware, validateBody(unsubscribeSchema), async (req, res) => {
  try {
    const { count } = await prisma.pushSubscription.deleteMany({
      where: { endpoint: req.body.endpoint, userId: req.user.id }
    });
    res.json({ unsubscribed: count > 0 });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: "Couldn't disable notifications" });
  }
});

module.exports = router;
module.exports.schemas = { subscribeSchema, unsubscribeSchema };
