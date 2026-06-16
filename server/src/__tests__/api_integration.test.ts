import type { } from "node"; // ensure file is treated as a module

const test = require("node:test");
const assert = require("node:assert/strict");
const { configureTestDb } = require("./helpers/testDb.ts");
configureTestDb(__filename);

const { createApp } = require("../index.ts");
const database = require("../db.ts");
const { createTokenService } = require("../auth/tokenService.ts");

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuthHeaders {
  email: string;
  Authorization: string;
  "Content-Type": string;
}

interface Question {
  id: string;
  type: string;
  answer: string;
  clozeAnswer?: string;
  pairs?: any[];
}

interface Attempt {
  questionId: string;
  builtSentence?: string;
  textAnswer?: string;
  selectedOption?: string;
  matchingPairs?: Array<{ prompt: string; answer: string }>;
  practicePairs?: Array<{ left: string; right: string }>;
  revealed?: boolean;
}

interface SessionData {
  sessionId: string;
  questions: Question[];
  category: string;
  recommendedLevel?: string;
  isDailyChallenge?: boolean;
  dailyChallengeDate?: string;
  practiceMode?: string;
}

interface SessionCompleteResult {
  ok: boolean;
  xpGained: number;
  evaluated: { score: number; maxScore: number; mistakes: number };
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

// ─── Auth helpers ─────────────────────────────────────────────────────────────

async function createAuthHeaders(base: string, label: string): Promise<AuthHeaders> {
  const email = `${label}-${Date.now()}@example.com`;
  return createAuthHeadersForEmail(base, email, label);
}

async function createAuthHeadersForEmail(base: string, email: string, displayName = "Learner"): Promise<AuthHeaders> {
  const registerRes = await fetch(`${base}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "Password123!", displayName })
  });
  assert.equal(registerRes.status, 201);
  const registered = await registerRes.json() as any;
  assert.ok(registered.verificationToken);

  const verifyRes = await fetch(`${base}/api/auth/verify-email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: registered.verificationToken })
  });
  assert.equal(verifyRes.status, 200);

  const loginRes = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "Password123!" })
  });
  assert.equal(loginRes.status, 200);
  const logged = await loginRes.json() as any;

  return { email, Authorization: `Bearer ${logged.token}`, "Content-Type": "application/json" };
}

// ─── Attempt builders ─────────────────────────────────────────────────────────

function makeAttempt(question: Question): Attempt {
  if (question.type === "mc_sentence" || question.type === "dialogue_turn") {
    return { questionId: question.id, selectedOption: question.answer };
  }
  if (question.type === "roleplay") return { questionId: question.id, selectedOption: question.answer };
  if (question.type === "flashcard") return { questionId: question.id, selectedOption: "known" };
  if (question.type === "pronunciation") return { questionId: question.id, textAnswer: question.answer };
  if (question.type === "matching") return { questionId: question.id, matchingPairs: question.pairs };
  if (question.type === "cloze_sentence") return { questionId: question.id, selectedOption: question.clozeAnswer };
  if (question.type === "dictation_sentence") return { questionId: question.id, builtSentence: question.answer };
  if (question.type === "practice_speak") return { questionId: question.id, textAnswer: question.answer };
  if (question.type === "practice_listen") return { questionId: question.id, selectedOption: question.answer };
  if (question.type === "practice_words") return { questionId: question.id, practicePairs: question.pairs as any };
  return { questionId: question.id, builtSentence: question.answer };
}

function makeWrongAttempt(question: Question): Attempt {
  if (question.type === "mc_sentence" || question.type === "dialogue_turn" || question.type === "practice_listen") {
    return { questionId: question.id, selectedOption: "__wrong__" };
  }
  if (question.type === "cloze_sentence") return { questionId: question.id, selectedOption: "__wrong__" };
  if (question.type === "dictation_sentence" || question.type === "build_sentence") {
    return { questionId: question.id, builtSentence: "__wrong__" };
  }
  if (question.type === "practice_speak" || question.type === "pronunciation") {
    return { questionId: question.id, textAnswer: "__wrong__" };
  }
  if (question.type === "practice_words") {
    const pairs: any[] = Array.isArray(question.pairs) ? question.pairs : [];
    return { questionId: question.id, practicePairs: pairs.map((p) => ({ left: p.left, right: "__wrong__" })) };
  }
  if (question.type === "matching") {
    const pairs: any[] = Array.isArray(question.pairs) ? question.pairs : [];
    return { questionId: question.id, matchingPairs: pairs.map((p) => ({ prompt: p.prompt, answer: "__wrong__" })) };
  }
  if (question.type === "roleplay") return { questionId: question.id, selectedOption: "__wrong__" };
  if (question.type === "flashcard") return { questionId: question.id, selectedOption: "review" };
  return { questionId: question.id, builtSentence: "__wrong__" };
}

// ─── Session lifecycle ────────────────────────────────────────────────────────

