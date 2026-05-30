// Translation + JSON file generation for LingoFlow language content.
//
// This module owns everything about reading English source content, calling
// LibreTranslate (in batches), and writing the resulting JSON files. It has no
// menu/prompt logic — callers drive it and pass an onProgress callback for any
// UI feedback.

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { Choice } from "./terminal-menu.ts";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(MODULE_DIR, "..", "..");
export const SERVER_ENV_PATH = path.join(REPO_ROOT, "server", ".env");

const CONTENT_ROOT = path.join(REPO_ROOT, "server", "content", "languages");
const PRACTICE_WORDS_DIR = path.join(REPO_ROOT, "server", "content", "practice_words");
const PRACTICE_WORDS_TEMPLATE = path.join(PRACTICE_WORDS_DIR, "_template.json");
export const PRACTICE_WORDS_ID = "practice_words";
const SOURCE_LANGUAGE_ID = "english";

// Number of texts sent to LibreTranslate per /translate request. Batching keeps the
// request count (and the rate-limit budget) low — e.g. ~1000 words become ~20 calls.
export const TRANSLATE_BATCH_SIZE = 50;

export interface TargetLanguage extends Choice {
  id: string;
  libreCode: string;
  idPrefix: string;
}

export interface Category extends Choice {
  id: string;
}

export interface CategoryChoice extends Category {
  disabledReason: string;
}

export interface RateLimitChoice extends Choice {
  value: number;
}

export interface LibreTranslateConfig {
  url: string;
  apiKey: string;
  target: string;
}

export interface TranslationStats {
  callCount: number;
  callDurations: number[];
}

interface CategoryStats extends TranslationStats {
  startedAt: number;
}

export interface CompletedCategoryStats {
  category: Category;
  elapsed: number;
  callCount: number;
  averageCallMs: number;
}

export interface TotalStats extends TranslationStats {
  startedAt: number;
  categories: CompletedCategoryStats[];
}

interface ExerciseItem {
  id?: unknown;
  correctAnswer?: unknown;
  target?: unknown;
  options?: unknown;
  [key: string]: unknown;
}

interface LibreTranslateResponse {
  translatedText?: string | string[];
}

export const TARGET_LANGUAGES: TargetLanguage[] = [
  { id: "french", label: "French", libreCode: "fr", idPrefix: "fr" },
  { id: "german", label: "German", libreCode: "de", idPrefix: "de" }
];

export const CATEGORIES: Category[] = [
  { id: "essentials", label: "Essentials" },
  { id: "conversation", label: "Conversation" },
  { id: "travel", label: "Travel" },
  { id: "work", label: "Work" },
  { id: "health", label: "Health" },
  { id: "family_friends", label: "Family & Friends" },
  { id: "food_cooking", label: "Food & Cooking" },
  { id: "grammar", label: "Grammar" },
  { id: "hobbies_leisure", label: "Hobbies & Leisure" },
  { id: "sports_fitness", label: "Sports & Fitness" },
  { id: "news_media", label: "News & Media" },
  { id: "money_finance", label: "Money & Finance" },
  { id: "science_technology", label: "Science & Technology" },
  { id: "culture_history", label: "Culture & History" },
  { id: "nature_animals", label: "Nature & Animals" },
  { id: "numbers_math", label: "Numbers & Math" }
];

export const PRACTICE_WORDS_CATEGORY: Category = { id: PRACTICE_WORDS_ID, label: "Practice Words" };

export const RATE_LIMITS: RateLimitChoice[] = [
  { label: "60 calls/minute", value: 60 },
  { label: "120 calls/minute", value: 120 },
  { label: "240 calls/minute", value: 240 },
  { label: "Unlimited", value: 0 }
];

export class LibreTranslateRequestError extends Error {
  readonly status: number;
  readonly body: string;
  readonly sourceText: string;

