import type { } from "node"; // ensure file is treated as a module

const test = require("node:test");
const assert = require("node:assert/strict");
const { configureTestDb } = require("./helpers/testDb.ts");
configureTestDb(__filename);

const { createApp } = require("../index.ts");
const database = require("../db.ts");

// ─── Types ────────────────────────────────────────────────────────────────────

interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  earnedAt: string;
}

interface AchievementCheckInput {
  streak?: number;
  totalXp?: number;
  language: string;
  category: string;
  mastery?: number;
  hintsUsed: number;
  revealedAnswers: number;
  score: number;
  maxScore: number;
  isPracticeSession?: boolean;
  now?: Date;
}

interface RecordSessionArgs {
  userId: number;
  language: string;
  category: string;
  score: number;
  maxScore: number;
  mistakes: number;
  xpGained: number;
  difficultyLevel: string;
  today: string;
}

// ─── Server helper ────────────────────────────────────────────────────────────

class TestServer {
  private readonly server: any;
  readonly base: string;

  constructor() {
    const app = createApp();
    this.server = app.listen(0);
    const { port } = this.server.address() as { port: number };
    this.base = `http://127.0.0.1:${port}`;
  }

  close(): void {
    this.server.close();
  }
}

// ─── Auth helper ──────────────────────────────────────────────────────────────

interface AuthSession {
  headers: Record<string, string>;
  userId: number;
}

