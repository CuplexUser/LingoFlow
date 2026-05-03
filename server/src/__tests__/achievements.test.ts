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
process.env.NODE_ENV = "test";

const { createApp } = require("../index.ts");
const database = require("../db.ts");

function createTestUser(prefix: string): number {
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

// ─── checkAndGrantAchievements unit tests ────────────────────────────────────

test("checkAndGrantAchievements grants streak milestones at correct thresholds", () => {
  const userId = createTestUser("streak-milestones");

  const base = {
    totalXp: 0, language: "spanish", category: "essentials",
    mastery: 0, hintsUsed: 0, revealedAnswers: 0, score: 5, maxScore: 10
  };

  // Streak of 2 — no milestone yet
  const below = database.checkAndGrantAchievements(userId, { ...base, streak: 2 });
  assert.deepEqual(below, [], "streak of 2 should not unlock any milestone");

  // Streak of 3 — unlocks streak_3
  const at3 = database.checkAndGrantAchievements(userId, { ...base, streak: 3 });
  assert.equal(at3.length, 1);
  assert.equal(at3[0].id, "streak_3");
  assert.ok(at3[0].name, "achievement should have a name");
  assert.ok(at3[0].earnedAt, "achievement should have an earnedAt timestamp");

  // Already earned streak_3 — not re-granted
  const again = database.checkAndGrantAchievements(userId, { ...base, streak: 3 });
  assert.deepEqual(again, [], "already-earned achievement must not be returned again");

  // Streak of 7 — unlocks streak_7 only (streak_3 already earned)
  const at7 = database.checkAndGrantAchievements(userId, { ...base, streak: 7 });
  const ids7 = at7.map((a: any) => a.id);
  assert.ok(ids7.includes("streak_7"), "streak_7 should be unlocked");
  assert.ok(!ids7.includes("streak_3"), "streak_3 must not appear again");
});

test("checkAndGrantAchievements grants XP milestones", () => {
  const userId = createTestUser("xp-milestones");

  const base = {
    streak: 0, language: "spanish", category: "essentials",
    mastery: 0, hintsUsed: 0, revealedAnswers: 0, score: 5, maxScore: 10
  };

  const below = database.checkAndGrantAchievements(userId, { ...base, totalXp: 50 });
  assert.deepEqual(below, []);

  const at100 = database.checkAndGrantAchievements(userId, { ...base, totalXp: 100 });
  assert.equal(at100.length, 1);
  assert.equal(at100[0].id, "xp_100");

  const at500 = database.checkAndGrantAchievements(userId, { ...base, totalXp: 500 });
  const ids500 = at500.map((a: any) => a.id);
  assert.ok(ids500.includes("xp_500"), "xp_500 should be newly granted");
  assert.ok(!ids500.includes("xp_100"), "xp_100 must not appear again");

  const at5000 = database.checkAndGrantAchievements(userId, { ...base, totalXp: 5000 });
  const ids5000 = at5000.map((a: any) => a.id);
  assert.ok(ids5000.includes("xp_1000"));
  assert.ok(ids5000.includes("xp_5000"));
  assert.ok(!ids5000.includes("xp_100"));
  assert.ok(!ids5000.includes("xp_500"));
});

test("checkAndGrantAchievements grants category mastery achievement at 80%", () => {
  const userId = createTestUser("mastery-80");

  const base = {
    streak: 0, totalXp: 0, language: "spanish", category: "essentials",
    hintsUsed: 0, revealedAnswers: 0, score: 5, maxScore: 10
  };

  const below = database.checkAndGrantAchievements(userId, { ...base, mastery: 79 });
  assert.deepEqual(below.filter((a: any) => a.id.startsWith("mastery_")), []);

  const at80 = database.checkAndGrantAchievements(userId, { ...base, mastery: 80 });
  const masteryAchievement = at80.find((a: any) => a.id === "mastery_spanish_essentials");
  assert.ok(masteryAchievement, "mastery_spanish_essentials should be unlocked");
  assert.ok(masteryAchievement.name, "achievement must have a name");
  assert.ok(masteryAchievement.description.toLowerCase().includes("essentials"), "description should mention the category");

  // Not re-granted
  const again = database.checkAndGrantAchievements(userId, { ...base, mastery: 95 });
  assert.deepEqual(again.filter((a: any) => a.id === "mastery_spanish_essentials"), []);
});

test("checkAndGrantAchievements does not grant mastery achievement for practice sessions", () => {
  const userId = createTestUser("mastery-practice");

  const unlocked = database.checkAndGrantAchievements(userId, {
    streak: 0, totalXp: 0, language: "spanish", category: "essentials",
    mastery: 90, hintsUsed: 0, revealedAnswers: 0, score: 5, maxScore: 10,
    isPracticeSession: true
  });

  assert.deepEqual(
    unlocked.filter((a: any) => a.id.startsWith("mastery_")),
    [],
    "mastery achievement must not be granted for practice sessions"
  );
});

test("checkAndGrantAchievements grants speed_demon for a perfect no-hint session with 10+ questions", () => {
  const userId = createTestUser("speed-demon");

  const base = {
    streak: 0, totalXp: 0, language: "spanish", category: "essentials",
    mastery: 0, hintsUsed: 0, revealedAnswers: 0
  };

  // 9 correct — below threshold
  const below = database.checkAndGrantAchievements(userId, { ...base, score: 9, maxScore: 9 });
  assert.deepEqual(below.filter((a: any) => a.id === "speed_demon"), []);

  // 10 correct, perfect, no hints — unlocks
  const unlocked = database.checkAndGrantAchievements(userId, { ...base, score: 10, maxScore: 10 });
  assert.ok(unlocked.find((a: any) => a.id === "speed_demon"), "speed_demon should be granted");

  // With hints — does not grant (already earned here anyway, so create a fresh user)
  const userId2 = createTestUser("speed-demon-hints");
  const withHints = database.checkAndGrantAchievements(userId2, {
    ...base, score: 10, maxScore: 10, hintsUsed: 1
  });
  assert.deepEqual(withHints.filter((a: any) => a.id === "speed_demon"), []);

  // With wrong answers — does not grant
  const userId3 = createTestUser("speed-demon-wrong");
  const imperfect = database.checkAndGrantAchievements(userId3, {
    ...base, score: 9, maxScore: 10, hintsUsed: 0
  });
  assert.deepEqual(imperfect.filter((a: any) => a.id === "speed_demon"), []);
});

test("checkAndGrantAchievements grants polyglot when 2+ languages have XP", () => {
  const userId = createTestUser("polyglot");
  const today = database.toIsoDate();

  const sessionArgs = (language: string) => ({
    userId, language, category: "essentials",
    score: 5, maxScore: 10, mistakes: 5,
    xpGained: 20, difficultyLevel: "a1", today
  });

  // Only spanish practiced — no polyglot yet
  database.recordSession(sessionArgs("spanish"));
  const oneLanguage = database.checkAndGrantAchievements(userId, {
    streak: 1, totalXp: 20, language: "spanish", category: "essentials",
    mastery: 0, hintsUsed: 0, revealedAnswers: 0, score: 5, maxScore: 10
  });
  assert.deepEqual(oneLanguage.filter((a: any) => a.id === "polyglot"), [], "single language should not grant polyglot");

  // Now add a second language
  database.recordSession(sessionArgs("italian"));
  const twoLanguages = database.checkAndGrantAchievements(userId, {
    streak: 1, totalXp: 40, language: "italian", category: "essentials",
    mastery: 0, hintsUsed: 0, revealedAnswers: 0, score: 5, maxScore: 10
  });
  assert.ok(twoLanguages.find((a: any) => a.id === "polyglot"), "polyglot should be granted after 2 languages have XP");
});

test("getUserAchievements returns all earned achievements with correct shape", () => {
  const userId = createTestUser("get-achievements");

  // Nothing yet
  assert.deepEqual(database.getUserAchievements(userId), []);

  database.checkAndGrantAchievements(userId, {
    streak: 7, totalXp: 500, language: "spanish", category: "essentials",
    mastery: 0, hintsUsed: 0, revealedAnswers: 0, score: 5, maxScore: 10
  });

  const achievements = database.getUserAchievements(userId);
  assert.ok(achievements.length >= 2, "should have at least streak_3, streak_7, xp_100, xp_500");
  for (const a of achievements) {
    assert.ok(a.id, "achievement must have id");
    assert.ok(a.name, "achievement must have name");
    assert.ok(a.description, "achievement must have description");
    assert.ok(a.icon, "achievement must have icon");
    assert.ok(a.earnedAt, "achievement must have earnedAt");
    assert.equal(typeof a.earnedAt, "string");
  }
  // Most recently earned comes first
  const ids = achievements.map((a: any) => a.id);
  assert.ok(ids.includes("streak_7"));
  assert.ok(ids.includes("xp_100"));
});

// ─── API integration tests ────────────────────────────────────────────────────

async function createAuthSession(base: string, label: string): Promise<{ headers: Record<string, string>; userId: number }> {
  const email = `${label}-${Date.now()}@example.com`;
  const registerRes = await fetch(`${base}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "Password123!", displayName: label })
  });
  assert.equal(registerRes.status, 201);
  const registered: any = await registerRes.json();

  await fetch(`${base}/api/auth/verify-email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: registered.verificationToken })
  });

  const loginRes = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "Password123!" })
  });
  assert.equal(loginRes.status, 200);
  const logged: any = await loginRes.json();
  const headers = { Authorization: `Bearer ${logged.token}`, "Content-Type": "application/json" };

  const meRes = await fetch(`${base}/api/auth/me`, { headers });
  const me: any = await meRes.json();
  return { headers, userId: me.user.id };
}

