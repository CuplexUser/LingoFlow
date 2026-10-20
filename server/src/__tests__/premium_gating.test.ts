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

const APP_HEADER = { "X-LingoFlow-Client": "android" };

async function startServer() {
  const app = await createApp();
  const server = app.listen(0);
  const { port } = server.address() as { port: number };
  return { base: `http://127.0.0.1:${port}`, close: () => server.close() };
}

async function signUp(base: string, label: string) {
  const email = `${label}-${Date.now()}@example.com`;
  const registerRes = await fetch(`${base}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "Password123!", displayName: label })
  });
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
  return {
    userId: Number(logged.user.id),
    isPremium: Boolean(logged.user.isPremium),
    headers: { Authorization: `Bearer ${logged.token}`, "Content-Type": "application/json" }
  };
}

async function grantPremium(userId: number, expiresAt: string | null) {
  await database.upsertSubscription({
    userId,
    entitlement: "premium",
    productId: "lingoflow_premium:monthly",
    store: "play_store",
    expiresAt,
    willRenew: true
  });
}

async function getJson(base: string, path: string, headers: Record<string, string>) {
  const res = await fetch(`${base}${path}`, { headers });
  return { status: res.status, body: await res.json() as any };
}

async function postJson(base: string, path: string, headers: Record<string, string>, body: unknown) {
  const res = await fetch(`${base}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json() as any };
}

test("web requests are never capped", async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());
  const user = await signUp(srv.base, "web-free");

  const course = await getJson(srv.base, "/api/course?language=spanish", user.headers);
  assert.equal(course.status, 200);
  assert.ok(course.body.length > 0);
  for (const category of course.body) {
    assert.equal(category.levelCap, null);
    assert.deepEqual(category.premiumLevels, []);
    assert.notEqual(category.lockReason, "premium");
  }
});

test("free app users are capped at a1 for course and lessons", async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());
  const user = await signUp(srv.base, "app-free");
  const headers = { ...user.headers, ...APP_HEADER };
  assert.equal(user.isPremium, false);

  const course = await getJson(srv.base, "/api/course?language=spanish", headers);
  assert.equal(course.status, 200);
  assert.ok(course.body.every((category: any) => category.levelCap === "a1"));
  assert.ok(
    course.body.some((category: any) => category.premiumLevels.length > 0),
    "expected some content above a1 to be marked premium"
  );
  for (const category of course.body) {
    assert.ok(!category.premiumLevels.includes("a1"));
  }

  const first = course.body[0];
  const session = await postJson(srv.base, "/api/session/start", headers, {
    language: "spanish",
    category: first.id
  });
  assert.equal(session.status, 200);
  assert.equal(session.body.recommendedLevel, "a1");
});

test("the daily challenge stays free for app users", async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());
  const user = await signUp(srv.base, "app-daily");

  const daily = await postJson(srv.base, "/api/session/daily", { ...user.headers, ...APP_HEADER }, {
    language: "spanish"
  });
  assert.equal(daily.status, 200);
  assert.equal(daily.body.isDailyChallenge, true);
  assert.ok(daily.body.questions.length > 0);
});

test("an active subscription lifts the cap; an expired one does not", async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());
  const user = await signUp(srv.base, "app-premium");
  const headers = { ...user.headers, ...APP_HEADER };

  await grantPremium(user.userId, new Date(Date.now() - 60_000).toISOString());
  let me = await getJson(srv.base, "/api/auth/me", headers);
  assert.equal(me.body.user.isPremium, false);
  let course = await getJson(srv.base, "/api/course?language=spanish", headers);
  assert.ok(course.body.every((category: any) => category.levelCap === "a1"));

  await grantPremium(user.userId, new Date(Date.now() + 86_400_000).toISOString());
  me = await getJson(srv.base, "/api/auth/me", headers);
  assert.equal(me.body.user.isPremium, true);
  course = await getJson(srv.base, "/api/course?language=spanish", headers);
  for (const category of course.body) {
    assert.equal(category.levelCap, null);
    assert.deepEqual(category.premiumLevels, []);
  }
});

test("accounts in PREMIUM_ACCOUNT_EMAILS get Premium without a subscription", async (t) => {
  const srv = await startServer();
  t.after(() => {
    srv.close();
    delete process.env.PREMIUM_ACCOUNT_EMAILS;
  });
  const reviewer = await signUp(srv.base, "play-review");
  const other = await signUp(srv.base, "not-listed");
  const email = (await database.getUserById(reviewer.userId)).email;
  process.env.PREMIUM_ACCOUNT_EMAILS = ` someone@example.com; ${email.toUpperCase()} `;

  const me = await getJson(srv.base, "/api/auth/me", reviewer.headers);
  assert.equal(me.body.user.isPremium, true);
  const path = await getJson(srv.base, "/api/path?language=spanish", { ...reviewer.headers, ...APP_HEADER });
  assert.equal(path.status, 200);
  assert.equal(path.body.levelCap, null);

  // A restore confirms Premium even though the store has nothing (RevenueCat isn't set up here).
  const sync = await postJson(srv.base, "/api/billing/sync", reviewer.headers, {});
  assert.equal(sync.status, 200);
  assert.equal(sync.body.isPremium, true);

  const otherMe = await getJson(srv.base, "/api/auth/me", other.headers);
  assert.equal(otherMe.body.user.isPremium, false);
  const otherPath = await getJson(srv.base, "/api/path?language=spanish", { ...other.headers, ...APP_HEADER });
  assert.equal(otherPath.body.levelCap, "a1");
});

test("stories above a1 are locked for free app users only", async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());
  const user = await signUp(srv.base, "app-stories");
  const appHeaders = { ...user.headers, ...APP_HEADER };

  const list = await getJson(srv.base, "/api/stories", appHeaders);
  assert.equal(list.status, 200);
  const premiumStory = list.body.find((story: any) => story.level !== "a1");
  const freeStory = list.body.find((story: any) => story.level === "a1");
  if (freeStory) {
    assert.equal(freeStory.premiumLocked, false);
    assert.equal((await getJson(srv.base, `/api/stories/${freeStory.id}`, appHeaders)).status, 200);
  }
  if (!premiumStory) {
    t.skip("no story content above a1");
    return;
  }

  assert.equal(premiumStory.premiumLocked, true);
  const locked = await getJson(srv.base, `/api/stories/${premiumStory.id}`, appHeaders);
  assert.equal(locked.status, 402);
  assert.equal(locked.body.code, "premium_required");

  const web = await getJson(srv.base, `/api/stories/${premiumStory.id}`, user.headers);
  assert.equal(web.status, 200);
});
