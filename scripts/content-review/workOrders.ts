// Content review as work orders any AI can take: a work order is one category file of one
// course plus the rubric, its lint findings and Russian reference items; the result is a
// list of findings with field-level fixes. The CLI (index.ts) and the MCP server (mcp.ts)
// are thin front ends over these functions, which return text for either to show.
//
// Reviews are stored in server/content/reviews/<course>/<category>.json with the hash of the
// file and of each item they reviewed, so outdated reviews and fixes are detected.

const fs = require("node:fs");
const path = require("node:path");
const { z } = require("zod");

const { CATEGORIES } = require("../../server/src/data/constants.ts");
const { lintContent, lintItems } = require("../../server/src/data/contentLint.ts");
const {
  CONTENT_DIR,
  readCategory,
  editCategory,
  hashItem,
  hashCategory
} = require("./contentFiles.ts");
const { RUBRIC, RUBRIC_VERSION, LIST_FIELDS, ReviewResultSchema } = require("./rubric.ts");

const REVIEWS_DIR = path.join(CONTENT_DIR, "..", "reviews");
const WORK_ORDERS_DIR = path.join(REVIEWS_DIR, "work-orders");
const REFERENCE_LANGUAGE = "russian";
const REFERENCE_ITEM_COUNT = 24;
// Learners always know English, so it is never a course: its files are the template the
// other courses were translated from. The lint still checks them.
const SOURCE_LANGUAGE = "english";

type Item = Record<string, unknown> & { id: string };
type Fix = { field: string; text: string | null; list: string[] | null };
type Finding = {
  id: string;
  severity: "error" | "improvement";
  kind: string;
  problem: string;
  fix: Fix[];
  itemHash: string;
  appliedAt?: string;
};
type Review = {
  language: string;
  category: string;
  reviewer: string;
  rubricVersion: number;
  reviewedAt: string;
  contentHash: string;
  summary: string;
  findings: Finding[];
};
// "mcp": the AI returns the result through the submit_review tool.
// "file": the AI replies with JSON that the user saves or pastes into `--import`.
type Delivery = "mcp" | "file";

const LANGUAGES: string[] = fs
  .readdirSync(CONTENT_DIR)
  .filter((entry: string) => fs.statSync(path.join(CONTENT_DIR, entry)).isDirectory())
  .filter((entry: string) => entry !== SOURCE_LANGUAGE)
  .sort();
const CATEGORY_IDS: string[] = CATEGORIES.map((category: { id: string }) => category.id);

class WorkOrderError extends Error {}

function assertLanguage(language: string) {
  if (!LANGUAGES.includes(language)) {
    throw new WorkOrderError(`Unknown course "${language}". Courses: ${LANGUAGES.join(", ")}.`);
  }
}

function assertCategory(category: string) {
  if (!CATEGORY_IDS.includes(category)) {
    throw new WorkOrderError(
      `Unknown category "${category}". Categories: ${CATEGORY_IDS.join(", ")}.`
    );
  }
}

function languageLabel(language: string): string {
  const meta = JSON.parse(fs.readFileSync(path.join(CONTENT_DIR, language, "_meta.json"), "utf8"));
  return meta.label || language;
}

function reviewPath(language: string, category: string): string {
  return path.join(REVIEWS_DIR, language, `${category}.json`);
}

function readReview(language: string, category: string): Review | null {
  const file = reviewPath(language, category);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
}

function writeReview(review: Review) {
  const file = reviewPath(review.language, review.category);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(review, null, 2) + "\n");
}

// A spread of reference items: round-robin over exercise types, preferring items that show
// the extras the other courses lack (accepted answers, cultural notes, authored options).
function referenceItems(category: string): Item[] {
  const richness = (item: Item) =>
    (item.acceptedAnswers ? 2 : 0) +
    (item.culturalNote ? 1 : 0) +
    (item.options || item.clozeOptions ? 1 : 0);
  const byType = new Map<string, Item[]>();
  for (const item of readCategory(REFERENCE_LANGUAGE, category)) {
    const type = String(item.exerciseType || "translate");
    if (!byType.has(type)) byType.set(type, []);
    byType.get(type)!.push(item);
  }
  for (const items of byType.values()) items.sort((a, b) => richness(b) - richness(a));
  const picked: Item[] = [];
  while (
    picked.length < REFERENCE_ITEM_COUNT &&
    [...byType.values()].some((items) => items.length)
  ) {
    for (const items of byType.values()) {
      const next = items.shift();
      if (next && picked.length < REFERENCE_ITEM_COUNT) picked.push(next);
    }
  }
  return picked;
}

