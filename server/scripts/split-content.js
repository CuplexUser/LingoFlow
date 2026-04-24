/* global __dirname, console, process, require */

/**
 * Migration script: splits monolithic <language>.json files into
 * a directory-per-language, file-per-category structure.
 *
 * Before:
 *   server/content/languages/english.json
 *
 * After:
 *   server/content/languages/english/_meta.json
 *   server/content/languages/english/essentials.json
 *   server/content/languages/english/conversation.json
 *   ...
 *
 * Usage: node server/scripts/split-content.js
 */

const fs = require("fs");
const path = require("path");

const CONTENT_DIR = path.join(__dirname, "..", "content", "languages");

const files = fs
  .readdirSync(CONTENT_DIR)
  .filter((f) => f.endsWith(".json") && !fs.statSync(path.join(CONTENT_DIR, f)).isDirectory());

if (!files.length) {
  console.log("No monolithic JSON files found to split.");
  process.exit(0);
}

for (const fileName of files) {
  const filePath = path.join(CONTENT_DIR, fileName);
  const raw = fs.readFileSync(filePath, "utf8");
  const data = JSON.parse(raw);

  const langId = data.id;
  const langDir = path.join(CONTENT_DIR, langId);

  if (fs.existsSync(langDir)) {
    console.log(`Skipping ${langId}: directory already exists.`);
    continue;
  }

  fs.mkdirSync(langDir, { recursive: true });

  // Write _meta.json
  const meta = { id: data.id, label: data.label, flag: data.flag };
  fs.writeFileSync(path.join(langDir, "_meta.json"), JSON.stringify(meta, null, 2) + "\n");

  // Write one file per category
  let totalExercises = 0;
  for (const [categoryId, exercises] of Object.entries(data.course)) {
    const categoryPath = path.join(langDir, `${categoryId}.json`);
    fs.writeFileSync(categoryPath, JSON.stringify(exercises, null, 2) + "\n");
    totalExercises += exercises.length;
  }

  console.log(`✓ ${langId}: ${Object.keys(data.course).length} categories, ${totalExercises} exercises → ${langDir}`);

  // Rename original file as backup
  const backupPath = filePath + ".bak";
  fs.renameSync(filePath, backupPath);
  console.log(`  Backed up original to ${path.basename(backupPath)}`);
}

console.log("\nDone. Run tests to verify, then delete .bak files.");
