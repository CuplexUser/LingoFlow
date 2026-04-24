const fs: typeof import("fs") = require("fs");
const path: typeof import("path") = require("path");
const crypto: typeof import("crypto") = require("crypto");
const { CATEGORIES, LEVEL_ORDER } = require("./constants.ts");

const CONTENT_DIR = path.join(__dirname, "..", "..", "content", "languages");
const SUPPORTED_EXERCISE_TYPES = [
  "flashcard",
  "matching",
  "pronunciation",
  "roleplay",
  "mc_sentence",
  "multiple_choice",
  "build_sentence",
  "cloze_sentence",
  "dictation_sentence",
  "dialogue_turn"
];

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
  if (exerciseType && !SUPPORTED_EXERCISE_TYPES.includes(exerciseType)) {
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

function loadLanguageFromDirectory(dirPath: string, dirName: string) {
  const metaPath = path.join(dirPath, "_meta.json");
  if (!fs.existsSync(metaPath)) {
    throw new Error(`${dirName}/_meta.json is missing`);
  }

  const meta = parseJsonFile(metaPath) as { id: string; label: string; flag: string };
  if (!meta.id || !meta.label || !meta.flag) {
    throw new Error(`${dirName}/_meta.json must have id, label, and flag`);
  }

  const categoryIds = CATEGORIES.map((c: { id: string }) => c.id);
  const courseParts: Record<string, unknown[]> = {};

  for (const categoryId of categoryIds) {
    const categoryPath = path.join(dirPath, `${categoryId}.json`);
    if (!fs.existsSync(categoryPath)) {
      throw new Error(`${dirName}/${categoryId}.json is missing`);
    }
    const exercises = parseJsonFile(categoryPath);
    if (!Array.isArray(exercises)) {
      throw new Error(`${dirName}/${categoryId}.json must be an array`);
    }
    courseParts[categoryId] = exercises;
  }

  // Check for unknown category files
  const categoryFiles = fs
    .readdirSync(dirPath)
    .filter((f: string) => f.endsWith(".json") && f !== "_meta.json")
    .map((f: string) => f.replace(".json", ""));
  const unknownCategories = categoryFiles.filter((f: string) => !categoryIds.includes(f));
  if (unknownCategories.length) {
    throw new Error(`${dirName} has unknown category files: ${unknownCategories.join(", ")}`);
  }

  return { id: meta.id, label: meta.label, flag: meta.flag, course: courseParts };
}

function loadLanguageFromFile(filePath: string) {
  const parsed = parseJsonFile(filePath) as {
    id: string;
    label: string;
    flag: string;
    course: Record<string, unknown[]>;
  };
  return { id: parsed.id, label: parsed.label, flag: parsed.flag, course: parsed.course };
}

function loadLanguageContent() {
  const entries = fs.readdirSync(CONTENT_DIR);

  // Collect language sources: directories (new format) and .json files (legacy format)
  const languageSources: Array<{ type: "dir" | "file"; name: string; path: string }> = [];

  for (const entry of entries) {
    const fullPath = path.join(CONTENT_DIR, entry);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      languageSources.push({ type: "dir", name: entry, path: fullPath });
    } else if (entry.toLowerCase().endsWith(".json")) {
      languageSources.push({ type: "file", name: entry, path: fullPath });
    }
  }

  languageSources.sort((a, b) => a.name.localeCompare(b.name));

  if (!languageSources.length) {
    throw new Error(`No language content found in ${CONTENT_DIR}`);
  }

  const languages: Array<{ id: string; label: string; flag: string; contentSha256: string }> = [];
  const course: Record<string, Record<string, any[]>> = {};
  const contentMeta: Record<string, { sha256: string; itemCount: number; loadedAt: string; fileName: string }> = {};
  const seenLanguageIds = new Set<string>();
  const loadedAt = new Date().toISOString();

  for (const source of languageSources) {
    const parsed =
      source.type === "dir"
        ? loadLanguageFromDirectory(source.path, source.name)
        : loadLanguageFromFile(source.path);

    // Build the full payload shape for validation
    const payload = { id: parsed.id, label: parsed.label, flag: parsed.flag, course: parsed.course };
    validateLanguagePayload(payload, source.name);

    const languageId = parsed.id;
    if (seenLanguageIds.has(languageId)) {
      throw new Error(`Duplicate language id across content sources: ${languageId}`);
    }
    seenLanguageIds.add(languageId);

    const canonical = JSON.stringify(payload);
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
      fileName: source.name
    };
  }

  return { languages, course, contentMeta };
}

module.exports = {
  loadLanguageContent
};
