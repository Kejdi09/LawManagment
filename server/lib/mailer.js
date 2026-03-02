import nodemailer from "nodemailer";
import { logger } from "../middleware/logger.js";

/**
 * Mailer — Hostinger SMTP primary, Brevo HTTPS API fallback.
 *
 * Env vars required for Hostinger SMTP:
 *   SMTP_HOST     e.g. smtp.hostinger.com
 *   SMTP_PORT     e.g. 465
 *   SMTP_USER     e.g. noreply@dafkulawfirm.al
 *   SMTP_PASS     your email password
 *   SMTP_FROM     e.g. DAFKU Law Firm <noreply@dafkulawfirm.al>
 *
 * Env vars for Brevo fallback (already set on Render):
 *   BREVO_API_KEY
 */

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = parseInt(process.env.SMTP_PORT || "465", 10);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM || "DAFKU Law Firm <noreply@dafkulawfirm.al>";
const BREVO_API_KEY = process.env.BREVO_API_KEY;
const RETRIES = 2;
const RETRY_DELAY_MS = 2000;

// ── Build Nodemailer transport (Hostinger SMTP) ───────────────────────────────
let smtpTransport = null;

if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
  smtpTransport = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465, // true for 465 (SSL), false for 587 (STARTTLS)
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    pool: true,          // reuse connections
    maxConnections: 3,
    maxMessages: 50,
    rateDelta: 1000,
    rateLimit: 5,        // max 5 emails/second
    tls: { rejectUnauthorized: true },
  });

  // Verify on startup
  smtpTransport.verify((err) => {
    if (err) {
      logger.warn(`[mailer] SMTP verify failed (will fallback to Brevo): ${err.message}`);
      smtpTransport = null; // disable so fallback is used
    } else {
      logger.info(`[mailer] SMTP ready — ${SMTP_HOST}:${SMTP_PORT} as ${SMTP_USER}`);
    }
  });
} else {
  logger.info("[mailer] SMTP env vars not set — will use Brevo API.");
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseFrom(fromStr) {
  const m = fromStr.match(/^(.*?)\s*<([^>]+)>$/);
  return m
    ? { name: m[1].trim(), email: m[2].trim() }
    : { email: fromStr.trim() };
}

// ── SMTP send (nodemailer) ────────────────────────────────────────────────────
async function sendViaSMTP({ to, subject, text, html }) {
  await smtpTransport.sendMail({
    from: SMTP_FROM,
    to,
    subject,
    text,
    html,
  });
  logger.info(`[mailer] ✓ SMTP "${subject}" → ${to}`);
}

// ── Brevo HTTPS API fallback ──────────────────────────────────────────────────
async function sendViaBrevo({ to, subject, text, html }) {
  if (!BREVO_API_KEY) throw new Error("BREVO_API_KEY not set");
  const fromPayload = parseFrom(SMTP_FROM);
  const payload = {
    sender: fromPayload,
    to: [{ email: to }],
    subject,
    textContent: text,
  };
  if (html) payload.htmlContent = html;
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": BREVO_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Brevo API ${res.status}: ${JSON.stringify(data)}`);
  logger.info(`[mailer] ✓ Brevo "${subject}" → ${to}`);
}

// ── Public sendEmail — retries + fallback ─────────────────────────────────────
export async function sendEmail({ to, subject, text, html }) {
  if (!to) {
    logger.warn(`[mailer] Skipping "${subject}" — no recipient.`);
    return;
  }

  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      if (smtpTransport) {
        await sendViaSMTP({ to, subject, text, html });
      } else {
        await sendViaBrevo({ to, subject, text, html });
      }
      return; // success
    } catch (err) {
      logger.error(`[mailer] Attempt ${attempt}/${RETRIES} failed for "${subject}" → ${to}: ${err.message}`);
      if (attempt < RETRIES) await sleep(RETRY_DELAY_MS * attempt);
    }
  }

  // All SMTP attempts failed — try Brevo as final fallback
  if (smtpTransport && BREVO_API_KEY) {
    try {
      logger.warn(`[mailer] Falling back to Brevo for "${subject}" → ${to}`);
      await sendViaBrevo({ to, subject, text, html });
      return;
    } catch (err) {
      logger.error(`[mailer] Brevo fallback also failed: ${err.message}`);
    }
  }

  logger.error(`[mailer] All delivery attempts failed for "${subject}" → ${to}`);
}
