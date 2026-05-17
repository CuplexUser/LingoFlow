const { createHash } = require("crypto");
const { CATEGORIES, LEVEL_ORDER, LEVEL_XP_MULTIPLIER } = require("./data/constants.ts");
const { loadLanguageContent } = require("./data/contentLoader.ts");
const { createCourseSelectors, createSessionGenerator, recommendedLevelFromMastery } = require("./data/sessionGenerator.ts");
const { getPracticePool } = require("./data/practicePool.ts");
const { createContentMetrics } = require("./data/contentMetrics.ts");
const { getContentFingerprints, upsertContentFingerprint, resetCategoryProgress } = require("./db.ts");

const { languages: LANGUAGES, course: COURSE, contentMeta: LANGUAGE_CONTENT_META } = loadLanguageContent();

function computeCategoryFingerprint(items: any[]): string {
  const entries = items
    .map((item: any) => `${item.id}|${String(item.correctAnswer ?? item.target ?? "")}`)
    .sort()
    .join("\n");
  return createHash("sha256").update(entries).digest("hex").slice(0, 16);
}

const storedFingerprints = getContentFingerprints();
for (const langId of Object.keys(COURSE)) {
  for (const catId of Object.keys(COURSE[langId])) {
    const fingerprint = computeCategoryFingerprint(COURSE[langId][catId]);
    const key = `${langId}:${catId}`;
    if (storedFingerprints[key] !== undefined && storedFingerprints[key] !== fingerprint) {
      resetCategoryProgress(langId, catId);
      console.log(`[content] Progress reset for ${langId}/${catId} — content changed`);
    }
    upsertContentFingerprint(langId, catId, fingerprint);
  }
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

function seedContentWordTranslations(database: any): number {
  let count = 0;
  for (const [lang, categories] of Object.entries(COURSE as Record<string, Record<string, any[]>>)) {
    for (const items of Object.values(categories as Record<string, any[]>)) {
      for (const item of items) {
        if (item.wordGlossary && typeof item.wordGlossary === "object" && !Array.isArray(item.wordGlossary)) {
          for (const [word, translation] of Object.entries(item.wordGlossary as Record<string, string>)) {
            if (word.trim() && String(translation).trim()) {
              database.upsertWordTranslation(lang, word.toLowerCase().trim(), String(translation).trim(), "content");
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
              database.upsertWordTranslation(lang, foreignWord, englishWord, "content");
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
              database.upsertWordTranslation(lang, phrase, value, "content");
              count++;
            }
          }
        }
      }
    }
  }
  return count;
}

function rebuildContentWordTranslations(database: any): number {
  database.clearContentWordTranslations();
  return seedContentWordTranslations(database);
}

function rebuildAllWordTranslations(database: any): number {
  database.clearWordTranslations();
  return seedContentWordTranslations(database);
}

module.exports = {
  LANGUAGES,
  CATEGORIES,
  COURSE,
  LEVEL_ORDER,
  LEVEL_XP_MULTIPLIER,
  LANGUAGE_CONTENT_META,
  getCourseOverview,
  getContentMetrics,
  getCategoryItems,
  getAllItems,
  generateSession,
  recommendedLevelFromMastery,
  injectCommunityItem,
  rebuildContentWordTranslations,
  rebuildAllWordTranslations
};
