/**
 * Env var validator — call at the very top of server startup.
 * Fails fast with a clear message if required vars are missing.
 *
 * Usage: import "./config/env.js";  (side-effect import)
 */

const REQUIRED = [
  "MONGODB_URI",
  "JWT_SECRET",
];

const OPTIONAL_WARNED = [
  ["BREVO_API_KEY",   "Email sending will not work without BREVO_API_KEY or SMTP_* vars."],
  ["ALLOWED_ORIGINS", "CORS will block all cross-origin requests in production."],
];

const missing = REQUIRED.filter((key) => !process.env[key]);

if (missing.length > 0) {
  console.error(
    `\n[env] ❌ Missing required environment variables:\n  ${missing.join("\n  ")}\n\nSet them in Render → Environment before deploying.\n`
  );
  process.exit(1);
}

// Warn about important optional vars
for (const [key, msg] of OPTIONAL_WARNED) {
  if (!process.env[key]) {
    // Only warn if no SMTP alternative present either
    const hasSMTP = process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS;
    if (key === "BREVO_API_KEY" && hasSMTP) continue;
    console.warn(`[env] ⚠  ${key} not set — ${msg}`);
  }
}

console.log("[env] ✓ Environment validated.");
