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
  // Tests run against SQLite by default, even on a machine that has DATABASE_URL
  // set for the real server. Setting LINGOFLOW_TEST_PG=1 runs the same suite
  // against Postgres instead, which is the only way to catch dialect bugs that
  // SQLite accepts (ambiguous ON CONFLICT columns, NULL ordering, aggregate
  // types). Each file gets its own schema so files stay isolated from each other
  // and from the real data in "public".
  if (usePostgres()) {
    process.env.LINGOFLOW_DB_DRIVER = "postgres";
    process.env.LINGOFLOW_PG_SCHEMA = `test_${base.replace(/[^a-z0-9_]/gi, "_")}_${process.pid}`;
    // Scoping a connection to a schema is a startup parameter, and Neon's
    // pooled endpoint (PgBouncer) rejects those. The direct endpoint accepts
    // them, and the suite runs serially, so connection count is not a concern.
    process.env.DATABASE_URL = String(process.env.DATABASE_URL).replace(
      "-pooler.",
      "."
    );
  } else {
    process.env.LINGOFLOW_DB_DRIVER = "sqlite";
  }

  // Closing the database is async now, so it cannot happen in an "exit" handler;
  // node:test's after() hook can await it. The unlink stays on exit so the files
  // are removed even if the run aborts before the hook fires.
  after(async () => {
    try {
      if (usePostgres()) {
        const { getDriver } = require("../../db/driver.ts");
        await getDriver().exec(
          `DROP SCHEMA IF EXISTS ${process.env.LINGOFLOW_PG_SCHEMA} CASCADE`
        );
      }
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
  if (usePostgres()) {
    // The pool's search_path already points at this schema; creating it is a
    // plain DDL statement that does not depend on the path resolving.
    const schema = process.env.LINGOFLOW_PG_SCHEMA;
    const { getDriver } = require("../../db/driver.ts");
    await getDriver().exec(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await getDriver().exec(`CREATE SCHEMA ${schema}`);
  }
  await require("../../db.ts").initSchema();
}

function usePostgres(): boolean {
  if (process.env.LINGOFLOW_TEST_PG !== "1") return false;
  if (!process.env.DATABASE_URL) {
    // The test runner does not load .env the way index.ts does, so pick up
    // DATABASE_URL from there rather than making the caller export it.
    try {
      require("dotenv").config({ path: path.join(__dirname, "..", "..", "..", ".env") });
    } catch (_error) {
      // dotenv missing or no .env file — fall through to the check below.
    }
  }
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "LINGOFLOW_TEST_PG=1 requires DATABASE_URL (set it in server/.env or the environment)."
    );
  }
  return true;
}

module.exports = { configureTestDb, initTestDb };