test("session start and complete happy path", async (t) => {
  const srv = new TestServer();
  t.after(() => srv.close());
  const authHeaders = await createAuthHeaders(srv.base, "happy-path");

  const startRes = await fetch(`${srv.base}/api/session/start`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ language: "spanish", category: "essentials", count: 6 })
  });
  assert.equal(startRes.status, 200);
  const session = await startRes.json() as SessionData;
  assert.ok(session.sessionId);
  assert.ok(Array.isArray(session.questions));
  assert.ok(session.questions.length >= 6);

  const attempts = session.questions.map(makeAttempt);
  const completeRes = await fetch(`${srv.base}/api/session/complete`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      sessionId: session.sessionId,
      language: "spanish",
      category: "essentials",
      attempts,
      hintsUsed: 0,
      revealedAnswers: 0
    })
  });
  assert.equal(completeRes.status, 200);
  const completed = await completeRes.json() as SessionCompleteResult;
  assert.equal(completed.ok, true);
  assert.equal(completed.evaluated.score, attempts.length);

  // Replaying the same sessionId must be rejected
  const replayRes = await fetch(`${srv.base}/api/session/complete`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ sessionId: session.sessionId, language: "spanish", category: "essentials", attempts })
  });
  assert.equal(replayRes.status, 409);
});

test("daily challenge is deterministic per language/day across users", async (t) => {
  const srv = new TestServer();
  t.after(() => srv.close());
  const learnerA = await createAuthHeaders(srv.base, "daily-a");
  const learnerB = await createAuthHeaders(srv.base, "daily-b");

  const startDaily = async (headers: AuthHeaders): Promise<SessionData> => {
    const res = await fetch(`${srv.base}/api/session/daily`, {
      method: "POST",
      headers,
      body: JSON.stringify({ language: "russian" })
    });
    assert.equal(res.status, 200);
    return res.json() as Promise<SessionData>;
  };

  const dailyA = await startDaily(learnerA);
  const dailyB = await startDaily(learnerB);

  assert.equal(dailyA.isDailyChallenge, true);
  assert.equal(dailyB.isDailyChallenge, true);
  assert.equal(dailyA.dailyChallengeDate, dailyB.dailyChallengeDate);
  assert.equal(dailyA.category, dailyB.category);
  assert.equal(dailyA.recommendedLevel, dailyB.recommendedLevel);
  assert.deepEqual(
    dailyA.questions.map((q) => q.id),
    dailyB.questions.map((q) => q.id)
  );
});

test("practice sessions award fixed XP and update progress", async (t) => {
  const srv = new TestServer();
  t.after(() => srv.close());
  const authHeaders = await createAuthHeaders(srv.base, "practice-xp");

  const modes: Array<{ mode: string; expectedXp: number | "by-score" }> = [
    { mode: "speak", expectedXp: "by-score" },
    { mode: "listen", expectedXp: 10 },
    { mode: "words", expectedXp: 5 }
  ];
  let expectedTotal = 0;

  for (const entry of modes) {
    const startRes = await fetch(`${srv.base}/api/session/start`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ language: "spanish", category: "essentials", count: 8, mode: entry.mode })
    });
    assert.equal(startRes.status, 200);
    const session = await startRes.json() as SessionData;
    assert.ok(session.questions.length >= 1);

    const attempts = session.questions.map(makeAttempt);
    const completeRes = await fetch(`${srv.base}/api/session/complete`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ sessionId: session.sessionId, language: "spanish", category: "essentials", attempts })
    });
    assert.equal(completeRes.status, 200);
    const completed = await completeRes.json() as SessionCompleteResult;
    assert.equal(completed.ok, true);

    const expectedXp = entry.expectedXp === "by-score" ? completed.evaluated.score : entry.expectedXp;
    assert.equal(completed.xpGained, expectedXp);
    expectedTotal += expectedXp;
  }

  const progressRes = await fetch(`${srv.base}/api/progress?language=spanish`, { headers: authHeaders });
  assert.equal(progressRes.status, 200);
  const progress = await progressRes.json() as any;
  assert.equal(progress.totalXp, expectedTotal);
  assert.equal(progress.todayXp, expectedTotal);
});

test("mistake practice starts from previous mistakes across categories", async (t) => {
  const srv = new TestServer();
  t.after(() => srv.close());
  const authHeaders = await createAuthHeaders(srv.base, "mistakes-practice");

  const startLesson = async (category: string): Promise<SessionData> => {
    const res = await fetch(`${srv.base}/api/session/start`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ language: "spanish", category, count: 6 })
    });
    assert.equal(res.status, 200);
    return res.json() as Promise<SessionData>;
  };

  const completeLesson = async (session: SessionData, attempts: Attempt[]): Promise<void> => {
    const res = await fetch(`${srv.base}/api/session/complete`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        sessionId: session.sessionId,
        language: "spanish",
        category: session.category,
        attempts,
        hintsUsed: 0,
        revealedAnswers: 0
      })
    });
    assert.equal(res.status, 200);
  };

  const essentials = await startLesson("essentials");
  const travel = await startLesson("travel");

  // Intentionally get first question wrong in each lesson to create mistake records
  await completeLesson(essentials, essentials.questions.map((q, i) => i === 0 ? makeWrongAttempt(q) : makeAttempt(q)));
  await completeLesson(travel, travel.questions.map((q, i) => i === 0 ? makeWrongAttempt(q) : makeAttempt(q)));

  const mistakesRes = await fetch(`${srv.base}/api/session/start`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ language: "spanish", category: "__mistakes__", count: 6, mode: "mistakes" })
  });
  assert.equal(mistakesRes.status, 200);
  const mistakes = await mistakesRes.json() as any;
  assert.equal(mistakes.practiceMode, "mistakes");
  assert.equal(mistakes.category, "__mistakes__");
  assert.ok(mistakes.questions.length >= 2);
  assert.ok(mistakes.questions.some((q: any) => q.sourceCategory === "essentials"));
  assert.ok(mistakes.questions.some((q: any) => q.sourceCategory === "travel"));
});

