const express = require("express");

const prisma = require("../config/db");
const logger = require("../config/logger");

const authMiddleware = require("../middleware/authMiddleware");
const adminOrOwnerMiddleware = require("../middleware/adminOrOwnerMiddleware");

const router = express.Router();

const PINCODE_PATTERN = /^\d{6}$/;

// ---- GET restriction toggle + allow-list (admin/owner) ----
router.get("/", authMiddleware, adminOrOwnerMiddleware, async (req, res) => {
  try {
    const setting = await prisma.pincodeRestriction.findUnique({ where: { id: 1 } });
    const pincodes = await prisma.serviceablePincode.findMany({
      orderBy: { pincode: "asc" }
    });

    res.json({
      enabled: setting ? setting.enabled : false,
      pincodes: pincodes.map(p => p.pincode)
    });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: "Failed to fetch pincode restriction settings" });
  }
});

// ---- TOGGLE the restriction on/off (admin/owner) ----
router.put("/toggle", authMiddleware, adminOrOwnerMiddleware, async (req, res) => {
  try {
    const { enabled } = req.body;
    if (typeof enabled !== "boolean") {
      return res.status(400).json({ message: "enabled must be true or false" });
    }

    const setting = await prisma.pincodeRestriction.upsert({
      where: { id: 1 },
      update: { enabled },
      create: { id: 1, enabled }
    });

    res.json({ enabled: setting.enabled });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: "Failed to update the restriction toggle" });
  }
});

// ---- ADD a serviceable pincode (admin/owner) ----
router.post("/", authMiddleware, adminOrOwnerMiddleware, async (req, res) => {
  try {
    const pincode = String(req.body.pincode || "").trim();
    if (!PINCODE_PATTERN.test(pincode)) {
      return res.status(400).json({ message: "A valid 6-digit pincode is required" });
    }

    const created = await prisma.serviceablePincode.upsert({
      where: { pincode },
      update: {},
      create: { pincode }
    });

    res.json(created);
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: "Failed to add pincode" });
  }
});

// ---- REMOVE a serviceable pincode (admin/owner) ----
router.delete("/:pincode", authMiddleware, adminOrOwnerMiddleware, async (req, res) => {
  try {
    await prisma.serviceablePincode.deleteMany({
      where: { pincode: req.params.pincode }
    });

    res.json({ message: "Pincode removed" });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: "Failed to remove pincode" });
  }
});

module.exports = router;
