import express from "express";
import cors from "cors";
import { MongoClient } from "mongodb";
import dotenv from "dotenv";
import { seedCustomers, seedCases, seedHistory, seedNotes, seedTasks } from "./seed-data.js";

dotenv.config();

const PORT = process.env.PORT || 4000;
const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.DB_NAME || "lawman";
const app = express();

if (!MONGODB_URI) {
  console.error("Missing MONGODB_URI env var. Set it before running the server.");
  process.exit(1);
}

app.use(cors());
app.use(express.json());

let client;
let db;
let customersCol;
let casesCol;
let historyCol;
let customerHistoryCol;
let customerNotificationsCol;
let notesCol;
let tasksCol;

async function connectDb() {
  client = new MongoClient(MONGODB_URI);
  await client.connect();
  db = client.db(DB_NAME);
  customersCol = db.collection("customers");
  casesCol = db.collection("cases");
  historyCol = db.collection("history");
  customerHistoryCol = db.collection("customerHistory");
  customerNotificationsCol = db.collection("customerNotifications");
  notesCol = db.collection("notes");
  tasksCol = db.collection("tasks");
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
const escapeRegex = (str = "") => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const STUCK_STATES = ["WAITING_RESPONSE_P", "WAITING_RESPONSE_C", "WAITING_APPROVAL", "WAITING_ACCEPTANCE", "SEND_PROPOSAL", "SEND_CONTRACT", "SEND_RESPONSE", "SEND_DOCUMENTS"];
const MAX_STALE_HOURS = 120;
const FOLLOW_UP_24H_STATUSES = ["INTAKE"];
const FOLLOW_UP_72H_STATUSES = ["WAITING_APPROVAL", "WAITING_ACCEPTANCE"];
const RESPOND_24H_STATUSES = ["SEND_PROPOSAL", "SEND_CONTRACT", "SEND_RESPONSE"];

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
  const customers = await customersCol.find({}).toArray();

  for (const customer of customers) {
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
        followupSuppressed: false,
      }
      : {
        status,
        lastStatusChangeAt,
        followupCount: Number(prevTracker.followupCount || 0),
        lastFollowupAt: prevTracker.lastFollowupAt || null,
        lastRespondAt: prevTracker.lastRespondAt || null,
        followupSuppressed: Boolean(prevTracker.followupSuppressed),
      };

    if (statusChanged) {
      await customerNotificationsCol.deleteMany({ customerId: customer.customerId });
    }

    const elapsedFromStatusChange = hoursBetween(lastStatusChangeAt, nowMs);

    if ((FOLLOW_UP_24H_STATUSES.includes(status) || FOLLOW_UP_72H_STATUSES.includes(status)) && !tracker.followupSuppressed) {
      const followupInterval = FOLLOW_UP_24H_STATUSES.includes(status) ? 24 : 72;
      const elapsedFromLastFollowup = tracker.lastFollowupAt ? hoursBetween(tracker.lastFollowupAt, nowMs) : elapsedFromStatusChange;

      if (elapsedFromStatusChange >= followupInterval && elapsedFromLastFollowup >= followupInterval) {
        if (tracker.followupCount >= 3) {
          tracker.followupSuppressed = true;
          await customerNotificationsCol.deleteMany({ customerId: customer.customerId, kind: "follow" });
        } else {
          await insertCustomerNotification({
            customerId: customer.customerId,
            message: `Follow up ${customer.name}`,
            kind: "follow",
            severity: followupInterval === 72 ? "critical" : "warn",
          });
          tracker.followupCount += 1;
          tracker.lastFollowupAt = new Date(nowMs).toISOString();
          if (tracker.followupCount >= 3) {
            tracker.followupSuppressed = true;
            await customerNotificationsCol.deleteMany({ customerId: customer.customerId, kind: "follow" });
          }
        }
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

    await customersCol.updateOne(
      { customerId: customer.customerId },
      { $set: { notificationTracker: tracker } }
    );
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

app.get("/api/health", (req, res) => res.json({ ok: true }));

// Customers
app.get("/api/customers", async (req, res) => {
  const docs = await customersCol.find({}).sort({ customerId: 1 }).toArray();
  res.json(docs);
});

app.get("/api/customers/notifications", async (req, res) => {
  await syncCustomerNotifications();
  const docs = await customerNotificationsCol.find({}).sort({ createdAt: -1 }).limit(50).toArray();
  res.json(docs);
});

app.get("/api/customers/:id", async (req, res) => {
  const doc = await customersCol.findOne({ customerId: req.params.id });
  if (!doc) return res.status(404).json({ error: "Not found" });
  res.json(doc);
});

app.post("/api/customers", async (req, res) => {
  const customerId = await genCustomerId();
  const payload = { ...req.body, customerId };
  await customersCol.insertOne(payload);
  res.status(201).json(payload);
});

app.put("/api/customers/:id", async (req, res) => {
  const { id } = req.params;
  const update = { ...req.body };

  // Check if status is changing
  const current = await customersCol.findOne({ customerId: id });
  if (current && current.status !== update.status) {
    // Create status history entry
    const historyId = `CH${pad3(Date.now() % 1000)}`;
    await customerHistoryCol.insertOne({
      historyId,
      customerId: id,
      statusFrom: current.status,
      statusTo: update.status,
      date: new Date().toISOString()
    });

    // Initialize or update statusHistory array
    if (!update.statusHistory) {
      update.statusHistory = (current.statusHistory || []);
    }
    update.statusHistory.push({
      status: update.status,
      date: new Date().toISOString()
    });
  }

  await customersCol.updateOne({ customerId: id }, { $set: update });
  const updated = await customersCol.findOne({ customerId: id });
  if (!updated) return res.status(404).json({ error: "Not found" });
  res.json(updated);
});

app.delete("/api/customers/:id", async (req, res) => {
  const { id } = req.params;
  const relatedCases = await casesCol.find({ customerId: id }).project({ caseId: 1 }).toArray();
  const relatedCaseIds = relatedCases.map((c) => c.caseId);
  await Promise.all([
    casesCol.deleteMany({ customerId: id }),
    historyCol.deleteMany({ caseId: { $in: relatedCaseIds } }),
    notesCol.deleteMany({ caseId: { $in: relatedCaseIds } }),
    tasksCol.deleteMany({ caseId: { $in: relatedCaseIds } }),
    customerHistoryCol.deleteMany({ customerId: id }),
    customersCol.deleteOne({ customerId: id }),
  ]);
  res.json({ ok: true });
});

app.get("/api/customers/:id/cases", async (req, res) => {
  const docs = await casesCol.find({ customerId: req.params.id }).toArray();
  res.json(docs);
});

app.get("/api/customers/:id/history", async (req, res) => {
  const docs = await customerHistoryCol.find({ customerId: req.params.id }).sort({ date: 1 }).toArray();
  res.json(docs);
});

app.post("/api/customers/:id/history", async (req, res) => {
  const { id } = req.params;
  const { statusFrom, statusTo } = req.body;
  const historyId = `CH${pad3(Date.now() % 1000)}`;
  const record = { historyId, customerId: id, statusFrom, statusTo, date: new Date().toISOString() };
  await customerHistoryCol.insertOne(record);
  res.status(201).json(record);
});

// Cases
app.get("/api/cases", async (req, res) => {
  const search = req.query.q ? new RegExp(req.query.q, "i") : null;
  const filters = buildCaseFilters(req.query);

  // If searching, include customer name via lookup while preserving other filters
  if (search) {
    const nonSearchFilters = buildCaseFilters({ ...req.query, q: undefined });
    const docs = await casesCol
      .aggregate([
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
        { $sort: { caseId: 1 } },
        { $project: { customer: 0 } },
      ])
      .toArray();
    return res.json(docs);
  }

  const docs = await casesCol.find(filters).sort({ caseId: 1 }).toArray();
  res.json(docs);
});

app.get("/api/cases/:id", async (req, res) => {
  const doc = await casesCol.findOne({ caseId: req.params.id });
  if (!doc) return res.status(404).json({ error: "Not found" });
  res.json(doc);
});

app.post("/api/cases", async (req, res) => {
  const caseId = await genCaseId();
  const now = new Date().toISOString();
  const payload = { ...req.body, caseId, lastStateChange: now };
  await casesCol.insertOne(payload);
  await historyCol.insertOne({ historyId: `H${pad3(Date.now() % 1000)}`, caseId, stateFrom: payload.state, stateIn: payload.state, date: now });
  res.status(201).json(payload);
});

app.put("/api/cases/:id", async (req, res) => {
  const targetId = (req.params.id || "").trim();
  const idPattern = new RegExp(`^${escapeRegex(targetId)}\\s*$`, "i");
  const update = { ...req.body };
  // Guarantee caseId stays consistent and create if missing to avoid 404 edits
  update.caseId = targetId;
  const result = await casesCol.findOneAndUpdate(
    { caseId: idPattern },
    { $set: update },
    { returnDocument: "after", upsert: true }
  );
  const doc = result.value || (await casesCol.findOne({ caseId: targetId }));
  res.json(doc);
});

app.delete("/api/cases/:id", async (req, res) => {
  const { id } = req.params;
  await Promise.all([
    casesCol.deleteOne({ caseId: id }),
    historyCol.deleteMany({ caseId: id }),
    notesCol.deleteMany({ caseId: id }),
    tasksCol.deleteMany({ caseId: id }),
  ]);
  res.json({ ok: true });
});

// History
app.get("/api/cases/:id/history", async (req, res) => {
  const docs = await historyCol.find({ caseId: req.params.id }).sort({ date: 1 }).toArray();
  res.json(docs);
});

app.post("/api/cases/:id/history", async (req, res) => {
  const { id } = req.params;
  const { stateFrom, stateIn } = req.body;
  const historyId = `H${pad3(Date.now() % 1000)}`;
  const record = { historyId, caseId: id, stateFrom, stateIn, date: new Date().toISOString() };
  await historyCol.insertOne(record);
  await casesCol.updateOne({ caseId: id }, { $set: { state: stateIn, lastStateChange: record.date } });
  res.status(201).json(record);
});

// Notes
app.get("/api/cases/:id/notes", async (req, res) => {
  const docs = await notesCol.find({ caseId: req.params.id }).sort({ date: -1 }).toArray();
  res.json(docs);
});

app.post("/api/cases/:id/notes", async (req, res) => {
  const { id } = req.params;
  const noteId = `N${pad3(Date.now() % 1000)}`;
  const note = { noteId, caseId: id, date: new Date().toISOString(), noteText: req.body.noteText };
  await notesCol.insertOne(note);
  res.status(201).json(note);
});

// Tasks
app.get("/api/cases/:id/tasks", async (req, res) => {
  const docs = await tasksCol
    .find({ caseId: req.params.id })
    .sort({ done: 1, createdAt: 1 })
    .toArray();
  res.json(docs);
});

app.post("/api/cases/:id/tasks", async (req, res) => {
  const { id } = req.params;
  const taskId = `T${pad3(Date.now() % 1000)}`;
  const task = {
    taskId,
    caseId: id,
    title: req.body.title,
    done: false,
    createdAt: new Date().toISOString(),
    dueDate: req.body.dueDate ?? null,
  };
  await tasksCol.insertOne(task);
  res.status(201).json(task);
});

app.post("/api/tasks/:taskId/toggle", async (req, res) => {
  const { taskId } = req.params;
  const t = await tasksCol.findOne({ taskId });
  if (!t) return res.status(404).json({ error: "Not found" });
  await tasksCol.updateOne({ taskId }, { $set: { done: !t.done } });
  res.json({ ...t, done: !t.done });
});

// KPIs
app.get("/api/kpis", async (req, res) => {
  const now = Date.now();
  const allCases = await casesCol.find({}).toArray();
  const allTasks = await tasksCol.find({}).toArray();
  const overdue = allCases.filter((c) => c.deadline && new Date(c.deadline).getTime() < now).length;
  const missingDocs = allCases.filter((c) => c.documentState === "missing").length;
  const urgentCases = allCases.filter((c) => c.priority === "urgent" || c.priority === "high").length;
  const pendingTasks = allTasks.filter((t) => !t.done).length;
  const stateBreakdown = allCases.reduce((acc, c) => {
    acc[c.state] = (acc[c.state] || 0) + 1;
    return acc;
  }, {});
  res.json({
    totalCases: allCases.length,
    overdue,
    missingDocs,
    urgentCases,
    pendingTasks,
    stateBreakdown,
  });
});

// Start
(async () => {
  await connectDb();
  await seedIfEmpty();
  // periodic cleanup for stale cases
  setInterval(() => {
    cleanupStaleCases().catch((err) => console.error("cleanup failed", err));
  }, 60 * 60 * 1000);
  app.listen(PORT, () => {
    console.log(`API listening on port ${PORT}`);
  });
})();
