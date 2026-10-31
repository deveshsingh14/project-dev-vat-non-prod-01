const prisma = require("../config/db");

const ALLOWED = ["DELIVERY_PARTNER", "ADMIN", "OWNER"];

// Delivery routes expose customer names, phones and addresses, so the role is
// re-checked against the database: a JWT carries the role it was issued with
// (valid for days), and a partner who has been demoted must lose access now.
async function deliveryMiddleware(req, res, next) {
  try {
    if (!req.user || !ALLOWED.includes(req.user.role)) {
      return res.status(403).json({ message: "Delivery access only" });
    }
    const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { role: true } });
    if (!user || !ALLOWED.includes(user.role)) {
      return res.status(403).json({ message: "Delivery access only" });
    }
    req.user.role = user.role; // use the current role from here on
    next();
  } catch (error) {
    res.status(500).json({ message: "Couldn't verify access" });
  }
}

module.exports = deliveryMiddleware;
