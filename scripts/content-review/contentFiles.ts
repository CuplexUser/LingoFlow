// Reads and edits course content files without reformatting the items it leaves alone.
//
// A few content files are not in JSON.stringify's layout (compact arrays, different
// spacing), so rewriting a whole file after one edit would bury the change in noise.
// Instead each edited item is re-serialized on its own and spliced back in place.

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const CONTENT_DIR = path.join(__dirname, "..", "..", "server", "content", "languages");

type ContentItem = Record<string, unknown> & { id: string };

function categoryPath(language: string, category: string): string {
  return path.join(CONTENT_DIR, language, `${category}.json`);
}

function readCategory(language: string, category: string): ContentItem[] {
  return JSON.parse(fs.readFileSync(categoryPath(language, category), "utf8"));
}

function hashText(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex").slice(0, 16);
}

function hashItem(item: unknown): string {
  return hashText(JSON.stringify(item));
}

// Hashes the parsed content, so line endings and formatting (which git may change on
// checkout) don't make a review look outdated.
function hashCategory(language: string, category: string): string {
  return hashText(JSON.stringify(readCategory(language, category)));
}

// [start, end) offsets of each element of the file's top-level array.
function elementSpans(raw: string): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  let depth = 0;
  let inString = false;
  let escaped = false;
  let start = -1;
  for (let i = 0; i < raw.length; i++) {
    const char = raw[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{" || char === "[") {
      depth++;
      if (depth === 2 && char === "{") start = i;
    } else if (char === "}" || char === "]") {
      if (depth === 2 && char === "}") spans.push([start, i + 1]);
      depth--;
    }
  }
  return spans;
}

// Calls `edit` on a copy of every item; items it changes are written back. Returns the
// number of items changed.
function editCategory(
  language: string,
  category: string,
  edit: (item: ContentItem) => ContentItem | undefined
): number {
  const filePath = categoryPath(language, category);
  let raw: string = fs.readFileSync(filePath, "utf8");
  const eol = raw.includes("\r\n") ? "\r\n" : "\n";
  const items: ContentItem[] = JSON.parse(raw);
  const spans = elementSpans(raw);
  if (spans.length !== items.length) {
    throw new Error(`${filePath}: could not locate every item in the file`);
  }

  let changed = 0;
  // Back to front, so earlier offsets stay valid after each splice.
  for (let i = items.length - 1; i >= 0; i--) {
    const before = JSON.stringify(items[i]);
    const next = edit(JSON.parse(before));
    if (!next || JSON.stringify(next) === before) continue;
    const text = JSON.stringify(next, null, 2)
      .split("\n")
      .map((line, index) => (index ? `  ${line}` : line))
      .join(eol);
    raw = raw.slice(0, spans[i][0]) + text + raw.slice(spans[i][1]);
    changed++;
  }

  if (changed) {
    JSON.parse(raw);
    fs.writeFileSync(filePath, raw);
  }
  return changed;
}

module.exports = { CONTENT_DIR, readCategory, editCategory, hashItem, hashCategory };
