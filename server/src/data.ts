const { createHash } = require("crypto");
const { CATEGORIES, LEVEL_ORDER, LEVEL_XP_MULTIPLIER, STORY_BASE_XP, QUIZ_BONUS_MAX } = require("./data/constants.ts");
const { loadLanguageContent } = require("./data/contentLoader.ts");
const { createCourseSelectors, createSessionGenerator, recommendedLevelFromMastery } = require("./data/sessionGenerator.ts");
const { getPracticePool } = require("./data/practicePool.ts");
const { loadStories } = require("./data/storyLoader.ts");
const { createContentMetrics } = require("./data/contentMetrics.ts");
const { getContentFingerprints, upsertContentFingerprints, resetCategoryProgress } = require("./db.ts");

const { languages: LANGUAGES, course: COURSE, contentMeta: LANGUAGE_CONTENT_META } = loadLanguageContent();

// Fraction of a category's items that must change before progress is reset.
// Small fixes (typos, reworded answers) stay below this and preserve progress;
// only a substantial overhaul of a category wipes it.
const CONTENT_RESET_THRESHOLD = 0.25;

function computeItemFingerprint(item: any): string {
  const entry = `${item.id}|${String(item.correctAnswer ?? item.target ?? "")}`;
  return createHash("sha256").update(entry).digest("hex").slice(0, 16);
}

function computeCategoryFingerprints(items: any[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const item of items) {
    map[String(item.id)] = computeItemFingerprint(item);
  }
  return map;
}

// Parse a stored per-item fingerprint map. Returns null for the legacy
// single-hash format (or anything unparseable), which is treated as
// "not comparable" so we never reset progress during the migration boot.
function parseStoredFingerprints(raw: string | undefined): Record<string, string> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, string>;
    }
  } catch (_) {
    // legacy single-hash format — cannot diff per item
  }
  return null;
}

function changedItemRatio(
  stored: Record<string, string>,
  current: Record<string, string>
): number {
  const ids = new Set([...Object.keys(stored), ...Object.keys(current)]);
  if (ids.size === 0) return 0;
  let changed = 0;
  for (const id of ids) {
    // counts added, removed, and modified items
    if (stored[id] !== current[id]) changed++;
  }
  return changed / ids.size;
}

// Reconcile stored content fingerprints against the loaded course content, resetting
// progress for categories that changed substantially. This used to run as an import
// side effect; the database layer is async now, so index.ts awaits it during startup.
async function reconcileContentFingerprints(): Promise<void> {
  const storedFingerprints = await getContentFingerprints();
  const pending: any[] = [];
  for (const langId of Object.keys(COURSE)) {
    for (const catId of Object.keys(COURSE[langId])) {
      const current = computeCategoryFingerprints(COURSE[langId][catId]);
      const key = `${langId}:${catId}`;
      const stored = parseStoredFingerprints(storedFingerprints[key]);
      if (stored) {
        const ratio = changedItemRatio(stored, current);
        if (ratio > CONTENT_RESET_THRESHOLD) {
          await resetCategoryProgress(langId, catId);
          console.log(
            `[content] Progress reset for ${langId}/${catId} — ${(ratio * 100).toFixed(0)}% of items changed`
          );
        }
      }
      pending.push({ language: langId, category: catId, fingerprint: JSON.stringify(current) });
    }
  }
  await upsertContentFingerprints(pending);
}
const STORIES: any[] = loadStories();
console.log(`[startup] Loaded ${STORIES.length} stories`);

function summarizeStory(story: any) {
  const questionCount = Array.isArray(story.questions) ? story.questions.length : 0;
  return {
    id: story.id,
    language: story.language,
    level: story.level,
    title: story.title,
    titleEn: story.titleEn,
    theme: story.theme,
    category: story.category,
    sentenceCount: story.sentences.length,
    hasQuiz: questionCount > 0,
    questionCount
  };
}

