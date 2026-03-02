import { logger } from "../middleware/logger.js";

/**
 * Creates all MongoDB indexes needed for production performance.
 * Safe to call on every startup — createIndex is idempotent.
 *
 * Call after DB connects:
 *   import { createIndexes } from "./lib/dbIndexes.js";
 *   await createIndexes(db);
 */
export async function createIndexes(db) {
  try {
    await Promise.all([
      // ── customers ────────────────────────────────────────────────────────
      db.collection("customers").createIndex({ customerId: 1 }, { unique: true }),
      db.collection("customers").createIndex({ email: 1 }),
      db.collection("customers").createIndex({ status: 1 }),
      db.collection("customers").createIndex({ assignedTo: 1 }),
      db.collection("customers").createIndex({ registeredAt: -1 }),
      db.collection("customers").createIndex(
        { name: "text", email: "text", phone: "text" },
        { name: "customers_text_search" }
      ),

      // ── cases ─────────────────────────────────────────────────────────────
      db.collection("cases").createIndex({ caseId: 1 }, { unique: true }),
      db.collection("cases").createIndex({ customerId: 1 }),
      db.collection("cases").createIndex({ state: 1 }),
      db.collection("cases").createIndex({ assignedTo: 1 }),
      db.collection("cases").createIndex({ createdAt: -1 }),
      db.collection("cases").createIndex({ state: 1, lastStateChange: 1 }),

      // ── users ─────────────────────────────────────────────────────────────
      db.collection("users").createIndex({ username: 1 }, { unique: true }),
      db.collection("users").createIndex({ email: 1 }, { sparse: true }),

      // ── history ───────────────────────────────────────────────────────────
      db.collection("history").createIndex({ caseId: 1 }),
      db.collection("history").createIndex({ timestamp: -1 }),

      // ── customerHistory ───────────────────────────────────────────────────
      db.collection("customerHistory").createIndex({ customerId: 1 }),
      db.collection("customerHistory").createIndex({ timestamp: -1 }),

      // ── notes / tasks ─────────────────────────────────────────────────────
      db.collection("notes").createIndex({ caseId: 1 }),
      db.collection("tasks").createIndex({ caseId: 1 }),
      db.collection("tasks").createIndex({ dueDate: 1 }),

      // ── meetings ──────────────────────────────────────────────────────────
      db.collection("meetings").createIndex({ date: 1 }),
      db.collection("meetings").createIndex({ assignedTo: 1 }),

      // ── invoices ──────────────────────────────────────────────────────────
      db.collection("invoices").createIndex({ invoiceId: 1 }, { unique: true }),
      db.collection("invoices").createIndex({ customerId: 1 }),
      db.collection("invoices").createIndex({ status: 1 }),

      // ── auditLogs ─────────────────────────────────────────────────────────
      db.collection("auditLogs").createIndex({ createdAt: -1 }),
      db.collection("auditLogs").createIndex({ userId: 1, createdAt: -1 }),

      // ── portalTokens (expire automatically after 30 days) ─────────────────
      db.collection("portalTokens").createIndex({ token: 1 }, { unique: true }),
      db.collection("portalTokens").createIndex(
        { createdAt: 1 },
        { expireAfterSeconds: 30 * 24 * 60 * 60 }
      ),

      // ── emailVerifyCodes (expire automatically after 15 minutes) ──────────
      db.collection("emailVerifyCodes").createIndex({ email: 1 }),
      db.collection("emailVerifyCodes").createIndex(
        { createdAt: 1 },
        { expireAfterSeconds: 15 * 60 }
      ),

      // ── customerNotifications ─────────────────────────────────────────────
      db.collection("customerNotifications").createIndex({ customerId: 1 }),
      db.collection("customerNotifications").createIndex({ createdAt: -1 }),

      // ── deletedRecords ────────────────────────────────────────────────────
      db.collection("deletedRecords").createIndex({ deletedAt: -1 }),
      db.collection("deletedRecords").createIndex({ recordType: 1 }),

      // ── confirmedClients ──────────────────────────────────────────────────
      db.collection("confirmedClients").createIndex({ customerId: 1 }),
      db.collection("confirmedClients").createIndex({ assignedTo: 1 }),
    ]);

    logger.info("[db] All indexes created/verified.");
  } catch (err) {
    logger.error(`[db] Index creation error: ${err.message}`);
  }
}
