import type { } from "node"; // ensure file is treated as a module

const fs = require("fs");
const path = require("path");
const { after } = require("node:test");

// Configure a unique, throwaway SQLite database for a test file and register
// hooks that close the connection and delete the generated files (the .db plus
// its WAL/SHM sidecars) so they don't pile up in server/data.
// Call this before requiring db.ts so LINGOFLOW_DB_PATH is set in time.
function configureTestDb(testFilename: string): string {
  const base = path.basename(testFilename, path.extname(testFilename));
  const dbPath = path.join(
    __dirname, "..", "..", "..", "data",
    `lingoflow.${base}.${process.pid}.${Date.now()}.test.db`
  );
  process.env.LINGOFLOW_DB_PATH = dbPath;
  process.env.NODE_ENV = "test";
  // Tests always run against SQLite, even on a machine that has DATABASE_URL set
  // for the real server.
  process.env.LINGOFLOW_DB_DRIVER = "sqlite";

  // Closing the database is async now, so it cannot happen in an "exit" handler;
  // node:test's after() hook can await it. The unlink stays on exit so the files
  // are removed even if the run aborts before the hook fires.
  after(async () => {
    try {
      await require("../../db.ts").closeDatabase();
    } catch (_error) {
      // db.ts may not have been loaded — ignore.
    }
  });

  process.on("exit", () => {
    for (const suffix of ["", "-shm", "-wal"]) {
      try {
        fs.unlinkSync(dbPath + suffix);
      } catch (_error) {
        // File may not exist — ignore.
      }
    }
  });

  return dbPath;
}

// Schema creation used to happen as a side effect of requiring db.ts. It is an
// awaited bootstrap now, so every test file that touches the database directly
// has to run it first.
async function initTestDb(): Promise<void> {
  await require("../../db.ts").initSchema();
}

module.exports = { configureTestDb, initTestDb };