function listStories({ language, level, category }: { language?: string; level?: string; category?: string } = {}) {
  const lang = String(language || "").trim().toLowerCase();
  const lvl = String(level || "").trim().toLowerCase();
  const cat = String(category || "").trim();
  return STORIES
    .filter((story) => (!lang || story.language === lang))
    .filter((story) => (!lvl || story.level === lvl))
    .filter((story) => (!cat || story.category === cat))
    .map(summarizeStory);
}

function getStoryById(id: string) {
  const storyId = String(id || "").trim();
  return STORIES.find((story) => story.id === storyId) || null;
}

// Removes the answer key from a story before it is sent to the client. Question
// `correct` indices and `explanation` text are only revealed after the learner submits.
function sanitizeStoryForClient(story: any) {
  if (!story) return story;
  if (!Array.isArray(story.questions) || story.questions.length === 0) return story;
  return {
    ...story,
    questions: story.questions.map((question: any) => ({
      stem: question.stem,
      stemLang: question.stemLang,
      options: question.options,
      optionsLang: question.optionsLang
    }))
  };
}

// Computes XP for finishing a story: a level-scaled base plus a quiz bonus scaled
// by both accuracy and level. Returns a whole number.
function computeStoryXp(level: string, quizScore?: number, quizTotal?: number): number {
  const multiplier = LEVEL_XP_MULTIPLIER[String(level || "a1").toLowerCase()] || 1;
  let xp = STORY_BASE_XP * multiplier;
  if (Number.isFinite(quizTotal) && (quizTotal as number) > 0) {
    const ratio = Math.max(0, Math.min(1, (quizScore as number) / (quizTotal as number)));
    xp += QUIZ_BONUS_MAX * multiplier * ratio;
  }
  return Math.round(xp);
}

// Suggests the next story to read for a learner. Prefers an uncompleted story at the
// learner's current level matching their focus category, then same level any category,
// then the next level up, then any uncompleted story. Returns a summary or null.
function recommendNextStory({
  language,
  completedIds,
  level,
  category
}: {
  language: string;
  completedIds: string[];
  level?: string;
  category?: string;
}) {
  const lang = String(language || "").trim().toLowerCase();
  if (!lang) return null;
  const done = new Set(completedIds || []);
  const pool = STORIES.filter((story) => story.language === lang && !done.has(story.id));
  if (!pool.length) return null;

  const currentLevel = LEVEL_ORDER.includes(String(level || "").toLowerCase())
    ? String(level).toLowerCase()
    : LEVEL_ORDER[0];
  const cat = String(category || "").trim();
  const nextLevel = LEVEL_ORDER[Math.min(LEVEL_ORDER.indexOf(currentLevel) + 1, LEVEL_ORDER.length - 1)];

  const pick =
    pool.find((s) => s.level === currentLevel && cat && s.category === cat) ||
    pool.find((s) => s.level === currentLevel) ||
    pool.find((s) => s.level === nextLevel) ||
    [...pool].sort((a, b) => LEVEL_ORDER.indexOf(a.level) - LEVEL_ORDER.indexOf(b.level))[0];

  return pick ? summarizeStory(pick) : null;
}

const { getCategoryItems, getAllItems, getCourseOverview } = createCourseSelectors(COURSE);
const generateSession = createSessionGenerator(getCategoryItems, getAllItems, getPracticePool);
const getContentMetrics = createContentMetrics(COURSE, CATEGORIES);

const VALID_LEVELS = new Set(LEVEL_ORDER);
const INJECTABLE_EXERCISE_TYPES = new Set([
  "build_sentence", "flashcard", "pronunciation", "dialogue_turn", "matching"
]);

