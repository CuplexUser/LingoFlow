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

function makeAttempt(question) {
  if (question.type === "mc_sentence" || question.type === "dialogue_turn") {
    return { questionId: question.id, selectedOption: question.answer };
  }
  if (question.type === "cloze_sentence") {
    return { questionId: question.id, selectedOption: question.clozeAnswer };
  }
  if (question.type === "dictation_sentence") {
    return { questionId: question.id, builtSentence: question.answer };
  }
  if (question.type === "practice_speak") {
    return { questionId: question.id, textAnswer: question.answer };
  }
  if (question.type === "practice_listen") {
    return { questionId: question.id, selectedOption: question.answer };
  }
  if (question.type === "practice_words") {
    return { questionId: question.id, practicePairs: question.pairs };
  }
  return { questionId: question.id, builtSentence: question.answer };
}

function makeWrongAttempt(question) {
  if (question.type === "mc_sentence" || question.type === "dialogue_turn" || question.type === "practice_listen") {
    return { questionId: question.id, selectedOption: "__wrong__" };
  }
  if (question.type === "cloze_sentence") {
    return { questionId: question.id, selectedOption: "__wrong__" };
  }
  if (question.type === "dictation_sentence" || question.type === "build_sentence") {
    return { questionId: question.id, builtSentence: "__wrong__" };
  }
  if (question.type === "practice_speak" || question.type === "pronunciation") {
    return { questionId: question.id, textAnswer: "__wrong__" };
  }
  if (question.type === "practice_words") {
    const pairs = Array.isArray(question.pairs) ? question.pairs : [];
    const wrongPairs = pairs.map((pair) => ({ left: pair.left, right: "__wrong__" }));
    return { questionId: question.id, practicePairs: wrongPairs };
  }
  if (question.type === "matching") {
    const pairs = Array.isArray(question.pairs) ? question.pairs : [];
    const wrongPairs = pairs.map((pair) => ({ prompt: pair.prompt, answer: "__wrong__" }));
    return { questionId: question.id, matchingPairs: wrongPairs };
  }
  if (question.type === "roleplay") {
    return { questionId: question.id, selectedOption: "__wrong__" };
  }
  if (question.type === "flashcard") {
    return { questionId: question.id, selectedOption: "review" };
  }
  return { questionId: question.id, builtSentence: "__wrong__" };
}

async function createAuthHeaders(base, label) {
  const email = `${label}-${Date.now()}@example.com`;
  return createAuthHeadersForEmail(base, email, label);
}