  constructor(status: number, body: string, sourceText: string) {
    super(`LibreTranslate returned ${status} for "${sourceText}": ${body.slice(0, 300)}`);
    this.name = "LibreTranslateRequestError";
    this.status = status;
    this.body = body;
    this.sourceText = sourceText;
  }
}

export function relPath(filePath: string): string {
  return path.relative(REPO_ROOT, filePath);
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms)) return "n/a";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function average(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function loadEnv(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing ${relPath(filePath)}. LibreTranslate config lives there.`);
  }

  const env: Record<string, string> = {};
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) continue;

    const key = trimmed.slice(0, equalsIndex).trim();
    let value = trimmed.slice(equalsIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }

  return env;
}

// Persisted tool preferences (e.g. the last-used rate limit), stored next to the
// script so choices carry over between sessions. Best-effort: read/write failures
// are swallowed since this is a convenience, not required state.
const PREFERENCES_PATH = path.join(MODULE_DIR, ".preferences.json");

interface Preferences {
  rateLimit?: number;
}

function readPreferences(): Preferences {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(PREFERENCES_PATH, "utf8"));
    return parsed && typeof parsed === "object" ? (parsed as Preferences) : {};
  } catch {
    return {};
  }
}

function writePreferences(preferences: Preferences): void {
  try {
    fs.writeFileSync(PREFERENCES_PATH, `${JSON.stringify(preferences, null, 2)}\n`, "utf8");
  } catch {
    // Ignore — preferences are a convenience, not required state.
  }
}

export function loadRateLimitPreference(): number | null {
  const value = readPreferences().rateLimit;
  return typeof value === "number" ? value : null;
}

export function saveRateLimitPreference(value: number): void {
  const preferences = readPreferences();
  preferences.rateLimit = value;
  writePreferences(preferences);
}

export function getOutputPath(language: TargetLanguage, categoryId: string): string {
  if (categoryId === PRACTICE_WORDS_ID) {
    return path.join(PRACTICE_WORDS_DIR, `${language.id}.json`);
  }
  return path.join(CONTENT_ROOT, language.id, `${categoryId}.json`);
}

// Every course category, flagged with whether its target file already exists.
export function getCategoryChoices(language: TargetLanguage): CategoryChoice[] {
  return CATEGORIES.map((category) => ({
    ...category,
    disabledReason: fs.existsSync(getOutputPath(language, category.id)) ? "exists" : ""
  }));
}

export function assertCanWriteContent(language: TargetLanguage, categories: Category[]): void {
  const languageDir = path.join(CONTENT_ROOT, language.id);
  const metaPath = path.join(languageDir, "_meta.json");

  if (!fs.existsSync(languageDir)) {
    throw new Error(
      `Target language directory is missing: ${relPath(languageDir)}. Create it before running this script.`
    );
  }

  if (!fs.existsSync(metaPath)) {
    throw new Error(
      `Target language metadata is missing: ${relPath(metaPath)}. Add _meta.json before running this script.`
    );
  }

  const existing = categories
    .map((category) => getOutputPath(language, category.id))
    .filter((filePath) => fs.existsSync(filePath));

  if (existing.length) {
    throw new Error(
      `Refusing to overwrite existing files:\n${existing
        .map((filePath) => `- ${relPath(filePath)}`)
        .join("\n")}`
    );
  }
}

export function isLanguageReady(language: TargetLanguage): boolean {
  const languageDir = path.join(CONTENT_ROOT, language.id);
  return fs.existsSync(languageDir) && fs.existsSync(path.join(languageDir, "_meta.json"));
}

export function describeLanguagePaths(language: TargetLanguage): { dir: string; meta: string } {
  const dir = path.join(CONTENT_ROOT, language.id);
  return { dir: relPath(dir), meta: relPath(path.join(dir, "_meta.json")) };
}

function readSourceCategory(categoryId: string): ExerciseItem[] {
  const sourcePath = path.join(CONTENT_ROOT, SOURCE_LANGUAGE_ID, `${categoryId}.json`);
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Source category is missing: ${relPath(sourcePath)}`);
  }

  const parsed: unknown = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
  if (!Array.isArray(parsed)) {
    throw new Error(`Source category must be an array: ${relPath(sourcePath)}`);
  }
  return parsed as ExerciseItem[];
}

