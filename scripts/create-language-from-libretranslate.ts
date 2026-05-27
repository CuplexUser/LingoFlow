#!/usr/bin/env node --experimental-strip-types

const fs: typeof import("fs") = require("fs");
const path: typeof import("path") = require("path");
const readline: typeof import("readline") = require("readline");

interface Choice {
  label: string;
}

interface TargetLanguage extends Choice {
  id: string;
  libreCode: string;
  idPrefix: string;
}

interface Category extends Choice {
  id: string;
}

interface CategoryChoice extends Category {
  disabledReason: string;
}

interface RateLimitChoice extends Choice {
  value: number;
}

interface ChooseManyOptions {
  initialCursor?: number;
  singleSelect?: boolean;
  selected?: Set<number>;
  allowBack?: boolean;
  subtitle?: string;
  selectAllIndex?: number;
}

interface PromptResult<T> {
  action: "submit" | "back" | "cancel";
  selected: T[];
}

interface ExerciseItem {
  id?: unknown;
  correctAnswer?: unknown;
  target?: unknown;
  options?: unknown;
  [key: string]: unknown;
}

interface LibreTranslateConfig {
  url: string;
  apiKey: string;
  target: string;
}

interface TranslationStats {
  callCount: number;
  callDurations: number[];
}

interface CategoryStats extends TranslationStats {
  startedAt: number;
}

interface CompletedCategoryStats {
  category: Category;
  elapsed: number;
  callCount: number;
  averageCallMs: number;
}

interface TotalStats extends TranslationStats {
  startedAt: number;
  categories: CompletedCategoryStats[];
}

interface LibreTranslateResponse {
  translatedText?: string;
}

