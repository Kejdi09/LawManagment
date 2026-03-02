/**
 * Render free tier cold-start prevention.
 *
 * Render spins down free services after 15 minutes of inactivity.
 * This module pings the server's own /health endpoint every 14 minutes
 * so it stays warm during business hours (07:00–22:00 UTC).
 *
 * Usage: import "./keepalive.js";  (side-effect import, call after server starts)
 *
 * Set RENDER_EXTERNAL_URL on Render (it's set automatically) or set
 * SELF_URL manually if needed.
 */

const INTERVAL_MS = 14 * 60 * 1000; // 14 minutes
const BUSINESS_HOUR_START = 7; // 07:00 UTC
const BUSINESS_HOUR_END = 22; // 22:00 UTC

function isBusinessHours() {
  const hour = new Date().getUTCHours();
  return hour >= BUSINESS_HOUR_START && hour < BUSINESS_HOUR_END;
}

export function startKeepalive() {
  const selfUrl =
    process.env.RENDER_EXTERNAL_URL ||
    process.env.SELF_URL ||
    `http://localhost:${process.env.PORT || 4000}`;

  const pingUrl = `${selfUrl}/health`;

  setInterval(async () => {
    if (!isBusinessHours()) return; // don't ping outside business hours (saves resources)
    try {
      const res = await fetch(pingUrl, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) console.warn(`[keepalive] Health check returned ${res.status}`);
    } catch (err) {
      console.warn(`[keepalive] Ping failed: ${err.message}`);
    }
  }, INTERVAL_MS).unref(); // .unref() so it doesn't block process exit

  console.log(`[keepalive] Self-ping active → ${pingUrl} every 14 min (business hours only)`);
}
