import type { } from "node"; // ensure file is treated as a module

const fs = require("fs");
const path = require("path");

// Configure a unique, throwaway SQLite database for a test file and register a
// process-exit hook that closes the connection and deletes the generated files
// (the .db plus its WAL/SHM sidecars) so they don't pile up in server/data.
// Call this before requiring db.ts so LINGOFLOW_DB_PATH is set in time.
function configureTestDb(testFilename: string): string {
  const base = path.basename(testFilename, path.extname(testFilename));
  const dbPath = path.join(
    __dirname, "..", "..", "..", "data",
    `lingoflow.${base}.${process.pid}.${Date.now()}.test.db`
  );
  process.env.LINGOFLOW_DB_PATH = dbPath;
  process.env.NODE_ENV = "test";

  process.on("exit", () => {
    try {
      require("../../db.ts").closeDatabase();
    } catch (_error) {
      // db.ts may not have been loaded — ignore.
    }
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

module.exports = { configureTestDb };