async function createAuthHeadersForEmail(base, email, displayName = "Learner") {
  const registerRes = await fetch(`${base}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      password: "Password123!",
      displayName
    })
  });
  assert.equal(registerRes.status, 201);
  const registered = await registerRes.json();
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
  const logged = await loginRes.json();
  return {
    email,
    Authorization: `Bearer ${logged.token}`,
    "Content-Type": "application/json"
  };
}

test("session start and complete happy path", async (t) => {
  const app = createApp();
  const server = app.listen(0);
  t.after(() => server.close());
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  const authHeaders = await createAuthHeaders(base, "happy-path");

  const startRes = await fetch(`${base}/api/session/start`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      language: "spanish",
      category: "essentials",
      count: 6
    })
  });
  assert.equal(startRes.status, 200);
  const session = await startRes.json();
  assert.ok(session.sessionId);
  assert.ok(Array.isArray(session.questions));
  assert.ok(session.questions.length >= 6);

  const attempts = session.questions.map((question) => makeAttempt(question));
  const completeRes = await fetch(`${base}/api/session/complete`, {
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
  const completed = await completeRes.json();
  assert.equal(completed.ok, true);
  assert.equal(completed.evaluated.score, attempts.length);

  const replayRes = await fetch(`${base}/api/session/complete`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      sessionId: session.sessionId,
      language: "spanish",
      category: "essentials",
      attempts
    })
  });
  assert.equal(replayRes.status, 409);
});

test("practice sessions award fixed XP and update progress", async (t) => {
  const app = createApp();
  const server = app.listen(0);
  t.after(() => server.close());
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  const authHeaders = await createAuthHeaders(base, "practice-xp");

  const modes = [
    { mode: "speak", expectedXp: "by-score" },
    { mode: "listen", expectedXp: 10 },
    { mode: "words", expectedXp: 5 }
  ];

  let expectedTotal = 0;

  for (const entry of modes) {
    const startRes = await fetch(`${base}/api/session/start`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        language: "spanish",
        category: "essentials",
        count: 8,
        mode: entry.mode
      })
    });
    assert.equal(startRes.status, 200);
    const session = await startRes.json();
    assert.ok(session.sessionId);
    assert.ok(Array.isArray(session.questions));
    assert.ok(session.questions.length >= 1);

    const attempts = session.questions.map((question) => makeAttempt(question));
    const completeRes = await fetch(`${base}/api/session/complete`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        sessionId: session.sessionId,
        language: "spanish",
        category: "essentials",
        attempts
      })
    });
    assert.equal(completeRes.status, 200);
    const completed = await completeRes.json();
    assert.equal(completed.ok, true);
    const expectedXp = entry.expectedXp === "by-score" ? completed.evaluated.score : entry.expectedXp;
    assert.equal(completed.xpGained, expectedXp);
    expectedTotal += expectedXp;
  }

  const progressRes = await fetch(`${base}/api/progress?language=spanish`, { headers: authHeaders });
  assert.equal(progressRes.status, 200);
  const progress = await progressRes.json();
  assert.equal(progress.totalXp, expectedTotal);
  assert.equal(progress.todayXp, expectedTotal);
});

test("session complete rejects unknown question ids", async (t) => {
  const app = createApp();
  const server = app.listen(0);
  t.after(() => server.close());
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  const authHeaders = await createAuthHeaders(base, "unknown-id");

  const startRes = await fetch(`${base}/api/session/start`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      language: "spanish",
      category: "travel",
      count: 6
    })
  });
  const session = await startRes.json();

  const invalid = await fetch(`${base}/api/session/complete`, {
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

test("practice revealed attempts are worth zero points", async (t) => {
  const app = createApp();
  const server = app.listen(0);
  t.after(() => server.close());
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  const authHeaders = await createAuthHeaders(base, "reveal-zero");

  const startRes = await fetch(`${base}/api/session/start`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      language: "spanish",
      category: "essentials",
      count: 6,
      mode: "speak"
    })
  });
  assert.equal(startRes.status, 200);
  const session = await startRes.json();

  const attempts = session.questions.map((question) => ({
    ...makeAttempt(question),
    revealed: true
  }));
  const completeRes = await fetch(`${base}/api/session/complete`, {
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
  const completed = await completeRes.json();
  assert.equal(completed.evaluated.score, 0);
  assert.equal(completed.evaluated.maxScore, session.questions.length);
});

test("practice mistakes count unique incorrect questions, not retry attempts", async (t) => {
  const app = createApp();
  const server = app.listen(0);
  t.after(() => server.close());
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  const authHeaders = await createAuthHeaders(base, "mistake-unique");

  const startRes = await fetch(`${base}/api/session/start`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      language: "spanish",
      category: "essentials",
      count: 6,
      mode: "speak"
    })
  });
  assert.equal(startRes.status, 200);
  const session = await startRes.json();
  assert.ok(Array.isArray(session.questions));
  assert.ok(session.questions.length >= 6);

  const [first, ...rest] = session.questions;
  const attempts = [
    makeWrongAttempt(first),
    makeWrongAttempt(first),
    { ...makeAttempt(first), revealed: true },
    ...rest.map((question) => makeAttempt(question))
  ];

  const completeRes = await fetch(`${base}/api/session/complete`, {
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
  const completed = await completeRes.json();
  assert.equal(completed.evaluated.score, session.questions.length - 1);
  assert.equal(completed.evaluated.maxScore, session.questions.length);
  assert.equal(completed.evaluated.mistakes, 1);
});

test("score is capped to session question count", async (t) => {
  const app = createApp();
  const server = app.listen(0);
  t.after(() => server.close());
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  const authHeaders = await createAuthHeaders(base, "score-cap");

  const startRes = await fetch(`${base}/api/session/start`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      language: "russian",
      category: "essentials",
      count: 9,
      mode: "speak"
    })
  });
  assert.equal(startRes.status, 200);
  const session = await startRes.json();
  assert.ok(Array.isArray(session.questions));
  assert.ok(session.questions.length >= 1);

  const first = session.questions[0];
  const attempts = [
    ...session.questions.map((question) => makeAttempt(question)),
    ...Array.from({ length: 25 }, () => makeAttempt(first))
  ];

  const completeRes = await fetch(`${base}/api/session/complete`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      sessionId: session.sessionId,
      language: "russian",
      category: "essentials",
      attempts
    })
  });
  assert.equal(completeRes.status, 200);
  const completed = await completeRes.json();
  assert.equal(completed.evaluated.maxScore, session.questions.length);
  assert.equal(completed.evaluated.score, session.questions.length);
});

test("auth users get isolated progress state", async (t) => {
  const app = createApp();
  const server = app.listen(0);
  t.after(() => server.close());
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  const emailSuffix = Date.now();
  const registerA = await fetch(`${base}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: `a-${emailSuffix}@example.com`,
      password: "Password123!",
      displayName: "Learner A"
    })
  });
  assert.equal(registerA.status, 201);
  const accountA = await registerA.json();
  assert.ok(accountA.verificationToken);

  const verifyA = await fetch(`${base}/api/auth/verify-email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: accountA.verificationToken })
  });
  assert.equal(verifyA.status, 200);

  const loginA = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: `a-${emailSuffix}@example.com`,
      password: "Password123!"
    })
  });
  assert.equal(loginA.status, 200);
  const loggedA = await loginA.json();
  const authA = { Authorization: `Bearer ${loggedA.token}`, "Content-Type": "application/json" };

  const registerB = await fetch(`${base}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: `b-${emailSuffix}@example.com`,
      password: "Password123!",
      displayName: "Learner B"
    })
  });
  assert.equal(registerB.status, 201);
  const accountB = await registerB.json();
  assert.ok(accountB.verificationToken);

  const verifyB = await fetch(`${base}/api/auth/verify-email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: accountB.verificationToken })
  });
  assert.equal(verifyB.status, 200);

  const loginB = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: `b-${emailSuffix}@example.com`,
      password: "Password123!"
    })
  });
  assert.equal(loginB.status, 200);
  const loggedB = await loginB.json();
  const authB = { Authorization: `Bearer ${loggedB.token}`, "Content-Type": "application/json" };

  const startRes = await fetch(`${base}/api/session/start`, {
    method: "POST",
    headers: authA,
    body: JSON.stringify({
      language: "spanish",
      category: "essentials",
      count: 6
    })
  });
  assert.equal(startRes.status, 200);
  const session = await startRes.json();
  const attempts = session.questions.map((question) => makeAttempt(question));

  const completeRes = await fetch(`${base}/api/session/complete`, {
    method: "POST",
    headers: authA,
    body: JSON.stringify({
      sessionId: session.sessionId,
      language: "spanish",
      category: "essentials",
      attempts
    })
  });
  assert.equal(completeRes.status, 200);

  const progressARes = await fetch(`${base}/api/progress?language=spanish`, { headers: authA });
  const progressA = await progressARes.json();
  assert.ok(progressA.totalXp > 0);

  const progressBRes = await fetch(`${base}/api/progress?language=spanish`, { headers: authB });
  const progressB = await progressBRes.json();
  assert.equal(progressB.totalXp, 0);
});

test("email login is blocked until verification", async (t) => {
  const app = createApp();
  const server = app.listen(0);
  t.after(() => server.close());
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  const email = `pending-${Date.now()}@example.com`;
  const registerRes = await fetch(`${base}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      password: "Password123!",
      displayName: "Pending User"
    })
  });
  assert.equal(registerRes.status, 201);

  const loginRes = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      password: "Password123!"
    })
  });
  assert.equal(loginRes.status, 403);
});