// ─── Score validation ─────────────────────────────────────────────────────────

test("practice revealed attempts are worth zero points", async (t) => {
  const srv = new TestServer();
  t.after(() => srv.close());
  const authHeaders = await createAuthHeaders(srv.base, "reveal-zero");

  const startRes = await fetch(`${srv.base}/api/session/start`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ language: "spanish", category: "essentials", count: 6, mode: "speak" })
  });
  assert.equal(startRes.status, 200);
  const session = await startRes.json() as SessionData;

  const attempts: Attempt[] = session.questions.map((q) => ({ ...makeAttempt(q), revealed: true }));
  const completeRes = await fetch(`${srv.base}/api/session/complete`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      sessionId: session.sessionId,
      language: "spanish",
      category: "essentials",
      attempts,
      hintsUsed: 0,
      revealedAnswers: attempts.length
    })
  });
  assert.equal(completeRes.status, 200);
  const completed = await completeRes.json() as SessionCompleteResult;
  assert.equal(completed.evaluated.score, 0);
  assert.equal(completed.evaluated.maxScore, session.questions.length);
});

test("practice mistakes count unique incorrect questions, not retry attempts", async (t) => {
  const srv = new TestServer();
  t.after(() => srv.close());
  const authHeaders = await createAuthHeaders(srv.base, "mistake-unique");

  const startRes = await fetch(`${srv.base}/api/session/start`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ language: "spanish", category: "essentials", count: 6, mode: "speak" })
  });
  assert.equal(startRes.status, 200);
  const session = await startRes.json() as SessionData;
  assert.ok(session.questions.length >= 6);

  const [first, ...rest] = session.questions;
  const attempts: Attempt[] = [
    makeWrongAttempt(first),
    makeWrongAttempt(first),
    { ...makeAttempt(first), revealed: true },
    ...rest.map(makeAttempt)
  ];

  const completeRes = await fetch(`${srv.base}/api/session/complete`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      sessionId: session.sessionId,
      language: "spanish",
      category: "essentials",
      attempts,
      hintsUsed: 0,
      revealedAnswers: 1
    })
  });
  assert.equal(completeRes.status, 200);
  const completed = await completeRes.json() as SessionCompleteResult;
  assert.equal(completed.evaluated.score, session.questions.length - 1);
  assert.equal(completed.evaluated.maxScore, session.questions.length);
  assert.equal(completed.evaluated.mistakes, 1);
});

test("score is capped to session question count", async (t) => {
  const srv = new TestServer();
  t.after(() => srv.close());
  const authHeaders = await createAuthHeaders(srv.base, "score-cap");

  const startRes = await fetch(`${srv.base}/api/session/start`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ language: "russian", category: "essentials", count: 9, mode: "speak" })
  });
  assert.equal(startRes.status, 200);
  const session = await startRes.json() as SessionData;
  assert.ok(session.questions.length >= 1);

  // Submitting duplicates of the first question should not inflate the score
  const first = session.questions[0];
  const attempts: Attempt[] = [
    ...session.questions.map(makeAttempt),
    ...Array.from({ length: 25 }, () => makeAttempt(first))
  ];

  const completeRes = await fetch(`${srv.base}/api/session/complete`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ sessionId: session.sessionId, language: "russian", category: "essentials", attempts })
  });
  assert.equal(completeRes.status, 200);
  const completed = await completeRes.json() as SessionCompleteResult;
  assert.equal(completed.evaluated.maxScore, session.questions.length);
  assert.equal(completed.evaluated.score, session.questions.length);
});

test("session complete rejects unknown question ids", async (t) => {
  const srv = new TestServer();
  t.after(() => srv.close());
  const authHeaders = await createAuthHeaders(srv.base, "unknown-id");

  const startRes = await fetch(`${srv.base}/api/session/start`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ language: "spanish", category: "travel", count: 6 })
  });
  const session = await startRes.json() as SessionData;

  const invalid = await fetch(`${srv.base}/api/session/complete`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      sessionId: session.sessionId,
      language: "spanish",
      category: "travel",
      attempts: [{ questionId: "bad-id", selectedOption: "x" }]
    })
  });
  assert.equal(invalid.status, 400);
});

// ─── Settings and progress ────────────────────────────────────────────────────

