import jwt from "jsonwebtoken";
import crypto from "crypto";

/**
 * Refresh token helpers.
 *
 * Access token  — short-lived (15 min), sent in Authorization header.
 * Refresh token — long-lived (7 days), stored as httpOnly cookie.
 *
 * Usage:
 *   import { issueTokens, verifyAccess, verifyRefresh } from "./refreshToken.js";
 *
 *   On login:
 *     const { accessToken, refreshToken } = issueTokens(payload, JWT_SECRET);
 *     res.cookie("refreshToken", refreshToken, REFRESH_COOKIE_OPTIONS);
 *     res.json({ token: accessToken, user: payload });
 *
 *   On /api/refresh:
 *     const payload = verifyRefresh(req.cookies.refreshToken, JWT_SECRET);
 *     const { accessToken } = issueTokens(payload, JWT_SECRET);
 *     res.json({ token: accessToken });
 *
 *   Auth middleware:
 *     const user = verifyAccess(req.headers.authorization, JWT_SECRET);
 */

export const ACCESS_TOKEN_TTL = "15m";
export const REFRESH_TOKEN_TTL = "7d";

export const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
  path: "/",
};

/**
 * Issue both access and refresh tokens for a user payload.
 * Strips sensitive fields (password, etc.) before embedding in JWT.
 */
export function issueTokens(userPayload, secret) {
  const safe = { ...userPayload };
  delete safe.password;
  delete safe.passwordHash;

  const accessToken = jwt.sign(safe, secret, { expiresIn: ACCESS_TOKEN_TTL });
  const refreshToken = jwt.sign(
    { sub: safe._id || safe.id || safe.username, jti: crypto.randomBytes(16).toString("hex") },
    secret,
    { expiresIn: REFRESH_TOKEN_TTL }
  );

  return { accessToken, refreshToken };
}

/**
 * Verify an access token from Authorization header.
 * Returns decoded payload or throws.
 */
export function verifyAccess(authHeader, secret) {
  if (!authHeader?.startsWith("Bearer ")) {
    const err = new Error("No token provided.");
    err.status = 401;
    throw err;
  }
  return jwt.verify(authHeader.slice(7), secret);
}

/**
 * Verify a refresh token (from cookie).
 * Returns decoded payload or throws.
 */
export function verifyRefresh(token, secret) {
  if (!token) {
    const err = new Error("No refresh token.");
    err.status = 401;
    throw err;
  }
  return jwt.verify(token, secret);
}
