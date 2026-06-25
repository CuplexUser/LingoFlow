import type { } from "node"; // ensure file is treated as a module

const test = require("node:test");
const assert = require("node:assert/strict");
const { configureTestDb } = require("./helpers/testDb.ts");
configureTestDb(__filename);

const { calculateXp, evaluateAttempt, normalizeSentence } = require("../index.ts");
const { generateSession, getContentMetrics } = require("../data.ts");
const database = require("../db.ts");

// ─── Types ────────────────────────────────────────────────────────────────────

interface XpInput {
  score: number;
  maxScore: number;
  mistakes: number;
  hintsUsed: number;
  revealedAnswers: number;
  difficultyLevel: string;
}

interface XpResult {
  xpGained: number;
}

interface EvaluationResult {
  correct: boolean;
  errorType: string;
  submitted: string;
}

interface BaseQuestion {
  id: string;
  type: string;
  answer: string;
  acceptedAnswers?: string[];
  clozeAnswer?: string;
  pairs?: any[];
}

interface RecordSessionInput {
  userId?: number;
  language: string;
  category: string;
  score: number;
  maxScore: number;
  mistakes: number;
  xpGained: number;
  difficultyLevel: string;
  today: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createTestUser(prefix: string): number {
  const created = database.createUser({
    email: `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`,
    passwordHash: "hashed-password",
    displayName: prefix,
    emailVerified: true,
    authProvider: "local"
  });
  assert.ok(created);
  return created.id as number;
}

// ─── normalizeSentence ────────────────────────────────────────────────────────

test("normalizeSentence trims punctuation and spaces", () => {
  assert.equal(normalizeSentence("  Hola,   ¿Cómo estás? "), "hola cómo estás");
});

// ─── evaluateAttempt ──────────────────────────────────────────────────────────

test("evaluateAttempt validates build sentence variants", () => {
  const question: BaseQuestion = {
    id: "q1",
    type: "build_sentence",
    answer: "I am learning English.",
    acceptedAnswers: ["I am learning English"]
  };
  const ok = evaluateAttempt(question, { builtSentence: "I am learning English" }) as EvaluationResult;
  const wrong = evaluateAttempt(question, { builtSentence: "I learning am English" }) as EvaluationResult;
  assert.equal(ok.correct, true);
  assert.equal(wrong.correct, false);
  assert.equal(wrong.errorType, "word_order");
});

test("evaluateAttempt accepts close pronunciation matches", () => {
  const question: BaseQuestion = {
    id: "p1",
    type: "pronunciation",
    answer: "I relax by reading books.",
    acceptedAnswers: ["I relax by reading books"]
  };
  const ok = evaluateAttempt(question, { textAnswer: "I relax by reading bokks" }) as EvaluationResult;
  const wrong = evaluateAttempt(question, { textAnswer: "I relax by playing games" }) as EvaluationResult;
  assert.equal(ok.correct, true);
  assert.equal(wrong.correct, false);
});

test("evaluateAttempt supports practice speak and listen", () => {
  const speak: BaseQuestion = { id: "ps1", type: "practice_speak", answer: "I read books.", acceptedAnswers: ["I read books"] };
  const listen: BaseQuestion = { id: "pl1", type: "practice_listen", answer: "I eat fruit." };

  const speakOk = evaluateAttempt(speak, { textAnswer: "I read bokks" }) as EvaluationResult;
  const listenOk = evaluateAttempt(listen, { selectedOption: "I eat fruit." }) as EvaluationResult;
  const listenWrong = evaluateAttempt(listen, { selectedOption: "I drink tea." }) as EvaluationResult;

  assert.equal(speakOk.correct, true);
  assert.equal(listenOk.correct, true);
  assert.equal(listenWrong.correct, false);
});

test("evaluateAttempt accepts normalized cloze answers and classifies cloze mistakes", () => {
  const question: BaseQuestion = { id: "cl-1", type: "cloze_sentence", answer: "placeholder", clozeAnswer: "rápido" };

  const ok = evaluateAttempt(question, { selectedOption: "Rápido!" }) as EvaluationResult;
  const wrong = evaluateAttempt(question, { selectedOption: "Lento" }) as EvaluationResult;

  assert.equal(ok.correct, true);
  assert.equal(ok.errorType, "none");
  assert.equal(wrong.correct, false);
  assert.equal(wrong.errorType, "cloze_choice");
});

test("evaluateAttempt scores flashcards with known/unknown behavior", () => {
  const question: BaseQuestion = { id: "fc-1", type: "flashcard", answer: "unused" };

  const known = evaluateAttempt(question, { selectedOption: "known" }) as EvaluationResult;
  const unknown = evaluateAttempt(question, { selectedOption: "unknown" }) as EvaluationResult;

  assert.equal(known.correct, true);
  assert.equal(known.errorType, "none");
  assert.equal(unknown.correct, false);
  assert.equal(unknown.errorType, "wrong_option");
});

test("evaluateAttempt normalizes punctuation/case for multiple-choice scoring", () => {
  const question: BaseQuestion = { id: "mc-1", type: "mc_sentence", answer: "¡Buenos días!", acceptedAnswers: [] };

  const ok = evaluateAttempt(question, { selectedOption: "¡buenos días!" }) as EvaluationResult;
  assert.equal(ok.correct, true);
  assert.equal(ok.errorType, "none");
});

test("evaluateAttempt supports practice words pairs", () => {
  const question: BaseQuestion = {
    id: "pw1",
    type: "practice_words",
    answer: "",
    pairs: [{ left: "gato", right: "cat" }, { left: "perro", right: "dog" }]
  };
  const ok = evaluateAttempt(question, {
    practicePairs: [{ left: "perro", right: "dog" }, { left: "gato", right: "cat" }]
  }) as EvaluationResult;
  const wrong = evaluateAttempt(question, {
    practicePairs: [{ left: "perro", right: "cat" }, { left: "gato", right: "dog" }]
  }) as EvaluationResult;

  assert.equal(ok.correct, true);
  assert.equal(wrong.correct, false);
});

test("evaluateAttempt grades matching exercises order-independently", () => {
  const question: BaseQuestion = {
    id: "m1",
    type: "matching",
    answer: "",
    pairs: [{ prompt: "A", answer: "1" }, { prompt: "B", answer: "2" }, { prompt: "C", answer: "3" }, { prompt: "D", answer: "4" }]
  };
  const ok = evaluateAttempt(question, {
    matchingPairs: [{ prompt: "C", answer: "3" }, { prompt: "A", answer: "1" }, { prompt: "D", answer: "4" }, { prompt: "B", answer: "2" }]
  }) as EvaluationResult;
  assert.equal(ok.correct, true);
});

// ─── calculateXp ──────────────────────────────────────────────────────────────

test("calculateXp penalizes mistakes and hints", () => {
  const perfect: XpInput = { score: 10, maxScore: 10, mistakes: 0, hintsUsed: 0, revealedAnswers: 0, difficultyLevel: "b1" };
  const poor: XpInput = { score: 6, maxScore: 10, mistakes: 4, hintsUsed: 2, revealedAnswers: 1, difficultyLevel: "b1" };

  const high = calculateXp(perfect) as XpResult;
  const low = calculateXp(poor) as XpResult;
  assert.ok(high.xpGained > low.xpGained);
});

test("calculateXp enforces minimum XP floor for very poor outcomes", () => {
  const result = calculateXp({
    score: 0, maxScore: 10, mistakes: 20, hintsUsed: 20, revealedAnswers: 10, difficultyLevel: "a1"
  } satisfies XpInput) as XpResult;
  assert.equal(result.xpGained, 4);
});

test("calculateXp rewards higher difficulty for identical performance", () => {
  const shared: Omit<XpInput, "difficultyLevel"> = { score: 8, maxScore: 10, mistakes: 1, hintsUsed: 0, revealedAnswers: 0 };
  const a1 = calculateXp({ ...shared, difficultyLevel: "a1" }) as XpResult;
  const b2 = calculateXp({ ...shared, difficultyLevel: "b2" }) as XpResult;
  assert.ok(b2.xpGained > a1.xpGained);
});

// ─── generateSession ──────────────────────────────────────────────────────────

// Deterministic PRNG so session variety is reproducible. Session generation is
// randomized, and `dialogue_turn` (last in the type-rotation cycle) is only
// reached when enough non-fixed-type items are selected, so an unseeded run
// drops it ~5% of the time. Seeding removes the flake.
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test("generateSession includes expanded exercise types", () => {
  // Union across a few fixed seeds so the assertion does not hinge on a single
  // generated layout while staying fully deterministic.
  const types = new Set<string>();
  for (const seed of [1, 2, 3, 4]) {
    const result = generateSession({
      language: "spanish", category: "essentials",
      mastery: 40, count: 10, selfRatedLevel: "b1",
      dueItemIds: [], weakItemIds: [], random: mulberry32(seed)
    });
    result.questions.forEach((item: any) => types.add(item.type));
  }
  assert.ok(types.has("mc_sentence"));
  assert.ok(types.has("build_sentence"));
  assert.ok(types.has("cloze_sentence"));
  assert.ok(types.has("dictation_sentence"));
  assert.ok(types.has("dialogue_turn"));
});

test("generateSession creates practice modes", () => {
  const base = {
    language: "spanish", category: "essentials",
    mastery: 10, count: 6, selfRatedLevel: "a1",
    dueItemIds: [], weakItemIds: []
  };

  const speak = generateSession({ ...base, mode: "speak" });
  assert.ok(speak.questions.length >= 1);
  assert.equal(speak.questions[0].type, "practice_speak");

  const listen = generateSession({ ...base, mode: "listen" });
  assert.ok(listen.questions.length >= 1);
  assert.equal(listen.questions[0].type, "practice_listen");

  const words = generateSession({ ...base, mode: "words" });
  if (words.questions.length) {
    assert.equal(words.questions[0].type, "practice_words");
    assert.equal(words.questions[0].pairs.length, 8);
  }
});

// ─── getContentMetrics ────────────────────────────────────────────────────────

test("content metrics exposes level coverage and under-target buckets", () => {
  const metrics = getContentMetrics({ language: "spanish" });
  assert.ok(metrics.generatedAt);
  assert.equal(metrics.targetPerLevel, 20);
  assert.equal(metrics.languages.length, 1);

  const spanish = metrics.languages[0];
  assert.equal(spanish.id, "spanish");

  const essentials = spanish.categories.find((entry: any) => entry.id === "essentials");
  assert.ok(essentials);
  assert.ok(typeof essentials.levelCounts.a1 === "number");
  assert.ok(Array.isArray(essentials.underTargetByLevel));
});

// ─── recordSession ────────────────────────────────────────────────────────────

test("recordSession updates mastery and daily xp", () => {
  const today = database.toIsoDate() as string;
  const before = database.getProgress(1, "spanish");
  const saved = database.recordSession({
    language: "spanish", category: "essentials",
    score: 8, maxScore: 10, mistakes: 2,
    xpGained: 24, difficultyLevel: "a2", today
  } satisfies Omit<RecordSessionInput, "userId">);
  const after = database.getProgress(1, "spanish");

  assert.ok(saved.mastery >= 0);
  assert.ok(after.totalXp >= before.totalXp);
  assert.ok(after.todayXp >= 24);
});

test("recordSession levels up the learner when cumulative XP crosses a threshold", () => {
  const userId = createTestUser("levelup");
  const today = database.toIsoDate() as string;
  const sessionBase: RecordSessionInput = {
    userId, language: "english", category: "essentials",
    score: 8, maxScore: 10, mistakes: 2,
    xpGained: 0, difficultyLevel: "a2", today
  };

  const first = database.recordSession({ ...sessionBase, category: "essentials", xpGained: 149 });
  const second = database.recordSession({ ...sessionBase, category: "conversation", xpGained: 2 });
  const progress = database.getProgress(userId, "english");

  assert.equal(first.learnerLevel, 1);
  assert.equal(second.learnerLevel, 2);
  assert.equal(progress.totalXp, 151);
  assert.equal(progress.learnerLevel, 2);
});

test("recordSession advances category unlock bands across mastery thresholds", () => {
  const userId = createTestUser("mastery");
  const today = database.toIsoDate() as string;
  const sessionBase: RecordSessionInput = {
    userId, language: "italian", category: "grammar",
    score: 10, maxScore: 10, mistakes: 0,
    xpGained: 30, difficultyLevel: "a1", today
  };

  // Six sessions: first three at a1, last three at b2 to drive unlock band progression
  const results = [
    database.recordSession(sessionBase),
    database.recordSession(sessionBase),
    database.recordSession(sessionBase),
    database.recordSession({ ...sessionBase, xpGained: 36, difficultyLevel: "b2" }),
    database.recordSession({ ...sessionBase, xpGained: 36, difficultyLevel: "b2" }),
    database.recordSession({ ...sessionBase, xpGained: 36, difficultyLevel: "b2" })
  ];

  assert.equal(results[1].levelUnlocked, "a1");
  assert.equal(results[2].levelUnlocked, "a2");
  assert.equal(results[3].levelUnlocked, "a2");
  assert.equal(results[4].levelUnlocked, "b1");
  assert.equal(results[5].levelUnlocked, "b2");
});
