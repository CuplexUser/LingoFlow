const fs = require("fs");
const path = require("path");

const PRACTICE_WORDS_DIR = path.join(__dirname, "..", "..", "content", "practice_words");
const cache = new Map();

function loadPracticeWords(key) {
  if (cache.has(key)) return cache.get(key);
  let entries = [];
  try {
    const raw = fs.readFileSync(path.join(PRACTICE_WORDS_DIR, `${key}.json`), "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) entries = parsed;
  } catch (_error) {
    entries = [];
  }
  cache.set(key, entries);
  return entries;
}

function getPracticePool(language) {
  const key = String(language || "").toLowerCase();
  const entries = loadPracticeWords(key);
  return entries.map((entry, index) => ({
    id: `${key}-practice-${index + 1}`,
    level: entry.level || "a1",
    prompt: String(entry.prompt || "").trim(),
    correctAnswer: String(entry.answer || "").trim()
  })).filter((entry) => entry.prompt && entry.correctAnswer);
}

module.exports = {
  getPracticePool
};
