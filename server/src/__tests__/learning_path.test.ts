import type { } from "node"; // ensure file is treated as a module

const test = require("node:test");
const assert = require("node:assert/strict");
const { configureTestDb, initTestDb } = require("./helpers/testDb.ts");
configureTestDb(__filename);

test.before(async () => {
  await initTestDb();
});

const { createApp } = require("../index.ts");
const database = require("../db.ts");

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
  return {
    userId: Number(logged.user.id),
    headers: { Authorization: `Bearer ${logged.token}`, "Content-Type": "application/json" }
  };
}

async function call(base: string, method: string, path: string, headers: Record<string, string>, body?: unknown) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { status: res.status, body: await res.json() as any };
}

function rightAttempt(question: any) {
  if (question.type === "flashcard") return { questionId: question.id, selectedOption: "known" };
  if (question.type === "cloze_sentence") return { questionId: question.id, selectedOption: question.clozeAnswer };
  if (question.type === "matching") return { questionId: question.id, matchingPairs: question.pairs };
  if (question.type === "pronunciation" || question.type === "practice_speak") {
    return { questionId: question.id, textAnswer: question.answer };
  }
  if (["mc_sentence", "dialogue_turn", "roleplay", "practice_listen"].includes(question.type)) {
    return { questionId: question.id, selectedOption: question.answer };
  }
  return { questionId: question.id, builtSentence: question.answer };
}

function wrongAttempt(question: any) {
  if (question.type === "flashcard") return { questionId: question.id, selectedOption: "review" };
  if (question.type === "build_sentence" || question.type === "dictation_sentence") {
    return { questionId: question.id, builtSentence: "__wrong__" };
  }
  return { questionId: question.id, selectedOption: "__wrong__", textAnswer: "__wrong__" };
}

async function finish(base: string, headers: Record<string, string>, session: any, attempts: any[]) {
  return call(base, "POST", "/api/session/complete", headers, {
    sessionId: session.sessionId,
    language: session.language,
    category: session.category,
    attempts,
    hintsUsed: 0,
    revealedAnswers: 0
  });
}

test("a new learner starts at A1 with higher levels behind Premium in the app", async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());
  const user = await signUp(srv.base, "path-new");

  const app = await call(srv.base, "GET", "/api/path?language=spanish", { ...user.headers, ...APP });
  assert.equal(app.status, 200);
  assert.equal(app.body.needsPlacement, true);
  assert.equal(app.body.currentLevel, "a1");
  assert.deepEqual(app.body.levels.map((level: any) => level.state), ["current", "premium", "premium", "premium"]);
  const a1 = app.body.levels[0];
  assert.ok(a1.unitCount >= 4);
  assert.equal(a1.units[0].state, "current");
  assert.equal(a1.units[1].state, "locked");
  assert.equal(app.body.current.category, a1.units[0].category);
  assert.equal(app.body.jumpAhead.fromUnit, 1);
  assert.equal(app.body.jumpAhead.toUnit, 4);
  assert.equal(app.body.levelTest.categories.length, a1.unitCount);

  const web = await call(srv.base, "GET", "/api/path?language=spanish", user.headers);
  assert.deepEqual(web.body.levels.map((level: any) => level.state), ["current", "locked", "locked", "locked"]);

  const unknown = await call(srv.base, "GET", "/api/path?language=klingon", user.headers);
  assert.equal(unknown.status, 400);
});