test("resend verification issues fresh token and allows verification", async (t) => {
  const app = createApp();
  const server = app.listen(0);
  t.after(() => server.close());
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  const email = `resend-${Date.now()}@example.com`;
  const registerRes = await fetch(`${base}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      password: "Password123!",
      displayName: "Resend User"
    })
  });
  assert.equal(registerRes.status, 201);
  const registered = await registerRes.json();
  assert.ok(registered.verificationToken);

  const resendRes = await fetch(`${base}/api/auth/resend-verification`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email })
  });
  assert.equal(resendRes.status, 200);
  const resent = await resendRes.json();
  assert.ok(resent.verificationToken);
  assert.notEqual(resent.verificationToken, registered.verificationToken);

  const verifyOldRes = await fetch(`${base}/api/auth/verify-email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: registered.verificationToken })
  });
  assert.equal(verifyOldRes.status, 400);

  const verifyNewRes = await fetch(`${base}/api/auth/verify-email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: resent.verificationToken })
  });
  assert.equal(verifyNewRes.status, 200);

  const loginRes = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      password: "Password123!"
    })
  });
  assert.equal(loginRes.status, 200);
});

test("new account settings learnerName inherits registered display name", async (t) => {
  const app = createApp();
  const server = app.listen(0);
  t.after(() => server.close());
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  const email = `name-seed-${Date.now()}@example.com`;
  const displayName = "Casey Rivera";
  const registerRes = await fetch(`${base}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      password: "Password123!",
      displayName
    })
  });
  assert.equal(registerRes.status, 201);
  const registered = await registerRes.json();
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
  const logged = await loginRes.json();
  const authHeaders = {
    Authorization: `Bearer ${logged.token}`,
    "Content-Type": "application/json"
  };

  const settingsRes = await fetch(`${base}/api/settings`, { headers: authHeaders });
  assert.equal(settingsRes.status, 200);
  const settings = await settingsRes.json();
  assert.equal(settings.learnerName, displayName);
});

