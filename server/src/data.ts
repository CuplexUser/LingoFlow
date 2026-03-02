const fs: typeof import("fs") = require("fs");
const path: typeof import("path") = require("path");
const crypto: typeof import("crypto") = require("crypto");

type CourseItem = {
  id: string;
  level: string;
  prompt: string;
  target: string;
};

type CourseCatalog = Record<string, CourseItem[]>;

type LanguagePayload = {
  id: string;
  label: string;
  flag: string;
  course: CourseCatalog;
};

const CATEGORIES = [
  { id: "essentials", label: "Essentials", description: "Core survival phrases" },
  { id: "conversation", label: "Conversation", description: "Natural social dialogue" },
  { id: "travel", label: "Travel", description: "Transport and directions" },
  { id: "work", label: "Work", description: "Professional communication" },
  { id: "health", label: "Health", description: "Medical and emergency phrases" },
  { id: "family_friends", label: "Family & Friends", description: "Relationships and social life" },
  { id: "food_cooking", label: "Food & Cooking", description: "Meals, recipes, and dining" },
  { id: "grammar", label: "Grammar", description: "Sentence structures and tenses" }
];

const LEVEL_ORDER = ["a1", "a2", "b1", "b2"];
const LEVEL_XP_MULTIPLIER = { a1: 1.0, a2: 1.25, b1: 1.6, b2: 2.0 };
const CONTENT_DIR = path.join(__dirname, "..", "content", "languages");

function parseJsonFile(filePath: string): unknown {
  const raw = fs.readFileSync(filePath, "utf8");
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid JSON in ${path.basename(filePath)}: ${error instanceof Error ? error.message : "parse error"}`);
  }
}

function ensureObject(value: unknown, errorPrefix: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${errorPrefix} must be an object`);
  }
}

function validateCourseItem(item: unknown, languageId: string, categoryId: string, index: number): asserts item is CourseItem {
  const prefix = `${languageId}.${categoryId}[${index}]`;
  ensureObject(item, prefix);

  const id = String(item.id || "").trim();
  const level = String(item.level || "").trim().toLowerCase();
  const prompt = String(item.prompt || "").trim();
  const target = String(item.target || "").trim();

  if (!id) throw new Error(`${prefix}.id is required`);
  if (!LEVEL_ORDER.includes(level)) throw new Error(`${prefix}.level must be one of ${LEVEL_ORDER.join(", ")}`);
  if (!prompt) throw new Error(`${prefix}.prompt is required`);
  if (!target) throw new Error(`${prefix}.target is required`);
}

function validateLanguagePayload(payload: unknown, fileName: string): asserts payload is LanguagePayload {
  ensureObject(payload, fileName);

  const id = String(payload.id || "").trim().toLowerCase();
  const label = String(payload.label || "").trim();
  const flag = String(payload.flag || "").trim();

  if (!id) throw new Error(`${fileName}: id is required`);
  if (!label) throw new Error(`${fileName}: label is required`);
  if (!flag) throw new Error(`${fileName}: flag is required`);

  ensureObject(payload.course, `${fileName}.course`);

  const categoryIds = CATEGORIES.map((category) => category.id);
  const payloadCategoryIds = Object.keys(payload.course);

  for (const categoryId of categoryIds) {
    if (!Array.isArray(payload.course[categoryId])) {
      throw new Error(`${fileName}.course.${categoryId} must be an array`);
    }
  }

  const unknownCategories = payloadCategoryIds.filter((categoryId) => !categoryIds.includes(categoryId));
  if (unknownCategories.length) {
    throw new Error(`${fileName}.course has unknown categories: ${unknownCategories.join(", ")}`);
  }

  const seenItemIds = new Set<string>();
  for (const categoryId of categoryIds) {
    const items = payload.course[categoryId] as unknown[];
    items.forEach((item, index) => {
      validateCourseItem(item, id, categoryId, index);
      const itemId = String((item as CourseItem).id);
      if (seenItemIds.has(itemId)) {
        throw new Error(`${fileName}: duplicate item id ${itemId}`);
      }
      seenItemIds.add(itemId);
    });
  }
}

