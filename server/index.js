import express from "express";
import { MongoClient } from "mongodb";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import fs from "fs";
import multer from "multer";
import path from "path";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { seedCustomers, seedCases, seedHistory, seedNotes, seedTasks } from "./seed-data.js";
import nodemailer from "nodemailer"; // kept for potential future SMTP use

dotenv.config();

// ── Email notification helper ─────────────────────────────────────────────────
// Primary:  Set BREVO_API_KEY + SMTP_FROM  (Brevo HTTPS API — works on Render, port 443)
// Fallback: Set RESEND_API_KEY  (Resend HTTPS API)
// NOTE: Brevo SMTP relay (port 587) is blocked by Render free tier — do NOT use SMTP
const STATE_EMAIL_LABELS = {
  NEW: 'New', IN_PROGRESS: 'In Progress',
  WAITING_CUSTOMER: 'Awaiting Your Input',
  WAITING_AUTHORITIES: 'Pending — Awaiting Authorities',
  FINALIZED: 'Completed', INTAKE: 'Under Initial Review',
  SEND_PROPOSAL: 'Proposal Sent',
  WAITING_APPROVAL: 'Awaiting Your Approval',
  WAITING_RESPONSE_P: 'Awaiting Your Response',
  DISCUSSING_Q: 'Under Discussion',
  SEND_CONTRACT: 'Service Agreement Sent',
  WAITING_ACCEPTANCE: 'Awaiting Your Acceptance',
  WAITING_RESPONSE_C: 'Awaiting Your Response',
  AWAITING_PAYMENT: 'Payment Required',
  SEND_RESPONSE: 'Final Response Issued',
  CLIENT: 'Confirmed Client',
  CONSULTATION_SCHEDULED: 'Consultation Scheduled',
  ON_HOLD: 'On Hold',
  ARCHIVED: 'Archived',
};
function logEmailConfig() {
  const { BREVO_API_KEY, RESEND_API_KEY, SMTP_FROM } = process.env;
  if (BREVO_API_KEY) {
    console.log(`[email] Brevo HTTPS API configured | FROM=${SMTP_FROM || 'mucikejdi522@gmail.com'}`);
  } else if (RESEND_API_KEY) {
    console.log(`[email] Resend API configured | FROM=${SMTP_FROM || 'onboarding@resend.dev'}`);
  } else {
    console.warn('[email] NOT configured — set BREVO_API_KEY on Render to enable emails.');
  }
}
logEmailConfig();

// nodemailer kept as import but not used (Render blocks SMTP ports)
let _smtpTransport = null; // unused — here to avoid removing nodemailer import

