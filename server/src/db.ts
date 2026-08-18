const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { db, getDriver, resetDriver } = require("./db/driver.ts");

// The SQLite driver owns the on-disk location; this is only needed so the
// one-time legacy JSON import can look beside the database file. On Postgres
// there is no local data directory and the legacy import does not run.
function legacyJsonPath(): string | null {
  const driver = getDriver();
  if (driver.dialect !== "sqlite") return null;
  return path.join(path.dirname(driver.dbPath), "lingoflow.db.json");
}

async function tableExists(tableName: string) {
  return db.tableExists(tableName);
}

async function tableHasColumn(tableName: string, columnName: string) {
  const columns = await db.columnInfo(tableName);
  return columns.some((column: any) => column.name === columnName);
}

async function createUsersTable() {
  await db.exec(`
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

async function ensureUsersColumns() {
  const columns = await db.columnInfo("users");
  const names = new Set(columns.map((column) => column.name));

  if (!names.has("email_verified")) {
    await db.exec("ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0");
  }

  if (!names.has("auth_provider")) {
    await db.exec("ALTER TABLE users ADD COLUMN auth_provider TEXT NOT NULL DEFAULT 'local'");
  }
}

async function migrateLegacySingleUserSchema() {
  if (!await tableExists("settings") || await tableHasColumn("settings", "user_id")) return;

  const runMigration = db.transaction(async () => {
    await createUsersTable();
    await db.prepare(`
      INSERT INTO users (id, email, password_hash, display_name)
      VALUES (1, 'local@lingoflow.dev', 'local-user-no-password', 'Learner')
      ON CONFLICT (id) DO NOTHING
    `).run();

    await db.exec(`
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
        unlock_all_lessons INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO settings (
        user_id, native_language, target_language, daily_goal, daily_minutes, weekly_goal_sessions,
        self_rated_level, learner_name, learner_bio, focus_area, unlock_all_lessons, updated_at
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
        COALESCE(updated_at, CURRENT_TIMESTAMP)
      FROM settings_legacy
      LIMIT 1;
      DROP TABLE settings_legacy;
    `);

    await db.exec(`
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

    if (await tableExists("category_progress")) {
      await db.exec(`
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

    if (await tableExists("session_history")) {
      await db.exec(`
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

    if (await tableExists("active_sessions")) {
      await db.exec(`
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

    if (await tableExists("daily_xp")) {
      await db.exec(`
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

    if (await tableExists("item_progress")) {
      await db.exec(`
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

    if (await tableExists("attempt_history")) {
      await db.exec(`
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

  await runMigration();
}


async function createCoreTables() {
  await db.exec(`
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

  CREATE TABLE IF NOT EXISTS login_page_daily_stats (
    date TEXT PRIMARY KEY,
    total_visits INTEGER NOT NULL DEFAULT 0,
    unique_visitors INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS login_page_unique_visitors (
    date TEXT NOT NULL,
    visitor_hash TEXT NOT NULL,
    first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(date, visitor_hash)
  );

  CREATE TABLE IF NOT EXISTS bookmarks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    question_id TEXT NOT NULL,
    prompt TEXT NOT NULL,
    answer TEXT NOT NULL,
    language TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, question_id)
  );

  CREATE TABLE IF NOT EXISTS saved_words (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    language TEXT NOT NULL,
    word TEXT NOT NULL,
    translation TEXT NOT NULL DEFAULT '',
    story_id TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, language, word)
  );

  CREATE TABLE IF NOT EXISTS story_completions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    language TEXT NOT NULL,
    story_id TEXT NOT NULL,
    started_at TEXT,
    last_sentence_index INTEGER NOT NULL DEFAULT 0,
    quiz_score INTEGER,
    quiz_total INTEGER,
    xp_awarded INTEGER NOT NULL DEFAULT 0,
    completed_at TEXT,
    UNIQUE(user_id, story_id)
  );

  CREATE TABLE IF NOT EXISTS achievements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    achievement_id TEXT NOT NULL,
    earned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    UNIQUE(user_id, achievement_id)
  );

  CREATE TABLE IF NOT EXISTS content_versions (
    language TEXT NOT NULL,
    category TEXT NOT NULL,
    fingerprint TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(language, category)
  );
`);
}

async function createIndexes() {
  await db.exec(`
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
  CREATE INDEX IF NOT EXISTS idx_saved_words_user_language
  ON saved_words(user_id, language);
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
  CREATE INDEX IF NOT EXISTS idx_login_page_unique_visitors_date
  ON login_page_unique_visitors(date);
  CREATE INDEX IF NOT EXISTS idx_daily_xp_user_date
  ON daily_xp(user_id, date DESC);
  CREATE INDEX IF NOT EXISTS idx_daily_xp_user_language_date
  ON daily_xp(user_id, language, date DESC);
  CREATE INDEX IF NOT EXISTS idx_progress_user
  ON progress(user_id);
  CREATE INDEX IF NOT EXISTS idx_bookmarks_user
  ON bookmarks(user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_achievements_user
  ON achievements(user_id, earned_at DESC);
  CREATE INDEX IF NOT EXISTS idx_story_completions_user_language
  ON story_completions(user_id, language);
`);
}

async function ensureSettingsColumns() {
  const columns = await db.columnInfo("settings");
  const names = new Set(columns.map((column) => column.name));

  if (!names.has("learner_name")) {
    await db.exec("ALTER TABLE settings ADD COLUMN learner_name TEXT NOT NULL DEFAULT 'Learner'");
  }

  if (!names.has("learner_bio")) {
    await db.exec("ALTER TABLE settings ADD COLUMN learner_bio TEXT NOT NULL DEFAULT ''");
  }

  if (!names.has("focus_area")) {
    await db.exec("ALTER TABLE settings ADD COLUMN focus_area TEXT NOT NULL DEFAULT ''");
  }

  if (!names.has("daily_minutes")) {
    await db.exec("ALTER TABLE settings ADD COLUMN daily_minutes INTEGER NOT NULL DEFAULT 20");
  }

  if (!names.has("weekly_goal_sessions")) {
    await db.exec("ALTER TABLE settings ADD COLUMN weekly_goal_sessions INTEGER NOT NULL DEFAULT 5");
  }

  if (!names.has("self_rated_level")) {
    await db.exec("ALTER TABLE settings ADD COLUMN self_rated_level TEXT NOT NULL DEFAULT 'a1'");
  }

  if (!names.has("unlock_all_lessons")) {
    await db.exec("ALTER TABLE settings ADD COLUMN unlock_all_lessons INTEGER NOT NULL DEFAULT 0");
  }

  if (!names.has("speech_rate")) {
    await db.exec("ALTER TABLE settings ADD COLUMN speech_rate REAL NOT NULL DEFAULT 0.92");
  }
}


async function ensureCommunityExercisesColumns() {
  const columns = await db.columnInfo("community_exercises");
  const names = new Set(columns.map((column: any) => column.name));

  if (!names.has("reviewer_comment")) {
    await db.exec("ALTER TABLE community_exercises ADD COLUMN reviewer_comment TEXT NOT NULL DEFAULT ''");
  }
  if (!names.has("reviewed_by")) {
    await db.exec("ALTER TABLE community_exercises ADD COLUMN reviewed_by INTEGER REFERENCES users(id)");
  }
  if (!names.has("reviewed_at")) {
    await db.exec("ALTER TABLE community_exercises ADD COLUMN reviewed_at TEXT");
  }
}


async function ensureItemProgressColumns() {
  const columns = await db.columnInfo("item_progress");
  const names = new Set(columns.map((column: any) => column.name));

  if (!names.has("flashcard_known")) {
    await db.exec("ALTER TABLE item_progress ADD COLUMN flashcard_known INTEGER NOT NULL DEFAULT 0");
  }
}


async function ensureLanguageProgressColumns() {
  const columns = await db.columnInfo("language_progress");
  const names = new Set(columns.map((column: any) => column.name));

  if (!names.has("speed_match_highscore")) {
    await db.exec("ALTER TABLE language_progress ADD COLUMN speed_match_highscore INTEGER NOT NULL DEFAULT 0");
  }
}


// Existing databases predate the Story Reader progress/quiz columns. The original
// table also had completed_at NOT NULL DEFAULT CURRENT_TIMESTAMP, but in-progress
// (resume) rows are inserted with completed_at NULL. SQLite cannot drop a column
// constraint via ALTER, so a legacy table is rebuilt; otherwise we just add columns.
async function ensureStoryCompletionsColumns() {
  if (!await tableExists("story_completions")) return;
  const info = () => db.columnInfo("story_completions");
  const completedAt = (await info()).find((column: any) => column.name === "completed_at");
  // Rebuilding a table to drop a NOT NULL is a SQLite workaround; Postgres
  // databases are always created fresh by this code and never hit the legacy shape.
  const legacyNotNull = db.dialect === "sqlite" && completedAt && completedAt.notNull;

  if (legacyNotNull) {
    // Rebuild with a nullable completed_at, preserving whatever columns already exist.
    const existing = new Set((await info()).map((column: any) => column.name));
    const carried = [
      "id",
      "user_id",
      "language",
      "story_id",
      "started_at",
      "last_sentence_index",
      "quiz_score",
      "quiz_total",
      "xp_awarded",
      "completed_at"
    ].filter((column) => existing.has(column));
    const rebuild = db.transaction(async () => {
      await db.exec(`
        CREATE TABLE story_completions_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          language TEXT NOT NULL,
          story_id TEXT NOT NULL,
          started_at TEXT,
          last_sentence_index INTEGER NOT NULL DEFAULT 0,
          quiz_score INTEGER,
          quiz_total INTEGER,
          xp_awarded INTEGER NOT NULL DEFAULT 0,
          completed_at TEXT,
          UNIQUE(user_id, story_id)
        );
      `);
      await db.exec(
        `INSERT INTO story_completions_new (${carried.join(", ")}) ` +
          `SELECT ${carried.join(", ")} FROM story_completions;`
      );
      await db.exec("DROP TABLE story_completions;");
      await db.exec("ALTER TABLE story_completions_new RENAME TO story_completions;");
    });
    await rebuild();
    await db.exec(
      "CREATE INDEX IF NOT EXISTS idx_story_completions_user_language ON story_completions(user_id, language);"
    );
    return;
  }

  const names = new Set((await info()).map((column: any) => column.name));
  if (!names.has("started_at")) {
    await db.exec("ALTER TABLE story_completions ADD COLUMN started_at TEXT");
  }
  if (!names.has("last_sentence_index")) {
    await db.exec("ALTER TABLE story_completions ADD COLUMN last_sentence_index INTEGER NOT NULL DEFAULT 0");
  }
  if (!names.has("quiz_score")) {
    await db.exec("ALTER TABLE story_completions ADD COLUMN quiz_score INTEGER");
  }
  if (!names.has("quiz_total")) {
    await db.exec("ALTER TABLE story_completions ADD COLUMN quiz_total INTEGER");
  }
  if (!names.has("xp_awarded")) {
    await db.exec("ALTER TABLE story_completions ADD COLUMN xp_awarded INTEGER NOT NULL DEFAULT 0");
  }
}

// The id=1 "local" account predates multi-user support; a fresh database still
// gets it so single-user installs and the content tooling have a user to attach to.
async function seedDefaultUser() {
  await db.prepare(`
    INSERT INTO users (id, email, password_hash, display_name, email_verified, auth_provider)
    VALUES (1, 'local@lingoflow.dev', 'local-user-no-password', 'Learner', 1, 'local')
    ON CONFLICT (id) DO NOTHING
  `).run();
  await ensureUserState(1);
  await bootstrapLanguageProgress();
  await db.prepare("UPDATE users SET email_verified = 1, auth_provider = 'local' WHERE id = 1").run();
  await resyncUsersSequence();
}

// A Postgres identity column does not advance when a row supplies its own id,
// so the seed row above leaves the users sequence at 1 and the first real
// registration collides on the primary key. SQLite's AUTOINCREMENT tracks
// MAX(id) on its own and needs nothing here.
async function resyncUsersSequence() {
  if (db.dialect !== "postgres") return;
  await db.prepare(
    "SELECT setval(pg_get_serial_sequence('users', 'id'), COALESCE((SELECT MAX(id) FROM users), 1))"
  ).get();
}

function isValidLanguageId(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return false;
  return /^[a-z][a-z0-9-]*$/.test(normalized);
}

function normalizeLanguageId(value, fallback = "spanish") {
  const normalized = String(value || "").trim().toLowerCase();
  if (isValidLanguageId(normalized)) return normalized;
  const safeFallback = String(fallback || "").trim().toLowerCase();
  if (isValidLanguageId(safeFallback)) return safeFallback;
  return "spanish";
}

function normalizeTargetLanguageId(targetLanguage, nativeLanguage, fallback = "spanish") {
  const safeNativeLanguage = normalizeLanguageId(nativeLanguage, "english");
  const safeTargetLanguage = normalizeLanguageId(targetLanguage, fallback);
  if (safeTargetLanguage !== safeNativeLanguage) return safeTargetLanguage;

  const safeFallback = normalizeLanguageId(fallback, "spanish");
  if (safeFallback !== safeNativeLanguage) return safeFallback;
  return safeNativeLanguage === "english" ? "spanish" : "english";
}

async function ensureLanguageProgress(userId = 1, language = "spanish") {
  const safeLanguage = normalizeLanguageId(language, "spanish");
  await db.prepare(`
    INSERT INTO language_progress (
      user_id, language, total_xp, streak, learner_level
    )
    VALUES (?, ?, 0, 0, 1)
    ON CONFLICT (user_id, language) DO NOTHING
  `).run(userId, safeLanguage);
}

function computeStreakFromDatesDesc(datesDesc) {
  if (!Array.isArray(datesDesc) || !datesDesc.length) return 0;
  // If the most recent date is more than 1 day old the streak is already broken.
  const todayUtc = new Date();
  todayUtc.setUTCHours(0, 0, 0, 0);
  const mostRecent = new Date(`${datesDesc[0]}T00:00:00Z`);
  const diffFromToday = Math.floor((todayUtc.getTime() - mostRecent.getTime()) / 86400000);
  if (diffFromToday > 1) return 0;

  let streak = 1;
  let previous = mostRecent;
  for (let i = 1; i < datesDesc.length; i += 1) {
    const current = new Date(`${datesDesc[i]}T00:00:00Z`);
    const diffDays = Math.floor((previous.getTime() - current.getTime()) / (24 * 60 * 60 * 1000));
    if (diffDays !== 1) break;
    streak += 1;
    previous = current;
  }
  return streak;
}

// Returns the stored streak only if last_completed_date is today or yesterday.
// Prevents stale streaks from persisting when the user hasn't played in days.
function liveStreak(stored: number, lastCompletedDate: string | null): number {
  if (!lastCompletedDate || !stored) return 0;
  const todayUtc = new Date();
  todayUtc.setUTCHours(0, 0, 0, 0);
  const last = new Date(lastCompletedDate + "T00:00:00Z");
  const diffDays = Math.floor((todayUtc.getTime() - last.getTime()) / 86400000);
  return diffDays <= 1 ? stored : 0;
}

async function refreshAggregateProgressFromLanguageProgress(userId = 1) {
  const rows = await db.prepare(`
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

  await db.prepare(`
    UPDATE progress
    SET total_xp = ?,
        streak = ?,
        learner_level = ?,
        last_completed_date = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ?
  `).run(totalXp, streak, levelFromXp(totalXp), lastCompletedDate, userId);
}

async function sanitizeLanguageProgressRowsForUser(userId = 1) {
  const settingsRow = await db.prepare(`
    SELECT target_language
    FROM settings
    WHERE user_id = ?
  `).get(userId);
  const fallbackLanguage = normalizeLanguageId(settingsRow?.target_language, "spanish");

  const rows = await db.prepare(`
    SELECT id, language, total_xp, streak, learner_level, last_completed_date
    FROM language_progress
    WHERE user_id = ?
  `).all(userId);

  const invalidRows = rows.filter((row) => !isValidLanguageId(row.language));
  if (!invalidRows.length) return;

  const tx = db.transaction(async () => {
    await ensureLanguageProgress(userId, fallbackLanguage);

    const targetRow = await db.prepare(`
      SELECT id, total_xp, streak, learner_level, last_completed_date
      FROM language_progress
      WHERE user_id = ? AND language = ?
    `).get(userId, fallbackLanguage);

    const merged = invalidRows.reduce((acc, row) => ({
      totalXp: acc.totalXp + Number(row.total_xp || 0),
      streak: Math.max(acc.streak, Number(row.streak || 0)),
      learnerLevel: Math.max(acc.learnerLevel, Number(row.learner_level || 1)),
      lastCompletedDate: !acc.lastCompletedDate || (row.last_completed_date && row.last_completed_date > acc.lastCompletedDate)
        ? (row.last_completed_date || acc.lastCompletedDate)
        : acc.lastCompletedDate
    }), {
      totalXp: Number(targetRow.total_xp || 0),
      streak: Number(targetRow.streak || 0),
      learnerLevel: Number(targetRow.learner_level || 1),
      lastCompletedDate: targetRow.last_completed_date || null
    });

    await db.prepare(`
      UPDATE language_progress
      SET total_xp = ?,
          streak = ?,
          learner_level = ?,
          last_completed_date = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      merged.totalXp,
      merged.streak,
      merged.learnerLevel,
      merged.lastCompletedDate,
      targetRow.id
    );

    const invalidIds = invalidRows.map((row) => row.id);
    const placeholders = invalidIds.map(() => "?").join(", ");
    await db.prepare(`
      DELETE FROM language_progress
      WHERE user_id = ? AND id IN (${placeholders})
    `).run(userId, ...invalidIds);
  });

  await tx();
}

async function bootstrapLanguageProgress() {
  await db.prepare(`
    INSERT INTO language_progress (
      user_id, language, total_xp, streak, learner_level, last_completed_date
    )
    SELECT
      sh.user_id,
      sh.language,
      COALESCE(SUM(sh.xp_gained), 0),
      0,
      1,
      MAX(substr(sh.completed_at, 1, 10))
    FROM session_history sh
    GROUP BY sh.user_id, sh.language
    ON CONFLICT (user_id, language) DO NOTHING
  `).run();

  const targetRows = await db.prepare(`
    SELECT user_id, target_language
    FROM settings
  `).all();
  for (const row of targetRows) {
    await ensureLanguageProgress(row.user_id, row.target_language);
  }

  const languageRows = await db.prepare(`
    SELECT user_id, language
    FROM language_progress
  `).all();

  for (const row of languageRows) {
    const totals = await db.prepare(`
      SELECT
        COALESCE(SUM(xp_gained), 0) AS total_xp,
        MAX(substr(completed_at, 1, 10)) AS last_completed_date
      FROM session_history
      WHERE user_id = ? AND language = ?
    `).get(row.user_id, row.language);

    const dates = await db.prepare(`
      SELECT DISTINCT substr(completed_at, 1, 10) AS completed_day
      FROM session_history
      WHERE user_id = ? AND language = ?
      ORDER BY completed_day DESC
    `).all(row.user_id, row.language);

    const streak = computeStreakFromDatesDesc(dates.map((entry) => entry.completed_day));
    const totalXp = Number(totals?.total_xp || 0);
    await db.prepare(`
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
  }

  const userRows = await db.prepare("SELECT id FROM users").all();
  for (const row of userRows) {
    await sanitizeLanguageProgressRowsForUser(row.id);
    await refreshAggregateProgressFromLanguageProgress(row.id);
  }
}

async function ensureUserState(userId = 1, preferredLearnerName = "Learner") {
  const initialLearnerName = normalizeDisplayName(preferredLearnerName);
  await db.prepare(`
    INSERT INTO settings (
      user_id, native_language, target_language, daily_goal, daily_minutes, weekly_goal_sessions,
      self_rated_level, learner_name, learner_bio, focus_area
    )
    VALUES (?, 'english', 'spanish', 30, 20, 5, 'a1', ?, '', '')
    ON CONFLICT (user_id) DO NOTHING
  `).run(userId, initialLearnerName);

  await db.prepare(`
    INSERT INTO progress (user_id, total_xp, streak, learner_level)
    VALUES (?, 0, 0, 1)
    ON CONFLICT (user_id) DO NOTHING
  `).run(userId);

  const row = await db.prepare("SELECT target_language FROM settings WHERE user_id = ?").get(userId);
  await ensureLanguageProgress(userId, row?.target_language || "spanish");
}


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

async function maybeMigrateLegacyJson() {
  const jsonPath = legacyJsonPath();
  if (!jsonPath || !fs.existsSync(jsonPath)) return;

  await ensureUserState(1);

  const hasAnySessions = (await db.prepare(`
    SELECT COUNT(1) AS count
    FROM session_history
    WHERE user_id = 1
  `).get()).count > 0;
  const progress = await db.prepare("SELECT total_xp FROM progress WHERE user_id = 1").get();
  if (hasAnySessions || (progress && progress.total_xp > 0)) return;

  try {
    const legacy = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
    const settings = legacy.settings || {};
    const prog = legacy.progress || {};

    await db.prepare(`
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
      normalizeLanguageId(settings.targetLanguage, "spanish"),
      Number.isInteger(settings.dailyGoal) ? settings.dailyGoal : 30
    );

    const totalXp = Number(prog.totalXp || 0);
    await db.prepare(`
      UPDATE progress
      SET total_xp = ?, streak = ?, learner_level = ?, last_completed_date = ?, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = 1
    `).run(
      totalXp,
      Number(prog.streak || 0),
      levelFromXp(totalXp),
      prog.lastCompletedDate || null
    );

    const targetLanguage = normalizeLanguageId(settings.targetLanguage, "spanish");
    await ensureLanguageProgress(1, targetLanguage);
    await db.prepare(`
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


function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

async function getUserByEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  const row = await db.prepare(`
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

async function getUserById(userId) {
  const row = await db.prepare(`
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

async function createUser({ email, passwordHash, displayName, emailVerified = false, authProvider = "local" }) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !passwordHash) return null;
  const safeName = normalizeDisplayName(displayName);
  const inserted = await db.prepare(`
    INSERT INTO users (email, password_hash, display_name, email_verified, auth_provider)
    VALUES (?, ?, ?, ?, ?)
    RETURNING id
  `).get(normalizedEmail, passwordHash, safeName, emailVerified ? 1 : 0, authProvider);
  const userId = Number(inserted.id);
  await ensureUserState(userId, safeName);
  return await getUserById(userId);
}

async function deleteUserById(userId) {
  if (!Number.isInteger(userId) || userId <= 0) return false;
  const tx = db.transaction(async () => {
    const result = await db.prepare(`
      DELETE FROM users
      WHERE id = ?
    `).run(userId);
    return result.changes > 0;
  });
  return tx();
}

async function createEmailVerification({ userId, token, expiresAt }) {
  await db.prepare(`
    INSERT INTO email_verifications (user_id, token, expires_at)
    VALUES (?, ?, ?)
  `).run(userId, token, expiresAt);
}

async function replaceEmailVerification({ userId, token, expiresAt, nowIso = toIsoDateTime() }) {
  const tx = db.transaction(async () => {
    await db.prepare(`
      UPDATE email_verifications
      SET consumed_at = ?
      WHERE user_id = ? AND consumed_at IS NULL
    `).run(nowIso, userId);

    await db.prepare(`
      INSERT INTO email_verifications (user_id, token, expires_at)
      VALUES (?, ?, ?)
    `).run(userId, token, expiresAt);
  });

  await tx();
}

async function consumeEmailVerificationToken(token, nowIso = toIsoDateTime()) {
  const row = await db.prepare(`
    SELECT id, user_id, expires_at, consumed_at
    FROM email_verifications
    WHERE token = ?
  `).get(String(token || ""));
  if (!row) return null;
  if (row.consumed_at) return null;
  if (row.expires_at < nowIso) return null;

  const tx = db.transaction(async () => {
    await db.prepare(`
      UPDATE email_verifications
      SET consumed_at = ?
      WHERE id = ?
    `).run(nowIso, row.id);

    await db.prepare(`
      UPDATE users
      SET email_verified = 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(row.user_id);
  });

  await tx();
  return await getUserById(row.user_id);
}

async function markUserEmailVerified(userId) {
  await db.prepare(`
    UPDATE users
    SET email_verified = 1,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(userId);
}

async function syncLearnerNameFromProfile(userId, displayName) {
  const safeName = normalizeDisplayName(displayName);
  const tx = db.transaction(async () => {
    await ensureUserState(userId, safeName);
    await db.prepare(`
      UPDATE settings
      SET learner_name = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
        AND (TRIM(COALESCE(learner_name, '')) = '' OR learner_name = 'Learner')
    `).run(safeName, userId);
  });
  await tx();
  return await getSettings(userId);
}

async function replacePasswordResetToken({ userId, token, expiresAt, nowIso = toIsoDateTime() }) {
  const tx = db.transaction(async () => {
    await db.prepare(`
      UPDATE password_resets
      SET consumed_at = ?
      WHERE user_id = ? AND consumed_at IS NULL
    `).run(nowIso, userId);

    await db.prepare(`
      INSERT INTO password_resets (user_id, token, expires_at)
      VALUES (?, ?, ?)
    `).run(userId, token, expiresAt);
  });
  await tx();
}

async function consumePasswordResetToken(token, passwordHash, nowIso = toIsoDateTime()) {
  const row = await db.prepare(`
    SELECT id, user_id, expires_at, consumed_at
    FROM password_resets
    WHERE token = ?
  `).get(String(token || ""));
  if (!row) return null;
  if (row.consumed_at) return null;
  if (row.expires_at < nowIso) return null;
  if (!passwordHash) return null;

  const tx = db.transaction(async () => {
    await db.prepare(`
      UPDATE password_resets
      SET consumed_at = ?
      WHERE id = ?
    `).run(nowIso, row.id);

    await db.prepare(`
      UPDATE users
      SET password_hash = ?,
          auth_provider = 'local',
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(passwordHash, row.user_id);
  });
  await tx();
  return await getUserById(row.user_id);
}

// Clamps the shared text-to-speech rate to a sane, audible range. Defaults to the
// historic 0.92 when callers omit or send a non-numeric value.
function normalizeSpeechRate(value) {
  const rate = Number(value);
  if (!Number.isFinite(rate)) return 0.92;
  return Math.min(1.5, Math.max(0.5, rate));
}

async function getSettings(userId = 1) {
  await ensureUserState(userId);
  const row: any = await db.prepare(`
    SELECT native_language, target_language, daily_goal, daily_minutes, weekly_goal_sessions,
           self_rated_level, learner_name, learner_bio, focus_area, unlock_all_lessons, speech_rate
    FROM settings
    WHERE user_id = ?
  `).get(userId);
  const normalizedNativeLanguage = normalizeLanguageId(row.native_language, "english");
  const normalizedTargetLanguage = normalizeTargetLanguageId(
    row.target_language,
    normalizedNativeLanguage,
    "spanish"
  );
  return {
    nativeLanguage: normalizedNativeLanguage,
    targetLanguage: normalizedTargetLanguage,
    dailyGoal: row.daily_goal,
    dailyMinutes: row.daily_minutes,
    weeklyGoalSessions: row.weekly_goal_sessions,
    selfRatedLevel: row.self_rated_level,
    learnerName: row.learner_name,
    learnerBio: row.learner_bio,
    focusArea: row.focus_area,
    unlockAllLessons: Boolean(row.unlock_all_lessons),
    speechRate: typeof row.speech_rate === "number" ? row.speech_rate : 0.92
  };
}

async function saveSettings(userId = 1, nextSettings = {}) {
  await ensureUserState(userId);
  const safeSettings = nextSettings as any;
  const existingSettings = await db.prepare("SELECT target_language FROM settings WHERE user_id = ?").get(userId);
  const nextNativeLanguage = normalizeLanguageId(safeSettings.nativeLanguage, "english");
  const fallbackLanguage = normalizeLanguageId(existingSettings?.target_language, "spanish");
  const nextTargetLanguage = normalizeTargetLanguageId(
    safeSettings.targetLanguage,
    nextNativeLanguage,
    fallbackLanguage
  );
  await db.prepare(`
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
        unlock_all_lessons = ?,
        speech_rate = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ?
  `).run(
    nextNativeLanguage,
    nextTargetLanguage,
    Number.isInteger(safeSettings.dailyGoal) ? safeSettings.dailyGoal : 30,
    Number.isInteger(safeSettings.dailyMinutes) ? safeSettings.dailyMinutes : 20,
    Number.isInteger(safeSettings.weeklyGoalSessions) ? safeSettings.weeklyGoalSessions : 5,
    ["a1", "a2", "b1", "b2"].includes(safeSettings.selfRatedLevel)
      ? safeSettings.selfRatedLevel
      : "a1",
    String(safeSettings.learnerName || "Learner").trim() || "Learner",
    String(safeSettings.learnerBio || "").trim(),
    String(safeSettings.focusArea || "").trim(),
    safeSettings.unlockAllLessons ? 1 : 0,
    normalizeSpeechRate(safeSettings.speechRate),
    userId
  );

  await ensureLanguageProgress(userId, nextTargetLanguage);
  return await getSettings(userId);
}

async function getCategoryMastery(userId = 1, language, category) {
  const row = await db
    .prepare("SELECT mastery FROM category_progress WHERE user_id = ? AND language = ? AND category = ?")
    .get(userId, language, category);
  return row ? row.mastery : 0;
}

async function getCategoryProgress(userId = 1, language) {
  return (await db
    .prepare(`
      SELECT category, mastery, attempts, total_answers, correct_answers, level_unlocked, last_practiced_at
      FROM category_progress
      WHERE user_id = ? AND language = ?
    `)
    .all(userId, language))
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

async function getTotalTodayXpAllLanguages(userId = 1, today = toIsoDate()) {
  const row = await db.prepare(`
    SELECT COALESCE(SUM(xp), 0) AS total_xp
    FROM daily_xp
    WHERE user_id = ? AND date = ?
  `).get(userId, today);
  return row ? row.total_xp : 0;
}

async function getProgress(userId = 1, language) {
  await ensureUserState(userId);
  const safeLanguage = language ? normalizeLanguageId(language, "") : "";
  const categories = safeLanguage ? await getCategoryProgress(userId, safeLanguage) : [];

  if (safeLanguage) {
    await ensureLanguageProgress(userId, safeLanguage);
    const languageRow = await db.prepare(`
      SELECT streak, learner_level, last_completed_date
      FROM language_progress
      WHERE user_id = ? AND language = ?
    `).get(userId, safeLanguage);

    const historyTotals = await db.prepare(`
      SELECT COALESCE(SUM(xp_gained), 0) AS total_xp
      FROM session_history
      WHERE user_id = ? AND language = ?
    `).get(userId, safeLanguage);

    return {
      language: safeLanguage,
      totalXp: Number(historyTotals.total_xp),
      todayXp: await getTodayXp(userId, safeLanguage),
      streak: liveStreak(languageRow.streak, languageRow.last_completed_date),
      learnerLevel: languageRow.learner_level,
      lastCompletedDate: languageRow.last_completed_date,
      categories
    };
  }

  const row = await db.prepare(`
    SELECT total_xp, streak, learner_level, last_completed_date
    FROM progress
    WHERE user_id = ?
  `).get(userId);

  return {
    language: null,
    totalXp: row.total_xp,
    todayXp: await getTotalTodayXpAllLanguages(userId),
    streak: liveStreak(row.streak, row.last_completed_date),
    learnerLevel: row.learner_level,
    lastCompletedDate: row.last_completed_date,
    categories
  };
}

async function getProgressOverview(userId = 1) {
  await ensureUserState(userId);
  await sanitizeLanguageProgressRowsForUser(userId);
  const rows = await db.prepare(`
    SELECT language, total_xp, streak, learner_level, last_completed_date
    FROM language_progress
    WHERE user_id = ?
    ORDER BY updated_at DESC, language ASC
  `).all(userId);

  const languages = await Promise.all(
    rows.map(async (row) => ({
      language: row.language,
      totalXp: row.total_xp,
      todayXp: await getTodayXp(userId, row.language),
      streak: liveStreak(row.streak, row.last_completed_date),
      learnerLevel: row.learner_level,
      lastCompletedDate: row.last_completed_date
    }))
  );

  return {
    totalXp: rows.reduce((sum, row) => sum + row.total_xp, 0),
    languages
  };
}

async function getRecentCategoryAccuracy(userId = 1, language, category, limit = 5) {
  const safeLimit = Number.isInteger(limit) ? Math.max(1, Math.min(limit, 15)) : 5;
  const rows = await db
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

async function createActiveSession({
  userId = 1,
  sessionId,
  language,
  category,
  difficultyLevel,
  questions,
  expiresAt
}) {
  await ensureUserState(userId);
  await db.prepare(`
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

async function getActiveSession(sessionId, userId = 1) {
  const row = await db.prepare(`
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

async function markActiveSessionCompleted(sessionId, userId = 1) {
  await db.prepare(`
    UPDATE active_sessions
    SET completed = 1,
        completed_at = CURRENT_TIMESTAMP
    WHERE session_id = ? AND user_id = ?
  `).run(sessionId, userId);
}

async function pruneExpiredActiveSessions(userId = 1, todayIso = toIsoDate()) {
  await db.prepare(`
    DELETE FROM active_sessions
    WHERE user_id = ? AND (completed = 1 OR expires_at < ?)
  `).run(userId, todayIso);
}

async function upsertItemProgressAttempt({
  userId = 1,
  language,
  category,
  itemId,
  objective,
  correct,
  errorType,
  today,
  flashcardKnown = false
}) {
  const existing = await db.prepare(`
    SELECT ease, streak, attempts, correct, error_count, flashcard_known
    FROM item_progress
    WHERE user_id = ? AND language = ? AND category = ? AND item_id = ?
  `).get(userId, language, category, itemId);

  // Once an item is explicitly marked "known" via a flashcard it stays known.
  const nextKnown = (flashcardKnown && correct) || (existing && existing.flashcard_known) ? 1 : 0;

  const previousEase = existing ? existing.ease : 1.8;
  const previousStreak = existing ? existing.streak : 0;
  const nextEase = correct
    ? Math.min(2.5, Number((previousEase + 0.05).toFixed(2)))
    : Math.max(1.3, Number((previousEase - 0.2).toFixed(2)));
  // Flashcards marked "known" jump to streak 4 so future reviews keep growing naturally
  const nextStreak = flashcardKnown && correct ? Math.max(4, previousStreak + 1) : correct ? previousStreak + 1 : 0;
  const intervalDays = flashcardKnown && correct
    ? Math.max(30, Math.round((nextStreak - 1) * nextEase))
    : correct
    ? nextStreak === 1 ? 1
    : nextStreak === 2 ? 6
    : Math.round((nextStreak - 1) * nextEase)
    : 1;
  const nextDueDate = addDaysIso(today, intervalDays);

  if (!existing) {
    await db.prepare(`
      INSERT INTO item_progress (
        user_id, language, category, item_id, objective, ease, streak, attempts, correct, error_count,
        last_error_type, last_seen_date, next_due_date, flashcard_known
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)
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
      nextDueDate,
      nextKnown
    );
    return;
  }

  await db.prepare(`
    UPDATE item_progress
    SET objective = ?,
        ease = ?,
        streak = ?,
        attempts = ?,
        correct = ?,
        error_count = ?,
        last_error_type = ?,
        last_seen_date = ?,
        next_due_date = ?,
        flashcard_known = ?
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
    nextKnown,
    userId,
    language,
    category,
    itemId
  );
}

async function recordAttemptHistory({
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
  await db.prepare(`
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

async function addDailyXp(userId = 1, language, date, xpGained) {
  const safeXp = Number.isFinite(xpGained) ? Math.max(0, Math.floor(xpGained)) : 0;
  await db.prepare(`
    INSERT INTO daily_xp (user_id, language, date, xp)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, language, date) DO UPDATE SET xp = daily_xp.xp + excluded.xp
  `).run(userId, language, date, safeXp);
}

async function getTodayXp(userId = 1, language, today = toIsoDate()) {
  const row = await db.prepare(`
    SELECT xp
    FROM daily_xp
    WHERE user_id = ? AND language = ? AND date = ?
  `).get(userId, language, today);
  return row ? row.xp : 0;
}

async function getItemSelectionHints(userId = 1, language, category, today = toIsoDate()) {
  const dueRows = await db.prepare(`
    SELECT item_id
    FROM item_progress
    WHERE user_id = ? AND language = ? AND category = ? AND (next_due_date IS NULL OR next_due_date <= ?)
    -- The WHERE admits rows with no scheduled date, and the dialects disagree on
    -- where those sort: SQLite puts NULLs first in ASC, Postgres puts them last.
    -- Left implicit, an unscheduled item would lead the queue on SQLite and be
    -- truncated away by the LIMIT on Postgres. Say which one we mean.
    ORDER BY next_due_date ASC NULLS FIRST, error_count DESC
    LIMIT 20
  `).all(userId, language, category, today);

  const weakRows = await db.prepare(`
    SELECT item_id
    FROM item_progress
    WHERE user_id = ? AND language = ? AND category = ?
    ORDER BY
      CASE WHEN attempts > 0 THEN CAST(correct AS REAL) / attempts ELSE 0 END ASC,
      error_count DESC
    LIMIT 20
  `).all(userId, language, category);

  const notDueRows = await db.prepare(`
    SELECT item_id
    FROM item_progress
    WHERE user_id = ? AND language = ? AND category = ? AND next_due_date > ?
  `).all(userId, language, category, today);

  return {
    dueItemIds: dueRows.map((row) => row.item_id),
    weakItemIds: weakRows.map((row) => row.item_id),
    notDueItemIds: notDueRows.map((row) => row.item_id)
  };
}

async function getMistakeReviewSelection(userId = 1, language, limit = 10) {
  const safeLimit = Number.isInteger(limit) ? Math.max(1, Math.min(20, limit)) : 10;
  // Fetch a larger pool so we can randomise without losing the worst items
  const fetchLimit = Math.min(safeLimit * 3, 60);
  const rows = await db.prepare(`
    SELECT
      item_id,
      category,
      attempts,
      correct,
      error_count,
      last_error_type,
      last_seen_date
    FROM item_progress
    WHERE user_id = ?
      AND language = ?
      AND attempts > 0
      AND error_count > 0
      AND streak = 0
    ORDER BY
      error_count DESC,
      CASE WHEN attempts > 0 THEN CAST(correct AS REAL) / attempts ELSE 0 END ASC
    LIMIT ?
  `).all(userId, language, fetchLimit);

  // Shuffle the candidate pool so the same items don't always appear
  for (let i = rows.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rows[i], rows[j]] = [rows[j], rows[i]];
  }
  const selected = rows.slice(0, safeLimit);

  return {
    itemIds: selected.map((row) => row.item_id),
    count: rows.length,
    categories: Array.from(new Set(selected.map((row) => row.category).filter(Boolean)))
  };
}

async function recordExerciseUsage({
  userId = 1,
  language,
  category,
  itemId,
  correct
}) {
  const existing = await db.prepare(`
    SELECT attempts, correct_attempts
    FROM exercise_usage
    WHERE user_id = ? AND language = ? AND category = ? AND item_id = ?
  `).get(userId, language, category, itemId);

  const attempts = (existing?.attempts || 0) + 1;
  const correctAttempts = (existing?.correct_attempts || 0) + (correct ? 1 : 0);
  const completionRate = attempts > 0 ? Number((correctAttempts / attempts).toFixed(4)) : 0;

  await db.prepare(`
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

async function getCategoryRecommendations(userId = 1, language) {
  const categoryProgress = await getCategoryProgress(userId, language);
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

async function createCommunityExercise({
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
  return await db.prepare(`
    INSERT INTO community_exercises (
      user_id, language, category, prompt, correct_answer, hints_json, difficulty,
      audio_url, image_url, cultural_note, exercise_type, moderation_status
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    RETURNING id, language, category, prompt, correct_answer, hints_json, difficulty,
              audio_url, image_url, cultural_note, exercise_type, moderation_status, created_at
  `).get(
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
}

function parseCommunityExerciseRow(row) {
  if (!row) return null;
  let hints = [];
  try {
    hints = JSON.parse(row.hints_json || "[]");
  } catch (_error) {
    hints = [];
  }

  return {
    id: row.id,
    language: row.language,
    category: row.category,
    prompt: row.prompt,
    correctAnswer: row.correct_answer,
    hints: Array.isArray(hints) ? hints : [],
    difficulty: row.difficulty,
    audioUrl: row.audio_url,
    imageUrl: row.image_url,
    culturalNote: row.cultural_note,
    exerciseType: row.exercise_type,
    moderationStatus: row.moderation_status,
    createdAt: row.created_at,
    reviewerComment: row.reviewer_comment || "",
    reviewedAt: row.reviewed_at || null,
    reviewedBy: row.reviewer_id
      ? { id: row.reviewer_id, displayName: row.reviewer_name }
      : null,
    submitter: row.submitter_id
      ? {
          id: row.submitter_id,
          email: row.submitter_email,
          displayName: row.submitter_name
        }
      : null
  };
}

async function listCommunityExercises({
  userId = 1,
  includeAll = false,
  language = "",
  category = "",
  moderationStatus = "",
  limit = 50
}) {
  const safeLimit = Number.isInteger(limit) ? Math.max(1, Math.min(limit, 200)) : 50;
  const filters = [];
  const params = [];

  if (!includeAll) {
    filters.push("ce.user_id = ?");
    params.push(userId);
  }
  if (language) {
    filters.push("ce.language = ?");
    params.push(String(language).trim().toLowerCase());
  }
  if (category) {
    filters.push("ce.category = ?");
    params.push(String(category).trim());
  }
  if (moderationStatus) {
    filters.push("ce.moderation_status = ?");
    params.push(String(moderationStatus).trim().toLowerCase());
  }

  const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const rows = await db.prepare(`
    SELECT
      ce.id,
      ce.language,
      ce.category,
      ce.prompt,
      ce.correct_answer,
      ce.hints_json,
      ce.difficulty,
      ce.audio_url,
      ce.image_url,
      ce.cultural_note,
      ce.exercise_type,
      ce.moderation_status,
      ce.created_at,
      ce.reviewer_comment,
      ce.reviewed_by,
      ce.reviewed_at,
      u.id AS submitter_id,
      u.email AS submitter_email,
      u.display_name AS submitter_name,
      r.id AS reviewer_id,
      r.display_name AS reviewer_name
    FROM community_exercises ce
    JOIN users u ON u.id = ce.user_id
    LEFT JOIN users r ON r.id = ce.reviewed_by
    ${whereClause}
    ORDER BY
      CASE ce.moderation_status
        WHEN 'pending' THEN 0
        WHEN 'approved' THEN 1
        WHEN 'rejected' THEN 2
        ELSE 3
      END,
      ce.created_at DESC
    LIMIT ?
  `).all(...params, safeLimit);

  return rows.map(parseCommunityExerciseRow);
}

async function updateCommunityExerciseModerationStatus({
  id,
  moderationStatus,
  reviewerComment = "",
  reviewedBy = null
}: {
  id: number;
  moderationStatus: string;
  reviewerComment?: string;
  reviewedBy?: number | null;
}) {
  const safeStatus = String(moderationStatus || "pending").trim().toLowerCase();
  const safeComment = String(reviewerComment || "").trim();
  await db.prepare(`
    UPDATE community_exercises
    SET moderation_status = ?,
        reviewer_comment = ?,
        reviewed_by = ?,
        reviewed_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(safeStatus, safeComment, reviewedBy ?? null, Number(id));

  const row = await db.prepare(`
    SELECT
      ce.id,
      ce.language,
      ce.category,
      ce.prompt,
      ce.correct_answer,
      ce.hints_json,
      ce.difficulty,
      ce.audio_url,
      ce.image_url,
      ce.cultural_note,
      ce.exercise_type,
      ce.moderation_status,
      ce.created_at,
      ce.reviewer_comment,
      ce.reviewed_by,
      ce.reviewed_at,
      u.id AS submitter_id,
      u.email AS submitter_email,
      u.display_name AS submitter_name,
      r.id AS reviewer_id,
      r.display_name AS reviewer_name
    FROM community_exercises ce
    JOIN users u ON u.id = ce.user_id
    LEFT JOIN users r ON r.id = ce.reviewed_by
    WHERE ce.id = ?
  `).get(Number(id));

  return parseCommunityExerciseRow(row);
}

async function getPendingCommunityExerciseCount(): Promise<number> {
  const row: any = await db.prepare(`
    SELECT COUNT(1) AS cnt FROM community_exercises WHERE moderation_status = 'pending'
  `).get();
  return row?.cnt ?? 0;
}

async function getApprovedCommunityExercises() {
  const rows: any[] = await db.prepare(`
    SELECT id, language, category, prompt, correct_answer, hints_json,
           difficulty, audio_url, image_url, cultural_note, exercise_type
    FROM community_exercises
    WHERE moderation_status = 'approved'
  `).all();
  return rows.map((row) => {
    let hints: string[] = [];
    try { hints = JSON.parse(row.hints_json || "[]"); } catch (_) { hints = []; }
    return {
      id: row.id as number,
      language: row.language as string,
      category: row.category as string,
      prompt: row.prompt as string,
      correctAnswer: row.correct_answer as string,
      hints: Array.isArray(hints) ? hints : [],
      difficulty: row.difficulty as string,
      audioUrl: row.audio_url as string,
      imageUrl: row.image_url as string,
      culturalNote: row.cultural_note as string,
      exerciseType: row.exercise_type as string
    };
  });
}

function hashVisitorIp(ipAddress) {
  const safeIpAddress = String(ipAddress || "").trim();
  if (!safeIpAddress) return "";
  const salt = String(process.env.VISITOR_HASH_SALT || "lingoflow-visitor-salt");
  return crypto
    .createHash("sha256")
    .update(`${salt}:${safeIpAddress}`)
    .digest("hex");
}

async function recordLoginPageVisit({ ipAddress }) {
  const visitorHash = hashVisitorIp(ipAddress);
  if (!visitorHash) return { ok: false };
  const today = toIsoDate();

  const tx = db.transaction(async () => {
    await db.prepare(`
      INSERT INTO login_page_daily_stats (date, total_visits, unique_visitors, updated_at)
      VALUES (?, 1, 0, CURRENT_TIMESTAMP)
      ON CONFLICT(date) DO UPDATE SET
        total_visits = login_page_daily_stats.total_visits + 1,
        updated_at = CURRENT_TIMESTAMP
    `).run(today);

    const insertedUnique = await db.prepare(`
      INSERT INTO login_page_unique_visitors (date, visitor_hash)
      VALUES (?, ?)
      ON CONFLICT (date, visitor_hash) DO NOTHING
    `).run(today, visitorHash);

    if (insertedUnique.changes > 0) {
      await db.prepare(`
        UPDATE login_page_daily_stats
        SET unique_visitors = unique_visitors + 1,
            updated_at = CURRENT_TIMESTAMP
        WHERE date = ?
      `).run(today);
    }
  });

  await tx();
  return { ok: true };
}

async function getVisitorStats({
  sinceDays = 30
} = {}) {
  const safeSinceDays = Number.isInteger(sinceDays)
    ? Math.max(1, Math.min(sinceDays, 365))
    : 30;
  const since = addDaysIso(toIsoDate(), -(safeSinceDays - 1));
  const limit = safeSinceDays;

  const totals = await db.prepare(`
    SELECT
      COALESCE(SUM(total_visits), 0) AS total_visits,
      COALESCE(SUM(unique_visitors), 0) AS unique_visitors
    FROM login_page_daily_stats
    WHERE date >= ?
  `).get(since);

  const dailyRows = (await db.prepare(`
    SELECT date, total_visits, unique_visitors
    FROM login_page_daily_stats
    WHERE date >= ?
    ORDER BY date DESC
    LIMIT ?
  `).all(since, limit)).map((row) => ({
    date: row.date,
    totalVisits: row.total_visits,
    uniqueVisitors: row.unique_visitors
  }));

  return {
    sinceDays: safeSinceDays,
    loginPage: {
      totalVisits: totals?.total_visits || 0,
      uniqueVisitors: totals?.unique_visitors || 0,
      daily: dailyRows
    }
  };
}

async function addBookmark(userId, { questionId, prompt, answer, language, category = "" }) {
  await db.prepare(`
    INSERT INTO bookmarks (user_id, question_id, prompt, answer, language, category)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT (user_id, question_id) DO NOTHING
  `).run(userId, String(questionId), String(prompt), String(answer), String(language), String(category));
}

async function removeBookmark(userId, questionId) {
  await db.prepare(`DELETE FROM bookmarks WHERE user_id = ? AND question_id = ?`).run(userId, String(questionId));
}

async function getBookmarks(userId, language?) {
  const safeLanguage = language ? normalizeLanguageId(language, "") : null;
  const rows = safeLanguage
    ? await db.prepare(`SELECT * FROM bookmarks WHERE user_id = ? AND language = ? ORDER BY created_at DESC`).all(userId, safeLanguage)
    : await db.prepare(`SELECT * FROM bookmarks WHERE user_id = ? ORDER BY created_at DESC`).all(userId);
  return rows.map((row) => ({
    id: row.id,
    questionId: row.question_id,
    prompt: row.prompt,
    answer: row.answer,
    language: row.language,
    category: row.category,
    createdAt: row.created_at
  }));
}

async function isBookmarked(userId, questionId) {
  const row = await db.prepare(`SELECT 1 FROM bookmarks WHERE user_id = ? AND question_id = ?`).get(userId, String(questionId));
  return Boolean(row);
}

// Items the user explicitly marked "Known" on a flashcard. Returns the
// identifying keys; callers resolve item_id -> prompt/answer text via content.
async function getKnownFlashcardItems(userId, language) {
  const safeLanguage = normalizeLanguageId(language, "");
  if (!safeLanguage) return [];
  const rows = await db.prepare(`
    SELECT category, item_id
    FROM item_progress
    WHERE user_id = ? AND language = ? AND flashcard_known = 1
  `).all(userId, safeLanguage);
  return rows.map((row) => ({ category: row.category, itemId: row.item_id }));
}

async function getSpeedMatchHighscore(userId = 1, language) {
  const safeLanguage = normalizeLanguageId(language, "spanish");
  await ensureLanguageProgress(userId, safeLanguage);
  const row = await db.prepare(`
    SELECT speed_match_highscore FROM language_progress WHERE user_id = ? AND language = ?
  `).get(userId, safeLanguage);
  return row ? Number(row.speed_match_highscore) || 0 : 0;
}

async function updateSpeedMatchHighscore(userId = 1, language, score) {
  const safeLanguage = normalizeLanguageId(language, "spanish");
  const safeScore = Number.isFinite(score) ? Math.max(0, Math.floor(score)) : 0;
  const current = await getSpeedMatchHighscore(userId, safeLanguage);
  if (safeScore > current) {
    await db.prepare(`
      UPDATE language_progress
      SET speed_match_highscore = ?, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ? AND language = ?
    `).run(safeScore, userId, safeLanguage);
    return { highscore: safeScore, isNewBest: true };
  }
  return { highscore: current, isNewBest: false };
}

// Saved story words share a single synthetic item_progress category so the SRS
// UNIQUE(user, language, category, item_id) constraint keeps re-saves idempotent
// regardless of which story (and category) the word came from.
const SAVED_WORD_CATEGORY = "saved_words";

function savedWordItemId(word) {
  return `saved-word:${String(word || "").toLowerCase()}`;
}

// Idempotently records a saved word: a saved_words row for listing and a fresh
// item_progress row so the word enters the spaced-repetition queue. Re-saving the
// same word does not reset its existing schedule.
async function saveReviewWord(userId, { language, word, translation = "", storyId = "", category = "", today = toIsoDate() }) {
  const safeLanguage = normalizeLanguageId(language, "");
  const safeWord = String(word || "").trim().toLowerCase();
  if (!safeLanguage || !safeWord) return false;

  await db.prepare(`
    INSERT INTO saved_words (user_id, language, word, translation, story_id, category)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, language, word) DO UPDATE SET
      translation = CASE WHEN excluded.translation != '' THEN excluded.translation ELSE saved_words.translation END,
      story_id = CASE WHEN excluded.story_id != '' THEN excluded.story_id ELSE saved_words.story_id END,
      category = CASE WHEN excluded.category != '' THEN excluded.category ELSE saved_words.category END
  `).run(userId, safeLanguage, safeWord, String(translation || ""), String(storyId || ""), String(category || ""));

  const itemId = savedWordItemId(safeWord);
  const existing = await db.prepare(`
    SELECT 1 FROM item_progress
    WHERE user_id = ? AND language = ? AND category = ? AND item_id = ?
  `).get(userId, safeLanguage, SAVED_WORD_CATEGORY, itemId);

  if (!existing) {
    await db.prepare(`
      INSERT INTO item_progress (
        user_id, language, category, item_id, objective, ease, streak, attempts, correct, error_count,
        last_error_type, last_seen_date, next_due_date
      )
      VALUES (?, ?, ?, ?, ?, 1.8, 0, 0, 0, 0, '', NULL, ?)
    `).run(userId, safeLanguage, SAVED_WORD_CATEGORY, itemId, String(translation || ""), today);
  }
  return true;
}

async function removeReviewWord(userId, language, word) {
  const safeLanguage = normalizeLanguageId(language, "");
  const safeWord = String(word || "").trim().toLowerCase();
  if (!safeLanguage || !safeWord) return;
  await db.prepare(`DELETE FROM saved_words WHERE user_id = ? AND language = ? AND word = ?`)
    .run(userId, safeLanguage, safeWord);
  await db.prepare(`DELETE FROM item_progress WHERE user_id = ? AND language = ? AND category = ? AND item_id = ?`)
    .run(userId, safeLanguage, SAVED_WORD_CATEGORY, savedWordItemId(safeWord));
}

async function getSavedReviewWords(userId, language?) {
  const safeLanguage = language ? normalizeLanguageId(language, "") : null;
  const rows = safeLanguage
    ? await db.prepare(`SELECT * FROM saved_words WHERE user_id = ? AND language = ? ORDER BY created_at DESC`).all(userId, safeLanguage)
    : await db.prepare(`SELECT * FROM saved_words WHERE user_id = ? ORDER BY created_at DESC`).all(userId);
  return rows.map((row) => ({
    word: row.word,
    translation: row.translation,
    language: row.language,
    storyId: row.story_id,
    category: row.category,
    createdAt: row.created_at
  }));
}

// Surfaces saved words as practice-pool items (English prompt → target word) so
// they resurface in practice/speak/listen sessions. Item ids line up with the
// saved-word item_progress rows for future SRS scheduling.
async function getSavedWordPoolItems(userId, language) {
  const safeLanguage = normalizeLanguageId(language, "");
  if (!safeLanguage) return [];
  const rows = await db.prepare(`
    SELECT word, translation FROM saved_words WHERE user_id = ? AND language = ?
  `).all(userId, safeLanguage);
  return rows
    .filter((row) => String(row.translation || "").trim())
    .map((row) => ({
      id: savedWordItemId(row.word),
      level: "a1",
      difficulty: "a1",
      prompt: String(row.translation),
      correctAnswer: String(row.word),
      target: String(row.word)
    }));
}

// Saves how far through a story the learner has read so they can resume later.
// Never regresses the furthest sentence reached and never marks the story complete.
async function upsertStoryProgress(userId, { storyId, language, sentenceIndex }) {
  const safeStoryId = String(storyId || "").trim();
  const safeLanguage = normalizeLanguageId(language, "");
  if (!safeStoryId || !safeLanguage) return false;
  const idx = Number.isFinite(sentenceIndex) ? Math.max(0, Math.floor(sentenceIndex)) : 0;
  await db.prepare(`
    INSERT INTO story_completions (user_id, language, story_id, last_sentence_index, started_at, completed_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, NULL)
    ON CONFLICT(user_id, story_id) DO UPDATE SET
      last_sentence_index = CASE
        WHEN excluded.last_sentence_index > story_completions.last_sentence_index
        THEN excluded.last_sentence_index
        ELSE story_completions.last_sentence_index
      END,
      started_at = COALESCE(story_completions.started_at, excluded.started_at)
  `).run(userId, safeLanguage, safeStoryId, idx);
  return true;
}

// Returns per-story reading state (resume point, completion, quiz score) for the
// Story Reader library, keyed by story id.
async function getStoryProgress(userId, language?) {
  const safeLanguage = language ? normalizeLanguageId(language, "") : null;
  const rows = safeLanguage
    ? await db.prepare(`SELECT story_id, last_sentence_index, completed_at, quiz_score, quiz_total FROM story_completions WHERE user_id = ? AND language = ?`).all(userId, safeLanguage)
    : await db.prepare(`SELECT story_id, last_sentence_index, completed_at, quiz_score, quiz_total FROM story_completions WHERE user_id = ?`).all(userId);
  const map = {};
  for (const row of rows) {
    map[row.story_id] = {
      lastSentenceIndex: row.last_sentence_index || 0,
      completedAt: row.completed_at || null,
      quizScore: row.quiz_score == null ? null : row.quiz_score,
      quizTotal: row.quiz_total == null ? null : row.quiz_total
    };
  }
  return map;
}

// Records that a learner finished reading a story, storing the quiz score when one
// was taken. Idempotent: re-finishing refreshes the timestamp without duplicating rows.
async function markStoryComplete(userId, { storyId, language, quizScore = null, quizTotal = null }) {
  const safeStoryId = String(storyId || "").trim();
  const safeLanguage = normalizeLanguageId(language, "");
  if (!safeStoryId || !safeLanguage) return false;
  const score = Number.isFinite(quizScore) ? Math.max(0, Math.floor(quizScore)) : null;
  const total = Number.isFinite(quizTotal) ? Math.max(0, Math.floor(quizTotal)) : null;
  await db.prepare(`
    INSERT INTO story_completions (user_id, language, story_id, completed_at, started_at, quiz_score, quiz_total)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?)
    ON CONFLICT(user_id, story_id) DO UPDATE SET
      completed_at = CURRENT_TIMESTAMP,
      started_at = COALESCE(story_completions.started_at, CURRENT_TIMESTAMP),
      quiz_score = COALESCE(excluded.quiz_score, story_completions.quiz_score),
      quiz_total = COALESCE(excluded.quiz_total, story_completions.quiz_total)
  `).run(userId, safeLanguage, safeStoryId, score, total);
  return true;
}

// Awards XP for finishing a story exactly once per (user, story) and rolls the
// daily streak forward the same way a practice session does. Mirrors recordPracticeXp's
// streak math but does not write to session_history (reading is not a session).
async function awardStoryXp(userId, { storyId, language, xpGained, today = toIsoDate() }) {
  await ensureUserState(userId);
  const safeStoryId = String(storyId || "").trim();
  const safeLanguage = normalizeLanguageId(language, "spanish");
  if (!safeStoryId) {
    return { xpGained: 0, alreadyAwarded: false, todayXp: await getTodayXp(userId, safeLanguage, today) };
  }
  const existing = await db
    .prepare(`SELECT xp_awarded FROM story_completions WHERE user_id = ? AND story_id = ?`)
    .get(userId, safeStoryId);
  if (existing && existing.xp_awarded) {
    return { xpGained: 0, alreadyAwarded: true, todayXp: await getTodayXp(userId, safeLanguage, today) };
  }
  const gain = Number.isFinite(xpGained) ? Math.max(0, Math.floor(xpGained)) : 0;
  const tx = db.transaction(async () => {
    await ensureLanguageProgress(userId, safeLanguage);
    const progress = await db
      .prepare(`SELECT streak, last_completed_date FROM language_progress WHERE user_id = ? AND language = ?`)
      .get(userId, safeLanguage);
    let nextStreak = progress.streak;
    if (!progress.last_completed_date) {
      nextStreak = 1;
    } else {
      const last = new Date(progress.last_completed_date + "T00:00:00Z");
      const current = new Date(today + "T00:00:00Z");
      const diffDays = Math.floor((current.getTime() - last.getTime()) / (24 * 60 * 60 * 1000));
      if (diffDays === 1) nextStreak = progress.streak + 1;
      else if (diffDays > 1) nextStreak = 1;
    }
    await addDailyXp(userId, safeLanguage, today, gain);
    await db.prepare(`
      UPDATE language_progress
      SET streak = ?, last_completed_date = ?, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ? AND language = ?
    `).run(nextStreak, today, userId, safeLanguage);
    await db.prepare(`UPDATE story_completions SET xp_awarded = 1 WHERE user_id = ? AND story_id = ?`)
      .run(userId, safeStoryId);
    await refreshAggregateProgressFromLanguageProgress(userId);
  });
  await tx();
  return { xpGained: gain, alreadyAwarded: false, todayXp: await getTodayXp(userId, safeLanguage, today) };
}

// Aggregates the learner's reading activity. Levels/themes are enriched in the
// route from in-memory story metadata, which the db layer cannot see.
async function getReadingStats(userId, language?) {
  const safeLanguage = language ? normalizeLanguageId(language, "") : null;
  const completedRows = safeLanguage
    ? await db.prepare(`SELECT story_id, quiz_score, quiz_total FROM story_completions WHERE user_id = ? AND language = ? AND completed_at IS NOT NULL`).all(userId, safeLanguage)
    : await db.prepare(`SELECT story_id, quiz_score, quiz_total FROM story_completions WHERE user_id = ? AND completed_at IS NOT NULL`).all(userId);
  const wordsRow = safeLanguage
    ? await db.prepare(`SELECT COUNT(1) AS c FROM saved_words WHERE user_id = ? AND language = ?`).get(userId, safeLanguage)
    : await db.prepare(`SELECT COUNT(1) AS c FROM saved_words WHERE user_id = ?`).get(userId);
  return {
    completedStoryIds: completedRows.map((row) => row.story_id),
    storiesRead: completedRows.length,
    wordsSaved: wordsRow ? wordsRow.c : 0,
    quizzesTaken: completedRows.filter((row) => row.quiz_total != null).length
  };
}

// Returns the set of story ids the learner has actually finished (a row may exist
// only to hold resume progress, so completion is gated on completed_at).
async function getCompletedStoryIds(userId, language?) {
  const safeLanguage = language ? normalizeLanguageId(language, "") : null;
  const rows = safeLanguage
    ? await db.prepare(`SELECT story_id FROM story_completions WHERE user_id = ? AND language = ? AND completed_at IS NOT NULL`).all(userId, safeLanguage)
    : await db.prepare(`SELECT story_id FROM story_completions WHERE user_id = ? AND completed_at IS NOT NULL`).all(userId);
  return rows.map((row) => row.story_id);
}

async function getStats(userId = 1, language) {
  const settings = await getSettings(userId);
  const safeLanguage = normalizeLanguageId(language, settings.targetLanguage || "spanish");
  const progress = await getProgress(userId, safeLanguage);
  const categoryProgress = await getCategoryProgress(userId, safeLanguage);

  // Date windows are computed here and bound as parameters rather than expressed
  // with SQLite's DATE('now', ...) modifiers, which have no Postgres equivalent.
  const today = toIsoDate();
  const sinceSevenDays = addDaysIso(today, -6);
  const sinceFourteenDays = addDaysIso(today, -13);
  const sinceHalfYear = addDaysIso(today, -186);

  const totals = await db
    .prepare(`
      SELECT
        COUNT(1) AS sessions_completed,
        COALESCE(AVG(accuracy), 0) AS avg_accuracy,
        COALESCE(SUM(xp_gained), 0) AS total_xp_from_sessions
      FROM session_history
      WHERE user_id = ? AND language = ?
    `)
    .get(userId, safeLanguage);

  const recentSessions = await db
    .prepare(`
      SELECT COUNT(1) AS sessions_last_7_days
      FROM session_history
      WHERE user_id = ? AND language = ? AND substr(completed_at, 1, 10) >= ?
    `)
    .get(userId, safeLanguage, sinceSevenDays);
  const sessionsByDayRows = await db
    .prepare(`
      SELECT substr(completed_at, 1, 10) AS day, COUNT(1) AS sessions
      FROM session_history
      WHERE user_id = ? AND language = ? AND substr(completed_at, 1, 10) >= ?
      GROUP BY substr(completed_at, 1, 10)
      ORDER BY day ASC
    `)
    .all(userId, safeLanguage, sinceSevenDays);
  const sessionsByDayMap = new Map(
    sessionsByDayRows.map((row) => [row.day, row.sessions])
  );
  const sessionsByDay = Array.from({ length: 7 }, (_, index) => {
    const offset = 6 - index;
    const date = toIsoDate(new Date(Date.now() - (offset * 24 * 60 * 60 * 1000)));
    return {
      date,
      sessions: sessionsByDayMap.get(date) || 0
    };
  });

  const categoryStats = (await db
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
    .all(userId, safeLanguage))
    .map((row) => ({
      category: row.category,
      sessions: row.sessions,
      accuracy: Number((row.accuracy * 100).toFixed(1)),
      lastCompletedAt: row.last_completed_at
    }));

  const errorTypeTrend = (await db
    .prepare(`
      SELECT error_type, COUNT(1) AS count
      FROM attempt_history
      WHERE user_id = ? AND language = ? AND correct = 0 AND substr(created_at, 1, 10) >= ?
      GROUP BY error_type
      ORDER BY count DESC
      LIMIT 6
    `)
    .all(userId, safeLanguage, sinceFourteenDays))
    .map((row) => ({ errorType: row.error_type, count: row.count }));

  const objectiveStats = (await db
    .prepare(`
      SELECT
        objective,
        COUNT(1) AS attempts,
        SUM(correct) AS correct
      FROM attempt_history
      WHERE user_id = ? AND language = ? AND objective <> ''
      GROUP BY objective
      HAVING COUNT(1) > 0
      ORDER BY CAST(SUM(correct) AS REAL) / COUNT(1) ASC, COUNT(1) DESC
      LIMIT 8
    `)
    .all(userId, safeLanguage))
    .map((row) => ({
      objective: row.objective,
      attempts: row.attempts,
      accuracy: Number(((row.correct / row.attempts) * 100).toFixed(1))
    }));

  const usageStats = (await db.prepare(`
    SELECT item_id, attempts, correct_attempts, completion_rate, last_used_at
    FROM exercise_usage
    WHERE user_id = ? AND language = ?
    ORDER BY completion_rate ASC, attempts DESC, last_used_at DESC
    LIMIT 6
  `).all(userId, safeLanguage)).map((row) => ({
    itemId: row.item_id,
    attempts: row.attempts,
    correctAttempts: row.correct_attempts,
    completionRate: Number((row.completion_rate * 100).toFixed(1)),
    lastUsedAt: row.last_used_at
  }));
  const dailyXpHistory = (await db.prepare(`
    SELECT date, xp
    FROM daily_xp
    WHERE user_id = ? AND language = ? AND date >= ?
    ORDER BY date ASC
  `).all(userId, safeLanguage, sinceHalfYear)).map((row) => ({
    date: row.date,
    xp: row.xp
  }));

  const mistakeReviewCount = (await db.prepare(`
    SELECT COUNT(*) as count
    FROM item_progress
    WHERE user_id = ?
      AND language = ?
      AND attempts > 0
      AND error_count > 0
      AND streak = 0
  `).get(userId, safeLanguage) as { count: number }).count;

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
    sessionsByDay,
    weakestCategories,
    recommendedCategories: await getCategoryRecommendations(userId, safeLanguage),
    categoryStats,
    errorTypeTrend,
    objectiveStats,
    usageStats,
    dailyXpHistory,
    mistakeReviewCount
  };
}

async function recordSession({
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
  await ensureUserState(userId);
  const safeLanguage = normalizeLanguageId(language, "spanish");
  const accuracy = maxScore > 0 ? score / maxScore : 0;

  const existing = await db
    .prepare(`
      SELECT mastery, attempts, total_answers, correct_answers
      FROM category_progress
      WHERE user_id = ? AND language = ? AND category = ?
    `)
    .get(userId, safeLanguage, category);

  const oldMastery = existing ? existing.mastery : 0;
  const masteryDelta = ((accuracy - 0.6) * 28) + (difficultyLevel === "b2" ? 4 : difficultyLevel === "b1" ? 2 : 0);
  const newMastery = Math.max(0, Math.min(100, oldMastery + masteryDelta));
  const levelUnlocked = levelFromMastery(newMastery);

  if (!existing) {
    await db.prepare(`
      INSERT INTO category_progress (
        user_id, language, category, mastery, attempts, total_answers, correct_answers, level_unlocked, last_practiced_at
      )
      VALUES (?, ?, ?, ?, 1, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(userId, safeLanguage, category, newMastery, maxScore, score, levelUnlocked);
  } else {
    await db.prepare(`
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
      safeLanguage,
      category
    );
  }

  await db.prepare(`
    INSERT INTO session_history (user_id, language, category, score, max_score, accuracy, xp_gained, difficulty_level)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(userId, safeLanguage, category, score, maxScore, accuracy, xpGained, difficultyLevel);

  await ensureLanguageProgress(userId, safeLanguage);
  const progress = await db.prepare(`
    SELECT total_xp, streak, last_completed_date
    FROM language_progress
    WHERE user_id = ? AND language = ?
  `).get(userId, safeLanguage);

  let nextStreak = progress.streak;
  if (!progress.last_completed_date) {
    nextStreak = 1;
  } else {
    const last = new Date(progress.last_completed_date + "T00:00:00Z");
    const current = new Date(today + "T00:00:00Z");
    const diffDays = Math.floor((current.getTime() - last.getTime()) / (24 * 60 * 60 * 1000));
    if (diffDays === 1) {
      nextStreak = progress.streak + 1;
    } else if (diffDays > 1) {
      nextStreak = 1;
    }
  }

  const totalXp = progress.total_xp + xpGained;
  const learnerLevel = levelFromXp(totalXp);
  await addDailyXp(userId, safeLanguage, today, xpGained);

  await db.prepare(`
    UPDATE language_progress
    SET total_xp = ?,
        streak = ?,
        learner_level = ?,
        last_completed_date = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ? AND language = ?
  `).run(totalXp, nextStreak, learnerLevel, today, userId, safeLanguage);

  await refreshAggregateProgressFromLanguageProgress(userId);

  return {
    xpGained,
    totalXp,
    streak: nextStreak,
    learnerLevel,
    mastery: Number(newMastery.toFixed(1)),
    levelUnlocked
  };
}

async function recordPracticeXp({
  userId = 1,
  language,
  category,
  score,
  maxScore,
  accuracy,
  difficultyLevel,
  xpGained,
  today
}) {
  await ensureUserState(userId);
  const safeLanguage = normalizeLanguageId(language, "spanish");
  await ensureLanguageProgress(userId, safeLanguage);

  const progress = await db.prepare(`
    SELECT total_xp, streak, last_completed_date
    FROM language_progress
    WHERE user_id = ? AND language = ?
  `).get(userId, safeLanguage);

  let nextStreak = progress.streak;
  if (!progress.last_completed_date) {
    nextStreak = 1;
  } else {
    const last = new Date(progress.last_completed_date + "T00:00:00Z");
    const current = new Date(today + "T00:00:00Z");
    const diffDays = Math.floor((current.getTime() - last.getTime()) / (24 * 60 * 60 * 1000));
    if (diffDays === 1) {
      nextStreak = progress.streak + 1;
    } else if (diffDays > 1) {
      nextStreak = 1;
    }
  }

  const totalXp = progress.total_xp + xpGained;
  const learnerLevel = levelFromXp(totalXp);
  await addDailyXp(userId, safeLanguage, today, xpGained);

  await db.prepare(`
    INSERT INTO session_history (user_id, language, category, score, max_score, accuracy, xp_gained, difficulty_level)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(userId, safeLanguage, category, score, maxScore, accuracy, xpGained, difficultyLevel);

  await db.prepare(`
    UPDATE language_progress
    SET total_xp = ?,
        streak = ?,
        learner_level = ?,
        last_completed_date = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ? AND language = ?
  `).run(totalXp, nextStreak, learnerLevel, today, userId, safeLanguage);

  await refreshAggregateProgressFromLanguageProgress(userId);

  return {
    xpGained,
    streak: nextStreak,
    learnerLevel
  };
}

const ACHIEVEMENT_DEFS: Record<string, { name: string; description: string; icon: string }> = {
  streak_3:   { name: "On a Roll",         description: "Maintained a 3-day practice streak",       icon: "flame" },
  streak_7:   { name: "Weekly Warrior",    description: "Maintained a 7-day practice streak",       icon: "flame" },
  streak_30:  { name: "Monthly Master",    description: "Maintained a 30-day practice streak",      icon: "flame" },
  streak_100: { name: "Century Champion",  description: "Maintained a 100-day practice streak",     icon: "trophy" },
  xp_100:     { name: "Getting Started",   description: "Earned 100 XP",                            icon: "star" },
  xp_500:     { name: "Committed Learner", description: "Earned 500 XP",                            icon: "star" },
  xp_1000:    { name: "XP Milestone",      description: "Earned 1,000 XP",                          icon: "star" },
  xp_5000:    { name: "Elite Learner",     description: "Earned 5,000 XP",                          icon: "trophy" },
  polyglot:   { name: "Polyglot",          description: "Practiced 2 or more languages",            icon: "globe" },
  speed_demon:{ name: "Speed Demon",       description: "Perfect session (10+ questions, no hints)", icon: "lightning" },
  night_owl:  { name: "Night Owl",         description: "Practiced between midnight and 4 AM",      icon: "moon" },
  early_bird: { name: "Early Bird",        description: "Practiced between 5 AM and 7 AM",          icon: "sun" }
};

function resolveAchievementDef(achievementId: string) {
  if (ACHIEVEMENT_DEFS[achievementId]) return ACHIEVEMENT_DEFS[achievementId];
  if (achievementId.startsWith("mastery_")) {
    const parts = achievementId.split("_");
    const category = parts.slice(2).join("_");
    return { name: "Category Master", description: `Reached 80%+ mastery in ${category.replace(/_/g, " ")}`, icon: "graduate" };
  }
  if (achievementId.startsWith("completionist_")) {
    const lang = achievementId.replace("completionist_", "");
    return { name: "Completionist", description: `Mastered 10+ categories in ${lang}`, icon: "medal" };
  }
  return { name: achievementId, description: "", icon: "star" };
}

async function checkAndGrantAchievements(userId: number, params: {
  streak: number;
  totalXp: number;
  language: string;
  category: string;
  mastery: number;
  hintsUsed: number;
  revealedAnswers: number;
  score: number;
  maxScore: number;
  isPracticeSession?: boolean;
  now?: Date;
}) {
  const { streak, totalXp, language, category, mastery, hintsUsed, revealedAnswers, score, maxScore, isPracticeSession = false, now = new Date() } = params;
  const newlyUnlocked: Array<{ id: string; name: string; description: string; icon: string; earnedAt: string }> = [];

  const existingIds = new Set<string>(
    (await db.prepare("SELECT achievement_id FROM achievements WHERE user_id = ?").all(userId) as any[])
      .map((r: any) => String(r.achievement_id))
  );

  async function tryGrant(achievementId: string) {
    if (existingIds.has(achievementId)) return;
    try {
      const info = await db.prepare("INSERT INTO achievements (user_id, achievement_id) VALUES (?, ?) ON CONFLICT (user_id, achievement_id) DO NOTHING").run(userId, achievementId);
      if ((info as any).changes > 0) {
        const row: any = await db.prepare("SELECT earned_at FROM achievements WHERE user_id = ? AND achievement_id = ?").get(userId, achievementId);
        newlyUnlocked.push({ id: achievementId, ...resolveAchievementDef(achievementId), earnedAt: row?.earned_at || new Date().toISOString() });
      }
    } catch (_err) {
      // ignore constraint errors
    }
  }

  for (const days of [3, 7, 30, 100]) {
    if (streak >= days) await tryGrant(`streak_${days}`);
  }

  for (const xp of [100, 500, 1000, 5000]) {
    if (totalXp >= xp) await tryGrant(`xp_${xp}`);
  }

  if (!isPracticeSession && mastery >= 80) {
    await tryGrant(`mastery_${language}_${category}`);
  }

  if (!isPracticeSession) {
    const row: any = await db.prepare(
      "SELECT COUNT(*) as cnt FROM category_progress WHERE user_id = ? AND language = ? AND mastery >= 50"
    ).get(userId, language);
    if ((row?.cnt || 0) >= 10) await tryGrant(`completionist_${language}`);
  }

  const langRow: any = await db.prepare(
    "SELECT COUNT(DISTINCT language) as cnt FROM language_progress WHERE user_id = ? AND total_xp > 0"
  ).get(userId);
  if ((langRow?.cnt || 0) >= 2) await tryGrant("polyglot");

  if (!isPracticeSession && score >= 10 && score === maxScore && hintsUsed === 0 && revealedAnswers === 0) {
    await tryGrant("speed_demon");
  }

  const hour = now.getHours();
  if (hour >= 0 && hour < 4) await tryGrant("night_owl");
  if (hour >= 5 && hour <= 7) await tryGrant("early_bird");

  return newlyUnlocked;
}

async function getUserAchievements(userId: number) {
  const rows: any[] = await db.prepare(
    "SELECT achievement_id, earned_at, metadata_json FROM achievements WHERE user_id = ? ORDER BY earned_at DESC"
  ).all(userId) as any[];
  return rows.map((row: any) => ({
    id: row.achievement_id,
    ...resolveAchievementDef(row.achievement_id),
    earnedAt: row.earned_at
  }));
}

async function runInTransaction(operation) {
  const tx = db.transaction(operation);
  return tx();
}

async function getContentFingerprints(): Promise<Record<string, string>> {
  const rows = await db.prepare("SELECT language, category, fingerprint FROM content_versions").all() as any[];
  const result: Record<string, string> = {};
  for (const row of rows) {
    result[`${row.language}:${row.category}`] = row.fingerprint;
  }
  return result;
}

async function upsertContentFingerprint(language: string, category: string, fingerprint: string): Promise<void> {
  await db.prepare(`
    INSERT INTO content_versions (language, category, fingerprint, updated_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(language, category) DO UPDATE SET fingerprint = excluded.fingerprint, updated_at = CURRENT_TIMESTAMP
  `).run(language, category, fingerprint);
}

// Batched form of upsertContentFingerprint for the startup reconciliation, which
// writes one row per language/category (~112 of them). Same reasoning as
// upsertWordTranslations: per-row round-trips are free on SQLite and slow on Neon.
async function upsertContentFingerprints(entries: any[]): Promise<number> {
  if (!Array.isArray(entries) || entries.length === 0) return 0;

  // A single INSERT ... ON CONFLICT cannot touch the same conflicting row twice.
  const deduped = new Map<string, any>();
  for (const entry of entries) {
    deduped.set(`${entry.language}::${entry.category}`, entry);
  }

  const rows = [...deduped.values()];
  const CHUNK = 400;

  for (let offset = 0; offset < rows.length; offset += CHUNK) {
    const chunk = rows.slice(offset, offset + CHUNK);
    const params: any[] = [];
    for (const row of chunk) params.push(row.language, row.category, row.fingerprint);
    const tuples = chunk.map(() => "(?, ?, ?, CURRENT_TIMESTAMP)").join(", ");
    await db.prepare(`
      INSERT INTO content_versions (language, category, fingerprint, updated_at)
      VALUES ${tuples}
      ON CONFLICT(language, category) DO UPDATE SET
        fingerprint = excluded.fingerprint,
        updated_at = CURRENT_TIMESTAMP
    `).run(...params);
  }

  return rows.length;
}

async function resetCategoryProgress(language: string, category: string) {
  await db.transaction(async () => {
    await db.prepare("DELETE FROM item_progress WHERE language = ? AND category = ?").run(language, category);
    await db.prepare("DELETE FROM category_progress WHERE language = ? AND category = ?").run(language, category);
  })();
}

async function createWordTranslationsTable(): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS word_translations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      language TEXT NOT NULL,
      word TEXT NOT NULL,
      translation TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'libretranslate',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(language, word)
    )
  `);
  // Add source column to existing databases that predate this field
  const cols = await db.columnInfo("word_translations") as { name: string }[];
  if (!cols.some((c) => c.name === "source")) {
    await db.exec("ALTER TABLE word_translations ADD COLUMN source TEXT NOT NULL DEFAULT 'libretranslate'");
  }
}

async function getCachedWordTranslations(language: string, words: string[]): Promise<Record<string, string>> {
  if (!words.length) return {};
  const placeholders = words.map(() => "?").join(", ");
  const rows = await db
    .prepare(
      `SELECT word, translation FROM word_translations WHERE language = ? AND word IN (${placeholders})`
    )
    .all(language, ...words) as { word: string; translation: string }[];
  const result: Record<string, string> = {};
  for (const row of rows) result[row.word] = row.translation;
  return result;
}

async function upsertWordTranslation(language: string, word: string, translation: string, source = "libretranslate"): Promise<void> {
  await db.prepare(`
    INSERT INTO word_translations (language, word, translation, source)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(language, word) DO UPDATE SET
      translation = excluded.translation,
      source = excluded.source,
      created_at = CURRENT_TIMESTAMP
  `).run(language, word, translation, source);
}

// Batched form of upsertWordTranslation, used by the startup content seeding.
// One statement per chunk instead of one per word: seeding ~1000 words was a
// thousand sequential round-trips, which is free on local SQLite but takes about
// a minute against a hosted Postgres.
//
// Entries are de-duplicated on (language, word) with the last occurrence winning,
// matching what sequential upserts produced -- and required, because a single
// INSERT ... ON CONFLICT cannot touch the same conflicting row twice.
async function upsertWordTranslations(entries: any[]): Promise<number> {
  if (!Array.isArray(entries) || entries.length === 0) return 0;

  const deduped = new Map<string, any>();
  for (const entry of entries) {
    const language = String(entry.language || "").trim().toLowerCase();
    const word = String(entry.word || "").trim().toLowerCase();
    const translation = String(entry.translation || "").trim();
    if (!language || !word || !translation) continue;
    deduped.set(`${language}::${word}`, {
      language,
      word,
      translation,
      source: entry.source || "libretranslate"
    });
  }

  const rows = [...deduped.values()];
  const CHUNK = 400; // 4 params per row, well under Postgres' 65535 bind limit

  for (let offset = 0; offset < rows.length; offset += CHUNK) {
    const chunk = rows.slice(offset, offset + CHUNK);
    const params: any[] = [];
    for (const row of chunk) params.push(row.language, row.word, row.translation, row.source);
    const tuples = chunk.map(() => "(?, ?, ?, ?)").join(", ");
    await db.prepare(`
      INSERT INTO word_translations (language, word, translation, source)
      VALUES ${tuples}
      ON CONFLICT(language, word) DO UPDATE SET
        translation = excluded.translation,
        source = excluded.source,
        created_at = CURRENT_TIMESTAMP
    `).run(...params);
  }

  return rows.length;
}

async function clearContentWordTranslations(): Promise<void> {
  await db.exec("DELETE FROM word_translations WHERE source = 'content'");
}

async function getWordTranslationCounts(): Promise<{ libretranslate: number; content: number; total: number }> {
  const rows = await db
    .prepare("SELECT source, COUNT(*) AS count FROM word_translations GROUP BY source")
    .all() as { source: string; count: number }[];
  let libretranslate = 0;
  let content = 0;
  for (const row of rows) {
    if (row.source === "content") content += row.count;
    else libretranslate += row.count;
  }
  return { libretranslate, content, total: libretranslate + content };
}

async function clearWordTranslations(): Promise<void> {
  await db.exec("DELETE FROM word_translations");
}

// Schema creation and migrations.
//
// These used to run as import side effects. With an async driver they need an
// explicit awaited bootstrap, which index.ts calls once before the server starts
// serving. Idempotent: concurrent or repeated calls share the single run.
let schemaReady: Promise<void> | null = null;

async function runSchemaSetup(): Promise<void> {
  await migrateLegacySingleUserSchema();
  await createUsersTable();
  await ensureUsersColumns();
  await createCoreTables();
  await createIndexes();
  await ensureSettingsColumns();
  await ensureCommunityExercisesColumns();
  await ensureItemProgressColumns();
  await ensureLanguageProgressColumns();
  await ensureStoryCompletionsColumns();
  await createWordTranslationsTable();
  await seedDefaultUser();
  await maybeMigrateLegacyJson();
}

function initSchema(): Promise<void> {
  if (!schemaReady) schemaReady = runSchemaSetup();
  return schemaReady;
}

async function closeDatabase() {
  try {
    await db.close();
  } catch (_error) {
    // Already closed or never opened — nothing to do.
  }
  // Drop the driver and the schema-bootstrap latch so a later initSchema() in the
  // same process (tests, scripts) opens a fresh connection.
  resetDriver();
  schemaReady = null;
}

module.exports = {
  initSchema,
  closeDatabase,
  getUserByEmail,
  getUserById,
  createUser,
  deleteUserById,
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
  getMistakeReviewSelection,
  getCategoryRecommendations,
  createCommunityExercise,
  listCommunityExercises,
  updateCommunityExerciseModerationStatus,
  getPendingCommunityExerciseCount,
  getApprovedCommunityExercises,
  recordLoginPageVisit,
  getVisitorStats,
  addBookmark,
  removeBookmark,
  getBookmarks,
  isBookmarked,
  getKnownFlashcardItems,
  getSpeedMatchHighscore,
  updateSpeedMatchHighscore,
  saveReviewWord,
  removeReviewWord,
  getSavedReviewWords,
  getSavedWordPoolItems,
  markStoryComplete,
  getCompletedStoryIds,
  upsertStoryProgress,
  getStoryProgress,
  awardStoryXp,
  getReadingStats,
  getTodayXp,
  getProgress,
  getProgressOverview,
  getStats,
  recordSession,
  recordPracticeXp,
  checkAndGrantAchievements,
  getUserAchievements,
  runInTransaction,
  addDailyXp,
  toIsoDate,
  toIsoDateTime,
  getContentFingerprints,
  upsertContentFingerprint,
  upsertContentFingerprints,
  resetCategoryProgress,
  createWordTranslationsTable,
  getCachedWordTranslations,
  upsertWordTranslation,
  upsertWordTranslations,
  clearContentWordTranslations,
  clearWordTranslations,
  getWordTranslationCounts
};