test("settings and progress overview normalize invalid language ids", async (t) => {
  const srv = new TestServer();
  t.after(() => srv.close());
  const authHeaders = await createAuthHeaders(srv.base, "language-normalization");

  // Numeric language IDs should be replaced with a valid language slug
  const saveSettingsRes = await fetch(`${srv.base}/api/settings`, {
    method: "PUT",
    headers: authHeaders,
    body: JSON.stringify({
      nativeLanguage: "english",
      targetLanguage: "1",
      dailyGoal: 25,
      dailyMinutes: 20,
      weeklyGoalSessions: 5,
      selfRatedLevel: "a1",
      learnerName: "Learner",
      learnerBio: "",
      focusArea: "travel"
    })
  });
  assert.equal(saveSettingsRes.status, 200);
  const savedSettings = await saveSettingsRes.json() as any;
  assert.equal(savedSettings.targetLanguage, "spanish");

  // Progress overview must not expose raw numeric language ids
  const overviewRes = await fetch(`${srv.base}/api/progress-overview`, { headers: authHeaders });
  assert.equal(overviewRes.status, 200);
  const overview = await overviewRes.json() as any;
  assert.ok(Array.isArray(overview.languages));
  assert.equal(overview.languages.some((e: any) => /^[0-9]+$/.test(String(e.language))), false);

  // Setting native and target to the same language should resolve to different values
  const saveEqualRes = await fetch(`${srv.base}/api/settings`, {
    method: "PUT",
    headers: authHeaders,
    body: JSON.stringify({
      nativeLanguage: "english",
      targetLanguage: "english",
      dailyGoal: 25,
      dailyMinutes: 20,
      weeklyGoalSessions: 5,
      selfRatedLevel: "a1",
      learnerName: "Learner",
      learnerBio: "",
      focusArea: "travel"
    })
  });
  assert.equal(saveEqualRes.status, 200);
  const sameLanguageSettings = await saveEqualRes.json() as any;
  assert.notEqual(sameLanguageSettings.targetLanguage, sameLanguageSettings.nativeLanguage);
});

// ─── User isolation ───────────────────────────────────────────────────────────

test("auth users get isolated progress state", async (t) => {
  const srv = new TestServer();
  t.after(() => srv.close());
  const emailSuffix = Date.now();
  const authA = await createAuthHeadersForEmail(srv.base, `a-${emailSuffix}@example.com`, "Learner A");
  const authB = await createAuthHeadersForEmail(srv.base, `b-${emailSuffix}@example.com`, "Learner B");

  // Complete a session as user A
  const startRes = await fetch(`${srv.base}/api/session/start`, {
    method: "POST",
    headers: authA,
    body: JSON.stringify({ language: "spanish", category: "essentials", count: 6 })
  });
  assert.equal(startRes.status, 200);
  const session = await startRes.json() as SessionData;

  await fetch(`${srv.base}/api/session/complete`, {
    method: "POST",
    headers: authA,
    body: JSON.stringify({
      sessionId: session.sessionId,
      language: "spanish",
      category: "essentials",
      attempts: session.questions.map(makeAttempt)
    })
  });

  // User A should have XP; user B's slate must remain clean
  const progressA = await (await fetch(`${srv.base}/api/progress?language=spanish`, { headers: authA })).json() as any;
  const progressB = await (await fetch(`${srv.base}/api/progress?language=spanish`, { headers: authB })).json() as any;
  assert.ok(progressA.totalXp > 0);
  assert.equal(progressB.totalXp, 0);
});

// ─── Auth flows ───────────────────────────────────────────────────────────────

test("email login is blocked until verification", async (t) => {
  const srv = new TestServer();
  t.after(() => srv.close());

  const email = `pending-${Date.now()}@example.com`;
  const registerRes = await fetch(`${srv.base}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "Password123!", displayName: "Pending User" })
  });
  assert.equal(registerRes.status, 201);

  const loginRes = await fetch(`${srv.base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "Password123!" })
  });
  assert.equal(loginRes.status, 403);
});

test("resend verification issues fresh token and allows verification", async (t) => {
  const srv = new TestServer();
  t.after(() => srv.close());

  const email = `resend-${Date.now()}@example.com`;
  const registerRes = await fetch(`${srv.base}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "Password123!", displayName: "Resend User" })
  });
  assert.equal(registerRes.status, 201);
  const registered = await registerRes.json() as any;

  const resendRes = await fetch(`${srv.base}/api/auth/resend-verification`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email })
  });
  assert.equal(resendRes.status, 200);
  const resent = await resendRes.json() as any;
  assert.ok(resent.verificationToken);
  assert.notEqual(resent.verificationToken, registered.verificationToken);

  // Old token must now be invalid
  const verifyOldRes = await fetch(`${srv.base}/api/auth/verify-email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: registered.verificationToken })
  });
  assert.equal(verifyOldRes.status, 400);

  // New token must work
  const verifyNewRes = await fetch(`${srv.base}/api/auth/verify-email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: resent.verificationToken })
  });
  assert.equal(verifyNewRes.status, 200);

  const loginRes = await fetch(`${srv.base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "Password123!" })
  });
  assert.equal(loginRes.status, 200);
});