function makeAttempt(question: any) {
  if (question.type === "mc_sentence" || question.type === "dialogue_turn" || question.type === "roleplay") {
    return { questionId: question.id, selectedOption: question.answer };
  }
  if (question.type === "flashcard") return { questionId: question.id, selectedOption: "known" };
  if (question.type === "cloze_sentence") return { questionId: question.id, selectedOption: question.clozeAnswer };
  if (question.type === "matching") return { questionId: question.id, matchingPairs: question.pairs };
  if (question.type === "pronunciation") return { questionId: question.id, textAnswer: question.answer };
  return { questionId: question.id, builtSentence: question.answer };
}

test("session complete response includes unlockedAchievements array", async (t) => {
  const app = createApp();
  const server = app.listen(0);
  t.after(() => server.close());
  const { port } = (server.address() as any);
  const base = `http://127.0.0.1:${port}`;
  const { headers: authHeaders } = await createAuthSession(base, "ach-complete");

  const startRes = await fetch(`${base}/api/session/start`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ language: "spanish", category: "essentials", count: 6 })
  });
  assert.equal(startRes.status, 200);
  const session: any = await startRes.json();

  const completeRes = await fetch(`${base}/api/session/complete`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      sessionId: session.sessionId,
      language: "spanish",
      category: "essentials",
      attempts: session.questions.map(makeAttempt),
      hintsUsed: 0,
      revealedAnswers: 0
    })
  });
  assert.equal(completeRes.status, 200);
  const result: any = await completeRes.json();

  assert.ok(result.ok);
  assert.ok(Array.isArray(result.unlockedAchievements), "unlockedAchievements must be an array");

  // Verify the shape of any achievements that were returned
  for (const a of result.unlockedAchievements) {
    assert.ok(typeof a.id === "string");
    assert.ok(typeof a.name === "string");
    assert.ok(typeof a.description === "string");
    assert.ok(typeof a.icon === "string");
    assert.ok(typeof a.earnedAt === "string");
  }
});