// Fields worth showing the reviewer; ids, levels and types stay so findings can cite them.
function compactItem(item: Item) {
  const { difficulty: _difficulty, imageUrl: _imageUrl, audioUrl: _audioUrl, ...rest } = item;
  return rest;
}

function orderId(language: string, category: string): string {
  return `${language}/${category}@${hashCategory(language, category)}`;
}

function parseOrderId(id: string) {
  const match = /^([a-z]+)\/([a-z_]+)@([0-9a-f]+)$/.exec(String(id).trim());
  if (!match)
    throw new WorkOrderError(`"${id}" is not a work order id (expected course/category@hash).`);
  const [, language, category, contentHash] = match;
  assertLanguage(language);
  assertCategory(category);
  return { language, category, contentHash };
}

const RETURN_INSTRUCTIONS: Record<Delivery, (id: string) => string> = {
  mcp: (id) =>
    `When you have reviewed every item, call the \`submit_review\` tool with order_id "${id}", ` +
    "your summary and your findings. If it reports a problem, correct the findings and submit again.",
  file: (id) =>
    `When you have reviewed every item, reply with one JSON code block and nothing else, matching ` +
    `this JSON schema, with order_id "${id}":\n\n` +
    "```json\n" +
    JSON.stringify(z.toJSONSchema(ReviewResultSchema), null, 1) +
    "\n```"
};

// The full work order as Markdown: instructions, return format, and the data.
function buildWorkOrder(language: string, category: string, delivery: Delivery): string {
  assertLanguage(language);
  assertCategory(category);
  const id = orderId(language, category);
  const items = readCategory(language, category).map(compactItem);
  const lint = lintContent([language]).filter((finding: any) => finding.category === category);
  const reference =
    language === REFERENCE_LANGUAGE ? [] : referenceItems(category).map(compactItem);
  const label = languageLabel(language);

  return [
    `# Work order: review ${label} / ${category}`,
    "",
    `Work order id: \`${id}\``,
    "",
    RUBRIC,
    "",
    "## Returning the result",
    "",
    RETURN_INSTRUCTIONS[delivery](id),
    "",
    "## Reference items (Russian course)",
    "",
    reference.length
      ? "```json\n" + JSON.stringify(reference, null, 1) + "\n```"
      : "(This is the reference course itself.)",
    "",
    "## Lint findings for this file",
    "",
    lint.length
      ? lint.map((f: any) => `- ${f.id} (${f.rule}, ${f.severity}): ${f.message}`).join("\n")
      : "(none)",
    "",
    `## Items to review (${label}, ${category}, ${items.length} items)`,
    "",
    "```json\n" + JSON.stringify(items, null, 1) + "\n```",
    ""
  ].join("\n");
}

// Writes file-delivery work orders to disk for AIs that are given files, not tools.
function exportWorkOrders(language: string, categories: string[] = CATEGORY_IDS): string {
  fs.mkdirSync(WORK_ORDERS_DIR, { recursive: true });
  const written = categories.map((category) => {
    const file = path.join(WORK_ORDERS_DIR, `${language}-${category}.md`);
    fs.writeFileSync(file, buildWorkOrder(language, category, "file"));
    return path.relative(process.cwd(), file);
  });
  return `Wrote ${written.length} work orders:\n${written.map((file) => `  ${file}`).join("\n")}`;
}

