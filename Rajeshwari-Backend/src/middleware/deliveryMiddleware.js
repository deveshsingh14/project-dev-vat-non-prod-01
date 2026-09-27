function deliveryMiddleware(req, res, next) {
  if (req.user.role !== "DELIVERY_PARTNER" && req.user.role !== "ADMIN" && req.user.role !== "OWNER") {
    return res.status(403).json({
      message: "Delivery access only"
    });
  }
  next();
}

module.exports = deliveryMiddleware;
