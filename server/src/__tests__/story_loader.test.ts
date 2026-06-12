import type { } from "node"; // ensure file is treated as a module

const test = require("node:test");
const assert = require("node:assert/strict");

const { loadStories, validateStory } = require("../data/storyLoader.ts");

function validStory(overrides: Record<string, unknown> = {}) {
  return {
    id: "ru-test-story",
    level: "a1",
    title: "Тест",
    titleEn: "Test",
    theme: "Daily life",
    category: "essentials",
    sentences: [{ target: "Привет мир.", en: "Hello world." }],
    glossary: { "привет": { g: "hi", pos: "greeting" } },
    culturalNote: { term: "Тест", body: "A note." },
    ...overrides
  };
}

test("loadStories loads and validates the seeded Russian stories", () => {
  const stories = loadStories();
  const ids = stories.map((story: any) => story.id);
  assert.ok(ids.includes("ru-story-a1-day"));
  assert.ok(ids.includes("ru-story-a2-market"));
  assert.ok(ids.includes("ru-story-b1-letter"));

  const day = stories.find((story: any) => story.id === "ru-story-a1-day");
  assert.equal(day.language, "russian");
  assert.equal(day.level, "a1");
  assert.ok(day.sentences.length >= 1);
  assert.ok(day.glossary["городе"]);
  assert.equal(day.glossary["городе"].g, "town, city");
  assert.ok(day.glossary["рядом"].note);
});

test("validateStory carries an optional paragraph break and allows blank pos", () => {
  const story = validateStory(
    validStory({
      sentences: [
        { target: "Привет.", en: "Hi." },
        { target: "Пока.", en: "Bye.", break: true }
      ],
      glossary: { "пока": { g: "bye" } }
    }),
    "russian",
    0
  );
  assert.equal(story.sentences[0].break, undefined);
  assert.equal(story.sentences[1].break, true);
  assert.equal(story.glossary["пока"].g, "bye");
  assert.equal(story.glossary["пока"].pos, "");
});

test("validateStory normalizes glossary keys to lowercase", () => {
  const story = validateStory(validStory({ glossary: { "ПРИВЕТ": { g: "hi", pos: "greeting" } } }), "russian", 0);
  assert.ok(story.glossary["привет"]);
  assert.equal(story.glossary["ПРИВЕТ"], undefined);
});

test("validateStory accepts the legacy `ru` sentence key", () => {
  const story = validateStory(validStory({ sentences: [{ ru: "Привет.", en: "Hi." }] }), "russian", 0);
  assert.equal(story.sentences[0].target, "Привет.");
});

test("validateStory rejects an unknown level", () => {
  assert.throws(() => validateStory(validStory({ level: "c3" }), "russian", 0), /level must be one of/);
});

test("validateStory rejects a missing title", () => {
  assert.throws(() => validateStory(validStory({ title: "" }), "russian", 0), /title is required/);
});

test("validateStory rejects empty sentences", () => {
  assert.throws(() => validateStory(validStory({ sentences: [] }), "russian", 0), /sentences must be a non-empty array/);
});

test("validateStory rejects a glossary entry without a gloss", () => {
  assert.throws(
    () => validateStory(validStory({ glossary: { "привет": { pos: "greeting" } } }), "russian", 0),
    /\.g is required/
  );
});

test("validateStory rejects an unknown category", () => {
  assert.throws(() => validateStory(validStory({ category: "not_a_category" }), "russian", 0), /is not a known category/);
});

test("validateStory rejects a missing cultural note body", () => {
  assert.throws(
    () => validateStory(validStory({ culturalNote: { term: "Тест", body: "" } }), "russian", 0),
    /culturalNote.body is required/
  );
});