test("forgot password issues token and reset updates login credentials", async (t) => {
  const app = createApp();
  const server = app.listen(0);
  t.after(() => server.close());
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  const email = `forgot-${Date.now()}@example.com`;
  const oldPassword = "Password123!";
  const newPassword = "NewPass456!";
  const registerRes = await fetch(`${base}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      password: oldPassword,
      displayName: "Forgot User"
    })
  });
  assert.equal(registerRes.status, 201);
  const registered = await registerRes.json();
  assert.ok(registered.verificationToken);

  const verifyRes = await fetch(`${base}/api/auth/verify-email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: registered.verificationToken })
  });
  assert.equal(verifyRes.status, 200);

  const forgotRes = await fetch(`${base}/api/auth/forgot-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email })
  });
  assert.equal(forgotRes.status, 200);
  const forgotPayload = await forgotRes.json();
  assert.ok(forgotPayload.resetToken);

  const resetRes = await fetch(`${base}/api/auth/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      token: forgotPayload.resetToken,
      password: newPassword
    })
  });
  assert.equal(resetRes.status, 200);

  const oldLoginRes = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: oldPassword })
  });
  assert.equal(oldLoginRes.status, 401);

  const newLoginRes = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: newPassword })
  });
  assert.equal(newLoginRes.status, 200);
});

