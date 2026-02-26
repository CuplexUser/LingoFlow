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

db.pragma("foreign_keys = ON");
db.pragma("journal_mode = WAL");

function tableExists(tableName) {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(tableName);
  return Boolean(row);
}

function tableHasColumn(tableName, columnName) {
  if (!tableExists(tableName)) return false;
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  return columns.some((column) => column.name === columnName);
}

function createUsersTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL DEFAULT 'Learner',
      email_verified INTEGER NOT NULL DEFAULT 0,
      auth_provider TEXT NOT NULL DEFAULT 'local',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

function ensureUsersColumns() {
  const columns = db.prepare("PRAGMA table_info(users)").all();
  const names = new Set(columns.map((column) => column.name));

  if (!names.has("email_verified")) {
    db.exec("ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0");
  }

  if (!names.has("auth_provider")) {
    db.exec("ALTER TABLE users ADD COLUMN auth_provider TEXT NOT NULL DEFAULT 'local'");
  }
}

function migrateLegacySingleUserSchema() {
  if (!tableExists("settings") || tableHasColumn("settings", "user_id")) return;

  const runMigration = db.transaction(() => {
    createUsersTable();
    db.prepare(`
      INSERT OR IGNORE INTO users (id, email, password_hash, display_name)
      VALUES (1, 'local@lingoflow.dev', 'local-user-no-password', 'Learner')
    `).run();

    db.exec(`
      ALTER TABLE settings RENAME TO settings_legacy;
      CREATE TABLE settings (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
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
      INSERT INTO settings (
        user_id, native_language, target_language, daily_goal, daily_minutes, weekly_goal_sessions,
        self_rated_level, learner_name, learner_bio, focus_area, updated_at
      )
      SELECT
        1,
        native_language,
        target_language,
        daily_goal,
        COALESCE(daily_minutes, 20),
        COALESCE(weekly_goal_sessions, 5),
        COALESCE(self_rated_level, 'a1'),
        COALESCE(learner_name, 'Learner'),
        COALESCE(learner_bio, ''),
        COALESCE(focus_area, ''),
        COALESCE(updated_at, CURRENT_TIMESTAMP)
      FROM settings_legacy
      LIMIT 1;
      DROP TABLE settings_legacy;
    `);

    db.exec(`
      ALTER TABLE progress RENAME TO progress_legacy;
      CREATE TABLE progress (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        total_xp INTEGER NOT NULL DEFAULT 0,
        streak INTEGER NOT NULL DEFAULT 0,
        hearts INTEGER NOT NULL DEFAULT 5,
        learner_level INTEGER NOT NULL DEFAULT 1,
        last_completed_date TEXT,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO progress (
        user_id, total_xp, streak, hearts, learner_level, last_completed_date, updated_at
      )
      SELECT
        1,
        COALESCE(total_xp, 0),
        COALESCE(streak, 0),
        COALESCE(hearts, 5),
        COALESCE(learner_level, 1),
        last_completed_date,
        COALESCE(updated_at, CURRENT_TIMESTAMP)
      FROM progress_legacy
      LIMIT 1;
      DROP TABLE progress_legacy;
    `);

    if (tableExists("category_progress")) {
      db.exec(`
        ALTER TABLE category_progress RENAME TO category_progress_legacy;
        CREATE TABLE category_progress (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          language TEXT NOT NULL,
          category TEXT NOT NULL,
          mastery REAL NOT NULL DEFAULT 0,
          attempts INTEGER NOT NULL DEFAULT 0,
          total_answers INTEGER NOT NULL DEFAULT 0,
          correct_answers INTEGER NOT NULL DEFAULT 0,
          level_unlocked TEXT NOT NULL DEFAULT 'a1',
          last_practiced_at TEXT,
          UNIQUE(user_id, language, category)
        );
        INSERT INTO category_progress (
          user_id, language, category, mastery, attempts, total_answers, correct_answers, level_unlocked, last_practiced_at
        )
        SELECT
          1, language, category, mastery, attempts, total_answers, correct_answers, level_unlocked, last_practiced_at
        FROM category_progress_legacy;
        DROP TABLE category_progress_legacy;
      `);
    }

    if (tableExists("session_history")) {
      db.exec(`
        ALTER TABLE session_history RENAME TO session_history_legacy;
        CREATE TABLE session_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          language TEXT NOT NULL,
          category TEXT NOT NULL,
          score INTEGER NOT NULL,
          max_score INTEGER NOT NULL,
          accuracy REAL NOT NULL,
          xp_gained INTEGER NOT NULL,
          difficulty_level TEXT NOT NULL,
          completed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        INSERT INTO session_history (
          user_id, language, category, score, max_score, accuracy, xp_gained, difficulty_level, completed_at
        )
        SELECT
          1, language, category, score, max_score, accuracy, xp_gained, difficulty_level, completed_at
        FROM session_history_legacy;
        DROP TABLE session_history_legacy;
      `);
    }

    if (tableExists("active_sessions")) {
      db.exec(`
        ALTER TABLE active_sessions RENAME TO active_sessions_legacy;
        CREATE TABLE active_sessions (
          session_id TEXT PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          language TEXT NOT NULL,
          category TEXT NOT NULL,
          difficulty_level TEXT NOT NULL,
          questions_json TEXT NOT NULL,
          expires_at TEXT NOT NULL,
          completed INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          completed_at TEXT
        );
        INSERT INTO active_sessions (
          session_id, user_id, language, category, difficulty_level, questions_json, expires_at, completed, created_at, completed_at
        )
        SELECT
          session_id, 1, language, category, difficulty_level, questions_json, expires_at, completed, created_at, completed_at
        FROM active_sessions_legacy;
        DROP TABLE active_sessions_legacy;
      `);
    }

    if (tableExists("daily_xp")) {
      db.exec(`
        ALTER TABLE daily_xp RENAME TO daily_xp_legacy;
        CREATE TABLE daily_xp (
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          language TEXT NOT NULL,
          date TEXT NOT NULL,
          xp INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY(user_id, language, date)
        );
        INSERT INTO daily_xp (user_id, language, date, xp)
        SELECT 1, language, date, xp
        FROM daily_xp_legacy;
        DROP TABLE daily_xp_legacy;
      `);
    }

    if (tableExists("item_progress")) {
      db.exec(`
        ALTER TABLE item_progress RENAME TO item_progress_legacy;
        CREATE TABLE item_progress (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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
          UNIQUE(user_id, language, category, item_id)
        );
        INSERT INTO item_progress (
          user_id, language, category, item_id, objective, ease, streak, attempts, correct, error_count, last_error_type, last_seen_date, next_due_date
        )
        SELECT
          1, language, category, item_id, objective, ease, streak, attempts, correct, error_count, last_error_type, last_seen_date, next_due_date
        FROM item_progress_legacy;
        DROP TABLE item_progress_legacy;
      `);
    }

    if (tableExists("attempt_history")) {
      db.exec(`
        ALTER TABLE attempt_history RENAME TO attempt_history_legacy;
        CREATE TABLE attempt_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_id TEXT NOT NULL,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          language TEXT NOT NULL,
          category TEXT NOT NULL,
          item_id TEXT NOT NULL,
          objective TEXT NOT NULL,
          question_type TEXT NOT NULL,
          correct INTEGER NOT NULL,
          error_type TEXT NOT NULL DEFAULT 'none',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        INSERT INTO attempt_history (
          session_id, user_id, language, category, item_id, objective, question_type, correct, error_type, created_at
        )
        SELECT
          session_id, 1, language, category, item_id, objective, question_type, correct, error_type, created_at
        FROM attempt_history_legacy;
        DROP TABLE attempt_history_legacy;
      `);
    }
  });

  runMigration();
}

