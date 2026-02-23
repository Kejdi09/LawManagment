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

dotenv.config();

const PORT = process.env.PORT || 4000;
const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.DB_NAME || "lawman";
const IS_PROD = process.env.NODE_ENV === "production";
let documentsCol;
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
        await Promise.all([
          customerNotificationsCol.deleteMany({ customerId: customer.customerId }),
          customerHistoryCol.deleteMany({ customerId: customer.customerId }),
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
async function genCustomerId() {
  const last = await customersCol
    .find({})
    .project({ customerId: 1 })
    .sort({ customerId: -1 })
    .limit(1)
    .toArray();
  const num = last.length ? Number((last[0].customerId || "0").replace(/\D/g, "")) : 0;
  return `C${pad3(num + 1)}`;
}
async function genCaseId() {
  const last = await casesCol
    .find({})
    .project({ caseId: 1 })
    .sort({ caseId: -1 })
    .limit(1)
    .toArray();
  const num = last.length ? Number((last[0].caseId || "0").replace(/\D/g, "")) : 0;
  return `CASE-${pad3(num + 1)}`;
}

function buildCaseFilters(query) {
  const filters = {};
  if (query.state) filters.state = query.state;
  if (query.customerId) filters.customerId = query.customerId;
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
  const customerId = await genCustomerId();
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

  // Track status history
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
    if (!update.statusHistory) update.statusHistory = (current.statusHistory || []);
    update.statusHistory.push({ status: update.status, date: new Date().toISOString() });
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
  const relatedCases = await casesCol.find({ customerId: id, ...caseScope }).project({ caseId: 1 }).toArray();
  const relatedCaseIds = relatedCases.map((c) => c.caseId);
  await Promise.all([
    casesCol.deleteMany({ customerId: id, ...caseScope }),
    historyCol.deleteMany({ caseId: { $in: relatedCaseIds } }),
    notesCol.deleteMany({ caseId: { $in: relatedCaseIds } }),
    tasksCol.deleteMany({ caseId: { $in: relatedCaseIds } }),
    customerHistoryCol.deleteMany({ customerId: id }),
    customersCol.deleteOne({ customerId: id, ...customerScope }),
  ]);
  await logAudit({ username: req.user?.username, role: req.user?.role, action: 'delete', resource: 'customer', resourceId: id });
  res.json({ ok: true });
});

app.delete("/api/confirmed-clients/:id", verifyAuth, async (req, res) => {
  const { id } = req.params;
  const customerScope = buildClientScopeFilter(req.user);
  const current = await confirmedClientsCol.findOne({ customerId: id, ...customerScope });
  if (!current) return res.status(404).json({ error: "Not found" });
  const caseScope = buildCaseScopeFilter(req.user);
  const relatedCases = await casesCol.find({ customerId: id, ...caseScope }).project({ caseId: 1 }).toArray();
  const relatedCaseIds = relatedCases.map((c) => c.caseId);
  await Promise.all([
    casesCol.deleteMany({ customerId: id, ...caseScope }),
    historyCol.deleteMany({ caseId: { $in: relatedCaseIds } }),
    notesCol.deleteMany({ caseId: { $in: relatedCaseIds } }),
    tasksCol.deleteMany({ caseId: { $in: relatedCaseIds } }),
    customerHistoryCol.deleteMany({ customerId: id }),
    confirmedClientsCol.deleteOne({ customerId: id, ...customerScope }),
  ]);
  await logAudit({ username: req.user?.username, role: req.user?.role, action: 'delete', resource: 'confirmedClient', resourceId: id });
  res.json({ ok: true });
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
  const caseId = await genCaseId();
  const now = new Date().toISOString();
  const requestedCustomerId = String(req.body?.customerId || "").trim();
  if (!requestedCustomerId) return res.status(400).json({ error: "customerId is required" });

  // For manager/intake: cases link to pre-confirmation customers.
  // For admin/consultant: cases link to confirmed clients.
  const isIntakeUser = req.user?.role === 'intake' || isManagerUser(req.user);
  const customerSource = isIntakeUser ? customersCol : confirmedClientsCol;
  const customerScopeForCase = isIntakeUser ? buildCustomerScopeFilter(req.user) : buildClientScopeFilter(req.user);
  const customer = await customerSource.findOne({ customerId: requestedCustomerId, ...customerScopeForCase });
  if (!customer) {
    return res.status(400).json({ error: isIntakeUser ? "Customer not found or not accessible" : "Case customerId must belong to a confirmed client you can access" });
  }

  const payload = { ...req.body, customerId: requestedCustomerId, caseId, lastStateChange: now, version: 1, createdBy: req.user?.username || null };
  if (payload.assignedTo) payload.assignedTo = stripProfessionalTitle(payload.assignedTo);
  if (!isAdminUser(req.user) && !isManagerUser(req.user)) {
    payload.assignedTo = getUserLawyerName(req.user);
  }
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
  const docs = await documentsCol.find({ ownerType, ownerId }).sort({ uploadedAt: -1 }).toArray();
  res.json(docs);
});

app.get('/api/documents/:docId', verifyAuth, async (req, res) => {
  const { docId } = req.params;
  const doc = await documentsCol.findOne({ docId });
  if (!doc) return res.status(404).json({ error: 'not_found' });
  return res.sendFile(path.resolve(doc.path));
});

app.delete('/api/documents/:docId', verifyAuth, async (req, res) => {
  try {
    const { docId } = req.params;
    const doc = await documentsCol.findOne({ docId });
    if (!doc) return res.status(404).json({ error: 'not_found' });
    // remove file
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
