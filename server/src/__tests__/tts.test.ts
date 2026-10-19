import type { } from "node"; // ensure file is treated as a module

const test = require("node:test");
const assert = require("node:assert/strict");
const { configureTestDb, initTestDb } = require("./helpers/testDb.ts");
configureTestDb(__filename);

// Route modules read these when the app is built, so they must be set before index.ts loads.
process.env.TTS_CACHE_BUCKET = "test-tts-bucket";
process.env.TTS_VOICES = "ru-RU=Charon";
process.env.GEMINI_API_KEY = "test-gemini-key";
process.env.TTS_DAILY_GENERATION_LIMIT = "12";

test.before(async () => {
  await initTestDb();
});

const { createApp } = require("../index.ts");
const { GoogleAuth } = require("google-auth-library");

// ─── Google API stubs ─────────────────────────────────────────────────────────

const google = {
  synthesizeBodies: [] as any[],
  apiKeys: [] as string[],
  synthesizeStatus: 200,
  stored: new Map<string, Buffer>()
};

GoogleAuth.prototype.getAccessToken = async function () {
  return "test-access-token";
};

// The text a stub clip was made from, read back from its WAV body.
function clipText(body: Buffer): string {
  return body.subarray(44).toString();
}

const realFetch = globalThis.fetch;
globalThis.fetch = async (input: any, init?: any) => {
  const url = String(input?.url ?? input);
  if (url === "https://generativelanguage.googleapis.com/v1beta/interactions") {
    const body = JSON.parse(String(init.body));
    google.synthesizeBodies.push(body);
    google.apiKeys.push(init.headers["x-goog-api-key"]);
    if (google.synthesizeStatus !== 200) return new Response("nope", { status: google.synthesizeStatus });
    const text = body.input[0].content[0].text;
    const pcm = Buffer.from(`${body.generation_config.speech_config[0].voice}:${text}`).toString("base64");
    return new Response(JSON.stringify({
      steps: [{ type: "model_output", content: [{ type: "audio", mime_type: "audio/l16;rate=24000", data: pcm }] }]
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }
  if (url.startsWith("https://storage.googleapis.com/upload/")) {
    const name = decodeURIComponent(new URL(url).searchParams.get("name") || "");
    google.stored.set(name, Buffer.from(init.body));
    return new Response("{}", { status: 200 });
  }
  if (url.startsWith("https://storage.googleapis.com/")) {
    const name = decodeURIComponent(url.split("/o/")[1].split("?")[0]);
    const clip = google.stored.get(name);
    return clip ? new Response(clip, { status: 200 }) : new Response("not found", { status: 404 });
  }
  return realFetch(input, init);
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function startServer() {
  const app = await createApp();
  const server = app.listen(0);
  const { port } = server.address() as { port: number };
  return { base: `http://127.0.0.1:${port}`, close: () => server.close() };
}

async function signUp(base: string, label: string) {
  const email = `${label}-${Date.now()}@example.com`;
  const registered = await (await fetch(`${base}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "Password123!", displayName: label })
  })).json() as any;
  await fetch(`${base}/api/auth/verify-email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: registered.verificationToken })
  });
  const logged = await (await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "Password123!" })
  })).json() as any;
  return { Authorization: `Bearer ${logged.token}` };
}

function ttsUrl(base: string, text: string, lang = "ru-RU") {
  return `${base}/api/tts?lang=${encodeURIComponent(lang)}&text=${encodeURIComponent(text)}`;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test("requires sign-in", async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());

  const res = await fetch(ttsUrl(srv.base, "Привет"));
  assert.equal(res.status, 401);
});

