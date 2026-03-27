const logger = require("../utils/logger");

function errorMiddleware(err, req, res, next) {
  logger.error("Unhandled error", {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method
  });
  if (err.message && err.message.startsWith("Unknown workflow type")) {
    return res.status(400).json({
      error: "Invalid workflow type",
      message: err.message
    });
  }

  res.status(500).json({
    error: "Internal server error",
    message: process.env.NODE_ENV === "production"
      ? "Something went wrong. Please try again."
      : err.message
  });
}

module.exports = { errorMiddleware };
