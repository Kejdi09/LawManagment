import { logger } from "./logger.js";

/**
 * Global Express error-handling middleware.
 * Must be registered LAST with app.use(errorHandler).
 * Any route that calls next(err) or throws in async code lands here.
 */
export function errorHandler(err, req, res, next) {
  // Log the full error including stack
  logger.error(`${req.method} ${req.path} — ${err.message}`, { stack: err.stack });

  // Mongoose / MongoDB duplicate key
  if (err.code === 11000) {
    return res.status(409).json({ error: "Duplicate entry." });
  }

  // JWT errors
  if (err.name === "JsonWebTokenError") {
    return res.status(401).json({ error: "Invalid token." });
  }
  if (err.name === "TokenExpiredError") {
    return res.status(401).json({ error: "Token expired." });
  }

  // Multer file too large
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ error: "File too large." });
  }

  // Express body-parser payload too large
  if (err.type === "entity.too.large") {
    return res.status(413).json({ error: "Request body too large." });
  }

  const status = err.status || err.statusCode || 500;
  const message =
    process.env.NODE_ENV === "production" && status === 500
      ? "An internal error occurred."
      : err.message || "An internal error occurred.";

  res.status(status).json({ error: message });
}
