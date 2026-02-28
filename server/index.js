import express from "express";
import cors from "cors";
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
import nodemailer from "nodemailer";

dotenv.config();

// ── Email notification helper ─────────────────────────────────────────────────
// Primary:  Set RESEND_API_KEY + SMTP_FROM + ADMIN_EMAIL  (uses Resend HTTP API — works on Render free tier)
// Fallback: Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, ADMIN_EMAIL (nodemailer SMTP)
const STATE_EMAIL_LABELS = {
  NEW: 'New', IN_PROGRESS: 'In Progress', WAITING_CUSTOMER: 'Waiting — Your Input Needed',
  WAITING_AUTHORITIES: 'Waiting — Authorities', FINALIZED: 'Completed', INTAKE: 'Under Review',
  SEND_PROPOSAL: 'Proposal Sent', WAITING_RESPONSE_P: 'Waiting for Your Response',
  DISCUSSING_Q: 'Under Discussion', SEND_CONTRACT: 'Contract Sent',
  WAITING_RESPONSE_C: 'Waiting for Your Response',
};
function logEmailConfig() {
  const { RESEND_API_KEY, SMTP_HOST, SMTP_USER, SMTP_PASS, SMTP_FROM, ADMIN_EMAIL } = process.env;
  if (RESEND_API_KEY) {
    console.log(`[email] Resend API configured | FROM=${SMTP_FROM || 'onboarding@resend.dev'} | ADMIN=${ADMIN_EMAIL || '(not set)'}`);
  } else if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
    console.log(`[email] SMTP configured: ${SMTP_USER}@${SMTP_HOST} | FROM=${SMTP_FROM || SMTP_USER} | ADMIN=${ADMIN_EMAIL || '(not set)'}`);
  } else {
    console.warn('[email] NOT configured — set RESEND_API_KEY (recommended) or SMTP_HOST/USER/PASS to enable emails.');
  }
}
logEmailConfig();

async function sendEmail({ to, subject, text }) {
  if (!to) { console.warn(`[email] Skipping "${subject}" — no recipient address.`); return; }

  const { RESEND_API_KEY, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;

  // ── Option 1: Resend HTTP API (recommended on Render — no SMTP port issues) ──
  if (RESEND_API_KEY) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: SMTP_FROM || 'DAFKU Law Firm <onboarding@resend.dev>',
          to: [to],
          subject,
          text,
        }),
      });
      const data = await res.json();
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

  // ── Option 2: SMTP fallback (nodemailer) ──
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    console.warn('[email] Skipping — neither RESEND_API_KEY nor SMTP credentials configured.');
    return;
  }
  const port = Number(SMTP_PORT) || 587;
  try {
    const transport = nodemailer.createTransport({
      host: SMTP_HOST, port,
      secure: port === 465,
      requireTLS: port !== 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
      tls: { rejectUnauthorized: true },
    });
    await transport.verify();
    await transport.sendMail({ from: SMTP_FROM || SMTP_USER, to, subject, text });
    console.log(`[email] ✓ Sent via SMTP "${subject}" → ${to}`);
  } catch (e) {
    console.error(`[email] ✗ SMTP failed "${subject}" → ${to}:`, e.message, e.code || '');
  }
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
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow non-browser (curl/postman) requests with no origin
      if (!origin) return callback(null, true);
      if (allowedOrigins.length === 0) {
        if (IS_PROD) return callback(new Error("CORS misconfigured: ALLOWED_ORIGINS is empty in production"));
        return callback(null, true);
      }
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error("CORS not allowed"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

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
let deletedChatsCol;

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
  deletedChatsCol = db.collection("deletedChats");
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
  const stale = await casesCol.find({ state: { $in: STUCK_STATES }, lastStateChange: { $lt: new Date(cutoff).toISOString() } }).project({ caseId: 1 }).toArray();
  if (!stale.length) return;
  const staleIds = stale.map((c) => c.caseId);
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
  lenci: "Lenci",
  kejdi1: "Kejdi 1",
  kejdi2: "Kejdi 2",
  kejdi3: "Kejdi 3",
};

const TEAM_MEMBERS_BY_MANAGER = {
  lenci: ["kejdi1", "kejdi2", "kejdi3"],
};

// Hard boundaries: client cases ↔ client team only; customer cases ↔ intake team only
const CLIENT_LAWYERS_SERVER = ['Kejdi', 'Albert'];
const INTAKE_LAWYERS_SERVER = ['Lenci', 'Kejdi 1', 'Kejdi 2', 'Kejdi 3'];

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

function isManagerUser(user) {
  return user?.role === "manager";
}

function getManagedUsernames(user) {
  if (!user?.username) return [];
  return TEAM_MEMBERS_BY_MANAGER[user.username] || [];
}

