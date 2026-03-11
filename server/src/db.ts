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
        beta_lessons_enabled INTEGER NOT NULL DEFAULT 0,
        unlock_all_lessons INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO settings (
        user_id, native_language, target_language, daily_goal, daily_minutes, weekly_goal_sessions,
        self_rated_level, learner_name, learner_bio, focus_area, beta_lessons_enabled, unlock_all_lessons, updated_at
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
        0,
        0,
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
        learner_level INTEGER NOT NULL DEFAULT 1,
        last_completed_date TEXT,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO progress (
        user_id, total_xp, streak, learner_level, last_completed_date, updated_at
      )
      SELECT
        1,
        COALESCE(total_xp, 0),
        COALESCE(streak, 0),
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
    beta_lessons_enabled INTEGER NOT NULL DEFAULT 0,
    unlock_all_lessons INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS progress (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    total_xp INTEGER NOT NULL DEFAULT 0,
    streak INTEGER NOT NULL DEFAULT 0,
    learner_level INTEGER NOT NULL DEFAULT 1,
    last_completed_date TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS language_progress (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    language TEXT NOT NULL,
    total_xp INTEGER NOT NULL DEFAULT 0,
    streak INTEGER NOT NULL DEFAULT 0,
    learner_level INTEGER NOT NULL DEFAULT 1,
    last_completed_date TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, language)
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

  CREATE TABLE IF NOT EXISTS password_resets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    consumed_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS exercise_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    language TEXT NOT NULL,
    category TEXT NOT NULL,
    item_id TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    correct_attempts INTEGER NOT NULL DEFAULT 0,
    completion_rate REAL NOT NULL DEFAULT 0,
    last_used_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, language, category, item_id)
  );

  CREATE TABLE IF NOT EXISTS community_exercises (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    language TEXT NOT NULL,
    category TEXT NOT NULL,
    prompt TEXT NOT NULL,
    correct_answer TEXT NOT NULL,
    hints_json TEXT NOT NULL DEFAULT '[]',
    difficulty TEXT NOT NULL DEFAULT 'a1',
    audio_url TEXT NOT NULL DEFAULT '',
    image_url TEXT NOT NULL DEFAULT '',
    cultural_note TEXT NOT NULL DEFAULT '',
    exercise_type TEXT NOT NULL DEFAULT 'build_sentence',
    moderation_status TEXT NOT NULL DEFAULT 'pending',
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
  CREATE INDEX IF NOT EXISTS idx_language_progress_user_language
  ON language_progress(user_id, language);
  CREATE INDEX IF NOT EXISTS idx_item_progress_user_language_category
  ON item_progress(user_id, language, category);
  CREATE INDEX IF NOT EXISTS idx_active_sessions_user
  ON active_sessions(user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_email_verifications_token
  ON email_verifications(token);
  CREATE INDEX IF NOT EXISTS idx_password_resets_token
  ON password_resets(token);
  CREATE INDEX IF NOT EXISTS idx_exercise_usage_user_language_category
  ON exercise_usage(user_id, language, category, last_used_at DESC);
  CREATE INDEX IF NOT EXISTS idx_community_exercises_user_status
  ON community_exercises(user_id, moderation_status, created_at DESC);
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

  if (!names.has("beta_lessons_enabled")) {
    db.exec("ALTER TABLE settings ADD COLUMN beta_lessons_enabled INTEGER NOT NULL DEFAULT 0");
  }

  if (!names.has("unlock_all_lessons")) {
    db.exec("ALTER TABLE settings ADD COLUMN unlock_all_lessons INTEGER NOT NULL DEFAULT 0");
  }
}

ensureSettingsColumns();

db.prepare(`
  INSERT OR IGNORE INTO users (id, email, password_hash, display_name, email_verified, auth_provider)
  VALUES (1, 'local@lingoflow.dev', 'local-user-no-password', 'Learner', 1, 'local')
`).run();

function ensureLanguageProgress(userId = 1, language = "spanish") {
  const safeLanguage = String(language || "").trim().toLowerCase() || "spanish";
  db.prepare(`
    INSERT OR IGNORE INTO language_progress (
      user_id, language, total_xp, streak, learner_level
    )
    VALUES (?, ?, 0, 0, 1)
  `).run(userId, safeLanguage);
}

function computeStreakFromDatesDesc(datesDesc) {
  if (!Array.isArray(datesDesc) || !datesDesc.length) return 0;
  let streak = 1;
  let previous = new Date(`${datesDesc[0]}T00:00:00Z`);
  for (let i = 1; i < datesDesc.length; i += 1) {
    const current = new Date(`${datesDesc[i]}T00:00:00Z`);
    const diffDays = Math.floor((previous - current) / (24 * 60 * 60 * 1000));
    if (diffDays !== 1) break;
    streak += 1;
    previous = current;
  }
  return streak;
}

function refreshAggregateProgressFromLanguageProgress(userId = 1) {
  const rows = db.prepare(`
    SELECT total_xp, streak, learner_level, last_completed_date
    FROM language_progress
    WHERE user_id = ?
  `).all(userId);

  if (!rows.length) return;

  const totalXp = rows.reduce((sum, row) => sum + row.total_xp, 0);
  const streak = rows.reduce((max, row) => Math.max(max, row.streak || 0), 0);
  const lastCompletedDate = rows
    .map((row) => row.last_completed_date)
    .filter(Boolean)
    .sort((a, b) => (a < b ? 1 : -1))[0] || null;

  db.prepare(`
    UPDATE progress
    SET total_xp = ?,
        streak = ?,
        learner_level = ?,
        last_completed_date = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ?
  `).run(totalXp, streak, levelFromXp(totalXp), lastCompletedDate, userId);
}

function bootstrapLanguageProgress() {
  db.prepare(`
    INSERT OR IGNORE INTO language_progress (
      user_id, language, total_xp, streak, learner_level, last_completed_date
    )
    SELECT
      sh.user_id,
      sh.language,
      COALESCE(SUM(sh.xp_gained), 0),
      0,
      1,
      MAX(DATE(sh.completed_at))
    FROM session_history sh
    GROUP BY sh.user_id, sh.language
  `).run();

  const targetRows = db.prepare(`
    SELECT user_id, target_language
    FROM settings
  `).all();
  targetRows.forEach((row) => ensureLanguageProgress(row.user_id, row.target_language));

  const languageRows = db.prepare(`
    SELECT user_id, language
    FROM language_progress
  `).all();

  languageRows.forEach((row) => {
    const totals = db.prepare(`
      SELECT
        COALESCE(SUM(xp_gained), 0) AS total_xp,
        MAX(DATE(completed_at)) AS last_completed_date
      FROM session_history
      WHERE user_id = ? AND language = ?
    `).get(row.user_id, row.language);

    const dates = db.prepare(`
      SELECT DISTINCT DATE(completed_at) AS completed_day
      FROM session_history
      WHERE user_id = ? AND language = ?
      ORDER BY completed_day DESC
    `).all(row.user_id, row.language);

    const streak = computeStreakFromDatesDesc(dates.map((entry) => entry.completed_day));
    const totalXp = Number(totals?.total_xp || 0);
    db.prepare(`
      UPDATE language_progress
      SET total_xp = ?,
          streak = ?,
          learner_level = ?,
          last_completed_date = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ? AND language = ?
    `).run(
      totalXp,
      streak,
      levelFromXp(totalXp),
      totals?.last_completed_date || null,
      row.user_id,
      row.language
    );
  });

  const userRows = db.prepare("SELECT id FROM users").all();
  userRows.forEach((row) => refreshAggregateProgressFromLanguageProgress(row.id));
}

function ensureUserState(userId = 1, preferredLearnerName = "Learner") {
  const initialLearnerName = normalizeDisplayName(preferredLearnerName);
  db.prepare(`
    INSERT OR IGNORE INTO settings (
      user_id, native_language, target_language, daily_goal, daily_minutes, weekly_goal_sessions,
      self_rated_level, learner_name, learner_bio, focus_area
    )
    VALUES (?, 'english', 'spanish', 30, 20, 5, 'a1', ?, '', '')
  `).run(userId, initialLearnerName);

  db.prepare(`
    INSERT OR IGNORE INTO progress (user_id, total_xp, streak, learner_level)
    VALUES (?, 0, 0, 1)
  `).run(userId);

  const row = db.prepare("SELECT target_language FROM settings WHERE user_id = ?").get(userId);
  ensureLanguageProgress(userId, row?.target_language || "spanish");
}

ensureUserState(1);
bootstrapLanguageProgress();
db.prepare("UPDATE users SET email_verified = 1, auth_provider = 'local' WHERE id = 1").run();

function toIsoDate(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function toIsoDateTime(date = new Date()) {
  return date.toISOString();
}

function normalizeDisplayName(displayName) {
  return String(displayName || "Learner").trim() || "Learner";
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
      SET total_xp = ?, streak = ?, learner_level = ?, last_completed_date = ?, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = 1
    `).run(
      totalXp,
      Number(prog.streak || 0),
      levelFromXp(totalXp),
      prog.lastCompletedDate || null
    );

    const targetLanguage = settings.targetLanguage || "spanish";
    ensureLanguageProgress(1, targetLanguage);
    db.prepare(`
      UPDATE language_progress
      SET total_xp = ?,
          streak = ?,
          learner_level = ?,
          last_completed_date = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE user_id = 1 AND language = ?
    `).run(
      totalXp,
      Number(prog.streak || 0),
      levelFromXp(totalXp),
      prog.lastCompletedDate || null,
      targetLanguage
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
  const safeName = normalizeDisplayName(displayName);
  const insert = db.prepare(`
    INSERT INTO users (email, password_hash, display_name, email_verified, auth_provider)
    VALUES (?, ?, ?, ?, ?)
  `).run(normalizedEmail, passwordHash, safeName, emailVerified ? 1 : 0, authProvider);
  const userId = Number(insert.lastInsertRowid);
  ensureUserState(userId, safeName);
  return getUserById(userId);
}

function createEmailVerification({ userId, token, expiresAt }) {
  db.prepare(`
    INSERT INTO email_verifications (user_id, token, expires_at)
    VALUES (?, ?, ?)
  `).run(userId, token, expiresAt);
}

function replaceEmailVerification({ userId, token, expiresAt, nowIso = toIsoDateTime() }) {
  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE email_verifications
      SET consumed_at = ?
      WHERE user_id = ? AND consumed_at IS NULL
    `).run(nowIso, userId);

    db.prepare(`
      INSERT INTO email_verifications (user_id, token, expires_at)
      VALUES (?, ?, ?)
    `).run(userId, token, expiresAt);
  });

  tx();
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