test("generates once, then serves the cached clip", async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());
  const headers = await signUp(srv.base, "tts-cache");
  google.synthesizeBodies.length = 0;

  const first = await fetch(ttsUrl(srv.base, "  Я   изучаю русский язык. "), { headers });
  assert.equal(first.status, 200);
  assert.equal(first.headers.get("content-type"), "audio/wav");
  assert.match(String(first.headers.get("cache-control")), /immutable/);
  const body = Buffer.from(await first.arrayBuffer());
  assert.equal(body.toString("ascii", 0, 4), "RIFF");
  assert.equal(clipText(body), "Charon:Я изучаю русский язык.");
  assert.equal(google.synthesizeBodies[0].model, "gemini-3.8-flash-lite-tts");
  assert.equal(google.apiKeys[0], "test-gemini-key");
  assert.equal(google.stored.size >= 1, true);

  const second = await fetch(ttsUrl(srv.base, "Я изучаю русский язык."), { headers });
  assert.equal(second.status, 200);
  assert.equal(google.synthesizeBodies.length, 1);
});

test("a new instance reads clips from Cloud Storage instead of generating them", async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());
  const headers = await signUp(srv.base, "tts-bucket");
  google.synthesizeBodies.length = 0;

  await fetch(ttsUrl(srv.base, "Доброе утро"), { headers });
  assert.equal(google.synthesizeBodies.length, 1);

  // A second app has an empty memory cache, as after a Cloud Run cold start.
  const other = await startServer();
  t.after(() => other.close());
  const res = await fetch(ttsUrl(other.base, "Доброе утро"), { headers });
  assert.equal(res.status, 200);
  assert.equal(google.synthesizeBodies.length, 1);
});

test("rejects unsupported languages and oversized text", async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());
  const headers = await signUp(srv.base, "tts-validate");

  assert.equal((await fetch(ttsUrl(srv.base, "Hej", "xx-XX"), { headers })).status, 400);
  assert.equal((await fetch(ttsUrl(srv.base, "a".repeat(501)), { headers })).status, 400);
  assert.equal((await fetch(ttsUrl(srv.base, "   "), { headers })).status, 400);
});

test("answers 502 when generation fails and pauses after a rate limit", async (t) => {
  const srv = await startServer();
  t.after(() => {
    google.synthesizeStatus = 200;
    srv.close();
  });
  const headers = await signUp(srv.base, "tts-errors");

  google.synthesizeStatus = 400;
  assert.equal((await fetch(ttsUrl(srv.base, "Плохой запрос"), { headers })).status, 502);

  google.synthesizeStatus = 429;
  const limited = await fetch(ttsUrl(srv.base, "Слишком много"), { headers });
  assert.equal(limited.status, 503);
  assert.equal((await limited.json() as any).code, "TTS_BUSY");

  // During the pause, requests fail fast without calling Gemini.
  google.synthesizeStatus = 200;
  const calls = google.synthesizeBodies.length;
  assert.equal((await fetch(ttsUrl(srv.base, "Подождите"), { headers })).status, 503);
  assert.equal(google.synthesizeBodies.length, calls);
});

test("stops generating new clips at the daily limit but still serves cached ones", async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());
  const headers = await signUp(srv.base, "tts-budget");

  const statuses = [];
  for (let i = 0; i < 13; i += 1) {
    statuses.push((await fetch(ttsUrl(srv.base, `Фраза номер ${i}`), { headers })).status);
  }
  assert.deepEqual(statuses.slice(0, 12), Array(12).fill(200));
  assert.equal(statuses[12], 503);
  assert.equal((await fetch(ttsUrl(srv.base, "Фраза номер 0"), { headers })).status, 200);
});

test("answers 503 without a Gemini API key", async (t) => {
  const key = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  const srv = await startServer();
  process.env.GEMINI_API_KEY = key;
  t.after(() => srv.close());
  const headers = await signUp(srv.base, "tts-nokey");

  const unavailable = await fetch(ttsUrl(srv.base, "Без ключа"), { headers });
  assert.equal(unavailable.status, 503);
  assert.equal((await unavailable.json() as any).code, "TTS_UNAVAILABLE");
});