function getManagedLawyerNames(user) {
  return getManagedUsernames(user)
    .map((username) => stripProfessionalTitle(CONSULTANT_BY_USERNAME[username] || ""))
    .filter(Boolean);
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
  if (isManagerUser(user)) {
    const managedLawyers = getManagedLawyerNames(user);
    if (!managedLawyers.length) return { _id: { $exists: false } };
    const matchers = managedLawyers.map((name) => buildAssignedToMatcher(name) || name);
    return {
      $or: [
        { assignedTo: { $in: matchers } },
        { createdBy: user.username || "" },
      ],
    };
  }
  // Intake users (kejdi1/2/3) see only their own cases (proposal/document prep work)
  if (user?.role === "intake") {
    const lawyerName = getUserLawyerName(user);
    if (!lawyerName) return { _id: { $exists: false } };
    const matcher = buildAssignedToMatcher(lawyerName);
    return matcher ? { assignedTo: matcher } : { assignedTo: lawyerName };
  }
  const lawyerName = getUserLawyerName(user);
  if (!lawyerName) return { _id: { $exists: false } };
  const matcher = buildAssignedToMatcher(lawyerName);
  return matcher ? { assignedTo: matcher } : { assignedTo: lawyerName };
}

function buildCustomerScopeFilter(user) {
  if (isAdminUser(user)) return {};
  if (isManagerUser(user)) return {};
  // Consultants (albert/kejdi) handle confirmed clients only — block pre-confirmation customers
  if (user?.role === "consultant") return { _id: { $exists: false } };
  const lawyerName = getUserLawyerName(user);
  // Allow creators to see their own customers. Intake users may not have a lawyerName,
  // so include a createdBy clause so they can see customers they created.
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
  if (isManagerUser(user)) return true;
  const lawyerName = getUserLawyerName(user);
  return Boolean(lawyerName) && stripProfessionalTitle(customer.assignedTo) === lawyerName;
}

function userCanAccessCase(user, doc) {
  if (!doc) return false;
  if (isAdminUser(user)) return true;
  if (isManagerUser(user)) {
    const allowedLawyers = new Set(getManagedLawyerNames(user));
    const assigned = stripProfessionalTitle(doc.assignedTo);
    return allowedLawyers.has(assigned) || doc.createdBy === user.username;
  }
  const lawyerName = getUserLawyerName(user);
  return Boolean(lawyerName) && stripProfessionalTitle(doc.assignedTo) === lawyerName;
}

function buildMeetingScopeFilter(user) {
  if (isAdminUser(user)) return {};
  if (isManagerUser(user)) {
    const managedLawyers = getManagedLawyerNames(user);
    if (!managedLawyers.length) return { createdBy: user.username || "" };
    const matchers = managedLawyers.map((name) => buildAssignedToMatcher(name) || name);
    return {
      $or: [
        { assignedTo: { $in: matchers } },
        { createdBy: user.username || "" },
      ],
    };
  }
  if (user?.role === "intake") return { createdBy: user.username || "" };
  const lawyerName = getUserLawyerName(user);
  if (!lawyerName) return { _id: { $exists: false } };
  return {
    $or: [
      { assignedTo: lawyerName },
      { createdBy: user.username || "" },
    ],
  };
}

