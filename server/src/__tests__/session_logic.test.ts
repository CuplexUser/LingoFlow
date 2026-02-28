const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const fs = require("fs");

const testDbPath = path.join(__dirname, "..", "..", "data", "lingoflow.test.db");
process.env.LINGOFLOW_DB_PATH = testDbPath;
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}

const { calculateXp, evaluateAttempt, normalizeSentence } = require("../index.ts");
const { generateSession } = require("../data.ts");
const database = require("../db.ts");

test("normalizeSentence trims punctuation and spaces", () => {
  assert.equal(normalizeSentence("  Hola,   ¿Cómo estás? "), "hola cómo estás");
});

test("evaluateAttempt validates build sentence variants", () => {
  const question = {
    id: "q1",
    type: "build_sentence",
    answer: "I am learning English.",
    acceptedAnswers: ["I am learning English"]
  };
  const ok = evaluateAttempt(question, { builtSentence: "I am learning English" });
  const wrong = evaluateAttempt(question, { builtSentence: "I learning am English" });
  assert.equal(ok.correct, true);
  assert.equal(wrong.correct, false);
  assert.equal(wrong.errorType, "word_order");
});

test("calculateXp penalizes mistakes and hints", () => {
  const high = calculateXp({
    score: 10,
    maxScore: 10,
    mistakes: 0,
    hintsUsed: 0,
    revealedAnswers: 0,
    difficultyLevel: "b1"
  });
  const low = calculateXp({
    score: 6,
    maxScore: 10,
    mistakes: 4,
    hintsUsed: 2,
    revealedAnswers: 1,
    difficultyLevel: "b1"
  });
  assert.ok(high.xpGained > low.xpGained);
});

test("generateSession includes expanded exercise types", () => {
  const result = generateSession({
    language: "spanish",
    category: "essentials",
    mastery: 40,
    count: 10,
    selfRatedLevel: "b1",
    dueItemIds: [],
    weakItemIds: []
  });
  const types = new Set(result.questions.map((item) => item.type));
  assert.ok(types.has("mc_sentence"));
  assert.ok(types.has("build_sentence"));
  assert.ok(types.has("cloze_sentence"));
  assert.ok(types.has("dictation_sentence"));
  assert.ok(types.has("dialogue_turn"));
});

test("recordSession updates mastery and daily xp", () => {
  const today = database.toIsoDate();
  const before = database.getProgress(1, "spanish");
  const saved = database.recordSession({
    language: "spanish",
    category: "essentials",
    score: 8,
    maxScore: 10,
    mistakes: 2,
    xpGained: 24,
    difficultyLevel: "a2",
    today
  });
  const after = database.getProgress(1, "spanish");
  assert.ok(saved.mastery >= 0);
  assert.ok(after.totalXp >= before.totalXp);
  assert.ok(after.todayXp >= 24);
});
