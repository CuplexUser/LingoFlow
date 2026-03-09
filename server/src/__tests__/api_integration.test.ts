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
  return { questionId: question.id, builtSentence: question.answer };
}

async function createAuthHeaders(base, label) {
  const email = `${label}-${Date.now()}@example.com`;
  const registerRes = await fetch(`${base}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      password: "Password123!",
      displayName: label
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
