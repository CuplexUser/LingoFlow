#!/usr/bin/env node --experimental-strip-types

// One-time import of an existing SQLite LingoFlow database into Postgres (Neon).
//
// The target schema is built by the server's own initSchema(), so there is no
// second copy of the schema to drift. Rows are then copied table by table in
// FK-safe order. Safe to re-run: every insert uses ON CONFLICT DO NOTHING, so a
// second run reports rows as skipped rather than failing.
//
// Usage (from the repo root), with DATABASE_URL pointing at the target:
//   node --experimental-strip-types scripts/import-sqlite-to-postgres.ts
//   node --experimental-strip-types scripts/import-sqlite-to-postgres.ts --from ./backup.db
//
// Options:
//   --from <path>   Source SQLite file (default: LINGOFLOW_DB_PATH, else server/data/lingoflow.db)
//   --dry-run       Read and report row counts without writing anything

import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

require("dotenv").config({ path: resolve(__dirname, "../server/.env") });

// Copy order matters: parents before children. community_exercises.reviewed_by is a
// self-referencing FK to users, so it only needs users to exist first.
const TABLES = [
  "users",
  "settings",
  "progress",
  "language_progress",
  "category_progress",
  "session_history",
  "active_sessions",
  "attempt_history",
  "item_progress",
  "daily_xp",
  "exercise_usage",
  "achievements",
  "bookmarks",
  "saved_words",
  "story_completions",
  "email_verifications",
  "password_resets",
  "community_exercises",
  "content_versions",
  "word_translations",
  "login_page_daily_stats",
  "login_page_unique_visitors"
];

// Postgres caps a statement at 65535 bind parameters; this keeps batches well under it.
const MAX_PARAMS_PER_STATEMENT = 20000;

function parseArgs() {
  const argv = process.argv.slice(2);
  const fromIndex = argv.indexOf("--from");
  return {
    from: fromIndex >= 0 ? argv[fromIndex + 1] : null,
    dryRun: argv.includes("--dry-run")
  };
}

function resolveSourcePath(explicit: string | null): string {
  if (explicit) return resolve(process.cwd(), explicit);
  if (process.env.LINGOFLOW_DB_PATH) return resolve(process.env.LINGOFLOW_DB_PATH);
  return resolve(__dirname, "../server/data/lingoflow.db");
}

async function main() {
  const { from, dryRun } = parseArgs();
  const sourcePath = resolveSourcePath(from);

  if (!existsSync(sourcePath)) {
    console.error(`No SQLite database at ${sourcePath}`);
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set — nothing to import into.");
    process.exit(1);
  }

  console.log(`Source: ${sourcePath}`);
  console.log(`Target: ${process.env.DATABASE_URL.replace(/:[^:@/]+@/, ":****@")}`);
  if (dryRun) console.log("Dry run — no writes will be made.\n");

  const Database = require("better-sqlite3");
  const source = new Database(sourcePath, { readonly: true });

  // Build the target schema with the server's own migrations rather than a
  // duplicate DDL definition. LINGOFLOW_DB_PATH is cleared so the driver factory
  // cannot be tempted back to SQLite.
  process.env.LINGOFLOW_DB_DRIVER = "postgres";
  delete process.env.LINGOFLOW_DB_PATH;
  const database = require("../server/src/db.ts");
  const { getDriver } = require("../server/src/db/driver.ts");

  if (!dryRun) {
    console.log("Applying schema to the target database...");
    await database.initSchema();
  }
  const driver = getDriver();

  const summary: {
    table: string;
    read: number;
    inserted: number;
    skipped: number;
    error: string;
  }[] = [];

  for (const table of TABLES) {
    const exists = source
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(table);
    if (!exists) {
      summary.push({ table, read: 0, inserted: 0, skipped: 0, error: "not in source" });
      continue;
    }

    const columns: string[] = source
      .prepare(`PRAGMA table_info(${table})`)
      .all()
      .map((column: any) => column.name);
    const rows: any[] = source.prepare(`SELECT * FROM ${table}`).all();

    if (dryRun || rows.length === 0) {
      summary.push({ table, read: rows.length, inserted: 0, skipped: 0, error: "" });
      continue;
    }

    const perRow = columns.length;
    const batchSize = Math.max(1, Math.floor(MAX_PARAMS_PER_STATEMENT / perRow));
    let inserted = 0;
    let error = "";

    try {
      // One transaction per table: a partial table is never left behind.
      await driver.transaction(async () => {
        for (let offset = 0; offset < rows.length; offset += batchSize) {
          const batch = rows.slice(offset, offset + batchSize);
          const params: any[] = [];
          const tuples = batch.map((row) => {
            for (const column of columns) params.push(row[column]);
            return `(${columns.map(() => "?").join(", ")})`;
          });
          // No conflict target: DO NOTHING then covers every unique constraint on
          // the table, which is what makes a re-run safe.
          const result = await driver.run(
            `INSERT INTO ${table} (${columns.join(", ")}) VALUES ${tuples.join(", ")} ON CONFLICT DO NOTHING`,
            params
          );
          inserted += result.changes;
        }
      });
    } catch (caught: any) {
      error = caught?.message || String(caught);
    }

    summary.push({ table, read: rows.length, inserted, skipped: rows.length - inserted, error });
    process.stdout.write(`  ${table}: ${inserted}/${rows.length}${error ? " ERROR" : ""}\n`);
  }

  // Rows were inserted with explicit ids, which does not advance an identity
  // sequence. Without this the next INSERT would collide on the primary key.
  if (!dryRun) {
    console.log("\nResyncing identity sequences...");
    for (const table of TABLES) {
      // Only tables that actually have an `id` column are candidates:
      // pg_get_serial_sequence raises 42703 for a column that does not exist
      // rather than returning NULL, and several tables here are keyed on
      // user_id or a composite instead.
      const columns = await driver.columnInfo(table);
      if (!columns.some((column: any) => column.name === "id")) continue;

      const seq = await driver.get("SELECT pg_get_serial_sequence(?, 'id') AS seq", [table]);
      if (!seq?.seq) continue;

      const next = await driver.get(
        `SELECT setval('${seq.seq}', COALESCE((SELECT MAX(id) FROM ${table}), 1)) AS value`,
        []
      );
      console.log(`  ${table} -> ${next?.value}`);
    }
  }

  console.log("\n─── Summary ───");
  console.log(
    "table".padEnd(30),
    "read".padStart(8),
    "inserted".padStart(10),
    "skipped".padStart(9)
  );
  for (const row of summary) {
    console.log(
      row.table.padEnd(30),
      String(row.read).padStart(8),
      String(row.inserted).padStart(10),
      String(row.skipped).padStart(9),
      row.error ? ` ${row.error}` : ""
    );
  }

  const failed = summary.filter((row) => row.error && row.error !== "not in source");
  source.close();
  await database.closeDatabase();

  if (failed.length) {
    console.error(`\n${failed.length} table(s) failed to import.`);
    process.exit(1);
  }
  console.log("\nImport complete.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
