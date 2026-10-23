import type { } from "node"; // ensure file is treated as a module

const test = require("node:test");
const assert = require("node:assert/strict");
const { configureTestDb, initTestDb } = require("./helpers/testDb.ts");
configureTestDb(__filename);

test.before(async () => {
  await initTestDb();
});

const { itemState, skillState, buildKnowledgeMap } = require("../knowledge.ts");
const { createSkillIndex } = require("../data/skills.ts");
const { createApp } = require("../index.ts");
const { SKILLS } = require("../data.ts");

const TODAY = "2026-10-23";

function row(itemId: string, fields: Record<string, unknown> = {}) {
  return {
    itemId,
    streak: 0,
    attempts: 1,
    correct: 0,
    errorCount: 0,
    lastSeenDate: "2026-10-20",
    nextDueDate: "2026-10-24",
    flashcardKnown: false,
    ...fields
  };
}

test("an item is learning, known, strong or due by its streak and due date", () => {
  assert.equal(itemState(undefined, TODAY), "not_seen");
  assert.equal(itemState(row("a", { attempts: 0 }), TODAY), "not_seen");
  assert.equal(itemState(row("a", { streak: 1 }), TODAY), "learning");
  assert.equal(itemState(row("a", { streak: 2 }), TODAY), "known");
  assert.equal(itemState(row("a", { streak: 4 }), TODAY), "strong");
  // Due today is still known; only a date that has passed makes it due.
  assert.equal(itemState(row("a", { streak: 3, nextDueDate: TODAY }), TODAY), "known");
  assert.equal(itemState(row("a", { streak: 3, nextDueDate: "2026-10-22" }), TODAY), "due");
});

test("a skill's state follows its accuracy and how many of its items are known", () => {
  const base = { itemsTotal: 10, seen: 5, known: 0, strong: 0, due: 0, missed: 0, answered: 10, accuracy: 0.9 };
  assert.equal(skillState({ ...base, seen: 0 }), "not_started");
  assert.equal(skillState({ ...base, accuracy: 0.5 }), "weak");
  // Two answers are too few to call a skill weak.
  assert.equal(skillState({ ...base, accuracy: 0.5, answered: 2 }), "learning");
  assert.equal(skillState({ ...base, accuracy: 0.6 }), "shaky");
  assert.equal(skillState({ ...base, accuracy: 0.74 }), "shaky");
  // More than a third of the items seen were missed last time or are due.
  assert.equal(skillState({ ...base, missed: 1, due: 1 }), "shaky");
  assert.equal(skillState({ ...base, seen: 6, missed: 1, due: 1 }), "learning");
  assert.equal(skillState({ ...base, seen: 7, known: 6 }), "learning");
  assert.equal(skillState({ ...base, seen: 7, known: 3, strong: 4 }), "known");
  // Strong needs a passed exam as well as strong items.
  assert.equal(skillState({ ...base, seen: 8, strong: 8 }), "known");
  assert.equal(skillState({ ...base, seen: 8, strong: 8, examPassed: true }), "strong");
});

const catalog = {
  shared: [
    { id: "food_cooking.ordering", label: "Ordering", kind: "function", level: "a1", units: ["food_cooking"] },
    { id: "food_cooking.what-you-eat", label: "What you eat", kind: "function", level: "a1", units: ["food_cooking"] },
    { id: "food_cooking.at-a-restaurant", label: "At a restaurant", kind: "function", level: "a2", units: ["food_cooking"] }
  ],
  byLanguage: {}
};
const items = [
  ...[1, 2, 3, 4].map((n) => ({ id: `es-fo-${n}`, category: "food_cooking", level: "a1", skills: ["food_cooking.ordering"] })),
  ...[5, 6, 7].map((n) => ({ id: `es-fo-${n}`, category: "food_cooking", level: "a1", skills: ["food_cooking.what-you-eat"] })),
  ...[8, 9].map((n) => ({ id: `es-fo-a2-${n}`, category: "food_cooking", level: "a2", skills: ["food_cooking.at-a-restaurant"] }))
];
const index = createSkillIndex({ spanish: { food_cooking: items } }, catalog, {});

