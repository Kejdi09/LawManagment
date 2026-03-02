import helmet from "helmet";

// Helmet security headers — safe defaults for a JSON API + file upload server.
// CSP is intentionally not set here because the frontend is on a separate Vercel origin.
export const helmetMiddleware = helmet({
  contentSecurityPolicy: false, // handled by Vercel on the frontend
  crossOriginEmbedderPolicy: false, // needed for PDF/image responses
  crossOriginResourcePolicy: { policy: "cross-origin" }, // allow Vercel to load uploads
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
  noSniff: true,
  frameguard: { action: "deny" },
  xssFilter: true,
  hidePoweredBy: true,
});
