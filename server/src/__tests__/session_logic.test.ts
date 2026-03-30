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
const { generateSession, getContentMetrics } = require("../data.ts");
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

test("evaluateAttempt supports practice speak and listen", () => {
  const speak = {
    id: "ps1",
    type: "practice_speak",
    answer: "I read books.",
    acceptedAnswers: ["I read books"]
  };
  const listen = {
    id: "pl1",
    type: "practice_listen",
    answer: "I eat fruit."
  };

  const speakOk = evaluateAttempt(speak, { textAnswer: "I read bokks" });
  const listenOk = evaluateAttempt(listen, { selectedOption: "I eat fruit." });
  const listenWrong = evaluateAttempt(listen, { selectedOption: "I drink tea." });

  assert.equal(speakOk.correct, true);
  assert.equal(listenOk.correct, true);
  assert.equal(listenWrong.correct, false);
});

test("evaluateAttempt supports practice words pairs", () => {
  const question = {
    id: "pw1",
    type: "practice_words",
    pairs: [
      { left: "gato", right: "cat" },
      { left: "perro", right: "dog" }
    ]
  };

  const ok = evaluateAttempt(question, {
    practicePairs: [
      { left: "perro", right: "dog" },
      { left: "gato", right: "cat" }
    ]
  });
  const wrong = evaluateAttempt(question, {
    practicePairs: [
      { left: "perro", right: "cat" },
      { left: "gato", right: "dog" }
    ]
  });

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

test("generateSession creates practice modes", () => {
  const speak = generateSession({
    language: "spanish",
    category: "essentials",
    mastery: 10,
    count: 6,
    selfRatedLevel: "a1",
    dueItemIds: [],
    weakItemIds: [],
    mode: "speak"
  });
  assert.ok(speak.questions.length >= 1);
  assert.equal(speak.questions[0].type, "practice_speak");

  const listen = generateSession({
    language: "spanish",
    category: "essentials",
    mastery: 10,
    count: 6,
    selfRatedLevel: "a1",
    dueItemIds: [],
    weakItemIds: [],
    mode: "listen"
  });
  assert.ok(listen.questions.length >= 1);
  assert.equal(listen.questions[0].type, "practice_listen");

  const words = generateSession({
    language: "spanish",
    category: "essentials",
    mastery: 10,
    count: 6,
    selfRatedLevel: "a1",
    dueItemIds: [],
    weakItemIds: [],
    mode: "words"
  });
  if (words.questions.length) {
    assert.equal(words.questions[0].type, "practice_words");
    assert.equal(words.questions[0].pairs.length, 8);
  }
});

test("content metrics exposes level coverage and under-target buckets", () => {
  const metrics = getContentMetrics({ language: "spanish" });
  assert.ok(metrics.generatedAt);
  assert.equal(metrics.targetPerLevel, 20);
  assert.equal(metrics.languages.length, 1);
  const spanish = metrics.languages[0];
  assert.equal(spanish.id, "spanish");
  const essentials = spanish.categories.find((entry) => entry.id === "essentials");
  assert.ok(essentials);
  assert.ok(typeof essentials.levelCounts.a1 === "number");
  assert.ok(Array.isArray(essentials.underTargetByLevel));
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