test("email verification accepts quoted-printable-mangled token from email clients", async (t) => {
  const srv = new TestServer();
  t.after(() => srv.close());

  const email = `qp-verify-${Date.now()}@example.com`;
  const registerRes = await fetch(`${srv.base}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "Password123!", displayName: "QP Verify" })
  });
  assert.equal(registerRes.status, 201);
  const registered = await registerRes.json() as any;

  // Simulate quoted-printable encoding (some email clients split the hex token with "=")
  const rawToken = String(registered.verificationToken);
  const mangledToken = `3D${rawToken.slice(0, 14)}=${rawToken.slice(14)}`;

  const verifyRes = await fetch(`${srv.base}/api/auth/verify-email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: mangledToken })
  });
  assert.equal(verifyRes.status, 200);

  const loginRes = await fetch(`${srv.base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "Password123!" })
  });
  assert.equal(loginRes.status, 200);
});

test("new account settings learnerName inherits registered display name", async (t) => {
  const srv = new TestServer();
  t.after(() => srv.close());

  const email = `name-seed-${Date.now()}@example.com`;
  const displayName = "Casey Rivera";
  const authHeaders = await createAuthHeadersForEmail(srv.base, email, displayName);

  const settingsRes = await fetch(`${srv.base}/api/settings`, { headers: authHeaders });
  assert.equal(settingsRes.status, 200);
  const settings = await settingsRes.json() as any;
  assert.equal(settings.learnerName, displayName);
});

test("forgot password issues token and reset updates login credentials", async (t) => {
  const srv = new TestServer();
  t.after(() => srv.close());

  const email = `forgot-${Date.now()}@example.com`;
  const oldPassword = "Password123!";
  const newPassword = "NewPass456!";
  const authHeaders = await createAuthHeadersForEmail(srv.base, email, "Forgot User");

  const forgotRes = await fetch(`${srv.base}/api/auth/forgot-password`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ email })
  });
  assert.equal(forgotRes.status, 200);
  const forgotPayload = await forgotRes.json() as any;
  assert.ok(forgotPayload.resetToken);

  const resetRes = await fetch(`${srv.base}/api/auth/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: forgotPayload.resetToken, password: newPassword })
  });
  assert.equal(resetRes.status, 200);

  // Old password must now be rejected
  const oldLoginRes = await fetch(`${srv.base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: oldPassword })
  });
  assert.equal(oldLoginRes.status, 401);

  // New password must be accepted
  const newLoginRes = await fetch(`${srv.base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: newPassword })
  });
  assert.equal(newLoginRes.status, 200);
});

// ─── Account deletion ─────────────────────────────────────────────────────────

test("delete account requires explicit confirmation", async (t) => {
  const srv = new TestServer();
  t.after(() => srv.close());

  const email = `delete-confirm-${Date.now()}@example.com`;
  const authHeaders = await createAuthHeadersForEmail(srv.base, email, "Delete Confirm");

  const deleteRes = await fetch(`${srv.base}/api/auth/delete-account`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ password: "Password123!", confirmDelete: false })
  });
  assert.equal(deleteRes.status, 400);

  // Account must still be usable after a failed deletion
  const loginRes = await fetch(`${srv.base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "Password123!" })
  });
  assert.equal(loginRes.status, 200);
});

test("delete account removes local account and invalidates existing auth token", async (t) => {
  const srv = new TestServer();
  t.after(() => srv.close());

  const email = `delete-success-${Date.now()}@example.com`;
  const authHeaders = await createAuthHeadersForEmail(srv.base, email, "Delete Success");

  const deleteRes = await fetch(`${srv.base}/api/auth/delete-account`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ password: "Password123!", confirmDelete: true })
  });
  assert.equal(deleteRes.status, 200);

  // Stale token should now be rejected
  const staleTokenRes = await fetch(`${srv.base}/api/settings`, { headers: authHeaders });
  assert.equal(staleTokenRes.status, 401);

  // Login with the same credentials must also fail
  const loginRes = await fetch(`${srv.base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "Password123!" })
  });
  assert.equal(loginRes.status, 401);
});

test("delete account is rejected for oauth users", async (t) => {
  const srv = new TestServer();
  t.after(() => srv.close());

  // Create an OAuth user directly in the DB (no HTTP registration flow for OAuth)
  const oauthUser = database.createUser({
    email: `oauth-delete-${Date.now()}@example.com`,
    passwordHash: `oauth-google:${Date.now()}`,
    displayName: "OAuth User",
    authProvider: "google",
    emailVerified: true
  });
  assert.ok(oauthUser);

  const tokenService = createTokenService({
    authSecret: process.env.LINGOFLOW_AUTH_SECRET || "lingoflow-dev-secret-change-me",
    tokenTtlSeconds: 60 * 60 * 24 * 30,
    googleStateTtlSeconds: 10 * 60
  });
  const token = tokenService.createAuthToken(oauthUser.id);

  const deleteRes = await fetch(`${srv.base}/api/auth/delete-account`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ password: "Password123!", confirmDelete: true })
  });
  assert.equal(deleteRes.status, 400);
});

// ─── Community contributions ──────────────────────────────────────────────────

test("community contributions are scoped to the signed-in learner by default", async (t) => {
  process.env.CONTRIBUTION_REVIEWER_EMAILS = "";
  t.after(() => { delete process.env.CONTRIBUTION_REVIEWER_EMAILS; });

  const srv = new TestServer();
  t.after(() => srv.close());
  const authorA = await createAuthHeaders(srv.base, "contrib-a");
  const authorB = await createAuthHeaders(srv.base, "contrib-b");

  await fetch(`${srv.base}/api/community/contribute`, {
    method: "POST",
    headers: authorA,
    body: JSON.stringify({
      language: "spanish", category: "essentials",
      prompt: "How do you say hello?", correctAnswer: "Hola",
      hints: ["Greeting"], difficulty: "a1", exerciseType: "flashcard"
    })
  }).then((r) => { assert.equal(r.status, 201); });

  await fetch(`${srv.base}/api/community/contribute`, {
    method: "POST",
    headers: authorB,
    body: JSON.stringify({
      language: "spanish", category: "travel",
      prompt: "How do you ask for the station?", correctAnswer: "Donde esta la estacion?",
      hints: ["Travel"], difficulty: "a2", exerciseType: "build_sentence"
    })
  }).then((r) => { assert.equal(r.status, 201); });

  const listRes = await fetch(`${srv.base}/api/community/contributions`, { headers: authorA });
  assert.equal(listRes.status, 200);
  const listed = await listRes.json() as any;
  assert.equal(listed.ok, true);
  assert.equal(listed.canModerate, false);
  assert.equal(listed.scope, "mine");
  assert.equal(listed.submissions.length, 1);
  assert.equal(listed.submissions[0].prompt, "How do you say hello?");
  assert.equal(listed.submissions[0].submitter.email, authorA.email);
});