function rewriteId(id: unknown, language: TargetLanguage): string {
  const original = String(id || "").trim();
  if (!original) return original;
  return original.replace(/^en(?=-)/, language.idPrefix);
}

function collectTranslatableTexts(items: ExerciseItem[]): string[] {
  const texts: string[] = [];

  for (const item of items) {
    if (typeof item.correctAnswer === "string" && item.correctAnswer.trim()) {
      texts.push(item.correctAnswer);
    }
    if (typeof item.target === "string" && item.target.trim()) {
      texts.push(item.target);
    }
    if (Array.isArray(item.options)) {
      for (const option of item.options) {
        if (typeof option === "string" && option.trim()) texts.push(option);
      }
    }
  }

  return texts;
}

function applyTranslatedTexts(
  items: ExerciseItem[],
  language: TargetLanguage,
  translatedBySource: Map<string, string>
): ExerciseItem[] {
  return items.map((item) => {
    const next: ExerciseItem = { ...item, id: rewriteId(item.id, language) };

    if (typeof next.correctAnswer === "string" && next.correctAnswer.trim()) {
      next.correctAnswer = translatedBySource.get(next.correctAnswer) || next.correctAnswer;
    }
    if (typeof next.target === "string" && next.target.trim()) {
      next.target = translatedBySource.get(next.target) || next.target;
    }
    if (Array.isArray(next.options)) {
      next.options = next.options.map((option) =>
        typeof option === "string" && option.trim()
          ? translatedBySource.get(option) || option
          : option
      );
    }

    return next;
  });
}

function readPracticeWordsTemplate(): string[] {
  if (!fs.existsSync(PRACTICE_WORDS_TEMPLATE)) {
    throw new Error(`Practice words template is missing: ${relPath(PRACTICE_WORDS_TEMPLATE)}`);
  }

  const parsed: unknown = JSON.parse(fs.readFileSync(PRACTICE_WORDS_TEMPLATE, "utf8"));
  if (!Array.isArray(parsed)) {
    throw new Error(
      `Practice words template must be an array: ${relPath(PRACTICE_WORDS_TEMPLATE)}`
    );
  }

  return parsed
    .map((word) => (typeof word === "string" ? word.trim() : ""))
    .filter((word) => word.length > 0);
}

interface TranslationUnit {
  uniqueTexts: string[];
  build: (translatedBySource: Map<string, string>) => unknown;
}

function prepareCategoryUnit(categoryId: string, language: TargetLanguage): TranslationUnit {
  const sourceItems = readSourceCategory(categoryId);
  return {
    uniqueTexts: [...new Set(collectTranslatableTexts(sourceItems))],
    build: (translatedBySource) => applyTranslatedTexts(sourceItems, language, translatedBySource)
  };
}

function preparePracticeWordsUnit(): TranslationUnit {
  const words = readPracticeWordsTemplate();
  return {
    uniqueTexts: [...new Set(words)],
    build: (translatedBySource) =>
      words.map((word) => ({ prompt: word, answer: translatedBySource.get(word) || word }))
  };
}

export function prepareTranslationUnit(
  category: Category,
  language: TargetLanguage
): TranslationUnit {
  return category.id === PRACTICE_WORDS_ID
    ? preparePracticeWordsUnit()
    : prepareCategoryUnit(category.id, language);
}

// Words that will actually be sent to the API for a category (after de-duplication).
export function countUniqueTexts(category: Category, language: TargetLanguage): number {
  return prepareTranslationUnit(category, language).uniqueTexts.length;
}

export class CallPacer {
  private readonly delayMs: number;
  private nextAllowedAt = 0;

  constructor(callsPerMinute: number) {
    this.delayMs = callsPerMinute > 0 ? Math.ceil(60000 / callsPerMinute) : 0;
  }