// Pulls the result object out of an AI reply: a ```json block, or the outermost braces.
function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*\n([\s\S]*?)\n```/.exec(text);
  const body = fenced ? fenced[1] : text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  try {
    return JSON.parse(body);
  } catch (error) {
    throw new WorkOrderError(`The reply does not contain valid JSON: ${(error as Error).message}`);
  }
}

// Validates a result against its work order and stores it. Throws WorkOrderError listing
// every problem, so the reviewing AI can correct them and resubmit.
function submitReview(result: unknown): string {
  const parsed = ReviewResultSchema.safeParse(result);
  if (!parsed.success) {
    const issues = parsed.error.issues.map(
      (issue: any) => `- ${issue.path.join(".")}: ${issue.message}`
    );
    throw new WorkOrderError(`The result does not match the schema:\n${issues.join("\n")}`);
  }
  const { order_id, reviewer, summary, findings } = parsed.data;
  const { language, category, contentHash } = parseOrderId(order_id);
  if (contentHash !== hashCategory(language, category)) {
    throw new WorkOrderError(
      `${language}/${category} has changed since this work order was issued; get a new work order.`
    );
  }

  const items = new Map<string, Item>(
    readCategory(language, category).map((item: Item) => [item.id, item])
  );
  const problems: string[] = [];
  for (const [index, finding] of findings.entries()) {
    if (!items.has(finding.id))
      problems.push(`- findings.${index}: no item has id "${finding.id}"`);
    for (const fix of finding.fix) {
      const isList = LIST_FIELDS.includes(fix.field);
      const removes = fix.text === null && fix.list === null;
      if (
        !removes &&
        (isList ? fix.list === null || fix.text !== null : fix.text === null || fix.list !== null)
      ) {
        problems.push(
          `- findings.${index} (${finding.id}): ${fix.field} takes ${isList ? "list" : "text"}, with the other null`
        );
      }
      if (fix.field === "correctAnswer" && removes) {
        problems.push(`- findings.${index} (${finding.id}): correctAnswer cannot be removed`);
      }
    }
  }
  if (!problems.length) {
    for (const [index, finding] of findings.entries()) {
      for (const message of newLintErrors(language, category, items.get(finding.id)!, [finding])) {
        problems.push(
          `- findings.${index} (${finding.id}): the fix introduces a defect: ${message}`
        );
      }
    }
  }
  if (problems.length) throw new WorkOrderError(`The result has problems:\n${problems.join("\n")}`);

  const review: Review = {
    language,
    category,
    reviewer,
    rubricVersion: RUBRIC_VERSION,
    reviewedAt: new Date().toISOString(),
    contentHash,
    summary,
    findings: findings.map((finding: Omit<Finding, "itemHash">) => ({
      ...finding,
      itemHash: hashItem(items.get(finding.id))
    }))
  };
  writeReview(review);
  const errors = findings.filter((finding: Finding) => finding.severity === "error").length;
  return (
    `Stored the review of ${language}/${category}: ${errors} errors, ` +
    `${findings.length - errors} improvements.`
  );
}

function reviewState(language: string, category: string): string {
  const review = readReview(language, category);
  if (!review) return "not reviewed";
  const open = review.findings.filter((finding) => !finding.appliedAt);
  const errors = open.filter((finding) => finding.severity === "error").length;
  const notes = [
    review.contentHash !== hashCategory(language, category) ? "file changed since" : "",
    review.rubricVersion !== RUBRIC_VERSION ? "older rubric" : ""
  ].filter(Boolean);
  return (
    `reviewed ${review.reviewedAt.slice(0, 10)}: ${errors} errors, ${open.length - errors} improvements open` +
    (notes.length ? ` (${notes.join(", ")})` : "")
  );
}

// Lint counts and review state per category.
function status(languages: string[] = LANGUAGES): string {
  languages.forEach(assertLanguage);
  const findings = lintContent(languages);
  const lines: string[] = [];
  for (const language of languages) {
    lines.push(`${languageLabel(language)} (${language})`);
    for (const category of CATEGORY_IDS) {
      const own = findings.filter((f: any) => f.language === language && f.category === category);
      const errors = own.filter((f: any) => f.severity === "error").length;
      const lint = `lint ${errors} errors, ${own.length - errors} warnings`;
      lines.push(`  ${category.padEnd(20)} ${lint.padEnd(30)} ${reviewState(language, category)}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

