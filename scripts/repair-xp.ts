#!/usr/bin/env npx tsx
/**
 * Repair XP consistency by rebuilding language_progress, progress, and daily_xp
 * from session_history, which is the immutable source of truth.
 *
 * Safe to run on production — reads session_history and overwrites derived tables only.
 * Idempotent: running it twice produces the same result.
 *
 * Usage (from repo root):
 *   $env:NODE_PATH="server/node_modules"; npx tsx scripts/repair-xp.ts
 *   $env:NODE_PATH="server/node_modules"; npx tsx scripts/repair-xp.ts --email user@example.com
 *
 * Options:
 *   --email <email>   Repair a single user only (default: all users)
 *   --dry-run         Print what would change without writing anything
 */

import Database from "better-sqlite3";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = resolve(__dirname, "../server/data/lingoflow.db");

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag: string) => {
    const i = args.indexOf(flag);
    return i !== -1 ? args[i + 1] : null;
  };
  return {
    email: get("--email") ?? null,
    dryRun: args.includes("--dry-run"),
  };
}

function levelFromXp(xp: number) {
  return Math.max(1, 1 + Math.floor(xp / 150));
}

const { email, dryRun } = parseArgs();
const db = new Database(DB_PATH);
if (dryRun) console.log("DRY RUN — no changes will be written.\n");

// Resolve which users to repair
const userRows: Array<{ id: number; email: string; display_name: string }> = email
  ? db.prepare("SELECT id, email, display_name FROM users WHERE email = ?").all(email)
  : db.prepare("SELECT id, email, display_name FROM users").all();

if (!userRows.length) {
  console.error(email ? `No user found: ${email}` : "No users in database.");
  process.exit(1);
}

for (const user of userRows) {
  console.log(`\n── ${user.display_name} (${user.email}) ──`);

  // 1. Aggregate session_history into (language, date, xp) tuples
  const sessionTotals: Array<{ language: string; total_xp: number; last_date: string | null }> =
    db.prepare(`
      SELECT language,
             COALESCE(SUM(xp_gained), 0)   AS total_xp,
             MAX(DATE(completed_at))        AS last_date
      FROM session_history
      WHERE user_id = ?
      GROUP BY language
    `).all(user.id);

  const dailyRows: Array<{ language: string; date: string; xp: number }> =
    db.prepare(`
      SELECT language,
             DATE(completed_at) AS date,
             COALESCE(SUM(xp_gained), 0) AS xp
      FROM session_history
      WHERE user_id = ?
      GROUP BY language, DATE(completed_at)
    `).all(user.id);

  if (!sessionTotals.length) {
    console.log("  No session_history found — nothing to repair.");
    continue;
  }

  // 2. Print what we found
  for (const row of sessionTotals) {
    console.log(`  session_history[${row.language}]: ${row.total_xp.toLocaleString()} XP total`);
  }
  const grandTotal = sessionTotals.reduce((s, r) => s + r.total_xp, 0);
  console.log(`  session_history total: ${grandTotal.toLocaleString()} XP`);

  // 3. Show current state
  const currentProgress = db.prepare("SELECT total_xp FROM progress WHERE user_id = ?").get(user.id) as { total_xp: number } | undefined;
  console.log(`  progress.total_xp currently: ${(currentProgress?.total_xp ?? 0).toLocaleString()}`);
  const currentDailySum = (db.prepare("SELECT COALESCE(SUM(xp), 0) AS s FROM daily_xp WHERE user_id = ?").get(user.id) as { s: number }).s;
  console.log(`  daily_xp sum currently:      ${currentDailySum.toLocaleString()}`);

  if (dryRun) {
    console.log(`  [dry-run] Would set progress.total_xp → ${grandTotal.toLocaleString()}`);
    console.log(`  [dry-run] Would rebuild daily_xp with ${dailyRows.length} entries`);
    continue;
  }

  db.transaction(() => {
    // 4. Rebuild language_progress from session_history
    for (const row of sessionTotals) {
      const exists = db.prepare(
        "SELECT 1 FROM language_progress WHERE user_id = ? AND language = ?"
      ).get(user.id, row.language);
      if (exists) {
        db.prepare(`
          UPDATE language_progress
          SET total_xp = ?, learner_level = ?, last_completed_date = ?, updated_at = CURRENT_TIMESTAMP
          WHERE user_id = ? AND language = ?
        `).run(row.total_xp, levelFromXp(row.total_xp), row.last_date, user.id, row.language);
      } else {
        db.prepare(`
          INSERT INTO language_progress (user_id, language, total_xp, learner_level, last_completed_date)
          VALUES (?, ?, ?, ?, ?)
        `).run(user.id, row.language, row.total_xp, levelFromXp(row.total_xp), row.last_date);
      }
      console.log(`  language_progress[${row.language}].total_xp → ${row.total_xp.toLocaleString()}`);
    }

    // 5. Rebuild progress.total_xp as the sum of all language_progress rows
    const progExists = db.prepare("SELECT 1 FROM progress WHERE user_id = ?").get(user.id);
    if (progExists) {
      db.prepare(`
        UPDATE progress
        SET total_xp = ?, learner_level = ?, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ?
      `).run(grandTotal, levelFromXp(grandTotal), user.id);
    } else {
      db.prepare(`
        INSERT INTO progress (user_id, total_xp, learner_level) VALUES (?, ?, ?)
      `).run(user.id, grandTotal, levelFromXp(grandTotal));
    }
    console.log(`  progress.total_xp → ${grandTotal.toLocaleString()}`);

    // 6. Rebuild daily_xp from session_history (clear and repopulate)
    db.prepare("DELETE FROM daily_xp WHERE user_id = ?").run(user.id);
    const insertDay = db.prepare(
      "INSERT INTO daily_xp (user_id, language, date, xp) VALUES (?, ?, ?, ?)"
    );
    for (const { language, date, xp } of dailyRows) {
      insertDay.run(user.id, language, date, xp);
    }
    console.log(`  daily_xp: rebuilt with ${dailyRows.length} entries (sum: ${dailyRows.reduce((s, r) => s + r.xp, 0).toLocaleString()} XP)`);
  })();
}

console.log("\nDone.");
db.close();
