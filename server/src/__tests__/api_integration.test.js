const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const fs = require("fs");

const testDbPath = path.join(__dirname, "..", "..", "data", "lingoflow.test.db");
process.env.LINGOFLOW_DB_PATH = testDbPath;
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}

const { createApp } = require("../index");

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

test("session start and complete happy path", async (t) => {
  const app = createApp();
  const server = app.listen(0);
  t.after(() => server.close());
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  const startRes = await fetch(`${base}/api/session/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
    headers: { "Content-Type": "application/json" },
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
    headers: { "Content-Type": "application/json" },
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

  const startRes = await fetch(`${base}/api/session/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      language: "spanish",
      category: "travel",
      count: 6
    })
  });
  const session = await startRes.json();

  const invalid = await fetch(`${base}/api/session/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
  const authA = { Authorization: `Bearer ${accountA.token}`, "Content-Type": "application/json" };

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
  const authB = { Authorization: `Bearer ${accountB.token}`, "Content-Type": "application/json" };

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