function loadLanguageContent() {
  const files = fs
    .readdirSync(CONTENT_DIR)
    .filter((entry) => entry.toLowerCase().endsWith(".json"))
    .sort();

  if (!files.length) {
    throw new Error(`No language content files found in ${CONTENT_DIR}`);
  }

  const languages: Array<{ id: string; label: string; flag: string; contentSha256: string }> = [];
  const course: Record<string, CourseCatalog> = {};
  const contentMeta: Record<string, { sha256: string; itemCount: number; loadedAt: string; fileName: string }> = {};
  const seenLanguageIds = new Set<string>();
  const loadedAt = new Date().toISOString();

  for (const fileName of files) {
    const filePath = path.join(CONTENT_DIR, fileName);
    const parsed = parseJsonFile(filePath);
    validateLanguagePayload(parsed, fileName);

    const languageId = parsed.id;
    if (seenLanguageIds.has(languageId)) {
      throw new Error(`Duplicate language id across content files: ${languageId}`);
    }
    seenLanguageIds.add(languageId);

    const canonical = JSON.stringify(parsed);
    const sha256 = crypto.createHash("sha256").update(canonical).digest("hex");
    const itemCount = Object.values(parsed.course).reduce((total, items) => total + items.length, 0);

    languages.push({
      id: parsed.id,
      label: parsed.label,
      flag: parsed.flag,
      contentSha256: sha256
    });

    course[parsed.id] = parsed.course;
    contentMeta[parsed.id] = {
      sha256,
      itemCount,
      loadedAt,
      fileName
    };
  }

  return { languages, course, contentMeta };
}

const {
  languages: LANGUAGES,
  course: COURSE,
  contentMeta: LANGUAGE_CONTENT_META
} = loadLanguageContent();

function shuffle(items) {
  const cloned = [...items];
  for (let i = cloned.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [cloned[i], cloned[j]] = [cloned[j], cloned[i]];
  }
  return cloned;
}

function levelRank(level) {
  return LEVEL_ORDER.indexOf(level);
}

function recommendedLevelFromMastery(mastery) {
  if (mastery < 20) return "a1";
  if (mastery < 45) return "a2";
  if (mastery < 70) return "b1";
  return "b2";
}

function clampLevelRank(rank) {
  return Math.max(0, Math.min(rank, LEVEL_ORDER.length - 1));
}

function getCategoryItems(language, category) {
  return COURSE[language]?.[category] || [];
}

function getCourseOverview(language) {
  const catalog = COURSE[language] || {};
  return CATEGORIES.map((category) => {
    const items = catalog[category.id] || [];
    const levels = Array.from(new Set(items.map((item) => item.level))).sort(
      (a, b) => levelRank(a) - levelRank(b)
    );
    return {
      ...category,
      totalPhrases: items.length,
      levels
    };
  });
}

function buildAcceptedAnswers(target) {
  const compact = String(target || "").trim();
  if (!compact) return [];
  const noTrailingPunctuation = compact.replace(/[.!?]+$/g, "");
  if (noTrailingPunctuation !== compact) {
    return [noTrailingPunctuation];
  }
  return [];
}

function deriveObjective(category, level) {
  if (category === "grammar") {
    if (level === "a1") return "present-and-past-basics";
    if (level === "a2") return "future-and-conditionals";
    if (level === "b1") return "perfect-and-hypothetical";
    return "advanced-complex-tenses";
  }
  return `${category}-${level}-communication`;
}

function pickLevelAwareDistractors(pool, item, count) {
  const ranked = levelRank(item.level);
  const sameBand = pool.filter(
    (candidate) =>
      candidate.target !== item.target &&
      Math.abs(levelRank(candidate.level) - ranked) <= 1
  );
  const source = sameBand.length >= count ? sameBand : pool.filter((candidate) => candidate.target !== item.target);
  return shuffle(source.map((candidate) => candidate.target)).slice(0, count);
}

