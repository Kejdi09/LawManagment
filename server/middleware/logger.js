import morgan from "morgan";
import { createLogger, format, transports } from "winston";

// ── Winston logger (centralized error + app logging) ─────────────────────────
export const logger = createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: format.combine(
    format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    format.errors({ stack: true }),
    format.json()
  ),
  defaultMeta: { service: "lawman-api" },
  transports: [
    new transports.Console({
      format: format.combine(
        format.colorize(),
        format.printf(({ timestamp, level, message, stack }) =>
          stack
            ? `${timestamp} [${level}]: ${message}\n${stack}`
            : `${timestamp} [${level}]: ${message}`
        )
      ),
    }),
  ],
});

// ── Morgan HTTP request logger ────────────────────────────────────────────────
// Skips health-check pings to avoid log noise.
export const requestLogger = morgan("combined", {
  skip: (req) => req.path === "/health" || req.path === "/api/ping",
  stream: {
    write: (message) => logger.http(message.trim()),
  },
});