migrateLegacySingleUserSchema();

createUsersTable();
ensureUsersColumns();

db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
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
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    total_xp INTEGER NOT NULL DEFAULT 0,
    streak INTEGER NOT NULL DEFAULT 0,
    hearts INTEGER NOT NULL DEFAULT 5,
    learner_level INTEGER NOT NULL DEFAULT 1,
    last_completed_date TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS category_progress (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    language TEXT NOT NULL,
    category TEXT NOT NULL,
    mastery REAL NOT NULL DEFAULT 0,
    attempts INTEGER NOT NULL DEFAULT 0,
    total_answers INTEGER NOT NULL DEFAULT 0,
    correct_answers INTEGER NOT NULL DEFAULT 0,
    level_unlocked TEXT NOT NULL DEFAULT 'a1',
    last_practiced_at TEXT,
    UNIQUE(user_id, language, category)
  );

  CREATE TABLE IF NOT EXISTS session_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    language TEXT NOT NULL,
    date TEXT NOT NULL,
    xp INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY(user_id, language, date)
  );

  CREATE TABLE IF NOT EXISTS item_progress (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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
    UNIQUE(user_id, language, category, item_id)
  );

  CREATE TABLE IF NOT EXISTS attempt_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    language TEXT NOT NULL,
    category TEXT NOT NULL,
    item_id TEXT NOT NULL,
    objective TEXT NOT NULL,
    question_type TEXT NOT NULL,
    correct INTEGER NOT NULL,
    error_type TEXT NOT NULL DEFAULT 'none',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS email_verifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    consumed_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_session_history_user_language_completed
  ON session_history(user_id, language, completed_at DESC);
  CREATE INDEX IF NOT EXISTS idx_attempt_history_user_language_created
  ON attempt_history(user_id, language, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_category_progress_user_language
  ON category_progress(user_id, language);
  CREATE INDEX IF NOT EXISTS idx_item_progress_user_language_category
  ON item_progress(user_id, language, category);
  CREATE INDEX IF NOT EXISTS idx_active_sessions_user
  ON active_sessions(user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_email_verifications_token
  ON email_verifications(token);
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
  INSERT OR IGNORE INTO users (id, email, password_hash, display_name, email_verified, auth_provider)
  VALUES (1, 'local@lingoflow.dev', 'local-user-no-password', 'Learner', 1, 'local')
`).run();

function ensureUserState(userId = 1) {
  db.prepare(`
    INSERT OR IGNORE INTO settings (
      user_id, native_language, target_language, daily_goal, daily_minutes, weekly_goal_sessions,
      self_rated_level, learner_name, learner_bio, focus_area
    )
    VALUES (?, 'english', 'spanish', 30, 20, 5, 'a1', 'Learner', '', '')
  `).run(userId);

  db.prepare(`
    INSERT OR IGNORE INTO progress (user_id, total_xp, streak, hearts, learner_level)
    VALUES (?, 0, 0, 5, 1)
  `).run(userId);
}

ensureUserState(1);
db.prepare("UPDATE users SET email_verified = 1, auth_provider = 'local' WHERE id = 1").run();

function toIsoDate(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function toIsoDateTime(date = new Date()) {
  return date.toISOString();
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

  ensureUserState(1);

  const hasAnySessions = db.prepare(`
    SELECT COUNT(1) AS count
    FROM session_history
    WHERE user_id = 1
  `).get().count > 0;
  const progress = db.prepare("SELECT total_xp FROM progress WHERE user_id = 1").get();
  if (hasAnySessions || (progress && progress.total_xp > 0)) return;

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
      WHERE user_id = 1
    `).run(
      settings.nativeLanguage || "english",
      settings.targetLanguage || "spanish",
      Number.isInteger(settings.dailyGoal) ? settings.dailyGoal : 30
    );

    const totalXp = Number(prog.totalXp || 0);
    db.prepare(`
      UPDATE progress
      SET total_xp = ?, streak = ?, hearts = ?, learner_level = ?, last_completed_date = ?, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = 1
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

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function getUserByEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  const row = db.prepare(`
    SELECT id, email, password_hash, display_name, email_verified, auth_provider
    FROM users
    WHERE email = ?
  `).get(normalized);
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    displayName: row.display_name,
    emailVerified: Boolean(row.email_verified),
    authProvider: row.auth_provider
  };
}

function getUserById(userId) {
  const row = db.prepare(`
    SELECT id, email, display_name, email_verified, auth_provider
    FROM users
    WHERE id = ?
  `).get(userId);
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    emailVerified: Boolean(row.email_verified),
    authProvider: row.auth_provider
  };
}

function createUser({ email, passwordHash, displayName, emailVerified = false, authProvider = "local" }) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !passwordHash) return null;
  const safeName = String(displayName || "Learner").trim() || "Learner";
  const insert = db.prepare(`
    INSERT INTO users (email, password_hash, display_name, email_verified, auth_provider)
    VALUES (?, ?, ?, ?, ?)
  `).run(normalizedEmail, passwordHash, safeName, emailVerified ? 1 : 0, authProvider);
  const userId = Number(insert.lastInsertRowid);
  ensureUserState(userId);
  return getUserById(userId);
}

function createEmailVerification({ userId, token, expiresAt }) {
  db.prepare(`
    INSERT INTO email_verifications (user_id, token, expires_at)
    VALUES (?, ?, ?)
  `).run(userId, token, expiresAt);
}

function consumeEmailVerificationToken(token, nowIso = toIsoDateTime()) {
  const row = db.prepare(`
    SELECT id, user_id, expires_at, consumed_at
    FROM email_verifications
    WHERE token = ?
  `).get(String(token || ""));
  if (!row) return null;
  if (row.consumed_at) return null;
  if (row.expires_at < nowIso) return null;

  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE email_verifications
      SET consumed_at = ?
      WHERE id = ?
    `).run(nowIso, row.id);

    db.prepare(`
      UPDATE users
      SET email_verified = 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(row.user_id);
  });

  tx();
  return getUserById(row.user_id);
}

function markUserEmailVerified(userId) {
  db.prepare(`
    UPDATE users
    SET email_verified = 1,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(userId);
}

function getSettings(userId = 1) {
  ensureUserState(userId);
  const row = db.prepare(`
    SELECT native_language, target_language, daily_goal, daily_minutes, weekly_goal_sessions,
           self_rated_level, learner_name, learner_bio, focus_area
    FROM settings
    WHERE user_id = ?
  `).get(userId);
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

function saveSettings(userId = 1, nextSettings = {}) {
  ensureUserState(userId);
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
    WHERE user_id = ?
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
    String(nextSettings.focusArea || "").trim(),
    userId
  );

  return getSettings(userId);
}

function getCategoryMastery(userId = 1, language, category) {
  const row = db
    .prepare("SELECT mastery FROM category_progress WHERE user_id = ? AND language = ? AND category = ?")
    .get(userId, language, category);
  return row ? row.mastery : 0;
}

function getCategoryProgress(userId = 1, language) {
  return db
    .prepare(`
      SELECT category, mastery, attempts, total_answers, correct_answers, level_unlocked, last_practiced_at
      FROM category_progress
      WHERE user_id = ? AND language = ?
    `)
    .all(userId, language)
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

function getProgress(userId = 1, language) {
  ensureUserState(userId);
  const row = db
    .prepare(`
      SELECT total_xp, streak, hearts, learner_level, last_completed_date
      FROM progress
      WHERE user_id = ?
    `)
    .get(userId);

  const categories = language ? getCategoryProgress(userId, language) : [];

  return {
    totalXp: row.total_xp,
    todayXp: language ? getTodayXp(userId, language) : 0,
    streak: row.streak,
    hearts: row.hearts,
    learnerLevel: row.learner_level,
    lastCompletedDate: row.last_completed_date,
    categories
  };
}

function getRecentCategoryAccuracy(userId = 1, language, category, limit = 5) {
  const safeLimit = Number.isInteger(limit) ? Math.max(1, Math.min(limit, 15)) : 5;
  const rows = db
    .prepare(`
      SELECT accuracy
      FROM session_history
      WHERE user_id = ? AND language = ? AND category = ?
      ORDER BY completed_at DESC
      LIMIT ?
    `)
    .all(userId, language, category, safeLimit);

  if (!rows.length) return null;
  const avg = rows.reduce((sum, row) => sum + row.accuracy, 0) / rows.length;
  return Number(avg.toFixed(4));
}

function createActiveSession({
  userId = 1,
  sessionId,
  language,
  category,
  difficultyLevel,
  questions,
  expiresAt
}) {
  ensureUserState(userId);
  db.prepare(`
    INSERT INTO active_sessions (
      session_id, user_id, language, category, difficulty_level, questions_json, expires_at, completed
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, 0)
  `).run(
    sessionId,
    userId,
    language,
    category,
    difficultyLevel,
    JSON.stringify(questions),
    expiresAt
  );
}

function getActiveSession(sessionId, userId = 1) {
  const row = db.prepare(`
    SELECT session_id, user_id, language, category, difficulty_level, questions_json, expires_at, completed
    FROM active_sessions
    WHERE session_id = ? AND user_id = ?
  `).get(sessionId, userId);
  if (!row) return null;
  return {
    sessionId: row.session_id,
    userId: row.user_id,
    language: row.language,
    category: row.category,
    difficultyLevel: row.difficulty_level,
    questions: JSON.parse(row.questions_json),
    expiresAt: row.expires_at,
    completed: Boolean(row.completed)
  };
}

function markActiveSessionCompleted(sessionId, userId = 1) {
  db.prepare(`
    UPDATE active_sessions
    SET completed = 1,
        completed_at = CURRENT_TIMESTAMP
    WHERE session_id = ? AND user_id = ?
  `).run(sessionId, userId);
}

function pruneExpiredActiveSessions(userId = 1, todayIso = toIsoDate()) {
  db.prepare(`
    DELETE FROM active_sessions
    WHERE user_id = ? AND (completed = 1 OR expires_at < ?)
  `).run(userId, todayIso);
}

function upsertItemProgressAttempt({
  userId = 1,
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
    WHERE user_id = ? AND language = ? AND category = ? AND item_id = ?
  `).get(userId, language, category, itemId);

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
        user_id, language, category, item_id, objective, ease, streak, attempts, correct, error_count,
        last_error_type, last_seen_date, next_due_date
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)
    `).run(
      userId,
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
    WHERE user_id = ? AND language = ? AND category = ? AND item_id = ?
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
    userId,
    language,
    category,
    itemId
  );
}

function recordAttemptHistory({
  userId = 1,
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
      session_id, user_id, language, category, item_id, objective, question_type, correct, error_type
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    sessionId,
    userId,
    language,
    category,
    itemId,
    objective || "",
    questionType || "",
    correct ? 1 : 0,
    errorType || (correct ? "none" : "unknown")
  );
}

function addDailyXp(userId = 1, language, date, xpGained) {
  const safeXp = Number.isFinite(xpGained) ? Math.max(0, Math.floor(xpGained)) : 0;
  db.prepare(`
    INSERT INTO daily_xp (user_id, language, date, xp)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, language, date) DO UPDATE SET xp = xp + excluded.xp
  `).run(userId, language, date, safeXp);
}

function getTodayXp(userId = 1, language, today = toIsoDate()) {
  const row = db.prepare(`
    SELECT xp
    FROM daily_xp
    WHERE user_id = ? AND language = ? AND date = ?
  `).get(userId, language, today);
  return row ? row.xp : 0;
}

function getItemSelectionHints(userId = 1, language, category, today = toIsoDate()) {
  const dueRows = db.prepare(`
    SELECT item_id
    FROM item_progress
    WHERE user_id = ? AND language = ? AND category = ? AND (next_due_date IS NULL OR next_due_date <= ?)
    ORDER BY next_due_date ASC, error_count DESC
    LIMIT 20
  `).all(userId, language, category, today);

  const weakRows = db.prepare(`
    SELECT item_id
    FROM item_progress
    WHERE user_id = ? AND language = ? AND category = ?
    ORDER BY
      CASE WHEN attempts > 0 THEN CAST(correct AS REAL) / attempts ELSE 0 END ASC,
      error_count DESC
    LIMIT 20
  `).all(userId, language, category);

  return {
    dueItemIds: dueRows.map((row) => row.item_id),
    weakItemIds: weakRows.map((row) => row.item_id)
  };
}

function getStats(userId = 1, language) {
  const settings = getSettings(userId);
  const progress = getProgress(userId, language);
  const categoryProgress = getCategoryProgress(userId, language);

  const totals = db
    .prepare(`
      SELECT
        COUNT(1) AS sessions_completed,
        COALESCE(AVG(accuracy), 0) AS avg_accuracy,
        COALESCE(SUM(xp_gained), 0) AS total_xp_from_sessions
      FROM session_history
      WHERE user_id = ? AND language = ?
    `)
    .get(userId, language);

  const recentSessions = db
    .prepare(`
      SELECT COUNT(1) AS sessions_last_7_days
      FROM session_history
      WHERE user_id = ? AND language = ? AND DATE(completed_at) >= DATE('now', '-6 days')
    `)
    .get(userId, language);

  const categoryStats = db
    .prepare(`
      SELECT
        category,
        COUNT(1) AS sessions,
        COALESCE(AVG(accuracy), 0) AS accuracy,
        MAX(completed_at) AS last_completed_at
      FROM session_history
      WHERE user_id = ? AND language = ?
      GROUP BY category
      ORDER BY sessions DESC, accuracy DESC
    `)
    .all(userId, language)
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
      WHERE user_id = ? AND language = ? AND correct = 0 AND DATE(created_at) >= DATE('now', '-13 days')
      GROUP BY error_type
      ORDER BY count DESC
      LIMIT 6
    `)
    .all(userId, language)
    .map((row) => ({ errorType: row.error_type, count: row.count }));

  const objectiveStats = db
    .prepare(`
      SELECT
        objective,
        COUNT(1) AS attempts,
        SUM(correct) AS correct
      FROM attempt_history
      WHERE user_id = ? AND language = ? AND objective <> ''
      GROUP BY objective
      HAVING attempts > 0
      ORDER BY CAST(correct AS REAL) / attempts ASC, attempts DESC
      LIMIT 8
    `)
    .all(userId, language)
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

function recordSession({
  userId = 1,
  language,
  category,
  score,
  maxScore,
  mistakes,
  xpGained,
  difficultyLevel,
  today
}) {
  ensureUserState(userId);
  const accuracy = maxScore > 0 ? score / maxScore : 0;

  const existing = db
    .prepare(`
      SELECT mastery, attempts, total_answers, correct_answers
      FROM category_progress
      WHERE user_id = ? AND language = ? AND category = ?
    `)
    .get(userId, language, category);

  const oldMastery = existing ? existing.mastery : 0;
  const masteryDelta = ((accuracy - 0.6) * 28) + (difficultyLevel === "b2" ? 4 : difficultyLevel === "b1" ? 2 : 0);
  const newMastery = Math.max(0, Math.min(100, oldMastery + masteryDelta));
  const levelUnlocked = levelFromMastery(newMastery);

  if (!existing) {
    db.prepare(`
      INSERT INTO category_progress (
        user_id, language, category, mastery, attempts, total_answers, correct_answers, level_unlocked, last_practiced_at
      )
      VALUES (?, ?, ?, ?, 1, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(userId, language, category, newMastery, maxScore, score, levelUnlocked);
  } else {
    db.prepare(`
      UPDATE category_progress
      SET mastery = ?,
          attempts = ?,
          total_answers = ?,
          correct_answers = ?,
          level_unlocked = ?,
          last_practiced_at = CURRENT_TIMESTAMP
      WHERE user_id = ? AND language = ? AND category = ?
    `).run(
      newMastery,
      existing.attempts + 1,
      existing.total_answers + maxScore,
      existing.correct_answers + score,
      levelUnlocked,
      userId,
      language,
      category
    );
  }

  db.prepare(`
    INSERT INTO session_history (user_id, language, category, score, max_score, accuracy, xp_gained, difficulty_level)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(userId, language, category, score, maxScore, accuracy, xpGained, difficultyLevel);

  const progress = db
    .prepare("SELECT total_xp, streak, hearts, last_completed_date FROM progress WHERE user_id = ?")
    .get(userId);

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
  addDailyXp(userId, language, today, xpGained);

  db.prepare(`
    UPDATE progress
    SET total_xp = ?,
        streak = ?,
        hearts = ?,
        learner_level = ?,
        last_completed_date = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ?
  `).run(totalXp, nextStreak, nextHearts, learnerLevel, today, userId);

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
  getUserByEmail,
  getUserById,
  createUser,
  createEmailVerification,
  consumeEmailVerificationToken,
  markUserEmailVerified,
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
  toIsoDate,
  toIsoDateTime
};