function formatFix(fix: Fix): string {
  if (fix.text === null && fix.list === null) return `remove ${fix.field}`;
  return `${fix.field} = ${JSON.stringify(fix.list ?? fix.text)}`;
}

// Stored findings, open ones only unless `includeApplied`.
function listFindings(language: string, category?: string, includeApplied = false): string {
  assertLanguage(language);
  if (category) assertCategory(category);
  const lines: string[] = [];
  for (const id of category ? [category] : CATEGORY_IDS) {
    const review = readReview(language, id);
    if (!review) continue;
    const shown = review.findings.filter((finding) => includeApplied || !finding.appliedAt);
    lines.push(`${language}/${id}: ${reviewState(language, id)}, by ${review.reviewer}`);
    lines.push(`  ${review.summary}`);
    for (const finding of shown) {
      const mark = finding.appliedAt ? "applied" : finding.severity;
      lines.push(`  [${mark}] ${finding.id} (${finding.kind}): ${finding.problem}`);
      for (const fix of finding.fix) lines.push(`      ${formatFix(fix)}`);
    }
    lines.push("");
  }
  return lines.length
    ? lines.join("\n")
    : `No reviews stored for ${language}${category ? `/${category}` : ""}.`;
}

function applyFix(item: Item, fix: Fix) {
  if (fix.text === null && fix.list === null) delete item[fix.field];
  else item[fix.field] = LIST_FIELDS.includes(fix.field) ? fix.list : fix.text;
}

// Lint errors the findings' fixes would add to the item (warnings are heuristics, so only
// errors count). Returns their messages.
function newLintErrors(
  language: string,
  category: string,
  item: Item,
  findings: Array<{ fix: Fix[] }>
): string[] {
  const patched: Item = structuredClone(item);
  for (const finding of findings) for (const fix of finding.fix) applyFix(patched, fix);
  const errors = (target: Item) =>
    lintItems([target], language, category).filter((f: any) => f.severity === "error");
  const before = new Set(errors(item).map((f: any) => f.rule));
  return errors(patched)
    .filter((f: any) => !before.has(f.rule))
    .map((f: any) => `${f.message} (${f.rule})`);
}

// Writes stored fixes into the content files. Items edited since their review are skipped,
// since the fix may no longer fit them.
function applyFixes(
  language: string,
  options: { category?: string; severity?: "error" | "improvement"; ids?: string[] } = {}
): string {
  assertLanguage(language);
  if (options.category) assertCategory(options.category);
  const lines: string[] = [];
  let applied = 0;
  for (const category of options.category ? [options.category] : CATEGORY_IDS) {
    const review = readReview(language, category);
    if (!review) continue;
    const pending = review.findings.filter(
      (finding) =>
        !finding.appliedAt &&
        finding.fix.length &&
        (!options.severity || finding.severity === options.severity) &&
        (!options.ids || options.ids.includes(finding.id))
    );
    if (!pending.length) continue;
    const byId = new Map(pending.map((finding) => [finding.id, finding]));
    const now = new Date().toISOString();
    editCategory(language, category, (item: Item) => {
      const finding = byId.get(item.id);
      if (!finding) return undefined;
      if (finding.itemHash !== hashItem(item)) {
        lines.push(`  skipped ${category}/${item.id}: changed since the review`);
        return undefined;
      }
      // Reviews stored before submitReview linted fixes can still introduce errors.
      for (const message of newLintErrors(language, category, item, [finding])) {
        lines.push(`  check ${category}/${item.id} by hand: ${message}`);
      }
      for (const fix of finding.fix) applyFix(item, fix);
      finding.appliedAt = now;
      applied++;
      return item;
    });
    writeReview(review);
  }
  lines.unshift(`Applied ${applied} fixes to ${language}.`);
  lines.push("Check them with `git diff`, then run `npm run lint:content` and `npm run test`.");
  return lines.join("\n");
}

module.exports = {
  LANGUAGES,
  CATEGORY_IDS,
  WorkOrderError,
  buildWorkOrder,
  exportWorkOrders,
  extractJson,
  submitReview,
  status,
  listFindings,
  applyFixes
};