async function createAuthSession(base: string, label: string): Promise<AuthSession> {
  const email = `${label}-${Date.now()}@example.com`;

  const registerRes = await fetch(`${base}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "Password123!", displayName: label })
  });
  assert.equal(registerRes.status, 201);
  const registered = await registerRes.json() as any;

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
  const logged = await loginRes.json() as any;
  const headers = { Authorization: `Bearer ${logged.token}`, "Content-Type": "application/json" };

  const meRes = await fetch(`${base}/api/auth/me`, { headers });
  const me = await meRes.json() as any;
  return { headers, userId: me.user.id as number };
}

function makeAttempt(question: any): Record<string, unknown> {
  if (question.type === "mc_sentence" || question.type === "dialogue_turn" || question.type === "roleplay") {
    return { questionId: question.id, selectedOption: question.answer };
  }
  if (question.type === "flashcard") return { questionId: question.id, selectedOption: "known" };
  if (question.type === "cloze_sentence") return { questionId: question.id, selectedOption: question.clozeAnswer };
  if (question.type === "matching") return { questionId: question.id, matchingPairs: question.pairs };
  if (question.type === "pronunciation") return { questionId: question.id, textAnswer: question.answer };
  return { questionId: question.id, builtSentence: question.answer };
}

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

// ─── checkAndGrantAchievements — streak milestones ────────────────────────────

test("checkAndGrantAchievements grants streak milestones at correct thresholds", () => {
  const userId = createTestUser("streak-milestones");
  const base: AchievementCheckInput = {
    totalXp: 0, language: "spanish", category: "essentials",
    mastery: 0, hintsUsed: 0, revealedAnswers: 0, score: 5, maxScore: 10,
    now: new Date("2026-01-01T12:00:00")
  };

  // Streak of 2 — no milestone yet
  const below = database.checkAndGrantAchievements(userId, { ...base, streak: 2 }) as Achievement[];
  assert.deepEqual(below, [], "streak of 2 should not unlock any milestone");

  // Streak of 3 — unlocks streak_3
  const at3 = database.checkAndGrantAchievements(userId, { ...base, streak: 3 }) as Achievement[];
  assert.equal(at3.length, 1);
  assert.equal(at3[0].id, "streak_3");
  assert.ok(at3[0].name, "achievement should have a name");
  assert.ok(at3[0].earnedAt, "achievement should have an earnedAt timestamp");

  // Already earned streak_3 — not re-granted
  const again = database.checkAndGrantAchievements(userId, { ...base, streak: 3 }) as Achievement[];
  assert.deepEqual(again, [], "already-earned achievement must not be returned again");

  // Streak of 7 — unlocks streak_7 only (streak_3 already earned)
  const at7 = database.checkAndGrantAchievements(userId, { ...base, streak: 7 }) as Achievement[];
  const ids7 = at7.map((a) => a.id);
  assert.ok(ids7.includes("streak_7"), "streak_7 should be unlocked");
  assert.ok(!ids7.includes("streak_3"), "streak_3 must not appear again");
});

// ─── checkAndGrantAchievements — XP milestones ───────────────────────────────

test("checkAndGrantAchievements grants XP milestones", () => {
  const userId = createTestUser("xp-milestones");
  const base: AchievementCheckInput = {
    streak: 0, language: "spanish", category: "essentials",
    mastery: 0, hintsUsed: 0, revealedAnswers: 0, score: 5, maxScore: 10,
    now: new Date("2026-01-01T12:00:00")
  };

  const below = database.checkAndGrantAchievements(userId, { ...base, totalXp: 50 }) as Achievement[];
  assert.deepEqual(below, []);

  const at100 = database.checkAndGrantAchievements(userId, { ...base, totalXp: 100 }) as Achievement[];
  assert.equal(at100.length, 1);
  assert.equal(at100[0].id, "xp_100");

  const at500 = database.checkAndGrantAchievements(userId, { ...base, totalXp: 500 }) as Achievement[];
  const ids500 = at500.map((a) => a.id);
  assert.ok(ids500.includes("xp_500"), "xp_500 should be newly granted");
  assert.ok(!ids500.includes("xp_100"), "xp_100 must not appear again");

  const at5000 = database.checkAndGrantAchievements(userId, { ...base, totalXp: 5000 }) as Achievement[];
  const ids5000 = at5000.map((a) => a.id);
  assert.ok(ids5000.includes("xp_1000"));
  assert.ok(ids5000.includes("xp_5000"));
  assert.ok(!ids5000.includes("xp_100"));
  assert.ok(!ids5000.includes("xp_500"));
});

// ─── checkAndGrantAchievements — category mastery ────────────────────────────

test("checkAndGrantAchievements grants category mastery achievement at 80%", () => {
  const userId = createTestUser("mastery-80");
  const base: AchievementCheckInput = {
    streak: 0, totalXp: 0, language: "spanish", category: "essentials",
    hintsUsed: 0, revealedAnswers: 0, score: 5, maxScore: 10
  };

  const below = database.checkAndGrantAchievements(userId, { ...base, mastery: 79 }) as Achievement[];
  assert.deepEqual(below.filter((a) => a.id.startsWith("mastery_")), []);

  const at80 = database.checkAndGrantAchievements(userId, { ...base, mastery: 80 }) as Achievement[];
  const masteryAchievement = at80.find((a) => a.id === "mastery_spanish_essentials");
  assert.ok(masteryAchievement, "mastery_spanish_essentials should be unlocked");
  assert.ok(masteryAchievement!.name, "achievement must have a name");
  assert.ok(masteryAchievement!.description.toLowerCase().includes("essentials"), "description should mention the category");

  // Not re-granted on subsequent sessions
  const again = database.checkAndGrantAchievements(userId, { ...base, mastery: 95 }) as Achievement[];
  assert.deepEqual(again.filter((a) => a.id === "mastery_spanish_essentials"), []);
});

test("checkAndGrantAchievements does not grant mastery achievement for practice sessions", () => {
  const userId = createTestUser("mastery-practice");
  const unlocked = database.checkAndGrantAchievements(userId, {
    streak: 0, totalXp: 0, language: "spanish", category: "essentials",
    mastery: 90, hintsUsed: 0, revealedAnswers: 0, score: 5, maxScore: 10,
    isPracticeSession: true
  } satisfies AchievementCheckInput) as Achievement[];

  assert.deepEqual(
    unlocked.filter((a) => a.id.startsWith("mastery_")),
    [],
    "mastery achievement must not be granted for practice sessions"
  );
});

// ─── checkAndGrantAchievements — speed demon ─────────────────────────────────

test("checkAndGrantAchievements grants speed_demon for a perfect no-hint session with 10+ questions", () => {
  const userId = createTestUser("speed-demon");
  const base: AchievementCheckInput = {
    streak: 0, totalXp: 0, language: "spanish", category: "essentials",
    mastery: 0, hintsUsed: 0, revealedAnswers: 0, score: 0, maxScore: 0
  };

  // 9 correct — below threshold
  const below = database.checkAndGrantAchievements(userId, { ...base, score: 9, maxScore: 9 }) as Achievement[];
  assert.deepEqual(below.filter((a) => a.id === "speed_demon"), []);

  // 10 correct, perfect, no hints — unlocks
  const unlocked = database.checkAndGrantAchievements(userId, { ...base, score: 10, maxScore: 10 }) as Achievement[];
  assert.ok(unlocked.find((a) => a.id === "speed_demon"), "speed_demon should be granted");

  // With hints — does not grant (use fresh user since first already earned it)
  const userId2 = createTestUser("speed-demon-hints");
  const withHints = database.checkAndGrantAchievements(userId2, { ...base, score: 10, maxScore: 10, hintsUsed: 1 }) as Achievement[];
  assert.deepEqual(withHints.filter((a) => a.id === "speed_demon"), []);

  // With wrong answers — does not grant
  const userId3 = createTestUser("speed-demon-wrong");
  const imperfect = database.checkAndGrantAchievements(userId3, { ...base, score: 9, maxScore: 10, hintsUsed: 0 }) as Achievement[];
  assert.deepEqual(imperfect.filter((a) => a.id === "speed_demon"), []);
});

// ─── checkAndGrantAchievements — polyglot ────────────────────────────────────

test("checkAndGrantAchievements grants polyglot when 2+ languages have XP", () => {
  const userId = createTestUser("polyglot");
  const today = database.toIsoDate() as string;

  const sessionArgs = (language: string): RecordSessionArgs => ({
    userId, language, category: "essentials",
    score: 5, maxScore: 10, mistakes: 5,
    xpGained: 20, difficultyLevel: "a1", today
  });
  const checkArgs = (language: string, totalXp: number): AchievementCheckInput => ({
    streak: 1, totalXp, language, category: "essentials",
    mastery: 0, hintsUsed: 0, revealedAnswers: 0, score: 5, maxScore: 10
  });

  // Only spanish practiced — no polyglot yet
  database.recordSession(sessionArgs("spanish"));
  const oneLanguage = database.checkAndGrantAchievements(userId, checkArgs("spanish", 20)) as Achievement[];
  assert.deepEqual(oneLanguage.filter((a) => a.id === "polyglot"), [], "single language should not grant polyglot");

  // Second language added — polyglot unlocks
  database.recordSession(sessionArgs("italian"));
  const twoLanguages = database.checkAndGrantAchievements(userId, checkArgs("italian", 40)) as Achievement[];
  assert.ok(twoLanguages.find((a) => a.id === "polyglot"), "polyglot should be granted after 2 languages have XP");
});

// ─── getUserAchievements ──────────────────────────────────────────────────────

test("getUserAchievements returns all earned achievements with correct shape", () => {
  const userId = createTestUser("get-achievements");

  // Nothing earned yet
  assert.deepEqual(database.getUserAchievements(userId), []);

  database.checkAndGrantAchievements(userId, {
    streak: 7, totalXp: 500, language: "spanish", category: "essentials",
    mastery: 0, hintsUsed: 0, revealedAnswers: 0, score: 5, maxScore: 10
  } satisfies AchievementCheckInput);

  const achievements = database.getUserAchievements(userId) as Achievement[];
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
  const ids = achievements.map((a) => a.id);
  assert.ok(ids.includes("streak_7"));
  assert.ok(ids.includes("xp_100"));
});

// ─── API integration — achievement shape via HTTP ─────────────────────────────

test("session complete response includes unlockedAchievements array", async (t) => {
  const srv = new TestServer();
  t.after(() => srv.close());
  const { headers } = await createAuthSession(srv.base, "ach-complete");

  const startRes = await fetch(`${srv.base}/api/session/start`, {
    method: "POST",
    headers,
    body: JSON.stringify({ language: "spanish", category: "essentials", count: 6 })
  });
  assert.equal(startRes.status, 200);
  const session = await startRes.json() as any;

  const completeRes = await fetch(`${srv.base}/api/session/complete`, {
    method: "POST",
    headers,
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
  const result = await completeRes.json() as any;

  assert.ok(result.ok);
  assert.ok(Array.isArray(result.unlockedAchievements), "unlockedAchievements must be an array");

  for (const a of result.unlockedAchievements as Achievement[]) {
    assert.ok(typeof a.id === "string");
    assert.ok(typeof a.name === "string");
    assert.ok(typeof a.description === "string");
    assert.ok(typeof a.icon === "string");
    assert.ok(typeof a.earnedAt === "string");
  }
});

test("GET /api/user/achievements returns earned achievements", async (t) => {
  const srv = new TestServer();
  t.after(() => srv.close());
  const { headers, userId } = await createAuthSession(srv.base, "ach-list");

  // No achievements earned yet
  const emptyRes = await fetch(`${srv.base}/api/user/achievements`, { headers });
  assert.equal(emptyRes.status, 200);
  assert.deepEqual(await emptyRes.json(), []);

  // Seed achievements directly via the DB layer (a single API session earns ~28 XP,
  // not enough to cross any milestone threshold on its own)
  database.checkAndGrantAchievements(userId, {
    streak: 7, totalXp: 500, language: "spanish", category: "essentials",
    mastery: 0, hintsUsed: 0, revealedAnswers: 0, score: 5, maxScore: 10
  } satisfies AchievementCheckInput);

  const listRes = await fetch(`${srv.base}/api/user/achievements`, { headers });
  assert.equal(listRes.status, 200);
  const list = await listRes.json() as Achievement[];
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
  const dates = list.map((a) => a.earnedAt);
  for (let i = 1; i < dates.length; i++) {
    assert.ok(dates[i - 1] >= dates[i], "achievements should be sorted descending by earnedAt");
  }
});

test("GET /api/user/achievements requires authentication", async (t) => {
  const srv = new TestServer();
  t.after(() => srv.close());

  const res = await fetch(`${srv.base}/api/user/achievements`);
  assert.equal(res.status, 401);
});
