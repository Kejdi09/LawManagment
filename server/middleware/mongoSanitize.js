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
  if (req.query) req.query = sanitize(req.query);
  if (req.params) req.params = sanitize(req.params);
  next();
}
