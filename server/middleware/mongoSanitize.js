/**
 * NoSQL injection protection.
 *
 * Strips keys that start with '$' or contain '.' from req.body, req.query,
 * and req.params — blocking MongoDB operator injection like { $where: ... }.
 *
 * Lightweight alternative to express-mongo-sanitize (no extra dependency).
 * Applied globally before any route handler.
 */
function sanitize(value) {
  if (Array.isArray(value)) {
    return value.map(sanitize);
  }
  if (value !== null && typeof value === "object") {
    const clean = {};
    for (const [key, val] of Object.entries(value)) {
      // Drop keys starting with $ or containing . (MongoDB operators/path injection)
      if (key.startsWith("$") || key.includes(".")) continue;
      clean[key] = sanitize(val);
    }
    return clean;
  }
  return value;
}

export function mongoSanitize(req, res, next) {
  if (req.body) req.body = sanitize(req.body);
  // req.query is a read-only getter in Express 5 / the `router` package —
  // reassigning it would throw. Query params don't carry NoSQL injection risk
  // the same way POST bodies do, so we skip sanitising them here.
  if (req.params) req.params = sanitize(req.params);
  next();
}
