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

test("validateStory accepts an optional comprehension quiz", () => {
  const story = validateStory(
    validStory({
      questions: [
        {
          stem: "Where?",
          options: ["Moscow", "Kyiv"],
          correct: 0,
          explanation: "It says Moscow."
        },
        {
          stem: "Что?",
          stemLang: "target",
          options: ["да", "нет"],
          optionsLang: "target",
          correct: 1
        }
      ]
    }),
    "russian",
    0
  );
  assert.equal(story.questions.length, 2);
  assert.equal(story.questions[0].stemLang, "en");
  assert.equal(story.questions[0].correct, 0);
  assert.equal(story.questions[1].stemLang, "target");
  assert.equal(story.questions[1].optionsLang, "target");
});

test("validateStory treats a missing quiz as valid (backward compatible)", () => {
  const story = validateStory(validStory(), "russian", 0);
  assert.equal(story.questions, undefined);
});

test("validateStory rejects a quiz with an out-of-range correct index", () => {
  assert.throws(
    () =>
      validateStory(
        validStory({ questions: [{ stem: "Q?", options: ["a", "b"], correct: 5 }] }),
        "russian",
        0
      ),
    /correct out of range/
  );
});

test("validateStory rejects a quiz question with too few options", () => {
  assert.throws(
    () =>
      validateStory(
        validStory({ questions: [{ stem: "Q?", options: ["only one"], correct: 0 }] }),
        "russian",
        0
      ),
    /options must be an array of 2 to 5 choices/
  );
});

test("validateStory rejects a quiz question with an unknown stemLang", () => {
  assert.throws(
    () =>
      validateStory(
        validStory({ questions: [{ stem: "Q?", stemLang: "fr", options: ["a", "b"], correct: 0 }] }),
        "russian",
        0
      ),
    /stemLang must be one of/
  );
});