test("GET /api/user/achievements returns earned achievements", async (t) => {
  const app = createApp();
  const server = app.listen(0);
  t.after(() => server.close());
  const { port } = (server.address() as any);
  const base = `http://127.0.0.1:${port}`;
  const { headers: authHeaders, userId } = await createAuthSession(base, "ach-list");

  // No achievements yet
  const emptyRes = await fetch(`${base}/api/user/achievements`, { headers: authHeaders });
  assert.equal(emptyRes.status, 200);
  const empty: any = await emptyRes.json();
  assert.ok(Array.isArray(empty));
  assert.equal(empty.length, 0);

  // Seed achievements directly via the DB layer (a single API session earns ~28 XP,
  // not enough to cross any milestone threshold on its own)
  database.checkAndGrantAchievements(userId, {
    streak: 7, totalXp: 500, language: "spanish", category: "essentials",
    mastery: 0, hintsUsed: 0, revealedAnswers: 0, score: 5, maxScore: 10
  });

  // GET endpoint should now expose them
  const listRes = await fetch(`${base}/api/user/achievements`, { headers: authHeaders });
  assert.equal(listRes.status, 200);
  const list: any = await listRes.json();
  assert.ok(Array.isArray(list));
  assert.ok(list.length >= 2, "should have at least streak_3, streak_7, xp_100, xp_500");

  for (const a of list) {
    assert.ok(typeof a.id === "string");
    assert.ok(typeof a.name === "string");
    assert.ok(typeof a.description === "string");
    assert.ok(typeof a.icon === "string");
    assert.ok(typeof a.earnedAt === "string");
  }

  // Results ordered most-recent first
  const dates = list.map((a: any) => a.earnedAt);
  for (let i = 1; i < dates.length; i++) {
    assert.ok(dates[i - 1] >= dates[i], "achievements should be sorted descending by earnedAt");
  }
});

test("GET /api/user/achievements requires authentication", async (t) => {
  const app = createApp();
  const server = app.listen(0);
  t.after(() => server.close());
  const base = `http://127.0.0.1:${(server.address() as any).port}`;

  const res = await fetch(`${base}/api/user/achievements`);
  assert.equal(res.status, 401);
});