test("lessons are pinned to their level and the unit's lesson count finishes it", async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());
  const user = await signUp(srv.base, "path-lessons");
  const headers = { ...user.headers, ...APP };
  const path = (await call(srv.base, "GET", "/api/path?language=spanish", headers)).body;
  const [first, second] = path.levels[0].units;

  const locked = await call(srv.base, "POST", "/api/path/lesson", headers, {
    language: "spanish",
    level: "a1",
    category: second.category
  });
  assert.equal(locked.status, 409);
  assert.equal(locked.body.code, "unit_locked");

  const premium = await call(srv.base, "POST", "/api/path/lesson", headers, {
    language: "spanish",
    level: "b1",
    category: path.levels[2].units[0].category
  });
  assert.equal(premium.status, 402);

  assert.ok(first.lessonCount >= 2 && first.lessonCount <= 4);
  for (let lesson = 1; lesson <= first.lessonCount; lesson += 1) {
    const started = await call(srv.base, "POST", "/api/path/lesson", headers, {
      language: "spanish",
      level: "a1",
      category: first.category
    });
    assert.equal(started.status, 200);
    assert.equal(started.body.recommendedLevel, "a1");
    assert.equal(started.body.pathLesson.lessonNumber, lesson);
    assert.equal(started.body.pathLesson.lessonCount, first.lessonCount);
    const done = await finish(srv.base, headers, started.body, started.body.questions.map(rightAttempt));
    assert.equal(done.status, 200);
    assert.equal(done.body.path.kind, "lesson");
    assert.equal(done.body.path.lessonsDone, lesson);
    assert.equal(done.body.path.lessonCount, first.lessonCount);
    assert.equal(done.body.path.unitDone, lesson === first.lessonCount);
  }

  const after = (await call(srv.base, "GET", "/api/path?language=spanish", headers)).body;
  assert.equal(after.levels[0].units[0].state, "done");
  assert.equal(after.levels[0].units[1].state, "current");
  assert.equal(after.current.category, second.category);
});

test("passing a checkpoint tests out of the section, failing it changes nothing", async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());
  const user = await signUp(srv.base, "path-checkpoint");
  const headers = { ...user.headers, ...APP };
  const before = (await call(srv.base, "GET", "/api/path?language=spanish", headers)).body;

  const failed = await call(srv.base, "POST", "/api/path/checkpoint", headers, { language: "spanish", scope: "section" });
  assert.equal(failed.status, 200);
  assert.equal(failed.body.category, "__checkpoint__");
  assert.deepEqual(failed.body.pathCheckpoint.categories, before.jumpAhead.categories);
  for (const question of failed.body.questions) {
    assert.ok(["mc_sentence", "cloze_sentence", "dialogue_turn", "build_sentence"].includes(question.type));
  }
  const failedResult = await finish(srv.base, headers, failed.body, failed.body.questions.map(wrongAttempt));
  assert.equal(failedResult.status, 200);
  assert.equal(failedResult.body.path.passed, false);
  assert.equal((await call(srv.base, "GET", "/api/path?language=spanish", headers)).body.current.unitNumber, 1);

  const passed = await call(srv.base, "POST", "/api/path/checkpoint", headers, { language: "spanish", scope: "section" });
  const passedResult = await finish(srv.base, headers, passed.body, passed.body.questions.map(rightAttempt));
  assert.equal(passedResult.body.path.passed, true);
  assert.equal(passedResult.body.path.correct, passed.body.questions.length);

  const after = (await call(srv.base, "GET", "/api/path?language=spanish", headers)).body;
  assert.equal(after.current.unitNumber, 5);
  for (const unit of after.levels[0].units.slice(0, 4)) {
    assert.equal(unit.state, "done");
    assert.equal(unit.testedOut, true);
  }
});

test("a unit has fewer lessons when it has less content, so they don't repeat", async () => {
  const { createLearningPath } = require("../routes/pathRoutes.ts");
  const { lessonsForUnit } = createLearningPath({ database: {}, CATEGORIES: [], LEVEL_ORDER: [] });
  assert.equal(lessonsForUnit(8), 2);
  assert.equal(lessonsForUnit(12), 2);
  assert.equal(lessonsForUnit(13), 3);
  assert.equal(lessonsForUnit(20), 3);
  assert.equal(lessonsForUnit(21), 4);
});

test("the unit check tests out of the current unit only", async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());
  const user = await signUp(srv.base, "path-unit-check");
  const headers = { ...user.headers, ...APP };
  const before = (await call(srv.base, "GET", "/api/path?language=spanish", headers)).body;
  assert.equal(before.unitCheck.scope, "unit");
  assert.deepEqual(before.unitCheck.categories, [before.current.category]);
  assert.equal(before.unitCheck.fromUnit, 1);
  assert.equal(before.unitCheck.toUnit, 1);

  const check = await call(srv.base, "POST", "/api/path/checkpoint", headers, { language: "spanish", scope: "unit" });
  assert.equal(check.status, 200);
  assert.ok(check.body.questions.length <= 10);
  for (const question of check.body.questions) {
    assert.equal(question.sourceCategory, before.current.category);
  }
  const result = await finish(srv.base, headers, check.body, check.body.questions.map(rightAttempt));
  assert.equal(result.body.path.passed, true);
  assert.equal(result.body.path.scope, "unit");

  const after = (await call(srv.base, "GET", "/api/path?language=spanish", headers)).body;
  assert.equal(after.current.unitNumber, 2);
  assert.equal(after.levels[0].units[0].testedOut, true);
  assert.equal(after.levels[0].units[1].state, "current");
});

