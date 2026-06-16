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

interface Bookmark {
  questionId: string;
  prompt: string;
  answer: string;
  language: string;
  category?: string;
}

interface Language {
  id: string;
  label: string;
  flag?: string;
}

interface CourseCategory {
  id: string;
  unlocked: boolean;
  mastery: number;
  attempts: number;
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

// Token service used only for edge-case token tests (wrong secret, expired TTL)
const expiredTokenService = createTokenService({
  authSecret: process.env.LINGOFLOW_AUTH_SECRET || "lingoflow-dev-secret-change-me",
  tokenTtlSeconds: -10,
  googleStateTtlSeconds: 10 * 60
});

// ─── Auth helper ──────────────────────────────────────────────────────────────

async function createAuthHeaders(base: string, label: string): Promise<AuthHeaders> {
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

  return { email, Authorization: `Bearer ${logged.token}`, "Content-Type": "application/json" };
}

// ─── Auth route validation ────────────────────────────────────────────────────

test("register rejects missing email", async (t) => {
  const srv = new TestServer();
  t.after(() => srv.close());

  const res = await fetch(`${srv.base}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: "Password123!", displayName: "NoEmail" })
  });
  assert.equal(res.status, 400);
  const body = await res.json() as any;
  assert.ok(body.error);
});

test("register rejects invalid email format", async (t) => {
  const srv = new TestServer();
  t.after(() => srv.close());

  const res = await fetch(`${srv.base}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "notanemail", password: "Password123!", displayName: "Bad" })
  });
  assert.equal(res.status, 400);
  assert.ok((await res.json() as any).error);
});

test("register rejects short password", async (t) => {
  const srv = new TestServer();
  t.after(() => srv.close());

  const res = await fetch(`${srv.base}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "ok@example.com", password: "short", displayName: "Short" })
  });
  assert.equal(res.status, 400);
  assert.ok((await res.json() as any).error);
});

test("register rejects duplicate email with 409", async (t) => {
  const srv = new TestServer();
  t.after(() => srv.close());

  const email = `dup-${Date.now()}@example.com`;
  const payload = { email, password: "Password123!", displayName: "Dup" };

  const first = await fetch(`${srv.base}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  assert.equal(first.status, 201);

  const second = await fetch(`${srv.base}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  assert.equal(second.status, 409);
  assert.ok((await second.json() as any).error);
});

test("login rejects missing fields with 400", async (t) => {
  const srv = new TestServer();
  t.after(() => srv.close());

  const res = await fetch(`${srv.base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "someone@example.com" })
  });
  assert.equal(res.status, 400);
});

