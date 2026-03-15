const fs = require("fs");
const path = require("path");

const PRACTICE_WORDS_PATH = path.join(__dirname, "..", "..", "content", "practice-words.json");
let cached = null;

function loadPracticeWords() {
  if (cached) return cached;
  try {
    const raw = fs.readFileSync(PRACTICE_WORDS_PATH, "utf8");
    cached = JSON.parse(raw);
  } catch (_error) {
    cached = {};
  }
  return cached;
}

function getPracticePool(language) {
  const key = String(language || "").toLowerCase();
  const data = loadPracticeWords();
  const entries = Array.isArray(data[key]) ? data[key] : [];
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