// Confirmed clients are only for admin and consultants (albert/kejdi).
// Manager (lenci) and intake (kejdi1/2/3) handle pre-confirmation customers only.
function buildClientScopeFilter(user) {
  if (isAdminUser(user)) return {};
  if (isManagerUser(user) || user?.role === "intake") return { _id: { $exists: false } };
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
      { username: "albert", password: "alb33", role: "consultant", consultantName: "Albert" },
      { username: "kejdi", password: "kej33", role: "consultant", consultantName: "Kejdi" },
      { username: "lenci", password: "len33", role: "manager", consultantName: "Lenci" },
      { username: "kejdi1", password: "kej331", role: "intake", consultantName: "Kejdi 1", managerUsername: "lenci" },
      { username: "kejdi2", password: "kej332", role: "intake", consultantName: "Kejdi 2", managerUsername: "lenci" },
      { username: "kejdi3", password: "kej333", role: "intake", consultantName: "Kejdi 3", managerUsername: "lenci" },
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
    console.log("Synced default users: admirim, albert, kejdi, lenci, kejdi1, kejdi2, kejdi3.");
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
  if (!(req.user?.role === 'intake' || isManagerUser(req.user) || isAdminUser(req.user))) {
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

app.get("/api/customers/:id", verifyAuth, async (req, res) => {
  // Apply scope filter for all roles — intake users only see their assigned/created customers.
  const customerScope = buildCustomerScopeFilter(req.user);
  let doc = await customersCol.findOne({ customerId: req.params.id, ...customerScope });
  if (!doc && req.user?.role === 'consultant') {
    doc = await confirmedClientsCol.findOne({ customerId: req.params.id, ...buildClientScopeFilter(req.user) });
  }
  if (!doc) {
    return res.status(404).json({ error: "Not found" });
  }
  res.json(doc);
});

app.post("/api/customers", verifyAuth, async (req, res) => {
  // Only intake users can create new (non-confirmed) customers
  if (req.user?.role !== 'intake' && !isManagerUser(req.user) && !isAdminUser(req.user)) return res.status(403).json({ error: 'forbidden' });
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
        ? `${process.env.APP_URL}/portal/${tokenDoc.token}`
        : null;
      sendEmail({
        to: current.email,
        subject: 'Your Service Proposal is Ready — DAFKU Law Firm',
        text: [
          `Dear ${current.name || 'Client'},`,
          '',
          'Your personalised service proposal from DAFKU Law Firm is now ready for your review.',
          '',
          portalUrl
            ? `You can view it at any time through your secure customer portal:\n${portalUrl}`
            : 'Please contact us to access your customer portal.',
          '',
          'The proposal outlines the scope of work, estimated timeline, required documents, and fees for the services requested.',
          '',
          'If you have any questions, please reply to this email or reach us on WhatsApp: https://wa.me/355696952989',
          '',
          `Best regards,\n${senderLabel}\nDAFKU Law Firm\ninfo@dafkulawfirm.al`,
        ].join('\n'),
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
        ? `${process.env.APP_URL}/portal/${tokenDoc.token}`
        : null;

      // Build payment summary from proposal fee fields
      const pf = current.proposalFields || {};
      const fmtALL = (n) => n > 0 ? `${Number(n).toLocaleString('en-US')} ALL` : null;
      const feeLines = [
        pf.serviceFeeALL > 0  ? `  • Service Fee:      ${fmtALL(pf.serviceFeeALL)}` : null,
        pf.poaFeeALL > 0      ? `  • Power of Attorney: ${fmtALL(pf.poaFeeALL)}` : null,
        pf.translationFeeALL > 0 ? `  • Translation Fee:  ${fmtALL(pf.translationFeeALL)}` : null,
        pf.otherFeesALL > 0   ? `  • Other Fees:       ${fmtALL(pf.otherFeesALL)}` : null,
      ].filter(Boolean);
      const totalALL = (Number(pf.serviceFeeALL)||0) + (Number(pf.poaFeeALL)||0) + (Number(pf.translationFeeALL)||0) + (Number(pf.otherFeesALL)||0);

      // Also pull any invoices already created for this customer
      const existingInvoices = await invoicesCol.find({ customerId: id }).toArray();
      const invoiceLines = existingInvoices.map((inv, i) =>
        `  ${i + 1}. ${inv.description} — ${Number(inv.amount).toLocaleString('en-US')} ${inv.currency || 'ALL'}` +
        (inv.dueDate ? ` (due ${inv.dueDate.slice(0,10)})` : '') +
        ` [${inv.status}]`
      );

      const paymentSection = [];
      if (feeLines.length > 0) {
        paymentSection.push('─────────────────────────────────');
        paymentSection.push('PAYMENT SUMMARY');
        paymentSection.push('─────────────────────────────────');
        paymentSection.push(...feeLines);
        if (totalALL > 0) paymentSection.push(`  ─────────────────────────────`);
        if (totalALL > 0) paymentSection.push(`  TOTAL: ${totalALL.toLocaleString('en-US')} ALL`);
        if (pf.paymentNote) paymentSection.push('', `  Note: ${pf.paymentNote}`);
      }
      if (invoiceLines.length > 0) {
        paymentSection.push('');
        paymentSection.push('INVOICES ISSUED');
        paymentSection.push('─────────────────────────────────');
        paymentSection.push(...invoiceLines);
      }

      sendEmail({
        to: current.email,
        subject: 'Your Service Agreement is Ready to Sign — DAFKU Law Firm',
        text: [
          `Dear ${current.name || 'Client'},`,
          '',
          'Your Service Agreement with DAFKU Law Firm is now ready for your review and electronic acceptance.',
          '',
          portalUrl
            ? `Please open the Contract tab in your secure customer portal to read and sign it:\n${portalUrl}`
            : 'Please contact us to access your customer portal and open the Contract tab.',
          '',
          ...(paymentSection.length > 0 ? ['', ...paymentSection, ''] : []),
          'To accept the agreement, type your full legal name in the signature field and confirm you have read the terms.',
          '',
          'If you have any questions before signing, please reply to this email or reach us on WhatsApp: https://wa.me/355696952989',
          '',
          `Best regards,\n${senderLabel}\nDAFKU Law Firm\ninfo@dafkulawfirm.al`,
        ].join('\n'),
      });
    }
    await logAudit({ username: req.user?.username, role: req.user?.role, action: 'contract_sent', resource: 'customer', resourceId: id, details: { contractSentAt: update.contractSentAt } });
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
      const SVC_LABELS = { visa_c: 'Visa C', visa_d: 'Visa D', residency_permit: 'Residency Permit', company_formation: 'Company Formation', real_estate: 'Real Estate', tax_consulting: 'Tax Consulting', compliance: 'Compliance' };
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

  // Intake users may see notifications for non-confirmed customers.
  // Manager (lenci) oversees all pre-confirmation customers — show all notifications
  if (req.user?.role === 'intake' || isManagerUser(req.user)) return res.json(docsForCustomers.slice(0, 50));

  // Other authenticated users (consultant/lawyer) should only receive notifications
  // for customers assigned to them.
  const allowed = docsForCustomers.filter(d => userCanAccessCustomer(req.user, customerMap[d.customerId]));
  res.json(allowed.slice(0, 50));
});



app.delete("/api/customers/notifications/:id", verifyAuth, async (req, res) => {
  // Admin, manager (lenci), and intake users can dismiss pre-confirmation customer notifications
  if (!isAdminUser(req.user) && !isManagerUser(req.user) && req.user?.role !== 'intake') {
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

  if (current.status !== update.status) {
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
  const chatMessages = await portalMessagesCol.find({ customerId: id }).sort({ createdAt: 1 }).toArray();
  if (chatMessages.length > 0) {
    await deletedChatsCol.insertOne({
      deletedChatId: genShortId('DC'),
      customerId: id,
      customerName: current.name || id,
      deletedAt: now,
      deletedBy: req.user?.username || 'unknown',
      reason: 'customer-deleted',
      messages: chatMessages,
    });
  }
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
  const chatMessages = await portalMessagesCol.find({ customerId: id }).sort({ createdAt: 1 }).toArray();
  if (chatMessages.length > 0) {
    await deletedChatsCol.insertOne({
      deletedChatId: genShortId('DC'),
      customerId: id,
      customerName: current.name || id,
      deletedAt: now,
      deletedBy: req.user?.username || 'unknown',
      reason: 'customer-deleted',
      messages: chatMessages,
    });
  }
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
  const clientLawyers = [...new Set(users.filter(u => u.role === 'consultant' || u.role === 'admin').map(nameOf).filter(Boolean))];
  const intakeLawyers = [...new Set(users.filter(u => u.role === 'intake').map(nameOf).filter(Boolean))];
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

  // For manager/intake: cases link to pre-confirmation customers.
  // For admin/consultant: cases link to confirmed clients.
  // Exception: admin creating with caseScope='customer' links to pre-confirmation customers.
  const isIntakeUser = req.user?.role === 'intake' || isManagerUser(req.user);
  const adminWantsCustomerScope = isAdminUser(req.user) && String(req.body?.caseScope || '').trim() === 'customer';
  const useCustomerCol = isIntakeUser || adminWantsCustomerScope;
  const customerSource = useCustomerCol ? customersCol : confirmedClientsCol;
  const customerScopeForCase = useCustomerCol ? buildCustomerScopeFilter(req.user) : buildClientScopeFilter(req.user);
  const customer = await customerSource.findOne({ customerId: requestedCustomerId, ...customerScopeForCase });
  if (!customer) {
    return res.status(400).json({ error: isIntakeUser ? "Customer not found or not accessible" : "Case customerId must belong to a confirmed client you can access" });
  }

  // CC- prefix for customer cases, CL- prefix for client cases
  const caseTypeValue = useCustomerCol ? 'customer' : 'client';
  const caseIdPrefix = useCustomerCol ? 'CC' : 'CL';
  const caseId = genCaseId(caseIdPrefix, req.user?.username);

  const payload = { ...req.body, customerId: requestedCustomerId, caseId, lastStateChange: now, version: 1, createdBy: req.user?.username || null, caseType: caseTypeValue };
  // Strip internal routing hint before storing
  delete payload.caseScope;
  if (payload.assignedTo) payload.assignedTo = stripProfessionalTitle(payload.assignedTo);
  if (!isAdminUser(req.user) && !isManagerUser(req.user)) {
    payload.assignedTo = getUserLawyerName(req.user);
  }
  // Enforce team boundaries: client cases → CLIENT team; customer cases → INTAKE team
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

  if (!isAdminUser(req.user) && !isManagerUser(req.user)) {
    update.assignedTo = getUserLawyerName(req.user);
  }
  // Enforce team boundaries on reassignment
  if (update.assignedTo) {
    const existingCaseType = current.caseType;
    const teamErrUpdate = validateCaseTeamBoundary(existingCaseType, update.assignedTo);
    if (teamErrUpdate) return res.status(400).json({ error: teamErrUpdate });
  }
  if (update.customerId) {
    const isIntakeUser2 = req.user?.role === 'intake' || isManagerUser(req.user);
    const customerSource2 = isIntakeUser2 ? customersCol : confirmedClientsCol;
    const customerScopeForCase2 = isIntakeUser2 ? buildCustomerScopeFilter(req.user) : buildClientScopeFilter(req.user);
    const targetCustomer = await customerSource2.findOne({ customerId: String(update.customerId).trim(), ...customerScopeForCase2 });
    if (!targetCustomer) {
      return res.status(400).json({ error: isIntakeUser2 ? "Customer not found or not accessible" : "Case customerId must belong to a confirmed client you can access" });
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
  const doc = result.value || (await casesCol.findOne({ caseId: targetId }));
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
      sendEmail({ to: clientRecord.email, subject: `Case update: ${theCase.title || id}`, text: `Dear ${clientRecord.name || 'Client'},\n\nYour case "${theCase.title || id}" has been updated.\n\nNew status: ${newStateLabel}\n\nVisit your customer portal for the latest details.` });
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
    const users = await usersCol.find({ role: { $in: ['consultant', 'manager', 'intake'] } }).project({ username: 1, consultantName: 1, role: 1 }).toArray();
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

  if (!isAdminUser(req.user) && !isManagerUser(req.user) && payload.assignedTo !== getUserLawyerName(req.user)) {
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

  if (!isAdminUser(req.user) && !isManagerUser(req.user)) {
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
  if (!isAdminUser(req.user)) {
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
  // Scope: mirrors GET /api/invoices — admin/manager see all; consultant/intake only their own
  const invoiceFilter = { invoiceId: id };
  if (!isAdminUser(req.user) && !isManagerUser(req.user)) {
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
    const portalUrl = `${process.env.APP_URL}/portal/${rawToken}`;
    sendEmail({
      to: person.email,
      subject: 'Your DAFKU Law Firm Customer Portal Access',
      text: [
        `Dear ${person.name || 'Client'},`,
        '',
        'Your secure customer portal has been set up by the DAFKU Law Firm team.',
        '',
        `Access your portal here:\n${portalUrl}`,
        '',
        'Through your portal you can:',
        '  \u2022 Track your case status in real time',
        '  \u2022 Review proposals and service agreements',
        '  \u2022 View your invoices and payment status',
        '  \u2022 Send messages directly to your lawyer',
        '',
        `This link is valid until ${new Date(expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.`,
        '',
        'If you have any questions, reach us on WhatsApp: https://wa.me/355696952989',
        '',
        'Best regards,\nDAFKU Law Firm\ninfo@dafkulawfirm.al',
      ].join('\n'),
    });
  }
  res.json({ token: rawToken, expiresAt });
});

app.get('/api/portal/tokens/:customerId', verifyAuth, async (req, res) => {
  if (!isAdminUser(req.user)) return res.status(403).json({ error: 'admin only' });
  const existing = await portalTokensCol.findOne({ customerId: String(req.params.customerId).trim() });
  res.json(existing || null);
});

app.delete('/api/portal/tokens/:customerId', verifyAuth, async (req, res) => {
  if (!isAdminUser(req.user)) return res.status(403).json({ error: 'admin only' });
  await portalTokensCol.deleteMany({ customerId: String(req.params.customerId).trim() });
  res.json({ ok: true });
});

// Extend an existing portal link by N more days (admin only)
app.patch('/api/portal/tokens/:customerId/extend', verifyAuth, async (req, res) => {
  if (!isAdminUser(req.user)) return res.status(403).json({ error: 'admin only' });
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
  const [history, portalNotes, chatMessages, invoices] = await Promise.all([
    caseIds.length ? historyCol.find({ caseId: { $in: caseIds } }).sort({ date: -1 }).toArray() : [],
    portalNotesCol.find({ customerId: tokenDoc.customerId }).sort({ createdAt: -1 }).toArray(),
    portalMessagesCol.find({ customerId: tokenDoc.customerId }).sort({ createdAt: 1 }).toArray(),
    invoicesCol.find({ customerId: tokenDoc.customerId }).sort({ createdAt: -1 }).toArray(),
  ]);
  res.json({
    client: { name: client.name, customerId: client.customerId, services: client.services || [], status: client.status, proposalFields: client.proposalFields || null },
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
    chatMessages: chatMessages.map(m => ({ messageId: m.messageId, text: m.text, senderType: m.senderType, senderName: m.senderName, createdAt: m.createdAt, readByLawyer: m.readByLawyer })),
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
  });
});

// ── Portal Chat (client side — token-based, no auth) ─────────────────────────────────────────────────────────
// Returns messages even if link is expired (read-only mode)
app.get('/api/portal/chat/:token', async (req, res) => {
  const tokenDoc = await portalTokensCol.findOne({ token: String(req.params.token) });
  if (!tokenDoc) return res.status(404).json({ error: 'Invalid link' });
  const messages = await portalMessagesCol.find({ customerId: tokenDoc.customerId }).sort({ createdAt: 1 }).toArray();
  const expired = new Date(tokenDoc.expiresAt) < new Date();
  // Mark all unread lawyer messages as read by the client (fires async, non-blocking)
  portalMessagesCol.updateMany(
    { customerId: tokenDoc.customerId, senderType: 'lawyer', readByClient: false },
    { $set: { readByClient: true } }
  ).catch(() => {});
  res.json({
    expired,
    messages: messages.map(m => ({ messageId: m.messageId, text: m.text, senderType: m.senderType, senderName: m.senderName, createdAt: m.createdAt })),
  });
});

// Client sends a message (token-based, public)
app.post('/api/portal/chat/:token', async (req, res) => {
  const tokenDoc = await portalTokensCol.findOne({ token: String(req.params.token) });
  if (!tokenDoc) return res.status(404).json({ error: 'Invalid link' });
  if (new Date(tokenDoc.expiresAt) < new Date()) return res.status(410).json({ error: 'This link has expired. Contact your lawyer for a new link.' });
  const { text } = req.body;
  if (!text || !String(text).trim()) return res.status(400).json({ error: 'text required' });
  // Enforce 3-message cap: count consecutive trailing client messages
  const allMessages = await portalMessagesCol.find({ customerId: tokenDoc.customerId }).sort({ createdAt: 1 }).toArray();
  let trailingClientCount = 0;
  for (let i = allMessages.length - 1; i >= 0; i--) {
    if (allMessages[i].senderType === 'client') trailingClientCount++;
    else break;
  }
  if (trailingClientCount >= 3) {
    return res.status(429).json({ error: 'You have sent 3 messages in a row. Please wait for your lawyer to reply before sending more.' });
  }
  const msg = { messageId: genShortId('PM'), customerId: tokenDoc.customerId, text: String(text).trim(), senderType: 'client', senderName: tokenDoc.clientName || 'Client', createdAt: new Date().toISOString(), readByLawyer: false };
  await portalMessagesCol.insertOne(msg);
  // Notify lawyer via email
  sendEmail({ to: process.env.ADMIN_EMAIL, subject: `New portal message from ${msg.senderName}`, text: `You have a new message from ${msg.senderName}:\n\n"${msg.text}"\n\nLog in to the admin panel to respond.` });
  res.status(201).json({ messageId: msg.messageId, text: msg.text, senderType: msg.senderType, senderName: msg.senderName, createdAt: msg.createdAt });
});

// Save intake/proposal fields from portal (token-based, no auth required)
app.post('/api/portal/:token/intake', async (req, res) => {
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
    sendEmail({
      to: process.env.ADMIN_EMAIL,
      subject: `Intake form completed — ${currentRecord.name || tokenDoc.clientName}`,
      text: `${currentRecord.name || tokenDoc.clientName} has completed their intake form via the client portal.\n\nStatus has been automatically advanced to "Send Proposal".\n\nLog in to the admin panel to review their information and prepare the proposal.`,
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
app.post('/api/portal/:token/respond-proposal', async (req, res) => {
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
    // Post acceptance note to portal chat if provided
    if (note && note.trim()) {
      await portalMessagesCol.insertOne({
        messageId: genShortId('MSG'),
        customerId: customer.customerId,
        text: `[Proposal Accepted] ${note.trim()}`,
        senderType: 'client',
        readByStaff: false,
        readByClient: true,
        timestamp: now,
      });
    }
    sendEmail({
      to: process.env.ADMIN_EMAIL,
      subject: `Proposal accepted — ${customer.name}`,
      text: `${customer.name} has accepted the proposal via the client portal.\n\nStatus advanced to "Send Contract". Please prepare and send the contract.`,
    });
    // Auto-draft invoice from proposal fee snapshot
    const snap = customer.proposalSnapshot || customer.proposalFields || {};
    const invAmt = (Number(snap.serviceFeeALL) || 0) + (Number(snap.poaFeeALL) || 0) + (Number(snap.translationFeeALL) || 0) + (Number(snap.otherFeesALL) || 0);
    if (invAmt > 0) {
      const SVC_LABELS = { visa_c: 'Visa C', visa_d: 'Visa D', residency_permit: 'Residency Permit', residency_pensioner: 'Residency Permit (Pensioner)', company_formation: 'Company Formation', real_estate: 'Real Estate', tax_consulting: 'Tax Consulting', compliance: 'Compliance' };
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
    const text = note?.trim()
      ? `[Revision Request] ${note.trim()}`
      : '[Revision Request] The client has requested revisions to the proposal.';
    await portalMessagesCol.insertOne({
      messageId: genShortId('MSG'),
      customerId: customer.customerId,
      text,
      senderType: 'client',
      readByStaff: false,
      readByClient: true,
      timestamp: now,
    });
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
    sendEmail({
      to: process.env.ADMIN_EMAIL,
      subject: `Proposal revision requested — ${customer.name}`,
      text: `${customer.name} has requested revisions to the proposal via the client portal.\n\nStatus changed to "Under Discussion".\n\nClient message:\n${note?.trim() || '(no message provided)'}\n\nPlease review the request in the Messages tab.`,
    });
    return res.json({ ok: true, status: 'DISCUSSING_Q' });
  }
});

// Client responds to contract: accept → status CLIENT (auto-assigned to Kejdi or Albert)
app.post('/api/portal/:token/respond-contract', async (req, res) => {
  const tokenDoc = await portalTokensCol.findOne({ token: String(req.params.token) });
  if (!tokenDoc) return res.status(404).json({ error: 'Invalid link' });

  const customer = await customersCol.findOne({ customerId: tokenDoc.customerId });
  if (!customer) return res.status(404).json({ error: 'Customer not found' });

  if (!['WAITING_ACCEPTANCE', 'SEND_CONTRACT'].includes(customer.status)) {
    return res.status(400).json({ error: 'Contract is not awaiting acceptance' });
  }

  const { signedByName } = req.body || {};
  const now = new Date().toISOString();

  // Auto-assign to Kejdi or Albert — whoever has fewer confirmed clients; tie → Albert
  const [kejdiCount, albertCount] = await Promise.all([
    confirmedClientsCol.countDocuments({ assignedTo: 'Kejdi' }),
    confirmedClientsCol.countDocuments({ assignedTo: 'Albert' }),
  ]);
  const assignedTo = kejdiCount < albertCount ? 'Kejdi' : 'Albert';

  // Build the confirmed-client payload
  const confirmedPayload = {
    ...customer,
    status: 'CLIENT',
    assignedTo,
    contractAcceptedAt: now,
    contractSignedByName: signedByName || customer.name,
    contractSignedAt: now,
    confirmedAt: now,
    sourceCustomerId: customer.customerId,
    version: (customer.version || 0) + 1,
  };

  // Upsert into confirmedClients
  await confirmedClientsCol.updateOne(
    { customerId: customer.customerId },
    { $set: confirmedPayload },
    { upsert: true }
  );

  // Update the customer record to CLIENT so admin sees the transition
  await customersCol.updateOne(
    { customerId: customer.customerId },
    { $set: { status: 'CLIENT', assignedTo, contractAcceptedAt: now, contractSignedByName: signedByName || customer.name, contractSignedAt: now } }
  );

  await customerHistoryCol.insertOne({
    historyId: genShortId('CH'),
    customerId: customer.customerId,
    statusFrom: customer.status,
    statusTo: 'CLIENT',
    date: now,
    changedBy: 'portal-client',
    changedByRole: 'client',
    changedByConsultant: null,
    changedByLawyer: assignedTo,
  });

  // Post acceptance note to portal chat
  await portalMessagesCol.insertOne({
    messageId: genShortId('MSG'),
    customerId: customer.customerId,
    text: `[Contract Accepted] The client has accepted the contract and is now a confirmed client. Electronic signature recorded as: "${signedByName || customer.name}" at ${now}.`,
    senderType: 'client',
    readByStaff: false,
    readByClient: true,
    timestamp: now,
  });

  sendEmail({
    to: process.env.ADMIN_EMAIL,
    subject: `Contract accepted — ${customer.name}`,
    text: `${customer.name} has accepted the contract via the client portal.\n\nElectronic signature name: "${signedByName || customer.name}"\nAccepted at: ${now}\n\nThey have been confirmed as a client and auto-assigned to ${assignedTo}.`,
  });

  return res.json({ ok: true, status: 'CLIENT', assignedTo });
});

// ── Portal Chat (admin/lawyer side — JWT auth) ──────────────────────────────────────────────────────────────
// IMPORTANT: specific routes (/unread-counts) must come BEFORE parameterised routes (/:customerId)

// Get unread counts for all customers (for sidebar badges)
// Shows dot when lawyer sent a message the client hasn't opened yet
app.get('/api/portal-chat/unread-counts', verifyAuth, async (req, res) => {
  const pipeline = [
    { $match: { senderType: 'lawyer', readByClient: false } },
    { $group: { _id: '$customerId', count: { $sum: 1 } } },
  ];
  const results = await portalMessagesCol.aggregate(pipeline).toArray();
  res.json(results.map(r => ({ customerId: r._id, unreadCount: r.count })));
});

// Helper: verify caller can access a given customerId's chat (admin always yes; others only their own customer/client)
async function verifyPortalChatAccess(user, customerId) {
  if (isAdminUser(user)) return true;
  const [cust, cli] = await Promise.all([
    customersCol.findOne({ customerId, ...buildCustomerScopeFilter(user) }),
    confirmedClientsCol.findOne({ customerId, ...buildClientScopeFilter(user) }),
  ]);
  return !!(cust || cli);
}

// Get all messages for a customer (admin/scoped)
app.get('/api/portal-chat/:customerId', verifyAuth, async (req, res) => {
  const customerId = String(req.params.customerId).trim();
  if (!(await verifyPortalChatAccess(req.user, customerId))) return res.status(403).json({ error: 'forbidden' });
  const messages = await portalMessagesCol.find({ customerId }).sort({ createdAt: 1 }).toArray();
  res.json(messages);
});

// Lawyer sends a message to client (admin/scoped)
app.post('/api/portal-chat/:customerId', verifyAuth, async (req, res) => {
  const { text } = req.body;
  if (!text || !String(text).trim()) return res.status(400).json({ error: 'text required' });
  const customerId = String(req.params.customerId).trim();
  if (!(await verifyPortalChatAccess(req.user, customerId))) return res.status(403).json({ error: 'forbidden' });
  const senderName = req.user?.lawyerName || req.user?.consultantName || req.user?.username || 'Lawyer';
  const msg = { messageId: genShortId('PM'), customerId, text: String(text).trim(), senderType: 'lawyer', senderName, createdAt: new Date().toISOString(), readByLawyer: true, readByClient: false };
  await portalMessagesCol.insertOne(msg);
  // Notify client via email
  const [cust, cli] = await Promise.all([
    customersCol.findOne({ customerId: msg.customerId }, { projection: { email: 1, name: 1 } }),
    confirmedClientsCol.findOne({ customerId: msg.customerId }, { projection: { email: 1, name: 1 } }),
  ]);
  const clientRecord = cust || cli;
  if (clientRecord?.email) {
    sendEmail({ to: clientRecord.email, subject: 'New message from your lawyer', text: `Dear ${clientRecord.name || 'Client'},\n\nYour lawyer sent you a new message:\n\n"${msg.text}"\n\nVisit your customer portal to reply.` });
  }
  res.status(201).json(msg);
});

// Mark all client messages as read (scoped)
app.put('/api/portal-chat/:customerId/read', verifyAuth, async (req, res) => {
  const customerId = String(req.params.customerId).trim();
  if (!(await verifyPortalChatAccess(req.user, customerId))) return res.status(403).json({ error: 'forbidden' });
  await portalMessagesCol.updateMany(
    { customerId, senderType: 'client', readByLawyer: false },
    { $set: { readByLawyer: true } }
  );
  res.json({ ok: true });
});

// Delete a single message (scoped)
app.delete('/api/portal-chat/:customerId/:messageId', verifyAuth, async (req, res) => {
  const customerId = String(req.params.customerId).trim();
  if (!(await verifyPortalChatAccess(req.user, customerId))) return res.status(403).json({ error: 'forbidden' });
  await portalMessagesCol.deleteOne({ customerId, messageId: String(req.params.messageId) });
  res.json({ ok: true });
});

// Delete entire chat history for a customer (archives to deletedChats)
app.delete('/api/portal-chat/:customerId', verifyAuth, async (req, res) => {
  const customerId = String(req.params.customerId).trim();
  if (!(await verifyPortalChatAccess(req.user, customerId))) return res.status(403).json({ error: 'forbidden' });
  const messages = await portalMessagesCol.find({ customerId }).sort({ createdAt: 1 }).toArray();
  const [cust, cli] = await Promise.all([
    customersCol.findOne({ customerId }, { projection: { name: 1 } }),
    confirmedClientsCol.findOne({ customerId }, { projection: { name: 1 } }),
  ]);
  const customerName = (cust || cli)?.name || customerId;
  await deletedChatsCol.insertOne({
    deletedChatId: genShortId('DC'),
    customerId,
    customerName,
    deletedAt: new Date().toISOString(),
    deletedBy: req.user?.username || 'unknown',
    reason: 'manual',
    messages,
  });
  await portalMessagesCol.deleteMany({ customerId });
  res.json({ ok: true });
});

// ── Admin: Deleted Chats ──────────────────────────────────────────────────────
app.get('/api/admin/deleted-chats', verifyAuth, async (req, res) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  const q = req.query.search ? String(req.query.search).trim() : '';
  const filter = q ? { customerName: { $regex: q, $options: 'i' } } : {};
  const chats = await deletedChatsCol.find(filter).sort({ deletedAt: -1 }).toArray();
  res.json(chats);
});

// ── Staff Workload ────────────────────────────────────────────────────────────
app.get('/api/admin/workload', verifyAuth, async (req, res) => {
  if (!isAdminUser(req.user)) return res.status(403).json({ error: 'admin only' });
  const [customers, clients, users] = await Promise.all([
    customersCol.find({}, { projection: { assignedTo: 1, status: 1 } }).toArray(),
    confirmedClientsCol.find({}, { projection: { assignedTo: 1, status: 1 } }).toArray(),
    usersCol.find({ role: { $in: ['consultant', 'manager', 'admin'] } }, { projection: { username: 1, consultantName: 1, role: 1 } }).toArray(),
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

// ── Public Self-Registration ──────────────────────────────────────────────────
app.post('/api/register', async (req, res) => {
  const { name, email, phone, nationality, services, message } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Full name is required.' });
  if (!email || !String(email).trim()) return res.status(400).json({ error: 'Email address is required.' });
  const normalEmail = String(email).toLowerCase().trim();
  // Duplicate check
  const [dupCust, dupClient] = await Promise.all([
    customersCol.findOne({ email: normalEmail }),
    confirmedClientsCol.findOne({ email: normalEmail }),
  ]);
  if (dupCust || dupClient) {
    return res.status(409).json({ error: 'An account with this email already exists. Please contact us directly or use your existing portal link.' });
  }
  const customerId = genShortId('CUS');
  const now = new Date().toISOString();
  const svcList = Array.isArray(services) ? services : (services ? [String(services)] : []);
  const doc = {
    customerId,
    name: String(name).trim(),
    email: normalEmail,
    phone: phone ? String(phone).trim() : null,
    nationality: nationality ? String(nationality).trim() : null,
    services: svcList,
    message: message ? String(message).trim() : null,
    status: 'INTAKE',
    createdAt: now,
    updatedAt: now,
    source: 'self_register',
    version: 1,
  };
  await customersCol.insertOne(doc);
  // Auto-generate portal token valid for 30 days
  const rawToken = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  await portalTokensCol.insertOne({ token: rawToken, customerId, clientName: doc.name, clientType: 'customer', createdAt: now, expiresAt, createdBy: 'self_register' });
  await logAudit({ username: 'public', role: 'public', action: 'self_register', resource: 'customer', resourceId: customerId, details: { name: doc.name, email: normalEmail } });
  // Welcome email to new enquirer
  const portalUrl = process.env.APP_URL ? `${process.env.APP_URL}/portal/${rawToken}` : null;
  sendEmail({
    to: normalEmail,
    subject: 'Thank you for contacting DAFKU Law Firm',
    text: [
      `Dear ${doc.name},`,
      '',
      'Thank you for reaching out to DAFKU Law Firm. We have received your enquiry and our team will review it shortly.',
      '',
      'We have created a secure personal portal for you where you can track your enquiry status and communicate with our team.',
      '',
      portalUrl ? `Access your customer portal here:\n${portalUrl}` : 'A portal link will be sent to you once your enquiry is reviewed.',
      '',
      'Our team will be in touch within 1-2 business days.',
      '',
      'If you have urgent questions, reach us on WhatsApp: https://wa.me/355696952989',
      '',
      'Best regards,\nDAFKU Law Firm\ninfo@dafkulawfirm.al',
    ].join('\n'),
  });
  // Admin notification
  if (process.env.ADMIN_EMAIL) {
    sendEmail({
      to: process.env.ADMIN_EMAIL,
      subject: `\uD83D\uDCE9 New enquiry: ${doc.name}`,
      text: `New self-registration received.\n\nName: ${doc.name}\nEmail: ${normalEmail}\nPhone: ${doc.phone || '\u2014'}\nNationality: ${doc.nationality || '\u2014'}\nServices: ${svcList.join(', ') || '\u2014'}\nMessage:\n${doc.message || '(none)'}\n\nCustomer ID: ${customerId}`,
    });
  }
  res.status(201).json({ ok: true, message: 'Registration successful. Check your email for your portal link.' });
});
