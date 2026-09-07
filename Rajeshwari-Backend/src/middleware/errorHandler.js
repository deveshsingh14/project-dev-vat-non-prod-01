const logger = require("../config/logger");

// Centralized error handler — a safety net for anything that reaches
// Express without a route already having handled it itself (most
// routes catch their own errors and respond directly; this only
// catches what slips past that: unawaited async errors, body-parser
// failures, anything thrown by middleware). Must be registered last,
// after every route.
function errorHandler(err, req, res, next) {
  logger.error(err);

  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ message: "Invalid JSON in request body" });
  }

  res.status(err.status || err.statusCode || 500).json({
    message: err.expose ? err.message : "Something went wrong"
  });
}

module.exports = errorHandler;