test("reviewers can list all community contributions and update moderation status", async (t) => {
  const reviewerEmail = `reviewer-${Date.now()}@example.com`;
  process.env.CONTRIBUTION_REVIEWER_EMAILS = reviewerEmail;
  t.after(() => { delete process.env.CONTRIBUTION_REVIEWER_EMAILS; });

  const srv = new TestServer();
  t.after(() => srv.close());
  const reviewer = await createAuthHeadersForEmail(srv.base, reviewerEmail, "Reviewer");
  const contributor = await createAuthHeaders(srv.base, "moderated-user");

  const createRes = await fetch(`${srv.base}/api/community/contribute`, {
    method: "POST",
    headers: contributor,
    body: JSON.stringify({
      language: "spanish", category: "essentials",
      prompt: "How do you say thank you?", correctAnswer: "Gracias",
      hints: ["Polite phrase"], difficulty: "a1", exerciseType: "flashcard"
    })
  });
  assert.equal(createRes.status, 201);
  const created = await createRes.json() as any;
  assert.equal(created.submission.moderationStatus, "pending");

  // Reviewer's /me response must include canModerateCommunityExercises
  const meRes = await fetch(`${srv.base}/api/auth/me`, { headers: reviewer });
  assert.equal(meRes.status, 200);
  const me = await meRes.json() as any;
  assert.equal(me.user.canModerateCommunityExercises, true);

  const listAllRes = await fetch(
    `${srv.base}/api/community/contributions?scope=all&status=pending`,
    { headers: reviewer }
  );
  assert.equal(listAllRes.status, 200);
  const listed = await listAllRes.json() as any;
  assert.equal(listed.canModerate, true);
  assert.equal(listed.scope, "all");
  assert.ok(listed.submissions.some((s: any) => s.id === created.submission.id));

  const updateRes = await fetch(
    `${srv.base}/api/community/contributions/${created.submission.id}`,
    { method: "PATCH", headers: reviewer, body: JSON.stringify({ moderationStatus: "approved" }) }
  );
  assert.equal(updateRes.status, 200);
  const updated = await updateRes.json() as any;
  assert.equal(updated.submission.moderationStatus, "approved");

  const approvedRes = await fetch(
    `${srv.base}/api/community/contributions?scope=all&status=approved`,
    { headers: reviewer }
  );
  assert.equal(approvedRes.status, 200);
  const approved = await approvedRes.json() as any;
  assert.ok(approved.submissions.some((s: any) => s.id === created.submission.id));
});

test("non-reviewers cannot update community contribution moderation status", async (t) => {
  const reviewerEmail = `reviewer-${Date.now()}-forbidden@example.com`;
  process.env.CONTRIBUTION_REVIEWER_EMAILS = reviewerEmail;
  t.after(() => { delete process.env.CONTRIBUTION_REVIEWER_EMAILS; });

  const srv = new TestServer();
  t.after(() => srv.close());
  const reviewer = await createAuthHeadersForEmail(srv.base, reviewerEmail, "Reviewer");
  const contributor = await createAuthHeaders(srv.base, "contributor");
  const nonReviewer = await createAuthHeaders(srv.base, "non-reviewer");

  const createRes = await fetch(`${srv.base}/api/community/contribute`, {
    method: "POST",
    headers: contributor,
    body: JSON.stringify({
      language: "spanish", category: "conversation",
      prompt: "How do you say good night?", correctAnswer: "Buenas noches",
      difficulty: "a1", exerciseType: "flashcard"
    })
  });
  assert.equal(createRes.status, 201);
  const created = await createRes.json() as any;

  // Non-reviewer PATCH must be rejected
  const forbiddenRes = await fetch(
    `${srv.base}/api/community/contributions/${created.submission.id}`,
    { method: "PATCH", headers: nonReviewer, body: JSON.stringify({ moderationStatus: "rejected" }) }
  );
  assert.equal(forbiddenRes.status, 403);

  // Submission must still be pending
  const pendingRes = await fetch(
    `${srv.base}/api/community/contributions?scope=all&status=pending`,
    { headers: reviewer }
  );
  assert.equal(pendingRes.status, 200);
  const pending = await pendingRes.json() as any;
  const target = pending.submissions.find((s: any) => s.id === created.submission.id);
  assert.ok(target);
  assert.equal(target.moderationStatus, "pending");
});

