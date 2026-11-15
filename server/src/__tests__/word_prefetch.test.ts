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
const { collectCourseWords, STORIES } = require("../data.ts");

// ─── LibreTranslate stub ──────────────────────────────────────────────────────

const lt = {
  translateCalls: 0,
  failNext: 0,
  wordsSeen: [] as string[],
  // When set, /translate waits for it, like a service still starting.
  gate: null as Promise<void> | null
};

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
    if (lt.gate) await lt.gate;
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
  return { app, base, headers: { Authorization: `Bearer ${logged.body.token}` } };
}

function lookup(base: string, headers: Record<string, string>, lang: string, words: string[]) {
  const params = new URLSearchParams({ lang, words: words.join(",") });
  return request(base, "GET", `/api/dictionary/batch?${params}`, headers);
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

  // The words LibreTranslate couldn't translate are recorded as misses, so a second run
  // sends nothing.
  const counts = await request(base, "GET", "/api/admin/word-translations/counts", headers);
  assert.equal(counts.body.misses, missing.length - translated);
  assert.equal(counts.body.total, counts.body.libretranslate + counts.body.content);
  lt.wordsSeen = [];
  const callsBefore = lt.translateCalls;
  let again: any = null;
  for (let againCursor = 0, round = 0; round < 100; round += 1) {
    again = await request(base, "POST", "/api/admin/word-translations/prefetch", headers, {
      language: "russian",
      cursor: againCursor
    });
    assert.equal(again.body.checked, 0);
    againCursor = again.body.cursor;
    if (again.body.done) break;
  }
  assert.equal(again.body.remaining, 0);
  // An empty chunk never reaches the service.
  assert.equal(lt.translateCalls, callsBefore);
  assert.deepEqual(lt.wordsSeen, []);
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

test("seeds story glossaries as content, and collects their words", async (t) => {
  await start(t);
  const glossaryWords = new Set<string>();
  for (const story of STORIES) {
    if (story.language !== "russian") continue;
    for (const word of Object.keys(story.glossary)) if (!/\s/.test(word)) glossaryWords.add(word);
  }
  assert.ok(glossaryWords.has("меня"));
  const cached = await database.getCachedWordTranslations("russian", ["меня", "что"]);
  assert.ok(cached["меня"] && cached["что"], "story glossary words are cached at startup");

  // A glossary word that also appears in a story sentence is collected for pre-translation.
  const collected = new Set(collectCourseWords("russian"));
  assert.ok(collected.has("меня"));
  assert.ok([...collected].every((word) => /\p{Script=Cyrillic}/u.test(word)));
});

test("answers word lookups from the cache and looks up the rest in the background", async (t) => {
  const { app, base, headers } = await start(t);
  await database.upsertWordTranslation("russian", "кэшслово", "cached word", "libretranslate");

  // Hold LibreTranslate's answer, like a cold start: the response must not wait for it.
  let release!: () => void;
  lt.gate = new Promise((resolve) => { release = resolve; });
  lt.wordsSeen = [];
  try {
    const first = await lookup(base, headers, "russian", [
      "кэшслово",
      "новоеслово",
      "studying",
      "(i",
      "русский"
    ]);
    assert.equal(first.status, 200);
    assert.equal(first.body.translations["кэшслово"], "cached word");
    assert.equal("новоеслово" in first.body.translations, false);

    // The same words requested again while the lookup is running aren't sent twice.
    const second = await lookup(base, headers, "russian", ["новоеслово"]);
    assert.deepEqual(second.body.translations, {});
  } finally {
    release();
    lt.gate = null;
  }
  await app.locals.whenWordLookupsIdle();

  // One request, Cyrillic words only: English from a cloze translation never goes out.
  assert.deepEqual(lt.wordsSeen, ["новоеслово"]);
  const third = await lookup(base, headers, "russian", ["новоеслово"]);
  assert.equal(third.body.translations["новоеслово"], "gloss 10");
});

test("skips words LibreTranslate couldn't translate, but retries failed lookups", async (t) => {
  const { app, base, headers } = await start(t);

  // Five-letter words come back unchanged: a miss, which is not sent again.
  lt.wordsSeen = [];
  const miss = await lookup(base, headers, "russian", ["бзздх"]);
  assert.deepEqual(miss.body.translations, {});
  await app.locals.whenWordLookupsIdle();
  assert.deepEqual(lt.wordsSeen, ["бзздх"]);
  assert.ok((await database.getRecentWordTranslationMisses("russian", ["бзздх"])).has("бзздх"));

  lt.wordsSeen = [];
  const again = await lookup(base, headers, "russian", ["бзздх"]);
  assert.deepEqual(again.body.translations, {});
  await app.locals.whenWordLookupsIdle();
  assert.deepEqual(lt.wordsSeen, []);

  // A failed request records nothing, so the word is tried the next time.
  lt.failNext = 1;
  await lookup(base, headers, "russian", ["сбойслово"]);
  await app.locals.whenWordLookupsIdle();
  assert.equal((await database.getRecentWordTranslationMisses("russian", ["сбойслово"])).size, 0);
  lt.wordsSeen = [];
  await lookup(base, headers, "russian", ["сбойслово"]);
  await app.locals.whenWordLookupsIdle();
  assert.deepEqual(lt.wordsSeen, ["сбойслово"]);
  assert.equal(
    (await database.getCachedWordTranslations("russian", ["сбойслово"]))["сбойслово"],
    "gloss 9"
  );
});

test("misses expire after a week and are never served as translations", async () => {
  const now = Date.parse("2026-11-15T12:00:00Z");
  await database.recordWordTranslationMisses("spanish", ["zzzzz", "yyyyy"], now);
  assert.deepEqual(
    [...(await database.getRecentWordTranslationMisses("spanish", ["zzzzz", "yyyyy", "xxxxx"], now))].sort(),
    ["yyyyy", "zzzzz"]
  );
  assert.deepEqual(await database.getCachedWordTranslations("spanish", ["zzzzz"]), {});

  const later = now + database.WORD_MISS_TTL_MS + 1000;
  assert.equal((await database.getRecentWordTranslationMisses("spanish", null, later)).has("zzzzz"), false);

  // Recording a miss prunes expired ones.
  await database.recordWordTranslationMisses("spanish", ["wwwww"], later);
  assert.deepEqual(
    [...(await database.getRecentWordTranslationMisses("spanish", null, now))].sort(),
    ["wwwww"]
  );
});

test("the rebuild re-seeds content and keeps LibreTranslate rows; clearing everything is separate", async (t) => {
  const { base, headers } = await start(t);
  await database.upsertWordTranslation("russian", "тестовое", "test", "libretranslate");
  await database.recordWordTranslationMisses("russian", ["пропуск"]);
  const before = await request(base, "GET", "/api/admin/word-translations/counts", headers);
  assert.ok(before.body.libretranslate > 0);
  assert.ok(before.body.misses > 0);

  const rebuilt = await request(base, "POST", "/api/admin/word-translations/rebuild", headers);
  assert.equal(rebuilt.status, 200);
  assert.equal(rebuilt.body.scope, "content");
  assert.equal(typeof rebuilt.body.rebuilt, "number");
  assert.ok(rebuilt.body.rebuilt > 0);
  const kept = await request(base, "GET", "/api/admin/word-translations/counts", headers);
  assert.equal(kept.body.libretranslate, before.body.libretranslate);
  assert.equal(kept.body.misses, before.body.misses);
  assert.equal(kept.body.content, before.body.content);
  assert.equal(
    (await database.getCachedWordTranslations("russian", ["тестовое"]))["тестовое"],
    "test"
  );

  const cleared = await request(base, "POST", "/api/admin/word-translations/rebuild", headers, {
    scope: "all"
  });
  assert.equal(cleared.status, 200);
  assert.equal(cleared.body.scope, "all");
  const counts = await request(base, "GET", "/api/admin/word-translations/counts", headers);
  assert.equal(counts.body.libretranslate, 0);
  assert.equal(counts.body.misses, 0);
  assert.ok(counts.body.content > 0);
});