test("the placement check sets where the path starts", async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());
  const user = await signUp(srv.base, "path-placement");
  const headers = { ...user.headers, ...APP };

  const started = await call(srv.base, "POST", "/api/placement/start", headers, { language: "spanish" });
  assert.equal(started.status, 200);
  const levels = new Set(started.body.questions.map((question: any) => question.level));
  assert.deepEqual([...levels], ["a1", "a2", "b1", "b2"]);

  // Right through B1, wrong at B2.
  const answers = started.body.questions.map((question: any) => ({
    questionId: question.id,
    selectedOption: question.level === "b2"
      ? "__wrong__"
      : question.type === "cloze_sentence" ? question.clozeAnswer : question.answer
  }));
  const placed = await call(srv.base, "POST", "/api/placement/complete", headers, {
    language: "spanish",
    sessionId: started.body.sessionId,
    answers
  });
  assert.equal(placed.status, 200);
  assert.equal(placed.body.level, "b1");
  assert.equal(placed.body.premiumRequired, true);
  assert.equal(placed.body.reviewCount, 0);

  const again = await call(srv.base, "POST", "/api/placement/complete", headers, {
    language: "spanish",
    sessionId: started.body.sessionId,
    answers
  });
  assert.equal(again.status, 409);

  // A free learner placed at B1 works through A1 until they subscribe.
  const free = (await call(srv.base, "GET", "/api/path?language=spanish", headers)).body;
  assert.equal(free.needsPlacement, false);
  assert.equal(free.startLevel, "b1");
  assert.equal(free.currentLevel, "a1");

  await database.upsertSubscription({ userId: user.userId, entitlement: "premium", expiresAt: null });
  const premium = (await call(srv.base, "GET", "/api/path?language=spanish", headers)).body;
  assert.deepEqual(premium.levels.map((level: any) => level.state), ["placed_out", "placed_out", "current", "locked"]);
  assert.equal(premium.levels[0].units[0].state, "skipped");
  assert.equal((await database.getSettings(user.userId)).selfRatedLevel, "b1");
});

test("missing easy placement questions puts the learner at A1 with those words to review", async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());
  const user = await signUp(srv.base, "path-placement-a1");

  const started = await call(srv.base, "POST", "/api/placement/start", user.headers, { language: "spanish" });
  const a1 = started.body.questions.filter((question: any) => question.level === "a1");
  const placed = await call(srv.base, "POST", "/api/placement/complete", user.headers, {
    language: "spanish",
    sessionId: started.body.sessionId,
    answers: a1.map((question: any) => ({ questionId: question.id, skipped: true }))
  });
  assert.equal(placed.body.level, "a1");
  assert.equal(placed.body.reviewCount, a1.length);
  assert.equal(placed.body.premiumRequired, false);

  // A placement check never counts as a lesson.
  const next = await call(srv.base, "POST", "/api/placement/start", user.headers, { language: "spanish" });
  const asLesson = await call(srv.base, "POST", "/api/session/complete", user.headers, {
    sessionId: next.body.sessionId,
    language: "spanish",
    category: "__placement__",
    attempts: [{ questionId: next.body.questions[0].id, selectedOption: "x" }]
  });
  assert.equal(asLesson.status, 400);
});

test("choosing a start level skips the placement check", async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());
  const user = await signUp(srv.base, "path-start");

  const path = await call(srv.base, "POST", "/api/path/start", user.headers, { language: "spanish", level: "a2" });
  assert.equal(path.status, 200);
  assert.equal(path.body.needsPlacement, false);
  assert.equal(path.body.currentLevel, "a2");
  assert.equal(path.body.levels[0].state, "placed_out");
});