function map(overrides: Record<string, unknown> = {}) {
  return buildKnowledgeMap({
    language: "spanish",
    levelOrder: ["a1", "a2"],
    levelNames: { a1: "Beginner", a2: "Elementary" },
    levelCap: "",
    unitsByLevel: {
      a1: [{ category: "food_cooking", label: "Food & Cooking" }],
      a2: [{ category: "food_cooking", label: "Food & Cooking" }]
    },
    items,
    skills: index,
    progressRows: [],
    attempts: [],
    today: TODAY,
    ...overrides
  });
}

test("the map lists each unit's skills with their state, abilities and the weakest ones", () => {
  const knowledge = map({
    progressRows: [
      ...[1, 2, 3].map((n) => row(`es-fo-${n}`, { streak: 3, attempts: 3, correct: 3, lastSeenDate: `2026-10-1${n}` })),
      row("es-fo-5", { errorCount: 2, attempts: 2 })
    ],
    attempts: [
      { itemId: "es-fo-5", questionType: "mc_sentence", correct: false },
      { itemId: "es-fo-5", questionType: "build_sentence", correct: false },
      { itemId: "es-fo-5", questionType: "flashcard", correct: true },
      { itemId: "es-fo-5", questionType: "dictation_sentence", correct: false },
      { itemId: "es-fo-1", questionType: "mc_sentence", correct: true },
      { itemId: "es-fo-2", questionType: "dictation_sentence", correct: true },
      { itemId: "es-fo-3", questionType: "build_sentence", correct: true }
    ]
  });
  const unit = knowledge.levels[0].units[0];
  assert.deepEqual(unit.skills.map((skill: any) => [skill.id, skill.state]), [
    ["food_cooking.ordering", "known"],
    ["food_cooking.what-you-eat", "weak"]
  ]);
  const ordering = unit.skills[0];
  assert.equal(ordering.itemsSeen, 3);
  assert.equal(ordering.itemsTotal, 4);
  assert.equal(ordering.accuracy, 1);
  assert.equal(ordering.lastPracticedAt, "2026-10-13");
  // The flashcard is left out: three wrong answers out of three.
  assert.equal(unit.skills[1].accuracy, 0);
  assert.deepEqual(unit.abilities.reading, { accuracy: 0.5, attempts: 2 });
  assert.deepEqual(unit.abilities.listening, { accuracy: 0.5, attempts: 2 });
  assert.deepEqual(unit.abilities.speaking, { accuracy: null, attempts: 0 });
  assert.equal(knowledge.levels[0].skillsKnown, 1);
  assert.equal(knowledge.levels[0].skillsTotal, 2);
  assert.deepEqual(knowledge.weakest.map((ref: any) => ref.id), ["food_cooking.what-you-eat"]);
  assert.deepEqual(knowledge.strongest.map((ref: any) => ref.id), ["food_cooking.ordering"]);
  assert.deepEqual(knowledge.levels[1].units[0].skills.map((skill: any) => skill.state), ["not_started"]);
});

test("levels above the cap are listed without their skills", () => {
  const knowledge = map({ levelCap: "a1" });
  assert.deepEqual(knowledge.levels.map((level: any) => level.premium), [false, true]);
  const premiumUnit = knowledge.levels[1].units[0];
  assert.deepEqual(premiumUnit.skills, []);
  assert.equal(premiumUnit.abilities, null);
  assert.equal(premiumUnit.skillCount, 1);
  assert.equal(knowledge.levels[1].skillsTotal, 1);
});

test("due skills are listed for review", () => {
  const knowledge = map({
    progressRows: [
      row("es-fo-1", { streak: 3, attempts: 3, correct: 3, nextDueDate: "2026-10-01" }),
      row("es-fo-2", { streak: 3, attempts: 3, correct: 3, nextDueDate: "2026-10-02" })
    ]
  });
  assert.deepEqual(knowledge.dueForReview.map((ref: any) => ref.id), ["food_cooking.ordering"]);
  assert.equal(knowledge.levels[0].units[0].skills[0].dueCount, 2);
  assert.equal(knowledge.levels[0].units[0].skills[0].state, "shaky");
});

// --- API ---

const APP = { "X-LingoFlow-Client": "android" };

async function startServer() {
  const app = await createApp();
  const server = app.listen(0);
  const { port } = server.address() as { port: number };
  return { base: `http://127.0.0.1:${port}`, close: () => server.close() };
}