test("reviewer comment is stored and returned after moderation update", async (t) => {
  const reviewerEmail = `reviewer-${Date.now()}-comment@example.com`;
  process.env.CONTRIBUTION_REVIEWER_EMAILS = reviewerEmail;
  t.after(() => { delete process.env.CONTRIBUTION_REVIEWER_EMAILS; });

  const srv = new TestServer();
  t.after(() => srv.close());
  const reviewer = await createAuthHeadersForEmail(srv.base, reviewerEmail, "Reviewer");
  const contributor = await createAuthHeaders(srv.base, "comment-contrib");

  const createRes = await fetch(`${srv.base}/api/community/contribute`, {
    method: "POST",
    headers: contributor,
    body: JSON.stringify({
      language: "spanish", category: "essentials",
      prompt: "How do you say please?", correctAnswer: "Por favor",
      difficulty: "a1", exerciseType: "flashcard"
    })
  });
  assert.equal(createRes.status, 201);
  const created = await createRes.json() as any;

  const updateRes = await fetch(
    `${srv.base}/api/community/contributions/${created.submission.id}`,
    {
      method: "PATCH",
      headers: reviewer,
      body: JSON.stringify({ moderationStatus: "approved", reviewerComment: "Great addition!" })
    }
  );
  assert.equal(updateRes.status, 200);
  const updated = await updateRes.json() as any;
  assert.equal(updated.submission.moderationStatus, "approved");
  assert.equal(updated.submission.reviewerComment, "Great addition!");
  assert.ok(updated.submission.reviewedAt);
  assert.ok(updated.submission.reviewedBy);
  assert.equal(updated.submission.reviewedBy.displayName, "Reviewer");

  // Contributor can see the reviewer comment on their own submissions list
  const myListRes = await fetch(`${srv.base}/api/community/contributions`, { headers: contributor });
  assert.equal(myListRes.status, 200);
  const myList = await myListRes.json() as any;
  const mine = myList.submissions.find((s: any) => s.id === created.submission.id);
  assert.ok(mine);
  assert.equal(mine.reviewerComment, "Great addition!");
});

test("changes_requested is a valid moderation status and appears in filtered list", async (t) => {
  const reviewerEmail = `reviewer-${Date.now()}-cr@example.com`;
  process.env.CONTRIBUTION_REVIEWER_EMAILS = reviewerEmail;
  t.after(() => { delete process.env.CONTRIBUTION_REVIEWER_EMAILS; });

  const srv = new TestServer();
  t.after(() => srv.close());
  const reviewer = await createAuthHeadersForEmail(srv.base, reviewerEmail, "Reviewer");
  const contributor = await createAuthHeaders(srv.base, "cr-contrib");

  const createRes = await fetch(`${srv.base}/api/community/contribute`, {
    method: "POST",
    headers: contributor,
    body: JSON.stringify({
      language: "spanish", category: "travel",
      prompt: "How do you ask where the hotel is?", correctAnswer: "Donde esta el hotel?",
      difficulty: "a2", exerciseType: "build_sentence"
    })
  });
  assert.equal(createRes.status, 201);
  const created = await createRes.json() as any;

  const updateRes = await fetch(
    `${srv.base}/api/community/contributions/${created.submission.id}`,
    {
      method: "PATCH",
      headers: reviewer,
      body: JSON.stringify({ moderationStatus: "changes_requested", reviewerComment: "Please add more hints." })
    }
  );
  assert.equal(updateRes.status, 200);
  const updated = await updateRes.json() as any;
  assert.equal(updated.submission.moderationStatus, "changes_requested");
  assert.equal(updated.submission.reviewerComment, "Please add more hints.");

  const filteredRes = await fetch(
    `${srv.base}/api/community/contributions?scope=all&status=changes_requested`,
    { headers: reviewer }
  );
  assert.equal(filteredRes.status, 200);
  const filtered = await filteredRes.json() as any;
  assert.ok(filtered.submissions.some((s: any) => s.id === created.submission.id));
});

test("invalid moderation status is rejected with 400", async (t) => {
  const reviewerEmail = `reviewer-${Date.now()}-invalid@example.com`;
  process.env.CONTRIBUTION_REVIEWER_EMAILS = reviewerEmail;
  t.after(() => { delete process.env.CONTRIBUTION_REVIEWER_EMAILS; });

  const srv = new TestServer();
  t.after(() => srv.close());
  const reviewer = await createAuthHeadersForEmail(srv.base, reviewerEmail, "Reviewer");
  const contributor = await createAuthHeaders(srv.base, "invalid-status-contrib");

  const createRes = await fetch(`${srv.base}/api/community/contribute`, {
    method: "POST",
    headers: contributor,
    body: JSON.stringify({
      language: "spanish", category: "essentials",
      prompt: "How do you say yes?", correctAnswer: "Si",
      difficulty: "a1", exerciseType: "flashcard"
    })
  });
  assert.equal(createRes.status, 201);
  const created = await createRes.json() as any;

  const badRes = await fetch(
    `${srv.base}/api/community/contributions/${created.submission.id}`,
    { method: "PATCH", headers: reviewer, body: JSON.stringify({ moderationStatus: "maybe" }) }
  );
  assert.equal(badRes.status, 400);
});