function syncLearnerNameFromProfile(userId, displayName) {
  const safeName = normalizeDisplayName(displayName);
  const tx = db.transaction(() => {
    ensureUserState(userId, safeName);
    db.prepare(`
      UPDATE settings
      SET learner_name = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
        AND (TRIM(COALESCE(learner_name, '')) = '' OR learner_name = 'Learner')
    `).run(safeName, userId);
  });
  tx();
  return getSettings(userId);
}

function replacePasswordResetToken({ userId, token, expiresAt, nowIso = toIsoDateTime() }) {
  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE password_resets
      SET consumed_at = ?
      WHERE user_id = ? AND consumed_at IS NULL
    `).run(nowIso, userId);

    db.prepare(`
      INSERT INTO password_resets (user_id, token, expires_at)
      VALUES (?, ?, ?)
    `).run(userId, token, expiresAt);
  });
  tx();
}

function consumePasswordResetToken(token, passwordHash, nowIso = toIsoDateTime()) {
  const row = db.prepare(`
    SELECT id, user_id, expires_at, consumed_at
    FROM password_resets
    WHERE token = ?
  `).get(String(token || ""));
  if (!row) return null;
  if (row.consumed_at) return null;
  if (row.expires_at < nowIso) return null;
  if (!passwordHash) return null;

  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE password_resets
      SET consumed_at = ?
      WHERE id = ?
    `).run(nowIso, row.id);

    db.prepare(`
      UPDATE users
      SET password_hash = ?,
          auth_provider = 'local',
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(passwordHash, row.user_id);
  });
  tx();
  return getUserById(row.user_id);
}

function getSettings(userId = 1) {
  ensureUserState(userId);
  const row = db.prepare(`
    SELECT native_language, target_language, daily_goal, daily_minutes, weekly_goal_sessions,
           self_rated_level, learner_name, learner_bio, focus_area, beta_lessons_enabled, unlock_all_lessons
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
    focusArea: row.focus_area,
    betaLessonsEnabled: Boolean(row.beta_lessons_enabled),
    unlockAllLessons: Boolean(row.unlock_all_lessons)
  };
}

