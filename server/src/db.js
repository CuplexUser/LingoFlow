const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const configuredDbPath = process.env.LINGOFLOW_DB_PATH
  ? path.resolve(process.env.LINGOFLOW_DB_PATH)
  : null;
const dataDir = configuredDbPath
  ? path.dirname(configuredDbPath)
  : path.join(__dirname, "..", "data");
const dbPath = configuredDbPath || path.join(dataDir, "lingoflow.db");
const legacyJsonPath = path.join(dataDir, "lingoflow.db.json");

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(dbPath);

db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY CHECK(id = 1),
    native_language TEXT NOT NULL DEFAULT 'english',
    target_language TEXT NOT NULL DEFAULT 'spanish',
    daily_goal INTEGER NOT NULL DEFAULT 30,
    daily_minutes INTEGER NOT NULL DEFAULT 20,
    weekly_goal_sessions INTEGER NOT NULL DEFAULT 5,
    self_rated_level TEXT NOT NULL DEFAULT 'a1',
    learner_name TEXT NOT NULL DEFAULT 'Learner',
    learner_bio TEXT NOT NULL DEFAULT '',
    focus_area TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS progress (
    id INTEGER PRIMARY KEY CHECK(id = 1),
    total_xp INTEGER NOT NULL DEFAULT 0,
    streak INTEGER NOT NULL DEFAULT 0,
    hearts INTEGER NOT NULL DEFAULT 5,
    learner_level INTEGER NOT NULL DEFAULT 1,
    last_completed_date TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS category_progress (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    language TEXT NOT NULL,
    category TEXT NOT NULL,
    mastery REAL NOT NULL DEFAULT 0,
    attempts INTEGER NOT NULL DEFAULT 0,
    total_answers INTEGER NOT NULL DEFAULT 0,
    correct_answers INTEGER NOT NULL DEFAULT 0,
    level_unlocked TEXT NOT NULL DEFAULT 'a1',
    last_practiced_at TEXT,
    UNIQUE(language, category)
  );

  CREATE TABLE IF NOT EXISTS session_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    language TEXT NOT NULL,
    category TEXT NOT NULL,
    score INTEGER NOT NULL,
    max_score INTEGER NOT NULL,
    accuracy REAL NOT NULL,
    xp_gained INTEGER NOT NULL,
    difficulty_level TEXT NOT NULL,
    completed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS active_sessions (
    session_id TEXT PRIMARY KEY,
    language TEXT NOT NULL,
    category TEXT NOT NULL,
    difficulty_level TEXT NOT NULL,
    questions_json TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TEXT
  );

  CREATE TABLE IF NOT EXISTS daily_xp (
    language TEXT NOT NULL,
    date TEXT NOT NULL,
    xp INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY(language, date)
  );

  CREATE TABLE IF NOT EXISTS item_progress (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    language TEXT NOT NULL,
    category TEXT NOT NULL,
    item_id TEXT NOT NULL,
    objective TEXT NOT NULL,
    ease REAL NOT NULL DEFAULT 1.8,
    streak INTEGER NOT NULL DEFAULT 0,
    attempts INTEGER NOT NULL DEFAULT 0,
    correct INTEGER NOT NULL DEFAULT 0,
    error_count INTEGER NOT NULL DEFAULT 0,
    last_error_type TEXT NOT NULL DEFAULT '',
    last_seen_date TEXT,
    next_due_date TEXT,
    UNIQUE(language, category, item_id)
  );

  CREATE TABLE IF NOT EXISTS attempt_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    language TEXT NOT NULL,
    category TEXT NOT NULL,
    item_id TEXT NOT NULL,
    objective TEXT NOT NULL,
    question_type TEXT NOT NULL,
    correct INTEGER NOT NULL,
    error_type TEXT NOT NULL DEFAULT 'none',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

function ensureSettingsColumns() {
  const columns = db.prepare("PRAGMA table_info(settings)").all();
  const names = new Set(columns.map((column) => column.name));

  if (!names.has("learner_name")) {
    db.exec("ALTER TABLE settings ADD COLUMN learner_name TEXT NOT NULL DEFAULT 'Learner'");
  }

  if (!names.has("learner_bio")) {
    db.exec("ALTER TABLE settings ADD COLUMN learner_bio TEXT NOT NULL DEFAULT ''");
  }

  if (!names.has("focus_area")) {
    db.exec("ALTER TABLE settings ADD COLUMN focus_area TEXT NOT NULL DEFAULT ''");
  }

  if (!names.has("daily_minutes")) {
    db.exec("ALTER TABLE settings ADD COLUMN daily_minutes INTEGER NOT NULL DEFAULT 20");
  }

  if (!names.has("weekly_goal_sessions")) {
    db.exec("ALTER TABLE settings ADD COLUMN weekly_goal_sessions INTEGER NOT NULL DEFAULT 5");
  }

  if (!names.has("self_rated_level")) {
    db.exec("ALTER TABLE settings ADD COLUMN self_rated_level TEXT NOT NULL DEFAULT 'a1'");
  }
}

ensureSettingsColumns();

db.prepare(`
  INSERT OR IGNORE INTO settings (
    id, native_language, target_language, daily_goal, daily_minutes, weekly_goal_sessions,
    self_rated_level, learner_name, learner_bio, focus_area
  )
  VALUES (1, 'english', 'spanish', 30, 20, 5, 'a1', 'Learner', '', '')
`).run();

db.prepare(`
  INSERT OR IGNORE INTO progress (id, total_xp, streak, hearts, learner_level)
  VALUES (1, 0, 0, 5, 1)
`).run();

function toIsoDate(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function addDaysIso(isoDate, days) {
  const parsed = new Date(`${isoDate}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return toIsoDate(parsed);
}

function levelFromMastery(mastery) {
  if (mastery >= 75) return "b2";
  if (mastery >= 50) return "b1";
  if (mastery >= 25) return "a2";
  return "a1";
}

function levelFromXp(totalXp) {
  return Math.max(1, 1 + Math.floor(totalXp / 150));
}

function maybeMigrateLegacyJson() {
  if (!fs.existsSync(legacyJsonPath)) return;

  const hasAnySessions = db.prepare("SELECT COUNT(1) AS count FROM session_history").get().count > 0;
  const progress = db.prepare("SELECT total_xp FROM progress WHERE id = 1").get();
  if (hasAnySessions || progress.total_xp > 0) return;

  try {
    const legacy = JSON.parse(fs.readFileSync(legacyJsonPath, "utf-8"));
    const settings = legacy.settings || {};
    const prog = legacy.progress || {};

    db.prepare(`
      UPDATE settings
      SET native_language = ?,
          target_language = ?,
          daily_goal = ?,
          daily_minutes = 20,
          weekly_goal_sessions = 5,
          self_rated_level = 'a1',
          updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `).run(
      settings.nativeLanguage || "english",
      settings.targetLanguage || "spanish",
      Number.isInteger(settings.dailyGoal) ? settings.dailyGoal : 30
    );

    const totalXp = Number(prog.totalXp || 0);
    db.prepare(`
      UPDATE progress
      SET total_xp = ?, streak = ?, hearts = ?, learner_level = ?, last_completed_date = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `).run(
      totalXp,
      Number(prog.streak || 0),
      Number.isInteger(prog.hearts) ? prog.hearts : 5,
      levelFromXp(totalXp),
      prog.lastCompletedDate || null
    );
  } catch (_err) {
    // Ignore migration errors and continue with clean sqlite state.
  }
}

maybeMigrateLegacyJson();

function getSettings() {
  const row = db.prepare(`
    SELECT native_language, target_language, daily_goal, daily_minutes, weekly_goal_sessions,
           self_rated_level, learner_name, learner_bio, focus_area
    FROM settings
    WHERE id = 1
  `).get();
  return {
    nativeLanguage: row.native_language,
    targetLanguage: row.target_language,
    dailyGoal: row.daily_goal,
    dailyMinutes: row.daily_minutes,
    weeklyGoalSessions: row.weekly_goal_sessions,
    selfRatedLevel: row.self_rated_level,
    learnerName: row.learner_name,
    learnerBio: row.learner_bio,
    focusArea: row.focus_area
  };
}

function saveSettings(nextSettings) {
  db.prepare(`
    UPDATE settings
    SET native_language = ?,
        target_language = ?,
        daily_goal = ?,
        daily_minutes = ?,
        weekly_goal_sessions = ?,
        self_rated_level = ?,
        learner_name = ?,
        learner_bio = ?,
        focus_area = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = 1
  `).run(
    nextSettings.nativeLanguage || "english",
    nextSettings.targetLanguage || "spanish",
    Number.isInteger(nextSettings.dailyGoal) ? nextSettings.dailyGoal : 30,
    Number.isInteger(nextSettings.dailyMinutes) ? nextSettings.dailyMinutes : 20,
    Number.isInteger(nextSettings.weeklyGoalSessions) ? nextSettings.weeklyGoalSessions : 5,
    ["a1", "a2", "b1", "b2"].includes(nextSettings.selfRatedLevel)
      ? nextSettings.selfRatedLevel
      : "a1",
    String(nextSettings.learnerName || "Learner").trim() || "Learner",
    String(nextSettings.learnerBio || "").trim(),
    String(nextSettings.focusArea || "").trim()
  );

  return getSettings();
}

function getCategoryMastery(language, category) {
  const row = db
    .prepare("SELECT mastery FROM category_progress WHERE language = ? AND category = ?")
    .get(language, category);
  return row ? row.mastery : 0;
}

function getCategoryProgress(language) {
  return db
    .prepare(`
      SELECT category, mastery, attempts, total_answers, correct_answers, level_unlocked, last_practiced_at
      FROM category_progress
      WHERE language = ?
    `)
    .all(language)
    .map((row) => ({
      category: row.category,
      mastery: Number(row.mastery.toFixed(1)),
      attempts: row.attempts,
      totalAnswers: row.total_answers,
      correctAnswers: row.correct_answers,
      accuracy: row.total_answers ? Number(((row.correct_answers / row.total_answers) * 100).toFixed(1)) : 0,
      levelUnlocked: row.level_unlocked,
      lastPracticedAt: row.last_practiced_at
    }));
}

function getProgress(language) {
  const row = db
    .prepare("SELECT total_xp, streak, hearts, learner_level, last_completed_date FROM progress WHERE id = 1")
    .get();

  const categories = language ? getCategoryProgress(language) : [];

  return {
    totalXp: row.total_xp,
    todayXp: language ? getTodayXp(language) : 0,
    streak: row.streak,
    hearts: row.hearts,
    learnerLevel: row.learner_level,
    lastCompletedDate: row.last_completed_date,
    categories
  };
}

function getRecentCategoryAccuracy(language, category, limit = 5) {
  const safeLimit = Number.isInteger(limit) ? Math.max(1, Math.min(limit, 15)) : 5;
  const rows = db
    .prepare(`
      SELECT accuracy
      FROM session_history
      WHERE language = ? AND category = ?
      ORDER BY completed_at DESC
      LIMIT ?
    `)
    .all(language, category, safeLimit);

  if (!rows.length) return null;
  const avg = rows.reduce((sum, row) => sum + row.accuracy, 0) / rows.length;
  return Number(avg.toFixed(4));
}

function createActiveSession({ sessionId, language, category, difficultyLevel, questions, expiresAt }) {
  db.prepare(`
    INSERT INTO active_sessions (
      session_id, language, category, difficulty_level, questions_json, expires_at, completed
    )
    VALUES (?, ?, ?, ?, ?, ?, 0)
  `).run(
    sessionId,
    language,
    category,
    difficultyLevel,
    JSON.stringify(questions),
    expiresAt
  );
}

function getActiveSession(sessionId) {
  const row = db.prepare(`
    SELECT session_id, language, category, difficulty_level, questions_json, expires_at, completed
    FROM active_sessions
    WHERE session_id = ?
  `).get(sessionId);
  if (!row) return null;
  return {
    sessionId: row.session_id,
    language: row.language,
    category: row.category,
    difficultyLevel: row.difficulty_level,
    questions: JSON.parse(row.questions_json),
    expiresAt: row.expires_at,
    completed: Boolean(row.completed)
  };
}

function markActiveSessionCompleted(sessionId) {
  db.prepare(`
    UPDATE active_sessions
    SET completed = 1,
        completed_at = CURRENT_TIMESTAMP
    WHERE session_id = ?
  `).run(sessionId);
}

function pruneExpiredActiveSessions(todayIso = toIsoDate()) {
  db.prepare(`
    DELETE FROM active_sessions
    WHERE completed = 1 OR expires_at < ?
  `).run(todayIso);
}

function upsertItemProgressAttempt({
  language,
  category,
  itemId,
  objective,
  correct,
  errorType,
  today
}) {
  const existing = db.prepare(`
    SELECT ease, streak, attempts, correct, error_count
    FROM item_progress
    WHERE language = ? AND category = ? AND item_id = ?
  `).get(language, category, itemId);

  const previousEase = existing ? existing.ease : 1.8;
  const previousStreak = existing ? existing.streak : 0;
  const nextEase = correct
    ? Math.min(2.5, Number((previousEase + 0.05).toFixed(2)))
    : Math.max(1.3, Number((previousEase - 0.2).toFixed(2)));
  const nextStreak = correct ? previousStreak + 1 : 0;
  const intervalDays = correct
    ? Math.max(1, Math.round(nextStreak * nextEase))
    : 1;
  const nextDueDate = addDaysIso(today, intervalDays);

  if (!existing) {
    db.prepare(`
      INSERT INTO item_progress (
        language, category, item_id, objective, ease, streak, attempts, correct, error_count,
        last_error_type, last_seen_date, next_due_date
      )
      VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)
    `).run(
      language,
      category,
      itemId,
      objective || "",
      nextEase,
      nextStreak,
      correct ? 1 : 0,
      correct ? 0 : 1,
      correct ? "" : (errorType || "unknown"),
      today,
      nextDueDate
    );
    return;
  }

  db.prepare(`
    UPDATE item_progress
    SET objective = ?,
        ease = ?,
        streak = ?,
        attempts = ?,
        correct = ?,
        error_count = ?,
        last_error_type = ?,
        last_seen_date = ?,
        next_due_date = ?
    WHERE language = ? AND category = ? AND item_id = ?
  `).run(
    objective || "",
    nextEase,
    nextStreak,
    existing.attempts + 1,
    existing.correct + (correct ? 1 : 0),
    existing.error_count + (correct ? 0 : 1),
    correct ? "" : (errorType || "unknown"),
    today,
    nextDueDate,
    language,
    category,
    itemId
  );
}

function recordAttemptHistory({
  sessionId,
  language,
  category,
  itemId,
  objective,
  questionType,
  correct,
  errorType
}) {
  db.prepare(`
    INSERT INTO attempt_history (
      session_id, language, category, item_id, objective, question_type, correct, error_type
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    sessionId,
    language,
    category,
    itemId,
    objective || "",
    questionType || "",
    correct ? 1 : 0,
    errorType || (correct ? "none" : "unknown")
  );
}

function addDailyXp(language, date, xpGained) {
  const safeXp = Number.isFinite(xpGained) ? Math.max(0, Math.floor(xpGained)) : 0;
  db.prepare(`
    INSERT INTO daily_xp (language, date, xp)
    VALUES (?, ?, ?)
    ON CONFLICT(language, date) DO UPDATE SET xp = xp + excluded.xp
  `).run(language, date, safeXp);
}

function getTodayXp(language, today = toIsoDate()) {
  const row = db.prepare(`
    SELECT xp
    FROM daily_xp
    WHERE language = ? AND date = ?
  `).get(language, today);
  return row ? row.xp : 0;
}

function getItemSelectionHints(language, category, today = toIsoDate()) {
  const dueRows = db.prepare(`
    SELECT item_id
    FROM item_progress
    WHERE language = ? AND category = ? AND (next_due_date IS NULL OR next_due_date <= ?)
    ORDER BY next_due_date ASC, error_count DESC
    LIMIT 20
  `).all(language, category, today);

  const weakRows = db.prepare(`
    SELECT item_id
    FROM item_progress
    WHERE language = ? AND category = ?
    ORDER BY
      CASE WHEN attempts > 0 THEN CAST(correct AS REAL) / attempts ELSE 0 END ASC,
      error_count DESC
    LIMIT 20
  `).all(language, category);

  return {
    dueItemIds: dueRows.map((row) => row.item_id),
    weakItemIds: weakRows.map((row) => row.item_id)
  };
}

function getStats(language) {
  const settings = getSettings();
  const progress = getProgress(language);
  const categoryProgress = getCategoryProgress(language);

  const totals = db
    .prepare(`
      SELECT
        COUNT(1) AS sessions_completed,
        COALESCE(AVG(accuracy), 0) AS avg_accuracy,
        COALESCE(SUM(xp_gained), 0) AS total_xp_from_sessions
      FROM session_history
      WHERE language = ?
    `)
    .get(language);

  const recentSessions = db
    .prepare(`
      SELECT COUNT(1) AS sessions_last_7_days
      FROM session_history
      WHERE language = ? AND DATE(completed_at) >= DATE('now', '-6 days')
    `)
    .get(language);

  const categoryStats = db
    .prepare(`
      SELECT
        category,
        COUNT(1) AS sessions,
        COALESCE(AVG(accuracy), 0) AS accuracy,
        MAX(completed_at) AS last_completed_at
      FROM session_history
      WHERE language = ?
      GROUP BY category
      ORDER BY sessions DESC, accuracy DESC
    `)
    .all(language)
    .map((row) => ({
      category: row.category,
      sessions: row.sessions,
      accuracy: Number((row.accuracy * 100).toFixed(1)),
      lastCompletedAt: row.last_completed_at
    }));

  const errorTypeTrend = db
    .prepare(`
      SELECT error_type, COUNT(1) AS count
      FROM attempt_history
      WHERE language = ? AND correct = 0 AND DATE(created_at) >= DATE('now', '-13 days')
      GROUP BY error_type
      ORDER BY count DESC
      LIMIT 6
    `)
    .all(language)
    .map((row) => ({ errorType: row.error_type, count: row.count }));

  const objectiveStats = db
    .prepare(`
      SELECT
        objective,
        COUNT(1) AS attempts,
        SUM(correct) AS correct
      FROM attempt_history
      WHERE language = ? AND objective <> ''
      GROUP BY objective
      HAVING attempts > 0
      ORDER BY CAST(correct AS REAL) / attempts ASC, attempts DESC
      LIMIT 8
    `)
    .all(language)
    .map((row) => ({
      objective: row.objective,
      attempts: row.attempts,
      accuracy: Number(((row.correct / row.attempts) * 100).toFixed(1))
    }));

  const masteredCount = categoryProgress.filter((item) => item.mastery >= 75).length;
  const completionPercent = categoryProgress.length
    ? Math.round(categoryProgress.reduce((sum, item) => sum + item.mastery, 0) / categoryProgress.length)
    : 0;
  const accuracyPercent = categoryProgress.length
    ? Math.round(categoryProgress.reduce((sum, item) => sum + item.accuracy, 0) / categoryProgress.length)
    : 0;

  const weakestCategories = [...categoryProgress]
    .filter((item) => item.attempts > 0)
    .sort((a, b) => a.accuracy - b.accuracy || a.mastery - b.mastery)
    .slice(0, 2)
    .map((item) => item.category);

  const weeklyGoalProgress = settings.weeklyGoalSessions > 0
    ? Math.min(100, Math.round((recentSessions.sessions_last_7_days / settings.weeklyGoalSessions) * 100))
    : 0;

  return {
    sessionsCompleted: totals.sessions_completed,
    sessionsLast7Days: recentSessions.sessions_last_7_days,
    avgSessionAccuracy: Number((totals.avg_accuracy * 100).toFixed(1)),
    totalXpFromSessions: totals.total_xp_from_sessions,
    completionPercent,
    accuracyPercent,
    masteredCount,
    categoryCount: categoryProgress.length,
    streak: progress.streak,
    weeklyGoalProgress,
    weeklyGoalSessions: settings.weeklyGoalSessions,
    weakestCategories,
    categoryStats,
    errorTypeTrend,
    objectiveStats
  };
}

function recordSession({ language, category, score, maxScore, mistakes, xpGained, difficultyLevel, today }) {
  const accuracy = maxScore > 0 ? score / maxScore : 0;

  const existing = db
    .prepare(`
      SELECT mastery, attempts, total_answers, correct_answers
      FROM category_progress
      WHERE language = ? AND category = ?
    `)
    .get(language, category);

  const oldMastery = existing ? existing.mastery : 0;
  const masteryDelta = ((accuracy - 0.6) * 28) + (difficultyLevel === "b2" ? 4 : difficultyLevel === "b1" ? 2 : 0);
  const newMastery = Math.max(0, Math.min(100, oldMastery + masteryDelta));
  const levelUnlocked = levelFromMastery(newMastery);

  if (!existing) {
    db.prepare(`
      INSERT INTO category_progress (
        language, category, mastery, attempts, total_answers, correct_answers, level_unlocked, last_practiced_at
      )
      VALUES (?, ?, ?, 1, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(language, category, newMastery, maxScore, score, levelUnlocked);
  } else {
    db.prepare(`
      UPDATE category_progress
      SET mastery = ?,
          attempts = ?,
          total_answers = ?,
          correct_answers = ?,
          level_unlocked = ?,
          last_practiced_at = CURRENT_TIMESTAMP
      WHERE language = ? AND category = ?
    `).run(
      newMastery,
      existing.attempts + 1,
      existing.total_answers + maxScore,
      existing.correct_answers + score,
      levelUnlocked,
      language,
      category
    );
  }

  db.prepare(`
    INSERT INTO session_history (language, category, score, max_score, accuracy, xp_gained, difficulty_level)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(language, category, score, maxScore, accuracy, xpGained, difficultyLevel);

  const progress = db
    .prepare("SELECT total_xp, streak, hearts, last_completed_date FROM progress WHERE id = 1")
    .get();

  let nextStreak = progress.streak;
  if (!progress.last_completed_date) {
    nextStreak = 1;
  } else {
    const last = new Date(progress.last_completed_date + "T00:00:00Z");
    const current = new Date(today + "T00:00:00Z");
    const diffDays = Math.floor((current - last) / (24 * 60 * 60 * 1000));
    if (diffDays === 1) {
      nextStreak = progress.streak + 1;
    } else if (diffDays > 1) {
      nextStreak = 1;
    }
  }

  const safeMistakes = Number.isFinite(mistakes) ? Math.max(0, Math.floor(mistakes)) : 0;
  const lostHearts = Math.floor(safeMistakes / 3);
  const nextHearts = Math.max(0, progress.hearts - lostHearts);
  const totalXp = progress.total_xp + xpGained;
  const learnerLevel = levelFromXp(totalXp);
  addDailyXp(language, today, xpGained);

  db.prepare(`
    UPDATE progress
    SET total_xp = ?,
        streak = ?,
        hearts = ?,
        learner_level = ?,
        last_completed_date = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = 1
  `).run(totalXp, nextStreak, nextHearts, learnerLevel, today);

  return {
    xpGained,
    streak: nextStreak,
    hearts: nextHearts,
    learnerLevel,
    mastery: Number(newMastery.toFixed(1)),
    levelUnlocked
  };
}

module.exports = {
  getSettings,
  saveSettings,
  getCategoryMastery,
  getCategoryProgress,
  getRecentCategoryAccuracy,
  createActiveSession,
  getActiveSession,
  markActiveSessionCompleted,
  pruneExpiredActiveSessions,
  upsertItemProgressAttempt,
  recordAttemptHistory,
  getItemSelectionHints,
  getTodayXp,
  getProgress,
  getStats,
  recordSession,
  addDailyXp,
  toIsoDate
};