class LibreTranslateRequestError extends Error {
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

interface WizardSelections {
  language?: TargetLanguage;
  categories?: Category[];
  rateLimit?: RateLimitChoice;
}

type WizardStep = "language" | "categories" | "rateLimit" | "confirm";

interface ConfirmChoice extends Choice {
  action: "start" | "back";
}

const REPO_ROOT = path.resolve(__dirname, "..");
const SERVER_ENV_PATH = path.join(REPO_ROOT, "server", ".env");
const CONTENT_ROOT = path.join(REPO_ROOT, "server", "content", "languages");
const SOURCE_LANGUAGE_ID = "english";

const TARGET_LANGUAGES: TargetLanguage[] = [
  { id: "french", label: "French", libreCode: "fr", idPrefix: "fr" },
  { id: "german", label: "German", libreCode: "de", idPrefix: "de" }
];

const CATEGORIES: Category[] = [
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

const RATE_LIMITS: RateLimitChoice[] = [
  { label: "60 calls/minute", value: 60 },
  { label: "120 calls/minute", value: 120 },
  { label: "240 calls/minute", value: 240 },
  { label: "Unlimited", value: 0 }
];

const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  hideCursor: "\x1b[?25l",
  showCursor: "\x1b[?25h"
};

function color(text: string, code: string): string {
  return `${code}${text}${ANSI.reset}`;
}

function loadEnv(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing ${path.relative(REPO_ROOT, filePath)}. LibreTranslate config lives there.`);
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
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }

  return env;
}

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms)) return "n/a";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clearRenderedLines(count: number): void {
  for (let i = 0; i < count; i += 1) {
    readline.moveCursor(process.stdout, 0, -1);
    readline.clearLine(process.stdout, 0);
  }
}

function visibleLength(text: string): number {
  const ansiPattern = new RegExp(`${String.fromCharCode(27)}\\[[0-9;?]*[A-Za-z]`, "g");
  return text.replace(ansiPattern, "").length;
}

function padVisible(text: string, width: number): string {
  return `${text}${" ".repeat(Math.max(0, width - visibleLength(text)))}`;
}

function makePanel(title: string, body: string[], footer: string[], width = 82): string[] {
  const top = `+${"-".repeat(width - 2)}+`;
  const titleText = ` ${color(title, ANSI.bold)} `;
  const titleLine = `|${padVisible(titleText, width - 2)}|`;
  const divider = `+${"-".repeat(width - 2)}+`;
  const rows = [...body, "", ...footer]
    .flatMap((line) => wrapPanelLine(line, width - 4))
    .map((line) => `| ${padVisible(line, width - 4)} |`);
  return [top, titleLine, divider, ...rows, top];
}

function wrapPanelLine(line: string, width: number): string[] {
  if (visibleLength(line) <= width) return [line];

  const hasAnsi = line.includes(String.fromCharCode(27));
  if (hasAnsi) return [line];

  const words = line.split(" ");
  const wrapped: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > width && current) {
      wrapped.push(current);
      current = word;
    } else {
      current = next;
    }
  }

  if (current) wrapped.push(current);
  return wrapped.length ? wrapped : [line];
}

function renderSelectionPanel<T extends Choice>(
  title: string,
  choices: T[],
  cursor: number,
  selected: Set<number>,
  options: ChooseManyOptions
): string[] {
  const body: string[] = [];
  if (options.subtitle) {
    body.push(...options.subtitle.split("\n").map((line) => color(line, ANSI.dim)), "");
  }

  const selectableCount =
    options.selectAllIndex === undefined ? choices.length : Math.max(0, choices.length - 1);
  const selectedCount =
    options.selectAllIndex === undefined
      ? selected.size
      : [...selected].filter((index) => index !== options.selectAllIndex).length;

  body.push(`${color("Selected", ANSI.cyan)} ${selectedCount}/${selectableCount}`);
  body.push("");
  body.push("   Sel  Item");
  body.push("   ---  ------------------------------------------------------------");

  for (const [index, choice] of choices.entries()) {
    const pointer = index === cursor ? color(">", ANSI.green) : " ";
    const isSelected =
      options.selectAllIndex === index
        ? selectedCount === selectableCount && selectableCount > 0
        : selected.has(index);
    const marker = isSelected ? color("[x]", ANSI.green) : "[ ]";
    const label = index === cursor ? color(choice.label, ANSI.bold) : choice.label;
    body.push(` ${pointer} ${marker}  ${label}`);
  }

  const footer = [
    `${color("Keys", ANSI.cyan)} Up/Down move  Space select${options.singleSelect ? "" : "/toggle"}  Enter continue`,
    `${options.allowBack ? "Backspace/B back  " : ""}Esc/Q cancel`
  ];

  return makePanel(title, body, footer);
}

async function showNotice(title: string, lines: string[], allowBack: boolean): Promise<"back" | "cancel"> {
  let renderedLines = 0;

  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) process.stdin.setRawMode(true);

  function render(): void {
    if (renderedLines > 0) clearRenderedLines(renderedLines);
    const panel = makePanel(title, lines, [
      `${allowBack ? "Backspace/B back  " : ""}Esc/Q cancel`
    ]);
    process.stdout.write(`${panel.join("\n")}\n`);
    renderedLines = panel.length;
  }

  return new Promise((resolve) => {
    function done(action: "back" | "cancel"): void {
      if (process.stdin.isTTY) process.stdin.setRawMode(false);
      process.stdin.removeListener("keypress", onKeypress);
      if (renderedLines > 0) clearRenderedLines(renderedLines);
      resolve(action);
    }

    function onKeypress(_text: string, key: import("readline").Key): void {
      if ((key.ctrl && key.name === "c") || key.name === "escape" || key.name === "q") {
        done("cancel");
      } else if (allowBack && (key.name === "backspace" || key.name === "b" || key.name === "return")) {
        done("back");
      }
    }

    process.stdin.on("keypress", onKeypress);
    render();
  });
}

function cancelRun(): never {
  throw new Error("Cancelled.");
}

async function chooseOne<T extends Choice>(
  title: string,
  choices: T[],
  options: ChooseManyOptions = {}
): Promise<PromptResult<T>> {
  const selected = new Set([0]);
  return chooseMany(title, choices, {
    initialCursor: 0,
    singleSelect: true,
    selected,
    ...options
  });
}

async function chooseMany<T extends Choice>(
  title: string,
  choices: T[],
  options: ChooseManyOptions = {}
): Promise<PromptResult<T>> {
  const selected = options.selected || new Set<number>();
  let cursor = options.initialCursor || 0;
  let renderedLines = 0;

  if (!choices.length) {
    throw new Error(`No choices available for ${title}`);
  }

  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) process.stdin.setRawMode(true);

  function render(): void {
    if (renderedLines > 0) clearRenderedLines(renderedLines);
    const lines = renderSelectionPanel(title, choices, cursor, selected, options);
    process.stdout.write(`${lines.join("\n")}\n`);
    renderedLines = lines.length;
  }

  return new Promise((resolve) => {
    function done(action: PromptResult<T>["action"]): void {
      if (process.stdin.isTTY) process.stdin.setRawMode(false);
      process.stdin.removeListener("keypress", onKeypress);
      if (renderedLines > 0) clearRenderedLines(renderedLines);
      const picked = choices.filter((_, index) => selected.has(index));
      resolve({ action, selected: picked });
    }

    function onKeypress(text: string, key: import("readline").Key): void {
      const isSpace = key.name === "space" || text === " " || key.sequence === " ";
      const isEnter = key.name === "return" || key.name === "enter" || key.sequence === "\r";
      const selectableIndexes = choices
        .map((_, index) => index)
        .filter((index) => index !== options.selectAllIndex);

      if ((key.ctrl && key.name === "c") || key.name === "escape" || key.name === "q") {
        done("cancel");
        return;
      }
      if (options.allowBack && (key.name === "backspace" || key.name === "b")) {
        done("back");
        return;
      }
      if (key.name === "up") {
        cursor = (cursor - 1 + choices.length) % choices.length;
      } else if (key.name === "down") {
        cursor = (cursor + 1) % choices.length;
      } else if (isSpace) {
        if (options.singleSelect) {
          selected.clear();
          selected.add(cursor);
          done("submit");
          return;
        } else if (cursor === options.selectAllIndex) {
          const allSelected = selectableIndexes.every((index) => selected.has(index));
          selected.clear();
          if (!allSelected) {
            selectableIndexes.forEach((index) => selected.add(index));
          }
        } else {
          if (selected.has(cursor)) selected.delete(cursor);
          else selected.add(cursor);
        }
      } else if (isEnter) {
        if (options.singleSelect) {
          selected.clear();
          selected.add(cursor);
        }
        if (selectableIndexes.some((index) => selected.has(index))) done("submit");
        return;
      }
      render();
    }

    process.stdin.on("keypress", onKeypress);
    render();
  });
}

function getExistingCategoryChoices(languageDir: string): CategoryChoice[] {
  return CATEGORIES.map((category) => {
    const outputPath = path.join(languageDir, `${category.id}.json`);
    return {
      ...category,
      disabledReason: fs.existsSync(outputPath) ? "already exists" : ""
    };
  });
}

function assertCanWriteCategories(language: TargetLanguage, categories: Category[]): void {
  const languageDir = path.join(CONTENT_ROOT, language.id);
  const metaPath = path.join(languageDir, "_meta.json");

  if (!fs.existsSync(languageDir)) {
    throw new Error(
      `Target language directory is missing: ${path.relative(REPO_ROOT, languageDir)}. Create it before running this script.`
    );
  }

  if (!fs.existsSync(metaPath)) {
    throw new Error(
      `Target language metadata is missing: ${path.relative(REPO_ROOT, metaPath)}. Add _meta.json before running this script.`
    );
  }

  const existing = categories
    .map((category) => path.join(languageDir, `${category.id}.json`))
    .filter((filePath) => fs.existsSync(filePath));

  if (existing.length) {
    throw new Error(
      `Refusing to overwrite existing files:\n${existing
        .map((filePath) => `- ${path.relative(REPO_ROOT, filePath)}`)
        .join("\n")}`
    );
  }
}

function readSourceCategory(categoryId: string): ExerciseItem[] {
  const sourcePath = path.join(CONTENT_ROOT, SOURCE_LANGUAGE_ID, `${categoryId}.json`);
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Source category is missing: ${path.relative(REPO_ROOT, sourcePath)}`);
  }