test("login rejects wrong password with 401", async (t) => {
  const srv = new TestServer();
  t.after(() => srv.close());

  const email = `wrongpw-${Date.now()}@example.com`;
  const registerRes = await fetch(`${srv.base}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "Password123!", displayName: "WrongPw" })
  });
  assert.equal(registerRes.status, 201);
  const registered = await registerRes.json() as any;

  await fetch(`${srv.base}/api/auth/verify-email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: registered.verificationToken })
  });

  const loginRes = await fetch(`${srv.base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "WrongPassword!" })
  });
  assert.equal(loginRes.status, 401);
  assert.ok((await loginRes.json() as any).error);
});

test("GET /api/auth/me returns user for authenticated request", async (t) => {
  const srv = new TestServer();
  t.after(() => srv.close());
  const authHeaders = await createAuthHeaders(srv.base, "me-check");

  const res = await fetch(`${srv.base}/api/auth/me`, { headers: authHeaders });
  assert.equal(res.status, 200);
  const body = await res.json() as any;
  assert.ok(body.user?.id);
  assert.equal(body.user.email, authHeaders.email);
  assert.equal(body.user.emailVerified, true);
});

test("GET /api/auth/me returns 401 without token", async (t) => {
  const srv = new TestServer();
  t.after(() => srv.close());

  assert.equal((await fetch(`${srv.base}/api/auth/me`)).status, 401);
});

// ─── Google OAuth redirects ───────────────────────────────────────────────────

test("GET /api/auth/google/start issues a redirect", async (t) => {
  const srv = new TestServer();
  t.after(() => srv.close());

  const res = await fetch(`${srv.base}/api/auth/google/start`, { redirect: "manual" });
  assert.equal(res.status, 302);
  assert.ok((res.headers.get("location") || "").length > 0, "Should redirect somewhere");
});

test("Google OAuth callback with user-denied error redirects with authError", async (t) => {
  const srv = new TestServer();
  t.after(() => srv.close());

  const res = await fetch(`${srv.base}/api/auth/google/callback?error=access_denied&state=dummy`, {
    redirect: "manual"
  });
  assert.equal(res.status, 302);
  const location = res.headers.get("location") || "";
  assert.ok(location.includes("authError"), `Expected authError in redirect: ${location}`);
});

test("Google OAuth callback with invalid state redirects with authError", async (t) => {
  const srv = new TestServer();
  t.after(() => srv.close());

  const res = await fetch(`${srv.base}/api/auth/google/callback?code=dummy&state=invalid-state`, {
    redirect: "manual"
  });
  assert.equal(res.status, 302);
  const location = res.headers.get("location") || "";
  assert.ok(location.includes("authError"), `Expected authError in redirect: ${location}`);
});

// ─── User routes ──────────────────────────────────────────────────────────────

test("GET /api/settings returns settings for authenticated user", async (t) => {
  const srv = new TestServer();
  t.after(() => srv.close());
  const authHeaders = await createAuthHeaders(srv.base, "settings-get");

  const res = await fetch(`${srv.base}/api/settings`, { headers: authHeaders });
  assert.equal(res.status, 200);
  const settings = await res.json() as Record<string, unknown>;
  assert.ok("nativeLanguage" in settings);
  assert.ok("targetLanguage" in settings);
  assert.ok("dailyGoal" in settings);
  assert.ok("learnerName" in settings);
});

test("GET /api/settings returns 401 without auth", async (t) => {
  const srv = new TestServer();
  t.after(() => srv.close());

  assert.equal((await fetch(`${srv.base}/api/settings`)).status, 401);
});

test("PUT /api/settings persists and returns updated settings", async (t) => {
  const srv = new TestServer();
  t.after(() => srv.close());
  const authHeaders = await createAuthHeaders(srv.base, "settings-put");

  const putRes = await fetch(`${srv.base}/api/settings`, {
    method: "PUT",
    headers: authHeaders,
    body: JSON.stringify({
      nativeLanguage: "english",
      targetLanguage: "italian",
      dailyGoal: 50,
      dailyMinutes: 30,
      weeklyGoalSessions: 7,
      selfRatedLevel: "b1",
      learnerName: "Tester",
      learnerBio: "I love testing",
      focusArea: "travel"
    })
  });
  assert.equal(putRes.status, 200);
  const saved = await putRes.json() as any;
  assert.equal(saved.targetLanguage, "italian");
  assert.equal(saved.dailyGoal, 50);
  assert.equal(saved.selfRatedLevel, "b1");
  assert.equal(saved.learnerName, "Tester");

  // Verify persistence with a subsequent GET
  const getRes = await fetch(`${srv.base}/api/settings`, { headers: authHeaders });
  assert.equal((await getRes.json() as any).targetLanguage, "italian");
});

test("GET /api/progress returns progress fields for given language", async (t) => {
  const srv = new TestServer();
  t.after(() => srv.close());
  const authHeaders = await createAuthHeaders(srv.base, "progress-get");

  const res = await fetch(`${srv.base}/api/progress?language=spanish`, { headers: authHeaders });
  assert.equal(res.status, 200);
  const progress = await res.json() as Record<string, unknown>;
  assert.ok("totalXp" in progress);
  assert.ok("todayXp" in progress);
  assert.ok("streak" in progress);
  assert.ok("learnerLevel" in progress);
  assert.ok(Array.isArray(progress.categories));
});

test("GET /api/progress-overview returns language list", async (t) => {
  const srv = new TestServer();
  t.after(() => srv.close());
  const authHeaders = await createAuthHeaders(srv.base, "overview-get");

  const res = await fetch(`${srv.base}/api/progress-overview`, { headers: authHeaders });
  assert.equal(res.status, 200);
  const overview = await res.json() as any;
  assert.ok(Array.isArray(overview.languages));
});

test("GET /api/stats returns stats for target language", async (t) => {
  const srv = new TestServer();
  t.after(() => srv.close());
  const authHeaders = await createAuthHeaders(srv.base, "stats-get");

  const res = await fetch(`${srv.base}/api/stats?language=spanish`, { headers: authHeaders });
  assert.equal(res.status, 200);
  assert.ok(typeof (await res.json()) === "object");
});

test("GET /api/stats returns 401 without auth", async (t) => {
  const srv = new TestServer();
  t.after(() => srv.close());

  assert.equal((await fetch(`${srv.base}/api/stats?language=spanish`)).status, 401);
});

// ─── Bookmark CRUD ────────────────────────────────────────────────────────────

test("bookmark CRUD: POST, GET, DELETE", async (t) => {
  const srv = new TestServer();
  t.after(() => srv.close());
  const authHeaders = await createAuthHeaders(srv.base, "bookmark-crud");

  // Empty list to start
  const emptyRes = await fetch(`${srv.base}/api/bookmarks?language=spanish`, { headers: authHeaders });
  assert.equal(emptyRes.status, 200);
  assert.equal((await emptyRes.json() as Bookmark[]).length, 0);

  const questionId = `test-q-${Date.now()}`;
  const bookmark: Bookmark = { questionId, prompt: "How do you say hello?", answer: "Hola", language: "spanish", category: "essentials" };

  // Add bookmark
  const addRes = await fetch(`${srv.base}/api/bookmarks`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify(bookmark)
  });
  assert.equal(addRes.status, 200);
  const added = await addRes.json() as any;
  assert.equal(added.ok, true);
  assert.equal(added.bookmarked, true);

  // Verify it appears in the list
  const listRes = await fetch(`${srv.base}/api/bookmarks?language=spanish`, { headers: authHeaders });
  assert.equal(listRes.status, 200);
  const listed = await listRes.json() as Bookmark[];
  const found = listed.find((b) => b.questionId === questionId);
  assert.ok(found, "Bookmark should appear in list after POST");
  assert.equal(found!.answer, "Hola");

  // Delete it
  const deleteRes = await fetch(`${srv.base}/api/bookmarks/${encodeURIComponent(questionId)}`, {
    method: "DELETE",
    headers: authHeaders
  });
  assert.equal(deleteRes.status, 200);
  const deleted = await deleteRes.json() as any;
  assert.equal(deleted.ok, true);
  assert.equal(deleted.bookmarked, false);

  // Confirm it's gone
  const afterDelete = await (await fetch(`${srv.base}/api/bookmarks?language=spanish`, { headers: authHeaders })).json() as Bookmark[];
  assert.ok(!afterDelete.find((b) => b.questionId === questionId));
});

test("POST /api/bookmarks rejects missing required fields", async (t) => {
  const srv = new TestServer();
  t.after(() => srv.close());
  const authHeaders = await createAuthHeaders(srv.base, "bookmark-validation");

  const res = await fetch(`${srv.base}/api/bookmarks`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ prompt: "Missing fields" })
  });
  assert.equal(res.status, 400);
  assert.ok((await res.json() as any).error);
});

test("bookmarks are scoped to the signed-in user", async (t) => {
  const srv = new TestServer();
  t.after(() => srv.close());
  const userA = await createAuthHeaders(srv.base, "bookmark-scope-a");
  const userB = await createAuthHeaders(srv.base, "bookmark-scope-b");

  const questionId = `scope-q-${Date.now()}`;
  await fetch(`${srv.base}/api/bookmarks`, {
    method: "POST",
    headers: userA,
    body: JSON.stringify({ questionId, prompt: "Test", answer: "Test", language: "spanish", category: "essentials" })
  });

  const listB = await (await fetch(`${srv.base}/api/bookmarks?language=spanish`, { headers: userB })).json() as Bookmark[];
  assert.ok(!listB.find((b) => b.questionId === questionId), "User B should not see User A's bookmarks");
});

// ─── Course routes ────────────────────────────────────────────────────────────

test("GET /api/languages returns array of language objects", async (t) => {
  const srv = new TestServer();
  t.after(() => srv.close());

  const res = await fetch(`${srv.base}/api/languages`);
  assert.equal(res.status, 200);
  const languages = await res.json() as Language[];
  assert.ok(Array.isArray(languages) && languages.length > 0);
  assert.ok("id" in languages[0]);
  assert.ok("label" in languages[0]);
});

test("GET /api/course returns enriched category list for authenticated user", async (t) => {
  const srv = new TestServer();
  t.after(() => srv.close());
  const authHeaders = await createAuthHeaders(srv.base, "course-get");

  const res = await fetch(`${srv.base}/api/course?language=spanish`, { headers: authHeaders });
  assert.equal(res.status, 200);
  const categories = await res.json() as CourseCategory[];
  assert.ok(Array.isArray(categories) && categories.length > 0);
  assert.ok("id" in categories[0]);
  assert.ok("unlocked" in categories[0]);
  assert.ok("mastery" in categories[0]);
  assert.ok("attempts" in categories[0]);
  assert.equal(categories[0].unlocked, true, "First category should always be unlocked");
});

test("GET /api/course returns 401 without auth", async (t) => {
  const srv = new TestServer();
  t.after(() => srv.close());

  assert.equal((await fetch(`${srv.base}/api/course?language=spanish`)).status, 401);
});

// ─── Token edge cases ─────────────────────────────────────────────────────────

test("malformed token returns 401 on protected route", async (t) => {
  const srv = new TestServer();
  t.after(() => srv.close());

  const res = await fetch(`${srv.base}/api/settings`, {
    headers: { Authorization: "Bearer this.is.not.a.valid.token" }
  });
  assert.equal(res.status, 401);
});

test("token with wrong signature returns 401 on protected route", async (t) => {
  const srv = new TestServer();
  t.after(() => srv.close());

  // Sign a token with a different secret than the server expects
  const wrongSecret = createTokenService({
    authSecret: "wrong-secret-totally-different",
    tokenTtlSeconds: 60 * 60 * 24,
    googleStateTtlSeconds: 10 * 60
  });
  const user = database.createUser({
    email: `wrong-sig-${Date.now()}@example.com`,
    passwordHash: "irrelevant",
    displayName: "WrongSig",
    authProvider: "local",
    emailVerified: true
  });
  const badToken = wrongSecret.createAuthToken(user.id);

  const res = await fetch(`${srv.base}/api/settings`, {
    headers: { Authorization: `Bearer ${badToken}` }
  });
  assert.equal(res.status, 401);
});

test("expired token returns 401 on protected route", async (t) => {
  const srv = new TestServer();
  t.after(() => srv.close());

  const user = database.createUser({
    email: `expired-${Date.now()}@example.com`,
    passwordHash: "irrelevant",
    displayName: "Expired",
    authProvider: "local",
    emailVerified: true
  });
  const expiredToken = expiredTokenService.createAuthToken(user.id);

  const res = await fetch(`${srv.base}/api/settings`, {
    headers: { Authorization: `Bearer ${expiredToken}` }
  });
  assert.equal(res.status, 401);
});

test("missing Authorization header returns 401 on all protected routes", async (t) => {
  const srv = new TestServer();
  t.after(() => srv.close());

  const protectedRoutes = ["/api/settings", "/api/progress", "/api/course", "/api/bookmarks", "/api/stats"];
  for (const endpoint of protectedRoutes) {
    const res = await fetch(`${srv.base}${endpoint}`);
    assert.equal(res.status, 401, `Expected 401 for ${endpoint} without auth`);
  }
});
