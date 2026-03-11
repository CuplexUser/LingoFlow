const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const testDbPath = path.join(
  __dirname,
  "..",
  "..",
  "data",
  `lingoflow.${path.basename(__filename, path.extname(__filename))}.${process.pid}.${Date.now()}.test.db`
);
process.env.LINGOFLOW_DB_PATH = testDbPath;

const { calculateXp, evaluateAttempt, normalizeSentence } = require("../index.ts");
const { generateSession } = require("../data.ts");
const database = require("../db.ts");

function createTestUser(prefix) {
  const created = database.createUser({
    email: `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`,
    passwordHash: "hashed-password",
    displayName: prefix,
    emailVerified: true,
    authProvider: "local"
  });
  assert.ok(created);
  return created.id;
}

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

test("evaluateAttempt accepts close pronunciation matches", () => {
  const question = {
    id: "p1",
    type: "pronunciation",
    answer: "I relax by reading books.",
    acceptedAnswers: ["I relax by reading books"]
  };

  const ok = evaluateAttempt(question, { textAnswer: "I relax by reading bokks" });
  const wrong = evaluateAttempt(question, { textAnswer: "I relax by playing games" });

  assert.equal(ok.correct, true);
  assert.equal(wrong.correct, false);
});

test("evaluateAttempt grades matching exercises order-independently", () => {
  const question = {
    id: "m1",
    type: "matching",
    pairs: [
      { prompt: "A", answer: "1" },
      { prompt: "B", answer: "2" },
      { prompt: "C", answer: "3" },
      { prompt: "D", answer: "4" }
    ]
  };

  const ok = evaluateAttempt(question, {
    matchingPairs: [
      { prompt: "C", answer: "3" },
      { prompt: "A", answer: "1" },
      { prompt: "D", answer: "4" },
      { prompt: "B", answer: "2" }
    ]
  });
  assert.equal(ok.correct, true);
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

test("recordSession levels up the learner when cumulative XP crosses a threshold", () => {
  const userId = createTestUser("levelup");
  const today = database.toIsoDate();

  const first = database.recordSession({
    userId,
    language: "english",
    category: "essentials",
    score: 8,
    maxScore: 10,
    mistakes: 2,
    xpGained: 149,
    difficultyLevel: "a2",
    today
  });
  const second = database.recordSession({
    userId,
    language: "english",
    category: "conversation",
    score: 8,
    maxScore: 10,
    mistakes: 2,
    xpGained: 2,
    difficultyLevel: "a2",
    today
  });

  const progress = database.getProgress(userId, "english");
  assert.equal(first.learnerLevel, 1);
  assert.equal(second.learnerLevel, 2);
  assert.equal(progress.totalXp, 151);
  assert.equal(progress.learnerLevel, 2);
});

test("recordSession advances category unlock bands across mastery thresholds", () => {
  const userId = createTestUser("mastery");
  const today = database.toIsoDate();
  const results = [];

  results.push(database.recordSession({
    userId,
    language: "italian",
    category: "grammar",
    score: 10,
    maxScore: 10,
    mistakes: 0,
    xpGained: 30,
    difficultyLevel: "a1",
    today
  }));
  results.push(database.recordSession({
    userId,
    language: "italian",
    category: "grammar",
    score: 10,
    maxScore: 10,
    mistakes: 0,
    xpGained: 30,
    difficultyLevel: "a1",
    today
  }));
  results.push(database.recordSession({
    userId,
    language: "italian",
    category: "grammar",
    score: 10,
    maxScore: 10,
    mistakes: 0,
    xpGained: 30,
    difficultyLevel: "a1",
    today
  }));
  results.push(database.recordSession({
    userId,
    language: "italian",
    category: "grammar",
    score: 10,
    maxScore: 10,
    mistakes: 0,
    xpGained: 36,
    difficultyLevel: "b2",
    today
  }));
  results.push(database.recordSession({
    userId,
    language: "italian",
    category: "grammar",
    score: 10,
    maxScore: 10,
    mistakes: 0,
    xpGained: 36,
    difficultyLevel: "b2",
    today
  }));
  results.push(database.recordSession({
    userId,
    language: "italian",
    category: "grammar",
    score: 10,
    maxScore: 10,
    mistakes: 0,
    xpGained: 36,
    difficultyLevel: "b2",
    today
  }));

  assert.equal(results[1].levelUnlocked, "a1");
  assert.equal(results[2].levelUnlocked, "a2");
  assert.equal(results[3].levelUnlocked, "a2");
  assert.equal(results[4].levelUnlocked, "b1");
  assert.equal(results[5].levelUnlocked, "b2");
});
