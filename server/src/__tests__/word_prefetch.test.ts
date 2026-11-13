import type { } from "node"; // ensure file is treated as a module

const test = require("node:test");
const assert = require("node:assert/strict");
const { configureTestDb, initTestDb } = require("./helpers/testDb.ts");
configureTestDb(__filename);

// Read when the app is built, so set before index.ts loads.
const LT_URL = "https://lt.test";
const ADMIN_EMAIL = `prefetch-admin-${Date.now()}@example.com`;
process.env.LIBRETRANSLATE_URL = LT_URL;
process.env.CONTRIBUTION_REVIEWER_EMAILS = ADMIN_EMAIL;

test.before(async () => {
  await initTestDb();
});

const { createApp } = require("../index.ts");
const database = require("../db.ts");
const { collectCourseWords } = require("../data.ts");

// ─── LibreTranslate stub ──────────────────────────────────────────────────────

const lt = { translateCalls: 0, failNext: 0, wordsSeen: [] as string[] };

const realFetch = globalThis.fetch;
globalThis.fetch = async (input: any, init?: any) => {
  const url = String(input?.url ?? input);
  if (url === `${LT_URL}/languages`) {
    return Response.json([
      { code: "en", targets: ["es", "ru"] },
      { code: "ru", targets: ["en"] },
      { code: "es", targets: ["en"] }
    ]);
  }
  if (url === `${LT_URL}/translate`) {
    lt.translateCalls += 1;
    if (lt.failNext > 0) {
      lt.failNext -= 1;
      throw new Error("The operation was aborted due to timeout");
    }
    const body = JSON.parse(String(init.body));
    lt.wordsSeen.push(...body.q);
    // Words of five letters come back unchanged, which the cache rejects.
    return Response.json({
      translatedText: body.q.map((word: string) => (word.length === 5 ? word : `gloss ${word.length}`))
    });
  }
  return realFetch(input, init);
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function request(base: string, method: string, path: string, headers: Record<string, string>, body?: unknown) {
  const res = await realFetch(`${base}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { status: res.status, body: await res.json() as any };
}

async function start(t: any) {
  const app = await createApp();
  const server = app.listen(0);
  t.after(() => server.close());
  const { port } = server.address() as { port: number };
  const base = `http://127.0.0.1:${port}`;
  const registered = await request(base, "POST", "/api/auth/register", {}, {
    email: ADMIN_EMAIL,
    password: "Password123!",
    displayName: "Admin"
  });
  await request(base, "POST", "/api/auth/verify-email", {}, { token: registered.body.verificationToken });
  const logged = await request(base, "POST", "/api/auth/login", {}, { email: ADMIN_EMAIL, password: "Password123!" });
  return { base, headers: { Authorization: `Bearer ${logged.body.token}` } };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test("pre-translates a course's uncached words in chunks until done", async (t) => {
  const { base, headers } = await start(t);
  const words = collectCourseWords("russian");
  const cachedBefore = await database.listCachedWords("russian");
  const missing = words.filter((word: string) => !cachedBefore.has(word));
  assert.ok(missing.length > 100, "the Russian course should need more than one chunk");

  // A failed chunk answers 503, and the caller retries from the same cursor.
  lt.failNext = 1;
  const failed = await request(base, "POST", "/api/admin/word-translations/prefetch", headers, {
    language: "russian",
    cursor: 0
  });
  assert.equal(failed.status, 503);
  assert.equal(failed.body.code, "UNAVAILABLE");

  lt.wordsSeen = [];
  let cursor = 0;
  let translated = 0;
  let first: any = null;
  for (let round = 0; round < 100; round += 1) {
    const res = await request(base, "POST", "/api/admin/word-translations/prefetch", headers, {
      language: "russian",
      cursor
    });
    assert.equal(res.status, 200);
    first ??= res.body;
    assert.ok(res.body.checked <= 100);
    translated += res.body.translated;
    cursor = res.body.cursor;
    if (res.body.done) break;
  }
  assert.equal(cursor, words.length);
  assert.equal(first.total, words.length);
  assert.equal(first.remaining, missing.length - first.checked);
  // Only uncached words are sent, each once, and unchanged answers aren't cached.
  assert.deepEqual([...lt.wordsSeen].sort(), [...missing].sort());
  assert.ok(translated > 0 && translated < missing.length);
  const cachedAfter = await database.listCachedWords("russian");
  assert.equal(cachedAfter.size, cachedBefore.size + translated);

  // A second run only re-sends the words LibreTranslate couldn't translate.
  lt.wordsSeen = [];
  const again = await request(base, "POST", "/api/admin/word-translations/prefetch", headers, {
    language: "russian",
    cursor: 0
  });
  assert.equal(again.body.translated, 0);
  assert.equal(again.body.remaining + again.body.checked, missing.length - translated);
});

test("refuses courses the service has no model for, and non-admins", async (t) => {
  const { base, headers } = await start(t);
  const swedish = await request(base, "POST", "/api/admin/word-translations/prefetch", headers, {
    language: "swedish"
  });
  assert.equal(swedish.status, 400);
  assert.equal(swedish.body.code, "NO_MODEL");

  const english = await request(base, "POST", "/api/admin/word-translations/prefetch", headers, {
    language: "english"
  });
  assert.equal(english.status, 400);

  const anonymous = await request(base, "POST", "/api/admin/word-translations/prefetch", {}, {
    language: "russian"
  });
  assert.equal(anonymous.status, 401);
});

test("the rebuild answers once the table is re-seeded, with the count", async (t) => {
  const { base, headers } = await start(t);
  await database.upsertWordTranslation("russian", "тестовое", "test", "libretranslate");

  const rebuilt = await request(base, "POST", "/api/admin/word-translations/rebuild", headers);
  assert.equal(rebuilt.status, 200);
  assert.equal(typeof rebuilt.body.rebuilt, "number");
  assert.ok(rebuilt.body.rebuilt > 0);

  const counts = await request(base, "GET", "/api/admin/word-translations/counts", headers);
  assert.equal(counts.body.libretranslate, 0);
  assert.ok(counts.body.content > 0);
});