  const parsed: unknown = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
  if (!Array.isArray(parsed)) {
    throw new Error(`Source category must be an array: ${path.relative(REPO_ROOT, sourcePath)}`);
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
        typeof option === "string" && option.trim() ? translatedBySource.get(option) || option : option
      );
    }

    return next;
  });
}

class CallPacer {
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

async function translateText(
  text: string,
  config: LibreTranslateConfig,
  pacer: CallPacer,
  stats: TranslationStats
): Promise<string> {
  await pacer.wait();

  const start = Date.now();
  const response = await fetch(`${config.url}/translate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      q: text,
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
    throw new LibreTranslateRequestError(response.status, body, text);
  }

  const data = (await response.json()) as LibreTranslateResponse;
  const translatedText = String(data.translatedText || "").trim();
  if (!translatedText) {
    throw new Error(`LibreTranslate returned an empty translation for "${text}"`);
  }

  return translatedText;
}

function average(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function renderProgress(label: string, current: number, total: number, stats: TranslationStats): void {
  const width = 28;
  const ratio = total === 0 ? 1 : current / total;
  const filled = Math.round(width * ratio);
  const bar = `${"#".repeat(filled)}${"-".repeat(width - filled)}`;
  const averageCallMs = average(stats.callDurations);

  readline.clearLine(process.stdout, 0);
  readline.cursorTo(process.stdout, 0);
  process.stdout.write(`${label} [${bar}] ${current}/${total} avg call ${formatDuration(averageCallMs)}`);
}

function buildSummaryLines(selections: Required<WizardSelections>): string[] {
  const categoryNames = selections.categories.map((category) => category.label).join(", ");
  const estimatedUniqueCalls = selections.categories.reduce((total, category) => {
    const sourceItems = readSourceCategory(category.id);
    return total + new Set(collectTranslatableTexts(sourceItems)).size;
  }, 0);

  return [
    `${color("Language", ANSI.cyan)}      ${selections.language.label} (${selections.language.libreCode})`,
    `${color("Categories", ANSI.cyan)}    ${selections.categories.length}`,
    `              ${categoryNames}`,
    `${color("Rate limit", ANSI.cyan)}    ${selections.rateLimit.label}`,
    `${color("API calls", ANSI.cyan)}     about ${estimatedUniqueCalls}`,
    "",
    color("This will create new JSON files only. Existing category files are never overwritten.", ANSI.yellow)
  ];
}

async function collectWizardSelections(initialSelections: WizardSelections = {}): Promise<Required<WizardSelections>> {
  const selections: WizardSelections = { ...initialSelections };
  let step: WizardStep = selections.language ? "categories" : "language";

  while (true) {
    if (step === "language") {
      const result = await chooseOne("LingoFlow LibreTranslate Generator", TARGET_LANGUAGES, {
        subtitle: "Select the language content to create from English."
      });
      if (result.action === "cancel") cancelRun();

      const language = result.selected[0];
      const languageDir = path.join(CONTENT_ROOT, language.id);
      const metaPath = path.join(languageDir, "_meta.json");

      if (!fs.existsSync(languageDir) || !fs.existsSync(metaPath)) {
        const action = await showNotice(
          `${language.label} is not ready`,
          [
            `Expected directory: ${path.relative(REPO_ROOT, languageDir)}`,
            `Expected metadata:  ${path.relative(REPO_ROOT, metaPath)}`,
            "",
            "Create the language directory and _meta.json first, then run this tool again."
          ],
          true
        );
        if (action === "cancel") cancelRun();
        step = "language";
        continue;
      }

      selections.language = language;
      step = "categories";
      continue;
    }

    if (step === "categories") {
      if (!selections.language) {
        step = "language";
        continue;
      }

      const languageDir = path.join(CONTENT_ROOT, selections.language.id);
      const availableCategoryChoices = getExistingCategoryChoices(languageDir).filter(
        (category) => !category.disabledReason
      );

      if (!availableCategoryChoices.length) {
        const action = await showNotice(
          `No categories available for ${selections.language.label}`,
          [
            "Every known category file already exists for this language.",
            "",
            "Remove the category JSON files you want to regenerate before running this tool."
          ],
          true
        );
        if (action === "cancel") cancelRun();
        step = "language";
        continue;
      }

      const selectedIndexes = new Set<number>();
      if (selections.categories) {
        const selectedIds = new Set(selections.categories.map((category) => category.id));
        availableCategoryChoices.forEach((category, index) => {
          if (selectedIds.has(category.id)) selectedIndexes.add(index);
        });
      }

      const choicesWithAll: Category[] = [
        { id: "__all__", label: "All available categories" },
        ...availableCategoryChoices
      ];

      const result = await chooseMany("Select Categories", choicesWithAll, {
        allowBack: true,
        selected: new Set([...selectedIndexes].map((index) => index + 1)),
        selectAllIndex: 0,
        subtitle: "Space toggles one or more categories. Existing files are hidden."
      });
      if (result.action === "cancel") cancelRun();
      if (result.action === "back") {
        step = "language";
        continue;
      }

      selections.categories = result.selected.filter((category) => category.id !== "__all__");
      step = "rateLimit";
      continue;
    }

    if (step === "rateLimit") {
      const result = await chooseOne("Select LibreTranslate Rate Limit", RATE_LIMITS, {
        allowBack: true,
        subtitle: "Pick the client-side pacing for API calls."
      });
      if (result.action === "cancel") cancelRun();
      if (result.action === "back") {
        step = "categories";
        continue;
      }

      selections.rateLimit = result.selected[0];
      step = "confirm";
      continue;
    }

    if (step === "confirm") {
      if (!selections.language || !selections.categories || !selections.rateLimit) {
        step = "language";
        continue;
      }

      const confirmChoices: ConfirmChoice[] = [
        { label: "Start translation", action: "start" },
        { label: "Back to rate limit", action: "back" }
      ];
      const result = await chooseOne("Review Translation Job", confirmChoices, {
        allowBack: true,
        subtitle: buildSummaryLines({
          language: selections.language,
          categories: selections.categories,
          rateLimit: selections.rateLimit
        }).join("\n")
      });
      if (result.action === "cancel") cancelRun();
      if (result.action === "back" || result.selected[0].action === "back") {
        step = "rateLimit";
        continue;
      }

      return {
        language: selections.language,
        categories: selections.categories,
        rateLimit: selections.rateLimit
      };
    }
  }
}

async function translateCategory(
  category: Category,
  language: TargetLanguage,
  config: LibreTranslateConfig,
  pacer: CallPacer,
  totalStats: TotalStats
): Promise<void> {
  const sourceItems = readSourceCategory(category.id);
  const uniqueTexts = [...new Set(collectTranslatableTexts(sourceItems))];
  const translatedBySource = new Map<string, string>();
  const categoryStats: CategoryStats = {
    callCount: 0,
    callDurations: [],
    startedAt: Date.now()
  };

  console.log(`\nTranslating ${category.label} (${uniqueTexts.length} unique API calls)`);

  for (let index = 0; index < uniqueTexts.length; index += 1) {
    const sourceText = uniqueTexts[index];
    const translatedText = await translateText(sourceText, config, pacer, categoryStats);
    translatedBySource.set(sourceText, translatedText);
    renderProgress(category.label, index + 1, uniqueTexts.length, categoryStats);
  }

  if (uniqueTexts.length > 0) process.stdout.write("\n");

  const translatedItems = applyTranslatedTexts(sourceItems, language, translatedBySource);
  const outputPath = path.join(CONTENT_ROOT, language.id, `${category.id}.json`);
  fs.writeFileSync(outputPath, `${JSON.stringify(translatedItems, null, 2)}\n`, "utf8");

  const elapsed = Date.now() - categoryStats.startedAt;
  const averageCallMs = average(categoryStats.callDurations);

  totalStats.callCount += categoryStats.callCount;
  totalStats.callDurations.push(...categoryStats.callDurations);
  totalStats.categories.push({ category, elapsed, callCount: categoryStats.callCount, averageCallMs });

  console.log(
    `Wrote ${path.relative(REPO_ROOT, outputPath)} in ${formatDuration(elapsed)} (avg call ${formatDuration(
      averageCallMs
    )})`
  );
}

async function runTranslationJob(
  selections: Required<WizardSelections>,
  configBase: LibreTranslateConfig
): Promise<"done" | "back"> {
  const { language, categories, rateLimit } = selections;
  const pacer = new CallPacer(rateLimit.value);
  const totalStats: TotalStats = {
    startedAt: Date.now(),
    callCount: 0,
    callDurations: [],
    categories: []
  };
  const config: LibreTranslateConfig = { ...configBase, target: language.libreCode };

  console.log(
    `\nCreating ${language.label} content from English with ${
      rateLimit.value ? `${rateLimit.value} calls/minute` : "no client-side rate limit"
    }.`
  );
  console.log("Only new category files will be written. Existing files are never overwritten.");

  try {
    for (const category of categories) {
      await translateCategory(category, language, config, pacer, totalStats);
    }
  } catch (error) {
    if (error instanceof LibreTranslateRequestError && error.status === 400) {
      const action = await showNotice(
        "LibreTranslate rejected the request",
        [
          error.message,
          "",
          "No files were written for the category that failed.",
          "Go back to adjust your selection, or cancel the generator."
        ],
        true
      );
      if (action === "cancel") cancelRun();
      return "back";
    }
    throw error;
  }

  const totalElapsed = Date.now() - totalStats.startedAt;
  const averageCallMs = average(totalStats.callDurations);

  console.log("\nDone.");
  console.log(`Total time: ${formatDuration(totalElapsed)}`);
  console.log(`Total API calls: ${totalStats.callCount}`);
  console.log(`Average API call: ${formatDuration(averageCallMs)}`);
  console.log("Category timings:");
  for (const row of totalStats.categories) {
    console.log(
      `- ${row.category.label}: ${formatDuration(row.elapsed)}, ${row.callCount} calls, avg ${formatDuration(
        row.averageCallMs
      )}`
    );
  }

  return "done";
}

async function main(): Promise<void> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("This script is interactive and must be run in a terminal.");
  }

  process.stdout.write(ANSI.hideCursor);

  try {
    const env = loadEnv(SERVER_ENV_PATH);
    const libreUrl = String(env.LIBRETRANSLATE_URL || "").replace(/\/$/, "");
    const apiKey = String(env.LIBRETRANSLATE_API_KEY || "").trim();

    if (!libreUrl) throw new Error("LIBRETRANSLATE_URL is missing in server/.env");
    if (!apiKey) throw new Error("LIBRETRANSLATE_API_KEY is missing in server/.env");

    const configBase: LibreTranslateConfig = { url: libreUrl, apiKey, target: "" };
    let selections: Required<WizardSelections> | undefined;

    while (true) {
      selections = await collectWizardSelections(selections);
      assertCanWriteCategories(selections.language, selections.categories);

      const result = await runTranslationJob(selections, configBase);
      if (result === "done") break;
    }
  } finally {
    process.stdout.write(ANSI.showCursor);
  }
}

main().catch((error: unknown) => {
  console.error(`\n${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