test("words marked \"I knew this\" stay out of later lessons, even review lessons", async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());
  const user = await signUp(srv.base, "path-known");
  const headers = { ...user.headers, ...APP };
  const path = (await call(srv.base, "GET", "/api/path?language=spanish", headers)).body;
  const category = path.levels[0].units[0].category;

  // Every item in the first lesson is marked known through the database, as if it had
  // been a flashcard answered "I knew this".
  const first = await call(srv.base, "POST", "/api/path/lesson", headers, { language: "spanish", level: "a1", category });
  assert.equal(first.status, 200);
  const known = new Set<string>(first.body.questions.map((question: any) => String(question.id)));
  for (const id of known) {
    await database.upsertItemProgressAttempt({
      userId: user.userId, language: "spanish", category, itemId: id, objective: "",
      correct: true, errorType: "none", today: database.toIsoDate(), flashcardKnown: true
    });
  }
  await finish(srv.base, headers, first.body, first.body.questions.map(rightAttempt));

  // The later lessons run short of unseen items and fall back to review. Their flashcards
  // are answered "Need review", so the unit keeps words that aren't marked known.
  const reviewFlashcards = (question: any) => (question.type === "flashcard" ? wrongAttempt(question) : rightAttempt(question));
  for (let lesson = 2; lesson <= 4; lesson += 1) {
    const started = await call(srv.base, "POST", "/api/path/lesson", headers, { language: "spanish", level: "a1", category });
    assert.equal(started.status, 200);
    const repeated = started.body.questions.filter((question: any) => known.has(String(question.id)));
    assert.deepEqual(repeated.map((question: any) => question.id), [], `lesson ${lesson} repeats known words`);
    await finish(srv.base, headers, started.body, started.body.questions.map(reviewFlashcards));
  }
});

test("the daily challenge leaves out words marked \"I knew this\"", async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());
  const user = await signUp(srv.base, "daily-known");
  const headers = { ...user.headers, ...APP };

  const before = await call(srv.base, "POST", "/api/session/daily", headers, { language: "spanish" });
  assert.equal(before.status, 200);
  const known = before.body.questions.slice(0, 3).map((question: any) => String(question.id));
  for (const id of known) {
    await database.upsertItemProgressAttempt({
      userId: user.userId, language: "spanish", category: before.body.category, itemId: id, objective: "",
      correct: true, errorType: "none", today: database.toIsoDate(), flashcardKnown: true
    });
  }

  const after = await call(srv.base, "POST", "/api/session/daily", headers, { language: "spanish" });
  assert.equal(after.status, 200);
  const ids = after.body.questions.map((question: any) => String(question.id));
  assert.deepEqual(ids.filter((id: string) => known.includes(id)), []);
});

test("a lesson carries its XP rules, and finishing it earns what they give", async (t) => {
  const { lessonXp } = require("../xpRules.ts");
  const srv = await startServer();
  t.after(() => srv.close());
  const user = await signUp(srv.base, "xp-rules");
  const headers = { ...user.headers, ...APP };
  const path = (await call(srv.base, "GET", "/api/path?language=spanish", headers)).body;

  const lesson = await call(srv.base, "POST", "/api/path/lesson", headers, {
    language: "spanish",
    level: "a1",
    category: path.levels[0].units[0].category
  });
  assert.equal(lesson.status, 200);
  assert.equal(lesson.body.xp.kind, "lesson");
  assert.equal(lesson.body.xp.levelMultiplier, 1);

  const questions = lesson.body.questions;
  const attempts = questions.map((question: any, index: number) => (index === 0 ? wrongAttempt(question) : rightAttempt(question)));
  const done = await finish(srv.base, headers, lesson.body, attempts);
  assert.equal(done.status, 200);
  const { score, maxScore, mistakes } = done.body.evaluated;
  const expected = lessonXp(lesson.body.xp, { score, maxScore, mistakes, hintsUsed: 0, revealedAnswers: 0 });
  assert.equal(done.body.xpGained, expected.xpGained);

  const daily = await call(srv.base, "POST", "/api/session/daily", headers, { language: "spanish" });
  assert.equal(daily.body.xp.kind, "lesson");
});
