import type { } from "node"; // ensure file is treated as a module

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const testDbPath = path.join(
  __dirname, "..", "..", "data",
  `lingoflow.${path.basename(__filename, path.extname(__filename))}.${process.pid}.${Date.now()}.test.db`
);
process.env.LINGOFLOW_DB_PATH = testDbPath;
process.env.NODE_ENV = "test";

const { createApp } = require("../index.ts");
const database = require("../db.ts");

interface AuthHeaders {
  email: string;
  Authorization: string;
  "Content-Type": string;
}

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

async function createAuthHeaders(base: string, label: string): Promise<AuthHeaders> {
  const email = `${label}-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;
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
  const logged = await loginRes.json() as any;
  return { email, Authorization: `Bearer ${logged.token}`, "Content-Type": "application/json" };
}

test("GET /api/stories lists stories and supports filtering", async (t) => {
  const srv = new TestServer();
  t.after(() => srv.close());
  const headers = await createAuthHeaders(srv.base, "story-list");

  const allRes = await fetch(`${srv.base}/api/stories`, { headers });
  assert.equal(allRes.status, 200);
  const all = await allRes.json() as any[];
  assert.ok(all.length >= 3);
  assert.ok(all.every((story) => typeof story.id === "string" && typeof story.title === "string"));
  // Summaries must not leak the full glossary/sentence payload
  assert.equal(all[0].glossary, undefined);

  const ruRes = await fetch(`${srv.base}/api/stories?language=russian&level=a1`, { headers });
  const ru = await ruRes.json() as any[];
  assert.ok(ru.length >= 1);
  assert.ok(ru.every((story) => story.language === "russian" && story.level === "a1"));
});

test("GET /api/stories/:id returns the full story and 404s for unknown ids", async (t) => {
  const srv = new TestServer();
  t.after(() => srv.close());
  const headers = await createAuthHeaders(srv.base, "story-fetch");

  const res = await fetch(`${srv.base}/api/stories/ru-story-a1-day`, { headers });
  assert.equal(res.status, 200);
  const story = await res.json() as any;
  assert.equal(story.id, "ru-story-a1-day");
  assert.ok(Array.isArray(story.sentences) && story.sentences.length > 0);
  assert.ok(story.sentences[0].target && story.sentences[0].en);
  assert.ok(story.glossary["городе"]);
  assert.ok(story.culturalNote.term && story.culturalNote.body);

  const missing = await fetch(`${srv.base}/api/stories/does-not-exist`, { headers });
  assert.equal(missing.status, 404);
});

test("story endpoints require authentication", async (t) => {
  const srv = new TestServer();
  t.after(() => srv.close());
  const res = await fetch(`${srv.base}/api/stories`);
  assert.equal(res.status, 401);
});

test("POST /api/saved-words is idempotent and creates a single SRS item", async (t) => {
  const srv = new TestServer();
  t.after(() => srv.close());
  const headers = await createAuthHeaders(srv.base, "saved-words");
  const userId = database.getUserByEmail(headers.email).id;

  const payload = {
    language: "russian",
    word: "Москве",
    translation: "Moscow",
    storyId: "ru-story-a1-day",
    category: "essentials"
  };

  const first = await fetch(`${srv.base}/api/saved-words`, {
    method: "POST", headers, body: JSON.stringify(payload)
  });
  assert.equal(first.status, 200);

  // Re-saving the same word (any casing) must not duplicate or reset scheduling.
  const second = await fetch(`${srv.base}/api/saved-words`, {
    method: "POST", headers, body: JSON.stringify({ ...payload, word: "москве" })
  });
  assert.equal(second.status, 200);

  const listRes = await fetch(`${srv.base}/api/saved-words?language=russian`, { headers });
  const list = await listRes.json() as any[];
  const matches = list.filter((entry) => entry.word === "москве");
  assert.equal(matches.length, 1, "word should be stored exactly once");
  assert.equal(matches[0].translation, "Moscow");

  // A single item_progress row should back the saved word (idempotent re-save).
  const poolItems = database.getSavedWordPoolItems(userId, "russian");
  assert.equal(
    poolItems.filter((item: any) => item.id === "saved-word:москве").length,
    1,
    "exactly one SRS-backed pool item should exist"
  );

  // Removing the word clears it.
  const del = await fetch(`${srv.base}/api/saved-words/${encodeURIComponent("москве")}?language=russian`, {
    method: "DELETE", headers
  });
  assert.equal(del.status, 200);
  const afterRes = await fetch(`${srv.base}/api/saved-words?language=russian`, { headers });
  const after = await afterRes.json() as any[];
  assert.equal(after.filter((entry) => entry.word === "москве").length, 0);
});

test("POST /api/stories/:id/complete marks a story completed, per user and idempotently", async (t) => {
  const srv = new TestServer();
  t.after(() => srv.close());
  const headers = await createAuthHeaders(srv.base, "story-complete");

  const before = await (await fetch(`${srv.base}/api/stories?language=russian`, { headers })).json() as any[];
  const target = before.find((story) => story.id === "ru-story-a1-day");
  assert.ok(target, "story summary is present");
  assert.equal(target.completed, false, "fresh user has not completed the story");

  const done = await fetch(`${srv.base}/api/stories/ru-story-a1-day/complete`, { method: "POST", headers });
  assert.equal(done.status, 200);
  // Re-completing the same story must stay a single, stable record.
  const again = await fetch(`${srv.base}/api/stories/ru-story-a1-day/complete`, { method: "POST", headers });
  assert.equal(again.status, 200);

  const after = await (await fetch(`${srv.base}/api/stories?language=russian`, { headers })).json() as any[];
  assert.equal(after.find((story) => story.id === "ru-story-a1-day").completed, true);
  // A different story remains unread.
  assert.equal(after.find((story) => story.id === "ru-story-a2-market").completed, false);

  // Completion is per-user: a second learner still sees it as unread.
  const other = await createAuthHeaders(srv.base, "story-complete-other");
  const otherList = await (await fetch(`${srv.base}/api/stories?language=russian`, { headers: other })).json() as any[];
  assert.equal(otherList.find((story) => story.id === "ru-story-a1-day").completed, false);

  // Unknown ids 404 rather than recording a phantom completion.
  const missing = await fetch(`${srv.base}/api/stories/does-not-exist/complete`, { method: "POST", headers });
  assert.equal(missing.status, 404);
});

test("GET /api/admin/content-stats reports story coverage per language", async (t) => {
  const reviewerEmail = `stats-admin-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;
  const prevReviewers = process.env.CONTRIBUTION_REVIEWER_EMAILS;
  process.env.CONTRIBUTION_REVIEWER_EMAILS = reviewerEmail;
  const srv = new TestServer();
  t.after(() => {
    srv.close();
    if (prevReviewers === undefined) delete process.env.CONTRIBUTION_REVIEWER_EMAILS;
    else process.env.CONTRIBUTION_REVIEWER_EMAILS = prevReviewers;
  });

  await fetch(`${srv.base}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: reviewerEmail, password: "Password123!", displayName: "stats-admin" })
  }).then((r) => r.json()).then((registered: any) =>
    fetch(`${srv.base}/api/auth/verify-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: registered.verificationToken })
    })
  );
  const logged = await fetch(`${srv.base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: reviewerEmail, password: "Password123!" })
  }).then((r) => r.json()) as any;
  const headers = { Authorization: `Bearer ${logged.token}`, "Content-Type": "application/json" };

  const res = await fetch(`${srv.base}/api/admin/content-stats`, { headers });
  assert.equal(res.status, 200);
  const data = await res.json() as any;

  assert.ok(data.stories, "response includes a stories coverage map");
  const ru = data.stories.russian;
  assert.ok(ru, "russian story coverage is present");
  assert.equal(ru.total, 6, "six Russian stories are seeded");
  assert.equal(ru.a1, 2);
  assert.equal(ru.a2, 2);
  assert.equal(ru.b1, 2);
  assert.ok(ru.sentences >= 3, "sentence totals are aggregated");
  // Every language listed in coverage should have a stories entry (even if empty).
  for (const lang of data.languages) {
    assert.ok(data.stories[lang.id], `stories entry exists for ${lang.id}`);
  }
});

test("saved words surface as items in the practice pool", async (t) => {
  const srv = new TestServer();
  t.after(() => srv.close());
  const headers = await createAuthHeaders(srv.base, "saved-pool");
  const userId = database.getUserByEmail(headers.email).id;

  await fetch(`${srv.base}/api/saved-words`, {
    method: "POST", headers,
    body: JSON.stringify({ language: "russian", word: "город", translation: "city", storyId: "ru-story-a1-day" })
  });

  const poolItems = database.getSavedWordPoolItems(userId, "russian");
  const match = poolItems.find((item: any) => item.correctAnswer === "город");
  assert.ok(match, "saved word should appear in the practice pool");
  assert.equal(match.prompt, "city");
  assert.equal(match.id, "saved-word:город");
});
