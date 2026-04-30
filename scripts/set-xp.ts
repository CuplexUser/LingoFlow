#!/usr/bin/env npx tsx
/**
 * Set XP for a test account, keeping all XP sources consistent.
 * Writes to session_history (source of truth for the top-bar),
 * daily_xp (stats page chart), and language_progress / progress (aggregates).
 *
 * Usage (from repo root):
 *   $env:NODE_PATH="server/node_modules"; npx tsx scripts/set-xp.ts --email user@example.com --xp 5000 --language russian
 *   $env:NODE_PATH="server/node_modules"; npx tsx scripts/set-xp.ts --email user@example.com --xp 5000
 *
 * Options:
 *   --language <lang>   Target a single language (required for per-language top-bar XP)
 *   --days <n>          Number of past days to spread XP across (default: 30)
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
  const email = get("--email");
  const xpRaw = get("--xp");
  const language = get("--language") ?? null;
  const daysRaw = get("--days") ?? "30";
  if (!email || !xpRaw) {
    console.error(
      "Usage: npx tsx scripts/set-xp.ts --email <email> --xp <amount> [--language <lang>] [--days <n>]"
    );
    process.exit(1);
  }
  const xp = Number(xpRaw);
  const days = Number(daysRaw);
  if (isNaN(xp) || xp < 0) { console.error("--xp must be a non-negative number"); process.exit(1); }
  if (isNaN(days) || days < 1) { console.error("--days must be a positive integer"); process.exit(1); }
  return { email, xp: Math.round(xp), language, days: Math.round(days) };
}

function levelFromXp(xp: number) {
  return Math.max(1, 1 + Math.floor(xp / 150));
}

/** Split totalXp into numDays buckets with mild variation. */
function splitAcrossDays(totalXp: number, numDays: number): number[] {
  if (totalXp === 0) return [];
  const base = Math.floor(totalXp / numDays);
  let remaining = totalXp;
  const buckets: number[] = [];
  for (let i = numDays - 1; i >= 0; i--) {
    if (i === 0) {
      buckets.push(remaining);
    } else {
      const variation = Math.floor(base * 0.3 * (Math.random() * 2 - 1));
      const dayXp = Math.max(0, Math.min(remaining - i, base + variation));
      buckets.push(dayXp);
      remaining -= dayXp;
    }
  }
  return buckets;
}

function isoDate(daysAgo: number, today: string): string {
  const d = new Date(today + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

function repairLanguageForUser(db: Database.Database, userId: number, lang: string, today: string) {
  const histRow = db.prepare<[number, string], { total_xp: number; last_date: string | null }>(
    "SELECT COALESCE(SUM(xp_gained),0) AS total_xp, MAX(DATE(completed_at)) AS last_date FROM session_history WHERE user_id = ? AND language = ?"
  ).get(userId, lang);

  const totalXp = Number(histRow?.total_xp ?? 0);

  const exists = db.prepare("SELECT 1 FROM language_progress WHERE user_id = ? AND language = ?").get(userId, lang);
  if (exists) {
    db.prepare(
      "UPDATE language_progress SET total_xp = ?, learner_level = ?, last_completed_date = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND language = ?"
    ).run(totalXp, levelFromXp(totalXp), histRow?.last_date ?? today, userId, lang);
  } else {
    db.prepare(
      "INSERT INTO language_progress (user_id, language, total_xp, learner_level, last_completed_date) VALUES (?, ?, ?, ?, ?)"
    ).run(userId, lang, totalXp, levelFromXp(totalXp), histRow?.last_date ?? today);
  }

  // Rebuild daily_xp from session_history for this language
  db.prepare("DELETE FROM daily_xp WHERE user_id = ? AND language = ?").run(userId, lang);
  const dailyRows = db.prepare<[number, string], { date: string; xp: number }>(
    "SELECT DATE(completed_at) AS date, COALESCE(SUM(xp_gained),0) AS xp FROM session_history WHERE user_id = ? AND language = ? GROUP BY DATE(completed_at)"
  ).all(userId, lang);
  const insertDay = db.prepare("INSERT INTO daily_xp (user_id, language, date, xp) VALUES (?, ?, ?, ?)");
  for (const { date, xp } of dailyRows) {
    insertDay.run(userId, lang, date, xp);
  }
}

const { email, xp, language, days } = parseArgs();
const db = new Database(DB_PATH);

const user = db.prepare<[string], { id: number; display_name: string }>(
  "SELECT id, display_name FROM users WHERE email = ?"
).get(email);

if (!user) {
  console.error(`No user found with email: ${email}`);
  process.exit(1);
}

const today = new Date().toISOString().slice(0, 10);

const langs: string[] = language
  ? [language]
  : db.prepare<[number], { language: string }>(
      "SELECT DISTINCT language FROM language_progress WHERE user_id = ?"
    ).all(user.id).map((r) => r.language);

if (!langs.length) {
  console.error("No languages found for this user. Use --language to specify one.");
  process.exit(1);
}

db.transaction(() => {
  const xpPerLang = Math.round(xp / langs.length);

  for (const lang of langs) {
    // 1. Clear existing session_history for this language
    db.prepare("DELETE FROM session_history WHERE user_id = ? AND language = ?").run(user.id, lang);

    // 2. Insert fake session_history rows spread across the past `days` days
    const buckets = splitAcrossDays(xpPerLang, days).filter((v) => v > 0);
    const insertSession = db.prepare(
      "INSERT INTO session_history (user_id, language, category, score, max_score, accuracy, xp_gained, difficulty_level, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );
    const totalDays = buckets.length;
    buckets.forEach((dayXp, i) => {
      const date = isoDate(totalDays - 1 - i, today);
      const maxScore = 8;
      const score = Math.round(maxScore * 0.85);
      insertSession.run(user.id, lang, "essentials", score, maxScore, score / maxScore, dayXp, "a1", date + "T12:00:00");
    });
    console.log(`  session_history[${lang}]: cleared and inserted ${buckets.length} sessions (${xpPerLang.toLocaleString()} XP total)`);

    // 3. Rebuild language_progress and daily_xp from the new session_history
    repairLanguageForUser(db, user.id, lang, today);
    console.log(`  language_progress[${lang}].total_xp → ${xpPerLang.toLocaleString()}`);
  }

  // 4. Update progress.total_xp as the sum of all language_progress rows
  const sumRow = db.prepare<[number], { s: number }>(
    "SELECT COALESCE(SUM(total_xp), 0) AS s FROM language_progress WHERE user_id = ?"
  ).get(user.id);
  const newTotal = sumRow?.s ?? xp;

  const progExists = db.prepare("SELECT 1 FROM progress WHERE user_id = ?").get(user.id);
  if (progExists) {
    db.prepare(
      "UPDATE progress SET total_xp = ?, learner_level = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?"
    ).run(newTotal, levelFromXp(newTotal), user.id);
  } else {
    db.prepare(
      "INSERT INTO progress (user_id, total_xp, learner_level) VALUES (?, ?, ?)"
    ).run(user.id, newTotal, levelFromXp(newTotal));
  }
  console.log(`  progress.total_xp → ${newTotal.toLocaleString()}`);
})();

console.log(`\nDone. "${user.display_name}" (${email}) → ${xp.toLocaleString()} XP`);
db.close();