test("community contributions are scoped to the signed-in learner by default", async (t) => {
  process.env.CONTRIBUTION_REVIEWER_EMAILS = "";
  t.after(() => {
    delete process.env.CONTRIBUTION_REVIEWER_EMAILS;
  });

  const app = createApp();
  const server = app.listen(0);
  t.after(() => server.close());
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  const authorA = await createAuthHeaders(base, "contrib-a");
  const authorB = await createAuthHeaders(base, "contrib-b");

  const createARes = await fetch(`${base}/api/community/contribute`, {
    method: "POST",
    headers: authorA,
    body: JSON.stringify({
      language: "spanish",
      category: "essentials",
      prompt: "How do you say hello?",
      correctAnswer: "Hola",
      hints: ["Greeting"],
      difficulty: "a1",
      exerciseType: "flashcard"
    })
  });
  assert.equal(createARes.status, 201);

  const createBRes = await fetch(`${base}/api/community/contribute`, {
    method: "POST",
    headers: authorB,
    body: JSON.stringify({
      language: "spanish",
      category: "travel",
      prompt: "How do you ask for the station?",
      correctAnswer: "Donde esta la estacion?",
      hints: ["Travel"],
      difficulty: "a2",
      exerciseType: "build_sentence"
    })
  });
  assert.equal(createBRes.status, 201);

  const listRes = await fetch(`${base}/api/community/contributions`, {
    headers: authorA
  });
  assert.equal(listRes.status, 200);
  const listed = await listRes.json();
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
  t.after(() => {
    delete process.env.CONTRIBUTION_REVIEWER_EMAILS;
  });

  const app = createApp();
  const server = app.listen(0);
  t.after(() => server.close());
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  const reviewer = await createAuthHeadersForEmail(base, reviewerEmail, "Reviewer");
  const contributor = await createAuthHeaders(base, "moderated-user");

  const createRes = await fetch(`${base}/api/community/contribute`, {
    method: "POST",
    headers: contributor,
    body: JSON.stringify({
      language: "spanish",
      category: "essentials",
      prompt: "How do you say thank you?",
      correctAnswer: "Gracias",
      hints: ["Polite phrase"],
      difficulty: "a1",
      exerciseType: "flashcard"
    })
  });
  assert.equal(createRes.status, 201);
  const created = await createRes.json();
  assert.equal(created.submission.moderationStatus, "pending");

  const meRes = await fetch(`${base}/api/auth/me`, { headers: reviewer });
  assert.equal(meRes.status, 200);
  const mePayload = await meRes.json();
  assert.equal(mePayload.user.canModerateCommunityExercises, true);

  const listAllRes = await fetch(`${base}/api/community/contributions?scope=all&status=pending`, {
    headers: reviewer
  });
  assert.equal(listAllRes.status, 200);
  const listed = await listAllRes.json();
  assert.equal(listed.canModerate, true);
  assert.equal(listed.scope, "all");
  assert.ok(listed.submissions.some((submission) => submission.id === created.submission.id));

  const updateRes = await fetch(`${base}/api/community/contributions/${created.submission.id}`, {
    method: "PATCH",
    headers: reviewer,
    body: JSON.stringify({ moderationStatus: "approved" })
  });
  assert.equal(updateRes.status, 200);
  const updated = await updateRes.json();
  assert.equal(updated.submission.moderationStatus, "approved");

  const approvedRes = await fetch(`${base}/api/community/contributions?scope=all&status=approved`, {
    headers: reviewer
  });
  assert.equal(approvedRes.status, 200);
  const approved = await approvedRes.json();
  assert.ok(approved.submissions.some((submission) => submission.id === created.submission.id));
});

test("non-reviewers cannot update community contribution moderation status", async (t) => {
  const reviewerEmail = `reviewer-${Date.now()}-forbidden@example.com`;
  process.env.CONTRIBUTION_REVIEWER_EMAILS = reviewerEmail;
  t.after(() => {
    delete process.env.CONTRIBUTION_REVIEWER_EMAILS;
  });

  const app = createApp();
  const server = app.listen(0);
  t.after(() => server.close());
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  const reviewer = await createAuthHeadersForEmail(base, reviewerEmail, "Reviewer");
  const contributor = await createAuthHeaders(base, "contributor");
  const nonReviewer = await createAuthHeaders(base, "non-reviewer");

  const createRes = await fetch(`${base}/api/community/contribute`, {
    method: "POST",
    headers: contributor,
    body: JSON.stringify({
      language: "spanish",
      category: "conversation",
      prompt: "How do you say good night?",
      correctAnswer: "Buenas noches",
      difficulty: "a1",
      exerciseType: "flashcard"
    })
  });
  assert.equal(createRes.status, 201);
  const created = await createRes.json();

  const forbiddenRes = await fetch(`${base}/api/community/contributions/${created.submission.id}`, {
    method: "PATCH",
    headers: nonReviewer,
    body: JSON.stringify({ moderationStatus: "rejected" })
  });
  assert.equal(forbiddenRes.status, 403);

  const pendingRes = await fetch(`${base}/api/community/contributions?scope=all&status=pending`, {
    headers: reviewer
  });
  assert.equal(pendingRes.status, 200);
  const pending = await pendingRes.json();
  const target = pending.submissions.find((submission) => submission.id === created.submission.id);
  assert.ok(target);
  assert.equal(target.moderationStatus, "pending");
});