// ── Professional HTML email wrapper ─────────────────────────────────────────
function buildHtmlEmail(bodyHtml) {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{margin:0;padding:0;background:#f0f2f5;font-family:Georgia,'Times New Roman',serif}
  .w{max-width:600px;margin:32px auto;background:#fff;box-shadow:0 2px 8px rgba(0,0,0,.08)}
  .bar{height:4px;background:#c5a55a}
  .hd{background:#1a2e4a;padding:28px 40px}
  .hd .sub{color:#c5a55a;font-size:10px;letter-spacing:3px;text-transform:uppercase;margin:0;font-weight:normal;font-family:Arial,sans-serif}
  .hd .nm{color:#fff;font-size:22px;margin:5px 0 0;font-weight:normal;letter-spacing:1px}
  .bd{padding:36px 40px;color:#2c2c2c;font-size:15px;line-height:1.8}
  .bd p{margin:0 0 16px}
  a.btn{display:inline-block;background:#1a2e4a;color:#fff !important;padding:13px 32px;text-decoration:none;border-radius:3px;font-size:14px;font-family:Arial,sans-serif;letter-spacing:.5px;margin:10px 0 18px}
  .box{background:#f7f4ee;border-left:3px solid #c5a55a;padding:14px 18px;margin:20px 0;font-size:14px;color:#333;line-height:1.65}
  .box p{margin:0 0 6px}.box p:last-child{margin:0}
  hr{border:0;border-top:1px solid #eee;margin:28px 0}
  .ft{background:#f7f7f7;border-top:1px solid #e8e8e8;padding:20px 40px;text-align:center}
  .ft p{margin:0 0 5px;font-size:12px;color:#888;font-family:Arial,sans-serif;line-height:1.5}
  .ft a{color:#999;text-decoration:none}
  .sig{margin-top:28px;font-size:14px;color:#444;line-height:1.7}
</style></head>
<body><div class="w">
  <div class="bar"></div>
  <div class="hd"><p class="sub">Legal Services</p><p class="nm">DAFKU Law Firm</p></div>
  <div class="bd">${bodyHtml}</div>
  <div class="ft">
    <p><strong>DAFKU Law Firm</strong> &bull; Tirana, Albania</p>
    <p><a href="mailto:info@dafkulawfirm.al">info@dafkulawfirm.al</a> &bull; WhatsApp <a href="https://wa.me/355696952989">+355 69 69 52 989</a></p>
    <p style="font-size:11px;color:#bbb;margin-top:10px">This communication is intended solely for the named recipient and may contain legally privileged or confidential information. Please do not reply directly to this email — contact us through your client portal or via WhatsApp.</p>
  </div>
</div></body></html>`;
}

async function sendEmail({ to, subject, text, html }) {
  if (!to) { console.warn(`[email] Skipping "${subject}" — no recipient address.`); return; }

  const { BREVO_API_KEY, RESEND_API_KEY, SMTP_FROM } = process.env;
  const fromAddr = SMTP_FROM || 'DAFKU Law Firm <mucikejdi522@gmail.com>';

  // ── Option 1: Brevo HTTPS API (port 443 — works on Render free tier) ──
  if (BREVO_API_KEY) {
    try {
      const fromMatch = fromAddr.match(/^(.*?)\s*<([^>]+)>$/);
      const fromPayload = fromMatch
        ? { name: fromMatch[1].trim(), email: fromMatch[2].trim() }
        : { email: fromAddr.trim() };
      const payload = { sender: fromPayload, to: [{ email: to }], subject, textContent: text };
      if (html) payload.htmlContent = html;
      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        console.log(`[email] ✓ Sent via Brevo API "${subject}" → ${to}`);
      } else {
        console.error(`[email] ✗ Brevo API error "${subject}" → ${to}:`, JSON.stringify(data));
      }
    } catch (e) {
      console.error(`[email] ✗ Brevo API fetch failed "${subject}" → ${to}:`, e.message);
    }
    return;
  }

  // ── Option 2: Resend HTTPS API ──
  if (RESEND_API_KEY) {
    try {
      const payload = { from: fromAddr, to: [to], subject, text };
      if (html) payload.html = html;
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        console.log(`[email] ✓ Sent via Resend "${subject}" → ${to}`);
      } else {
        console.error(`[email] ✗ Resend error "${subject}" → ${to}:`, JSON.stringify(data));
      }
    } catch (e) {
      console.error(`[email] ✗ Resend fetch failed "${subject}" → ${to}:`, e.message);
    }
    return;
  }

  console.warn(`[email] NOT configured — set BREVO_API_KEY on Render to enable emails. Skipping "${subject}" → ${to}`);
}

const PORT = process.env.PORT || 4000;
const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.DB_NAME || "lawman";
const IS_PROD = process.env.NODE_ENV === "production";
let documentsCol;
let invoicesCol;
let commsLogCol;
let portalTokensCol;
const app = express();
app.set("trust proxy", 1);

if (!MONGODB_URI) {
  console.error("Missing MONGODB_URI env var. Set it before running the server.");
  process.exit(1);
}

// Configure CORS to only allow origins in ALLOWED_ORIGINS (comma-separated)
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
// Add explicit client URL if provided (useful in dev/prod env var)
const CLIENT_URL = process.env.CLIENT_URL || (process.env.NODE_ENV === "development" ? "http://localhost:5173" : "");
if (CLIENT_URL && !allowedOrigins.includes(CLIENT_URL)) allowedOrigins.push(CLIENT_URL);

// Public routes that must be reachable from the React SPA on any origin
// (e.g. Vercel frontend calling Render backend).
// These endpoints have their own security (CSRF, rate-limit, portal tokens).
const PUBLIC_CORS_PATHS = [/^\/api\/register$/, /^\/api\/send-verify-code$/, /^\/api\/portal/, /^\/join\//];

app.use((req, res, next) => {
  const origin = req.headers.origin;
  const isPublic = PUBLIC_CORS_PATHS.some((rx) => rx.test(req.path));

  // Determine whether this origin is allowed
  let allow = false;
  if (!origin) {
    allow = true; // curl / server-to-server — no Origin header
  } else if (isPublic) {
    allow = true; // public intake form & portal — open to all browsers
  } else if (allowedOrigins.length === 0) {
    allow = !IS_PROD; // dev: allow everything; prod: block until ALLOWED_ORIGINS is set
  } else {
    allow = allowedOrigins.includes(origin);
  }

  if (!allow) {
    return res.status(403).json({ error: 'CORS not allowed for this origin.' });
  }

  if (origin) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Vary', 'Origin');
  } else {
    res.header('Access-Control-Allow-Origin', '*');
  }
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

// ── Spam / flood protection ────────────────────────────────────────────────────
// Factory: makeRateLimiter(max, windowMs, keyFn)
//   Returns an Express middleware that allows at most `max` hits per `windowMs`
//   milliseconds, keyed by keyFn(req). Responds 429 on excess.
function makeRateLimiter(max, windowMs, keyFn) {
  const store = new Map(); // key → [timestamps]
  // Auto-purge old entries every 5 minutes to prevent unbounded memory growth
  setInterval(() => {
    const cutoff = Date.now() - windowMs;
    for (const [k, times] of store) {
      const fresh = times.filter(t => t > cutoff);
      if (fresh.length === 0) store.delete(k); else store.set(k, fresh);
    }
  }, 5 * 60 * 1000).unref();
  return (req, res, next) => {
    const key = keyFn(req);
    const now = Date.now();
    const times = (store.get(key) || []).filter(t => t > now - windowMs);
    if (times.length >= max) {
      const retryAfter = Math.ceil((times[0] + windowMs - now) / 1000);
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({ error: 'Too many requests. Please slow down and try again shortly.' });
    }
    times.push(now);
    store.set(key, times);
    next();
  };
}

// Helper: get real IP (Render/proxies set X-Forwarded-For)
function clientIp(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
}

// Global limiter: 200 requests per minute per IP — protects every endpoint from floods
app.use(makeRateLimiter(200, 60 * 1000, clientIp));

// Specific limiters reused on portal endpoints (defined here, applied below)
const portalActionLimiter  = makeRateLimiter(10, 60 * 60 * 1000, req => `action:${req.params.token}`); // 10 actions/hr per token
// ─────────────────────────────────────────────────────────────────────────────

// --- Simple user store for demo (replace with DB in production) ---
// (removed demo USERS/login) Use DB-backed login defined later

let client;
let db;
let customersCol;
let casesCol;
let historyCol;
let customerHistoryCol;
let customerNotificationsCol;
let confirmedClientsCol;
let notesCol;
let tasksCol;
let meetingsCol;
let usersCol;
let auditLogsCol;
let portalNotesCol;
let portalMessagesCol;
let deletedRecordsCol;
let emailVerifyCodesCol;

let JWT_SECRET = process.env.JWT_SECRET || null;

async function loadOrCreateJwtSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  try {
    const secretPath = path.resolve(process.cwd(), "server", ".jwtsecret");
    // Try read existing file
    const existing = await fs.promises.readFile(secretPath, "utf8");
    if (existing && existing.trim()) return existing.trim();
  } catch (err) {
    // ignore - file may not exist
  }
  // Create a new secret and persist it so server restarts don't invalidate tokens
  const newSecret = crypto.randomBytes(48).toString("hex");
  try {
    const secretPath = path.resolve(process.cwd(), "server", ".jwtsecret");
    await fs.promises.writeFile(secretPath, newSecret, { mode: 0o600 });
    console.log(`Wrote persistent JWT secret to ${secretPath}`);
  } catch (err) {
    console.warn("Unable to persist JWT secret to disk; tokens will still work until process restarts.", err?.message || err);
  }
  return newSecret;
}

async function connectDb() {
  client = new MongoClient(MONGODB_URI);
  await client.connect();
  db = client.db(DB_NAME);
  customersCol = db.collection("customers");
  casesCol = db.collection("cases");
  historyCol = db.collection("history");
  customerHistoryCol = db.collection("customerHistory");
  customerNotificationsCol = db.collection("customerNotifications");
  confirmedClientsCol = db.collection("confirmedClients");
  notesCol = db.collection("notes");
  tasksCol = db.collection("tasks");
  meetingsCol = db.collection("meetings");
  usersCol = db.collection("users");
  auditLogsCol = db.collection("auditLogs");
  documentsCol = db.collection("documents");
  invoicesCol = db.collection("invoices");
  commsLogCol = db.collection("commsLog");
  portalTokensCol = db.collection("portalTokens");
  portalNotesCol = db.collection("portalNotes");
  portalMessagesCol = db.collection("portalMessages");
  deletedRecordsCol = db.collection("deletedRecords");
  emailVerifyCodesCol = db.collection("emailVerifyCodes");
}

async function seedIfEmpty() {
  const count = await customersCol.estimatedDocumentCount();
  if (count > 0) return;
  await customersCol.insertMany(seedCustomers);
  await casesCol.insertMany(seedCases);
  await historyCol.insertMany(seedHistory);
  await notesCol.insertMany(seedNotes);
  await tasksCol.insertMany(seedTasks);
  console.log("Seeded Mongo with sample data.");
}

async function cleanupStaleCases() {
  const now = Date.now();
  const cutoff = now - MAX_STALE_HOURS * 60 * 60 * 1000;
  const stale = await casesCol.find({ state: { $in: STUCK_STATES }, lastStateChange: { $lt: new Date(cutoff).toISOString() } }).toArray();
  if (!stale.length) return;
  const staleIds = stale.map((c) => c.caseId);
  // Archive to deletedRecords before hard-delete so data is recoverable
  const [staleHistory, staleNotes, staleTasks] = await Promise.all([
    historyCol.find({ caseId: { $in: staleIds } }).toArray(),
    notesCol.find({ caseId: { $in: staleIds } }).toArray(),
    tasksCol.find({ caseId: { $in: staleIds } }).toArray(),
  ]);
  const archiveNow = new Date().toISOString();
  for (const c of stale) {
    await deletedRecordsCol.insertOne({
      recordId: genShortId('DR'),
      recordType: 'stale-case',
      caseId: c.caseId,
      customerId: c.customerId || null,
      deletedAt: archiveNow,
      deletedBy: 'system-cleanup',
      snapshot: {
        case: c,
        history: staleHistory.filter(h => h.caseId === c.caseId),
        notes: staleNotes.filter(n => n.caseId === c.caseId),
        tasks: staleTasks.filter(t => t.caseId === c.caseId),
      },
    });
  }
  await Promise.all([
    casesCol.deleteMany({ caseId: { $in: staleIds } }),
    historyCol.deleteMany({ caseId: { $in: staleIds } }),
    notesCol.deleteMany({ caseId: { $in: staleIds } }),
    tasksCol.deleteMany({ caseId: { $in: staleIds } }),
  ]);
  console.log(`Auto-cleaned ${staleIds.length} stale cases: ${staleIds.join(",")}`);
}

const pad3 = (n) => String(n).padStart(3, "0");
// Generates a short unique ID that avoids collisions from rapid insertions.
const genShortId = (prefix) => `${prefix}${Date.now()}${Math.floor(Math.random() * 9000 + 1000)}`;
const escapeRegex = (str = "") => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 8;
const loginAttempts = new Map();
// Prune expired login-attempt entries every 15 minutes to prevent unbounded growth
setInterval(() => {
  const cutoff = Date.now() - LOGIN_WINDOW_MS;
  for (const [k, state] of loginAttempts) {
    if (state.firstAttempt < cutoff) loginAttempts.delete(k);
  }
}, 15 * 60 * 1000).unref();
const ALLOWED_UPLOAD_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024;
const STUCK_STATES = ["WAITING_RESPONSE_P", "WAITING_RESPONSE_C", "WAITING_APPROVAL", "WAITING_ACCEPTANCE", "SEND_PROPOSAL", "SEND_CONTRACT", "SEND_RESPONSE", "SEND_DOCUMENTS"];
const MAX_STALE_HOURS = 120;
const FOLLOW_UP_24H_STATUSES = ["INTAKE"];
const FOLLOW_UP_72H_STATUSES = ["WAITING_APPROVAL", "WAITING_ACCEPTANCE"];
const RESPOND_24H_STATUSES = ["SEND_PROPOSAL", "SEND_CONTRACT", "SEND_RESPONSE"];
const CONSULTANT_BY_USERNAME = {
  admirim: "Albert",
  albert: "Albert",
  kejdi: "Kejdi",
};

// Hard boundaries: both client and customer cases go to the lawyer team
const CLIENT_LAWYERS_SERVER = ['Kejdi', 'Albert'];
const INTAKE_LAWYERS_SERVER = ['Kejdi', 'Albert'];

function validateCaseTeamBoundary(caseType, assignedTo) {
  if (!assignedTo) return null;
  const name = stripProfessionalTitle(assignedTo);
  if (caseType === 'client' && !CLIENT_LAWYERS_SERVER.includes(name)) {
    return `Client cases can only be assigned to: ${CLIENT_LAWYERS_SERVER.join(', ')}`;
  }
  if (caseType === 'customer' && !INTAKE_LAWYERS_SERVER.includes(name)) {
    return `Customer cases can only be assigned to: ${INTAKE_LAWYERS_SERVER.join(', ')}`;
  }
  return null;
}

function isAdminUser(user) {
  return user?.role === "admin";
}

function isLawyerUser(user) {
  return user?.role === "lawyer";
}

function stripProfessionalTitle(value) {
  return String(value || "").replace(/^\s*(dr|mag)\.?\s+/i, "").trim();
}

function buildAssignedToMatcher(rawName) {
  const clean = stripProfessionalTitle(rawName);
  if (!clean) return null;
  const escaped = escapeRegex(clean);
  // Prefix (dr/mag) is optional – plain names like "Kejdi" must also match
  return new RegExp(`^\\s*(?:(?:dr|mag)\\.?\\s*)?${escaped}\\s*$`, "i");
}

function getUserLawyerName(user) {
  if (!user) return "";
  return stripProfessionalTitle(user.consultantName || user.lawyerName || CONSULTANT_BY_USERNAME[user.username] || "");
}

function buildCaseScopeFilter(user) {
  if (isAdminUser(user)) return {};
  if (isLawyerUser(user)) return {};
  const lawyerName = getUserLawyerName(user);
  if (!lawyerName) return { _id: { $exists: false } };
  const matcher = buildAssignedToMatcher(lawyerName);
  return matcher ? { assignedTo: matcher } : { assignedTo: lawyerName };
}

function buildCustomerScopeFilter(user) {
  if (isAdminUser(user)) return {};
  if (isLawyerUser(user)) return {};
  const lawyerName = getUserLawyerName(user);
  const clauses = [];
  if (lawyerName) {
    const matcher = buildAssignedToMatcher(lawyerName);
    clauses.push(matcher ? { assignedTo: matcher } : { assignedTo: lawyerName });
  }
  if (user?.username) clauses.push({ createdBy: user.username });
  if (clauses.length === 0) return { _id: { $exists: false } };
  return { $or: clauses };
}

function userCanAccessCustomer(user, customer) {
  if (!customer) return false;
  if (isAdminUser(user)) return true;
  if (isLawyerUser(user)) return true;
  const lawyerName = getUserLawyerName(user);
  return Boolean(lawyerName) && stripProfessionalTitle(customer.assignedTo) === lawyerName;
}

function userCanAccessCase(user, doc) {
  if (!doc) return false;
  if (isAdminUser(user)) return true;
  if (isLawyerUser(user)) return true;
  const lawyerName = getUserLawyerName(user);
  return Boolean(lawyerName) && stripProfessionalTitle(doc.assignedTo) === lawyerName;
}

function buildMeetingScopeFilter(user) {
  if (isAdminUser(user)) return {};
  if (isLawyerUser(user)) return {};
  const lawyerName = getUserLawyerName(user);
  if (!lawyerName) return { _id: { $exists: false } };
  return {
    $or: [
      { assignedTo: lawyerName },
      { createdBy: user.username || "" },
    ],
  };
}

// Confirmed clients are for admin and lawyers (Kejdi/Albert).
function buildClientScopeFilter(user) {
  if (isAdminUser(user)) return {};
  if (isLawyerUser(user)) return {};
  const lawyerName = getUserLawyerName(user);
  if (!lawyerName) return { _id: { $exists: false } };
  const matcher = buildAssignedToMatcher(lawyerName);
  return matcher ? { assignedTo: matcher } : { assignedTo: lawyerName };
}

function getLastStatusChangeAt(customer) {
  if (Array.isArray(customer.statusHistory) && customer.statusHistory.length > 0) {
    const last = customer.statusHistory[customer.statusHistory.length - 1];
    if (last?.date) return new Date(last.date).toISOString();
  }
  return new Date(customer.registeredAt || Date.now()).toISOString();
}

function hoursBetween(fromIso, toMs) {
  const fromMs = new Date(fromIso).getTime();
  if (!Number.isFinite(fromMs)) return 0;
  return (toMs - fromMs) / (1000 * 60 * 60);
}

async function insertCustomerNotification({ customerId, message, kind, severity }) {
  const notificationId = `CN${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const payload = {
    notificationId,
    customerId,
    message,
    kind,
    severity,
    createdAt: new Date().toISOString(),
  };
  await customerNotificationsCol.insertOne(payload);
}

async function syncCustomerNotifications() {
  const nowMs = Date.now();
  // Only generate notifications for non-confirmed customers (customersCol).
  // Confirmed clients should not receive follow/respond alerts.
  const customerSets = [
    { col: customersCol, docs: await customersCol.find({}).toArray() },
  ];

  for (const set of customerSets) {
    for (const customer of set.docs) {
      const status = customer.status;
      const lastStatusChangeAt = getLastStatusChangeAt(customer);
      const prevTracker = customer.notificationTracker || {};
      const statusChanged = prevTracker.status !== status || prevTracker.lastStatusChangeAt !== lastStatusChangeAt;

      const tracker = statusChanged
        ? {
          status,
          lastStatusChangeAt,
          followupCount: 0,
          lastFollowupAt: null,
          lastRespondAt: null,
          onHoldFollowupNotifiedFor: null,
        }
        : {
          status,
          lastStatusChangeAt,
          followupCount: Number(prevTracker.followupCount || 0),
          lastFollowupAt: prevTracker.lastFollowupAt || null,
          lastRespondAt: prevTracker.lastRespondAt || null,
          onHoldFollowupNotifiedFor: prevTracker.onHoldFollowupNotifiedFor || null,
        };

      const hoursSinceLastFollowup = tracker.lastFollowupAt ? hoursBetween(tracker.lastFollowupAt, nowMs) : 0;
      const readyToDeleteAfterFollowups = tracker.followupCount >= 3 && hoursSinceLastFollowup >= 24;
      if (readyToDeleteAfterFollowups) {
        // Soft-delete: snapshot to deletedRecords before removing
        const autoRelatedCases = await casesCol.find({ customerId: customer.customerId }).toArray();
        const autoRelatedCaseIds = autoRelatedCases.map((c) => c.caseId);
        const [autoCaseHistory, autoNotes, autoTasks, autoCustomerHistory] = await Promise.all([
          historyCol.find({ caseId: { $in: autoRelatedCaseIds } }).toArray(),
          notesCol.find({ caseId: { $in: autoRelatedCaseIds } }).toArray(),
          tasksCol.find({ caseId: { $in: autoRelatedCaseIds } }).toArray(),
          customerHistoryCol.find({ customerId: customer.customerId }).toArray(),
        ]);
        const autoNow = new Date().toISOString();
        await deletedRecordsCol.insertOne({
          recordId: genShortId('DR'),
          recordType: 'customer',
          customerId: customer.customerId,
          customerName: customer.name || customer.customerId,
          deletedAt: autoNow,
          deletedBy: 'system-auto',
          snapshot: { customer, cases: autoRelatedCases, caseHistory: autoCaseHistory, notes: autoNotes, tasks: autoTasks, customerHistory: autoCustomerHistory },
        });
        await Promise.all([
          customerNotificationsCol.deleteMany({ customerId: customer.customerId }),
          customerHistoryCol.deleteMany({ customerId: customer.customerId }),
          casesCol.deleteMany({ customerId: customer.customerId }),
          historyCol.deleteMany({ caseId: { $in: autoRelatedCaseIds } }),
          notesCol.deleteMany({ caseId: { $in: autoRelatedCaseIds } }),
          tasksCol.deleteMany({ caseId: { $in: autoRelatedCaseIds } }),
          customersCol.deleteOne({ customerId: customer.customerId }),
          // Also purge portal tokens and messages so expired customers can't access the portal
          portalTokensCol.deleteMany({ customerId: customer.customerId }),
          portalMessagesCol.deleteMany({ customerId: customer.customerId }),
        ]);
        await logAudit({
          username: "system",
          role: "system",
          action: "auto-delete",
          resource: "customer",
          resourceId: customer.customerId,
          details: { reason: "followup_limit" },
        });
        continue;
      }

      if (statusChanged) {
        await customerNotificationsCol.deleteMany({ customerId: customer.customerId });
      }

      const elapsedFromStatusChange = hoursBetween(lastStatusChangeAt, nowMs);

      if (FOLLOW_UP_24H_STATUSES.includes(status) || FOLLOW_UP_72H_STATUSES.includes(status)) {
        const followupInterval = FOLLOW_UP_24H_STATUSES.includes(status) ? 24 : 72;
        const elapsedFromLastFollowup = tracker.lastFollowupAt ? hoursBetween(tracker.lastFollowupAt, nowMs) : elapsedFromStatusChange;

        if (elapsedFromStatusChange >= followupInterval && elapsedFromLastFollowup >= followupInterval && tracker.followupCount < 3) {
          await insertCustomerNotification({
            customerId: customer.customerId,
            message: `Follow up ${customer.name}`,
            kind: "follow",
            severity: followupInterval === 72 ? "critical" : "warn",
          });
          tracker.followupCount += 1;
          tracker.lastFollowupAt = new Date(nowMs).toISOString();
        }
      }

      if (RESPOND_24H_STATUSES.includes(status)) {
        const respondInterval = 24;
        const elapsedFromLastRespond = tracker.lastRespondAt ? hoursBetween(tracker.lastRespondAt, nowMs) : elapsedFromStatusChange;
        if (elapsedFromStatusChange >= respondInterval && elapsedFromLastRespond >= respondInterval) {
          await insertCustomerNotification({
            customerId: customer.customerId,
            message: `Respond to ${customer.name}`,
            kind: "respond",
            severity: "warn",
          });
          tracker.lastRespondAt = new Date(nowMs).toISOString();
        }
      }

      if (status === "ON_HOLD" && customer.followUpDate) {
        const followUpTime = new Date(customer.followUpDate).getTime();
        if (Number.isFinite(followUpTime) && followUpTime <= nowMs && tracker.onHoldFollowupNotifiedFor !== customer.followUpDate) {
          await insertCustomerNotification({
            customerId: customer.customerId,
            message: `Follow up ${customer.name} ${customer.customerId}`,
            kind: "follow",
            severity: "warn",
          });
          tracker.onHoldFollowupNotifiedFor = customer.followUpDate;
        }
      }

      await set.col.updateOne(
        { customerId: customer.customerId },
        { $set: { notificationTracker: tracker } }
      );
    }
  }
}
// Generate a globally-unique customer ID tagged with the creating user's initials.
// Format: C-<USER>-<base36-timestamp><4-digit-random>
// e.g. C-KEJ-lv2k9c3721  — no DB round-trip needed, no race conditions.
function genCustomerId(username = '') {
  const tag = (username || 'XX').replace(/[^A-Za-z0-9]/g, '').substring(0, 3).toUpperCase();
  const ts  = Date.now().toString(36).toUpperCase().slice(-6);
  const rnd = Math.floor(Math.random() * 9000 + 1000);
  return `C-${tag}-${ts}${rnd}`;
}
// Generate a globally-unique case ID tagged with the creating user's initials.
// prefix: 'CC' for customer cases, 'CL' for client cases
// Format: CC-<USER>-<base36-timestamp><4-digit-random>
function genCaseId(prefix = 'CASE', username = '') {
  const tag = (username || 'XX').replace(/[^A-Za-z0-9]/g, '').substring(0, 3).toUpperCase();
  const ts  = Date.now().toString(36).toUpperCase().slice(-6);
  const rnd = Math.floor(Math.random() * 9000 + 1000);
  return `${prefix}-${tag}-${ts}${rnd}`;
}

function buildCaseFilters(query) {
  const filters = {};
  if (query.state) filters.state = query.state;
  if (query.customerId) filters.customerId = query.customerId;
  if (query.caseType === 'customer' || query.caseType === 'client') filters.caseType = query.caseType;
  return filters;
}

function parsePagingQuery(query) {
  const pageRaw = Number(query.page || 0);
  const pageSizeRaw = Number(query.pageSize || 0);
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1;
  const pageSize = Number.isFinite(pageSizeRaw) && pageSizeRaw > 0 ? Math.min(100, Math.floor(pageSizeRaw)) : 25;
  const requested = Boolean(query.page || query.pageSize);
  return { page, pageSize, skip: (page - 1) * pageSize, requested };
}

function parseSortQuery(query, allowed, fallbackField) {
  const rawSortBy = String(query.sortBy || fallbackField);
  const sortBy = allowed.includes(rawSortBy) ? rawSortBy : fallbackField;
  const sortDirRaw = String(query.sortDir || "asc").toLowerCase();
  const sortDir = sortDirRaw === "desc" ? -1 : 1;
  return { sortBy, sortDir };
}

async function runDataMigrations() {
  await Promise.all([
    customersCol.createIndex({ customerId: 1 }, { unique: true }),
    confirmedClientsCol.createIndex({ customerId: 1 }, { unique: true }),
    casesCol.createIndex({ caseId: 1 }, { unique: true }),
    usersCol.createIndex({ username: 1 }, { unique: true }),
    meetingsCol.createIndex({ meetingId: 1 }, { unique: true }),
    meetingsCol.createIndex({ startsAt: 1 }),
    meetingsCol.createIndex({ assignedTo: 1 }),
    auditLogsCol.createIndex({ at: -1 }),
    // Email indexes for duplicate-checking (registration) and lookups
    customersCol.createIndex({ email: 1 }),
    confirmedClientsCol.createIndex({ email: 1 }),
    // Portal token indexes for fast token lookups and customer revocation
    portalTokensCol.createIndex({ token: 1 }),
    portalTokensCol.createIndex({ customerId: 1 }),
    // Email verify codes: TTL index auto-deletes expired docs; unique on email
    emailVerifyCodesCol.createIndex({ email: 1 }, { unique: true }),
    emailVerifyCodesCol.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
  ]);

  const [customers, confirmedClients, caseRows] = await Promise.all([
    customersCol.find({}).toArray(),
    confirmedClientsCol.find({}).toArray(),
    casesCol.find({}).toArray(),
  ]);

  for (const customer of customers) {
    const normalizedAssignedTo = stripProfessionalTitle(customer.assignedTo || "");
    await customersCol.updateOne(
      { customerId: customer.customerId },
      {
        $set: {
          // Preserve the assignedTo for all statuses (intake assigns customers before CLIENT confirmation)
          assignedTo: normalizedAssignedTo,
          createdBy: customer.createdBy || null,
          version: Number(customer.version || 1),
        },
      }
    );

    if (customer.status === "CLIENT") {
      const confirmedPayload = {
        ...customer,
        assignedTo: normalizedAssignedTo,
        sourceCustomerId: customer.customerId,
        confirmedAt: customer.confirmedAt || new Date().toISOString(),
      };
      await confirmedClientsCol.updateOne(
        { customerId: customer.customerId },
        { $set: confirmedPayload },
        { upsert: true }
      );
      await customersCol.deleteOne({ customerId: customer.customerId });
    }
  }

  for (const customer of confirmedClients) {
    await confirmedClientsCol.updateOne(
      { customerId: customer.customerId },
      {
        $set: {
          assignedTo: stripProfessionalTitle(customer.assignedTo || ""),
          createdBy: customer.createdBy || null,
          version: Number(customer.version || 1),
        },
      }
    );
  }

  for (const row of caseRows) {
    await casesCol.updateOne(
      { caseId: row.caseId },
      {
        $set: {
          assignedTo: stripProfessionalTitle(row.assignedTo || ""),
          createdBy: row.createdBy || null,
          version: Number(row.version || 1),
        },
      }
    );
  }
}

function cleanLoginField(value, maxLen = 100) {
  return String(value || "").trim().slice(0, maxLen);
}

function getLoginThrottleState(req, username) {
  const ip = req.ip || req.headers["x-forwarded-for"] || "unknown";
  const key = `${String(ip)}::${username.toLowerCase()}`;
  const now = Date.now();
  const current = loginAttempts.get(key);
  if (!current || now - current.firstAttempt > LOGIN_WINDOW_MS) {
    const fresh = { firstAttempt: now, count: 0 };
    loginAttempts.set(key, fresh);
    return { key, state: fresh };
  }
  return { key, state: current };
}

app.get("/api/health", (req, res) => res.json({ ok: true }));

// Auth helpers
async function seedDemoUser() {
  try {
    const demoUsers = [
      { username: "admirim", password: "adi33", role: "admin", consultantName: "Albert" },
      { username: "albert", password: "alb33", role: "lawyer", consultantName: "Albert" },
      { username: "kejdi", password: "kej33", role: "lawyer", consultantName: "Kejdi" },
    ];

    for (const demoUser of demoUsers) {
      const hashed = await bcrypt.hash(demoUser.password, 10);
      await usersCol.updateOne(
        { username: demoUser.username },
        {
          $set: {
            password: hashed,
            role: demoUser.role,
            consultantName: demoUser.consultantName,
            lawyerName: demoUser.consultantName,
            managerUsername: demoUser.managerUsername || null,
            updatedAt: new Date().toISOString(),
          },
          $setOnInsert: {
            username: demoUser.username,
            createdAt: new Date().toISOString(),
          },
        },
        { upsert: true }
      );
    }
    console.log("Synced default users: admirim, albert, kejdi.");
  } catch (err) {
    console.error("Failed to seed demo user:", err);
  }
}

function getCookieOptions(req) {
  const requestOrigin = req.headers.origin;
  const forwardedProto = req.headers["x-forwarded-proto"];
  const requestProtocol = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto;
  const protocol = requestProtocol || req.protocol;
  const host = req.get("host");
  const serverOrigin = host ? `${protocol}://${host}` : "";
  const isCrossOrigin = Boolean(requestOrigin && serverOrigin && requestOrigin !== serverOrigin);
  const secure = protocol === "https";

  // Cross-origin cookies must use SameSite=None;Secure in modern browsers.
  // If not HTTPS, fall back to Lax to keep local dev working on same-site origins.
  const sameSite = isCrossOrigin && secure ? "none" : "lax";

  let domain;
  const configuredDomain = process.env.COOKIE_DOMAIN?.trim();
  if (configuredDomain && !configuredDomain.includes(":")) {
    domain = configuredDomain;
  }

  return {
    httpOnly: true,
    secure,
    sameSite,
    domain,
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  };
}

function createAuthCookie(req, res, token) {
  res.cookie("token", token, getCookieOptions(req));
}

function extractAuthToken(req) {
  const cookieToken = req.cookies?.token;
  if (cookieToken) return cookieToken;
  const authHeader = req.headers?.authorization || "";
  if (typeof authHeader === "string" && authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim();
  }
  return null;
}

app.post("/api/logout", (req, res) => {
  // Log logout before clearing the cookie
  try {
    const token = extractAuthToken(req);
    if (token && JWT_SECRET) {
      const payload = jwt.verify(token, JWT_SECRET);
      logAudit({ username: payload?.username, role: payload?.role, consultantName: payload?.consultantName || null, action: 'logout', resource: 'session', resourceId: payload?.username || null, details: { ip: req.ip } }).catch(() => {});
    }
  } catch { /* ignore jwt decode errors */ }
  // Clear cookie using the same options to ensure browser removes it in cross-site scenarios
  res.clearCookie("token", getCookieOptions(req));
  res.json({ ok: true });
});

app.get("/api/me", (req, res) => {
  try {
    const token = extractAuthToken(req);
    if (!token) return res.json({ authenticated: false });
    const payload = jwt.verify(token, JWT_SECRET);
    return res.json({ authenticated: true, user: payload });
  } catch (err) {
    return res.json({ authenticated: false });
  }
});

// Debug endpoint to inspect received cookies. Enabled only when not in production
// or when ENABLE_DEBUG_COOKIES=true is set in env. Returns `req.cookies` and decoded token payload if present.
// --- Auth middleware ---
function verifyAuth(req, res, next) {
  try {
    const token = extractAuthToken(req);
    if (!token) return res.status(401).json({ error: 'unauthenticated' });
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'unauthenticated' });
  }
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'unauthenticated' });
    if (req.user.role === role || req.user.role === 'admin') return next();
    return res.status(403).json({ error: 'forbidden' });
  };
}

async function logAudit({ username, role, action, resource, resourceId, details = {} }) {
  try {
    if (!auditLogsCol) return;
    await auditLogsCol.insertOne({
      username,
      role,
      consultantName: role === "admin" ? null : (CONSULTANT_BY_USERNAME[username] || null),
      action,
      resource,
      resourceId,
      details,
      at: new Date().toISOString(),
    });
  } catch (err) {
    console.warn('Failed to write audit log', err?.message || err);
  }
}

// Login using users collection and bcrypt, issue httpOnly JWT cookie
app.post("/api/login", async (req, res) => {
  try {
    const username = cleanLoginField(req.body?.username, 80);
    const password = cleanLoginField(req.body?.password, 200);
    if (!username || !password) return res.status(400).json({ success: false, message: "Missing credentials" });
    const { key, state } = getLoginThrottleState(req, username);
    if (state.count >= LOGIN_MAX_ATTEMPTS) {
      const retryAfterSec = Math.ceil((state.firstAttempt + LOGIN_WINDOW_MS - Date.now()) / 1000);
      return res.status(429).json({ success: false, message: "Too many attempts. Try again later.", retryAfter: Math.max(1, retryAfterSec) });
    }
    const user = await usersCol.findOne({ username });
    if (!user) {
      state.count += 1;
      loginAttempts.set(key, state);
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) {
      state.count += 1;
      loginAttempts.set(key, state);
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }
    loginAttempts.delete(key);
    const role = user.role || "user";
    const consultantName = role === "admin"
      ? null
      : (user.consultantName || user.lawyerName || CONSULTANT_BY_USERNAME[user.username] || null);
    const token = jwt.sign({ username: user.username, role, consultantName, lawyerName: consultantName }, JWT_SECRET, { expiresIn: "7d" });
    createAuthCookie(req, res, token);
    // Log successful login for admin visibility
    logAudit({ username: user.username, role, consultantName: consultantName || null, action: 'login', resource: 'session', resourceId: user.username, details: { ip: req.ip } }).catch(() => {});
    return res.json({ success: true, username: user.username, role, consultantName, lawyerName: consultantName, token });
  } catch (err) {
    console.error("/api/login error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// Customers
app.get("/api/customers", verifyAuth, async (req, res) => {
  // Only intake users and admin should see non-confirmed customers
  const paging = parsePagingQuery(req.query || {});
  const { sortBy, sortDir } = parseSortQuery(req.query || {}, ["customerId", "name", "registeredAt", "status"], "customerId");
  if (!(isLawyerUser(req.user) || isAdminUser(req.user))) {
    if (paging.requested) {
      return res.json({ items: [], total: 0, page: paging.page, pageSize: paging.pageSize, totalPages: 0 });
    }
    return res.json([]);
  }
  // Apply scope so intake users (kejdi1/2/3) only see their assigned/created customers.
  // Manager and admin get {} from buildCustomerScopeFilter so they see all.
  const scopeFilter = buildCustomerScopeFilter(req.user);
  const baseFilter = { status: { $ne: "CLIENT" }, ...scopeFilter };
  if (!paging.requested) {
    const docs = await customersCol.find(baseFilter).sort({ [sortBy]: sortDir }).toArray();
    return res.json(docs);
  }

  const [items, total] = await Promise.all([
    customersCol.find(baseFilter).sort({ [sortBy]: sortDir }).skip(paging.skip).limit(paging.pageSize).toArray(),
    customersCol.countDocuments(baseFilter),
  ]);
  res.json({
    items,
    total,
    page: paging.page,
    pageSize: paging.pageSize,
    totalPages: Math.ceil(total / paging.pageSize),
  });
});

// ── Specific /customers/* routes must be defined BEFORE /customers/:id ─────────
// Otherwise Express matches them as id="notifications" or id="awaiting-payment" etc.

app.get("/api/customers/notifications", verifyAuth, async (req, res) => {
  // Refresh notifications before returning.
  await syncCustomerNotifications();

  // Load recent notifications then scope them by user access.
  const docs = await customerNotificationsCol.find({}).sort({ createdAt: -1 }).limit(200).toArray();

  // Load referenced customers (non-confirmed) and restrict notifications to those
  // customers. This prevents showing notifications for confirmed clients.
  const customerIds = docs.map(d => d.customerId).filter(Boolean);
  const customers = customerIds.length ? await customersCol.find({ customerId: { $in: customerIds } }).toArray() : [];
  const customerMap = customers.reduce((m, c) => { m[c.customerId] = c; return m; }, {});
  const docsForCustomers = docs.filter(d => Boolean(customerMap[d.customerId]));

  // Admins see notifications for non-confirmed customers.
  if (isAdminUser(req.user)) return res.json(docsForCustomers.slice(0, 50));

  // Lawyers see all customer notifications
  if (isLawyerUser(req.user)) return res.json(docsForCustomers.slice(0, 50));

  // Other authenticated users should only receive notifications
  // for customers assigned to them.
  const allowed = docsForCustomers.filter(d => userCanAccessCustomer(req.user, customerMap[d.customerId]));
  res.json(allowed.slice(0, 50));
});

app.delete("/api/customers/notifications/:id", verifyAuth, async (req, res) => {
  // Admin and lawyers can dismiss pre-confirmation customer notifications
  if (!isAdminUser(req.user) && !isLawyerUser(req.user)) {
    return res.status(403).json({ error: 'forbidden' });
  }
  const { id } = req.params;
  const notification = await customerNotificationsCol.findOne({ notificationId: id });
  if (!notification) {
    return res.status(404).json({ error: 'not_found' });
  }
  await customerNotificationsCol.deleteOne({ notificationId: id });
  await logAudit({
    username: req.user?.username || null,
    role: req.user?.role || null,
    action: 'delete',
    resource: 'customerNotification',
    resourceId: id,
    details: { customerId: notification.customerId },
  });
  res.json({ ok: true });
});

// ── Admin: get customers awaiting payment (have selected a method) ──────────
app.get('/api/customers/awaiting-payment', verifyAuth, async (req, res) => {
  const docs = await customersCol.find({
    status: 'AWAITING_PAYMENT',
    paymentSelectedMethod: { $nin: [null, '', undefined] },
  }).sort({ contractAcceptedAt: 1 }).toArray();
  res.json(docs);
});

// ── Wildcard /customers/:id (must come after all specific /customers/* routes) ─
app.get("/api/customers/:id", verifyAuth, async (req, res) => {
  // Apply scope filter for roles
  const customerScope = buildCustomerScopeFilter(req.user);
  let doc = await customersCol.findOne({ customerId: req.params.id, ...customerScope });
  if (!doc && isLawyerUser(req.user)) {
    doc = await confirmedClientsCol.findOne({ customerId: req.params.id, ...buildClientScopeFilter(req.user) });
  }
  if (!doc) {
    return res.status(404).json({ error: "Not found" });
  }
  res.json(doc);
});

app.post("/api/customers", verifyAuth, async (req, res) => {
  // Only lawyers and admin can create new customers
  if (!isLawyerUser(req.user) && !isAdminUser(req.user)) return res.status(403).json({ error: 'forbidden' });
  const customerId = genCustomerId(req.user?.username);
  const payload = { ...req.body, customerId, createdBy: req.user?.username || null, version: 1 };
  if (payload.assignedTo) payload.assignedTo = stripProfessionalTitle(payload.assignedTo);
  // Require assignedTo for confirmed clients regardless of role
  if (payload.status === "CLIENT" && !payload.assignedTo) {
    return res.status(400).json({ error: 'must_assign_confirmed_client' });
  }
  // For non-CLIENT customers, keep the intake assignedTo set by the manager/intake team
  if (payload.status === "CLIENT") {
    const confirmedPayload = {
      ...payload,
      sourceCustomerId: customerId,
      confirmedAt: new Date().toISOString(),
    };
    await confirmedClientsCol.updateOne(
      { customerId },
      { $set: confirmedPayload },
      { upsert: true }
    );
  } else {
    await customersCol.insertOne(payload);
  }
  await logAudit({ username: req.user?.username, role: req.user?.role, action: 'create', resource: 'customer', resourceId: customerId, details: { payload } });
  res.status(201).json(payload);
});

// Update a non-confirmed customer. Intake can edit any non-confirmed customer; other roles
// can edit only within their scope. If status changes to CLIENT we require `assignedTo`
// and migrate the record into `confirmedClients`.
app.put("/api/customers/:id", verifyAuth, async (req, res) => {
  const { id } = req.params;
  const update = { ...req.body };
  if (update.assignedTo) update.assignedTo = stripProfessionalTitle(update.assignedTo);
  const expectedVersionRaw = update.expectedVersion;
  const expectedVersion = Number(expectedVersionRaw);
  delete update.expectedVersion;
  delete update._id;
  delete update.customerId;

  // Find current customer within the user's scope.
  const customerScope = buildCustomerScopeFilter(req.user);
  const current = await customersCol.findOne({ customerId: id, ...customerScope });
  if (!current) return res.status(404).json({ error: 'Not found' });

  const currentVersion = Number(current.version || 1);
  if (Number.isFinite(expectedVersion) && expectedVersion !== currentVersion) {
    return res.status(409).json({ error: 'conflict', latest: current });
  }

  // If status is being changed to CLIENT, require assignedTo
  if (update.status === 'CLIENT' && !update.assignedTo) {
    return res.status(400).json({ error: 'must_assign_confirmed_client' });
  }

  // assignedTo on customers = their intake consultant assignment; preserved on non-CLIENT status changes.

  // Auto-advance SEND_PROPOSAL → WAITING_APPROVAL and email client when proposal is first sent
  if (update.proposalSentAt && !current.proposalSentAt && !update.status) {
    if (current.status === 'SEND_PROPOSAL') {
      update.status = 'WAITING_APPROVAL';
    }
    if (current.email) {
      const senderLabel = getUserLawyerName(req.user) || 'the legal team';
      const tokenDoc = await portalTokensCol.findOne({ customerId: id });
      const portalUrl = (tokenDoc && process.env.APP_URL)
        ? `${process.env.APP_URL}/#/portal/${tokenDoc.token}`
        : null;
      sendEmail({
        to: current.email,
        subject: 'Your Service Proposal is Ready — DAFKU Law Firm',
        text: [
          `Dear ${current.name || 'Client'},`,
          '',
          'Your personalised service proposal from DAFKU Law Firm is now ready for your review.',
          '',
          portalUrl ? `Please open your secure client portal to view the full proposal:\n${portalUrl}` : 'Please contact us to obtain access to your client portal and review your proposal.',
          '',
          'The proposal sets out the full scope of services, estimated timeline, required documentation, and applicable fees.',
          '',
          'Please review it at your earliest convenience. For any questions, reach us on WhatsApp: +355 69 69 52 989',
          '',
          `Yours sincerely,\n${senderLabel}\nDAFKU Law Firm\ninfo@dafkulawfirm.al`,
        ].join('\n'),
        html: buildHtmlEmail(`
          <p>Dear <strong>${current.name || 'Client'}</strong>,</p>
          <p>We are pleased to inform you that your personalised service proposal from <strong>DAFKU Law Firm</strong> is now ready for your review.</p>
          <p>The proposal sets out in full the scope of services, estimated timeline, required documentation, and applicable fees for your matter.</p>
          ${portalUrl ? `<p><a href="${portalUrl}" class="btn">Review Your Proposal</a></p>` : '<p>Please contact our office to obtain access to your client portal and review your proposal.</p>'}
          <hr>
          <p>We invite you to review the proposal and advise us of your decision at your earliest convenience. Should you require any clarification or wish to discuss the terms, please do not hesitate to reach out.</p>
          <div class="sig">Yours sincerely,<br><strong>${senderLabel}</strong><br>DAFKU Law Firm</div>
        `),
      });
    }
    await logAudit({ username: req.user?.username, role: req.user?.role, action: 'proposal_sent', resource: 'customer', resourceId: id, details: { proposalSentAt: update.proposalSentAt } });
  }

  // Client email when contract is first sent
  if (update.contractSentAt && !current.contractSentAt) {
    if (current.email) {
      const senderLabel = getUserLawyerName(req.user) || 'the legal team';
      const tokenDoc = await portalTokensCol.findOne({ customerId: id });
      const portalUrl = (tokenDoc && process.env.APP_URL)
        ? `${process.env.APP_URL}/#/portal/${tokenDoc.token}`
        : null;

      sendEmail({
        to: current.email,
        subject: 'Your Service Agreement is Ready to Sign — DAFKU Law Firm',
        text: [
          `Dear ${current.name || 'Client'},`,
          '',
          'Your Service Agreement with DAFKU Law Firm is now ready for your review and signature.',
          '',
          portalUrl ? `Please open the Contract section of your secure client portal to read and sign the agreement:\n${portalUrl}` : 'Please contact us to access your client portal and proceed to the Contract section.',
          '',
          'To sign, enter your full legal name in the designated signature field and confirm that you have read and agree to the terms.',
          '',
          'Should you have any questions prior to signing, please do not hesitate to contact us on WhatsApp: +355 69 69 52 989',
          '',
          `Yours sincerely,\n${senderLabel}\nDAFKU Law Firm\ninfo@dafkulawfirm.al`,
        ].join('\n'),
        html: buildHtmlEmail(`
          <p>Dear <strong>${current.name || 'Client'}</strong>,</p>
          <p>We are writing to inform you that your <strong>Service Agreement</strong> with DAFKU Law Firm is now prepared and ready for your review and electronic signature.</p>
          ${portalUrl ? `<p>Please access your secure client portal and navigate to the <strong>Contract</strong> section to read and sign the agreement:</p><p><a href="${portalUrl}" class="btn">Open Your Contract</a></p>` : '<p>Please contact our office to access your client portal and proceed to the Contract section.</p>'}
          <hr>
          <p>To sign, enter your full legal name in the designated signature field and confirm that you have read and accept the terms of the agreement.</p>
          <p>Should you have any questions before signing, please contact us — we are happy to assist.</p>
          <div class="sig">Yours sincerely,<br><strong>${senderLabel}</strong><br>DAFKU Law Firm</div>
        `),
      });
    }
    await logAudit({ username: req.user?.username, role: req.user?.role, action: 'contract_sent', resource: 'customer', resourceId: id, details: { contractSentAt: update.contractSentAt } });
  }

  // ── Pipeline pre-condition guards ──────────────────────────────────────────
  // These prevent admins from skipping required pipeline steps via direct edit
  // and from moving a status backwards.
  const PIPELINE_ORDER = [
    'INTAKE', 'SEND_PROPOSAL', 'WAITING_APPROVAL', 'DISCUSSING_Q',
    'SEND_CONTRACT', 'WAITING_ACCEPTANCE', 'AWAITING_PAYMENT', 'SEND_RESPONSE', 'CLIENT',
  ];
  const SIDE_STATUSES = ['ARCHIVED', 'ON_HOLD', 'CONSULTATION_SCHEDULED', 'CONSULTATION_DONE'];
  if (update.status !== undefined && update.status !== current.status) {
    const currentIdx = PIPELINE_ORDER.indexOf(current.status);
    const newIdx = PIPELINE_ORDER.indexOf(update.status);
    const bothInPipeline = currentIdx !== -1 && newIdx !== -1;

    // Block backward movement in the pipeline
    if (bothInPipeline && newIdx < currentIdx) {
      return res.status(400).json({
        error: 'Status cannot be moved backwards — the pipeline is one-directional.',
      });
    }

    // Pre-condition checks (skip for side-status transitions)
    if (!SIDE_STATUSES.includes(update.status)) {
      // WAITING_APPROVAL / DISCUSSING_Q / SEND_CONTRACT / WAITING_ACCEPTANCE require a proposal.
      // Also allow when proposalSentAt is being set in this same request (auto-advance on send).
      if (['WAITING_APPROVAL', 'DISCUSSING_Q', 'SEND_CONTRACT', 'WAITING_ACCEPTANCE'].includes(update.status)) {
        if (!current.proposalSentAt && !current.proposalSnapshot && !update.proposalSentAt) {
          return res.status(400).json({
            error: 'Cannot advance: a proposal must be sent to the client first.',
          });
        }
      }
      // WAITING_ACCEPTANCE / AWAITING_PAYMENT require a contract to have been sent.
      // Also allow when contractSentAt is being set in this same request (auto-advance on send).
      if (['WAITING_ACCEPTANCE', 'AWAITING_PAYMENT'].includes(update.status)) {
        if (!current.contractSentAt && !current.contractSnapshot && !update.contractSentAt) {
          return res.status(400).json({
            error: 'Cannot advance: a contract must be sent to the client first.',
          });
        }
      }
      // AWAITING_PAYMENT / SEND_RESPONSE / CLIENT require the contract to be signed/accepted.
      // Also allow when contractSignedAt/contractAcceptedAt is being set simultaneously.
      if (['AWAITING_PAYMENT', 'SEND_RESPONSE', 'CLIENT'].includes(update.status)) {
        if (!current.contractSignedAt && !current.contractAcceptedAt && !update.contractSignedAt && !update.contractAcceptedAt) {
          return res.status(400).json({
            error: 'Cannot advance: the contract must be signed/accepted by the client first.',
          });
        }
      }
    }
  }

  // Track status history (guard: only when status is explicitly part of the update)
  if (update.status !== undefined && current.status !== update.status) {
    const historyId = genShortId('CH');
    await customerHistoryCol.insertOne({
      historyId,
      customerId: id,
      statusFrom: current.status,
      statusTo: update.status,
      date: new Date().toISOString(),
      changedBy: req.user?.username || null,
      changedByRole: req.user?.role || null,
      changedByConsultant: getUserLawyerName(req.user) || null,
      changedByLawyer: getUserLawyerName(req.user) || null,
    });
    if (!update.statusHistory) update.statusHistory = (current.statusHistory || []);
    update.statusHistory.push({ status: update.status, date: new Date().toISOString() });
  }

  // Auto-advance SEND_CONTRACT → WAITING_ACCEPTANCE (contract was just dispatched)
  if (update.status === 'SEND_CONTRACT') {
    const autoId = genShortId('CH');
    await customerHistoryCol.insertOne({
      historyId: autoId,
      customerId: id,
      statusFrom: 'SEND_CONTRACT',
      statusTo: 'WAITING_ACCEPTANCE',
      date: new Date().toISOString(),
      changedBy: 'system-auto',
      changedByRole: 'system',
      changedByConsultant: null,
      changedByLawyer: null,
    });
    update.status = 'WAITING_ACCEPTANCE';
    if (!update.statusHistory) update.statusHistory = (current.statusHistory || []);
    update.statusHistory.push({ status: 'WAITING_ACCEPTANCE', date: new Date().toISOString() });
  }

  // If becoming a confirmed client, migrate to confirmedClients and remove from customers
  if (update.status === 'CLIENT') {
    const confirmedPayload = {
      ...current,
      ...update,
      customerId: id,
      version: currentVersion + 1,
      sourceCustomerId: id,
      confirmedAt: new Date().toISOString(),
    };
    await confirmedClientsCol.updateOne({ customerId: id }, { $set: confirmedPayload }, { upsert: true });
    // Auto-draft invoice from proposal fee fields if any fee data is present
    const pf = confirmedPayload.proposalFields || {};
    const totalAmt = (Number(pf.serviceFeeALL) || 0) + (Number(pf.poaFeeALL) || 0) + (Number(pf.translationFeeALL) || 0) + (Number(pf.otherFeesALL) || 0);
    if (totalAmt > 0) {
      const SVC_LABELS = { residency_pensioner: 'Residency Permit – Pensioner', visa_d: 'Type D Visa & Residence Permit', company_formation: 'Company Formation', real_estate: 'Real Estate Investment' };
      const svcNames = (confirmedPayload.services || []).map(s => SVC_LABELS[s] || s).join(', ');
      await invoicesCol.insertOne({
        invoiceId: genShortId('INV'),
        customerId: id,
        caseId: null,
        description: `Legal Services${svcNames ? ` — ${svcNames}` : ''} — ${confirmedPayload.name || id}`,
        amount: totalAmt,
        currency: 'ALL',
        status: 'pending',
        dueDate: null,
        createdAt: new Date().toISOString(),
        createdBy: req.user?.username || null,
        assignedTo: confirmedPayload.assignedTo || null,
        autoDrafted: true,
      });
      await logAudit({ username: req.user?.username, role: req.user?.role, action: 'auto_invoice', resource: 'invoice', resourceId: id, details: { amount: totalAmt, currency: 'ALL' } });
    }
    await customersCol.deleteOne({ customerId: id });
    await logAudit({ username: req.user?.username, role: req.user?.role, action: 'confirm', resource: 'customer', resourceId: id, details: { assignedTo: confirmedPayload.assignedTo } });
    return res.json(confirmedPayload);
  }

  // Regular customer update (stay non-confirmed)
  update.version = currentVersion + 1;
  await customersCol.updateOne({ customerId: id, ...customerScope }, { $set: update });
  const updated = await customersCol.findOne({ customerId: id });
  await logAudit({ username: req.user?.username, role: req.user?.role, action: 'update', resource: 'customer', resourceId: id, details: { update } });
  res.json(updated);
});

app.get("/api/confirmed-clients", verifyAuth, async (req, res) => {
  const scope = buildClientScopeFilter(req.user);
  const docs = await confirmedClientsCol.find(scope).sort({ customerId: 1 }).toArray();
  res.json(docs);
});

app.get("/api/confirmed-clients/:id", verifyAuth, async (req, res) => {
  const scope = buildClientScopeFilter(req.user);
  const doc = await confirmedClientsCol.findOne({ customerId: req.params.id, ...scope });
  if (!doc) return res.status(404).json({ error: "Not found" });
  res.json(doc);
});

app.put("/api/confirmed-clients/:id", verifyAuth, async (req, res) => {
  const { id } = req.params;
  const update = { ...req.body };
  if (update.assignedTo) update.assignedTo = stripProfessionalTitle(update.assignedTo);
  delete update._id;
  delete update.customerId;
  const scope = buildClientScopeFilter(req.user);
  const current = await confirmedClientsCol.findOne({ customerId: id, ...scope });
  if (!current) return res.status(404).json({ error: "Not found" });

  // Only admin can freely reassign clients; consultants are locked to their own name
  if (!isAdminUser(req.user)) {
    const lawyerName = getUserLawyerName(req.user);
    if (lawyerName) update.assignedTo = lawyerName;
  }

  if (update.status !== undefined && current.status !== update.status) {
    const historyId = genShortId('CH');
    await customerHistoryCol.insertOne({
      historyId,
      customerId: id,
      statusFrom: current.status,
      statusTo: update.status,
      date: new Date().toISOString(),
      changedBy: req.user?.username || null,
      changedByRole: req.user?.role || null,
      changedByConsultant: getUserLawyerName(req.user) || null,
      changedByLawyer: getUserLawyerName(req.user) || null,
    });
    if (!update.statusHistory) {
      update.statusHistory = (current.statusHistory || []);
    }
    update.statusHistory.push({
      status: update.status,
      date: new Date().toISOString(),
    });
  }

  // If admin demotes a confirmed client back to non-CLIENT, migrate it to customersCol
  if (update.status && update.status !== 'CLIENT') {
    const demoted = {
      ...current,
      ...update,
      customerId: id,
      assignedTo: "",
    };
    // Clean up confirmed-specific fields
    delete demoted.confirmedAt;
    delete demoted.sourceCustomerId;
    await customersCol.updateOne({ customerId: id }, { $set: demoted }, { upsert: true });
    await confirmedClientsCol.deleteOne({ customerId: id });
    await logAudit({ username: req.user?.username, role: req.user?.role, action: 'demote', resource: 'confirmedClient', resourceId: id, details: { to: 'customers' } });
    return res.json(demoted);
  }

  // Admin updates stay within confirmedClients
  await confirmedClientsCol.updateOne({ customerId: id, ...scope }, { $set: update });
  const updated = await confirmedClientsCol.findOne({ customerId: id, ...scope });
  await logAudit({ username: req.user?.username, role: req.user?.role, action: 'update', resource: 'confirmedClient', resourceId: id, details: { update } });
  res.json(updated);
});

app.delete("/api/customers/:id", verifyAuth, async (req, res) => {
  const { id } = req.params;
  const customerScope = buildCustomerScopeFilter(req.user);
  const current = await customersCol.findOne({ customerId: id, ...customerScope });
  if (!current) return res.status(404).json({ error: "Not found" });
  const caseScope = buildCaseScopeFilter(req.user);
  const relatedCases = await casesCol.find({ customerId: id, ...caseScope }).toArray();
  const relatedCaseIds = relatedCases.map((c) => c.caseId);
  const [caseHistory, notes, tasks, customerHistory] = await Promise.all([
    historyCol.find({ caseId: { $in: relatedCaseIds } }).toArray(),
    notesCol.find({ caseId: { $in: relatedCaseIds } }).toArray(),
    tasksCol.find({ caseId: { $in: relatedCaseIds } }).toArray(),
    customerHistoryCol.find({ customerId: id }).toArray(),
  ]);
  const now = new Date().toISOString();
  const deletedRecord = {
    recordId: genShortId('DR'),
    recordType: 'customer',
    customerId: id,
    customerName: current.name || id,
    deletedAt: now,
    deletedBy: req.user?.username || 'unknown',
    snapshot: { customer: current, cases: relatedCases, caseHistory, notes, tasks, customerHistory },
  };
  await deletedRecordsCol.insertOne(deletedRecord);
  await Promise.all([
    casesCol.deleteMany({ customerId: id, ...caseScope }),
    historyCol.deleteMany({ caseId: { $in: relatedCaseIds } }),
    notesCol.deleteMany({ caseId: { $in: relatedCaseIds } }),
    tasksCol.deleteMany({ caseId: { $in: relatedCaseIds } }),
    customerHistoryCol.deleteMany({ customerId: id }),
    customersCol.deleteOne({ customerId: id, ...customerScope }),
    portalMessagesCol.deleteMany({ customerId: id }),
  ]);
  await logAudit({ username: req.user?.username, role: req.user?.role, action: 'soft-delete', resource: 'customer', resourceId: id });
  res.json({ ok: true });
});

app.delete("/api/confirmed-clients/:id", verifyAuth, async (req, res) => {
  const { id } = req.params;
  const customerScope = buildClientScopeFilter(req.user);
  const current = await confirmedClientsCol.findOne({ customerId: id, ...customerScope });
  if (!current) return res.status(404).json({ error: "Not found" });
  const caseScope = buildCaseScopeFilter(req.user);
  const relatedCases = await casesCol.find({ customerId: id, ...caseScope }).toArray();
  const relatedCaseIds = relatedCases.map((c) => c.caseId);
  const [caseHistory, notes, tasks, customerHistory] = await Promise.all([
    historyCol.find({ caseId: { $in: relatedCaseIds } }).toArray(),
    notesCol.find({ caseId: { $in: relatedCaseIds } }).toArray(),
    tasksCol.find({ caseId: { $in: relatedCaseIds } }).toArray(),
    customerHistoryCol.find({ customerId: id }).toArray(),
  ]);
  const now = new Date().toISOString();
  const deletedRecord = {
    recordId: genShortId('DR'),
    recordType: 'confirmedClient',
    customerId: id,
    customerName: current.name || id,
    deletedAt: now,
    deletedBy: req.user?.username || 'unknown',
    snapshot: { customer: current, cases: relatedCases, caseHistory, notes, tasks, customerHistory },
  };
  await deletedRecordsCol.insertOne(deletedRecord);
  await Promise.all([
    casesCol.deleteMany({ customerId: id, ...caseScope }),
    historyCol.deleteMany({ caseId: { $in: relatedCaseIds } }),
    notesCol.deleteMany({ caseId: { $in: relatedCaseIds } }),
    tasksCol.deleteMany({ caseId: { $in: relatedCaseIds } }),
    customerHistoryCol.deleteMany({ customerId: id }),
    confirmedClientsCol.deleteOne({ customerId: id, ...customerScope }),
    portalMessagesCol.deleteMany({ customerId: id }),
  ]);
  await logAudit({ username: req.user?.username, role: req.user?.role, action: 'soft-delete', resource: 'confirmedClient', resourceId: id });
  res.json({ ok: true });
});

// ── Admin: Deleted Records (soft-delete archive) ─────────────────────────────
app.get("/api/admin/deleted-records", verifyAuth, async (req, res) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  const records = await deletedRecordsCol
    .find({})
    .sort({ deletedAt: -1 })
    .project({ 'snapshot': 0 })
    .toArray();
  res.json(records);
});

app.get("/api/admin/deleted-records/:id", verifyAuth, async (req, res) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  const record = await deletedRecordsCol.findOne({ recordId: req.params.id });
  if (!record) return res.status(404).json({ error: 'Not found' });
  res.json(record);
});

app.post("/api/admin/deleted-records/:id/restore", verifyAuth, async (req, res) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  const record = await deletedRecordsCol.findOne({ recordId: req.params.id });
  if (!record) return res.status(404).json({ error: 'Not found' });
  const { snapshot, recordType } = record;
  // Re-insert customer/confirmedClient and related data
  const col = recordType === 'confirmedClient' ? confirmedClientsCol : customersCol;
  // Remove _id so MongoDB generates a new one
  const customerDoc = { ...snapshot.customer };
  delete customerDoc._id;
  await col.updateOne({ customerId: record.customerId }, { $setOnInsert: customerDoc }, { upsert: true });
  // Re-insert cases and related data (avoid duplicates)
  const restoreOps = [];
  for (const c of (snapshot.cases || [])) {
    const d = { ...c }; delete d._id;
    restoreOps.push(casesCol.updateOne({ caseId: c.caseId }, { $setOnInsert: d }, { upsert: true }));
  }
  for (const h of (snapshot.caseHistory || [])) {
    const d = { ...h }; delete d._id;
    restoreOps.push(historyCol.updateOne({ historyId: h.historyId }, { $setOnInsert: d }, { upsert: true }));
  }
  for (const n of (snapshot.notes || [])) {
    const d = { ...n }; delete d._id;
    restoreOps.push(notesCol.updateOne({ noteId: n.noteId }, { $setOnInsert: d }, { upsert: true }));
  }
  for (const t of (snapshot.tasks || [])) {
    const d = { ...t }; delete d._id;
    restoreOps.push(tasksCol.updateOne({ taskId: t.taskId }, { $setOnInsert: d }, { upsert: true }));
  }
  for (const ch of (snapshot.customerHistory || [])) {
    const d = { ...ch }; delete d._id;
    restoreOps.push(customerHistoryCol.updateOne({ historyId: ch.historyId }, { $setOnInsert: d }, { upsert: true }));
  }
  await Promise.all(restoreOps);
  await deletedRecordsCol.deleteOne({ recordId: record.recordId });
  await logAudit({ username: req.user?.username, role: req.user?.role, action: 'restore', resource: 'deletedRecord', resourceId: record.recordId, details: { customerId: record.customerId, recordType } });
  res.json({ ok: true });
});

// ── Admin: Staff Management ──────────────────────────────────────────────────
app.get('/api/admin/users', verifyAuth, async (req, res) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  const users = await usersCol.find({}).project({ password: 0 }).sort({ createdAt: 1 }).toArray();
  res.json(users);
});

app.post('/api/admin/users', verifyAuth, async (req, res) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  const { username, password, role, consultantName, managerUsername } = req.body;
  if (!username || !password || !role) return res.status(400).json({ error: 'username, password, and role are required' });
  const existing = await usersCol.findOne({ username });
  if (existing) return res.status(409).json({ error: 'Username already exists' });
  const hashed = await bcrypt.hash(String(password), 10);
  const doc = {
    username: String(username).trim().toLowerCase(),
    password: hashed,
    role: String(role),
    consultantName: String(consultantName || username).trim(),
    lawyerName: String(consultantName || username).trim(),
    managerUsername: managerUsername || null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await usersCol.insertOne(doc);
  const { password: _pw, ...safeDoc } = doc;
  await logAudit({ username: req.user?.username, role: req.user?.role, action: 'create', resource: 'user', resourceId: doc.username });
  res.status(201).json(safeDoc);
});

app.put('/api/admin/users/:username', verifyAuth, async (req, res) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  const { username } = req.params;
  const { role, consultantName, managerUsername, password } = req.body;
  const update = { updatedAt: new Date().toISOString() };
  if (role !== undefined) update.role = role;
  if (consultantName !== undefined) { update.consultantName = String(consultantName).trim(); update.lawyerName = String(consultantName).trim(); }
  if (managerUsername !== undefined) update.managerUsername = managerUsername || null;
  if (password) update.password = await bcrypt.hash(String(password), 10);
  const result = await usersCol.updateOne({ username }, { $set: update });
  if (result.matchedCount === 0) return res.status(404).json({ error: 'Not found' });
  const updated = await usersCol.findOne({ username }, { projection: { password: 0 } });
  await logAudit({ username: req.user?.username, role: req.user?.role, action: 'update', resource: 'user', resourceId: username, details: { role, consultantName } });
  res.json(updated);
});

app.delete('/api/admin/users/:username', verifyAuth, async (req, res) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  const { username } = req.params;
  if (username === req.user?.username) return res.status(400).json({ error: 'Cannot delete your own account' });
  const result = await usersCol.deleteOne({ username });
  if (result.deletedCount === 0) return res.status(404).json({ error: 'Not found' });
  await logAudit({ username: req.user?.username, role: req.user?.role, action: 'delete', resource: 'user', resourceId: username });
  res.json({ ok: true });
});

// Returns dynamic role-based staff name lists for UI dropdowns
app.get('/api/admin/staff-names', verifyAuth, async (req, res) => {
  const users = await usersCol.find({}).project({ password: 0 }).toArray();
  const nameOf = (u) => String(u.consultantName || u.username || '').trim();
  const clientLawyers = [...new Set(users.filter(u => u.role === 'lawyer' || u.role === 'admin').map(nameOf).filter(Boolean))];
  const intakeLawyers = [...new Set(users.filter(u => u.role === 'lawyer' || u.role === 'admin').map(nameOf).filter(Boolean))];
  const allLawyers = [...new Set(users.map(nameOf).filter(Boolean))];
  res.json({ clientLawyers, intakeLawyers, allLawyers });
});

app.get("/api/customers/:id/cases", verifyAuth, async (req, res) => {
  const docs = await casesCol.find({ customerId: req.params.id, ...buildCaseScopeFilter(req.user) }).toArray();
  res.json(docs);
});

app.get("/api/customers/:id/history", verifyAuth, async (req, res) => {
  const existsInCustomers = await customersCol.findOne({ customerId: req.params.id, ...buildCustomerScopeFilter(req.user) });
  const existsInConfirmed = await confirmedClientsCol.findOne({ customerId: req.params.id, ...buildCustomerScopeFilter(req.user) });
  if (!existsInCustomers && !existsInConfirmed) return res.status(404).json({ error: "Not found" });
  const docs = await customerHistoryCol.find({ customerId: req.params.id }).sort({ date: 1 }).toArray();
  res.json(docs);
});

app.post("/api/customers/:id/history", verifyAuth, async (req, res) => {
  const { id } = req.params;
  const { statusFrom, statusTo } = req.body;
  const historyId = genShortId('CH');
  const record = {
    historyId,
    customerId: id,
    statusFrom,
    statusTo,
    date: new Date().toISOString(),
    changedBy: req.user?.username || null,
    changedByRole: req.user?.role || null,
    changedByConsultant: getUserLawyerName(req.user) || null,
    changedByLawyer: getUserLawyerName(req.user) || null,
  };
  await customerHistoryCol.insertOne(record);
  res.status(201).json(record);
});

// Cases
app.get("/api/cases", verifyAuth, async (req, res) => {
  const rawQuery = String(req.query.q || "").trim().slice(0, 80);
  const search = rawQuery ? new RegExp(escapeRegex(rawQuery), "i") : null;
  const filters = { ...buildCaseFilters(req.query), ...buildCaseScopeFilter(req.user) };
  const paging = parsePagingQuery(req.query || {});
  const { sortBy, sortDir } = parseSortQuery(req.query || {}, ["caseId", "priority", "lastStateChange", "deadline", "assignedTo"], "caseId");

  // If searching, include customer name via lookup while preserving other filters
  if (search) {
    const nonSearchFilters = { ...buildCaseFilters({ ...req.query, q: undefined }), ...buildCaseScopeFilter(req.user) };
    const pipeline = [
        { $match: nonSearchFilters },
        { $lookup: { from: "customers", localField: "customerId", foreignField: "customerId", as: "customer" } },
        { $unwind: { path: "$customer", preserveNullAndEmptyArrays: true } },
        {
          $match: {
            $or: [
              { caseId: search },
              { category: search },
              { subcategory: search },
              { assignedTo: search },
              { generalNote: search },
              { "customer.name": search },
            ],
          },
        },
        { $sort: { [sortBy]: sortDir } },
        { $project: { customer: 0 } },
      ];

    if (!paging.requested) {
      const docs = await casesCol.aggregate(pipeline).toArray();
      return res.json(docs);
    }

    const totalPipeline = [...pipeline, { $count: "count" }];
    const pagePipeline = [...pipeline, { $skip: paging.skip }, { $limit: paging.pageSize }];
    const [items, totalRows] = await Promise.all([
      casesCol.aggregate(pagePipeline).toArray(),
      casesCol.aggregate(totalPipeline).toArray(),
    ]);
    const total = totalRows?.[0]?.count || 0;
    return res.json({
      items,
      total,
      page: paging.page,
      pageSize: paging.pageSize,
      totalPages: Math.ceil(total / paging.pageSize),
    });
  }

  if (!paging.requested) {
    const docs = await casesCol.find(filters).sort({ [sortBy]: sortDir }).toArray();
    return res.json(docs);
  }

  const [items, total] = await Promise.all([
    casesCol.find(filters).sort({ [sortBy]: sortDir }).skip(paging.skip).limit(paging.pageSize).toArray(),
    casesCol.countDocuments(filters),
  ]);
  res.json({
    items,
    total,
    page: paging.page,
    pageSize: paging.pageSize,
    totalPages: Math.ceil(total / paging.pageSize),
  });
});

app.get("/api/cases/:id", verifyAuth, async (req, res) => {
  const doc = await casesCol.findOne({ caseId: req.params.id, ...buildCaseScopeFilter(req.user) });
  if (!doc) return res.status(404).json({ error: "Not found" });
  res.json(doc);
});

app.post("/api/cases", verifyAuth, async (req, res) => {
  const now = new Date().toISOString();
  const requestedCustomerId = String(req.body?.customerId || "").trim();
  if (!requestedCustomerId) return res.status(400).json({ error: "customerId is required" });

  // For lawyers/admin: caseScope determines which collection to use.
  // Exception: caseScope='customer' links to pre-confirmation customers.
  const isIntakeUser = isLawyerUser(req.user);
  const adminWantsCustomerScope = isAdminUser(req.user) && String(req.body?.caseScope || '').trim() === 'customer';
  const useCustomerCol = (isLawyerUser(req.user) && String(req.body?.caseScope || '').trim() === 'customer') || adminWantsCustomerScope;
  const customerSource = useCustomerCol ? customersCol : confirmedClientsCol;
  const customerScopeForCase = useCustomerCol ? buildCustomerScopeFilter(req.user) : buildClientScopeFilter(req.user);
  const customer = await customerSource.findOne({ customerId: requestedCustomerId, ...customerScopeForCase });
  if (!customer) {
    return res.status(400).json({ error: useCustomerCol ? "Customer not found or not accessible" : "Case customerId must belong to a confirmed client you can access" });
  }

  // CC- prefix for customer cases, CL- prefix for client cases
  const caseTypeValue = useCustomerCol ? 'customer' : 'client';
  const caseIdPrefix = useCustomerCol ? 'CC' : 'CL';
  const caseId = genCaseId(caseIdPrefix, req.user?.username);

  const payload = { ...req.body, customerId: requestedCustomerId, caseId, lastStateChange: now, version: 1, createdBy: req.user?.username || null, caseType: caseTypeValue };
  // Strip internal routing hint before storing
  delete payload.caseScope;
  if (payload.assignedTo) payload.assignedTo = stripProfessionalTitle(payload.assignedTo);
  if (!isAdminUser(req.user) && !isLawyerUser(req.user)) {
    payload.assignedTo = getUserLawyerName(req.user);
  }
  // Enforce team boundaries: both client and customer cases → lawyer team
  const teamErrCreate = validateCaseTeamBoundary(caseTypeValue, payload.assignedTo);
  if (teamErrCreate) return res.status(400).json({ error: teamErrCreate });
  await casesCol.insertOne(payload);
  await historyCol.insertOne({ historyId: genShortId('H'), caseId, stateFrom: payload.state, stateIn: payload.state, date: now });
  await logAudit({ username: req.user?.username, role: req.user?.role, action: 'create', resource: 'case', resourceId: caseId, details: { payload } });
  res.status(201).json(payload);
});

app.put("/api/cases/:id", verifyAuth, async (req, res) => {
  const targetId = (req.params.id || "").trim();
  const idPattern = new RegExp(`^${escapeRegex(targetId)}\\s*$`, "i");
  const update = { ...req.body };
  if (update.assignedTo) update.assignedTo = stripProfessionalTitle(update.assignedTo);
  const expectedVersionRaw = update.expectedVersion;
  const expectedVersion = Number(expectedVersionRaw);
  delete update.expectedVersion;
  const current = await casesCol.findOne({ caseId: idPattern, ...buildCaseScopeFilter(req.user) });
  if (!current) return res.status(404).json({ error: "Not found" });

  const currentVersion = Number(current.version || 1);
  if (Number.isFinite(expectedVersion) && expectedVersion !== currentVersion) {
    return res.status(409).json({ error: 'conflict', latest: current });
  }

  if (!isAdminUser(req.user) && !isLawyerUser(req.user)) {
    update.assignedTo = getUserLawyerName(req.user);
  }
  // Enforce team boundaries on reassignment
  if (update.assignedTo) {
    const existingCaseType = current.caseType;
    const teamErrUpdate = validateCaseTeamBoundary(existingCaseType, update.assignedTo);
    if (teamErrUpdate) return res.status(400).json({ error: teamErrUpdate });
  }
  if (update.customerId) {
    const isCustomerCase2 = current.caseType === 'customer';
    const customerSource2 = isCustomerCase2 ? customersCol : confirmedClientsCol;
    const customerScopeForCase2 = isCustomerCase2 ? buildCustomerScopeFilter(req.user) : buildClientScopeFilter(req.user);
    const targetCustomer = await customerSource2.findOne({ customerId: String(update.customerId).trim(), ...customerScopeForCase2 });
    if (!targetCustomer) {
      return res.status(400).json({ error: isCustomerCase2 ? "Customer not found or not accessible" : "Case customerId must belong to a confirmed client you can access" });
    }
  }
  // Guarantee caseId stays consistent and create if missing to avoid 404 edits
  update.caseId = targetId;
  update.version = currentVersion + 1;
  const result = await casesCol.findOneAndUpdate(
    { caseId: idPattern, ...buildCaseScopeFilter(req.user) },
    { $set: update },
    { returnDocument: "after", upsert: false }
  );
  const doc = result || (await casesCol.findOne({ caseId: targetId }));
  await logAudit({ username: req.user?.username, role: req.user?.role, action: 'update', resource: 'case', resourceId: targetId, details: { update } });
  res.json(doc);
});

app.delete("/api/cases/:id", verifyAuth, async (req, res) => {
  const { id } = req.params;
  const caseScope = buildCaseScopeFilter(req.user);
  const current = await casesCol.findOne({ caseId: id, ...caseScope });
  if (!current) return res.status(404).json({ error: "Not found" });
  await Promise.all([
    casesCol.deleteOne({ caseId: id, ...caseScope }),
    historyCol.deleteMany({ caseId: id }),
    notesCol.deleteMany({ caseId: id }),
    tasksCol.deleteMany({ caseId: id }),
  ]);
  await logAudit({ username: req.user?.username, role: req.user?.role, action: 'delete', resource: 'case', resourceId: id });
  res.json({ ok: true });
});

// History
app.get("/api/cases/:id/history", verifyAuth, async (req, res) => {
  const allowed = await casesCol.findOne({ caseId: req.params.id, ...buildCaseScopeFilter(req.user) });
  if (!allowed) return res.status(404).json({ error: "Not found" });
  const docs = await historyCol.find({ caseId: req.params.id }).sort({ date: 1 }).toArray();
  res.json(docs);
});

app.post("/api/cases/:id/history", verifyAuth, async (req, res) => {
  const { id } = req.params;
  const allowed = await casesCol.findOne({ caseId: id, ...buildCaseScopeFilter(req.user) });
  if (!allowed) return res.status(404).json({ error: "Not found" });
  const { stateFrom, stateIn } = req.body;
  const historyId = genShortId('H');
  const record = { historyId, caseId: id, stateFrom, stateIn, date: new Date().toISOString() };
  await historyCol.insertOne(record);
  await casesCol.updateOne({ caseId: id }, { $set: { state: stateIn, lastStateChange: record.date } });
  // Notify client about the status change
  const theCase = await casesCol.findOne({ caseId: id }, { projection: { customerId: 1, title: 1 } });
  if (theCase) {
    const [cust, cli] = await Promise.all([
      customersCol.findOne({ customerId: theCase.customerId }, { projection: { email: 1, name: 1 } }),
      confirmedClientsCol.findOne({ customerId: theCase.customerId }, { projection: { email: 1, name: 1 } }),
    ]);
    const clientRecord = cust || cli;
    if (clientRecord?.email) {
      const newStateLabel = STATE_EMAIL_LABELS[stateIn] || stateIn;
      sendEmail({
        to: clientRecord.email,
        subject: `Case Update — ${theCase.title || 'Your Matter'} | DAFKU Law Firm`,
        text: `Dear ${clientRecord.name || 'Client'},\n\nWe are writing to inform you that your matter at DAFKU Law Firm has been updated.\n\nMatter: ${theCase.title || id}\nNew status: ${newStateLabel}\n\nPlease visit your client portal for the latest information and any documents or actions required.\n\nFor any questions, reach us on WhatsApp: +355 69 69 52 989\n\nYours sincerely,\nDAFKU Law Firm\ninfo@dafkulawfirm.al`,
        html: buildHtmlEmail(`
          <p>Dear <strong>${clientRecord.name || 'Client'}</strong>,</p>
          <p>We are writing to inform you that your matter with <strong>DAFKU Law Firm</strong> has been updated.</p>
          <div class="box">
            <p><strong>Matter:</strong> ${theCase.title || id}</p>
            <p><strong>Status:</strong> ${newStateLabel}</p>
          </div>
          <p>Please log in to your client portal to view the latest information, any documents requiring your attention, or actions needed from your side.</p>
          <div class="sig">Yours sincerely,<br><strong>DAFKU Law Firm</strong></div>
        `),
      });
    }
  }
  await logAudit({ username: req.user?.username, role: req.user?.role, action: 'create', resource: 'case-history', resourceId: historyId, details: { caseId: id, stateFrom, stateIn } });
  res.status(201).json(record);
});

// Notes
app.get("/api/cases/:id/notes", verifyAuth, async (req, res) => {
  const allowed = await casesCol.findOne({ caseId: req.params.id, ...buildCaseScopeFilter(req.user) });
  if (!allowed) return res.status(404).json({ error: "Not found" });
  const docs = await notesCol.find({ caseId: req.params.id }).sort({ date: -1 }).toArray();
  res.json(docs);
});

app.post("/api/cases/:id/notes", verifyAuth, async (req, res) => {
  const { id } = req.params;
  const allowed = await casesCol.findOne({ caseId: id, ...buildCaseScopeFilter(req.user) });
  if (!allowed) return res.status(404).json({ error: "Not found" });
  const noteId = genShortId('N');
  const note = { noteId, caseId: id, date: new Date().toISOString(), noteText: req.body.noteText };
  await notesCol.insertOne(note);
  await logAudit({ username: req.user?.username, role: req.user?.role, action: 'create', resource: 'note', resourceId: noteId, details: { caseId: id } });
  res.status(201).json(note);
});

// Tasks
app.get("/api/cases/:id/tasks", verifyAuth, async (req, res) => {
  const allowed = await casesCol.findOne({ caseId: req.params.id, ...buildCaseScopeFilter(req.user) });
  if (!allowed) return res.status(404).json({ error: "Not found" });
  const docs = await tasksCol
    .find({ caseId: req.params.id })
    .sort({ done: 1, createdAt: 1 })
    .toArray();
  res.json(docs);
});

app.post("/api/cases/:id/tasks", verifyAuth, async (req, res) => {
  const { id } = req.params;
  const allowed = await casesCol.findOne({ caseId: id, ...buildCaseScopeFilter(req.user) });
  if (!allowed) return res.status(404).json({ error: "Not found" });
  const taskId = genShortId('T');
  const task = {
    taskId,
    caseId: id,
    title: req.body.title,
    done: false,
    createdAt: new Date().toISOString(),
    dueDate: req.body.dueDate ?? null,
  };
  await tasksCol.insertOne(task);
  await logAudit({ username: req.user?.username, role: req.user?.role, action: 'create', resource: 'task', resourceId: taskId, details: { caseId: id } });
  res.status(201).json(task);
});

app.post("/api/tasks/:taskId/toggle", verifyAuth, async (req, res) => {
  const { taskId } = req.params;
  const t = await tasksCol.findOne({ taskId });
  if (!t) return res.status(404).json({ error: "Not found" });
  const allowed = await casesCol.findOne({ caseId: t.caseId, ...buildCaseScopeFilter(req.user) });
  if (!allowed) return res.status(404).json({ error: "Not found" });
  await tasksCol.updateOne({ taskId }, { $set: { done: !t.done } });
  await logAudit({ username: req.user?.username, role: req.user?.role, action: 'toggle', resource: 'task', resourceId: taskId, details: { caseId: t.caseId, done: !t.done } });
  res.json({ ...t, done: !t.done });
});

app.delete("/api/tasks/:taskId", verifyAuth, async (req, res) => {
  const { taskId } = req.params;
  const t = await tasksCol.findOne({ taskId });
  if (!t) return res.status(404).json({ error: "Not found" });
  const allowed = await casesCol.findOne({ caseId: t.caseId, ...buildCaseScopeFilter(req.user) });
  if (!allowed) return res.status(404).json({ error: "Not found" });
  await tasksCol.deleteOne({ taskId });
  await logAudit({ username: req.user?.username, role: req.user?.role, action: 'delete', resource: 'task', resourceId: taskId, details: { caseId: t.caseId } });
  res.json({ ok: true, taskId });
});

// KPIs
app.get("/api/kpis", verifyAuth, async (req, res) => {
  const now = Date.now();
  // Scope cases to the requesting user so counts reflect their visible cases only
  const caseScope = buildCaseScopeFilter(req.user);
  const scopedCases = await casesCol.find(caseScope).toArray();
  const caseIds = scopedCases.map((c) => c.caseId);
  // Only include tasks that belong to scoped cases
  const scopedTasks = caseIds.length ? await tasksCol.find({ caseId: { $in: caseIds } }).toArray() : [];

  const overdue = scopedCases.filter((c) => c.deadline && new Date(c.deadline).getTime() < now).length;
  const deadlinesSoon = scopedCases.filter((c) => {
    if (!c.deadline) return false;
    const dl = new Date(c.deadline).getTime();
    return dl >= now && dl <= now + 7 * 24 * 60 * 60 * 1000;
  }).length;
  const missingDocs = scopedCases.filter((c) => c.documentState === "missing").length;
  const urgentCases = scopedCases.filter((c) => c.priority === "urgent" || c.priority === "high").length;
  const pendingTasks = scopedTasks.filter((t) => !t.done).length;
  const stateBreakdown = scopedCases.reduce((acc, c) => {
    acc[c.state] = (acc[c.state] || 0) + 1;
    return acc;
  }, {});

  res.json({
    totalCases: scopedCases.length,
    overdue,
    deadlinesSoon,
    missingDocs,
    urgentCases,
    pendingTasks,
    stateBreakdown,
  });
});

// Start
(async () => {
  // Ensure we have a stable JWT secret across restarts. Prefer env var, otherwise persist to server/.jwtsecret
  try {
    JWT_SECRET = await loadOrCreateJwtSecret();
  } catch (err) {
    console.error("Failed to load or create JWT secret:", err?.message || err);
    // Fallback to an in-memory dev secret (not ideal for production)
    JWT_SECRET = JWT_SECRET || "dev-fallback-secret";
  }
  await connectDb();
  // Ensure uploads directory exists
  try {
    const uploadsPath = path.resolve(process.cwd(), "server", "uploads");
    await fs.promises.mkdir(uploadsPath, { recursive: true });
  } catch (err) {
    console.warn("Could not create uploads directory:", err?.message || err);
  }
  // seedIfEmpty() removed — data is entered manually; no sample data is seeded.
  await seedDemoUser();
  await runDataMigrations();
  // periodic cleanup for stale cases
  setInterval(() => {
    cleanupStaleCases().catch((err) => console.error("cleanup failed", err));
  }, 60 * 60 * 1000);

  // Payment reminder: send once after 3 days AWAITING_PAYMENT with no method selected
  async function sendPaymentReminders() {
    try {
      const THREE_DAYS_AGO = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
      const overdue = await customersCol.find({
        status: 'AWAITING_PAYMENT',
        paymentSelectedMethod: { $in: [null, '', undefined] },
        contractAcceptedAt: { $lt: THREE_DAYS_AGO },
        paymentReminderSentAt: { $exists: false },
      }).toArray();
      for (const customer of overdue) {
        if (!customer.email) continue;
        const portalToken = await portalTokensCol.findOne({ customerId: customer.customerId });
        const portalUrl = portalToken && process.env.APP_URL
          ? `${process.env.APP_URL}/#/portal/${portalToken.token}`
          : null;
        sendEmail({
          to: customer.email,
          subject: 'Payment Reminder — Action Required | DAFKU Law Firm',
          text: [
            `Dear ${customer.name},`,
            '',
            'We wish to draw your attention to the fact that your service agreement has been signed, however payment in respect of the agreed fees has not yet been received.',
            '',
            customer.paymentNote ? `Payment note: ${customer.paymentNote}` : '',
            '',
            portalUrl ? `Please access your client portal to select a payment method and complete the payment:\n${portalUrl}` : 'Please contact us to arrange payment.',
            '',
            'If you have already arranged payment, kindly disregard this message — our team will confirm receipt as soon as possible.',
            '',
            'For any queries, please contact us on WhatsApp: +355 69 69 52 989',
            '',
            'Yours sincerely,\nDAFKU Law Firm\ninfo@dafkulawfirm.al',
          ].filter(l => l !== null && l !== undefined).join('\n'),
          html: buildHtmlEmail(`
            <p>Dear <strong>${customer.name}</strong>,</p>
            <p>We wish to draw your attention to the fact that your <strong>Service Agreement</strong> with DAFKU Law Firm has been signed; however, payment has not yet been received.</p>
            ${customer.paymentNote ? `<div class="box"><p><strong>Note:</strong> ${customer.paymentNote}</p></div>` : ''}
            ${portalUrl ? `<p>Please access your client portal to complete the payment process:</p><p><a href="${portalUrl}" class="btn">Complete Payment</a></p>` : '<p>Please contact our office to arrange payment at your earliest convenience.</p>'}
            <hr>
            <p>Should you have already arranged payment, please disregard this notice — our team will confirm receipt promptly.</p>
            <div class="sig">Yours sincerely,<br><strong>DAFKU Law Firm</strong></div>
          `),
        });
        await customersCol.updateOne(
          { customerId: customer.customerId },
          { $set: { paymentReminderSentAt: new Date().toISOString() } }
        );
        console.log(`Payment reminder sent to ${customer.email} (${customer.customerId})`);
      }
    } catch (err) {
      console.error('Payment reminder job failed:', err?.message || err);
    }
  }
  // Run once on startup (catches any overdue on restart), then daily
  sendPaymentReminders().catch(() => {});
  setInterval(() => sendPaymentReminders().catch(() => {}), 24 * 60 * 60 * 1000);

  // ── Serve built React frontend (full-stack single-service mode) ──────────────
  // When `npm run build` has been run (e.g. on Render), the dist/ folder exists.
  // Express serves it as static assets and falls back to index.html for the SPA.
  // API routes defined earlier always take priority over the catch-all.
  const distDir = path.join(process.cwd(), 'dist');
  if (fs.existsSync(distDir)) {
    app.use(express.static(distDir, { maxAge: '1h', etag: true }));
    // SPA fallback — HashRouter handles client-side routing, so only serve index.html
    // for paths that are not API endpoints or the server-rendered join form.
    // Use regex instead of '*' — path-to-regexp v8+ (Express 5 router) no longer accepts bare wildcards.
    app.get(/.*/, (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/join/')) return next();
      res.sendFile(path.join(distDir, 'index.html'));
    });
    console.log(`[static] Serving React frontend from ${distDir}`);
  }

  app.listen(PORT, () => {
    console.log(`API listening on port ${PORT}`);
  });
})();

// File uploads (documents) -- store on disk and metadata in Mongo
const uploadsDir = path.resolve(process.cwd(), "server", "uploads");
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ts = Date.now();
    const safe = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, "_");
    cb(null, `${ts}-${safe}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: MAX_UPLOAD_SIZE_BYTES },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_UPLOAD_MIME_TYPES.has(file.mimetype)) {
      return cb(new Error("invalid_file_type"));
    }
    return cb(null, true);
  },
});

function isValidOwnerType(value) {
  return value === "case" || value === "customer";
}

function isValidOwnerId(value) {
  return /^[A-Za-z0-9\-]{2,40}$/.test(String(value || ""));
}

// Returns true if the current user is allowed to access a document owner (case or customer).
async function verifyDocumentOwnerAccess(user, ownerType, ownerId) {
  if (isAdminUser(user)) return true;
  if (ownerType === 'case') {
    const c = await casesCol.findOne({ caseId: ownerId, ...buildCaseScopeFilter(user) });
    return !!c;
  }
  if (ownerType === 'customer') {
    const [cust, cli] = await Promise.all([
      customersCol.findOne({ customerId: ownerId, ...buildCustomerScopeFilter(user) }),
      confirmedClientsCol.findOne({ customerId: ownerId, ...buildClientScopeFilter(user) }),
    ]);
    return !!(cust || cli);
  }
  return false;
}

app.post('/api/documents/upload', verifyAuth, upload.single('file'), async (req, res) => {
  try {
    const ownerType = String(req.body.ownerType || "").trim(); // 'case' or 'customer'
    const ownerId = String(req.body.ownerId || "").trim();
    if (!req.file || !ownerType || !ownerId) return res.status(400).json({ error: 'missing' });
    if (!isValidOwnerType(ownerType) || !isValidOwnerId(ownerId)) return res.status(400).json({ error: 'invalid_owner' });
    const doc = {
      docId: `D${Date.now()}`,
      ownerType,
      ownerId,
      filename: req.file.filename,
      originalName: req.file.originalname,
      mime: req.file.mimetype,
      size: req.file.size,
      path: req.file.path,
      uploadedBy: req.user?.username || null,
      uploadedAt: new Date().toISOString(),
    };
    await documentsCol.insertOne(doc);
    await logAudit({ username: req.user?.username, role: req.user?.role, action: 'upload', resource: 'document', resourceId: doc.docId, details: { ownerType, ownerId, originalName: doc.originalName } });
    return res.json(doc);
  } catch (err) {
    if (err?.message === "invalid_file_type") {
      return res.status(400).json({ error: "invalid_file_type" });
    }
    if (err?.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ error: "file_too_large" });
    }
    console.error('/api/documents/upload error', err);
    return res.status(500).json({ error: 'upload_failed' });
  }
});

app.get('/api/documents', verifyAuth, async (req, res) => {
  const ownerType = String(req.query.ownerType || "").trim();
  const ownerId = String(req.query.ownerId || "").trim();
  if (!ownerType || !ownerId) return res.status(400).json({ error: 'missing' });
  if (!isValidOwnerType(ownerType) || !isValidOwnerId(ownerId)) return res.status(400).json({ error: 'invalid_owner' });
  const allowed = await verifyDocumentOwnerAccess(req.user, ownerType, ownerId);
  if (!allowed) return res.status(403).json({ error: 'forbidden' });
  const docs = await documentsCol.find({ ownerType, ownerId }).sort({ uploadedAt: -1 }).toArray();
  res.json(docs);
});

app.get('/api/documents/:docId', verifyAuth, async (req, res) => {
  const { docId } = req.params;
  const doc = await documentsCol.findOne({ docId });
  if (!doc) return res.status(404).json({ error: 'not_found' });
  const allowed = await verifyDocumentOwnerAccess(req.user, doc.ownerType, doc.ownerId);
  if (!allowed) return res.status(403).json({ error: 'forbidden' });
  return res.sendFile(path.resolve(doc.path));
});

app.delete('/api/documents/:docId', verifyAuth, async (req, res) => {
  try {
    const { docId } = req.params;
    const doc = await documentsCol.findOne({ docId });
    if (!doc) return res.status(404).json({ error: 'not_found' });
    const allowed = await verifyDocumentOwnerAccess(req.user, doc.ownerType, doc.ownerId);
    if (!allowed) return res.status(403).json({ error: 'forbidden' });
    try { await fs.promises.unlink(doc.path); } catch (e) { /* ignore */ }
    await documentsCol.deleteOne({ docId });
    await logAudit({ username: req.user?.username, role: req.user?.role, action: 'delete', resource: 'document', resourceId: docId, details: { ownerType: doc.ownerType, ownerId: doc.ownerId } });
    return res.json({ ok: true });
  } catch (err) {
    console.error('/api/documents/:docId delete error', err);
    return res.status(500).json({ error: 'delete_failed' });
  }
});

app.patch('/api/documents/:docId/status', verifyAuth, async (req, res) => {
  try {
    const { docId } = req.params;
    const { status } = req.body || {};
    if (!['received', 'pending', 'expired'].includes(status)) {
      return res.status(400).json({ error: 'invalid_status' });
    }
    const doc = await documentsCol.findOne({ docId });
    if (!doc) return res.status(404).json({ error: 'not_found' });
    const allowed = await verifyDocumentOwnerAccess(req.user, doc.ownerType, doc.ownerId);
    if (!allowed) return res.status(403).json({ error: 'forbidden' });
    await documentsCol.updateOne({ docId }, { $set: { docStatus: status } });
    await logAudit({ username: req.user?.username, role: req.user?.role, action: 'update', resource: 'document', resourceId: docId, details: { docStatus: status } });
    return res.json({ ok: true, docStatus: status });
  } catch (err) {
    console.error('/api/documents/:docId/status patch error', err);
    return res.status(500).json({ error: 'update_failed' });
  }
});

// Admin audit log endpoint
app.get('/api/audit/logs', verifyAuth, requireRole('admin'), async (req, res) => {
  try {
    const pageRaw = Number(req.query.page || 1);
    const sizeRaw = Number(req.query.pageSize || req.query.limit || 200);
    const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1;
    const pageSize = Math.min(500, Math.max(1, Number.isFinite(sizeRaw) ? Math.floor(sizeRaw) : 200));
    const skip = (page - 1) * pageSize;

    const q = String(req.query.q || "").trim().slice(0, 120);
    const action = String(req.query.action || "").trim().slice(0, 60);
    const resource = String(req.query.resource || "").trim().slice(0, 60);
    const role = String(req.query.role || "").trim().slice(0, 60);
    const from = String(req.query.from || "").trim();
    const to = String(req.query.to || "").trim();

    const query = {};
    if (action) query.action = action;
    if (resource) query.resource = resource;
    if (role) query.role = role;

    if (from || to) {
      query.at = {};
      if (from) {
        const fromDate = new Date(from);
        if (!Number.isNaN(fromDate.getTime())) query.at.$gte = fromDate.toISOString();
      }
      if (to) {
        const toDate = new Date(to);
        if (!Number.isNaN(toDate.getTime())) query.at.$lte = toDate.toISOString();
      }
      if (!query.at.$gte && !query.at.$lte) {
        delete query.at;
      }
    }

    if (q) {
      const safeQ = new RegExp(escapeRegex(q), "i");
      query.$or = [
        { username: safeQ },
        { consultantName: safeQ },
        { action: safeQ },
        { resource: safeQ },
        { resourceId: safeQ },
      ];
    }

    const [items, total] = await Promise.all([
      auditLogsCol.find(query).sort({ at: -1 }).skip(skip).limit(pageSize).toArray(),
      auditLogsCol.countDocuments(query),
    ]);

    res.json({ items, total, page, pageSize });
  } catch (err) {
    res.status(500).json({ error: 'failed' });
  }
});

app.get('/api/team/summary', verifyAuth, requireRole('admin'), async (req, res) => {
  try {
    const users = await usersCol.find({ role: { $in: ['lawyer'] } }).project({ username: 1, consultantName: 1, role: 1 }).toArray();
    const summaries = [];
    const now = new Date();
    const weekLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    for (const user of users) {
      const consultantName = stripProfessionalTitle(user.consultantName || CONSULTANT_BY_USERNAME[user.username] || user.username);
      const matcher = buildAssignedToMatcher(consultantName) || consultantName;
      const [customersCount, clientsCount, casesCount, meetingsCount] = await Promise.all([
        customersCol.countDocuments({ assignedTo: matcher }),
        confirmedClientsCol.countDocuments({ assignedTo: matcher }),
        casesCol.countDocuments({ assignedTo: matcher }),
        meetingsCol.countDocuments({ assignedTo: matcher, startsAt: { $gte: now.toISOString(), $lte: weekLater.toISOString() } }),
      ]);
      summaries.push({
        username: user.username,
        consultantName,
        role: user.role,
        customersCount,
        clientsCount,
        casesCount,
        meetingsCount,
      });
    }
    res.json(summaries.sort((a, b) => a.consultantName.localeCompare(b.consultantName)));
  } catch (err) {
    res.status(500).json({ error: 'failed' });
  }
});

app.get('/api/meetings', verifyAuth, async (req, res) => {
  const scope = buildMeetingScopeFilter(req.user);
  const meetings = await meetingsCol.find(scope).sort({ startsAt: 1 }).toArray();
  res.json(meetings);
});

app.post('/api/meetings', verifyAuth, async (req, res) => {
  const parsedStarts = new Date(req.body?.startsAt || '');
  if (Number.isNaN(parsedStarts.getTime())) return res.status(400).json({ error: 'invalid_startsAt' });

  const meetingId = `M${Date.now()}`;
  const assignedToRaw = stripProfessionalTitle(req.body?.assignedTo || '') || getUserLawyerName(req.user) || '';
  if (!assignedToRaw) return res.status(400).json({ error: 'assignedTo_required' });

  const payload = {
    meetingId,
    title: String(req.body?.title || 'Consultation').trim().slice(0, 140),
    customerId: String(req.body?.customerId || '').trim() || null,
    startsAt: parsedStarts.toISOString(),
    endsAt: req.body?.endsAt ? new Date(req.body.endsAt).toISOString() : null,
    assignedTo: assignedToRaw,
    location: String(req.body?.location || '').trim().slice(0, 200) || null,
    notes: String(req.body?.notes || '').trim().slice(0, 2000),
    status: String(req.body?.status || 'scheduled').slice(0, 40),
    createdBy: req.user?.username || null,
    createdAt: new Date().toISOString(),
  };

  if (!isAdminUser(req.user) && !isLawyerUser(req.user) && payload.assignedTo !== getUserLawyerName(req.user)) {
    return res.status(403).json({ error: 'forbidden_assignee' });
  }

  await meetingsCol.insertOne(payload);
  await logAudit({ username: req.user?.username, role: req.user?.role, action: 'create', resource: 'meeting', resourceId: meetingId, details: { assignedTo: payload.assignedTo, customerId: payload.customerId } });
  res.status(201).json(payload);
});

app.put('/api/meetings/:id', verifyAuth, async (req, res) => {
  const id = String(req.params.id || '').trim();
  const current = await meetingsCol.findOne({ meetingId: id, ...buildMeetingScopeFilter(req.user) });
  if (!current) return res.status(404).json({ error: 'not_found' });

  const update = { ...req.body };
  delete update._id;
  delete update.meetingId;
  delete update.createdBy;
  delete update.createdAt;

  if (update.assignedTo) update.assignedTo = stripProfessionalTitle(update.assignedTo);
  if (update.startsAt) {
    const parsedStarts = new Date(update.startsAt);
    if (Number.isNaN(parsedStarts.getTime())) return res.status(400).json({ error: 'invalid_startsAt' });
    update.startsAt = parsedStarts.toISOString();
  }
  if (update.endsAt) {
    const parsedEnds = new Date(update.endsAt);
    if (Number.isNaN(parsedEnds.getTime())) return res.status(400).json({ error: 'invalid_endsAt' });
    update.endsAt = parsedEnds.toISOString();
  }

  if (!isAdminUser(req.user) && !isLawyerUser(req.user)) {
    update.assignedTo = getUserLawyerName(req.user);
  }

  await meetingsCol.updateOne({ meetingId: id, ...buildMeetingScopeFilter(req.user) }, { $set: update });
  const updated = await meetingsCol.findOne({ meetingId: id, ...buildMeetingScopeFilter(req.user) });
  await logAudit({ username: req.user?.username, role: req.user?.role, action: 'update', resource: 'meeting', resourceId: id, details: { update } });
  res.json(updated);
});

app.delete('/api/meetings/:id', verifyAuth, async (req, res) => {
  const id = String(req.params.id || '').trim();
  const current = await meetingsCol.findOne({ meetingId: id, ...buildMeetingScopeFilter(req.user) });
  if (!current) return res.status(404).json({ error: 'not_found' });
  await meetingsCol.deleteOne({ meetingId: id, ...buildMeetingScopeFilter(req.user) });
  await logAudit({ username: req.user?.username, role: req.user?.role, action: 'delete', resource: 'meeting', resourceId: id });
  res.json({ ok: true });
});

// ── Global Search ──────────────────────────────────────────────────────────────
app.get('/api/search', verifyAuth, async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q || q.length < 2) return res.json({ customers: [], clients: [], cases: [] });
  const regex = new RegExp(escapeRegex(q), 'i');
  const textMatch = { $or: [{ name: regex }, { customerId: regex }, { phone: regex }, { email: regex }] };
  const [customers, clients, cases] = await Promise.all([
    customersCol.find({ ...textMatch, ...buildCustomerScopeFilter(req.user) }).limit(8).toArray(),
    confirmedClientsCol.find({ ...textMatch, ...buildClientScopeFilter(req.user) }).limit(8).toArray(),
    casesCol.find({ $or: [{ caseId: regex }, { title: regex }, { category: regex }, { customerId: regex }], ...buildCaseScopeFilter(req.user) }).limit(8).toArray(),
  ]);
  res.json({
    customers: customers.map(c => ({ customerId: c.customerId, name: c.name, status: c.status, type: 'customer' })),
    clients: clients.map(c => ({ customerId: c.customerId, name: c.name, status: c.status, type: 'client' })),
    cases: cases.map(c => ({ caseId: c.caseId, title: c.title, customerId: c.customerId, state: c.state, caseType: c.caseType, type: 'case' })),
  });
});

// ── Invoices ───────────────────────────────────────────────────────────────────
app.get('/api/invoices', verifyAuth, async (req, res) => {
  const filter = {};
  if (req.query.caseId) filter.caseId = String(req.query.caseId);
  if (req.query.customerId) filter.customerId = String(req.query.customerId);
  if (!isAdminUser(req.user) && !isLawyerUser(req.user)) {
    const lawyerName = getUserLawyerName(req.user);
    if (lawyerName) filter.assignedTo = lawyerName;
  }
  const items = await invoicesCol.find(filter).sort({ createdAt: -1 }).toArray();
  res.json(items);
});

app.post('/api/invoices', verifyAuth, async (req, res) => {
  const { caseId, customerId, description, amount, currency = 'EUR', status = 'pending', dueDate } = req.body;
  if (!customerId) return res.status(400).json({ error: 'customerId required' });
  const now = new Date().toISOString();
  const doc = {
    invoiceId: genShortId('INV'),
    caseId: caseId || null,
    customerId,
    description: description || '',
    amount: Number(amount) || 0,
    currency,
    status, // pending | paid | overdue | cancelled
    dueDate: dueDate || null,
    createdAt: now,
    createdBy: req.user?.username || null,
    assignedTo: getUserLawyerName(req.user) || null,
  };
  await invoicesCol.insertOne(doc);
  await logAudit({ username: req.user?.username, role: req.user?.role, action: 'create', resource: 'invoice', resourceId: doc.invoiceId, details: { doc } });
  res.status(201).json(doc);
});

app.put('/api/invoices/:id', verifyAuth, async (req, res) => {
  const id = String(req.params.id || '').trim();
  // Scope: admin/lawyer see all
  const invoiceFilter = { invoiceId: id };
  if (!isAdminUser(req.user) && !isLawyerUser(req.user)) {
    const lawyerName = getUserLawyerName(req.user);
    if (lawyerName) invoiceFilter.assignedTo = lawyerName;
    else return res.status(403).json({ error: 'forbidden' });
  }
  const existing = await invoicesCol.findOne(invoiceFilter);
  if (!existing) return res.status(404).json({ error: 'not_found' });
  const update = { ...req.body };
  delete update._id;
  delete update.invoiceId;
  delete update.createdAt;
  delete update.createdBy;
  delete update.assignedTo; // prevent reassigning
  await invoicesCol.updateOne({ invoiceId: id }, { $set: update });
  const updated = await invoicesCol.findOne({ invoiceId: id });
  await logAudit({ username: req.user?.username, role: req.user?.role, action: 'update', resource: 'invoice', resourceId: id, details: { update } });
  res.json(updated);
});

app.delete('/api/invoices/:id', verifyAuth, async (req, res) => {
  if (!isAdminUser(req.user)) return res.status(403).json({ error: 'admin only' });
  await invoicesCol.deleteOne({ invoiceId: String(req.params.id) });
  res.json({ ok: true });
});

// ── Case Communications Log ────────────────────────────────────────────────────
app.get('/api/cases/:id/comms', verifyAuth, async (req, res) => {
  const allowed = await casesCol.findOne({ caseId: req.params.id, ...buildCaseScopeFilter(req.user) });
  if (!allowed) return res.status(404).json({ error: 'Not found' });
  const items = await commsLogCol.find({ caseId: req.params.id }).sort({ date: -1 }).toArray();
  res.json(items);
});

app.post('/api/cases/:id/comms', verifyAuth, async (req, res) => {
  const allowed = await casesCol.findOne({ caseId: req.params.id, ...buildCaseScopeFilter(req.user) });
  if (!allowed) return res.status(404).json({ error: 'Not found' });
  const { channel, summary, direction = 'outbound' } = req.body;
  if (!summary) return res.status(400).json({ error: 'summary required' });
  const doc = {
    commId: genShortId('CM'),
    caseId: req.params.id,
    channel: channel || 'email', // email | whatsapp | phone | inperson
    direction, // inbound | outbound
    summary,
    date: new Date().toISOString(),
    loggedBy: req.user?.username || null,
  };
  await commsLogCol.insertOne(doc);
  res.status(201).json(doc);
});

app.delete('/api/comms/:id', verifyAuth, async (req, res) => {
  const entry = await commsLogCol.findOne({ commId: String(req.params.id) });
  if (!entry) return res.status(404).json({ error: 'not_found' });
  // Only admin or the case owner may delete comms entries
  if (!isAdminUser(req.user)) {
    const caseAllowed = await casesCol.findOne({ caseId: entry.caseId, ...buildCaseScopeFilter(req.user) });
    if (!caseAllowed) return res.status(403).json({ error: 'forbidden' });
  }
  await commsLogCol.deleteOne({ commId: String(req.params.id) });
  res.json({ ok: true });
});

// ── Client Portal Tokens ───────────────────────────────────────────────────────
app.post('/api/portal/tokens', verifyAuth, async (req, res) => {
  if (!isAdminUser(req.user)) return res.status(403).json({ error: 'admin only' });
  const { customerId, expiresInDays = 30 } = req.body;
  if (!customerId) return res.status(400).json({ error: 'customerId required' });
  // Support both confirmed clients AND leads (customers)
  let person = await confirmedClientsCol.findOne({ customerId: String(customerId).trim() });
  let personType = 'client';
  if (!person) {
    person = await customersCol.findOne({ customerId: String(customerId).trim() });
    personType = 'customer';
  }
  if (!person) return res.status(404).json({ error: 'Client or customer not found' });
  // Revoke any existing token for this client
  await portalTokensCol.deleteMany({ customerId: String(customerId).trim() });
  const rawToken = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();
  const doc = { token: rawToken, customerId: String(customerId).trim(), clientName: person.name, clientType: personType, createdAt: new Date().toISOString(), expiresAt, createdBy: req.user?.username };
  await portalTokensCol.insertOne(doc);
  // Auto-email the portal link if the person has an email and APP_URL is configured
  if (person.email && process.env.APP_URL) {
    const portalUrl = `${process.env.APP_URL}/#/portal/${rawToken}`;
    sendEmail({
      to: person.email,
      subject: 'Your Client Portal — DAFKU Law Firm',
      text: [
        `Dear ${person.name || 'Client'},`,
        '',
        'Your secure personal client portal with DAFKU Law Firm has been set up and is ready for use.',
        '',
        `Access your portal here:\n${portalUrl}`,
        '',
        'Through you portal you can:',
        '  • Track your matter status in real time',
        '  • Review proposals and service agreements',
        '  • View your invoices and payment details',
        '  • Communicate directly with your legal team',
        '',
        `This access link is valid until ${new Date(expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.`,
        '',
        'For any assistance, contact us on WhatsApp: +355 69 69 52 989',
        '',
        'Yours sincerely,\nDAFKU Law Firm\ninfo@dafkulawfirm.al',
      ].join('\n'),
      html: buildHtmlEmail(`
        <p>Dear <strong>${person.name || 'Client'}</strong>,</p>
        <p>Your secure personal client portal with <strong>DAFKU Law Firm</strong> has been set up and is ready for use.</p>
        <p>Through your portal, you can:</p>
        <div class="box">
          <p>✔&nbsp; Track your matter status in real time</p>
          <p>✔&nbsp; Review proposals and service agreements</p>
          <p>✔&nbsp; View invoices and payment details</p>
          <p>✔&nbsp; Communicate directly with your legal team</p>
        </div>
        <p><a href="${portalUrl}" class="btn">Access Your Client Portal</a></p>
        <p style="font-size:13px;color:#666">This access link is valid until <strong>${new Date(expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</strong>. Please keep it secure and do not share it with others.</p>
        <div class="sig">Yours sincerely,<br><strong>DAFKU Law Firm</strong></div>
      `),
    });
  }
  res.json({ token: rawToken, expiresAt });
});

app.get('/api/portal/tokens/:customerId', verifyAuth, async (req, res) => {
  if (!isAdminUser(req.user) && !isLawyerUser(req.user)) return res.status(403).json({ error: 'forbidden' });
  const existing = await portalTokensCol.findOne({ customerId: String(req.params.customerId).trim() });
  res.json(existing || null);
});

app.delete('/api/portal/tokens/:customerId', verifyAuth, async (req, res) => {
  if (!isAdminUser(req.user) && !isLawyerUser(req.user)) return res.status(403).json({ error: 'forbidden' });
  await portalTokensCol.deleteMany({ customerId: String(req.params.customerId).trim() });
  res.json({ ok: true });
});

// Extend an existing portal link by N more days
app.patch('/api/portal/tokens/:customerId/extend', verifyAuth, async (req, res) => {
  if (!isAdminUser(req.user) && !isLawyerUser(req.user)) return res.status(403).json({ error: 'forbidden' });
  const customerId = String(req.params.customerId).trim();
  const extraDays = Math.min(365, Math.max(1, Number(req.body?.days) || 30));
  const existing = await portalTokensCol.findOne({ customerId });
  if (!existing) return res.status(404).json({ error: 'No portal link found for this customer' });
  const baseDate = new Date(existing.expiresAt) > new Date() ? new Date(existing.expiresAt) : new Date();
  const newExpiry = new Date(baseDate.getTime() + extraDays * 24 * 60 * 60 * 1000).toISOString();
  await portalTokensCol.updateOne({ customerId }, { $set: { expiresAt: newExpiry } });
  const updated = await portalTokensCol.findOne({ customerId });
  await logAudit({ username: req.user?.username, role: req.user?.role, action: 'extend', resource: 'portalToken', resourceId: customerId, details: { extraDays, newExpiry } });
  res.json(updated);
});

// Portal notes — visible to client on their portal page
app.get('/api/portal-notes/:customerId', verifyAuth, async (req, res) => {
  if (!isAdminUser(req.user)) return res.status(403).json({ error: 'admin only' });
  const notes = await portalNotesCol.find({ customerId: String(req.params.customerId).trim() }).sort({ createdAt: -1 }).toArray();
  res.json(notes);
});

app.post('/api/portal-notes/:customerId', verifyAuth, async (req, res) => {
  if (!isAdminUser(req.user)) return res.status(403).json({ error: 'admin only' });
  const { text } = req.body;
  if (!text || !String(text).trim()) return res.status(400).json({ error: 'text required' });
  const note = { noteId: genShortId('PN'), customerId: String(req.params.customerId).trim(), text: String(text).trim(), createdAt: new Date().toISOString(), createdBy: req.user?.username };
  await portalNotesCol.insertOne(note);
  res.status(201).json(note);
});

app.delete('/api/portal-notes/:customerId/:noteId', verifyAuth, async (req, res) => {
  if (!isAdminUser(req.user)) return res.status(403).json({ error: 'admin only' });
  await portalNotesCol.deleteOne({ customerId: String(req.params.customerId).trim(), noteId: String(req.params.noteId) });
  res.json({ ok: true });
});

// Public portal data — no staff auth needed, uses portal token instead
app.get('/api/portal/:token', async (req, res) => {
  const tokenDoc = await portalTokensCol.findOne({ token: String(req.params.token) });
  if (!tokenDoc) return res.status(404).json({ error: 'Invalid link' });
  if (new Date(tokenDoc.expiresAt) < new Date()) return res.status(410).json({ error: 'Link expired' });
  // Support both confirmed clients and leads/customers
  let client = await confirmedClientsCol.findOne({ customerId: tokenDoc.customerId });
  const isConfirmedClient = !!client;
  if (!client) client = await customersCol.findOne({ customerId: tokenDoc.customerId });
  if (!client) return res.status(404).json({ error: 'Client not found' });
  // Stamp portal last viewed time on the customer record (fire-and-forget)
  const viewedAt = new Date().toISOString();
  (isConfirmedClient ? confirmedClientsCol : customersCol)
    .updateOne({ customerId: tokenDoc.customerId }, { $set: { portalLastViewedAt: viewedAt } })
    .catch(() => {});
  // Show matching case type: client cases for confirmed clients, customer cases for leads
  const caseTypeFilter = isConfirmedClient ? 'client' : 'customer';
  const cases = await casesCol.find({ customerId: tokenDoc.customerId, caseType: caseTypeFilter }).sort({ lastStateChange: -1 }).toArray();
  const caseIds = cases.map(c => c.caseId);
  const [history, portalNotes, invoices] = await Promise.all([
    caseIds.length ? historyCol.find({ caseId: { $in: caseIds } }).sort({ date: -1 }).toArray() : [],
    portalNotesCol.find({ customerId: tokenDoc.customerId }).sort({ createdAt: -1 }).toArray(),
    invoicesCol.find({ customerId: tokenDoc.customerId }).sort({ createdAt: -1 }).toArray(),
  ]);
  res.json({
    client: { name: client.name, customerId: client.customerId, services: client.services || [], status: client.status, proposalFields: client.proposalFields || null, intakeLastSubmittedAt: client.intakeLastSubmittedAt || null },
    cases: cases.map(c => ({
      caseId: c.caseId,
      title: c.title,
      category: c.category,
      subcategory: c.subcategory,
      state: c.state,
      priority: c.priority,
      deadline: c.deadline,
      lastStateChange: c.lastStateChange,
      generalNote: c.generalNote || null,
    })),
    history,
    portalNotes: portalNotes.map(n => ({ noteId: n.noteId, text: n.text, createdAt: n.createdAt, createdBy: n.createdBy })),
    invoices: invoices.map(inv => ({
      invoiceId: inv.invoiceId,
      description: inv.description,
      amount: inv.amount,
      currency: inv.currency,
      status: inv.status,
      dueDate: inv.dueDate || null,
      createdAt: inv.createdAt,
      payments: inv.payments || [],
      amountPaid: inv.amountPaid || 0,
    })),
    expiresAt: tokenDoc.expiresAt,
    linkExpired: false,
    proposalSentAt: client.proposalSentAt || null,
    proposalExpiresAt: client.proposalExpiresAt || null,
    proposalSnapshot: client.proposalSnapshot || null,
    proposalViewedAt: client.proposalViewedAt || null,
    intakeBotReset: !!client.intakeBotReset,
    contractSentAt: client.contractSentAt || null,
    contractSnapshot: client.contractSnapshot || null,
    contractViewedAt: client.contractViewedAt || null,
    // Payment fields (shown after contract signing)
    paymentAmountALL: client.paymentAmountALL ?? null,
    paymentAmountEUR: client.paymentAmountEUR ?? null,
    paymentNote: client.paymentNote ?? null,
    paymentMethods: client.paymentMethods ?? null,
    paymentSelectedMethod: client.paymentSelectedMethod ?? null,
    paymentDoneAt: client.paymentDoneAt ?? null,
    initialPaymentAmount: client.initialPaymentAmount ?? null,
    initialPaymentCurrency: client.initialPaymentCurrency ?? null,
  });
});

// Save intake/proposal fields from portal (token-based, no auth required)
app.post('/api/portal/:token/intake', portalActionLimiter, async (req, res) => {
  const tokenDoc = await portalTokensCol.findOne({ token: String(req.params.token) });
  if (!tokenDoc) return res.status(404).json({ error: 'Invalid link' });
  if (new Date(tokenDoc.expiresAt) < new Date()) return res.status(410).json({ error: 'Link expired' });
  const { proposalFields } = req.body;
  if (!proposalFields || typeof proposalFields !== 'object') return res.status(400).json({ error: 'proposalFields required' });

  // Fetch current record to check status for auto-advance
  const currentRecord = await customersCol.findOne({ customerId: tokenDoc.customerId })
    || await confirmedClientsCol.findOne({ customerId: tokenDoc.customerId });

  const setFields = { proposalFields, intakeBotReset: false, intakeLastSubmittedAt: new Date().toISOString() };
  if (proposalFields.nationality) setFields.nationality = proposalFields.nationality;
  if (proposalFields.country) setFields.country = proposalFields.country;

  // Auto-advance status: INTAKE → SEND_PROPOSAL when client submits the intake form
  const wasIntake = currentRecord?.status === 'INTAKE';
  if (wasIntake) setFields.status = 'SEND_PROPOSAL';

  // Try customers collection first, then confirmed clients
  const custResult = await customersCol.findOneAndUpdate(
    { customerId: tokenDoc.customerId },
    { $set: setFields },
    { returnDocument: 'after' }
  );
  if (!custResult) {
    await confirmedClientsCol.updateOne(
      { customerId: tokenDoc.customerId },
      { $set: setFields }
    );
  }

  // Record status history and notify staff if status was auto-advanced
  if (wasIntake && currentRecord) {
    const historyId = genShortId('CH');
    await customerHistoryCol.insertOne({
      historyId,
      customerId: tokenDoc.customerId,
      statusFrom: 'INTAKE',
      statusTo: 'SEND_PROPOSAL',
      date: new Date().toISOString(),
      changedBy: 'portal-client',
      changedByRole: 'client',
      changedByConsultant: null,
      changedByLawyer: null,
    });
  }

  res.json({ ok: true });
});

// Mark proposal as viewed by client (first-view tracking, token-based, no auth)
app.post('/api/portal/:token/proposal-viewed', async (req, res) => {
  const tokenDoc = await portalTokensCol.findOne({ token: String(req.params.token) });
  if (!tokenDoc) return res.status(404).json({ error: 'Invalid link' });
  const viewedAt = new Date().toISOString();
  // Only record the first view (filter $exists: false prevents overwrite)
  const custResult = await customersCol.findOneAndUpdate(
    { customerId: tokenDoc.customerId, proposalViewedAt: { $exists: false } },
    { $set: { proposalViewedAt: viewedAt } },
    { returnDocument: 'after' }
  );
  if (!custResult) {
    await confirmedClientsCol.updateOne(
      { customerId: tokenDoc.customerId, proposalViewedAt: { $exists: false } },
      { $set: { proposalViewedAt: viewedAt } }
    );
  }
  res.json({ ok: true });
});

// Client responds to proposal: accept → advance to SEND_CONTRACT; revision → post chat message
app.post('/api/portal/:token/respond-proposal', portalActionLimiter, async (req, res) => {
  const tokenDoc = await portalTokensCol.findOne({ token: String(req.params.token) });
  if (!tokenDoc) return res.status(404).json({ error: 'Invalid link' });
  const { action, note } = req.body; // action: 'accept' | 'revision'
  if (!['accept', 'revision'].includes(action)) return res.status(400).json({ error: 'action must be accept or revision' });

  const customer = await customersCol.findOne({ customerId: tokenDoc.customerId });
  if (!customer) return res.status(404).json({ error: 'Customer not found' });

  if (action === 'accept') {
    if (!['WAITING_APPROVAL', 'SEND_PROPOSAL'].includes(customer.status)) {
      return res.status(400).json({ error: 'Proposal is not awaiting response' });
    }
    const now = new Date().toISOString();
    await customersCol.updateOne(
      { customerId: customer.customerId },
      { $set: { status: 'SEND_CONTRACT', proposalAcceptedAt: now } }
    );
    await customerHistoryCol.insertOne({
      historyId: genShortId('CH'),
      customerId: customer.customerId,
      statusFrom: customer.status,
      statusTo: 'SEND_CONTRACT',
      date: now,
      changedBy: 'portal-client',
      changedByRole: 'client',
      changedByConsultant: null,
      changedByLawyer: null,
    });
    // Auto-draft invoice from proposal fee snapshot
    const snap = customer.proposalSnapshot || customer.proposalFields || {};
    const invAmt = (Number(snap.serviceFeeALL) || 0) + (Number(snap.poaFeeALL) || 0) + (Number(snap.translationFeeALL) || 0) + (Number(snap.otherFeesALL) || 0);
    if (invAmt > 0) {
      const SVC_LABELS = { residency_pensioner: 'Residency Permit – Pensioner', visa_d: 'Type D Visa & Residence Permit', company_formation: 'Company Formation', real_estate: 'Real Estate Investment' };
      const svcNames = (customer.services || []).map(s => SVC_LABELS[s] || s).join(', ');
      await invoicesCol.insertOne({
        invoiceId: genShortId('INV'),
        customerId: customer.customerId,
        caseId: null,
        description: `Legal Services${svcNames ? ` — ${svcNames}` : ''} — ${customer.name}`,
        amount: invAmt,
        currency: 'ALL',
        status: 'pending',
        dueDate: null,
        createdAt: now,
        createdBy: 'portal-client',
        assignedTo: customer.assignedTo || null,
        autoDrafted: true,
      });
    }
    return res.json({ ok: true, status: 'SEND_CONTRACT' });
  }

  if (action === 'revision') {
    const now = new Date().toISOString();
    // Change status to Under Discussion so staff can see the request clearly
    await customersCol.updateOne(
      { customerId: customer.customerId },
      { $set: { status: 'DISCUSSING_Q' } }
    );
    await customerHistoryCol.insertOne({
      historyId: genShortId('CH'),
      customerId: customer.customerId,
      statusFrom: customer.status,
      statusTo: 'DISCUSSING_Q',
      date: now,
      changedBy: 'portal-client',
      changedByRole: 'client',
      changedByConsultant: null,
      changedByLawyer: null,
    });
    return res.json({ ok: true, status: 'DISCUSSING_Q' });
  }
});

// Client responds to contract: accept → status CLIENT (auto-assigned to Kejdi or Albert)
app.post('/api/portal/:token/respond-contract', portalActionLimiter, async (req, res) => {
  const tokenDoc = await portalTokensCol.findOne({ token: String(req.params.token) });
  if (!tokenDoc) return res.status(404).json({ error: 'Invalid link' });

  const customer = await customersCol.findOne({ customerId: tokenDoc.customerId });
  if (!customer) return res.status(404).json({ error: 'Customer not found' });

  if (!['WAITING_ACCEPTANCE', 'SEND_CONTRACT'].includes(customer.status)) {
    return res.status(400).json({ error: 'Contract is not awaiting acceptance' });
  }

  const { signedByName } = req.body || {};
  const now = new Date().toISOString();

  // Capture forensic metadata from the client's request
  const clientIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || req.ip || 'unknown';
  const userAgent = req.headers['user-agent'] || 'unknown';

  // Cryptographic HMAC seal — ties name + timestamp + customerId + contract content together.
  // Any post-hoc modification to any of these fields will invalidate the hash.
  const snapshotDigest = crypto.createHash('sha256')
    .update(JSON.stringify(customer.contractSnapshot || {}))
    .digest('hex');
  const hmacPayload = `${customer.customerId}|${signedByName || customer.name}|${now}|${snapshotDigest}`;
  const contractSignatureHash = crypto
    .createHmac('sha256', process.env.SIGNATURE_SECRET || 'law-sig-secret-change-me')
    .update(hmacPayload)
    .digest('hex');

  // Auto-assign to Kejdi or Albert — whoever has fewer confirmed clients; tie → Albert
  const [kejdiCount, albertCount] = await Promise.all([
    confirmedClientsCol.countDocuments({ assignedTo: 'Kejdi' }),
    confirmedClientsCol.countDocuments({ assignedTo: 'Albert' }),
  ]);
  const assignedTo = kejdiCount < albertCount ? 'Kejdi' : 'Albert';

  // Build the confirmed-client payload
  const confirmedPayload = {
    ...customer,
    status: 'AWAITING_PAYMENT',
    assignedTo,
    contractAcceptedAt: now,
    contractSignedByName: signedByName || customer.name,
    contractSignedAt: now,
    contractSignedIp: clientIp,
    contractSignedUserAgent: userAgent,
    contractSignatureHash,
    confirmedAt: now,
    sourceCustomerId: customer.customerId,
    version: (customer.version || 0) + 1,
  };

  // Atomic update — do this FIRST with status in filter to prevent double-submission.
  // If two requests arrive simultaneously (double-tap, network retry), only one gets matchedCount=1.
  const customerUpdateResult = await customersCol.updateOne(
    { customerId: customer.customerId, status: { $in: ['WAITING_ACCEPTANCE', 'SEND_CONTRACT'] } },
    { $set: { status: 'AWAITING_PAYMENT', assignedTo, contractAcceptedAt: now, contractSignedByName: signedByName || customer.name, contractSignedAt: now, contractSignedIp: clientIp, contractSignedUserAgent: userAgent, contractSignatureHash } }
  );
  if (customerUpdateResult.matchedCount === 0) {
    // Already processed (idempotent — return success so portal doesn't show an error on retry)
    return res.json({ ok: true, status: 'AWAITING_PAYMENT', assignedTo });
  }

  // Upsert into confirmedClients (safe to upsert — unique index on customerId)
  await confirmedClientsCol.updateOne(
    { customerId: customer.customerId },
    { $set: confirmedPayload },
    { upsert: true }
  );

  await customerHistoryCol.insertOne({
    historyId: genShortId('CH'),
    customerId: customer.customerId,
    statusFrom: customer.status,
    statusTo: 'AWAITING_PAYMENT',
    date: now,
    changedBy: 'portal-client',
    changedByRole: 'client',
    changedByConsultant: null,
    changedByLawyer: assignedTo,
  });

  // Auto-create initial payment invoice if admin set an initialPaymentAmount
  if (customer.initialPaymentAmount && customer.initialPaymentAmount > 0) {
    const SVC_LABELS = { residency_pensioner: 'Residency Permit – Pensioner', visa_d: 'Type D Visa & Residence Permit', company_formation: 'Company Formation', real_estate: 'Real Estate Investment' };
    const svcNames = (customer.services || []).map(s => SVC_LABELS[s] || s).join(', ');
    await invoicesCol.insertOne({
      invoiceId: genShortId('INV'),
      customerId: customer.customerId,
      caseId: null,
      description: `Initial Payment — ${svcNames ? svcNames + ' — ' : ''}${customer.name || customer.customerId}`,
      amount: customer.initialPaymentAmount,
      currency: customer.initialPaymentCurrency || 'EUR',
      status: 'pending',
      dueDate: null,
      createdAt: now,
      createdBy: 'system',
      assignedTo: assignedTo || null,
      autoCreated: true,
      source: 'contract_acceptance',
    });
  }

  // Welcome email telling client to complete payment
  if (customer.email) {
    const portalUrl = process.env.APP_URL ? `${process.env.APP_URL}/#/portal/${req.params.token}` : null;
      sendEmail({
      to: customer.email,
      subject: 'Agreement Signed — Next Steps to Activate Your Account | DAFKU Law Firm',
      text: [
        `Dear ${customer.name},`,
        '',
        'Thank you for signing your Service Agreement with DAFKU Law Firm.',
        '',
        'To complete your registration as a confirmed client, please proceed to the Payment section of your client portal.',
        '',
        customer.paymentNote ? `Payment note: ${customer.paymentNote}` : '',
        '',
        portalUrl ? `Please open your client portal to select a payment method and view payment instructions:\n${portalUrl}` : 'Please contact us to arrange payment.',
        '',
        'Once payment has been confirmed, your account will be fully activated and our team will commence work on your matter.',
        '',
        'For any queries, contact us on WhatsApp: +355 69 69 52 989',
        '',
        'Yours sincerely,\nDAFKU Law Firm\ninfo@dafkulawfirm.al',
      ].filter(l => l !== null && l !== undefined).join('\n'),
      html: buildHtmlEmail(`
        <p>Dear <strong>${customer.name}</strong>,</p>
        <p>Thank you for signing your <strong>Service Agreement</strong> with DAFKU Law Firm.</p>
        <p>To complete your registration as a confirmed client, please proceed to the <strong>Payment</strong> section of your client portal using the link below.</p>
        ${customer.paymentNote ? `<div class="box"><p><strong>Note:</strong> ${customer.paymentNote}</p></div>` : ''}
        ${portalUrl ? `<p><a href="${portalUrl}" class="btn">View Payment Instructions</a></p>` : '<p>Please contact our office to arrange payment.</p>'}
        <hr>
        <p>Once payment has been confirmed by our team, your account will be fully activated and work on your matter will commence promptly.</p>
        <div class="sig">Yours sincerely,<br><strong>DAFKU Law Firm</strong></div>
      `),
    });
  }

  return res.json({ ok: true, status: 'AWAITING_PAYMENT', assignedTo });
});

// ── Portal: client selects payment method ────────────────────────────────────
app.post('/api/portal/:token/select-payment', portalActionLimiter, async (req, res) => {
  const tokenDoc = await portalTokensCol.findOne({ token: String(req.params.token) });
  if (!tokenDoc) return res.status(404).json({ error: 'Invalid link' });
  if (new Date(tokenDoc.expiresAt) < new Date()) return res.status(410).json({ error: 'Link expired' });

  const { method } = req.body || {};
  if (!['bank', 'crypto', 'cash'].includes(method)) {
    return res.status(400).json({ error: 'Invalid payment method. Choose bank, crypto, or cash.' });
  }

  // Find in customers or confirmedClients
  let coll = customersCol;
  let record = await customersCol.findOne({ customerId: tokenDoc.customerId });
  if (!record) {
    record = await confirmedClientsCol.findOne({ customerId: tokenDoc.customerId });
    coll = confirmedClientsCol;
  }
  if (!record) return res.status(404).json({ error: 'Customer not found' });
  if (record.status !== 'AWAITING_PAYMENT') {
    return res.status(400).json({ error: 'Not in awaiting payment state' });
  }

  // Validate method is in accepted list
  const allowed = record.paymentMethods || [];
  if (!allowed.includes(method)) {
    return res.status(400).json({ error: 'This payment method is not available for your account.' });
  }

  await coll.updateOne(
    { customerId: tokenDoc.customerId },
    { $set: { paymentSelectedMethod: method } }
  );

  res.json({ ok: true, method });
});

// ── Admin: set initial payment amount ────────────────────────────────────────
app.put('/api/customers/:customerId/initial-payment-amount', verifyAuth, async (req, res) => {
  const customerId = String(req.params.customerId).trim();
  const amount = Number(req.body?.amount);
  const currency = String(req.body?.currency || 'EUR').trim();
  if (!amount || amount <= 0) return res.status(400).json({ error: 'amount must be > 0' });

  // Lock once customer has confirmed their payment intent
  const existing = await customersCol.findOne({ customerId });
  if (!existing) return res.status(404).json({ error: 'Customer not found' });
  if (existing.paymentSelectedMethod) {
    return res.status(409).json({ error: 'Cannot change initial payment amount after the customer has confirmed their payment intent.' });
  }

  const r = await customersCol.findOneAndUpdate(
    { customerId },
    { $set: { initialPaymentAmount: amount, initialPaymentCurrency: currency } },
    { returnDocument: 'after' }
  );
  if (!r) return res.status(404).json({ error: 'Customer not found' });
  res.json({ ok: true });
});

// ── Admin: mark payment done → promotes to CLIENT ─────────────────────────────
app.post('/api/customers/:customerId/mark-payment-done', verifyAuth, async (req, res) => {
  const customerId = String(req.params.customerId).trim();
  const now = new Date().toISOString();
  const doneBy = req.user?.consultantName || req.user?.username || 'admin';

  // Optional: auto-record initial payment on invoice
  const initialPaymentAmount = req.body?.initialPaymentAmount ? Number(req.body.initialPaymentAmount) : null;
  const initialPaymentCurrency = req.body?.currency ? String(req.body.currency) : null;
  const targetInvoiceId = req.body?.invoiceId ? String(req.body.invoiceId) : null;

  // Require customer to have selected a payment method before admin can confirm
  const preCheck = await customersCol.findOne({ customerId }) || await confirmedClientsCol.findOne({ customerId });
  if (!preCheck) return res.status(404).json({ error: 'Customer not found' });
  if (preCheck.status !== 'AWAITING_PAYMENT') return res.status(400).json({ error: 'Customer is not in AWAITING_PAYMENT status' });
  if (!preCheck.paymentSelectedMethod) return res.status(400).json({ error: 'Customer has not selected a payment method yet.' });

  const clientPayload = { status: 'CLIENT', paymentDoneAt: now, paymentDoneBy: doneBy };

  // Atomic findOneAndUpdate — prevents two admins clicking simultaneously from double-processing.
  // returnDocument:'before' gives us the original record for history/email, and status in filter
  // guarantees only one request can transition out of AWAITING_PAYMENT.
  let record = await customersCol.findOneAndUpdate(
    { customerId, status: 'AWAITING_PAYMENT' },
    { $set: clientPayload },
    { returnDocument: 'before' }
  );

  if (!record) {
    // Not in customers — try confirmedClients (edge case: manually migrated)
    record = await confirmedClientsCol.findOneAndUpdate(
      { customerId, status: 'AWAITING_PAYMENT' },
      { $set: clientPayload },
      { returnDocument: 'before' }
    );
    if (!record) {
      return res.status(400).json({ error: 'Customer is not in AWAITING_PAYMENT status' });
    }
    // Keep customers in sync
    await customersCol.updateOne({ customerId }, { $set: clientPayload });
  } else {
    // Upsert to confirmedClients (respond-contract already created it, but upsert:true is safe)
    await confirmedClientsCol.updateOne(
      { customerId },
      { $set: { ...record, ...clientPayload, confirmedAt: record.confirmedAt || now } },
      { upsert: true }
    );
    // Remove from customers — they are now a confirmed CLIENT and should only live in confirmedClients
    await customersCol.deleteOne({ customerId });
  }

  // Auto-record initial payment on invoice (if provided and invoice exists)
  if (initialPaymentAmount && initialPaymentAmount > 0) {
    const invFilter = targetInvoiceId
      ? { invoiceId: targetInvoiceId }
      : { customerId, status: { $ne: 'cancelled' } };
    const inv = await invoicesCol.findOne(invFilter, { sort: { createdAt: -1 } });
    if (inv) {
      const payment = {
        paymentId: genShortId('PAY'),
        amount: initialPaymentAmount,
        method: preCheck.paymentSelectedMethod || 'bank_transfer',
        note: 'Initial payment (confirmed by admin)',
        date: now,
        recordedBy: req.user?.username || 'admin',
      };
      const existingPayments = inv.payments || [];
      const allPayments = [...existingPayments, payment];
      const totalPaid = allPayments.reduce((s, p) => s + Number(p.amount), 0);
      const newStatus = totalPaid >= inv.amount ? 'paid' : inv.status === 'paid' ? 'pending' : inv.status;
      await invoicesCol.updateOne(
        { invoiceId: inv.invoiceId },
        { $push: { payments: payment }, $set: { amountPaid: totalPaid, status: newStatus } }
      );
    }
  }

  await customerHistoryCol.insertOne({
    historyId: genShortId('CH'),
    customerId,
    statusFrom: 'AWAITING_PAYMENT',
    statusTo: 'CLIENT',
    date: now,
    changedBy: req.user?.username || 'admin',
    changedByRole: req.user?.role || 'admin',
    changedByConsultant: req.user?.consultantName || null,
    changedByLawyer: record.assignedTo || null,
  });

  await logAudit({
    username: req.user?.username,
    role: req.user?.role,
    consultantName: req.user?.consultantName,
    action: 'mark_payment_done',
    resource: 'customer',
    resourceId: customerId,
    details: { paymentDoneBy: doneBy, paymentDoneAt: now, initialPaymentAmount },
  });

  // Notify client via email
  const clientRecord = await confirmedClientsCol.findOne({ customerId }) || await customersCol.findOne({ customerId });
  if (clientRecord?.email) {
    sendEmail({
      to: clientRecord.email,
      subject: 'Payment Confirmed — Welcome to DAFKU Law Firm',
      text: [
        `Dear ${clientRecord.name},`,
        '',
        'We are delighted to confirm receipt of your payment. You are now a fully confirmed client of DAFKU Law Firm.',
        '',
        'Your matter has been formally opened and our team will be in contact shortly to discuss the next steps and begin work on your behalf.',
        '',
        'You may continue to use your client portal to track progress and communicate with your legal team at any time.',
        '',
        'We look forward to working with you.',
        '',
        'For any questions, contact us on WhatsApp: +355 69 69 52 989',
        '',
        'Yours sincerely,\nDAFKU Law Firm\ninfo@dafkulawfirm.al',
      ].join('\n'),
      html: buildHtmlEmail(`
        <p>Dear <strong>${clientRecord.name}</strong>,</p>
        <p>We are delighted to confirm receipt of your payment. You are now a <strong>fully confirmed client</strong> of DAFKU Law Firm.</p>
        <p>Your matter has been formally opened and a member of our team will be in contact with you shortly to discuss the next steps and begin work on your behalf.</p>
        <p>You may continue to access your client portal at any time to track the progress of your matter and communicate directly with your legal team.</p>
        <hr>
        <p>We look forward to working with you and remain at your disposal for any questions.</p>
        <div class="sig">Yours sincerely,<br><strong>DAFKU Law Firm</strong></div>
      `),
    });
  }

  res.json({ ok: true, status: 'CLIENT' });
});

// ── Staff Workload ────────────────────────────────────────────────────────────
app.get('/api/admin/workload', verifyAuth, async (req, res) => {
  if (!isAdminUser(req.user)) return res.status(403).json({ error: 'admin only' });
  const [customers, clients, users] = await Promise.all([
    customersCol.find({}, { projection: { assignedTo: 1, status: 1 } }).toArray(),
    confirmedClientsCol.find({}, { projection: { assignedTo: 1, status: 1 } }).toArray(),
    usersCol.find({ role: { $in: ['lawyer', 'admin'] } }, { projection: { username: 1, consultantName: 1, role: 1 } }).toArray(),
  ]);
  const map = {};
  for (const u of users) {
    map[u.username] = { username: u.username, name: u.consultantName || u.username, role: u.role, leads: 0, clients: 0, total: 0 };
  }
  for (const c of customers) {
    if (c.assignedTo && map[c.assignedTo]) { map[c.assignedTo].leads++; map[c.assignedTo].total++; }
  }
  for (const c of clients) {
    if (c.assignedTo && map[c.assignedTo]) { map[c.assignedTo].clients++; map[c.assignedTo].total++; }
  }
  res.json(Object.values(map).sort((a, b) => b.total - a.total));
});

// ── Invoice Payments ──────────────────────────────────────────────────────────
app.post('/api/invoices/:id/payments', verifyAuth, async (req, res) => {
  const inv = await invoicesCol.findOne({ invoiceId: String(req.params.id) });
  if (!inv) return res.status(404).json({ error: 'Invoice not found' });
  const paymentAmt = Number(req.body?.amount);
  if (!paymentAmt || paymentAmt <= 0) return res.status(400).json({ error: 'amount must be > 0' });
  const payment = {
    paymentId: genShortId('PAY'),
    amount: paymentAmt,
    method: req.body?.method || 'bank_transfer',
    note: req.body?.note?.trim() || null,
    date: new Date().toISOString(),
    recordedBy: req.user?.username || null,
  };
  const existingPayments = inv.payments || [];
  const allPayments = [...existingPayments, payment];
  const totalPaid = allPayments.reduce((s, p) => s + Number(p.amount), 0);
  const newStatus = totalPaid >= inv.amount ? 'paid' : inv.status === 'paid' ? 'pending' : inv.status;
  await invoicesCol.updateOne(
    { invoiceId: String(req.params.id) },
    { $push: { payments: payment }, $set: { amountPaid: totalPaid, status: newStatus } }
  );
  const updated = await invoicesCol.findOne({ invoiceId: String(req.params.id) });
  await logAudit({ username: req.user?.username, role: req.user?.role, action: 'payment_recorded', resource: 'invoice', resourceId: String(req.params.id), details: { amount: paymentAmt, totalPaid, newStatus } });
  res.json(updated);
});

app.delete('/api/invoices/:invoiceId/payments/:paymentId', verifyAuth, async (req, res) => {
  if (!isAdminUser(req.user)) return res.status(403).json({ error: 'admin only' });
  const inv = await invoicesCol.findOne({ invoiceId: String(req.params.invoiceId) });
  if (!inv) return res.status(404).json({ error: 'Invoice not found' });
  const remaining = (inv.payments || []).filter(p => p.paymentId !== String(req.params.paymentId));
  const totalPaid = remaining.reduce((s, p) => s + Number(p.amount), 0);
  const newStatus = totalPaid >= inv.amount ? 'paid' : inv.status === 'paid' ? 'pending' : inv.status;
  await invoicesCol.updateOne(
    { invoiceId: String(req.params.invoiceId) },
    { $set: { payments: remaining, amountPaid: totalPaid, status: newStatus } }
  );
  res.json({ ok: true });
});

// ── Public Self-Registration (standalone page — no frontend URL exposed) ─────
// Security layers:
//  1. Secret path: /join/:INTAKE_SECRET — unknown path = 404
//  2. Per-IP rate limit: max 3 submissions per hour

// Per-IP submission rate limiter: ip → [timestamps]
const _intakeRateMap = new Map();
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const VERIFY_CODE_TTL_SECS = 10 * 60; // 10 minutes in seconds
const _verifyCodeRateMap = new Map(); // ip -> [timestamps]
const RATE_MAX = 3;

app.get('/join/:token', (req, res) => {
  const secret = process.env.INTAKE_SECRET;
  if (!secret || req.params.token !== secret) {
    return res.status(404).send('Not found');
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>DAFKU Law Firm — Client Enquiry</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0f0f11;color:#e2e2e8;min-height:100vh}
a{color:#a78bfa}
header{border-bottom:1px solid #27272a;background:#18181b;padding:16px 20px}
.header-inner{max-width:560px;margin:0 auto;display:flex;align-items:center;gap:12px}
.logo{width:36px;height:36px;border-radius:50%;background:#7c3aed22;border:1px solid #7c3aed55;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:15px;color:#a78bfa;flex-shrink:0}
.firm-name{font-size:14px;font-weight:600;color:#f4f4f5}
.firm-sub{font-size:12px;color:#71717a}
main{max-width:560px;margin:0 auto;padding:32px 20px 64px}
h1{font-size:24px;font-weight:700;color:#f4f4f5;margin-bottom:6px}
.subtitle{font-size:14px;color:#71717a;margin-bottom:32px;line-height:1.5}
.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
@media(max-width:480px){.form-grid{grid-template-columns:1fr}}
.field{display:flex;flex-direction:column;gap:6px}
.field.full{grid-column:1/-1}
label{font-size:13px;font-weight:500;color:#a1a1aa}
label span{color:#f87171;margin-left:2px}
input,textarea{background:#18181b;border:1px solid #27272a;border-radius:8px;padding:10px 12px;font-size:14px;color:#f4f4f5;width:100%;outline:none;transition:border-color .15s}
input:focus,textarea:focus{border-color:#7c3aed}
input::placeholder,textarea::placeholder{color:#3f3f46}
textarea{resize:vertical;min-height:90px;font-family:inherit}
.services-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:4px}
@media(max-width:420px){.services-grid{grid-template-columns:1fr}}
.svc-label{display:flex;align-items:center;gap:10px;border:1px solid #27272a;border-radius:8px;padding:10px 12px;cursor:pointer;transition:background .15s,border-color .15s;font-size:13px;color:#a1a1aa;user-select:none}
.svc-label:hover{background:#18181b;border-color:#3f3f46}
.svc-label input[type=checkbox]{display:none}
.checkmark{width:16px;height:16px;border:1.5px solid #3f3f46;border-radius:4px;flex-shrink:0;display:flex;align-items:center;justify-content:center;transition:background .15s,border-color .15s}
.svc-label.checked{border-color:#7c3aed55;background:#7c3aed11;color:#c4b5fd}
.svc-label.checked .checkmark{background:#7c3aed;border-color:#7c3aed}
.checkmark svg{display:none}
.svc-label.checked .checkmark svg{display:block}
.tags{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.tag{background:#7c3aed22;border:1px solid #7c3aed44;border-radius:999px;padding:3px 10px;font-size:11px;color:#c4b5fd}
.error-box{background:#7f1d1d22;border:1px solid #ef444444;border-radius:8px;padding:10px 14px;font-size:13px;color:#fca5a5;margin-top:4px}
.btn{width:100%;padding:12px;background:#7c3aed;color:#fff;border:none;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer;transition:background .15s;margin-top:4px}
.btn:hover:not(:disabled){background:#6d28d9}
.btn:disabled{opacity:.55;cursor:not-allowed}
.privacy{font-size:11px;color:#3f3f46;text-align:center;margin-top:10px}
.success{display:none;flex-direction:column;align-items:center;justify-content:center;min-height:60vh;text-align:center;gap:20px}
.success-icon{width:64px;height:64px;border-radius:50%;background:#14532d22;border:1px solid #16a34a55;display:flex;align-items:center;justify-content:center}
.success-icon svg{color:#4ade80}
.success h2{font-size:22px;font-weight:700;color:#f4f4f5}
.success p{font-size:14px;color:#71717a;max-width:380px;line-height:1.6}
.wa-btn{display:inline-flex;align-items:center;gap:8px;padding:10px 20px;background:#16a34a22;border:1px solid #16a34a55;border-radius:8px;color:#4ade80;font-size:14px;font-weight:500;text-decoration:none;margin-top:4px;transition:background .15s}
.wa-btn:hover{background:#16a34a33}
.type-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:4px}
@media(max-width:360px){.type-grid{grid-template-columns:1fr}}
.type-card{display:flex;flex-direction:column;align-items:center;gap:5px;border:1.5px solid #27272a;border-radius:10px;padding:12px 8px;cursor:pointer;transition:background .15s,border-color .15s;color:#a1a1aa;user-select:none;text-align:center}
.type-card:hover{background:#18181b;border-color:#3f3f46}
.type-card.selected{border-color:#7c3aed;background:#7c3aed11;color:#c4b5fd}
.type-icon{font-size:22px;line-height:1}
.type-name{font-weight:600;font-size:13px;color:inherit}
.type-desc{font-size:11px;color:#52525b;line-height:1.3}
.type-card.selected .type-desc{color:#a78bfa}
</style>
</head>
<body>
<header>
  <div class="header-inner">
    <div class="logo">D</div>
    <div>
      <div class="firm-name">DAFKU Law Firm</div>
      <div class="firm-sub">Client Intake Form</div>
    </div>
  </div>
</header>
<main>
  <div id="form-section">
    <h1>Get in Touch</h1>
    <p class="subtitle">Fill in the form below and our team will review your enquiry and get back to you within 1–2 business days. You will receive a confirmation email with your personal client portal link.</p>
    <form id="regForm" novalidate>
      <div class="form-grid">
        <div class="field">
          <label for="f-name">Full Name<span>*</span></label>
          <input id="f-name" name="name" type="text" placeholder="e.g. John Smith" autocomplete="name"/>
        </div>
        <div class="field">
          <label for="f-email">Email Address<span>*</span></label>
          <div style="display:flex;gap:8px;align-items:flex-start">
            <input id="f-email" name="email" type="email" placeholder="you@example.com" autocomplete="email" style="flex:1"/>
            <button type="button" id="sendCodeBtn" disabled style="padding:10px 14px;background:#7c3aed22;border:1px solid #7c3aed55;border-radius:8px;color:#c4b5fd;font-size:13px;font-weight:500;cursor:pointer;white-space:nowrap;transition:background .15s;opacity:.55" onclick="handleSendCode()">Send Code</button>
          </div>
          <div id="codeRow" style="display:none;margin-top:8px">
            <label for="f-code" style="font-size:12px;color:#71717a;display:block;margin-bottom:5px">Enter the 6-digit code sent to your email</label>
            <input id="f-code" type="text" inputmode="numeric" maxlength="6" placeholder="123456" style="width:120px;letter-spacing:6px;text-align:center;font-family:monospace;font-size:18px"/>
          </div>
          <div id="codeMsg" style="font-size:12px;margin-top:4px"></div>
        </div>
        <div class="field">
          <label for="f-phone">Phone / WhatsApp<span>*</span></label>
          <input id="f-phone" name="phone" type="tel" placeholder="+1 555 000 0000" autocomplete="tel"/>
        </div>
        <div class="field">
          <label for="f-nat">Nationality<span>*</span></label>
          <input id="f-nat" name="nationality" type="text" placeholder="e.g. American"/>
        </div>
        <div class="field">
          <label for="f-country">Country of Residence<span>*</span></label>
          <input id="f-country" name="country" type="text" placeholder="e.g. United States"/>
        </div>
        <div class="field full">
          <label>Client Type<span>*</span></label>
          <div class="type-grid" id="typeGrid">
            <div class="type-card selected" data-val="Individual">
              <span class="type-icon">&#x1F464;</span>
              <span class="type-name">Individual</span>
              <span class="type-desc">Single person</span>
            </div>
            <div class="type-card" data-val="Family">
              <span class="type-icon">&#x1F46A;</span>
              <span class="type-name">Family</span>
              <span class="type-desc">Couple or family group</span>
            </div>
            <div class="type-card" data-val="Company">
              <span class="type-icon">&#x1F3E2;</span>
              <span class="type-name">Company</span>
              <span class="type-desc">Business entity</span>
            </div>
          </div>
        </div>
        <div class="field full">
          <label>Services Interested In<span>*</span></label>
          <div class="services-grid" id="svcGrid">
            <label class="svc-label" data-val="residency_pensioner"><input type="checkbox" value="residency_pensioner"/><span class="checkmark"><svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4l3 3 5-6" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span>Residency Permit – Pensioner</label>
            <label class="svc-label" data-val="visa_d"><input type="checkbox" value="visa_d"/><span class="checkmark"><svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4l3 3 5-6" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span>Type D Visa &amp; Residence Permit</label>
            <label class="svc-label" data-val="company_formation"><input type="checkbox" value="company_formation"/><span class="checkmark"><svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4l3 3 5-6" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span>Company Formation</label>
            <label class="svc-label" data-val="real_estate"><input type="checkbox" value="real_estate"/><span class="checkmark"><svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4l3 3 5-6" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span>Real Estate Investment</label>
          </div>
          <div class="tags" id="svcTags"></div>
        </div>
        <div class="field full">
          <label for="f-msg">Message / Additional Details</label>
          <textarea id="f-msg" name="message" placeholder="Briefly describe your situation or what help you need…"></textarea>
        </div>
      </div>
      <div class="error-box" id="errBox" style="display:none;margin-top:16px"></div>
      <button type="submit" class="btn" id="submitBtn" style="margin-top:20px">Submit Enquiry</button>
      <p class="privacy">Your information is kept strictly confidential and used only to process your enquiry.</p>
    </form>
  </div>
  <div class="success" id="successSection">
    <div class="success-icon"><svg width="32" height="32" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg></div>
    <div>
      <h2>Enquiry Received</h2>
      <p>Thank you for reaching out. We have received your enquiry and will be in touch within 1–2 business days.<br/><br/>Check your email for a confirmation and your personal client portal link.</p>
    </div>
    <a href="https://wa.me/355696952989" target="_blank" rel="noopener noreferrer" class="wa-btn">
      <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
      Need help now? WhatsApp us
    </a>
  </div>
</main>
<script>
let clientType='Individual';
let codeSentTo=sessionStorage.getItem('dafku_verify_email')||'';
// If already submitted (e.g. page was refreshed), show success immediately
if(sessionStorage.getItem('dafku_join_done')){
  document.getElementById('form-section').style.display='none';
  document.getElementById('successSection').style.display='flex';
} else if(codeSentTo){document.getElementById('codeRow').style.display='block';document.getElementById('f-email').value=codeSentTo;}
const SVC_LABELS={residency_pensioner:'Residency Permit \u2013 Pensioner',visa_d:'Type D Visa & Residence Permit',company_formation:'Company Formation',real_estate:'Real Estate Investment'};
const selected=new Set();
function checkSendCodeEnabled(){
  const email=document.getElementById('f-email').value.trim();
  const emailOk=/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
  const nameOk=document.getElementById('f-name').value.trim().length>0;
  const phoneOk=document.getElementById('f-phone').value.trim().length>0;
  const natOk=document.getElementById('f-nat').value.trim().length>0;
  const countryOk=document.getElementById('f-country').value.trim().length>0;
  const svcOk=selected.size>0;
  const btn=document.getElementById('sendCodeBtn');
  const ok=emailOk&&nameOk&&phoneOk&&natOk&&countryOk&&svcOk;
  btn.disabled=!ok;btn.style.opacity=ok?'1':'.55';btn.style.cursor=ok?'pointer':'not-allowed';
}
['f-name','f-email','f-phone','f-nat','f-country'].forEach(id=>{
  document.getElementById(id).addEventListener('input',checkSendCodeEnabled);
});
checkSendCodeEnabled();
document.querySelectorAll('#typeGrid .type-card').forEach(card=>{
  card.addEventListener('click',()=>{
    clientType=card.dataset.val;
    document.querySelectorAll('#typeGrid .type-card').forEach(c=>c.classList.remove('selected'));
    card.classList.add('selected');
  });
});
document.querySelectorAll('#svcGrid input[type="checkbox"]').forEach(cb=>{
  cb.addEventListener('change',()=>{
    const val=cb.value;
    const lbl=cb.closest('.svc-label');
    if(cb.checked){selected.add(val);lbl.classList.add('checked');}
    else{selected.delete(val);lbl.classList.remove('checked');}
    const tags=document.getElementById('svcTags');
    tags.innerHTML=[...selected].map(v=>'<span class="tag">'+SVC_LABELS[v]+'</span>').join('');
    checkSendCodeEnabled();
  });
});
async function handleSendCode(){
  const email=document.getElementById('f-email').value.trim();
  const codeMsg=document.getElementById('codeMsg');
  const btn=document.getElementById('sendCodeBtn');
  if(!email||!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)){
    codeMsg.style.color='#fca5a5';codeMsg.textContent='Please enter a valid email address first.';return;
  }
  btn.disabled=true;btn.textContent='Sending…';codeMsg.textContent='';
  try{
    const r=await fetch('/api/send-verify-code',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email})});
    const d=await r.json().catch(()=>({}));
    if(!r.ok){codeMsg.style.color='#fca5a5';codeMsg.textContent=d.error||'Failed to send code.';btn.disabled=false;btn.textContent='Send Code';return;}
    codeSentTo=email;
    sessionStorage.setItem('dafku_verify_email',email);
    document.getElementById('codeRow').style.display='block';
    document.getElementById('f-code').focus();
    codeMsg.style.color='#4ade80';codeMsg.textContent='Code sent! Check your email (also check spam).';
    btn.textContent='Resend';btn.disabled=false;
  }catch(err){
    codeMsg.style.color='#fca5a5';codeMsg.textContent='Could not send code: '+err.message;btn.disabled=false;btn.textContent='Send Code';
  }
}
document.getElementById('regForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const errBox=document.getElementById('errBox');
  const btn=document.getElementById('submitBtn');
  errBox.style.display='none';
  const name=document.getElementById('f-name').value.trim();
  const email=document.getElementById('f-email').value.trim();
  const phone=document.getElementById('f-phone').value.trim();
  const nationality=document.getElementById('f-nat').value.trim();
  const country=document.getElementById('f-country').value.trim();
  const message=document.getElementById('f-msg').value.trim();
  const verifyCode=document.getElementById('f-code').value.trim();
  if(!name){errBox.textContent='Please enter your full name.';errBox.style.display='block';return;}
  if(!email){errBox.textContent='Please enter your email address.';errBox.style.display='block';return;}
  if(!phone){errBox.textContent='Please enter your phone / WhatsApp number.';errBox.style.display='block';return;}
  if(!nationality){errBox.textContent='Please enter your nationality.';errBox.style.display='block';return;}
  if(!country){errBox.textContent='Please enter your country of residence.';errBox.style.display='block';return;}
  if(selected.size===0){errBox.textContent='Please select at least one service you are interested in.';errBox.style.display='block';return;}
  if(!codeSentTo){errBox.textContent='Please click \u201cSend Code\u201d to verify your email address first.';errBox.style.display='block';return;}
  if(!verifyCode||verifyCode.length<6){errBox.textContent='Please enter the 6-digit verification code sent to your email.';errBox.style.display='block';return;}
  btn.disabled=true;btn.textContent='Submitting\u2026';
  try{
    const r=await fetch('/api/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,email,phone,nationality,country,clientType,services:[...selected],message:message||undefined,verifyCode})});
    const d=await r.json().catch(()=>({}));
    if(!r.ok){errBox.textContent=d.error||'Submission failed ('+r.status+'). Please try again.';errBox.style.display='block';btn.disabled=false;btn.textContent='Submit Enquiry';return;}
    sessionStorage.removeItem('dafku_verify_email');
    sessionStorage.setItem('dafku_join_done','1');
    document.getElementById('form-section').style.display='none';
    const s=document.getElementById('successSection');s.style.display='flex';
  }catch(err){
    errBox.textContent='Could not reach the server. Please check your connection and try again. ('+err.message+')';errBox.style.display='block';btn.disabled=false;btn.textContent='Submit Enquiry';
  }
});
</script>
</body>
</html>`);
});

// ── Send email verification code ────────────────────────────────────────────
app.post('/api/send-verify-code', async (req, res) => {
  const email = String(req.body?.email || '').toLowerCase().trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }
  if (email.length > 254) return res.status(400).json({ error: 'Email address is too long.' });

  // Check if email is already registered
  const existingCustomer = await customersCol.findOne({ email }, { projection: { _id: 1 } });
  if (existingCustomer) {
    return res.status(409).json({ error: 'An account with this email address already exists. Please contact us if you need help.' });
  }

  // Rate limit by IP: max 5 requests per hour
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const ipHits = (_verifyCodeRateMap.get(ip) || []).filter(t => t > now - RATE_WINDOW_MS);
  if (ipHits.length >= 5) {
    return res.status(429).json({ error: 'Too many code requests. Please wait before trying again.' });
  }
  // Cooldown: don't resend within 60 seconds
  const existing = await emailVerifyCodesCol.findOne({ email });
  if (existing && existing.expiresAt > new Date(now + (VERIFY_CODE_TTL_SECS - 60) * 1000)) {
    return res.status(429).json({ error: 'A code was already sent. Please wait 1 minute before requesting a new one.' });
  }
  ipHits.push(now);
  _verifyCodeRateMap.set(ip, ipHits);

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = new Date(now + VERIFY_CODE_TTL_SECS * 1000);
  await emailVerifyCodesCol.updateOne(
    { email },
    { $set: { code, expiresAt, attempts: 0 } },
    { upsert: true },
  );

  sendEmail({
    to: email,
    subject: 'Your DAFKU Law Firm verification code',
    text: `Your email verification code is: ${code}\n\nThis code expires in 10 minutes. If you did not request this, please ignore this email.`,
    html: buildHtmlEmail(`
      <p>You requested a verification code for your DAFKU Law Firm enquiry registration.</p>
      <p>Your verification code is:</p>
      <div style="font-size:36px;font-weight:bold;letter-spacing:10px;text-align:center;padding:24px 20px;background:#f7f4ee;border-left:3px solid #c5a55a;border-radius:4px;margin:24px 0;font-family:monospace;color:#1a2e4a;">${code}</div>
      <p>This code expires in <strong>10 minutes</strong>.</p>
      <p>If you did not request this code, please ignore this email.</p>
    `),
  }).catch(e => console.error('[send-verify-code] email error:', e.message));

  console.log(`[verify-code] Code sent to ${email}`);
  res.json({ ok: true, message: 'Verification code sent. Check your email.' });
});

app.post('/api/register', async (req, res) => {
  const { name, email, phone, nationality, country, clientType, services, message, verifyCode } = req.body || {};

  // ── Per-IP rate limit ─────────────────────────────────────────────────────
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const hits = (_intakeRateMap.get(ip) || []).filter(t => t > now - RATE_WINDOW_MS);
  if (hits.length >= RATE_MAX) {
    return res.status(429).json({ error: 'Too many submissions from your connection. Please try again later.' });
  }
  hits.push(now);
  _intakeRateMap.set(ip, hits);

  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Full name is required.' });
  if (!email || !String(email).trim()) return res.status(400).json({ error: 'Email address is required.' });
  const normalEmail = String(email).toLowerCase().trim();
  // Basic email format validation
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalEmail)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }
  // Field length caps
  if (normalEmail.length > 254) return res.status(400).json({ error: 'Email address is too long.' });
  if (String(name).trim().length > 120) return res.status(400).json({ error: 'Name is too long.' });
  // Email verification code check
  if (!verifyCode) return res.status(400).json({ error: 'Please verify your email address first.' });
  const storedVerify = await emailVerifyCodesCol.findOne({ email: normalEmail });
  if (!storedVerify) return res.status(400).json({ error: 'No verification code found. Please request a new code.' });
  if (storedVerify.expiresAt < new Date()) {
    await emailVerifyCodesCol.deleteOne({ email: normalEmail });
    return res.status(400).json({ error: 'Verification code has expired. Please request a new one.' });
  }
  const newAttempts = (storedVerify.attempts || 0) + 1;
  if (newAttempts > 5) {
    await emailVerifyCodesCol.deleteOne({ email: normalEmail });
    return res.status(429).json({ error: 'Too many failed attempts. Please request a new code.' });
  }
  await emailVerifyCodesCol.updateOne({ email: normalEmail }, { $set: { attempts: newAttempts } });
  if (storedVerify.code !== String(verifyCode).trim()) {
    return res.status(400).json({ error: 'Incorrect verification code. Please check the code and try again.' });
  }
  await emailVerifyCodesCol.deleteOne({ email: normalEmail }); // one-use only
  try {
  // Duplicate check
  const [dupCust, dupClient] = await Promise.all([
    customersCol.findOne({ email: normalEmail }),
    confirmedClientsCol.findOne({ email: normalEmail }),
  ]);
  if (dupCust || dupClient) {
    return res.status(409).json({ error: 'An account with this email already exists. Please contact us directly or use your existing portal link.' });
  }
  const customerId = genShortId('CUS');
  const nowIso = new Date().toISOString();
  const svcList = Array.isArray(services) ? services : (services ? [String(services)] : []);
  const doc = {
    customerId,
    name: String(name).trim(),
    email: normalEmail,
    phone: phone ? String(phone).trim() : null,
    nationality: nationality ? String(nationality).trim() : null,
    country: country ? String(country).trim() : null,
    customerType: clientType && ['Individual','Family','Company'].includes(String(clientType)) ? String(clientType) : 'Individual',
    services: svcList,
    message: message ? String(message).trim() : null,
    status: 'INTAKE',
    createdAt: nowIso,
    updatedAt: nowIso,
    source: 'self_register',
    version: 1,
  };
  await customersCol.insertOne(doc);
  // Auto-generate portal token valid for 30 days
  const rawToken = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  await portalTokensCol.insertOne({ token: rawToken, customerId, clientName: doc.name, clientType: 'customer', createdAt: nowIso, expiresAt, createdBy: 'self_register' });
  await logAudit({ username: 'public', role: 'public', action: 'self_register', resource: 'customer', resourceId: customerId, details: { name: doc.name, email: normalEmail } });
  // Respond immediately — send welcome email in the background so SMTP delays never block the HTTP response
  const portalUrl = process.env.APP_URL ? `${process.env.APP_URL}/#/portal/${rawToken}` : null;
  console.log(`[register] ✓ New registration: ${doc.name} <${normalEmail}> | portal=${portalUrl || 'no APP_URL set'}`);
  res.status(201).json({ ok: true, message: 'Registration successful. Check your email for your portal link.' });
  sendEmail({
    to: normalEmail,
    subject: 'Thank You for Your Enquiry — DAFKU Law Firm',
    text: [
      `Dear ${doc.name},`,
      '',
      'Thank you for reaching out to DAFKU Law Firm. We have received your enquiry and our team will review it shortly.',
      '',
      'We have created a secure personal client portal for you where you can track the status of your enquiry and communicate directly with our team.',
      '',
      portalUrl ? `Access your client portal here:\n${portalUrl}` : 'A personalised portal link will be sent to you once your enquiry has been reviewed.',
      '',
      'A member of our team will be in touch within 1–2 business days.',
      '',
      'For any urgent matters, please contact us on WhatsApp: +355 69 69 52 989',
      '',
      'Yours sincerely,\nDAFKU Law Firm\ninfo@dafkulawfirm.al',
    ].join('\n'),
    html: buildHtmlEmail(`
      <p>Dear <strong>${doc.name}</strong>,</p>
      <p>Thank you for reaching out to <strong>DAFKU Law Firm</strong>. We have received your enquiry and our specialist team will review it at the earliest opportunity.</p>
      <p>We have set up a secure personal client portal for you where you can track the progress of your matter and communicate directly with our team.</p>
      ${portalUrl ? `<p><a href="${portalUrl}" class="btn">Access Your Client Portal</a></p>` : '<p>A personalised portal link will be sent to you once your enquiry has been reviewed.</p>'}
      <hr>
      <p>A member of our team will be in contact with you within <strong>1–2 business days</strong> to discuss your matter and the next steps.</p>
      <p>For any urgent queries in the meantime, please do not hesitate to contact us on WhatsApp.</p>
      <div class="sig">Yours sincerely,<br><strong>DAFKU Law Firm</strong></div>
    `),
  }).catch(e => console.error('[register] background email error:', e.message));
  } catch (regErr) {
    console.error('[/api/register] error:', regErr);
    res.status(500).json({ error: 'An unexpected error occurred. Please try again or contact us directly.' });
  }
});

// ── Admin: send a test email to verify SMTP config ──────────────────────────────────
// GET /api/admin/test-email?to=someone@example.com
app.get('/api/admin/test-email', verifyAuth, async (req, res) => {
  if (!isAdminUser(req.user)) return res.status(403).json({ error: 'admin only' });
  const to = String(req.query.to || '').trim();
  if (!to) return res.status(400).json({ error: 'Provide ?to=email address' });
  const { BREVO_API_KEY, RESEND_API_KEY } = process.env;
  const config = BREVO_API_KEY ? `Brevo HTTPS API` : RESEND_API_KEY ? `Resend API` : 'NOT CONFIGURED';
  try {
    await sendEmail({
      to,
      subject: 'DAFKU Law Firm — Email Test',
      text: `This is a test email sent from your server.\n\nConfig: ${config}\nTime: ${new Date().toISOString()}`,
      html: buildHtmlEmail(`<p>This is a <strong>test email</strong> from your DAFKU Law Firm server.</p><div class="box"><p>Config: ${config}</p><p>Time: ${new Date().toISOString()}</p></div><p>If you received this, emails are working correctly.</p>`),
    });
    res.json({ ok: true, message: `Test email sent to ${to}`, config });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, config });
  }
});
