const fs: typeof import("fs") = require("fs");
const path: typeof import("path") = require("path");
const crypto: typeof import("crypto") = require("crypto");
const { CATEGORIES, LEVEL_ORDER } = require("./constants.ts");

const CONTENT_DIR = path.join(__dirname, "..", "..", "content", "languages");

function parseJsonFile(filePath: string): unknown {
  const raw = fs.readFileSync(filePath, "utf8");
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `Invalid JSON in ${path.basename(filePath)}: ${error instanceof Error ? error.message : "parse error"}`,
      {
        cause: error
      }
    );
  }
}

function ensureObject(value: unknown, errorPrefix: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${errorPrefix} must be an object`);
  }
}

function validateCourseItem(item: unknown, languageId: string, categoryId: string, index: number): void {
  const prefix = `${languageId}.${categoryId}[${index}]`;
  ensureObject(item, prefix);

  const id = String(item.id || "").trim();
  const level = String(item.level || "").trim().toLowerCase();
  const prompt = String(item.prompt || "").trim();
  const target = String(item.target || item.correctAnswer || "").trim();
  const difficulty = String(item.difficulty || level || "").trim().toLowerCase();
  const hints = Array.isArray(item.hints) ? item.hints : [];
  const exerciseType = String(item.exerciseType || "").trim().toLowerCase();

  if (!id) throw new Error(`${prefix}.id is required`);
  if (!LEVEL_ORDER.includes(level)) {
    throw new Error(`${prefix}.level must be one of ${LEVEL_ORDER.join(", ")}`);
  }
  if (!prompt) throw new Error(`${prefix}.prompt is required`);
  if (!target) throw new Error(`${prefix}.target is required`);
  if (difficulty && !LEVEL_ORDER.includes(difficulty)) {
    throw new Error(`${prefix}.difficulty must be one of ${LEVEL_ORDER.join(", ")}`);
  }
  if (!Array.isArray(hints)) {
    throw new Error(`${prefix}.hints must be an array`);
  }
  if (exerciseType && ![
    "flashcard",
    "matching",
    "pronunciation",
    "roleplay",
    "mc_sentence",
    "build_sentence",
    "cloze_sentence",
    "dictation_sentence",
    "dialogue_turn"
  ].includes(exerciseType)) {
    throw new Error(`${prefix}.exerciseType is not supported`);
  }
}

function validateLanguagePayload(payload: unknown, fileName: string): void {
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
      const itemId = String((item as { id: string }).id);
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
  const course: Record<string, Record<string, Array<{ id: string; level: string; prompt: string; target: string }>>> = {};
  const contentMeta: Record<string, { sha256: string; itemCount: number; loadedAt: string; fileName: string }> = {};
  const seenLanguageIds = new Set<string>();
  const loadedAt = new Date().toISOString();

  for (const fileName of files) {
    const filePath = path.join(CONTENT_DIR, fileName);
    const parsed = parseJsonFile(filePath) as {
      id: string;
      label: string;
      flag: string;
      course: Record<string, Array<{
        id: string;
        level: string;
        prompt: string;
        target?: string;
        correctAnswer?: string;
        hints?: string[];
        difficulty?: string;
        audioUrl?: string;
        imageUrl?: string;
        culturalNote?: string;
        exerciseType?: string;
      }>>;
    };
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

module.exports = {
  loadLanguageContent
};