  async wait(): Promise<void> {
    if (!this.delayMs) return;
    const now = Date.now();
    if (this.nextAllowedAt > now) {
      await sleep(this.nextAllowedAt - now);
    }
    this.nextAllowedAt = Date.now() + this.delayMs;
  }
}

async function translateBatch(
  texts: string[],
  config: LibreTranslateConfig,
  pacer: CallPacer,
  stats: TranslationStats
): Promise<string[]> {
  if (!texts.length) return [];

  await pacer.wait();

  const start = Date.now();
  const response = await fetch(`${config.url}/translate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      q: texts,
      source: "en",
      target: config.target,
      format: "text",
      api_key: config.apiKey
    })
  });
  const elapsed = Date.now() - start;

  stats.callCount += 1;
  stats.callDurations.push(elapsed);

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new LibreTranslateRequestError(response.status, body, texts[0] || "");
  }

  const data = (await response.json()) as LibreTranslateResponse;
  const translated = Array.isArray(data.translatedText)
    ? data.translatedText
    : [data.translatedText];

  if (translated.length !== texts.length) {
    throw new Error(
      `LibreTranslate returned ${translated.length} translations for ${texts.length} inputs`
    );
  }

  // Empty strings are returned as-is; the caller decides how to handle them (retry /
  // fall back) rather than aborting an otherwise-successful run.
  return translated.map((value) => String(value || "").trim());
}

export interface TranslateProgress {
  category: Category;
  words: number;
  totalWords: number;
  batchCount: number;
  done: number;
  averageCallMs: number;
}

export interface TranslateCategoryResult {
  outputPath: string;
  elapsed: number;
  callCount: number;
  averageCallMs: number;
  // Source texts that came back empty even after an individual retry. These fall back
  // to the source text in the written file so the caller can flag them for review.
  unresolved: string[];
}

// Translate a single category (or the practice-word pool) and write its JSON file.
// onProgress is invoked after each batch so callers can render a progress bar without
// this module depending on any particular UI.
export async function translateCategory(
  category: Category,
  language: TargetLanguage,
  config: LibreTranslateConfig,
  pacer: CallPacer,
  onProgress?: (progress: TranslateProgress) => void
): Promise<TranslateCategoryResult> {
  const unit = prepareTranslationUnit(category, language);
  const { uniqueTexts } = unit;
  const translatedBySource = new Map<string, string>();
  const unresolved: string[] = [];
  const stats: CategoryStats = { callCount: 0, callDurations: [], startedAt: Date.now() };
  const batchCount = Math.ceil(uniqueTexts.length / TRANSLATE_BATCH_SIZE);

  for (let index = 0; index < uniqueTexts.length; index += TRANSLATE_BATCH_SIZE) {
    const batch = uniqueTexts.slice(index, index + TRANSLATE_BATCH_SIZE);
    const translations = await translateBatch(batch, config, pacer, stats);

    for (const [offset, sourceText] of batch.entries()) {
      let translated = translations[offset];

      // A batched request can return an empty string for an individual item; retry it
      // on its own once before giving up.
      if (!translated) {
        const [retried] = await translateBatch([sourceText], config, pacer, stats);
        translated = retried || "";
      }

      if (!translated) {
        unresolved.push(sourceText);
        translated = sourceText;
      }

      translatedBySource.set(sourceText, translated);
    }

    onProgress?.({
      category,
      words: uniqueTexts.length,
      totalWords: uniqueTexts.length,
      batchCount,
      done: Math.min(index + batch.length, uniqueTexts.length),
      averageCallMs: average(stats.callDurations)
    });
  }

  const translatedItems = unit.build(translatedBySource);
  const outputPath = getOutputPath(language, category.id);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(translatedItems, null, 2)}\n`, "utf8");

  return {
    outputPath,
    elapsed: Date.now() - stats.startedAt,
    callCount: stats.callCount,
    averageCallMs: average(stats.callDurations),
    unresolved
  };
}