function injectCommunityItem(item: {
  id: number;
  language: string;
  category: string;
  difficulty: string;
  prompt: string;
  correctAnswer: string;
  hints: string[];
  exerciseType: string;
}) {
  if (!INJECTABLE_EXERCISE_TYPES.has(item.exerciseType)) return;
  const lang = String(item.language || "").trim().toLowerCase();
  const cat = String(item.category || "").trim();
  if (!COURSE[lang] || !COURSE[lang][cat]) return;

  const level = VALID_LEVELS.has(item.difficulty) ? item.difficulty : "a1";
  const itemId = `community_${item.id}`;
  const exercise = {
    id: itemId,
    level,
    difficulty: level,
    prompt: item.prompt,
    target: item.correctAnswer,
    correctAnswer: item.correctAnswer,
    hints: Array.isArray(item.hints) ? item.hints : [],
    exerciseType: item.exerciseType || "build_sentence"
  };

  const pool: any[] = COURSE[lang][cat];
  const existing = pool.findIndex((e: any) => e.id === itemId);
  if (existing >= 0) {
    pool[existing] = exercise;
  } else {
    pool.push(exercise);
  }
}

const VOCAB_FLASHCARD_RE = /^vocabulary:\s*(.+)$/i;
const HINT_WORD_RE = /'([^']+)'\s*=\s*([^;.']+)/g;

async function seedContentWordTranslations(database: any): Promise<number> {
  // Collected and written in batches at the end rather than one upsert per word:
  // against a hosted Postgres, per-word round-trips made startup take about a minute.
  const entries: any[] = [];
  let count = 0;
  for (const [lang, categories] of Object.entries(COURSE as Record<string, Record<string, any[]>>)) {
    for (const items of Object.values(categories as Record<string, any[]>)) {
      for (const item of items) {
        if (item.wordGlossary && typeof item.wordGlossary === "object" && !Array.isArray(item.wordGlossary)) {
          for (const [word, translation] of Object.entries(item.wordGlossary as Record<string, string>)) {
            if (word.trim() && String(translation).trim()) {
              entries.push({ language: lang, word: word.toLowerCase().trim(), translation: String(translation).trim(), source: "content" });
              count++;
            }
          }
        }
        if (item.exerciseType === "flashcard" && item.correctAnswer) {
          const m = VOCAB_FLASHCARD_RE.exec(String(item.prompt || ""));
          if (m) {
            const englishWord = m[1].trim();
            const foreignWord = String(item.correctAnswer).trim().toLowerCase();
            if (foreignWord && !foreignWord.includes(" ") && englishWord) {
              entries.push({ language: lang, word: foreignWord, translation: englishWord, source: "content" });
              count++;
            }
          }
        }
        const hints: string[] = Array.isArray(item.hints) ? item.hints : [];
        for (const hint of hints) {
          HINT_WORD_RE.lastIndex = 0;
          let match: RegExpExecArray | null;
          while ((match = HINT_WORD_RE.exec(hint)) !== null) {
            const phrase = match[1].trim().toLowerCase();
            const value = match[2].trim().replace(/\s*[—–-]\s*.+$/, "").trim();
            if (phrase && value && !phrase.includes(" ")) {
              entries.push({ language: lang, word: phrase, translation: value, source: "content" });
              count++;
            }
          }
        }
      }
    }
  }
  await database.upsertWordTranslations(entries);
  return count;
}

async function rebuildContentWordTranslations(database: any): Promise<number> {
  await database.clearContentWordTranslations();
  return seedContentWordTranslations(database);
}

async function rebuildAllWordTranslations(database: any): Promise<number> {
  await database.clearWordTranslations();
  return seedContentWordTranslations(database);
}

module.exports = {
  reconcileContentFingerprints,
  LANGUAGES,
  CATEGORIES,
  COURSE,
  LEVEL_ORDER,
  LEVEL_XP_MULTIPLIER,
  LANGUAGE_CONTENT_META,
  STORIES,
  listStories,
  getStoryById,
  sanitizeStoryForClient,
  computeStoryXp,
  recommendNextStory,
  getCourseOverview,
  getContentMetrics,
  getCategoryItems,
  getAllItems,
  getPracticePool,
  generateSession,
  recommendedLevelFromMastery,
  injectCommunityItem,
  rebuildContentWordTranslations,
  rebuildAllWordTranslations
};