async function signUp(base: string, label: string) {
  const email = `${label}-${Date.now()}@example.com`;
  const registered = await (await fetch(`${base}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "Password123!", displayName: label })
  })).json() as any;
  await fetch(`${base}/api/auth/verify-email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: registered.verificationToken })
  });
  const logged = await (await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "Password123!" })
  })).json() as any;
  return { Authorization: `Bearer ${logged.token}`, "Content-Type": "application/json", ...APP };
}

async function call(base: string, method: string, path: string, headers: Record<string, string>, body?: unknown) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { status: res.status, body: await res.json() as any };
}

function wrongAttempt(question: any) {
  if (question.type === "flashcard") return { questionId: question.id, selectedOption: "review" };
  if (question.type === "build_sentence" || question.type === "dictation_sentence") {
    return { questionId: question.id, builtSentence: "__wrong__" };
  }
  return { questionId: question.id, selectedOption: "__wrong__", textAnswer: "__wrong__" };
}

test("GET /api/knowledge maps a free learner's A1 and practicing a skill shows up in it", async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());
  const headers = await signUp(srv.base, "knowledge");

  const missing = await call(srv.base, "GET", "/api/knowledge?language=klingon", headers);
  assert.equal(missing.status, 400);

  const before = await call(srv.base, "GET", "/api/knowledge?language=spanish", headers);
  assert.equal(before.status, 200);
  assert.deepEqual(before.body.levels.map((level: any) => level.premium), [false, true, true, true]);
  const a1 = before.body.levels[0];
  assert.ok(a1.units.length >= 4);
  assert.ok(a1.units.every((unit: any) => unit.skills.length && unit.skills.every((skill: any) => skill.state === "not_started")));
  assert.deepEqual(before.body.levels[1].units[0].skills, []);

  const unit = a1.units.find((entry: any) => entry.category === "food_cooking");
  const skill = unit.skills[0];
  const session = await call(srv.base, "POST", "/api/session/start", headers, {
    language: "spanish",
    category: "food_cooking",
    skill: skill.id
  });
  assert.equal(session.status, 200);
  assert.equal(session.body.questions.length, Math.min(10, skill.itemsTotal));
  assert.ok(session.body.questions.every((question: any) => question.skills.includes(skill.id)));

  const done = await call(srv.base, "POST", "/api/session/complete", headers, {
    sessionId: session.body.sessionId,
    language: "spanish",
    category: "food_cooking",
    attempts: session.body.questions.map(wrongAttempt),
    hintsUsed: 0,
    revealedAnswers: 0
  });
  assert.equal(done.status, 200);

  const after = await call(srv.base, "GET", "/api/knowledge?language=spanish", headers);
  const practiced = after.body.levels[0].units
    .find((entry: any) => entry.category === "food_cooking").skills
    .find((entry: any) => entry.id === skill.id);
  assert.equal(practiced.state, "weak");
  assert.equal(practiced.itemsSeen, session.body.questions.length);
  assert.equal(after.body.weakest[0].id, skill.id);

  const stats = await call(srv.base, "GET", "/api/stats?language=spanish", headers);
  assert.equal(stats.body.weakSkills[0].id, skill.id);
  assert.ok(Array.isArray(stats.body.objectiveStats));
});

test("a skill session checks the skill and the learner's level cap", async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());
  const headers = await signUp(srv.base, "knowledge-skill");

  const unknown = await call(srv.base, "POST", "/api/session/start", headers, {
    language: "spanish",
    category: "food_cooking",
    skill: "food_cooking.no-such-skill"
  });
  assert.equal(unknown.status, 400);

  const b1Skill = SKILLS.getUnitSkills("spanish", "food_cooking", "b1")[0];
  const locked = await call(srv.base, "POST", "/api/session/start", headers, {
    language: "spanish",
    category: "food_cooking",
    skill: b1Skill.id
  });
  assert.equal(locked.status, 402);

  // The web client has no cap.
  const { "X-LingoFlow-Client": _client, ...webHeaders } = headers;
  const web = await call(srv.base, "POST", "/api/session/start", webHeaders, {
    language: "spanish",
    category: "food_cooking",
    skill: b1Skill.id
  });
  assert.equal(web.status, 200);
  assert.equal(web.body.recommendedLevel, "b1");
  const map = await call(srv.base, "GET", "/api/knowledge?language=spanish", webHeaders);
  assert.ok(map.body.levels.every((level: any) => !level.premium));
});