function saveSettings(userId = 1, nextSettings = {}) {
  ensureUserState(userId);
  const nextTargetLanguage = nextSettings.targetLanguage || "spanish";
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
        beta_lessons_enabled = ?,
        unlock_all_lessons = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ?
  `).run(
    nextSettings.nativeLanguage || "english",
    nextTargetLanguage,
    Number.isInteger(nextSettings.dailyGoal) ? nextSettings.dailyGoal : 30,
    Number.isInteger(nextSettings.dailyMinutes) ? nextSettings.dailyMinutes : 20,
    Number.isInteger(nextSettings.weeklyGoalSessions) ? nextSettings.weeklyGoalSessions : 5,
    ["a1", "a2", "b1", "b2"].includes(nextSettings.selfRatedLevel)
      ? nextSettings.selfRatedLevel
      : "a1",
    String(nextSettings.learnerName || "Learner").trim() || "Learner",
    String(nextSettings.learnerBio || "").trim(),
    String(nextSettings.focusArea || "").trim(),
    nextSettings.betaLessonsEnabled ? 1 : 0,
    nextSettings.unlockAllLessons ? 1 : 0,
    userId
  );

  ensureLanguageProgress(userId, nextTargetLanguage);
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

function getTotalTodayXpAllLanguages(userId = 1, today = toIsoDate()) {
  const row = db.prepare(`
    SELECT COALESCE(SUM(xp), 0) AS total_xp
    FROM daily_xp
    WHERE user_id = ? AND date = ?
  `).get(userId, today);
  return row ? row.total_xp : 0;
}

function getProgress(userId = 1, language) {
  ensureUserState(userId);
  const safeLanguage = language ? String(language).toLowerCase() : "";
  const categories = safeLanguage ? getCategoryProgress(userId, safeLanguage) : [];

  if (safeLanguage) {
    ensureLanguageProgress(userId, safeLanguage);
    const languageRow = db.prepare(`
      SELECT total_xp, streak, learner_level, last_completed_date
      FROM language_progress
      WHERE user_id = ? AND language = ?
    `).get(userId, safeLanguage);

    return {
      language: safeLanguage,
      totalXp: languageRow.total_xp,
      todayXp: getTodayXp(userId, safeLanguage),
      streak: languageRow.streak,
      learnerLevel: languageRow.learner_level,
      lastCompletedDate: languageRow.last_completed_date,
      categories
    };
  }

  const row = db.prepare(`
    SELECT total_xp, streak, learner_level, last_completed_date
    FROM progress
    WHERE user_id = ?
  `).get(userId);

  return {
    language: null,
    totalXp: row.total_xp,
    todayXp: getTotalTodayXpAllLanguages(userId),
    streak: row.streak,
    learnerLevel: row.learner_level,
    lastCompletedDate: row.last_completed_date,
    categories
  };
}

function getProgressOverview(userId = 1) {
  ensureUserState(userId);
  const rows = db.prepare(`
    SELECT language, total_xp, streak, learner_level, last_completed_date
    FROM language_progress
    WHERE user_id = ?
    ORDER BY updated_at DESC, language ASC
  `).all(userId);

  return {
    totalXp: rows.reduce((sum, row) => sum + row.total_xp, 0),
    languages: rows.map((row) => ({
      language: row.language,
      totalXp: row.total_xp,
      todayXp: getTodayXp(userId, row.language),
      streak: row.streak,
      learnerLevel: row.learner_level,
      lastCompletedDate: row.last_completed_date
    }))
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

function recordExerciseUsage({
  userId = 1,
  language,
  category,
  itemId,
  correct
}) {
  const existing = db.prepare(`
    SELECT attempts, correct_attempts
    FROM exercise_usage
    WHERE user_id = ? AND language = ? AND category = ? AND item_id = ?
  `).get(userId, language, category, itemId);

  const attempts = (existing?.attempts || 0) + 1;
  const correctAttempts = (existing?.correct_attempts || 0) + (correct ? 1 : 0);
  const completionRate = attempts > 0 ? Number((correctAttempts / attempts).toFixed(4)) : 0;

  db.prepare(`
    INSERT INTO exercise_usage (
      user_id, language, category, item_id, attempts, correct_attempts, completion_rate, last_used_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id, language, category, item_id) DO UPDATE SET
      attempts = excluded.attempts,
      correct_attempts = excluded.correct_attempts,
      completion_rate = excluded.completion_rate,
      last_used_at = CURRENT_TIMESTAMP
  `).run(userId, language, category, itemId, attempts, correctAttempts, completionRate);
}

function getCategoryRecommendations(userId = 1, language) {
  const categoryProgress = getCategoryProgress(userId, language);
  const sortedWeak = [...categoryProgress]
    .filter((item) => item.attempts > 0)
    .sort((a, b) => a.accuracy - b.accuracy || a.mastery - b.mastery);

  const strongest = [...categoryProgress]
    .filter((item) => item.attempts > 0)
    .sort((a, b) => b.accuracy - a.accuracy || b.mastery - a.mastery)[0];

  const recommendedIds = [];
  if (strongest?.category === "grammar") {
    recommendedIds.push("conversation");
  }
  sortedWeak.slice(0, 2).forEach((item) => recommendedIds.push(item.category));
  if (!recommendedIds.length) {
    recommendedIds.push("essentials", "conversation");
  }

  return Array.from(new Set(recommendedIds));
}

function createCommunityExercise({
  userId = 1,
  language,
  category,
  prompt,
  correctAnswer,
  hints = [],
  difficulty = "a1",
  audioUrl = "",
  imageUrl = "",
  culturalNote = "",
  exerciseType = "build_sentence"
}) {
  const result = db.prepare(`
    INSERT INTO community_exercises (
      user_id, language, category, prompt, correct_answer, hints_json, difficulty,
      audio_url, image_url, cultural_note, exercise_type, moderation_status
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
  `).run(
    userId,
    String(language || "").trim().toLowerCase(),
    String(category || "").trim(),
    String(prompt || "").trim(),
    String(correctAnswer || "").trim(),
    JSON.stringify(Array.isArray(hints) ? hints : []),
    String(difficulty || "a1").trim().toLowerCase(),
    String(audioUrl || "").trim(),
    String(imageUrl || "").trim(),
    String(culturalNote || "").trim(),
    String(exerciseType || "build_sentence").trim().toLowerCase()
  );

  return db.prepare(`
    SELECT id, language, category, prompt, correct_answer, hints_json, difficulty,
           audio_url, image_url, cultural_note, exercise_type, moderation_status, created_at
    FROM community_exercises
    WHERE id = ?
  `).get(result.lastInsertRowid);
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

  const usageStats = db.prepare(`
    SELECT item_id, attempts, correct_attempts, completion_rate, last_used_at
    FROM exercise_usage
    WHERE user_id = ? AND language = ?
    ORDER BY completion_rate ASC, attempts DESC, last_used_at DESC
    LIMIT 6
  `).all(userId, language).map((row) => ({
    itemId: row.item_id,
    attempts: row.attempts,
    correctAttempts: row.correct_attempts,
    completionRate: Number((row.completion_rate * 100).toFixed(1)),
    lastUsedAt: row.last_used_at
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
    recommendedCategories: getCategoryRecommendations(userId, language),
    categoryStats,
    errorTypeTrend,
    objectiveStats,
    usageStats,
    betaLessonsEnabled: Boolean(settings.betaLessonsEnabled)
  };
}

function recordSession({
  userId = 1,
  language,
  category,
  score,
  maxScore,
  mistakes: _mistakes,
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

  ensureLanguageProgress(userId, language);
  const progress = db.prepare(`
    SELECT total_xp, streak, last_completed_date
    FROM language_progress
    WHERE user_id = ? AND language = ?
  `).get(userId, language);

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

  const totalXp = progress.total_xp + xpGained;
  const learnerLevel = levelFromXp(totalXp);
  addDailyXp(userId, language, today, xpGained);

  db.prepare(`
    UPDATE language_progress
    SET total_xp = ?,
        streak = ?,
        learner_level = ?,
        last_completed_date = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ? AND language = ?
  `).run(totalXp, nextStreak, learnerLevel, today, userId, language);

  refreshAggregateProgressFromLanguageProgress(userId);

  return {
    xpGained,
    streak: nextStreak,
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
  replaceEmailVerification,
  consumeEmailVerificationToken,
  markUserEmailVerified,
  syncLearnerNameFromProfile,
  replacePasswordResetToken,
  consumePasswordResetToken,
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
  recordExerciseUsage,
  getItemSelectionHints,
  getCategoryRecommendations,
  createCommunityExercise,
  getTodayXp,
  getProgress,
  getProgressOverview,
  getStats,
  recordSession,
  addDailyXp,
  toIsoDate,
  toIsoDateTime
};