function createQuestion(item, pool, idx, category) {
  const questionTypeCycle = ["mc_sentence", "build_sentence", "cloze_sentence", "dictation_sentence", "dialogue_turn"];
  const questionType = questionTypeCycle[idx % questionTypeCycle.length];
  const base = {
    id: item.id,
    type: questionType,
    level: item.level,
    prompt: item.prompt,
    answer: item.target,
    acceptedAnswers: buildAcceptedAnswers(item.target),
    objective: deriveObjective(category, item.level)
  };

  if (questionType === "mc_sentence") {
    const distractors = pickLevelAwareDistractors(pool, item, 3);
    return {
      ...base,
      options: shuffle([item.target, ...distractors])
    };
  }

  if (questionType === "dialogue_turn") {
    const distractors = pickLevelAwareDistractors(pool, item, 3);
    return {
      ...base,
      prompt: `Choose the best response. ${item.prompt}`,
      options: shuffle([item.target, ...distractors])
    };
  }

  if (questionType === "cloze_sentence") {
    const answerTokens = item.target.split(" ").filter(Boolean);
    const maskIndex = answerTokens.findIndex((token) => token.length > 3);
    const selectedMaskIndex = maskIndex >= 0 ? maskIndex : 0;
    const clozeAnswer = answerTokens[selectedMaskIndex];
    const fallbackDistractors = pool
      .flatMap((entry) => entry.target.split(" "))
      .filter((token) => token.length > 2 && token !== clozeAnswer);
    const clozeOptions = shuffle([clozeAnswer, ...shuffle(fallbackDistractors).slice(0, 3)]).slice(0, 4);
    const clozeTokens = [...answerTokens];
    clozeTokens[selectedMaskIndex] = "____";
    return {
      ...base,
      clozeAnswer,
      clozeText: clozeTokens.join(" "),
      clozeOptions
    };
  }

  if (questionType === "dictation_sentence") {
    const answerTokens = item.target.split(" ");
    const tokenPool = pool
      .flatMap((entry) => entry.target.split(" "))
      .filter((token) => token.length > 2 && !answerTokens.includes(token));
    const noise = shuffle(tokenPool).slice(0, 2);
    return {
      ...base,
      prompt: `Listen and build the sentence. ${item.prompt}`,
      audioText: item.target,
      tokens: shuffle([...answerTokens, ...noise])
    };
  }

  const answerTokens = item.target.split(" ");
  const tokenPool = pool
    .flatMap((entry) => entry.target.split(" "))
    .filter((token) => token.length > 2 && !answerTokens.includes(token));
  const noise = shuffle(tokenPool).slice(0, 2);

  return {
    ...base,
    tokens: shuffle([...answerTokens, ...noise])
  };
}

function generateSession({
  language,
  category,
  mastery = 0,
  count = 10,
  recentAccuracy = null,
  selfRatedLevel = "a1",
  dueItemIds = [],
  weakItemIds = []
}) {
  const all = getCategoryItems(language, category);
  if (!all.length) {
    return {
      recommendedLevel: "a1",
      questions: []
    };
  }

  const baselineLevel = recommendedLevelFromMastery(mastery);
  let adaptiveRank = levelRank(baselineLevel);

  if (Number.isFinite(recentAccuracy)) {
    if (recentAccuracy >= 0.88) adaptiveRank += 1;
    if (recentAccuracy <= 0.55) adaptiveRank -= 1;
  }

  const selfRatedRank = levelRank(selfRatedLevel);
  if (selfRatedRank >= 0) {
    adaptiveRank = Math.max(adaptiveRank, selfRatedRank - 1);
  }

  const recommendedLevel = LEVEL_ORDER[clampLevelRank(adaptiveRank)];
  const maxRank = Math.min(clampLevelRank(adaptiveRank) + 1, LEVEL_ORDER.length - 1);
  const candidatePool = all.filter((item) => levelRank(item.level) <= maxRank);
  const sourcePool = candidatePool.length >= count ? candidatePool : all;
  const dueSet = new Set(dueItemIds);
  const weakSet = new Set(weakItemIds);
  const targetCount = Math.min(count, sourcePool.length);
  const dueTarget = Math.max(0, Math.min(targetCount, Math.round(targetCount * 0.6)));
  const weakTarget = Math.max(0, Math.min(targetCount - dueTarget, Math.round(targetCount * 0.25)));

  const dueItems = shuffle(sourcePool.filter((item) => dueSet.has(item.id))).slice(0, dueTarget);
  const selectedIds = new Set(dueItems.map((item) => item.id));
  const weakItems = shuffle(
    sourcePool.filter((item) => weakSet.has(item.id) && !selectedIds.has(item.id))
  ).slice(0, weakTarget);
  weakItems.forEach((item) => selectedIds.add(item.id));

  const remaining = shuffle(sourcePool.filter((item) => !selectedIds.has(item.id)));
  const selected = [...dueItems, ...weakItems, ...remaining].slice(0, targetCount);
  const questions = selected.map((item, idx) => createQuestion(item, sourcePool, idx, category));

  return {
    recommendedLevel,
    difficultyMultiplier: LEVEL_XP_MULTIPLIER[recommendedLevel],
    questions
  };
}

module.exports = {
  LANGUAGES,
  CATEGORIES,
  COURSE,
  LEVEL_ORDER,
  LEVEL_XP_MULTIPLIER,
  LANGUAGE_CONTENT_META,
  getCourseOverview,
  getCategoryItems,
  generateSession,
  recommendedLevelFromMastery
};
