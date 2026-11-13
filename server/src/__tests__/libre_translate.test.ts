import type { } from "node"; // ensure file is treated as a module

const test = require("node:test");
const assert = require("node:assert/strict");
const { createLibreTranslate } = require("../libreTranslate.ts");

const LANGUAGES = [
  { code: "en", targets: ["en", "es", "ru"] },
  { code: "es", targets: ["en", "es", "ru"] },
  { code: "ru", targets: ["en", "es", "ru"] }
];

// A stub LibreTranslate: records each request and translates by looking words up in a map.
function stubService(dictionary: Record<string, string>, options: { failTranslate?: boolean } = {}) {
  const calls: Array<{ url: string; headers: Record<string, string>; body?: any }> = [];
  const fetchImpl = async (input: string, init: any = {}) => {
    const headers = (init.headers || {}) as Record<string, string>;
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ url: input, headers, body });
    if (input.startsWith("http://metadata.google.internal/")) {
      return new Response(`token-${calls.length}`);
    }
    if (input.endsWith("/languages")) return Response.json(LANGUAGES);
    if (input.endsWith("/translate")) {
      if (options.failTranslate) throw new Error("The operation was aborted due to timeout");
      return Response.json({
        translatedText: body.q.map((word: string) => dictionary[word] ?? word)
      });
    }
    return new Response("not found", { status: 404 });
  };
  return { calls, fetchImpl };
}

test("translates a batch of words in one request and drops unusable results", async () => {
  const service = stubService({ casa: "House.", perro: "dog", hola: "!!" });
  const client = createLibreTranslate({
    url: "https://lt.example/",
    fetchImpl: service.fetchImpl,
    useIdToken: false
  });

  const result = await client.translateWords(["casa", "perro", "hola", "mesa"], "spanish");

  assert.deepEqual(result, { casa: "house", perro: "dog" });
  const translateCalls = service.calls.filter((call) => call.url.endsWith("/translate"));
  assert.equal(translateCalls.length, 1);
  assert.deepEqual(translateCalls[0].body.q, ["casa", "perro", "hola", "mesa"]);
  assert.equal(translateCalls[0].body.source, "es");
  assert.equal(translateCalls[0].body.target, "en");
  assert.equal("api_key" in translateCalls[0].body, false);
  assert.equal(translateCalls[0].url, "https://lt.example/translate");
});

test("skips languages the service has no model for, and caches the language list", async () => {
  const service = stubService({ casa: "house" });
  const client = createLibreTranslate({
    url: "https://lt.example",
    fetchImpl: service.fetchImpl,
    useIdToken: false
  });

  assert.deepEqual(await client.translateWords(["hus"], "swedish"), {});
  assert.deepEqual(await client.translateWords(["casa"], "spanish"), { casa: "house" });

  assert.equal(service.calls.filter((call) => call.url.endsWith("/languages")).length, 1);
  const translated = service.calls.filter((call) => call.url.endsWith("/translate"));
  assert.deepEqual(translated.map((call) => call.body.source), ["es"]);
});

test("attaches a cached Cloud Run ID token for the service's origin", async () => {
  const service = stubService({ dom: "house", kot: "cat" });
  const client = createLibreTranslate({
    url: "https://lt-abc.a.run.app",
    apiKey: "key-1",
    fetchImpl: service.fetchImpl,
    useIdToken: true
  });

  await client.translateWords(["dom"], "russian");
  await client.translateWords(["kot"], "russian");

  const metadataCalls = service.calls.filter((call) => call.url.includes("metadata.google"));
  assert.equal(metadataCalls.length, 1);
  assert.equal(metadataCalls[0].headers["Metadata-Flavor"], "Google");
  assert.match(metadataCalls[0].url, /audience=https%3A%2F%2Flt-abc\.a\.run\.app$/);

  const serviceCalls = service.calls.filter((call) => call.url.startsWith("https://lt-abc"));
  assert.equal(serviceCalls.length, 3);
  for (const call of serviceCalls) assert.equal(call.headers.Authorization, "Bearer token-1");
  assert.equal(serviceCalls[1].body.api_key, "key-1");
});

test("returns nothing when the service is unreachable or not configured", async () => {
  const service = stubService({}, { failTranslate: true });
  const warnings: string[] = [];
  const client = createLibreTranslate({
    url: "https://lt.example",
    fetchImpl: service.fetchImpl,
    useIdToken: false,
    logger: { warn: (message: string) => warnings.push(message) }
  });

  assert.deepEqual(await client.translateWords(["casa", "perro"], "spanish"), {});
  assert.equal(warnings.length, 1);
  assert.equal(service.calls.filter((call) => call.url.endsWith("/translate")).length, 1);

  const unconfigured = createLibreTranslate({ url: "", fetchImpl: service.fetchImpl });
  assert.deepEqual(await unconfigured.translateWords(["casa"], "spanish"), {});
});