test("pending-count endpoint returns count for moderators and zero for regular users", async (t) => {
  const reviewerEmail = `reviewer-${Date.now()}-count@example.com`;
  process.env.CONTRIBUTION_REVIEWER_EMAILS = reviewerEmail;
  t.after(() => { delete process.env.CONTRIBUTION_REVIEWER_EMAILS; });

  const srv = new TestServer();
  t.after(() => srv.close());
  const reviewer = await createAuthHeadersForEmail(srv.base, reviewerEmail, "Reviewer");
  const contributor = await createAuthHeaders(srv.base, "count-contrib");

  for (const prompt of ["Submission one", "Submission two"]) {
    const r = await fetch(`${srv.base}/api/community/contribute`, {
      method: "POST",
      headers: contributor,
      body: JSON.stringify({ language: "spanish", category: "essentials", prompt, correctAnswer: "Answer", difficulty: "a1", exerciseType: "flashcard" })
    });
    assert.equal(r.status, 201);
  }

  const modCountRes = await fetch(`${srv.base}/api/community/contributions/pending-count`, { headers: reviewer });
  assert.equal(modCountRes.status, 200);
  const modCount = await modCountRes.json() as any;
  assert.ok(modCount.count >= 2);

  const userCountRes = await fetch(`${srv.base}/api/community/contributions/pending-count`, { headers: contributor });
  assert.equal(userCountRes.status, 200);
  const userCount = await userCountRes.json() as any;
  assert.equal(userCount.count, 0);
});

test("reviewer comment is updated when status is changed again", async (t) => {
  const reviewerEmail = `reviewer-${Date.now()}-reupdate@example.com`;
  process.env.CONTRIBUTION_REVIEWER_EMAILS = reviewerEmail;
  t.after(() => { delete process.env.CONTRIBUTION_REVIEWER_EMAILS; });

  const srv = new TestServer();
  t.after(() => srv.close());
  const reviewer = await createAuthHeadersForEmail(srv.base, reviewerEmail, "Reviewer");
  const contributor = await createAuthHeaders(srv.base, "reupdate-contrib");

  const createRes = await fetch(`${srv.base}/api/community/contribute`, {
    method: "POST",
    headers: contributor,
    body: JSON.stringify({
      language: "spanish", category: "grammar",
      prompt: "How do you form the past tense?", correctAnswer: "Use preterite forms",
      difficulty: "b1", exerciseType: "flashcard"
    })
  });
  assert.equal(createRes.status, 201);
  const created = await createRes.json() as any;

  // First moderation decision
  await fetch(`${srv.base}/api/community/contributions/${created.submission.id}`, {
    method: "PATCH",
    headers: reviewer,
    body: JSON.stringify({ moderationStatus: "changes_requested", reviewerComment: "First comment" })
  });

  // Reviewer updates decision — comment must be overwritten
  const secondRes = await fetch(`${srv.base}/api/community/contributions/${created.submission.id}`, {
    method: "PATCH",
    headers: reviewer,
    body: JSON.stringify({ moderationStatus: "approved", reviewerComment: "Looks good now" })
  });
  assert.equal(secondRes.status, 200);
  const second = await secondRes.json() as any;
  assert.equal(second.submission.moderationStatus, "approved");
  assert.equal(second.submission.reviewerComment, "Looks good now");
});

// ─── Visitor stats ────────────────────────────────────────────────────────────

test("visitor stats include only login page aggregate metrics", async (t) => {
  const reviewerEmail = `reviewer-${Date.now()}-visitor-stats@example.com`;
  process.env.CONTRIBUTION_REVIEWER_EMAILS = reviewerEmail;
  t.after(() => { delete process.env.CONTRIBUTION_REVIEWER_EMAILS; });

  const srv = new TestServer();
  t.after(() => srv.close());
  const reviewerHeaders = await createAuthHeadersForEmail(srv.base, reviewerEmail, "Reviewer");
  const authHeaders = await createAuthHeaders(srv.base, "visitor-stats");

  const firstIp = "198.51.100.10";
  const secondIp = "203.0.113.7";

  // Record two visits from the same IP on the login page
  assert.equal((await fetch(`${srv.base}/api/visitors/login`, {
    method: "POST",
    headers: { "x-forwarded-for": firstIp, "content-type": "application/json" },
    body: JSON.stringify({})
  })).status, 202);
  assert.equal((await fetch(`${srv.base}/api/visitors/login`, {
    method: "POST",
    headers: { "x-forwarded-for": firstIp, "content-type": "application/json" },
    body: JSON.stringify({})
  })).status, 202);

  // Authenticated request from a different IP (should not appear in login-page counts)
  await fetch(`${srv.base}/api/progress-overview`, {
    headers: { ...authHeaders, "x-forwarded-for": secondIp }
  });

  // Regular users must not access visitor stats
  const forbiddenRes = await fetch(`${srv.base}/api/visitors/stats?sinceDays=7&limit=20`, {
    headers: { ...authHeaders, "x-forwarded-for": firstIp }
  });
  assert.equal(forbiddenRes.status, 403);

  // Reviewers can access visitor stats
  const statsRes = await fetch(`${srv.base}/api/visitors/stats?sinceDays=7&limit=20`, {
    headers: { ...reviewerHeaders, "x-forwarded-for": firstIp }
  });
  assert.equal(statsRes.status, 200);
  const stats = await statsRes.json() as any;

  assert.equal(stats.sinceDays, 7);
  assert.ok(stats.loginPage);
  assert.equal(stats.loginPage.totalVisits, 2);
  assert.equal(stats.loginPage.uniqueVisitors, 1);
  assert.ok(Array.isArray(stats.loginPage.daily));
  assert.ok(stats.loginPage.daily.length >= 1);
  assert.equal(stats.loginPage.daily[0].totalVisits, 2);
  assert.equal(stats.loginPage.daily[0].uniqueVisitors, 1);
});
