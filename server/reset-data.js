/**
 * reset-data.js
 * Clears all operational data from the database while preserving user accounts.
 * Run once: node server/reset-data.js
 */

import { MongoClient } from "mongodb";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.DB_NAME || "lawman";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

if (!MONGODB_URI) {
  console.error("ERROR: MONGODB_URI env var is not set.");
  process.exit(1);
}

// Collections to clear (operational data only — users are preserved)
const OPERATIONAL_COLLECTIONS = [
  "customers",
  "confirmedClients",
  "cases",
  "history",
  "customerHistory",
  "customerNotifications",
  "notes",
  "tasks",
  "meetings",
  "auditLogs",
  "documents",
];

async function deleteUploadedFiles() {
  const uploadsDir = path.resolve(__dirname, "uploads");
  try {
    const files = await fs.promises.readdir(uploadsDir);
    let deleted = 0;
    for (const file of files) {
      try {
        await fs.promises.unlink(path.join(uploadsDir, file));
        deleted++;
      } catch {
        // ignore individual file errors
      }
    }
    console.log(`  Deleted ${deleted} uploaded file(s) from server/uploads/.`);
  } catch {
    console.log("  No uploads directory found — skipped.");
  }
}

async function resetData() {
  const client = new MongoClient(MONGODB_URI);
  try {
    await client.connect();
    const db = client.db(DB_NAME);

    console.log(`\nConnected to MongoDB database: "${DB_NAME}"`);
    console.log("Clearing operational collections...\n");

    for (const colName of OPERATIONAL_COLLECTIONS) {
      const col = db.collection(colName);
      const result = await col.deleteMany({});
      console.log(`  ${colName}: deleted ${result.deletedCount} document(s)`);
    }

    await deleteUploadedFiles();

    // Verify users are still intact
    const userCount = await db.collection("users").countDocuments();
    console.log(`\nUser accounts preserved: ${userCount}`);
    console.log("\nReset complete. All operational data has been cleared.");
    console.log("The database is ready for manual data entry.\n");
  } catch (err) {
    console.error("Reset failed:", err.message || err);
    process.exit(1);
  } finally {
    await client.close();
  }
}

resetData();
